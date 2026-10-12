import { describe, expect, it } from 'vitest';
import { DEFAULT_WINDOWS_PREFS, PINNED_MAX, parseWindowsPrefs, readWindowsPrefs, subscribeWindowsPrefs, togglePin, WINDOWS_STORAGE_KEY, writeWindowsPrefs } from './prefs';

describe('windows prefs', () => {
  it('reads anything as prefs, defaults for what is odd', () => {
    expect(parseWindowsPrefs(null)).toEqual(DEFAULT_WINDOWS_PREFS);
    expect(parseWindowsPrefs('nope')).toEqual(DEFAULT_WINDOWS_PREFS);
    expect(
      parseWindowsPrefs({ pinned: ['a', 3, '', 'a', 'b'], wallpaperFolder: '  ', wallpaperSource: 'cloud', engineMonitor: 1.5, clipboard: 'yes', processSort: 'disk' })
    ).toEqual({ ...DEFAULT_WINDOWS_PREFS, pinned: ['a', 'b'] });
    expect(parseWindowsPrefs({ wallpaperFolder: 'C:\\Pics', wallpaperSource: 'folder', engineMonitor: 1, clipboard: false, processSort: 'memory' })).toEqual({
      ...DEFAULT_WINDOWS_PREFS,
      wallpaperFolder: 'C:\\Pics',
      wallpaperSource: 'folder',
      engineMonitor: 1,
      clipboard: false,
      processSort: 'memory'
    });
    expect(parseWindowsPrefs({ engineMonitor: -1 }).engineMonitor).toBeNull();
    expect(parseWindowsPrefs({ engineMonitor: 16 }).engineMonitor).toBeNull();
  });

  it('keeps the clipboard history on by default', () => {
    expect(DEFAULT_WINDOWS_PREFS.clipboard).toBe(true);
    expect(parseWindowsPrefs({}).clipboard).toBe(true);
  });

  it('caps the pins', () => {
    const many = Array.from({ length: 40 }, (_, index) => `app${index}`);
    expect(parseWindowsPrefs({ pinned: many }).pinned).toHaveLength(PINNED_MAX);
  });

  it('pins last and unpins', () => {
    expect(togglePin(['a'], 'b')).toEqual(['a', 'b']);
    expect(togglePin(['a', 'b'], 'a')).toEqual(['b']);
  });

  it('stores, reads back and tells this page', () => {
    localStorage.removeItem(WINDOWS_STORAGE_KEY);
    const heard: boolean[] = [];
    const stop = subscribeWindowsPrefs((prefs) => heard.push(prefs.clipboard));
    writeWindowsPrefs({ clipboard: false });
    expect(readWindowsPrefs().clipboard).toBe(false);
    stop();
    writeWindowsPrefs({ clipboard: true });
    expect(heard).toEqual([false]);
    localStorage.setItem(WINDOWS_STORAGE_KEY, '{broken');
    expect(readWindowsPrefs()).toEqual(DEFAULT_WINDOWS_PREFS);
    localStorage.removeItem(WINDOWS_STORAGE_KEY);
  });
});
