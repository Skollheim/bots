/*
 * Following a pull request's CI, for the island: what its checks say, when to
 * read them again, and the pill's line once they settled. Pure:
 * `pr-watch.svelte.ts` reads the core and keeps the timers.
 *
 * A check's state is what Boite's core passes on from GitHub's
 * `statusCheckRollup` (`packages/core/src/pull-request-review.ts`): a check
 * run's conclusion once it has one, else its status; a commit status's state.
 * Boite's UI shows the text as it comes and classes none of it, so Bots does:
 * - passed: SUCCESS, NEUTRAL, SKIPPED;
 * - failed: FAILURE, ERROR, CANCELLED, TIMED_OUT, ACTION_REQUIRED,
 *   STARTUP_FAILURE, STALE;
 * - anything else (QUEUED, IN_PROGRESS, PENDING, EXPECTED, WAITING, an empty
 *   text...) is still pending.
 * One failed check is a failure at once; green needs every check passed.
 */
import type { LinkedPullRequest, PullRequestCheck } from '@boite/contracts';
import { fill, strings } from '../strings';

export type CheckState = 'pending' | 'passed' | 'failed';
/** `none`: the pull request has no check yet, or none at all. */
export type CiVerdict = CheckState | 'none';

const PASSED = new Set(['SUCCESS', 'NEUTRAL', 'SKIPPED']);
const FAILED = new Set(['FAILURE', 'ERROR', 'CANCELLED', 'TIMED_OUT', 'ACTION_REQUIRED', 'STARTUP_FAILURE', 'STALE']);

/** The first read waits this long, then each one half again as long, up to `MAX_DELAY_MS`. */
export const FIRST_DELAY_MS = 20_000;
export const MAX_DELAY_MS = 120_000;
/** A pull request's CI is followed this long at most. */
export const FOLLOW_CAP_MS = 60 * 60_000;
/** A pull request with no check at all is given this long for one to show. */
export const NO_CHECKS_MS = 5 * 60_000;
/** Reads that fail in a row before the pull request is let go. */
export const MAX_ERRORS = 3;

export function checkState(state: string): CheckState {
  const upper = state.trim().toUpperCase();
  if (PASSED.has(upper)) return 'passed';
  if (FAILED.has(upper)) return 'failed';
  return 'pending';
}

export interface Verdict {
  state: CiVerdict;
  /** The first check that failed, for the pill's line. */
  failed: PullRequestCheck | null;
}

export function ciVerdict(checks: readonly PullRequestCheck[]): Verdict {
  if (checks.length === 0) return { state: 'none', failed: null };
  const failed = checks.find((check) => checkState(check.state) === 'failed') ?? null;
  if (failed) return { state: 'failed', failed };
  return { state: checks.some((check) => checkState(check.state) === 'pending') ? 'pending' : 'passed', failed: null };
}

/** How long before the next read, after `reads` reads: 20 s, 30 s, 45 s… up to 2 min. */
export function nextDelay(reads: number, first = FIRST_DELAY_MS, max = MAX_DELAY_MS): number {
  return Math.round(Math.min(max, first * 1.5 ** Math.max(0, reads)));
}

/** Still worth another read: under the cap, and for no check at all, under its shorter wait. */
export function keepFollowing(verdict: CiVerdict, startedAt: number, now: number): boolean {
  const elapsed = now - startedAt;
  return elapsed < FOLLOW_CAP_MS && (verdict !== 'none' || elapsed < NO_CHECKS_MS);
}

/** The open pull requests of a list not met before: the ones to follow. */
export function freshPullRequests<T extends Pick<LinkedPullRequest, 'url' | 'state'>>(list: readonly T[], met: ReadonlySet<string>): T[] {
  return list.filter((pr) => pr.state === 'OPEN' && !met.has(pr.url.toLowerCase()));
}

export interface PrLine {
  text: string;
  tone: 'done' | 'failed';
}

/** "PR #12 · CI green · Port the scheduler", "PR #12 · CI failed · tests": the thread's name last, so it is what an ellipsis cuts. */
export function prLine(number: number, verdict: 'passed' | 'failed', thread: string, check: string | null): PrLine {
  const copy = strings.island.pr;
  const head = fill(copy.number, { number: String(number) });
  if (verdict === 'passed') return { text: [head, copy.green, thread].filter(Boolean).join(' · '), tone: 'done' };
  return { text: [head, copy.red, check || thread].filter(Boolean).join(' · '), tone: 'failed' };
}
