/*
 * The "Today" card of the island's Home: what the agents got done since
 * midnight, from the core's own data only. The threads whose last turn
 * finished today (agent sessions, incognito ones and the assistant's own
 * conversation left out), the files their tools changed, and the time their
 * turns ran. One line per thread; a click shows it in Boite.
 */
import type { Message, ThreadSummary, Turn } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';

/** At most this many threads are read for the card: the most recent ones. */
export const RECAP_MAX = 12;
/** Messages read from the end of each thread, enough to hold a day's turns. */
export const RECAP_PAGE = 60;
/** A card opened again within this time keeps what it read. */
export const RECAP_FRESH_MS = 30_000;

export interface RecapThread {
  id: string;
  title: string;
  project: string | null;
  finishedAt: number;
  workedMs: number;
  files: number;
}

export interface Recap {
  threads: RecapThread[];
  files: number;
  workedMs: number;
}

export const EMPTY_RECAP: Recap = { threads: [], files: 0, workedMs: 0 };

/** Local midnight before `now`. */
export function startOfDay(now: number): number {
  const day = new Date(now);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

const working = (status: ThreadSummary['status']) => status === 'queued' || status === 'running' || status === 'waiting';

/** The threads worth reading: touched today, at rest, the user's own, the most recent first. */
export function recapCandidates(threads: ThreadSummary[], since: number, leftOut: readonly string[]): ThreadSummary[] {
  return threads
    .filter((thread) => !thread.agentSessionId && !thread.incognito && !leftOut.includes(thread.id) && thread.updatedAt >= since && !working(thread.status))
    .sort((a, b) => b.updatedAt - a.updatedAt)
    .slice(0, RECAP_MAX);
}

/** The turns that finished today, and how long each ran inside today. */
export function todaysTurns(turns: Turn[], since: number): { finishedAt: number; workedMs: number }[] {
  return turns
    .filter((turn) => turn.finishedAt !== null && turn.finishedAt >= since && turn.status !== 'queued' && turn.status !== 'running')
    .map((turn) => ({ finishedAt: turn.finishedAt!, workedMs: Math.max(0, turn.finishedAt! - Math.max(turn.startedAt ?? turn.finishedAt!, since)) }));
}

/** The paths today's turns changed, through their tools' diffs. */
export function changedFiles(messages: Message[], turnIds: ReadonlySet<string>): Set<string> {
  const paths = new Set<string>();
  for (const message of messages) {
    if (!turnIds.has(message.turnId)) continue;
    for (const part of message.parts) {
      if (part.type !== 'tool') continue;
      for (const document of part.documents ?? []) if (document.kind === 'diff' && document.path) paths.add(document.path);
    }
  }
  return paths;
}

/** One thread's line, or null when no turn of it finished today. */
export function recapThread(thread: ThreadSummary, turns: Turn[], messages: Message[], since: number, project: string | null): RecapThread | null {
  const today = todaysTurns(turns, since);
  if (today.length === 0) return null;
  const ids = new Set(turns.filter((turn) => turn.finishedAt !== null && turn.finishedAt >= since).map((turn) => turn.id));
  return {
    id: thread.id,
    title: thread.title,
    project,
    finishedAt: Math.max(...today.map((turn) => turn.finishedAt)),
    workedMs: today.reduce((sum, turn) => sum + turn.workedMs, 0),
    files: changedFiles(messages, ids).size
  };
}

/** The card's totals over its lines, the most recently finished first. */
export function summarize(lines: RecapThread[]): Recap {
  const threads = [...lines].sort((a, b) => b.finishedAt - a.finishedAt);
  return { threads, files: threads.reduce((sum, line) => sum + line.files, 0), workedMs: threads.reduce((sum, line) => sum + line.workedMs, 0) };
}

/** `2 h 05`, `25 min`, `< 1 min`: a duration at a glance, its units from the catalogue. */
export function duration(ms: number): { hours: number; minutes: number } {
  const minutes = Math.round(ms / 60_000);
  return { hours: Math.floor(minutes / 60), minutes: minutes % 60 };
}

export interface RecapHost {
  client(): Client | null;
  /** Project names by id. */
  projects(): Map<string, string>;
  /** Threads that are not the user's work: the assistant's own conversation. */
  leftOut(): readonly string[];
}

export class RecapReader {
  recap = $state<Recap>(EMPTY_RECAP);
  loaded = $state(false);
  private readAt = 0;
  private reading: Promise<void> | null = null;

  constructor(private readonly host: RecapHost) {}

  /** Reads the day again, unless it was read a moment ago or `force` says so. */
  load(now = Date.now(), force = false): Promise<void> {
    if (this.reading) return this.reading;
    if (!force && this.loaded && now - this.readAt < RECAP_FRESH_MS) return Promise.resolve();
    this.reading = this.read(now).finally(() => (this.reading = null));
    return this.reading;
  }

  private async read(now: number): Promise<void> {
    const client = this.host.client();
    if (!client) return;
    const since = startOfDay(now);
    const threads = await client.call('threads.list', { includeArchived: true }).catch(() => null);
    if (!threads) return;
    const projects = this.host.projects();
    const lines = await Promise.all(
      recapCandidates(threads, since, this.host.leftOut()).map(async (thread) => {
        const snapshot = await client
          .call('threads.get', { threadId: thread.id, limit: RECAP_PAGE, compactTools: true, compactFiles: true, compactImages: true, compactToolParts: true })
          .catch(() => null);
        return snapshot ? recapThread(thread, snapshot.turns, snapshot.messages, since, projects.get(thread.projectId ?? '') ?? null) : null;
      })
    );
    this.recap = summarize(lines.filter((line): line is RecapThread => line !== null));
    this.loaded = true;
    this.readAt = now;
  }
}
