/*
 * The live sessions Home lists: one row per thread at work or waiting on the
 * user, kept two minutes after it ends. A pure reducer: core events go in,
 * rows come out, so the whole behaviour is tested without a socket.
 * `sessions.svelte.ts` feeds it from the core and holds what it returns.
 */
import type { AgentTask, Message, MessagePart, ThreadActivity, ThreadSummary, Turn } from '@boite/contracts';
import { describeTool, fileName, type ToolFamily } from '@boite/ui/lib/tool-summary';

export type SessionState = 'working' | 'waiting' | 'done' | 'failed';
export type StepKind = ToolFamily | 'done';
export type StepStatus = 'running' | 'done' | 'error' | 'denied';

/** The before and after of a file an Edit or Write step changed. */
export interface SessionDiff {
  path: string;
  oldText: string;
  newText: string;
}

export interface SessionStep {
  /** The tool call's id; `done:<turn>` for the closing step. */
  id: string;
  kind: StepKind;
  /** The tool's own name, for a tooltip. */
  name: string;
  /** A file name, or a command cut to its first line. */
  target: string;
  status: StepStatus;
  diff: SessionDiff | null;
}

export interface SessionRow {
  id: string;
  title: string;
  projectId: string | null;
  state: SessionState;
  /** When the request now at work started: what the elapsed time counts from. */
  since: number;
  /** When it ended, for done and failed rows; what the two minutes count from. */
  endedAt: number | null;
  /** Oldest first, at most `STEP_LIMIT`. */
  steps: SessionStep[];
  /** The agent's task in progress, when it keeps a list. */
  task: string | null;
  /** The core's progress line (`ThreadProgress.detail`), when it has one. */
  detail: string | null;
}

export type SessionEvent =
  | { type: 'threads'; threads: readonly ThreadSummary[]; at: number }
  | { type: 'thread'; thread: ThreadSummary; at: number }
  | { type: 'turnStarted'; turn: Turn; at: number }
  | { type: 'turnFinished'; turn: Turn; at: number }
  | { type: 'part'; threadId: string; part: MessagePart }
  | { type: 'messages'; threadId: string; messages: readonly Message[] }
  | { type: 'activity'; threadId: string; activity: ThreadActivity }
  | { type: 'prune'; at: number };

/** Steps a row keeps, newest at the bottom. */
export const STEP_LIMIT = 6;
/** How long a done or failed row stays. */
export const LINGER_MS = 120_000;
/** The most characters a diff side keeps: the view is a glance, not a review. */
export const DIFF_TEXT_LIMIT = 6_000;
/** The most characters a step's target keeps; the view ellipsizes further. */
const TARGET_LIMIT = 160;

const LIVE: ReadonlySet<SessionState> = new Set(['working', 'waiting']);

export function isLive(row: SessionRow): boolean {
  return LIVE.has(row.state);
}

type ToolPart = Extract<MessagePart, { type: 'tool' }>;

function cut(text: string, limit: number): string {
  return text.length > limit ? text.slice(0, limit) : text;
}

function firstLine(text: string): string {
  return (text.split(/\r?\n/).find((line) => line.trim().length > 0) ?? '').trim();
}

function diffOf(part: ToolPart, family: ToolFamily, change: SessionDiff | null): SessionDiff | null {
  if (family !== 'edit' && family !== 'write') return null;
  const document = part.documentsDeferred === true ? undefined : part.documents?.find((entry) => entry.kind === 'diff');
  const source = document && document.kind === 'diff' ? document : change;
  if (!source) return null;
  return { path: source.path, oldText: cut(source.oldText, DIFF_TEXT_LIMIT), newText: cut(source.newText, DIFF_TEXT_LIMIT) };
}

/** One tool call as a step: what it is, what it touches, how it went. */
export function stepOf(part: ToolPart): SessionStep {
  const { family, subject, change } = describeTool(part.name, part.input);
  const pathLike = family === 'edit' || family === 'write' || family === 'read';
  const target = cut(pathLike && subject ? fileName(subject) : firstLine(subject), TARGET_LIMIT);
  return { id: part.toolId, kind: family, name: part.name, target, status: part.status, diff: diffOf(part, family, change) };
}

function withStep(steps: readonly SessionStep[], step: SessionStep): SessionStep[] {
  const index = steps.findIndex((entry) => entry.id === step.id);
  const next = index < 0 ? [...steps, step] : steps.map((entry, at) => (at === index ? step : entry));
  return next.slice(-STEP_LIMIT);
}

function stateOf(thread: ThreadSummary): SessionState | null {
  if (thread.status === 'waiting' || (thread.openQuestions ?? 0) > 0) return 'waiting';
  if (thread.status === 'running' || thread.status === 'queued') return 'working';
  if (thread.status === 'error') return 'failed';
  return null;
}

function sinceOf(thread: ThreadSummary, fallback: number): number {
  return thread.requestSince ?? thread.runningSince ?? fallback;
}

function taskOf(tasks: readonly AgentTask[]): string | null {
  return tasks.find((task) => task.status === 'in_progress')?.text ?? null;
}

/** A thread from the list or an update, merged into the row it already has. */
function fromThread(row: SessionRow | undefined, thread: ThreadSummary, at: number, listed: boolean): SessionRow | null {
  if (thread.archived || thread.incognito === true) return null;
  const state = stateOf(thread);
  const detail = thread.progress?.detail ?? null;
  if (state === 'working' || state === 'waiting') {
    const restarted = row !== undefined && !isLive(row);
    // A list read before the turn ended still says it runs: the row stays ended.
    if (restarted && listed && thread.runningSince != null && thread.runningSince <= (row.endedAt ?? 0)) return row;
    return {
      id: thread.id,
      title: thread.title,
      projectId: thread.projectId,
      state,
      since: sinceOf(thread, row && !restarted ? row.since : at),
      endedAt: null,
      steps: restarted ? [] : (row?.steps ?? []),
      task: restarted ? null : (row?.task ?? null),
      detail
    };
  }
  if (state === 'failed') {
    // A thread the list already shows failed counts from its last update, so an old failure never shows.
    const endedAt = row?.endedAt ?? (listed ? thread.updatedAt : at);
    if (!row && at - endedAt >= LINGER_MS) return null;
    return { ...(row ?? blank(thread, endedAt)), title: thread.title, state: 'failed', endedAt, detail: null };
  }
  // Idle: a live row is done now; a row already over stays as it ended.
  if (!row) return null;
  if (!isLive(row)) return { ...row, title: thread.title };
  return { ...row, title: thread.title, state: 'done', endedAt: at, detail: null };
}

function blank(thread: ThreadSummary, at: number): SessionRow {
  return { id: thread.id, title: thread.title, projectId: thread.projectId, state: 'working', since: sinceOf(thread, at), endedAt: null, steps: [], task: null, detail: null };
}

function finish(row: SessionRow, turn: Turn, at: number): SessionRow {
  const failed = turn.status === 'error';
  if (!failed && turn.status !== 'done' && turn.status !== 'stopped') return row;
  const settled: SessionStep[] = row.steps.map((step) => (step.status === 'running' ? { ...step, status: failed ? 'error' : 'done' } : step));
  const closing: SessionStep = { id: `done:${turn.id}`, kind: 'done', name: '', target: failed ? firstLine(turn.error ?? '') : '', status: failed ? 'error' : 'done', diff: null };
  const steps = settled.some((step) => step.id === closing.id) ? settled : withStep(settled, closing);
  const ended = isLive(row) ? (turn.finishedAt ?? at) : (row.endedAt ?? at);
  return { ...row, state: failed ? 'failed' : row.state === 'failed' ? 'failed' : 'done', endedAt: ended, steps, detail: null };
}

const ORDER: Record<SessionState, number> = { waiting: 0, working: 1, failed: 2, done: 3 };

/** Waiting rows first, then working ones, then the ones that ended; oldest request first inside each. */
export function sortRows(rows: Iterable<SessionRow>): SessionRow[] {
  return [...rows].sort((a, b) => ORDER[a.state] - ORDER[b.state] || a.since - b.since || a.id.localeCompare(b.id));
}

/** The rows after one event. Never edits the rows it is given. */
export function reduceSessions(rows: readonly SessionRow[], event: SessionEvent): SessionRow[] {
  const byId = new Map(rows.map((row) => [row.id, row]));
  const put = (id: string, row: SessionRow | null): void => {
    if (row) byId.set(id, row);
    else byId.delete(id);
  };
  switch (event.type) {
    case 'threads': {
      const listed = new Set<string>();
      for (const thread of event.threads) {
        listed.add(thread.id);
        put(thread.id, fromThread(byId.get(thread.id), thread, event.at, true));
      }
      // A live row the list no longer has is gone (removed, archived elsewhere).
      for (const [id, row] of byId) if (!listed.has(id) && isLive(row)) byId.delete(id);
      break;
    }
    case 'thread':
      put(event.thread.id, fromThread(byId.get(event.thread.id), event.thread, event.at, false));
      break;
    case 'turnStarted': {
      const row = byId.get(event.turn.threadId);
      if (row && !isLive(row)) {
        byId.set(row.id, { ...row, state: 'working', since: event.turn.startedAt ?? event.at, endedAt: null, steps: [], task: null, detail: null });
      }
      break;
    }
    case 'turnFinished': {
      const row = byId.get(event.turn.threadId);
      if (row) byId.set(row.id, finish(row, event.turn, event.at));
      break;
    }
    case 'part': {
      const row = byId.get(event.threadId);
      if (row && isLive(row) && event.part.type === 'tool') byId.set(row.id, { ...row, steps: withStep(row.steps, stepOf(event.part)) });
      break;
    }
    case 'messages': {
      const row = byId.get(event.threadId);
      if (!row) break;
      let steps: SessionStep[] = [];
      for (const message of event.messages) {
        for (const part of message.parts) if (part.type === 'tool') steps = withStep(steps, stepOf(part));
      }
      // Steps the live stream already brought stay, newer than the page.
      for (const step of row.steps) steps = withStep(steps, step);
      byId.set(row.id, { ...row, steps });
      break;
    }
    case 'activity': {
      const row = byId.get(event.threadId);
      if (row && isLive(row)) byId.set(row.id, { ...row, task: taskOf(event.activity.tasks) });
      break;
    }
    case 'prune':
      for (const [id, row] of byId) if (!isLive(row) && (row.endedAt ?? 0) + LINGER_MS <= event.at) byId.delete(id);
      break;
  }
  return sortRows(byId.values());
}

/** The session the peek speaks of: one waiting on the user, else the oldest at work. */
export function leadOf(rows: readonly SessionRow[]): SessionRow | null {
  return rows.find((row) => row.state === 'waiting') ?? rows.find((row) => row.state === 'working') ?? null;
}

/** The step that says what a row is doing now: its last one. */
export function currentStep(row: SessionRow): SessionStep | null {
  return row.steps[row.steps.length - 1] ?? null;
}
