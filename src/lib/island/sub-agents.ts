/*
 * The sub-agents a Home row speaks of: the threads Boite delegated under its
 * conversation (`parentThreadId`, nested ones too) and the provider's own task
 * agents (Claude's, read with `delegation.get`). The row's second line counts
 * the ones at work; its chevron unfolds them, one line each. Pure: the thread
 * list and the last team read go in, the lines come out.
 */
import type { DelegationView, NativeAgent, ThreadSummary, Turn } from '@boite/contracts';
import type { SessionRow } from './sessions';

export type AgentState = 'working' | 'waiting' | 'done' | 'failed' | 'stopped' | 'unknown';

export interface SubAgent {
  /** The thread's id, or `native:<id>` for a provider's own agent. */
  id: string;
  /** A Boite child opens in Boite; a provider's agent has no thread. */
  threadId: string | null;
  /** The thread's title, or the native agent's name, else its task; empty when it has none. */
  title: string;
  state: AgentState;
  /** 0 under the conversation itself, 1 under one of its sub-agents, and so on. */
  depth: number;
  /** What its time counts from. */
  start: number;
  /** When it ended; null while it works, or when the core did not say. */
  end: number | null;
}

/** What a `delegation.get` told about a conversation's team, kept per row. */
export interface TeamRead {
  natives: readonly NativeAgent[];
  /** Each delegated child's last turn, by thread: its start, its end, whether it was stopped. */
  turns: ReadonlyMap<string, Turn | null>;
}

/** Lines the fold shows at most; the rest reads "+N". */
export const AGENTS_SHOWN = 8;
/** A sub-agent spawned this long before the request's start still belongs to it (clocks of two machines). */
const RUN_SLACK_MS = 5_000;

const LIVE: ReadonlySet<AgentState> = new Set(['working', 'waiting']);
const FINISHED: ReadonlySet<AgentState> = new Set(['done', 'failed', 'stopped']);

export function isAgentLive(agent: Pick<SubAgent, 'state'>): boolean {
  return LIVE.has(agent.state);
}

export function teamOf(view: Pick<DelegationView, 'agents' | 'nativeAgents'>): TeamRead {
  return { natives: view.nativeAgents, turns: new Map(view.agents.map((agent) => [agent.thread.id, agent.lastTurn])) };
}

/** The delegated threads under each thread, oldest first: built once for all rows. */
export function childrenIndex(threads: readonly ThreadSummary[]): Map<string, ThreadSummary[]> {
  const index = new Map<string, ThreadSummary[]>();
  for (const thread of threads) {
    if (!thread.parentThreadId || thread.archived || thread.incognito === true) continue;
    const siblings = index.get(thread.parentThreadId);
    if (siblings) siblings.push(thread);
    else index.set(thread.parentThreadId, [thread]);
  }
  for (const siblings of index.values()) siblings.sort((a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id));
  return index;
}

function childState(thread: ThreadSummary, last: Turn | null | undefined): AgentState {
  if (thread.status === 'waiting' || (thread.openQuestions ?? 0) > 0) return 'waiting';
  if (thread.status === 'running' || thread.status === 'queued') return 'working';
  if (thread.status === 'error' || last?.status === 'error') return 'failed';
  if (last?.status === 'stopped') return 'stopped';
  return 'done';
}

function childOf(thread: ThreadSummary, depth: number, team: TeamRead | undefined): SubAgent {
  const last = team?.turns.get(thread.id);
  const state = childState(thread, last);
  const live = LIVE.has(state);
  // At work, it counts from the request it works on; over, from its spawn to its last turn's end.
  const start = live ? (thread.requestSince ?? thread.runningSince ?? thread.createdAt) : (last?.startedAt ?? thread.createdAt);
  const end = live ? null : (last?.finishedAt ?? thread.updatedAt);
  return { id: thread.id, threadId: thread.id, title: thread.title, state, depth, start, end: end !== null && end >= start ? end : null };
}

function nativeState(status: NativeAgent['status']): AgentState {
  if (status === 'running') return 'working';
  if (status === 'error') return 'failed';
  return status;
}

function firstLine(text: string | undefined): string {
  return (text ?? '').split(/\r?\n/).find((line) => line.trim().length > 0)?.trim() ?? '';
}

function nativeOf(agent: NativeAgent): SubAgent {
  const state = nativeState(agent.status);
  const end = LIVE.has(state) ? null : (agent.finishedAt ?? null);
  return { id: `native:${agent.id}`, threadId: null, title: firstLine(agent.name) || firstLine(agent.task), state, depth: 0, start: agent.startedAt, end };
}

/** A sub-agent and the ones under it, when any of them belongs to the run. */
function subtree(thread: ThreadSummary, depth: number, since: number, index: Map<string, ThreadSummary[]>, team: TeamRead | undefined, seen: Set<string>): SubAgent[] {
  if (seen.has(thread.id)) return [];
  seen.add(thread.id);
  const self = childOf(thread, depth, team);
  const below = (index.get(thread.id) ?? []).flatMap((child) => subtree(child, depth + 1, since, index, team, seen));
  const ofRun = isAgentLive(self) || thread.createdAt >= since - RUN_SLACK_MS;
  return ofRun || below.length > 0 ? [self, ...below] : [];
}

/**
 * The sub-agents of a row's current run, in start order, each followed by the
 * ones it started (indented by `depth`): the ones at work whenever they
 * started, the finished ones spawned since the request began. The provider's
 * own agents come from the last team read, at the top level.
 */
export function subAgentsOf(row: Pick<SessionRow, 'id' | 'since' | 'resting'>, index: Map<string, ThreadSummary[]>, team?: TeamRead): SubAgent[] {
  if (row.resting) return [];
  const seen = new Set<string>([row.id]);
  const groups: SubAgent[][] = (index.get(row.id) ?? []).map((child) => subtree(child, 0, row.since, index, team, seen)).filter((group) => group.length > 0);
  for (const native of team?.natives ?? []) {
    const agent = nativeOf(native);
    if (isAgentLive(agent) || agent.start >= row.since - RUN_SLACK_MS) groups.push([agent]);
  }
  return groups.sort((a, b) => a[0]!.start - b[0]!.start).flat();
}

export interface AgentFold {
  /** The lines shown, in order. */
  shown: SubAgent[];
  /** How many more there are. */
  more: number;
  /** How many finished: done, failed or stopped. */
  finished: number;
  total: number;
}

/**
 * At most `cap` lines: the oldest sub-agents whose whole group is over leave
 * first, so the ones at work stay in sight; past that, the last ones.
 */
export function foldOf(agents: readonly SubAgent[], cap = AGENTS_SHOWN): AgentFold {
  const groups: SubAgent[][] = [];
  for (const agent of agents) {
    if (agent.depth === 0 || groups.length === 0) groups.push([agent]);
    else groups[groups.length - 1]!.push(agent);
  }
  let count = agents.length;
  for (let at = 0; at < groups.length && count > cap; at++) {
    const group = groups[at]!;
    if (group.some(isAgentLive)) continue;
    count -= group.length;
    groups[at] = [];
  }
  const shown = groups.flat().slice(0, cap);
  return { shown, more: agents.length - shown.length, finished: agents.filter((agent) => FINISHED.has(agent.state)).length, total: agents.length };
}

/** How many sub-agents work now, for the row's second line. */
export function liveCount(agents: readonly SubAgent[]): number {
  return agents.filter(isAgentLive).length;
}
