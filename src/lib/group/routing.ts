/*
 * Which machine of the group a call or an event belongs to. Pure: the group
 * client (`group-client.ts`) holds the connections and asks here.
 *
 * - The lists of what runs (`threads.list`, `permissions.list` and
 *   `questions.list` without a thread) are asked of every machine and merged.
 * - A call that names a thread goes to the machine that thread runs on; an
 *   answer to a permission, to the machine that asked it.
 * - Everything else is this machine's own: projects, the crew and the
 *   assistant chat, settings, quotas, resources, new threads.
 */
import type { GroupCore, RpcEventName, RpcMethodName } from '@boite/contracts';
import { usableAddresses } from '@boite/ui/lib/group-addresses';

/** The lists every machine is asked for, merged into one. */
export type MergedMethod = 'threads.list' | 'permissions.list' | 'questions.list';

/** Whether this call is one of the merged lists: the request lists, only without a thread to narrow them. */
export function isMerged(method: RpcMethodName, params: unknown): method is MergedMethod {
  if (method === 'threads.list') return true;
  if (method !== 'permissions.list' && method !== 'questions.list') return false;
  return typeof (params as { threadId?: unknown } | undefined)?.threadId !== 'string';
}

/** The thread a call names, which says where it goes; null for a call of this machine's own. */
export function threadOfCall(method: RpcMethodName, params: unknown): string | null {
  if (!params || typeof params !== 'object') return null;
  // A new thread stays on this machine. Boite's window is this machine's too: its core
  // shows it, and the core of another machine would bring Boite up over there instead.
  if (method === 'threads.create' || method === 'ui.reveal') return null;
  const threadId = (params as { threadId?: unknown }).threadId;
  return typeof threadId === 'string' ? threadId : null;
}

/** The permission an answer names: it goes back to the machine that asked. */
export function requestOfCall(method: RpcMethodName, params: unknown): string | null {
  if (method !== 'permissions.answer') return null;
  const requestId = (params as { requestId?: unknown } | undefined)?.requestId;
  return typeof requestId === 'string' ? requestId : null;
}

/**
 * The events about threads, heard from every machine: what Home, the pill,
 * the requests and the watchers follow. The rest (quotas, resources, the
 * crew, settings) is this machine's only.
 */
export const THREAD_EVENTS: ReadonlySet<RpcEventName> = new Set<RpcEventName>([
  'thread.created',
  'thread.updated',
  'thread.removed',
  'thread.activity',
  'turn.started',
  'turn.finished',
  'turn.toolCompleted',
  'message.started',
  'message.delta',
  'message.part',
  'message.completed',
  'permission.requested',
  'permission.resolved',
  'question.asked',
  'question.answered',
  'delegation.changed',
  'threads.pullRequestsChanged'
]);

/** The thread an event is about: a summary carries its id, the others a `threadId`. */
export function threadOfEvent(event: RpcEventName, payload: unknown): string | null {
  if (!payload || typeof payload !== 'object') return null;
  const value = event === 'thread.created' || event === 'thread.updated' ? (payload as { id?: unknown }).id : (payload as { threadId?: unknown }).threadId;
  return typeof value === 'string' ? value : null;
}

/** The members to reach: every other machine of the roster, with the addresses a key may go to. */
export function membersOf(group: { self: string; cores: readonly GroupCore[] } | null, secure: boolean): { core: GroupCore; addresses: string[] }[] {
  if (!group) return [];
  return group.cores.filter((core) => core.coreId !== group.self).map((core) => ({ core, addresses: usableAddresses(core.addresses, secure) }));
}

/** Reconnect delays to a member: 1, 2, 4 and 8 s, then once a minute, as Boite's group links retry. */
export function memberBackoff(attempt: number): number {
  return attempt < 4 ? 1000 * 2 ** attempt : 60_000;
}

/** A project of another machine, named so a row says where it runs: « Petites-Rives · Portable ». */
export function placedName(project: string, machine: string): string {
  return `${project} · ${machine}`;
}
