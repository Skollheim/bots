/*
 * Watches the session rows for threads that end and tells them in the pill
 * while the island peeks for them (`announce`, until `clear`; `finished.ts`
 * says how). The files a thread changed are read once from the core when it
 * ends, waited for `FILES_WAIT_MS` at most: past that, the pill tells how
 * long it ran instead.
 */
import { untrack } from 'svelte';
import type { Client } from '@boite/ui/lib/client';
import { endedRows, finishLine, finishOf, turnFiles, type Finish, type FinishLine } from './finished';
import type { SessionRow, SessionState } from './sessions';

/** How long the count of files is waited for before the pill speaks without it. */
export const FILES_WAIT_MS = 700;
/** Messages read from the end of the thread: enough for a turn's tool calls, most of the time. */
const FILES_PAGE = 80;

export interface FinishHost {
  client(): Client | null;
  /** The session rows (`Sessions.rows`). */
  rows(): readonly SessionRow[];
  /** A thread ended: the island peeks, red when one of those told failed. */
  announce(failed: boolean): void;
}

export class FinishWatch {
  /** The threads the pill tells now, oldest first; empty once it settled back. */
  told = $state.raw<Finish[]>([]);
  readonly line = $derived<FinishLine | null>(finishLine(this.told));
  #seen: Map<string, SessionState> | null = null;

  constructor(private readonly host: FinishHost) {}

  start(): () => void {
    const stop = $effect.root(() => {
      $effect(() => {
        const rows = this.host.rows();
        untrack(() => this.#look(rows));
      });
    });
    return () => stop();
  }

  /** One more ended thread: told alone, or with the ones still told. */
  add(finish: Finish): void {
    this.told = [...this.told.filter((entry) => entry.threadId !== finish.threadId), finish];
    this.host.announce(this.told.some((entry) => entry.failed));
  }

  /** The island's peek for them is over (`IslandFrame.flashing`): nothing is told any more. */
  clear(): void {
    if (this.told.length > 0) this.told = [];
  }

  #look(rows: readonly SessionRow[]): void {
    const before = this.#seen;
    this.#seen = new Map(rows.map((row) => [row.id, row.state]));
    if (before) for (const row of endedRows(before, rows)) void this.#tell(row);
  }

  async #tell(row: SessionRow): Promise<void> {
    this.add(finishOf(row, await this.#files(row.id)));
  }

  #files(threadId: string): Promise<number | null> {
    const client = this.host.client();
    if (!client) return Promise.resolve(null);
    let late: ReturnType<typeof setTimeout> | undefined;
    const read = client
      .call('threads.get', { threadId, limit: FILES_PAGE, compactTools: true, compactFiles: true, compactImages: true, compactToolParts: true })
      .then(turnFiles)
      .catch(() => null);
    const timeout = new Promise<null>((resolve) => (late = setTimeout(() => resolve(null), FILES_WAIT_MS)));
    return Promise.race([read, timeout]).finally(() => clearTimeout(late));
  }
}
