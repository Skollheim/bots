/*
 * What the pill says when a thread ends: its name, done or failed, then the
 * files its last turn changed when they are known for sure, else how long it
 * ran ("Port the scheduler · done · 3 files", "Tidy the README · failed ·
 * 4 min"). Threads ending while one is still told are told together as a
 * count ("3 threads done · 1 failed"): a queue would keep the pill wide for
 * seconds per thread and lag behind, and Home lists them all anyway. Pure:
 * `finished.svelte.ts` feeds it the session rows and the turn read from the
 * core.
 */
import type { Message, Thread, Turn } from '@boite/contracts';
import { describeTool } from '@boite/ui/lib/tool-summary';
import { fill, strings } from '../strings';
import { sessionTime } from './session-time';
import { isLive, type SessionRow, type SessionState } from './sessions';

export interface Finish {
  threadId: string;
  title: string;
  failed: boolean;
  /** From the request's start to its end. */
  workedMs: number;
  /** Files the last turn changed; null when the page read cannot tell for sure. */
  files: number | null;
}

export interface FinishLine {
  text: string;
  tone: 'done' | 'failed';
}

const SEPARATOR = ' · ';

/** The rows that ended since the last look: at work or waiting then, done or failed now. */
export function endedRows(before: ReadonlyMap<string, SessionState>, rows: readonly SessionRow[]): SessionRow[] {
  return rows.filter((row) => {
    const was = before.get(row.id);
    return !isLive(row) && (was === 'working' || was === 'waiting');
  });
}

export function finishOf(row: SessionRow, files: number | null): Finish {
  return {
    threadId: row.id,
    title: row.title || strings.companion.untitled,
    failed: row.state === 'failed',
    workedMs: Math.max(0, (row.endedAt ?? row.since) - row.since),
    files
  };
}

function lastTurn(turns: readonly Turn[]): Turn | null {
  let last: Turn | null = null;
  for (const turn of turns) if (turn.finishedAt !== null && (last === null || turn.finishedAt >= last.finishedAt!)) last = turn;
  return last;
}

/**
 * The files a thread's last finished turn changed, by its tools' diffs. Null
 * when the page does not reach back to the turn's start, or when an edit
 * that went through carries no diff: a count that might be short is not told.
 */
export function turnFiles(snapshot: Pick<Thread, 'turns' | 'messages' | 'messagesBefore'>): number | null {
  const turn = lastTurn(snapshot.turns);
  if (!turn) return null;
  const first = snapshot.messages.findIndex((message) => message.turnId === turn.id);
  if (first < 0 || (first === 0 && snapshot.messagesBefore !== null)) return null;
  const paths = new Set<string>();
  for (const message of snapshot.messages) {
    if (message.turnId !== turn.id) continue;
    if (!countParts(message, paths)) return null;
  }
  return paths.size;
}

/** Adds a message's changed paths; false when one of its edits cannot be counted. */
function countParts(message: Message, paths: Set<string>): boolean {
  for (const part of message.parts) {
    if (part.type !== 'tool') continue;
    let diffs = 0;
    for (const document of part.documents ?? []) {
      if (document.kind !== 'diff' || !document.path) continue;
      paths.add(document.path);
      diffs += 1;
    }
    const family = describeTool(part.name, part.input).family;
    if (diffs === 0 && part.status === 'done' && (family === 'edit' || family === 'write')) return false;
  }
  return true;
}

function filesText(files: number): string {
  const copy = strings.island.finish;
  return files === 1 ? copy.filesOne : fill(copy.filesMany, { count: String(files) });
}

/** The pill's line for the threads told together, oldest first. */
export function finishLine(finishes: readonly Finish[]): FinishLine | null {
  const copy = strings.island.finish;
  const failed = finishes.filter((finish) => finish.failed).length;
  const tone = failed > 0 ? 'failed' : 'done';
  if (finishes.length === 0) return null;
  if (finishes.length === 1) {
    const finish = finishes[0]!;
    const tail = finish.files !== null && finish.files > 0 ? filesText(finish.files) : sessionTime(finish.workedMs);
    return { text: [finish.title, finish.failed ? copy.failed : copy.done, tail].join(SEPARATOR), tone };
  }
  const count = String(finishes.length);
  if (failed === finishes.length) return { text: fill(copy.manyFailed, { count }), tone };
  const done = fill(copy.manyDone, { count });
  return { text: failed > 0 ? done + SEPARATOR + fill(copy.someFailed, { count: String(failed) }) : done, tone };
}
