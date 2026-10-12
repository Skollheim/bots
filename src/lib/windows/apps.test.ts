import { describe, expect, it } from 'vitest';
import { firstShown, fold, rank, showApps } from './apps';

const app = (name: string) => ({ id: `C:\\Start\\${name}.lnk`, name });
const APPS = [app('Visual Studio Code'), app('Écran de veille'), app('Steam'), app('Spotify'), app('Notepad++'), app('Paint')];

describe('apps search', () => {
  it('folds accents and case', () => {
    expect(fold('  Écran ')).toBe('ecran');
  });

  it('ranks the start, a word, the initials, then inside', () => {
    expect(rank('Steam', 'st')).toBe(0);
    expect(rank('Visual Studio Code', 'stu')).toBe(1);
    expect(rank('Visual Studio Code', 'vsc')).toBe(2);
    expect(rank('Notepad++', 'pad')).toBe(3);
    expect(rank('Paint', 'zz')).toBeNull();
    expect(rank('Écran de veille', 'ecran')).toBe(0);
    expect(rank('Paint', '')).toBe(0);
  });

  it('puts the pins first, in their order, then the rest by name', () => {
    const shown = showApps(APPS, [app('Steam').id, app('Paint').id, 'C:\\gone.lnk'], '');
    expect(shown.pinned.map((one) => one.name)).toEqual(['Steam', 'Paint']);
    expect(shown.others.map((one) => one.name)).toEqual(['Écran de veille', 'Notepad++', 'Spotify', 'Visual Studio Code']);
  });

  it('searches the pins first, then the others by rank', () => {
    const shown = showApps(APPS, [app('Paint').id], 'p');
    expect(shown.pinned.map((one) => one.name)).toEqual(['Paint']);
    expect(shown.others.map((one) => one.name)).toEqual(['Notepad++', 'Spotify']);
    expect(showApps(APPS, [], 'sp').others.map((one) => one.name)).toEqual(['Spotify']);
    expect(firstShown(shown)?.name).toBe('Paint');
    expect(firstShown(showApps(APPS, [], 'nothing'))).toBeNull();
  });
});
