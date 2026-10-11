/*
 * The CI of the pull requests Home's threads open: a pull request met open
 * for the first time is read (`threads.pullRequestReview`) until its checks
 * settle, the pull request is merged or closed, or `FOLLOW_CAP_MS` passed;
 * then the island tells it once (`told`, the pill's line, and `announce`).
 * The reads back off from 20 s to 2 min; with nothing followed, no timer runs.
 *
 * A pull request is met through `threads.pullRequestsChanged` (the core sends
 * it to the threads the island follows) or a thread's summary
 * (`ThreadSummary.pullRequest`). One already settled on its first read is
 * let go quietly: it is news only when the island saw it run.
 */
import { untrack } from 'svelte';
import type { LinkedPullRequest, ThreadSummary } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { ciVerdict, freshPullRequests, keepFollowing, MAX_ERRORS, nextDelay, prLine, type CiVerdict, type PrLine } from './pr-checks';

export interface PrHost {
  client(): Client | null;
  /** Home's threads: only their pull requests are followed. */
  rows(): readonly { id: string; title: string }[];
  /** The core's thread summaries, for the pull request each one names. */
  threads(): readonly ThreadSummary[];
  /** A pull request's CI settled: the island peeks, red for a failure. */
  announce(failed: boolean): void;
  /** The first wait and the longest one, shorter in the demo. */
  first?: number;
  max?: number;
}

/** What the pill says, and the thread a click opens. */
export interface PrTold extends PrLine {
  threadId: string;
  url: string;
}

interface Follow {
  threadId: string;
  url: string;
  number: number;
  startedAt: number;
  reads: number;
  errors: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

type Linked = Pick<LinkedPullRequest, 'url' | 'number' | 'state'>;

export class PrWatch {
  told = $state.raw<PrTold | null>(null);
  /** Every pull request met, by its address in lower case: each is followed once. */
  readonly #met = new Set<string>();
  readonly #follows = new Map<string, Follow>();

  constructor(private readonly host: PrHost) {}

  start(): () => void {
    const stop = $effect.root(() => {
      $effect(() => {
        const rows = this.host.rows();
        const threads = this.host.threads();
        untrack(() => this.#look(rows, threads));
      });
      $effect(() => {
        const client = this.host.client();
        if (!client) return;
        return client.on('threads.pullRequestsChanged', ({ threadId, pullRequests }) => this.#changed(threadId, pullRequests));
      });
    });
    return () => {
      stop();
      for (const follow of this.#follows.values()) clearTimeout(follow.timer);
      this.#follows.clear();
    };
  }

  /** The island's peek for it is over (`IslandFrame.flashing`). */
  clear(): void {
    if (this.told) this.told = null;
  }

  #look(rows: readonly { id: string }[], threads: readonly ThreadSummary[]): void {
    const home = new Set(rows.map((row) => row.id));
    for (const thread of threads) {
      const pr = thread.pullRequest;
      if (pr && home.has(thread.id)) this.#changed(thread.id, [pr], false);
    }
  }

  #changed(threadId: string, list: readonly Linked[], whole = true): void {
    if (!this.host.rows().some((row) => row.id === threadId)) return;
    for (const pr of freshPullRequests(list, this.#met)) this.#follow(threadId, pr);
    // The full list says when a pull request followed was merged, closed, or unlinked.
    if (!whole) return;
    for (const [key, follow] of this.#follows) {
      if (follow.threadId !== threadId) continue;
      const now = list.find((pr) => pr.url.toLowerCase() === key);
      if (!now || now.state !== 'OPEN') this.#drop(key);
    }
  }

  #follow(threadId: string, pr: Linked): void {
    const key = pr.url.toLowerCase();
    this.#met.add(key);
    const follow: Follow = { threadId, url: pr.url, number: pr.number, startedAt: Date.now(), reads: 0, errors: 0, timer: undefined };
    this.#follows.set(key, follow);
    void this.#read(key, follow);
  }

  #drop(key: string): void {
    clearTimeout(this.#follows.get(key)?.timer);
    this.#follows.delete(key);
  }

  /** The next read, unless the pull request was followed long enough. */
  #schedule(key: string, follow: Follow, verdict: CiVerdict): void {
    if (!keepFollowing(verdict, follow.startedAt, Date.now())) return this.#drop(key);
    follow.timer = setTimeout(() => void this.#read(key, follow), nextDelay(follow.reads - 1, this.host.first, this.host.max));
  }

  async #read(key: string, follow: Follow): Promise<void> {
    const client = this.host.client();
    if (!client || this.#follows.get(key) !== follow) return;
    let review;
    try {
      review = await client.call('threads.pullRequestReview', { threadId: follow.threadId, url: follow.url });
    } catch {
      if (this.#follows.get(key) !== follow) return;
      follow.reads += 1;
      follow.errors += 1;
      return follow.errors >= MAX_ERRORS ? this.#drop(key) : this.#schedule(key, follow, 'pending');
    }
    if (this.#follows.get(key) !== follow) return;
    const first = follow.reads === 0;
    follow.reads += 1;
    follow.errors = 0;
    if (review.state !== 'OPEN') return this.#drop(key);
    const verdict = ciVerdict(review.checks);
    if (verdict.state === 'pending' || verdict.state === 'none') return this.#schedule(key, follow, verdict.state);
    this.#drop(key);
    if (!first) this.#tell(follow, verdict.state, verdict.failed?.name ?? null);
  }

  #tell(follow: Follow, verdict: 'passed' | 'failed', check: string | null): void {
    const title = this.host.rows().find((row) => row.id === follow.threadId)?.title ?? '';
    this.told = { ...prLine(follow.number, verdict, title, check), threadId: follow.threadId, url: follow.url };
    this.host.announce(verdict === 'failed');
  }
}
