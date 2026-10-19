/*
 * The island's six places: the top or the bottom edge of its screen, at the
 * left, the centre or the right (`prefs.islandPlace`). The shell puts the
 * window flush with that edge and side (`island.rs`); the page keeps the
 * island `PLACE_MARGIN` from a side, so its shadow has room.
 *
 * While the pill is dragged, the window spans the screen and the page draws
 * the six places as targets (`placeRect`); the island goes to the one nearest
 * where it was let go (`nearestPlace`), on the screen it was let go on (`landPatch`).
 */
import { ISLAND_PLACES, type CompanionPrefs, type IslandEdge, type IslandPlace, type IslandSide } from '../companion/prefs';
import type { CompanionLayout } from '../companion/shell';

/** The island's distance from the screen's side at the left and right places, CSS pixels. */
export const PLACE_MARGIN = 16;

export interface PlaceParts { edge: IslandEdge; side: IslandSide }
export interface Rect { x: number; y: number; w: number; h: number }
export interface Size { width: number; height: number }

export function placeParts(place: IslandPlace): PlaceParts {
  const [edge, side] = place.split('-') as [IslandEdge, IslandSide];
  return { edge, side };
}

export function placeOf(edge: IslandEdge, side: IslandSide): IslandPlace {
  return `${edge}-${side}`;
}

/** A place as the pose and the demo name it; anything else is none. */
export function parsePlace(value: string | null | undefined): IslandPlace | null {
  return (ISLAND_PLACES as readonly unknown[]).includes(value) ? (value as IslandPlace) : null;
}

/** The place as the shell takes it (`Layout`): the side the window is aligned on, the edge it sits against. */
export function placeLayout(place: IslandPlace): CompanionLayout {
  const { edge, side } = placeParts(place);
  return { align: side, edge };
}

/** Where an island of `size` sits at `place` on a screen of `screen`, CSS pixels. */
export function placeRect(place: IslandPlace, screen: Size, size: Size, margin = PLACE_MARGIN): Rect {
  const { edge, side } = placeParts(place);
  const free = Math.max(0, screen.width - size.width);
  const x = side === 'left' ? Math.min(margin, free) : side === 'right' ? Math.max(0, free - margin) : free / 2;
  const y = edge === 'top' ? 0 : Math.max(0, screen.height - size.height);
  return { x, y, w: size.width, h: size.height };
}

/** The place whose island's centre is nearest `centre`: where a dragged island lands. */
export function nearestPlace(centre: { x: number; y: number }, screen: Size, size: Size, margin = PLACE_MARGIN): IslandPlace {
  let best: IslandPlace = 'top-center';
  let distance = Infinity;
  for (const place of ISLAND_PLACES) {
    const rect = placeRect(place, screen, size, margin);
    const away = Math.hypot(rect.x + rect.w / 2 - centre.x, rect.y + rect.h / 2 - centre.y);
    if (away < distance) [best, distance] = [place, away];
  }
  return best;
}

/** What a dragged island saves where it lands: its place, and the screen when it is not the one it began on. */
export type LandPatch = Pick<CompanionPrefs, 'islandPlace'> & Partial<Pick<CompanionPrefs, 'monitor'>>;

/**
 * The patch for an island let go at `place` on the screen named `to`, its drag
 * begun on `from` (null when the shell did not say). On the same screen the
 * screen setting stays as it was, the primary one included.
 */
export function landPatch(place: IslandPlace, from: string | null, to: string | null): LandPatch {
  return to !== null && to !== from ? { islandPlace: place, monitor: to } : { islandPlace: place };
}
