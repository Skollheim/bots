/*
 * The music player's synced lyrics, pure so they are tested without a network:
 * the LRC text LRCLIB (https://lrclib.net) gives, read into timed lines; the
 * line at a position and when the next one comes; the one search LRCLIB is
 * asked, with the track's title and artist and nothing else; and the result
 * whose length matches the track's.
 */

/** A line of the lyrics: from `at` milliseconds into the track; an empty text is an instrumental break. */
export interface LyricLine {
  at: number;
  text: string;
}

/** What tells one track's lyrics from another's: the artist and the title, as the player tells them. */
export function lyricsKey(track: { title: string; artist: string }): string {
  return `${track.artist}\n${track.title}`;
}

const TAG = /^\[([^\]]*)\]/;
const STAMP = /^(\d{1,3}):(\d{1,2})(?:[.:](\d{1,3}))?$/;
const OFFSET = /^offset:\s*([+-]?\d+)\s*$/i;
/** Word stamps of enhanced LRC, inside a line: `<00:12.34>`. */
const WORD_STAMP = /<\d{1,3}:\d{1,2}(?:[.:]\d{1,3})?>/g;

function stampOf(tag: string): number | null {
  const match = STAMP.exec(tag.trim());
  if (!match) return null;
  const [, minutes, seconds, fraction] = match;
  if (Number(seconds) >= 60) return null;
  const part = fraction ? Math.round(Number(`0.${fraction}`) * 1000) : 0;
  return Number(minutes) * 60_000 + Number(seconds) * 1000 + part;
}

/**
 * The lines of an LRC text, in time order. A line may carry several stamps
 * (a chorus sung twice); `[offset:±ms]` moves them all (a positive offset
 * shows them sooner); the other tags (`[ar:]`, `[ti:]`…) and the lines
 * without a stamp are left out. Lines at the same time join with " / ";
 * breaks in a row count as one; a break starts the track until the first
 * line. No line with words: no lyrics, an empty list.
 */
export function parseLrc(source: string): LyricLine[] {
  let offset = 0;
  const found: LyricLine[] = [];
  for (const raw of source.split(/\r?\n/)) {
    let rest = raw.trim();
    const stamps: number[] = [];
    for (let match = TAG.exec(rest); match; match = TAG.exec(rest)) {
      const tag = match[1]!;
      const at = stampOf(tag);
      if (at !== null) stamps.push(at);
      else {
        const shift = OFFSET.exec(tag);
        if (shift) offset = Number(shift[1]);
      }
      rest = rest.slice(match[0].length).trimStart();
    }
    const text = rest.replace(WORD_STAMP, '').replace(/\s+/g, ' ').trim();
    for (const at of stamps) found.push({ at, text });
  }
  if (!found.some((line) => line.text !== '')) return [];
  const sorted = found.map((line) => ({ ...line, at: Math.max(0, line.at - offset) })).sort((a, b) => a.at - b.at);
  const lines: LyricLine[] = [];
  for (const line of sorted) {
    const last = lines[lines.length - 1];
    if (last && last.at === line.at) {
      last.text = [last.text, line.text].filter(Boolean).join(' / ');
    } else if (!(last && last.text === '' && line.text === '')) {
      lines.push({ ...line });
    }
  }
  // A break merged into a line at the same time is no break any more: the breaks in a row merge again.
  const merged = lines.filter((line, index) => !(line.text === '' && lines[index - 1]?.text === ''));
  if (merged[0]!.text === '') merged[0]!.at = 0;
  else if (merged[0]!.at > 0) merged.unshift({ at: 0, text: '' });
  return merged;
}

/** The index of the line sung at `position`: the last one started; -1 before the first. */
export function lineAt(lines: readonly LyricLine[], position: number): number {
  let low = 0;
  let high = lines.length - 1;
  let found = -1;
  while (low <= high) {
    const middle = (low + high) >> 1;
    if (lines[middle]!.at <= position) {
      found = middle;
      low = middle + 1;
    } else high = middle - 1;
  }
  return found;
}

/** When the line after the one at `position` starts, in milliseconds into the track; null after the last. */
export function nextChangeAt(lines: readonly LyricLine[], position: number): number | null {
  return lines[lineAt(lines, position) + 1]?.at ?? null;
}

/** LRCLIB's search. */
export const LRCLIB_SEARCH = 'https://lrclib.net/api/search';
/** A result this far from the track's length is another version of it (a live take, an edit): its lines would not fit. */
export const MATCH_TOLERANCE_MS = 4000;
/** LRCLIB answers within this, or the lyrics are left out. */
export const LYRICS_TIMEOUT_MS = 6000;

/**
 * The title as LRCLIB knows it: without what players add after it, a
 * featured artist (`(feat. X)`, `[with X]`) or the edition (`- Remastered
 * 2011`, `- Radio Edit`, `- 2015 Version`).
 */
export function searchTitle(title: string): string {
  const plain = title
    .replace(/\s*[([](?:feat\.?|ft\.?|featuring|with)\s[^)\]]*[)\]]/gi, '')
    .replace(/\s*[([][^)\]]*\b(?:remaster(?:ed)?|version|edit|mono|stereo|deluxe|bonus track)\b[^)\]]*[)\]]/gi, '')
    .replace(/\s+-\s+[^-]*\b(?:remaster(?:ed)?|version|edit|mono|stereo|deluxe|bonus track)\b[^-]*$/i, '')
    .trim();
  return plain || title.trim();
}

/**
 * The one address LRCLIB is asked: the title and the artist, nothing else.
 * The artists go as the player lists them: LRCLIB finds "A, B" and "A & B",
 * where the first one alone finds other artists' tracks.
 */
export function searchUrl(track: { title: string; artist: string }): string {
  const query = new URLSearchParams({ track_name: searchTitle(track.title), artist_name: track.artist.trim() });
  return `${LRCLIB_SEARCH}?${query}`;
}

/**
 * The synced lyrics among LRCLIB's results for a track `duration`
 * milliseconds long: the result with synced lyrics whose length is closest,
 * none further than `MATCH_TOLERANCE_MS`. Null when none fits.
 */
export function pickSynced(results: unknown, duration: number): string | null {
  if (!Array.isArray(results) || !(duration > 0)) return null;
  let best: { lyrics: string; off: number } | null = null;
  for (const result of results as unknown[]) {
    if (!result || typeof result !== 'object') continue;
    const { syncedLyrics, duration: seconds } = result as Record<string, unknown>;
    if (typeof syncedLyrics !== 'string' || syncedLyrics.trim() === '' || typeof seconds !== 'number') continue;
    const off = Math.abs(seconds * 1000 - duration);
    if (off <= MATCH_TOLERANCE_MS && (!best || off < best.off)) best = { lyrics: syncedLyrics, off };
  }
  return best?.lyrics ?? null;
}

/** What the player knows of the track it asks lyrics for: the length is kept here, never sent. */
export interface LyricsTrack {
  title: string;
  artist: string;
  duration: number;
}

/** How the lyrics are asked: `fetch`, or a stand-in in the tests. */
export type LyricsFetcher = (url: string, init: RequestInit) => Promise<Response>;

/**
 * The track's synced lyrics from LRCLIB, or null: none found, no answer
 * within `LYRICS_TIMEOUT_MS`, or any error, all silent. The request carries
 * no cookie and no referrer.
 */
export async function fetchLyrics(track: LyricsTrack, fetcher: LyricsFetcher = (url, init) => fetch(url, init), timeout = LYRICS_TIMEOUT_MS): Promise<LyricLine[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetcher(searchUrl(track), { signal: controller.signal, credentials: 'omit', referrerPolicy: 'no-referrer' });
    if (!response.ok) return null;
    const synced = pickSynced(await response.json(), track.duration);
    const lines = synced ? parseLrc(synced) : [];
    return lines.length > 0 ? lines : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
