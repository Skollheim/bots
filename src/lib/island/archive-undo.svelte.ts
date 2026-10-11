/*
 * The archive lines Home shows (`archive-undo.ts`): one per thread archived
 * in the last seconds, each with its own timer. When a line's time is up its
 * thread's finished card goes too (`gone`); undone, the core unarchives the
 * thread and the row comes back (`restore`).
 */
import type { Client } from '@boite/ui/lib/client';
import { fill, strings } from '../strings';
import { UNDO_MS, type UndoLine } from './archive-undo';
import type { SessionRow } from './sessions';
import { archive, unarchive } from './thread-actions';

export interface UndoHooks {
  client(): Client | null;
  /** The thread is back from the archive: its row returns, and it is followed again if it was. */
  restore(line: UndoLine): void;
}

interface Pending {
  timer: ReturnType<typeof setTimeout>;
  /** What else leaves with the thread once the line's time is up: its finished card. */
  gone?: () => void;
}

export class ArchiveUndo {
  /** The lines standing, oldest first. */
  lines = $state.raw<UndoLine[]>([]);
  #pending = new Map<string, Pending>();

  constructor(
    private readonly hooks: UndoHooks,
    private readonly wait = UNDO_MS
  ) {}

  has(threadId: string): boolean {
    return this.lines.some((line) => line.threadId === threadId);
  }

  /** Archives the row's thread now; its line stands once the core said yes. A refusal throws, for the button to tell. */
  async archive(row: SessionRow, followed: boolean, gone?: () => void): Promise<void> {
    const client = this.hooks.client();
    if (!client) throw new Error(strings.island.notice.offline);
    await archive(client, row.id);
    this.#settle(row.id, false);
    this.lines = [...this.lines, { threadId: row.id, row, followed, at: Date.now(), undoing: false, problem: '' }];
    this.#arm(row.id, gone);
  }

  /** Asks the core for the thread back; the line stays, telling why, if it refuses. */
  async undo(threadId: string): Promise<void> {
    const line = this.lines.find((entry) => entry.threadId === threadId);
    if (!line || line.undoing) return;
    const pending = this.#pending.get(threadId);
    if (pending) clearTimeout(pending.timer);
    this.#pending.delete(threadId);
    this.#update(threadId, { undoing: true, problem: '' });
    try {
      const client = this.hooks.client();
      if (!client) throw new Error(strings.island.notice.offline);
      await unarchive(client, threadId);
      this.lines = this.lines.filter((entry) => entry.threadId !== threadId);
      this.hooks.restore(line);
    } catch (error) {
      const reason = error instanceof Error ? error.message : String(error);
      this.#update(threadId, { undoing: false, problem: fill(strings.island.notice.failed, { reason }), at: Date.now() });
      this.#arm(threadId, pending?.gone);
    }
  }

  /** The island leaves: every archive holds, and the cards of the threads archived go. */
  dispose(): void {
    for (const threadId of [...this.#pending.keys()]) this.#settle(threadId, true);
    this.lines = [];
  }

  #arm(threadId: string, gone?: () => void): void {
    const timer = setTimeout(() => {
      this.lines = this.lines.filter((entry) => entry.threadId !== threadId);
      this.#settle(threadId, true);
    }, this.wait);
    this.#pending.set(threadId, { timer, gone });
  }

  /** Lets the line's timer go; `done`: its time is up, what leaves with the thread goes. */
  #settle(threadId: string, done: boolean): void {
    const pending = this.#pending.get(threadId);
    if (!pending) return;
    clearTimeout(pending.timer);
    this.#pending.delete(threadId);
    if (done) pending.gone?.();
  }

  #update(threadId: string, patch: Partial<UndoLine>): void {
    this.lines = this.lines.map((entry) => (entry.threadId === threadId ? { ...entry, ...patch } : entry));
  }
}
