/*
 * The island's quotas pill: the room left where the work can still go (each
 * provider's roomiest subscription, the provider with the least room), and per
 * account, a bar for each window with its reset time. Everything comes
 * from the core: `quotas.list` on open and every few minutes, `quotas.updated`
 * when the core reads them again, and `usage.get` for the tokens the threads used.
 * The subscription proxy's entries come in the same rows; Home's phase 1 card,
 * which read them apart, is gone: the island has one quotas display.
 *
 * Amber under 25 % left, red under 10 %: the pill and the bars say the same.
 */
import type { AccountQuota, Usage } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { shownQuotas } from '@boite/ui/lib/quota-reader.svelte';

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
  providerId: string;
  /** An entry of the subscription proxy (Douane) rather than a Boite account. */
  proxy: boolean;
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
 * What Settings lets through: `shown` is its "Show quotas" switch, `hidden`
 * the subscription proxy's entries turned off one by one (`providerId:entryId`,
 * `CompanionPrefs.hiddenQuotas`).
 */
export interface QuotaKeep {
  shown: boolean;
  hidden: readonly string[];
}

export const KEEP_ALL: QuotaKeep = { shown: true, hidden: [] };

/**
 * The accounts worth a bar: read, enabled and reporting windows, each with its
 * windows tightest first; the accounts too, tightest first. `quotas.list`
 * carries the subscription proxy's entries too (`gateway`), so they come here
 * with their reset times and are marked `proxy`. The core's `usedPercent` is
 * the share used, on Boite's accounts and the proxy's alike; every bar says
 * what is left, `100 - usedPercent`.
 */
export function quotaAccounts(rows: AccountQuota[], keep: QuotaKeep = KEEP_ALL): QuotaAccount[] {
  if (!keep.shown) return [];
  const hidden = new Set(keep.hidden);
  return shownQuotas(rows)
    .filter((row) => row.status === 'ready' && row.windows.length > 0)
    .filter((row) => !row.gateway || !hidden.has(`${row.providerId}:${row.gateway.entryId}`))
    .map((row): QuotaAccount => {
      const bars = row.windows
        .filter((window) => Number.isFinite(window.usedPercent))
        .map((window): QuotaBar => {
          const left = clamp(100 - window.usedPercent);
          return { id: window.id, label: window.label, left, tone: toneOf(left), resetsAt: window.resetsAt };
        })
        .sort((a, b) => a.left - b.left);
      const left = bars[0]?.left ?? 100;
      return { id: row.accountId, name: row.label.trim() || row.providerName, provider: row.providerName, providerId: row.providerId, proxy: row.gateway !== undefined, bars, left, tone: toneOf(left) };
    })
    .filter((account) => account.bars.length > 0)
    .sort((a, b) => a.left - b.left);
}

/** The room left where the work can still go, what the pill shows: see `headroom`. */
export function headroom(accounts: QuotaAccount[]): { account: QuotaAccount; bar: QuotaBar } | null {
  // The subscription proxy, or the user, sends the work to a provider's subscription with room left:
  // a provider counts by its roomiest account, and the pill shows the provider with the least room.
  const roomiest = new Map<string, QuotaAccount>();
  for (const account of accounts) {
    const kept = roomiest.get(account.providerId);
    if (!kept || account.left > kept.left) roomiest.set(account.providerId, account);
  }
  let found: { account: QuotaAccount; bar: QuotaBar } | null = null;
  for (const account of roomiest.values()) {
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
  readonly accounts = $derived.by(() => quotaAccounts(this.rows, this.#keep()));
  readonly headroom = $derived.by(() => headroom(this.accounts));
  readonly #keep: () => QuotaKeep;

  /** `keep`: what Settings lets through, read again as it changes. */
  constructor(keep: () => QuotaKeep = () => KEEP_ALL) {
    this.#keep = keep;
  }

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
