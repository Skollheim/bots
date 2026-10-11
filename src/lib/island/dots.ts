/*
 * The pill's dots: one per session row, in its state's colour (amber waits
 * on the user, blue works, green finished a moment ago, red failed), in
 * Home's order and at most `DOTS_MAX`. Hovering one names its thread in the
 * pill's own line, where a tooltip would fight the peek.
 */
import { strings } from '../strings';
import type { SessionRow, SessionState } from './sessions';

export type DotTone = 'attention' | 'working' | 'done' | 'failed';

export interface PillDot {
  key: string;
  tone: DotTone;
  /** The thread it stands for; null for a request from a thread Home does not list (the assistant's own). */
  threadId: string | null;
  title: string;
  state: SessionState;
}

export const DOTS_MAX = 6;

const TONES: Record<SessionState, DotTone> = { waiting: 'attention', working: 'working', done: 'done', failed: 'failed' };

export function pillDots(rows: readonly SessionRow[], blocking: number): PillDot[] {
  const dots: PillDot[] = rows.map((row) => ({ key: row.id, tone: TONES[row.state], threadId: row.id, title: row.title || strings.companion.untitled, state: row.state }));
  // A request with no waiting row still shows, first.
  if (blocking > 0 && !rows.some((row) => row.state === 'waiting')) dots.unshift({ key: 'waiting', tone: 'attention', threadId: null, title: '', state: 'waiting' });
  return dots.slice(0, DOTS_MAX);
}

/** The line a hovered dot gives the pill: its thread and state. */
export function dotLine(dot: PillDot): { text: string; tone: DotTone } {
  if (dot.threadId === null) return { text: strings.island.waitingOne, tone: dot.tone };
  return { text: `${dot.title} · ${strings.island.sessions.states[dot.state]}`, tone: dot.tone };
}
