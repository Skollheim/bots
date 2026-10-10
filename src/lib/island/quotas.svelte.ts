/*
 * The island's quotas pill: what is left of the tightest subscription window,
 * and per account, a bar for each window with its reset time. Everything comes
 * from the core: `quotas.list` on open and every few minutes, `quotas.updated`
 * when the core reads them again, and `usage.get` for the tokens the threads used.
 * The subscription proxy's gauges, which Home showed in phase 1, join the same
 * panel (`proxyAccounts`), so the island has one quotas display.
 *
 * Amber under 25 % left, red under 10 %: the pill and the bars say the same.
 */
import type { AccountQuota, Usage } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { shownQuotas } from '@boite/ui/lib/quota-reader.svelte';
import type { HudGauge } from '../companion/hud';

export type QuotaTone = 'ok' | 'amber' | 'red';

/** Under this share left, a window turns amber. */
export const AMBER_BELOW = 25;
/** Under this share left, a window turns red. */
export const RED_BELOW = 10;
/** How often the pill reads the quotas again on its own. */
export const QUOTAS_EVERY = 5 * 60_000;

export interface QuotaBar {
  id: string;
  label: string;
  /** Percent left, 0 to 100. */
  left: number;
  tone: QuotaTone;
  resetsAt: number | null;
}

export interface QuotaAccount {
  id: string;
  name: string;
  provider: string;
  bars: QuotaBar[];
  /** The tightest of its bars. */
  left: number;
  tone: QuotaTone;
}

export function toneOf(left: number): QuotaTone {
  return left < RED_BELOW ? 'red' : left < AMBER_BELOW ? 'amber' : 'ok';
}

const clamp = (value: number) => Math.min(100, Math.max(0, Math.round(value)));

/**
 * The accounts worth a bar: read, enabled and reporting windows, each with its
 * windows tightest first; the accounts too, tightest first.
 */
export function quotaAccounts(rows: AccountQuota[]): QuotaAccount[] {
  return shownQuotas(rows)
    .filter((row) => row.status === 'ready' && row.windows.length > 0)
    .map((row): QuotaAccount => {
      const bars = row.windows
        .filter((window) => Number.isFinite(window.usedPercent))
        .map((window): QuotaBar => {
          const left = clamp(100 - window.usedPercent);
          return { id: window.id, label: window.label, left, tone: toneOf(left), resetsAt: window.resetsAt };
        })
        .sort((a, b) => a.left - b.left);
      const left = bars[0]?.left ?? 100;
      return { id: row.accountId, name: row.label.trim() || row.providerName, provider: row.providerName, bars, left, tone: toneOf(left) };
    })
    .filter((account) => account.bars.length > 0)
    .sort((a, b) => a.left - b.left);
}

/**
 * The subscription proxy's gauges (`Companion.gauges`, with the Settings
 * choices already applied) as accounts of one bar, the window nearest its
 * limit; the proxy gives no reset time. Unknown gauges are left out.
 */
export function proxyAccounts(gauges: HudGauge[]): QuotaAccount[] {
  return gauges
    .filter((gauge) => gauge.used !== null)
    .map((gauge): QuotaAccount => {
      const left = clamp(100 - (gauge.used ?? 0));
      const bar: QuotaBar = { id: gauge.window || gauge.id, label: gauge.window, left, tone: toneOf(left), resetsAt: null };
      return { id: `proxy:${gauge.id}`, name: gauge.name, provider: gauge.providerId, bars: [bar], left, tone: bar.tone };
    })
    .sort((a, b) => a.left - b.left);
}

/** The window with the least left across every account given, what the pill shows. */
export function tightest(...groups: QuotaAccount[][]): { account: QuotaAccount; bar: QuotaBar } | null {
  let found: { account: QuotaAccount; bar: QuotaBar } | null = null;
  for (const account of groups.flat()) {
    const bar = account.bars[0];
    if (bar && (found === null || bar.left < found.bar.left)) found = { account, bar };
  }
  return found;
}

/** How long until `resetsAt`, short: `45 min`, `3 h`, `2 d`. Null when it is unknown or past. */
export function resetIn(resetsAt: number | null, now: number): { value: number; unit: 'min' | 'h' | 'd' } | null {
  if (resetsAt === null || !Number.isFinite(resetsAt) || resetsAt <= now) return null;
  const minutes = Math.ceil((resetsAt - now) / 60_000);
  if (minutes < 60) return { value: minutes, unit: 'min' };
  const hours = Math.round(minutes / 60);
  if (hours < 48) return { value: hours, unit: 'h' };
  return { value: Math.round(hours / 24), unit: 'd' };
}

/** Every token a turn moved, the cache included. */
export function tokensOf(usage: Usage | null): number {
  if (!usage) return 0;
  return usage.inputTokens + usage.outputTokens + usage.cacheReadTokens + usage.cacheWriteTokens;
}

/** `1.2M`, `340k`, `900`: a token count at a glance. */
export function compactCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(count >= 10_000_000 ? 0 : 1)}M`;
  if (count >= 1_000) return `${Math.round(count / 1_000)}k`;
  return String(Math.max(0, Math.round(count)));
}

/** The quotas the island shows, kept current while `follow` runs. */
export class QuotaWatch {
  rows = $state<AccountQuota[]>([]);
  usage = $state<Usage | null>(null);
  read = $state(false);
  readonly accounts = $derived(quotaAccounts(this.rows));
  readonly tightest = $derived(tightest(this.accounts));

  /** Reads now and every `QUOTAS_EVERY`, and takes what the core pushes. Returns the stop. */
  follow(client: Client): () => void {
    const off = client.on('quotas.updated', (rows) => this.accept(rows));
    const refresh = () => void this.refresh(client);
    refresh();
    const timer = setInterval(refresh, QUOTAS_EVERY);
    return () => {
      off();
      clearInterval(timer);
    };
  }

  accept(rows: AccountQuota[]): void {
    this.rows = rows;
    this.read = true;
  }

  async refresh(client: Client): Promise<void> {
    const [rows, usage] = await Promise.all([
      client.call('quotas.list', {}).catch(() => null),
      client.call('usage.get', {}).catch(() => null)
    ]);
    if (rows) this.accept(rows);
    if (usage) this.usage = usage.total;
  }
}
