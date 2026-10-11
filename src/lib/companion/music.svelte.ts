/*
 * The music bubble's live state, beside the media session the companion polls
 * (`companion.media`): the clock that moves the progress between two reads,
 * the meter's levels while a meter shows, and the cover's colour.
 */
import { canShow, readLevel, type MediaState } from './media';
import { accentOf, barOf, clockAfter, fallTo, heldClock, LEVEL_FLOOR, nextCeiling, positionAt, SEEK_HOLD_MS, seekTo, type MusicBase } from './music';

/** How often a meter reads the level while it shows: about 15 times a second. */
export const LEVEL_EVERY = 66;
/** The levels a meter keeps, newest first: half the widest meter, mirrored. */
export const LEVEL_HISTORY = 9;
/** The covers whose colour is kept. */
const ACCENTS_KEPT = 8;
/** Spotify was seen once on this computer: the bubble offers to open it when nothing plays. */
const SPOTIFY_KEY = 'bots.music.spotify';

const rest = () => Array<number>(LEVEL_HISTORY).fill(0);

export class Music {
  base = $state.raw<MusicBase | null>(null);
  /** Newest first, 0 to 1. */
  levels = $state.raw<number[]>(rest());
  /** The shell measures the level: without it the meter rests. */
  measured = $state(false);
  /** The cover's colour, light enough for the island's black; null without a cover or a colour. */
  accent = $state<string | null>(null);
  /** Spotify played here once: with nothing playing, the bubble still opens it. */
  knowsSpotify = $state(false);
  /** Demo poses: the levels are made up, the colour given. */
  demo = false;

  /** Until when a read that disagrees with a seek is taken for one sent before it. */
  private heldUntil = 0;
  private ceiling = LEVEL_FLOOR;
  private accents = new Map<string, string | null>();
  private reading: string | null = null;

  constructor() {
    try {
      this.knowsSpotify = localStorage.getItem(SPOTIFY_KEY) === '1';
    } catch {
      /* No storage: Spotify is offered once it played. */
    }
  }

  /** A read of the media session: the clock, the colour, and whether Spotify lives here. */
  sync(state: MediaState | null, now = Date.now()): void {
    const next = now < this.heldUntil ? heldClock(this.base, state, now) : clockAfter(this.base, state, now);
    if (next !== this.base) this.base = next;
    if (!this.demo) this.colour(state?.art ?? null);
    if (state && canShow(state.app) && !this.knowsSpotify) {
      this.knowsSpotify = true;
      try {
        localStorage.setItem(SPOTIFY_KEY, '1');
      } catch {
        /* Kept for this run only. */
      }
    }
  }

  position(now: number): number {
    return positionAt(this.base, now);
  }

  /** The clock goes `position` milliseconds into the track at once; the reads catch up with the player. */
  seek(position: number, now = Date.now()): void {
    if (!this.base) return;
    this.base = seekTo(this.base, position, now);
    this.heldUntil = now + SEEK_HOLD_MS;
  }

  /**
   * A meter shows for `app`'s player while it plays: the level is read about
   * 15 times a second, each read once the last one answered, until the stop
   * this returns. A shell that measures nothing ends the reads at once.
   */
  meter(app: string): () => void {
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      if (stopped) return;
      let peak: number | null;
      try {
        peak = this.demo ? demoPeak(performance.now()) : await readLevel(app);
      } catch {
        peak = null;
      }
      if (stopped) return;
      this.measured = peak !== null;
      if (peak === null) return;
      this.ceiling = nextCeiling(this.ceiling, peak);
      const shown = fallTo(this.levels[0] ?? 0, barOf(peak, this.ceiling));
      this.levels = [shown, ...this.levels.slice(0, LEVEL_HISTORY - 1)];
      timer = setTimeout(() => void tick(), LEVEL_EVERY);
    };
    void tick();
    return () => {
      stopped = true;
      clearTimeout(timer);
      this.levels = rest();
    };
  }

  private colour(art: string | null): void {
    if (!art) {
      this.reading = null;
      this.accent = null;
      return;
    }
    if (this.accents.has(art)) {
      this.reading = null;
      this.accent = this.accents.get(art) ?? null;
      return;
    }
    if (this.reading === art) return;
    this.reading = art;
    void readAccent(art)
      .catch(() => null)
      .then((accent) => {
        this.accents.set(art, accent);
        if (this.accents.size > ACCENTS_KEPT) this.accents.delete(this.accents.keys().next().value!);
        if (this.reading !== art) return;
        this.reading = null;
        this.accent = accent;
      });
  }
}

/** The cover drawn 16 pixels wide, and its most vivid colour. */
async function readAccent(src: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const image = new Image();
  image.src = src;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = 16;
  canvas.height = 16;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return null;
  context.drawImage(image, 0, 0, 16, 16);
  return accentOf(context.getImageData(0, 0, 16, 16).data);
}

/**
 * The open player's background: the cover blurred, darkened and a little more
 * vivid, drawn once into a small picture the bubble stretches. Blurred
 * this much, a third of the size loses nothing, and the bubble shows a plain
 * image: no filter runs while it shows. Null where the canvas cannot filter.
 */
export const BACKDROP = { width: 96, height: 40, filter: 'blur(9px) brightness(0.32) saturate(1.3)' };
const backdrops = new Map<string, Promise<string | null>>();

export function backdropOf(art: string): Promise<string | null> {
  const kept = backdrops.get(art);
  if (kept) return kept;
  const drawn = drawBackdrop(art).catch(() => null);
  backdrops.set(art, drawn);
  if (backdrops.size > ACCENTS_KEPT) backdrops.delete(backdrops.keys().next().value!);
  return drawn;
}

async function drawBackdrop(src: string): Promise<string | null> {
  if (typeof document === 'undefined') return null;
  const image = new Image();
  image.src = src;
  await image.decode();
  const { width, height, filter } = BACKDROP;
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context || typeof context.filter !== 'string') return null;
  context.filter = filter;
  // The cover overflows the picture on every side, so the blur finds no empty edge to fade into.
  const side = width + 60;
  context.drawImage(image, (width - side) / 2, (height - side) / 2, side, side);
  return canvas.toDataURL('image/png');
}

/** A level that sounds like music, for the demo poses. */
function demoPeak(now: number): number {
  const beat = Math.max(0, Math.sin(now / 115)) ** 3;
  return Math.min(1, 0.22 + 0.5 * beat + 0.18 * Math.abs(Math.sin(now / 41)));
}
