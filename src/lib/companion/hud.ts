/*
 * What the companion's HUD shows beside the character: the threads at work,
 * newest first, each with the step its agent is on and when its request
 * started, and one gauge per subscription of the gateway (Douane). Pure apart
 * from the catalog and `followQuotas`, so it is tested without a core.
 *
 * The step is `ThreadSummary.progress`, which `thread.updated` carries to every
 * client. `thread.activity` (goal, loop, tasks) reaches only the clients
 * subscribed to that thread, so the HUD does not read it.
 */
import type { Client } from '@boite/ui/lib/client';
import { quotaAccountName, type GatewayReader } from '@boite/ui/lib/quota-reader.svelte';
import { fill, strings } from '../strings';
import type { AccountQuota, SubscriptionProxyQuotas, ThreadSummary } from '@boite/contracts';
import { isWorking } from './mood';

export interface HudThread {
  id: string;
  title: string;
  project: string;
  /** What the agent is doing: its last observed step, or the thread's state. */
  step: string;
  /** When the user's current request started; null when the core did not say. */
  since: number | null;
}

type HudSource = Pick<ThreadSummary, 'id' | 'title' | 'projectId' | 'status' | 'runningSince' | 'requestSince' | 'progress' | 'updatedAt'> & Partial<Pick<ThreadSummary, 'parentThreadId' | 'backgroundWork'>>;

/** At work, or its turn over with work left running (a shell, a monitor), as Boite's sidebar counts it. */
function busy(thread: HudSource): boolean {
  return isWorking(thread.status) || (thread.status === 'idle' && (thread.backgroundWork?.kinds.length ?? 0) > 0);
}

/** As a sidebar row counts it: from the user's request, never after the turn carrying it. */
function sinceOf(thread: HudSource): number | null {
  const [request, running] = [thread.requestSince ?? null, thread.runningSince ?? null];
  if (request === null && running === null) return thread.backgroundWork?.since ?? null;
  return request === null ? running : running === null ? request : Math.min(request, running);
}

function stepOf(thread: HudSource): string {
  const status = strings.companion.status;
  if (thread.status === 'queued') return status.queued;
  if (thread.status === 'waiting') return status.waiting;
  const progress = thread.progress;
  if (!progress) return status.running;
  const phase = strings.chat.progress[progress.phase];
  return progress.detail ? `${phase}: ${progress.detail}` : phase;
}

/** How far up a chain of delegations the HUD looks for the conversation that started it. */
const MAX_HOPS = 8;

/** The conversation a delegated thread works for, as far up as the list knows; the thread itself when it has no parent. */
export function rootOf<T extends Pick<HudSource, 'id' | 'parentThreadId'>>(thread: T, byId: ReadonlyMap<string, T>): T {
  let at = thread;
  for (let hop = 0; hop < MAX_HOPS && at.parentThreadId; hop++) {
    const up = byId.get(at.parentThreadId);
    if (!up) break;
    at = up;
  }
  return at;
}

/**
 * The conversations at work but the companion's own (its agents' sessions),
 * the one whose request started last first. Sub-agents show as their main
 * conversation, once: at work itself, or with its helpers counted while only
 * they work.
 */
export function hudThreads(threads: HudSource[], projects: Map<string, string>, own: readonly string[]): HudThread[] {
  const byId = new Map(threads.map((thread) => [thread.id, thread]));
  const roots = new Map<string, { root: HudSource; self: boolean; helpers: number; since: number | null }>();
  for (const thread of threads) {
    if (!busy(thread) || own.includes(thread.id)) continue;
    const root = rootOf(thread, byId);
    if (own.includes(root.id)) continue;
    const entry = roots.get(root.id) ?? { root, self: false, helpers: 0, since: null };
    const since = sinceOf(thread);
    if (root === thread) entry.self = true;
    else entry.helpers += 1;
    if (since !== null) entry.since = entry.since === null ? since : Math.min(entry.since, since);
    roots.set(root.id, entry);
  }
  return [...roots.values()]
    .map(({ root, self, helpers, since }) => ({
      id: root.id,
      title: root.title || strings.companion.untitled,
      project: (root.projectId && projects.get(root.projectId)) || '',
      step: self ? stepOf(root) : fill(helpers === 1 ? strings.companion.hud.helper : strings.companion.hud.helpers, { count: String(helpers) }),
      since: self ? (sinceOf(root) ?? since) : since,
      order: (self ? sinceOf(root) : since) ?? root.updatedAt
    }))
    .sort((a, b) => b.order - a.order)
    .map(({ order: _order, ...row }) => row);
}

/** `warning` past 80 % used, `danger` past 95 %. */
export type QuotaLevel = 'ok' | 'warning' | 'danger' | 'unknown';

export function quotaLevel(usedPercent: number | null): QuotaLevel {
  if (usedPercent === null) return 'unknown';
  return usedPercent > 95 ? 'danger' : usedPercent > 80 ? 'warning' : 'ok';
}

export interface HudGauge {
  /** `providerId:entryId`, what `CompanionPrefs.hiddenQuotas` keeps. */
  id: string;
  /** The gateway's provider, for its logo. */
  providerId: string;
  name: string;
  /** The window nearest its limit; empty when the entry reports none. */
  window: string;
  /** Used, 0 to 100, of that window; null when unknown. */
  used: number | null;
  level: QuotaLevel;
  /** What a screen reader says: the name, the window, what is left and the level. */
  label: string;
}

/**
 * One gauge per subscription the gateway reports, named the way the Limits
 * page names it (`quotaAccountName`). None when no proxy is set up, when it is
 * not a Douane, or before it ever answered.
 */
export function hudGauges(state: SubscriptionProxyQuotas | null): HudGauge[] {
  if (!state || state.status === 'off' || state.status === 'unsupported') return [];
  const stale = state.status === 'unavailable';
  return state.providers.flatMap((provider) =>
    provider.entries
      .filter((entry) => entry.status !== 'disabled')
      .map((entry): HudGauge => {
        const name = quotaAccountName({
          label: entry.label,
          providerName: provider.name,
          gateway: { kind: 'douane', entryId: entry.id, display: provider.display, plan: entry.plan, accounts: entry.accounts, status: entry.status, credits: entry.credits }
        } as AccountQuota);
        const top = entry.windows.reduce<(typeof entry.windows)[number] | null>((worst, window) => (worst === null || window.usedPercent > worst.usedPercent ? window : worst), null);
        const known = !stale && entry.status !== 'error' && top !== null;
        const used = known ? Math.max(0, Math.min(100, top.usedPercent)) : null;
        const level = quotaLevel(used);
        const left = used === null ? strings.companion.hud.quotaUnknown : fill(strings.quotas.remaining, { percent: String(Math.round(100 - used)) });
        const words = level === 'danger' ? strings.companion.hud.quotaOut : level === 'warning' ? strings.companion.hud.quotaLow : '';
        const label = [name, top?.label, left, words].filter(Boolean).join(', ');
        return { id: `${provider.providerId}:${entry.id}`, providerId: provider.providerId, name, window: top?.label ?? '', used, level, label };
      })
  );
}

/** The gauges the user did not hide in Settings, in the gateway's order. */
export function shownGauges(gauges: HudGauge[], hidden: readonly string[]): HudGauge[] {
  if (!hidden.length) return gauges;
  const left = new Set(hidden);
  return gauges.filter((gauge) => !left.has(gauge.id));
}

/** How often the gateway is asked again; the core answers from its cache meanwhile. */
export const QUOTAS_EVERY = 60_000;

/** Keeps `reader` current: a read now and every minute, and every update the core pushes. Returns the stop. */
export function followQuotas(client: Client, reader: GatewayReader): () => void {
  const off = client.on('subscriptionProxy.quotasUpdated', (state) => reader.accept(state));
  const read = () => void reader.read(client).catch(() => {});
  read();
  const timer = setInterval(read, QUOTAS_EVERY);
  return () => {
    off();
    clearInterval(timer);
  };
}
