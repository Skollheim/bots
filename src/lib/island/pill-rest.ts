/*
 * What the collapsed pill shows when nothing else claims it: requests, a
 * thread that just ended and the peek's status always come first
 * (`IslandBar.svelte`). Settings chooses (`CompanionPrefs.pillRest`): the live
 * line of the session at work, the quota left (`headroom`), what plays
 * (else the live line), the running timer (else the live line), or the robot
 * alone in a short pill. A thread the
 * user follows (`followed.ts`) keeps its line, ended or at rest too. The wheel
 * goes through them (`pill-stops.ts`).
 */
import type { MediaState } from '../companion/media';
import { clock, type PomodoroPhase, type TimerKind } from '../companion/pomodoro';
import type { PillRest } from '../companion/prefs';
import { fill, strings } from '../strings';
import type { QuotaAccount, QuotaBar } from './quotas.svelte';
import { isLive, type SessionRow, type SessionState } from './sessions';
import { liveLine, type LiveLine } from './session-text';

export interface RestLine extends LiveLine {
  kind: 'live' | 'quota' | 'music' | 'timer';
  /** The session's state, which tints its name; the quota's tone; the timer's phase, work amber and break green; null for the music. */
  tone: SessionState | QuotaBar['tone'] | null;
  /** A timer stopped for now: its time dims. */
  paused?: boolean;
}

/** The timer as the pill tells it: its kind and phase, what it is for, and its clock. */
export interface TimerSource {
  kind: TimerKind;
  phase: PomodoroPhase;
  label: string;
  /** Left of the phase, or so far for a stopwatch. */
  ms: number;
  paused: boolean;
}

/** The short pill of the robot alone: the face, its padding, and the dots. */
const ROBOT = { min: 96, chrome: 64 };

/** A session's line in the pill: what it does while it works, else how it ended, or that it rests. */
export function sessionLine(row: SessionRow, project: string): RestLine {
  if (isLive(row)) return { ...liveLine(row, project), kind: 'live', tone: row.state };
  const words = strings.island.sessions.followState;
  const doing = row.state === 'failed' ? words.failed : row.resting ? words.resting : words.done;
  return { name: project || row.title || strings.companion.untitled, doing, progress: null, kind: 'live', tone: row.state };
}

/** The timer's line: what it is for (its phase when it has no label, or on a break), then its clock. */
export function timerLine(timer: TimerSource): RestLine {
  const copy = strings.companion.pomodoro;
  const resting = timer.phase === 'break';
  const phase = timer.kind === 'countdown' ? copy.countdown : timer.kind === 'stopwatch' ? copy.stopwatch : resting ? copy.rest : copy.work;
  const doing = clock(timer.ms, timer.kind === 'stopwatch' ? 'down' : 'up');
  return { name: timer.label && !resting ? timer.label : phase, doing, progress: null, kind: 'timer', tone: resting ? 'done' : 'amber', paused: timer.paused };
}

export interface RestSources {
  /** The session's line, when one is at work or followed. */
  live: RestLine | null;
  media: MediaState | null;
  quota: { account: QuotaAccount; bar: QuotaBar } | null;
  /** The timer while one runs (paused counts). */
  timer: TimerSource | null;
}

/** The line the pill shows at rest; null for the robot alone, or nothing to say. */
export function restLine(rest: PillRest, from: RestSources): RestLine | null {
  if (rest === 'robot') return null;
  if (rest === 'quota' && from.quota) {
    const { account, bar } = from.quota;
    return { name: account.name, doing: fill(strings.island.assistant.quotas.left, { percent: String(bar.left) }), progress: null, kind: 'quota', tone: bar.tone };
  }
  if (rest === 'music' && from.media?.playing && from.media.title) {
    return { name: from.media.title, doing: from.media.artist, progress: null, kind: 'music', tone: null };
  }
  if (rest === 'timer' && from.timer) return timerLine(from.timer);
  return from.live;
}

/** The robot alone: as short as the face and the dots allow. */
export function robotWidth(dotsWidth: number): number {
  return Math.max(ROBOT.min, ROBOT.chrome + dotsWidth);
}
