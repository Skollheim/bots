import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchLyrics, lineAt, lyricsKey, MATCH_TOLERANCE_MS, nextChangeAt, parseLrc, pickSynced, searchTitle, searchUrl } from './music-lyrics';
import { Music } from './music.svelte';

describe('parseLrc', () => {
  it('reads the stamps, skips the tags, and starts with a break until the first line', () => {
    const lines = parseLrc('[ar:Neon Tides]\n[ti:Midnight Circuit]\n[length: 03:33]\n[00:12.34] First line\n[00:15.5]Second line\nno stamp here\n[01:02.345] Third');
    expect(lines).toEqual([
      { at: 0, text: '' },
      { at: 12_340, text: 'First line' },
      { at: 15_500, text: 'Second line' },
      { at: 62_345, text: 'Third' }
    ]);
  });

  it('gives a line with several stamps once per stamp, in time order', () => {
    expect(parseLrc('[00:10.00][00:30.00]Chorus\n[00:20.00]Verse')).toEqual([
      { at: 0, text: '' },
      { at: 10_000, text: 'Chorus' },
      { at: 20_000, text: 'Verse' },
      { at: 30_000, text: 'Chorus' }
    ]);
  });

  it('moves every line by the offset, a positive one sooner', () => {
    expect(parseLrc('[offset:+500]\n[00:10.00]A\n[00:00.20]B').map((line) => line.at)).toEqual([0, 9_500]);
    expect(parseLrc('[offset:-250]\n[00:10.00]A')[1]).toEqual({ at: 10_250, text: 'A' });
  });

  it('keeps the breaks of blank stamps, one for several in a row, and drops blank lines without a stamp', () => {
    const lines = parseLrc('[00:05.00]Sing\n\n[00:09.00]\n[00:11.00]  \n[00:20.00]Again\n[00:30.00]');
    expect(lines).toEqual([
      { at: 0, text: '' },
      { at: 5_000, text: 'Sing' },
      { at: 9_000, text: '' },
      { at: 20_000, text: 'Again' },
      { at: 30_000, text: '' }
    ]);
  });

  it('starts at the first break when the lyrics open with one', () => {
    expect(parseLrc('[00:03.00]\n[00:08.00]Hello')).toEqual([
      { at: 0, text: '' },
      { at: 8_000, text: 'Hello' }
    ]);
  });

  it('joins the lines of the same time, strips word stamps and spaces, and reads CRLF', () => {
    expect(parseLrc('[00:04.00]One\r\n[00:04.00]Uno\r\n[00:06.00] <00:06.00>Two  <00:06.50>words ')).toEqual([
      { at: 0, text: '' },
      { at: 4_000, text: 'One / Uno' },
      { at: 6_000, text: 'Two words' }
    ]);
  });

  it('gives nothing for text without words or stamps', () => {
    expect(parseLrc('')).toEqual([]);
    expect(parseLrc('[ar:Someone]\n[00:10.00]\n[00:20.00]')).toEqual([]);
    expect(parseLrc('Just plain lyrics\nwith no time')).toEqual([]);
    expect(parseLrc('[00:75.00]Bad seconds')).toEqual([]);
  });
});

describe('lineAt and nextChangeAt', () => {
  const lines = parseLrc('[00:10.00]A\n[00:20.00]B\n[00:30.00]C');

  it('finds the line started last', () => {
    expect(lineAt(lines, 0)).toBe(0);
    expect(lineAt(lines, 9_999)).toBe(0);
    expect(lineAt(lines, 10_000)).toBe(1);
    expect(lineAt(lines, 25_000)).toBe(2);
    expect(lineAt(lines, 99_000)).toBe(3);
    expect(lineAt(lines, -5)).toBe(-1);
    expect(lineAt([], 1000)).toBe(-1);
  });

  it('tells when the next line starts, null after the last', () => {
    expect(nextChangeAt(lines, 0)).toBe(10_000);
    expect(nextChangeAt(lines, 10_000)).toBe(20_000);
    expect(nextChangeAt(lines, 29_999)).toBe(30_000);
    expect(nextChangeAt(lines, 30_000)).toBeNull();
    expect(nextChangeAt([], 0)).toBeNull();
  });
});

describe('pickSynced', () => {
  const result = (duration: number | null, syncedLyrics: string | null) => ({ trackName: 'T', artistName: 'A', duration, syncedLyrics, plainLyrics: 'x' });

  it('takes the synced lyrics of the closest length', () => {
    const results = [result(248, '[00:01.00]radio'), result(370, '[00:01.00]album'), result(369, null), result(32, '[00:01.00]snippet')];
    expect(pickSynced(results, 368_500)).toBe('[00:01.00]album');
    expect(pickSynced(results, 247_000)).toBe('[00:01.00]radio');
  });

  it('rejects a length too far off, results without synced lyrics or length, and a wrong answer', () => {
    expect(pickSynced([result(200, '[00:01.00]x')], 200_000 + MATCH_TOLERANCE_MS + 1)).toBeNull();
    expect(pickSynced([result(200, '  '), result(null, '[00:01.00]x')], 200_000)).toBeNull();
    expect(pickSynced({ error: 'nope' }, 200_000)).toBeNull();
    expect(pickSynced([null, 3, 'x'], 200_000)).toBeNull();
    expect(pickSynced([result(200, '[00:01.00]x')], 0)).toBeNull();
  });
});

describe('the request', () => {
  it('keys a track by its artist and title', () => {
    expect(lyricsKey({ title: 'T', artist: 'A' })).toBe('A\nT');
  });

  it('cleans what players add to a title', () => {
    expect(searchTitle('Bohemian Rhapsody - Remastered 2011')).toBe('Bohemian Rhapsody');
    expect(searchTitle('Get Lucky (feat. Pharrell Williams) - Radio Edit')).toBe('Get Lucky');
    expect(searchTitle('Song [with Someone]')).toBe('Song');
    expect(searchTitle('Song (2015 Remaster)')).toBe('Song');
    expect(searchTitle('Love - Live')).toBe('Love - Live');
    expect(searchTitle('Anti-Hero')).toBe('Anti-Hero');
    expect(searchTitle('(feat. X)')).toBe('(feat. X)');
  });

  it('sends only the title and the artist to LRCLIB', () => {
    const url = new URL(searchUrl({ title: 'Get Lucky - Radio Edit', artist: ' Daft Punk, Pharrell Williams ' }));
    expect(url.origin + url.pathname).toBe('https://lrclib.net/api/search');
    expect([...url.searchParams.keys()]).toEqual(['track_name', 'artist_name']);
    expect(url.searchParams.get('track_name')).toBe('Get Lucky');
    expect(url.searchParams.get('artist_name')).toBe('Daft Punk, Pharrell Williams');
  });
});

describe('fetchLyrics', () => {
  const track = { title: 'Midnight Circuit', artist: 'Neon Tides', duration: 213_000 };
  const answer = (body: unknown, ok = true) => vi.fn(async () => ({ ok, json: async () => body }) as Response);

  it('asks once, without cookie or referrer, and gives the matching lines', async () => {
    const fetcher = answer([{ duration: 213, syncedLyrics: '[00:01.00]Hello' }]);
    expect(await fetchLyrics(track, fetcher)).toEqual([
      { at: 0, text: '' },
      { at: 1_000, text: 'Hello' }
    ]);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://lrclib.net/api/search?track_name=Midnight+Circuit&artist_name=Neon+Tides');
    expect(init).toMatchObject({ credentials: 'omit', referrerPolicy: 'no-referrer' });
    expect(init.headers).toBeUndefined();
  });

  it('gives null for no match, a refused answer, an error, or a timeout', async () => {
    expect(await fetchLyrics(track, answer([{ duration: 100, syncedLyrics: '[00:01.00]x' }]))).toBeNull();
    expect(await fetchLyrics(track, answer([], false))).toBeNull();
    expect(await fetchLyrics(track, vi.fn(async () => Promise.reject(new TypeError('offline'))))).toBeNull();
    const hanging = vi.fn(
      (_url: string, init: RequestInit) =>
        new Promise<Response>((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new DOMException('aborted', 'AbortError'))))
    );
    expect(await fetchLyrics(track, hanging, 10)).toBeNull();
  });
});

describe('Music.wantLyrics', () => {
  const track = { title: 'Midnight Circuit', artist: 'Neon Tides', duration: 213_000 };
  const settle = () => new Promise((resolve) => setTimeout(resolve, 0));
  afterEach(() => vi.unstubAllGlobals());

  it('asks LRCLIB once per track, keeps "none" too, and asks nothing for no track', async () => {
    const fetcher = vi.fn(async () => ({ ok: true, json: async () => [] }) as unknown as Response);
    vi.stubGlobal('fetch', fetcher);
    const music = new Music();
    music.wantLyrics(null);
    expect(fetcher).not.toHaveBeenCalled();
    music.wantLyrics(track);
    expect(music.lyrics).toEqual({ key: 'Neon Tides\nMidnight Circuit', lines: undefined });
    await settle();
    expect(music.lyrics).toEqual({ key: 'Neon Tides\nMidnight Circuit', lines: null });
    music.wantLyrics(null);
    expect(music.lyrics).toBeNull();
    music.wantLyrics(track);
    music.wantLyrics({ ...track, title: 'Glass Harbor' });
    music.wantLyrics(track);
    await settle();
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(music.lyrics?.lines).toBeNull();
  });

  it('shows only the answer for the track still wanted', async () => {
    let answer: (value: Response) => void = () => {};
    vi.stubGlobal('fetch', vi.fn(() => new Promise<Response>((resolve) => (answer = resolve))));
    const music = new Music();
    music.wantLyrics(track);
    music.wantLyrics(null);
    answer({ ok: true, json: async () => [{ duration: 213, syncedLyrics: '[00:01.00]Hi' }] } as unknown as Response);
    await settle();
    expect(music.lyrics).toBeNull();
    music.wantLyrics(track);
    await settle();
    expect(music.lyrics?.lines).toEqual([
      { at: 0, text: '' },
      { at: 1_000, text: 'Hi' }
    ]);
  });

  it('reads a demo track from its posed words, never online', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    const music = new Music();
    music.demo = true;
    music.demoLyrics = { 'Neon Tides\nMidnight Circuit': '[00:02.00]Static' };
    music.wantLyrics(track);
    await settle();
    expect(music.lyrics?.lines).toEqual([
      { at: 0, text: '' },
      { at: 2_000, text: 'Static' }
    ]);
    music.wantLyrics({ ...track, title: 'Other' });
    await settle();
    expect(music.lyrics?.lines).toBeNull();
    expect(fetcher).not.toHaveBeenCalled();
  });
});