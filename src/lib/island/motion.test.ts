import { expect, test } from 'vitest';
import { blurAway, bloom, DRIP, dripAt, dripBody, dripGoo, GOO_FILTER, GOO_REACH, ROLL_MS, rollIn, rollOut } from './motion';

const steps = (count: number) => Array.from({ length: count + 1 }, (_, index) => index / count);

test('a drop starts tucked under the island, its far edge at the island edge', () => {
  for (const width of [40, 68, 120]) {
    const frame = dripAt(0, width);
    expect(frame.x + frame.sx * width).toBeCloseTo(-DRIP.gap, 1);
    expect(frame.neck).toBe(DRIP.height);
    expect(frame.goo).toBe(true);
  }
});

test('a drop ends exactly at rest, with nothing left of the neck or the goo', () => {
  expect(dripAt(1, 68)).toEqual({ x: 0, sx: 1, sy: 1, neck: 0, goo: false });
});

test('the drop goes a little past its place, then settles with a small dip', () => {
  const xs = steps(100).map((t) => dripAt(t, 68).x);
  expect(Math.max(...xs)).toBeLessThanOrEqual(DRIP.overshoot);
  expect(Math.max(...xs)).toBeGreaterThan(DRIP.overshoot - 0.5);
  const after = steps(100)
    .filter((t) => t > DRIP.outAt)
    .map((t) => dripAt(t, 68).x);
  expect(Math.min(...after)).toBeLessThan(0);
  expect(Math.min(...after)).toBeGreaterThan(-DRIP.overshoot / 2);
});

test('the neck thins, then is gone before the goo layer hides', () => {
  const necks = steps(100).map((t) => dripAt(t, 68).neck);
  for (let index = 1; index < necks.length; index += 1) expect(necks[index]!).toBeLessThanOrEqual(necks[index - 1]!);
  expect(dripAt(DRIP.neckTo, 68).neck).toBe(0);
  expect(DRIP.neckTo).toBeLessThan(DRIP.gooTo);
  expect(dripAt(DRIP.gooTo, 68).goo).toBe(false);
});

test('out of range shares are held to the ends', () => {
  expect(dripAt(-1, 68)).toEqual(dripAt(0, 68));
  expect(dripAt(2, 68)).toEqual(dripAt(1, 68));
});

const node = (width: number) => ({ offsetWidth: width }) as HTMLElement;

test('the drop mirrors on the left, and only fades with reduced motion', () => {
  const right = dripBody(node(68), { side: 'right', reduced: false }, { direction: 'in' });
  const left = dripBody(node(68), { side: 'left', reduced: false }, { direction: 'in' });
  expect(right.duration).toBe(DRIP.inMs);
  expect(right.css!(0.5, 0.5)).toContain(`translateX(${dripAt(0.5, 68).x}px)`);
  expect(left.css!(0.5, 0.5)).toContain(`translateX(${-dripAt(0.5, 68).x}px)`);
  expect(dripBody(node(68), { side: 'right', reduced: false }, { direction: 'out' }).duration).toBe(DRIP.outMs);
  const reduced = dripBody(node(68), { side: 'right', reduced: true }, { direction: 'in' });
  expect(reduced.css!(0.3, 0.7)).toBe('opacity: 0.3');
});

test('the goo layer measures the drop without its reach under the island', () => {
  const goo = dripGoo(node(68 + GOO_REACH), { side: 'right', reduced: false }, { direction: 'in' });
  const frame = dripAt(0.2, 68);
  expect(goo.css!(0.2, 0.8)).toBe(`--x: ${frame.x}; --sx: ${frame.sx}; --sy: ${frame.sy}; --neck: ${frame.neck}; visibility: visible; filter: url(#${GOO_FILTER})`);
  expect(goo.css!(1, 0)).toContain('visibility: hidden; filter: none');
  expect(dripGoo(node(100), { side: 'right', reduced: true }, { direction: 'in' }).css).toBeUndefined();
});

test('content blooms in to sharp, and blurs away fast', () => {
  const into = bloom(node(0), { reduced: false });
  expect(into.css!(1, 0)).toBe('opacity: 1; filter: blur(0px); transform: scale(1)');
  expect(into.css!(0, 1)).toBe('opacity: 0; filter: blur(6px); transform: scale(0.96)');
  const away = blurAway(node(0), { reduced: false });
  expect(away.duration).toBeLessThan(into.duration!);
  expect(bloom(node(0), { reduced: true }).css!(0.5, 0.5)).toBe('opacity: 0.5');
});

test('a changed line rolls in from below and the old one up and out, transform and opacity only', () => {
  const line = (siblings: boolean) => ({ previousElementSibling: siblings ? {} : null, nextElementSibling: null }) as unknown as Element;
  const coming = rollIn(line(true), { reduced: false });
  const going = rollOut(line(true), { reduced: false });
  expect(coming.duration).toBe(ROLL_MS);
  expect(coming.css!(0, 1)).toBe('opacity: 0; transform: translateY(100%)');
  expect(coming.css!(1, 0)).toBe('opacity: 1; transform: translateY(0%)');
  expect(going.css!(0, 1)).toBe('opacity: 0; transform: translateY(-100%)');
  // The springy ease clicks a little past the mark before it settles.
  const eased = Array.from({ length: 21 }, (_, index) => coming.easing!(index / 20));
  expect(Math.max(...eased)).toBeGreaterThan(1);
  expect(eased.at(-1)).toBeCloseTo(1, 6);
});

test('turned back, the lines roll the other way: the new one from above, the old one down', () => {
  const line = { previousElementSibling: {}, nextElementSibling: null } as unknown as Element;
  expect(rollIn(line, { reduced: false, back: true }).css!(0, 1)).toBe('opacity: 0; transform: translateY(-100%)');
  expect(rollOut(line, { reduced: false, back: true }).css!(0, 1)).toBe('opacity: 0; transform: translateY(100%)');
});

test('the first line does not roll, and reduced motion crossfades', () => {
  const alone = { previousElementSibling: null, nextElementSibling: null } as unknown as Element;
  expect(rollIn(alone, { reduced: false }).duration).toBe(0);
  const beside = { previousElementSibling: {}, nextElementSibling: null } as unknown as Element;
  expect(rollIn(beside, { reduced: true }).css!(0.5, 0.5)).toBe('opacity: 0.5');
  expect(rollOut(beside, { reduced: true }).css!(0.5, 0.5)).toBe('opacity: 0.5');
});