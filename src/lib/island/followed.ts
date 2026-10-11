/*
 * The thread the pill follows: chosen on its Home row, its line stays in the
 * collapsed pill whatever else starts, at work, waiting, ended or at rest,
 * until the user lets it go or the thread is archived or gone. One per core,
 * kept in `localStorage` under `bots.followed` as `{ [core]: threadId }`, so
 * it outlives a restart. Not the island's pin (`frame.pinned`), which keeps
 * the island open. `followed.svelte.ts` holds it for the island.
 */
import type { CoreInfo, ThreadSummary } from '@boite/contracts';
import { isHelper, type SessionRow } from './sessions';

export const FOLLOWED_KEY = 'bots.followed';

/** The followed thread of each core, by core. */
export type FollowedMap = Readonly<Record<string, string>>;

/** The core a choice belongs to: the host it runs on. Boite gives no other lasting id. */
export function coreKey(core: Pick<CoreInfo, 'hostname'> | null | undefined): string {
  return core?.hostname?.trim() || 'core';
}

/** Whatever is stored, read entry by entry: a wrong entry is dropped. */
export function parseFollowed(raw: string | null): FollowedMap {
  if (!raw) return {};
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, string] => typeof entry[1] === 'string' && entry[1] !== ''));
  } catch {
    return {};
  }
}

/** The map with `core` following `threadId`, or nothing for null. */
export function withFollowed(map: FollowedMap, core: string, threadId: string | null): FollowedMap {
  const next: Record<string, string> = { ...map };
  if (threadId) next[core] = threadId;
  else delete next[core];
  return next;
}

/** The followed thread left: the list was read and has it no more, or has it archived. An empty list may not be read yet. */
export function followedGone(threadId: string, threads: readonly ThreadSummary[]): boolean {
  if (threads.length === 0) return false;
  const thread = threads.find((entry) => entry.id === threadId);
  return !thread || thread.archived === true;
}

/**
 * The row a followed thread shows with no turn seen here (after a restart, or
 * once its row would have left): at rest, or failed when its last turn did.
 * Null for a thread that never has a row.
 */
export function restingRow(thread: ThreadSummary): SessionRow | null {
  if (thread.archived || thread.incognito === true || isHelper(thread)) return null;
  const at = thread.updatedAt;
  return {
    id: thread.id,
    title: thread.title,
    projectId: thread.projectId,
    state: thread.status === 'error' ? 'failed' : 'done',
    since: at,
    endedAt: at,
    steps: [],
    task: null,
    detail: null,
    progress: null,
    helpers: 0,
    resting: true
  };
}
