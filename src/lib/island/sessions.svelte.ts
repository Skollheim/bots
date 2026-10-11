/*
 * Home's live sessions, held for the island: the reducer of `sessions.ts` fed
 * from the core. The thread list comes from the companion, which already
 * reads it and follows `thread.updated`; the turns, steps and tasks come from
 * the events here. A thread at work is subscribed for its steps
 * (`message.part` reaches subscribed sockets only) and its last steps are read
 * once with `threads.get`; it is let go when its row leaves.
 */
import { untrack } from 'svelte';
import type { ThreadSummary } from '@boite/contracts';
import type { Client, ObservableClient } from '@boite/ui/lib/client';
import { page } from '@boite/ui/lib/page-hidden.svelte';
import type { UndoLine } from './archive-undo';
import { ArchiveUndo } from './archive-undo.svelte';
import { coreKey, followedGone, restingRow } from './followed';
import { Followed } from './followed.svelte';
import { isLive, leadOf, reduceSessions, sortRows, type SessionEvent, type SessionRow } from './sessions';
import { clockDelay } from './session-time';

export interface SessionsSource {
  client(): Client | null;
  /** The whole thread list, kept current by the companion. */
  threads(): readonly ThreadSummary[];
  /** The companion's own threads: its chat, never a session row. */
  own(): readonly string[];
  /** Threads whose finished card a row carries: their rows stay while the card does. */
  held?(): readonly string[];
}

/** The steps read once when a thread starts being followed. */
const SEED_MESSAGES = 4;
/** The clock wakes a little after a time's text turns, never just before. */
const CLOCK_SLACK_MS = 20;
/** How long a row given back by an Undo is kept while the thread list still says the thread is archived. */
const RESTORE_HOLD_MS = 15_000;

/**
 * What Home shows unfolded: the rows opened on their steps and the one step
 * whose change is open. Kept here so it outlives a turn to another tab; a
 * capture pose sets it too (`pose.ts`).
 */
export const unfolding = $state<{ rows: string[]; diff: string | null }>({ rows: [], diff: null });

/** Who the core said it is on the last hello, when the client keeps it. */
function coreOf(client: Client | null): ObservableClient['core'] {
  return client && 'core' in client ? (client as ObservableClient).core : null;
}

export class Sessions {
  #rows = $state.raw<SessionRow[]>([]);
  /** The clock the elapsed times read: it moves only when a row's time would read differently (`clockDelay`). */
  now = $state(Date.now());

  /** The thread the pill follows (`followed.ts`), chosen on its Home row; one per core. */
  readonly followed = new Followed(() => coreKey(coreOf(this.source.client())));
  /** Read again as the thread list moves: the core it belongs to is known once the list is. */
  readonly followedId = $derived.by(() => {
    void this.source.threads();
    return this.followed.id;
  });
  /** The archives that can still be undone, a line each in Home (`archive-undo.ts`). */
  readonly undo = new ArchiveUndo({ client: () => this.source.client(), restore: (line) => this.#restore(line) });

  /** The rows Home lists, waiting ones first; the followed thread has one, at rest when nothing else made it. */
  readonly rows = $derived.by(() => {
    const own = new Set(this.source.own());
    const rows = own.size === 0 ? this.#rows : this.#rows.filter((row) => !own.has(row.id));
    const id = this.followedId;
    if (!id || own.has(id) || rows.some((row) => row.id === id)) return rows;
    const thread = this.source.threads().find((entry) => entry.id === id);
    const resting = thread ? restingRow(thread) : null;
    return resting ? sortRows([...rows, resting]) : rows;
  });
  /** The followed thread's row, for the pill. */
  readonly followedRow = $derived(this.followedId ? (this.rows.find((row) => row.id === this.followedId) ?? null) : null);
  /** The session the peek speaks of. */
  readonly lead = $derived(leadOf(this.rows));
  /** The threads whose row shows them ended: their finished card folds into the row. */
  readonly ended = $derived(this.rows.filter((row) => !isLive(row)).map((row) => row.id));
  /** A step's diff shows: its row unfolded and the step still there. The open island grows for it. */
  readonly diffShown = $derived(
    unfolding.diff !== null && this.rows.some((row) => unfolding.rows.includes(row.id) && row.steps.some((step) => step.id === unfolding.diff && step.diff !== null))
  );

  #followed = new Set<string>();
  #client: Client | null = null;
  /** Rows an Undo gave back, held until the thread list has their threads out of the archive. */
  #restoring = new Map<string, { row: SessionRow; until: number }>();

  constructor(private readonly source: SessionsSource) {}

  /** What a test or the reducer's caller feeds by hand. */
  apply(event: SessionEvent): void {
    this.#rows = reduceSessions(this.#rows, event);
  }

  start(): () => void {
    let detach: (() => void) | null = null;
    const stop = $effect.root(() => {
      $effect(() => {
        const client = this.source.client();
        untrack(() => {
          detach?.();
          this.#client = client;
          this.#followed.clear();
          detach = client ? this.#listen(client) : null;
        });
      });
      $effect(() => {
        const threads = this.source.threads();
        untrack(() => {
          const at = Date.now();
          this.apply({ type: 'threads', threads, at });
          this.#holdRestored(threads, at);
        });
      });
      // The followed thread archived or gone: the pill lets it go, unless an Undo just gave it back.
      $effect(() => {
        const id = this.followedId;
        const threads = this.source.threads();
        if (id && !this.#restoring.has(id) && followedGone(id, threads)) untrack(() => this.followed.set(null));
      });
      $effect(() => {
        void this.source.client();
        const live = this.rows.filter(isLive).map((row) => row.id);
        untrack(() => this.#follow(live));
      });
      // The clock wakes when a row's time would read differently or an ended row is due to leave
      // (`clockDelay`): each second under a minute, then once a minute; never without a row.
      $effect(() => {
        void this.now;
        if (page.hidden) return;
        const rows = this.#rows;
        const keep = this.#keep();
        const delay = untrack(() => clockDelay(rows, Date.now(), keep));
        if (delay === null) return;
        const timer = setTimeout(() => this.#tick(keep), delay + CLOCK_SLACK_MS);
        return () => clearTimeout(timer);
      });
    });
    return () => {
      stop();
      detach?.();
      this.#follow([]);
      this.#client = null;
      this.undo.dispose();
    };
  }

  /** Ended rows that stay past their two minutes: the ones carrying a finished card, and the followed thread's. */
  #keep(): string[] {
    const held = this.source.held?.() ?? [];
    const id = this.followedId;
    return id ? [...held, id] : [...held];
  }

  /** An archive undone: the row comes back where it was, counting its two minutes from now, and is followed again if it was. */
  #restore(line: UndoLine): void {
    const row = { ...line.row, endedAt: Date.now() };
    this.#restoring.set(row.id, { row, until: Date.now() + RESTORE_HOLD_MS });
    this.apply({ type: 'restore', row });
    if (line.followed) this.followed.set(row.id);
  }

  /** A list read before the core unarchived a thread still has it archived: the row given back stays until the list catches up. */
  #holdRestored(threads: readonly ThreadSummary[], at: number): void {
    for (const [id, held] of this.#restoring) {
      if (at > held.until) {
        this.#restoring.delete(id);
        continue;
      }
      if (!this.#rows.some((row) => row.id === id)) this.apply({ type: 'restore', row: held.row });
      const thread = threads.find((entry) => entry.id === id);
      if (thread && !thread.archived) this.#restoring.delete(id);
    }
  }

  /** Moves the clock and lets the ended rows due go; the rows change only when one leaves. */
  #tick(keep: readonly string[]): void {
    this.now = Date.now();
    const next = reduceSessions(this.#rows, { type: 'prune', at: this.now, keep });
    if (next.length !== this.#rows.length) this.#rows = next;
  }

  #listen(client: Client): () => void {
    const off = [
      client.on('turn.started', (turn) => this.apply({ type: 'turnStarted', turn, at: Date.now() })),
      client.on('turn.finished', (turn) => this.apply({ type: 'turnFinished', turn, at: Date.now() })),
      client.on('message.part', ({ threadId, part }) => this.apply({ type: 'part', threadId, part })),
      client.on('thread.activity', ({ threadId, activity }) => this.apply({ type: 'activity', threadId, activity })),
      // A step ended on a thread whose parts do not reach this socket: its last steps are read again.
      client.on('turn.toolCompleted', ({ threadId }) => {
        if (!this.#followed.has(threadId) && this.#rows.some((row) => row.id === threadId && isLive(row))) void this.#seed(client, threadId);
      })
    ];
    return () => off.forEach((stop) => stop());
  }

  /** Subscribes to the threads newly at work, lets go of the ones that left. */
  #follow(live: readonly string[]): void {
    const client = this.#client;
    const wanted = new Set(live);
    for (const id of [...this.#followed]) {
      if (wanted.has(id)) continue;
      this.#followed.delete(id);
      if (client) void client.call('threads.unsubscribe', { threadId: id }).catch(() => {});
    }
    if (!client) return;
    for (const id of wanted) {
      if (this.#followed.has(id)) continue;
      this.#followed.add(id);
      void client
        .call('threads.subscribe', { threadId: id })
        .then(() => this.#seed(client, id))
        .catch(() => this.#followed.delete(id));
    }
  }

  async #seed(client: Client, threadId: string): Promise<void> {
    try {
      const thread = await client.call('threads.get', { threadId, limit: SEED_MESSAGES, compactTools: true, compactFiles: true, compactImages: true });
      if (client !== this.#client) return;
      this.apply({ type: 'messages', threadId, messages: thread.messages });
      if (thread.activity) this.apply({ type: 'activity', threadId, activity: thread.activity });
    } catch {
      // The live stream still brings the next steps.
    }
  }
}
