import { expect, test } from 'vitest';
import { DEFAULT_COMPANION_PREFS, ISLAND_PLACES, parseCompanionPrefs } from '../companion/prefs';
import { landPatch, layoutPlace, nearestPlace, parsePlace, PLACE_MARGIN, placeLayout, placeParts, placeRect } from './place';

const screen = { width: 1600, height: 900 };
const pill = { width: 200, height: 32 };

test('saved prefs from before the places keep the island at the top centre', () => {
  expect(DEFAULT_COMPANION_PREFS.islandPlace).toBe('top-center');
  expect(parseCompanionPrefs({ robots: 'island', pillRest: 'quota' }).islandPlace).toBe('top-center');
  expect(parseCompanionPrefs({ islandPlace: 'middle' }).islandPlace).toBe('top-center');
  expect(parseCompanionPrefs({ islandPlace: 7 }).islandPlace).toBe('top-center');
  for (const place of ISLAND_PLACES) expect(parseCompanionPrefs({ islandPlace: place }).islandPlace).toBe(place);
});

test('a robot pulled out of the island by a drag goes back in; the desktop picked in Settings stays', () => {
  expect(parseCompanionPrefs({ robots: 'desktop', islandPlace: 'top-center' }).robots).toBe('island');
  expect(parseCompanionPrefs({ robots: 'desktop', robotsPicked: true })).toMatchObject({ robots: 'desktop', robotsPicked: true });
  expect(parseCompanionPrefs({ robots: 'island', robotsPicked: true }).robots).toBe('island');
  expect(DEFAULT_COMPANION_PREFS.robotsPicked).toBe(false);
});

test('a place splits into its edge and side, as the shell takes them', () => {
  expect(placeParts('bottom-right')).toEqual({ edge: 'bottom', side: 'right' });
  expect(placeLayout('top-left')).toEqual({ align: 'left', edge: 'top' });
  expect(placeLayout('bottom-center')).toEqual({ align: 'center', edge: 'bottom' });
  expect(parsePlace('bottom-left')).toBe('bottom-left');
  expect(parsePlace('left')).toBeNull();
  expect(parsePlace(null)).toBeNull();
  for (const place of ISLAND_PLACES) expect(layoutPlace(placeLayout(place))).toBe(place);
});

test('the places sit against their edge, the sides a margin in', () => {
  expect(placeRect('top-left', screen, pill)).toEqual({ x: PLACE_MARGIN, y: 0, w: 200, h: 32 });
  expect(placeRect('top-center', screen, pill)).toEqual({ x: 700, y: 0, w: 200, h: 32 });
  expect(placeRect('bottom-right', screen, pill)).toEqual({ x: 1600 - 200 - PLACE_MARGIN, y: 868, w: 200, h: 32 });
  // An island wider than the screen never goes off it.
  expect(placeRect('top-right', { width: 800, height: 600 }, { width: 860, height: 470 })).toMatchObject({ x: 0, y: 0 });
  expect(placeRect('bottom-left', { width: 870, height: 400 }, { width: 860, height: 470 })).toMatchObject({ x: 10, y: 0 });
});

test('a dragged island lands on the nearest place', () => {
  expect(nearestPlace({ x: 800, y: 16 }, screen, pill)).toBe('top-center');
  expect(nearestPlace({ x: 120, y: 300 }, screen, pill)).toBe('top-left');
  expect(nearestPlace({ x: 120, y: 600 }, screen, pill)).toBe('bottom-left');
  expect(nearestPlace({ x: 1590, y: 890 }, screen, pill)).toBe('bottom-right');
  expect(nearestPlace({ x: 1050, y: 800 }, screen, pill)).toBe('bottom-center');
  expect(nearestPlace({ x: 1300, y: 100 }, screen, pill)).toBe('top-right');
  // Off the screen, it still lands on one.
  expect(nearestPlace({ x: -400, y: 2000 }, screen, pill)).toBe('bottom-left');
});

test('carried to another screen, the island lands on that screen\'s places', () => {
  // The window spans the other screen's work area: a 1366 × 728 laptop, a 2560 × 1392 screen.
  const laptop = { width: 1366, height: 728 };
  expect(nearestPlace({ x: 1250, y: 700 }, laptop, pill)).toBe('bottom-right');
  expect(nearestPlace({ x: 683, y: 20 }, laptop, pill)).toBe('top-center');
  const wide = { width: 2560, height: 1392 };
  expect(nearestPlace({ x: 500, y: 300 }, wide, pill)).toBe('top-left');
  expect(nearestPlace({ x: 1800, y: 1300 }, wide, pill)).toBe('bottom-center');
});

test('a drag saves its place, and its screen only when it ended on another one', () => {
  expect(landPatch('bottom-right', 'DISPLAY1', 'DISPLAY1')).toEqual({ islandPlace: 'bottom-right' });
  expect(landPatch('top-left', 'DISPLAY1', 'DISPLAY2')).toEqual({ islandPlace: 'top-left', monitor: 'DISPLAY2' });
  // The shell said nothing (the demo, or a release before it answered): the screen stays as it was, the primary one included.
  expect(landPatch('top-center', null, null)).toEqual({ islandPlace: 'top-center' });
  expect(landPatch('top-center', 'DISPLAY1', null)).toEqual({ islandPlace: 'top-center' });
  expect(landPatch('bottom-left', null, 'DISPLAY2')).toEqual({ islandPlace: 'bottom-left', monitor: 'DISPLAY2' });
});
