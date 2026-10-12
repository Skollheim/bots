import { describe, expect, it } from 'vitest';
import { ageOf, fileOfDataUrl, isLink, preview } from './clipboard';
import type { ClipEntry } from './native';

const text = (value: string): ClipEntry => ({ id: 1, kind: 'text', text: value, chars: value.length, width: 0, height: 0, thumb: null, at: 0 });

describe('clipboard entries', () => {
  it('previews a text on one line, cut', () => {
    expect(preview('  a\n\n b\tc  ')).toBe('a b c');
    expect(preview('abcdef', 4)).toBe('abc…');
    expect(preview('😀😀😀', 2)).toBe('😀…');
  });

  it('tells the age coarsely', () => {
    const now = 10 * 86_400_000;
    expect(ageOf(now - 20_000, now)).toEqual({ unit: 'now' });
    expect(ageOf(now - 5 * 60_000, now)).toEqual({ unit: 'minutes', count: 5 });
    expect(ageOf(now - 3 * 3_600_000, now)).toEqual({ unit: 'hours', count: 3 });
    expect(ageOf(now - 2 * 86_400_000, now)).toEqual({ unit: 'days', count: 2 });
    expect(ageOf(now + 5_000, now)).toEqual({ unit: 'now' });
  });

  it('spots links', () => {
    expect(isLink(text('https://example.com/a'))).toBe(true);
    expect(isLink(text('see https://example.com'))).toBe(false);
  });

  it('turns a data URL into a file', async () => {
    const file = fileOfDataUrl('data:image/png;base64,AAEC', 'clip.png');
    expect(file?.type).toBe('image/png');
    expect(file?.name).toBe('clip.png');
    expect([...new Uint8Array(await file!.arrayBuffer())]).toEqual([0, 1, 2]);
    expect(fileOfDataUrl('nope', 'x.png')).toBeNull();
  });
});
