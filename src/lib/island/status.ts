/*
 * The island's one line when it peeks: what matters most right now, and the
 * tone it glows in. A request waiting comes first, then a turn just finished,
 * then a reply on its way, then the agents at work.
 */
import { fill, strings } from '../strings';

export type StatusTone = 'attention' | 'done' | 'talking' | 'working' | 'idle';

export interface StatusInput {
  /** Permissions and questions that stop an agent. */
  blocking: number;
  /** A turn finished a moment ago (the green peek). */
  finished: boolean;
  /** The name of the character answering, or '' for the lone one; null when none is. */
  talking: string | null;
  /** Other threads at work. */
  busy: number;
}

export interface IslandStatus {
  text: string;
  tone: StatusTone;
}

export function islandStatus({ blocking, finished, talking, busy }: StatusInput): IslandStatus {
  const copy = strings.island;
  if (blocking > 0) return { text: blocking === 1 ? copy.waitingOne : fill(copy.waitingMany, { count: String(blocking) }), tone: 'attention' };
  if (finished) return { text: copy.finished, tone: 'done' };
  if (talking !== null) return { text: fill(copy.talking, { name: talking || copy.label }), tone: 'talking' };
  if (busy > 0) return { text: fill(busy === 1 ? copy.busyOne : copy.busyMany, { count: String(busy) }), tone: 'working' };
  return { text: copy.quiet, tone: 'idle' };
}
