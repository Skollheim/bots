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
import type { Client } from '@boite/ui/lib/client';
import { page } from '@boite/ui/lib/page-hidden.svelte';
import { isLive, leadOf, reduceSessions, type SessionEvent, type SessionRow } from './sessions';

export interface SessionsSource {
  client(): Client | null;
  /** The whole thread list, kept current by the companion. */
  threads(): readonly ThreadSummary[];
  /** The companion's own threads: its chat, never a session row. */
  own(): readonly string[];
}

/** The steps read once when a thread starts being followed. */
const SEED_MESSAGES = 4;
const TICK_MS = 1_000;

/**
 * What Home shows unfolded: the rows opened on their steps and the one step
 * whose change is open. Kept here so it outlives a turn to another tab; a
 * capture pose sets it too (`pose.ts`).
 */
export const unfolding = $state<{ rows: string[]; diff: string | null }>({ rows: [], diff: null });

export class Sessions {
  #rows = $state.raw<SessionRow[]>([]);
  /** The clock the elapsed times read, a tick a second while a row shows. */
  now = $state(Date.now());

  /** The rows Home lists, waiting ones first. */
  readonly rows = $derived.by(() => {
    const own = new Set(this.source.own());
    return own.size === 0 ? this.#rows : this.#rows.filter((row) => !own.has(row.id));
  });
  /** The session the peek speaks of. */
  readonly lead = $derived(leadOf(this.rows));

  #followed = new Set<string>();
  #client: Client | null = null;

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
        untrack(() => this.apply({ type: 'threads', threads, at: Date.now() }));
      });
      $effect(() => {
        void this.source.client();
        const live = this.rows.filter(isLive).map((row) => row.id);
        untrack(() => this.#follow(live));
      });
    });
    const clock = setInterval(() => {
      if (page.hidden || this.#rows.length === 0) return;
      this.now = Date.now();
      this.apply({ type: 'prune', at: this.now });
    }, TICK_MS);
    return () => {
      clearInterval(clock);
      stop();
      detach?.();
      this.#follow([]);
      this.#client = null;
    };
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
