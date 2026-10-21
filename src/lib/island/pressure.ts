/*
 * Before Boite's memory guard stops something: how close the agents are to
 * what the guard allows (`MemoryStatus.limits`), and which conversation eats
 * the most. Pure, so the thresholds are tested without a core; the watch that
 * reads the core is `pressure.svelte.ts`.
 *
 * The guard stops a process when a conversation passes its cap, when the
 * agents together pass their budget, or when the machine's free memory falls
 * under the reserve. The island warns a step before each.
 */
import type { AgentResourceUsage, MemoryEvent, MemoryStatus } from '@boite/contracts';
import type { MemoryAlert } from '../companion/prefs';

/** The share of a cap or a budget past which the island warns. */
export const WARN_SHARE = 0.85;
/** Free memory under the reserve this many times over warns. */
export const RESERVE_MARGIN = 1.5;
/** A warning shown stays until the share falls under this: one that hovers at the line does not come and go. */
export const CALM_SHARE = 0.8;
/** Past this share of any limit, the core is read more often; under it, a warning set aside may come back. */
export const NEAR_SHARE = 0.7;

const MB = 1024 * 1024;

export type PressureReason = 'thread' | 'budget' | 'machine';

export interface Pressure {
  reason: PressureReason;
  /** The conversation eating the most, the one to stop; null when none is measured. */
  threadId: string | null;
  title: string;
  /** What that conversation holds. */
  bytes: number;
  /** What the reason measures against what the guard allows: the conversation, the agents together, or the free memory. */
  used: number;
  limit: number;
}

export type AgentLoad = Pick<AgentResourceUsage, 'threadId' | 'title' | 'load'>;

/** The guard is off: its limits are all zero, and it stops nothing. */
export function guardOff(status: MemoryStatus): boolean {
  const { budgetMb, threadMemoryCapMb, memoryReserveMb } = status.limits;
  return budgetMb <= 0 && threadMemoryCapMb <= 0 && memoryReserveMb <= 0;
}

/** How near the closest limit is, 0 and up (1 is the limit); what tells how often to read again. */
export function nearness(status: MemoryStatus, top = 0): number {
  if (guardOff(status)) return 0;
  const { budgetMb, threadMemoryCapMb, memoryReserveMb } = status.limits;
  const shares = [
    budgetMb > 0 ? status.agentBytes / (budgetMb * MB) : 0,
    threadMemoryCapMb > 0 ? top / (threadMemoryCapMb * MB) : 0,
    // Reaches the warning's share when the free memory reaches the reserve's margin.
    memoryReserveMb > 0 && status.availableBytes !== null ? (WARN_SHARE * memoryReserveMb * MB * RESERVE_MARGIN) / Math.max(1, status.availableBytes) : 0
  ];
  return Math.max(...shares);
}

/** The conversation holding the most memory, if any holds some. */
export function heaviest<T extends AgentLoad>(agents: readonly T[]): T | null {
  let top: T | null = null;
  for (const agent of agents) if (agent.load.memoryBytes > 0 && (!top || agent.load.memoryBytes > top.load.memoryBytes)) top = agent;
  return top;
}

/**
 * The warning, or null while every limit is comfortably far. A conversation
 * near its own cap comes first: it is the one the guard would stop. With
 * budget and free memory too, the guard picks the heaviest conversation.
 * `share` is where it warns: `WARN_SHARE`, or `CALM_SHARE` while a warning shows.
 */
export function pressureOf(status: MemoryStatus, agents: readonly AgentLoad[], share = WARN_SHARE): Pressure | null {
  if (guardOff(status)) return null;
  const { budgetMb, threadMemoryCapMb, memoryReserveMb } = status.limits;
  const top = heaviest(agents);
  const culprit = { threadId: top?.threadId ?? null, title: top?.title ?? '', bytes: top?.load.memoryBytes ?? 0 };
  const cap = threadMemoryCapMb * MB;
  if (top && cap > 0 && top.load.memoryBytes >= cap * share) return { reason: 'thread', ...culprit, used: top.load.memoryBytes, limit: cap };
  const budget = budgetMb * MB;
  if (budget > 0 && status.agentBytes >= budget * share) return { reason: 'budget', ...culprit, used: status.agentBytes, limit: budget };
  const reserve = memoryReserveMb * MB;
  const margin = (RESERVE_MARGIN * WARN_SHARE) / share;
  if (reserve > 0 && status.availableBytes !== null && status.availableBytes <= reserve * margin) return { reason: 'machine', ...culprit, used: status.availableBytes, limit: reserve };
  if (status.state === 'critical') return { reason: 'machine', ...culprit, used: status.availableBytes ?? 0, limit: reserve };
  return null;
}

export interface Stopped {
  threadId: string | null;
  title: string;
  /** The program the guard stopped, its file name. */
  program: string;
  bytes: number;
  at: number;
}

/** A process the guard stopped, from its event; null for the other memory events. */
export function stoppedOf(event: MemoryEvent, titleOf: (threadId: string) => string): Stopped | null {
  if (event.kind !== 'killed') return null;
  const program = event.exe?.split(/[\\/]/).pop() ?? '';
  return { threadId: event.threadId, title: event.threadId ? titleOf(event.threadId) : '', program, bytes: event.bytes ?? 0, at: event.at };
}

/** "1.4 GB", "820 MB"; `point` is the language's decimal mark. */
export function sizeText(bytes: number, units: { mb: string; gb: string; point: string }): string {
  const mb = bytes / MB;
  if (mb >= 1024) return units.gb.replace('{value}', (mb / 1024).toFixed(1).replace('.', units.point));
  return units.mb.replace('{value}', String(Math.round(mb)));
}

/** The same warning, for one that was set aside: the reason and the conversation, not the bytes that move every read. */
export function samePressure(a: Pressure | null, b: Pressure | null): boolean {
  return a === b || (a !== null && b !== null && a.reason === b.reason && a.threadId === b.threadId);
}

/** Past this share of the limit, a warning turns red. */
export const RED_SHARE = 0.95;

/** How full the measured limit is, for the card's bar; null for the free memory, which has none. */
export function pressureShare(pressure: Pressure): number | null {
  return pressure.reason !== 'machine' && pressure.limit > 0 ? Math.min(1, pressure.used / pressure.limit) : null;
}

/** Red: the machine itself is short, or a limit is all but reached. */
export function pressureRed(pressure: Pressure): boolean {
  return pressure.reason === 'machine' || (pressureShare(pressure) ?? 0) >= RED_SHARE;
}

/**
 * Where a warning shows, by the user's choice (`prefs.memoryAlert`): by
 * default a line in the pill and a slim one over the deck, the island left
 * closed and quiet; `panel` opens the deck on the full card with a chime;
 * `off` shows nothing, what the guard stopped included.
 */
export interface AlertPlan {
  pill: boolean;
  card: 'line' | 'full' | null;
  /** The island opens on the card and chimes. */
  opens: boolean;
}

export function alertPlan(alert: MemoryAlert): AlertPlan {
  if (alert === 'panel') return { pill: false, card: 'full', opens: true };
  if (alert === 'off') return { pill: false, card: null, opens: false };
  return { pill: true, card: 'line', opens: false };
}

/** The deck's memory gauge: what the agents hold, the share of their budget (null without one), the machine's free memory. */
export interface MemoryGauge {
  used: number;
  budget: number | null;
  /** 0 to 1, the share of the budget used; null without a budget. */
  share: number | null;
  available: number | null;
  /** Where the needle stands: calm, near the warning, or past it. */
  tone: 'ok' | 'amber' | 'red';
}

export function memoryGauge(status: MemoryStatus): MemoryGauge {
  const budget = status.limits.budgetMb > 0 ? status.limits.budgetMb * MB : null;
  const share = budget === null ? null : Math.min(1, Math.max(0, status.agentBytes / budget));
  const near = guardOff(status) ? 0 : nearness(status);
  const tone = status.state === 'critical' || near >= WARN_SHARE ? 'red' : near >= NEAR_SHARE ? 'amber' : 'ok';
  return { used: status.agentBytes, budget, share, available: status.availableBytes, tone };
}
