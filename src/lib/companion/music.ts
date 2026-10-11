/*
 * The arithmetic of the music bubble, pure so it is tested without a shell:
 * where the track is between two reads of the media session, how a peak level
 * becomes a bar, and which colour of the cover the bubble wears.
 */
import type { MediaState } from './media';

/** What the clock counts from: the position the session told, when it told it, and how the track went on. */
export interface MusicBase {
  position: number;
  at: number;
  duration: number;
  playing: boolean;
}

/** How far a read may differ from the count before it counts as a jump (a seek, a new track). */
export const DRIFT_MS = 1500;

/** The track's position at `now`, from the base; 0 with no base. */
export function positionAt(base: MusicBase | null, now: number): number {
  if (!base) return 0;
  const moved = base.position + (base.playing ? Math.max(0, now - base.at) : 0);
  return Math.min(base.duration, Math.max(0, moved));
}

/**
 * The base after a read: the same while the read agrees with the count, so
 * nothing that draws the time redraws for nothing; a new one on a jump, a
 * pause, a play, or another track. Null when the player tells no timeline.
 */
export function clockAfter(base: MusicBase | null, state: MediaState | null, now: number): MusicBase | null {
  if (!state || state.position == null || !state.duration || state.duration <= 0) return null;
  const same = base !== null && base.playing === state.playing && Math.abs(base.duration - state.duration) < 1000 && Math.abs(positionAt(base, now) - state.position) <= DRIFT_MS;
  return same ? base : { position: state.position, at: now, duration: state.duration, playing: state.playing };
}

/** How long after a seek a read that tells another position is taken for one the player sent before it. */
export const SEEK_HOLD_MS = 3000;

/** The base `position` milliseconds into the track, from `now`; null with no base. */
export function seekTo(base: MusicBase | null, position: number, now: number): MusicBase | null {
  if (!base) return null;
  return { ...base, position: Math.min(base.duration, Math.max(0, position)), at: now };
}

/**
 * The base after a read while a seek settles: kept against a read telling
 * the old position, unless the play state or the track's length changed
 * (another track, a pause).
 */
export function heldClock(base: MusicBase | null, state: MediaState | null, now: number): MusicBase | null {
  const next = clockAfter(base, state, now);
  if (base === null || next === null || next === base) return next;
  return next.playing === base.playing && Math.abs(next.duration - base.duration) < 1000 ? base : next;
}

/** What tells one track from another in the player: the position and the play state do not. */
export interface TrackFace {
  title: string;
  artist: string;
  art?: string | null;
}

/** A cover that changes this soon after the title is taken for the new track's cover arriving late. */
export const ART_SETTLE_MS = 1500;

/**
 * Whether `next` is another track than `shown`, for the player to slide the
 * change: another title or artist, or another cover once the last change
 * settled. A cover that comes or goes (the player sent it late, or has none)
 * is the same track.
 */
export function isNewTrack(shown: TrackFace | null, next: TrackFace | null, sinceChange: number): boolean {
  if (!shown || !next) return false;
  if (shown.title !== next.title || shown.artist !== next.artist) return true;
  const [before, after] = [shown.art ?? null, next.art ?? null];
  return before !== null && after !== null && before !== after && sinceChange >= ART_SETTLE_MS;
}

/** How long after a press of previous or next the track that changes is taken for its answer. */
export const SKIP_ANSWER_MS = 4000;

/** The way a new track slides in: back after a press of previous a moment ago, forward otherwise. */
export function slideOf(skip: { action: 'previous' | 'next'; at: number } | null, now: number): 1 | -1 {
  return skip !== null && skip.action === 'previous' && now - skip.at <= SKIP_ANSWER_MS ? -1 : 1;
}

/** The loudness the bars are drawn against: it follows a louder peak at once and lets go slowly, never under `LEVEL_FLOOR`. */
export const LEVEL_FLOOR = 0.06;
export function nextCeiling(ceiling: number, peak: number): number {
  return Math.max(LEVEL_FLOOR, peak, ceiling * 0.992);
}

/** A peak as a bar's height, 0 to 1: against the ceiling, eased so quiet passages still move. */
export function barOf(peak: number, ceiling: number): number {
  if (peak <= 0 || ceiling <= 0) return 0;
  return Math.min(1, Math.pow(Math.min(1, peak / ceiling), 0.7));
}

/** A bar rises at once and falls in a few steps, as a meter's needle does. */
export function fallTo(shown: number, next: number): number {
  return next >= shown ? next : shown * 0.62 + next * 0.38;
}

/**
 * The bars of a meter `count` wide from the newest levels first: the newest
 * in the middle, the older ones spreading out to both sides, so the meter
 * pulses from its centre.
 */
export function mirrored(history: readonly number[], count: number): number[] {
  const middle = (count - 1) / 2;
  return Array.from({ length: count }, (_, index) => history[Math.round(Math.abs(index - middle))] ?? 0);
}

/**
 * The cover's colour the bubble wears: the most vivid of its pixels (RGBA,
 * as a canvas gives them), lifted until it reads on black. Null for a cover
 * with no colour to speak of (black and white, or too dark).
 */
export function accentOf(pixels: ArrayLike<number>): string | null {
  let best: { score: number; r: number; g: number; b: number }[] = [];
  for (let index = 0; index + 3 < pixels.length; index += 4) {
    const [r, g, b, a] = [pixels[index]!, pixels[index + 1]!, pixels[index + 2]!, pixels[index + 3]!];
    if (a < 128) continue;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const saturation = max === 0 ? 0 : (max - min) / max;
    const score = saturation * (max / 255);
    best.push({ score, r, g, b });
  }
  if (best.length === 0) return null;
  best.sort((x, y) => y.score - x.score);
  best = best.slice(0, Math.max(1, Math.ceil(best.length / 6)));
  if (best[0]!.score < 0.12) return null;
  const mean = (key: 'r' | 'g' | 'b') => best.reduce((sum, pixel) => sum + pixel[key], 0) / best.length;
  return liftOnBlack(mean('r'), mean('g'), mean('b'));
}

/** The colour, its hue kept, made light enough to read on the island's black. */
export function liftOnBlack(r: number, g: number, b: number): string {
  const max = Math.max(r, g, b, 1);
  // The brightest channel reaches at least 220: dark covers still give a colour that glows.
  const scale = Math.max(1, 220 / max);
  const lifted = [r, g, b].map((channel) => Math.round(Math.min(255, channel * scale)));
  // A floor keeps the darkest channel from vanishing: the colour stays light.
  const floor = 70;
  const [lr, lg, lb] = lifted.map((channel) => Math.round(floor + (channel * (255 - floor)) / 255));
  return `rgb(${lr} ${lg} ${lb})`;
}
