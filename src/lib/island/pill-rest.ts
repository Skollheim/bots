/*
 * What the collapsed pill shows when nothing else claims it: requests, a
 * thread that just ended and the peek's status always come first
 * (`IslandBar.svelte`). Settings chooses (`CompanionPrefs.pillRest`): the live
 * line of the session at work, the quota with the least left, what plays
 * (else the live line), or the robot alone in a short pill. A thread the
 * user follows (`followed.ts`) keeps its line, ended or at rest too.
 */
import type { MediaState } from '../companion/media';
import type { PillRest } from '../companion/prefs';
import { fill, strings } from '../strings';
import type { QuotaAccount, QuotaBar } from './quotas.svelte';
import { isLive, type SessionRow, type SessionState } from './sessions';
import { liveLine, type LiveLine } from './session-text';

export interface RestLine extends LiveLine {
  kind: 'live' | 'quota' | 'music';
  /** The session's state, which tints its name; the quota's tone; null for the music. */
  tone: SessionState | QuotaBar['tone'] | null;
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

export interface RestSources {
  /** The session's line, when one is at work or followed. */
  live: RestLine | null;
  media: MediaState | null;
  quota: { account: QuotaAccount; bar: QuotaBar } | null;
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
  return from.live;
}

/** The robot alone: as short as the face and the dots allow. */
export function robotWidth(dotsWidth: number): number {
  return Math.max(ROBOT.min, ROBOT.chrome + dotsWidth);
}
