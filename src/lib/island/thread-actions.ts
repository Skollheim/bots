/*
 * What a finished thread's card does without opening Boite: start it again
 * (a failed one tries again, a finished one goes on), archive it, and show
 * the changes waiting in its folder, file by file.
 */
import type { GitChange } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { strings } from '../strings';
import { DIFF_TEXT_LIMIT, type SessionDiff } from './sessions';

/** The files a card lists before it counts the rest. */
export const CHANGES_SHOWN = 8;

/** A new turn in the thread: "Try again." after a failure, "Continue." after an answer. */
export async function relaunch(client: Client, threadId: string, failed: boolean): Promise<void> {
  const copy = strings.island.notice;
  await client.call('turns.start', { threadId, prompt: failed ? copy.retryPrompt : copy.continuePrompt, clientRequestId: crypto.randomUUID() });
}

/** Archived only while it rests: a thread started again meanwhile stays. */
export async function archive(client: Client, threadId: string): Promise<void> {
  await client.call('threads.archive', { threadId, archived: true, onlyIfIdle: true });
}

/** Back from the archive, as it was: an archive undone (`archive-undo.svelte.ts`). Starts nothing. */
export async function unarchive(client: Client, threadId: string): Promise<void> {
  await client.call('threads.archive', { threadId, archived: false });
}

/** The files changed in the thread's folder, as `git status` gives them. */
export async function changesOf(client: Client, threadId: string): Promise<GitChange[]> {
  return (await client.call('git.status', { threadId })).changes;
}

/** One file's change, cut as the session diffs are; null for a binary file. */
export async function changeOf(client: Client, threadId: string, path: string): Promise<SessionDiff | null> {
  const diff = await client.call('git.diff', { threadId, path });
  if (diff.binary) return null;
  const cut = (text: string | null) => (text ?? '').slice(0, DIFF_TEXT_LIMIT);
  return { path: diff.path, oldText: cut(diff.oldText), newText: cut(diff.newText) };
}

/** "+12 −3", or nothing when git counted nothing (a binary or new file). */
export function changeCount(change: Pick<GitChange, 'additions' | 'deletions'>): string {
  if (change.additions === null && change.deletions === null) return '';
  return `+${change.additions ?? 0} −${change.deletions ?? 0}`;
}
