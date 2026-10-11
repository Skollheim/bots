/*
 * Undoing an archive from Home. The archive is sent at once and the row
 * leaves; a line stands in its place for `UNDO_MS`, and its Undo asks the
 * core to unarchive the thread, which gives the row back. Sent at once, the
 * user's intent holds even if Bots quits during those seconds; waiting to
 * send it would lose it then. Each archive has its own line and its own
 * timer, which exists only while that line stands. `archive-undo.svelte.ts`
 * holds the lines for the island.
 */
import { sortRows, type SessionRow } from './sessions';

/** How long an archive can be undone. */
export const UNDO_MS = 5_000;

export interface UndoLine {
  threadId: string;
  /** The row as it left, given back on Undo; its place in the list is where it sorted. */
  row: SessionRow;
  /** The thread was the one the pill followed: Undo follows it again. */
  followed: boolean;
  /** When the line's seconds started: the progress runs from there. */
  at: number;
  undoing: boolean;
  /** Why the Undo did not work; empty when it did not fail. */
  problem: string;
}

export interface ListedRow {
  row: SessionRow;
  /** The archive line standing in the row's place, or null for the row itself. */
  undo: UndoLine | null;
}

/** Home's rows with each archive line where its row stood: the row sorts where it was, so the line does. */
export function listed(rows: readonly SessionRow[], lines: readonly UndoLine[]): ListedRow[] {
  if (lines.length === 0) return rows.map((row) => ({ row, undo: null }));
  const byThread = new Map(lines.map((line) => [line.threadId, line]));
  const all = [...rows.filter((row) => !byThread.has(row.id)), ...lines.map((line) => line.row)];
  return sortRows(all).map((row) => ({ row, undo: byThread.get(row.id) ?? null }));
}
