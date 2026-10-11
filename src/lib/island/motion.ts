/*
 * The island's motion: how a drop (the timer, the music) is born from the
 * island's edge and taken back, and how its content comes in and goes out as
 * it changes size.
 *
 * A drop starts tucked under the island, stretches out on a black neck that
 * hangs from the top of the screen, the neck thins and snaps, and the drop
 * settles with a small spring. The neck is drawn by a layer the goo filter
 * melts together (`Island.svelte`); that layer and its filter live only while
 * the drop moves. Leaving plays the same frames backwards.
 *
 * The functions here are Svelte transitions: their frames are written once as
 * CSS keyframes, so nothing runs on the main thread between two frames.
 */
import type { TransitionConfig } from 'svelte/transition';

/** The drop's timings and shape, in milliseconds and CSS pixels. */
export const DRIP = {
  inMs: 460,
  outMs: 340,
  /** How far past its place the drop goes before it springs back. */
  overshoot: 7,
  /** The share of the way at which it is out, the neck gone. */
  outAt: 0.55,
  /** The neck holds whole until this share, and is gone at the next. */
  neckFrom: 0.15,
  neckTo: 0.5,
  /** The goo layer shows until this share: the neck is gone before. */
  gooTo: 0.6,
  /** The gap between the island and a drop at rest. */
  gap: 8,
  /** The drop's height, which its neck starts as deep as. */
  height: 32,
  /** How much smaller it starts, and how much it stretches along the neck. */
  shrink: 0.2,
  stretch: 0.06
} as const;

/** How far the goo layer reaches past the drop, under the island (`Island.svelte`'s `.goo`). */
export const GOO_REACH = 48;
/** The goo filter's id, defined once in `Island.svelte`. */
export const GOO_FILTER = 'bots-island-goo';

export interface DripFrame {
  /** Away from the island, past the drop's place at rest (negative: under the island). */
  x: number;
  sx: number;
  sy: number;
  /** How deep the neck hangs from the top of the screen. */
  neck: number;
  /** The goo layer shows. */
  goo: boolean;
}

const clamp01 = (value: number) => Math.max(0, Math.min(1, value));
const easeOut = (value: number) => 1 - (1 - value) ** 3;
const round = (value: number, digits: number) => Number(value.toFixed(digits));

/** Where a drop `width` wide is at `t` (0, tucked under the island, to 1, at rest). */
export function dripAt(t: number, width: number): DripFrame {
  const at = clamp01(t);
  // Tucked: its far edge at the island's edge, a fifth smaller.
  const start = -(width * (1 - DRIP.shrink) + DRIP.gap);
  let x: number;
  if (at < DRIP.outAt) {
    x = start + (DRIP.overshoot - start) * easeOut(at / DRIP.outAt);
  } else {
    // The spring back: a small dip towards the island, damped to rest.
    const u = (at - DRIP.outAt) / (1 - DRIP.outAt);
    const wave = Math.cos(1.5 * Math.PI * u) * (1 - u * u);
    x = DRIP.overshoot * (wave >= 0 ? wave : wave * 0.5);
  }
  const scale = 1 - DRIP.shrink * (1 - easeOut(clamp01(at / DRIP.outAt)));
  // Pulled long while the neck holds it, round again once free.
  const pull = Math.sin(Math.PI * clamp01(at / 0.7)) * DRIP.stretch;
  const thin = clamp01((at - DRIP.neckFrom) / (DRIP.neckTo - DRIP.neckFrom));
  return {
    x: at === 1 ? 0 : round(x, 2),
    sx: at === 1 ? 1 : round(scale * (1 + pull), 4),
    sy: at === 1 ? 1 : round(scale * (1 - pull), 4),
    neck: round(DRIP.height * (1 - thin * thin), 2),
    goo: at < DRIP.gooTo
  };
}

export interface DripParams {
  /** The island's side the drop hangs on. */
  side: 'left' | 'right';
  reduced: boolean;
}

const dripTiming = (reduced: boolean, ms: number): Pick<TransitionConfig, 'duration'> => ({ duration: reduced ? 180 : ms });

/** The drop itself: out from under the island, then the spring. Reduced motion: a fade. */
export function dripBody(node: HTMLElement, { side, reduced }: DripParams, { direction }: { direction: 'in' | 'out' | 'both' }): TransitionConfig {
  const timing = dripTiming(reduced, direction === 'out' ? DRIP.outMs : DRIP.inMs);
  if (reduced) return { ...timing, css: (t) => `opacity: ${t}` };
  const width = node.offsetWidth;
  const sign = side === 'left' ? -1 : 1;
  return {
    ...timing,
    css: (t) => {
      const frame = dripAt(t, width);
      return `transform: translateX(${sign * frame.x}px) scale(${frame.sx}, ${frame.sy})`;
    }
  };
}

/** The goo layer under the drop: the drop's black twin and the neck, melted by the filter while they move. */
export function dripGoo(node: HTMLElement, { reduced }: DripParams, { direction }: { direction: 'in' | 'out' | 'both' }): TransitionConfig {
  const timing = dripTiming(reduced, direction === 'out' ? DRIP.outMs : DRIP.inMs);
  if (reduced) return { duration: 0 };
  // The layer reaches under the island by `GOO_REACH` past the drop.
  const width = Math.max(0, node.offsetWidth - GOO_REACH);
  return {
    ...timing,
    css: (t) => {
      const frame = dripAt(t, width);
      const look = frame.goo ? `visibility: visible; filter: url(#${GOO_FILTER})` : 'visibility: hidden; filter: none';
      return `--x: ${frame.x}; --sx: ${frame.sx}; --sy: ${frame.sy}; --neck: ${frame.neck}; ${look}`;
    }
  };
}

export interface BloomParams {
  reduced: boolean;
}

/** Content coming in as the island changes size: from a light blur and a small zoom to sharp, in step with the spring. */
export function bloom(_node: Element, { reduced }: BloomParams): TransitionConfig {
  if (reduced) return { duration: 160, css: (t) => `opacity: ${t}` };
  return {
    duration: 340,
    easing: easeOut,
    css: (t, u) => `opacity: ${round(Math.min(1, t * 1.6), 3)}; filter: blur(${round(u * 6, 2)}px); transform: scale(${round(0.96 + 0.04 * t, 4)})`
  };
}

/** Content going out as the island changes size: a fast blur away. */
export function blurAway(_node: Element, { reduced }: BloomParams): TransitionConfig {
  if (reduced) return { duration: 100, css: (t) => `opacity: ${t}` };
  return { duration: 140, css: (t, u) => `opacity: ${round(t, 3)}; filter: blur(${round(u * 4, 2)}px)` };
}
