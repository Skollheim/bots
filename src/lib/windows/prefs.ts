/*
 * The computer tabs' own preferences, kept apart from the companion's
 * (`bots.prefs`) in `localStorage` under `bots.windows`: the apps pinned in
 * the apps tab, the wallpaper tab's folder, source and screen, the
 * clipboard history's switch (Settings) and the system tab's process order.
 * Every webview of the shell shares the origin, so Settings and the island
 * share them; a write from the other page arrives through `storage`.
 */

export type ProcessSort = 'cpu' | 'memory';
export type WallpaperSource = 'engine' | 'recent' | 'folder';

export interface WindowsPrefs {
  /** The apps' ids (their shortcut's path), in the order they were pinned. */
  pinned: string[];
  /** The folder "My folder" lists; null until the user picks one. */
  wallpaperFolder: string | null;
  /** The source the wallpaper tab shows; null: Wallpaper Engine when installed, else Recent. */
  wallpaperSource: WallpaperSource | null;
  /** The screen a Wallpaper Engine wallpaper goes to, from 0; null for every screen. */
  engineMonitor: number | null;
  /** The clipboard history: on by default. Off stops the listener and forgets the list. */
  clipboard: boolean;
  processSort: ProcessSort;
}

export const WINDOWS_STORAGE_KEY = 'bots.windows';
/** Pins kept at most. */
export const PINNED_MAX = 24;

export const DEFAULT_WINDOWS_PREFS: WindowsPrefs = {
  pinned: [],
  wallpaperFolder: null,
  wallpaperSource: null,
  engineMonitor: null,
  clipboard: true,
  processSort: 'cpu'
};

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** Whatever was stored, as prefs: a field that is missing or odd takes its default. */
export function parseWindowsPrefs(raw: unknown): WindowsPrefs {
  const source = isRecord(raw) ? raw : {};
  const pinned = Array.isArray(source.pinned) ? source.pinned.filter((id): id is string => typeof id === 'string' && id.length > 0) : [];
  const folder = source.wallpaperFolder;
  const wallpaperSource = source.wallpaperSource;
  const monitor = source.engineMonitor;
  return {
    pinned: [...new Set(pinned)].slice(0, PINNED_MAX),
    wallpaperFolder: typeof folder === 'string' && folder.trim() ? folder : null,
    wallpaperSource: wallpaperSource === 'engine' || wallpaperSource === 'recent' || wallpaperSource === 'folder' ? wallpaperSource : null,
    engineMonitor: typeof monitor === 'number' && Number.isInteger(monitor) && monitor >= 0 && monitor < 16 ? monitor : null,
    clipboard: typeof source.clipboard === 'boolean' ? source.clipboard : DEFAULT_WINDOWS_PREFS.clipboard,
    processSort: source.processSort === 'memory' ? 'memory' : 'cpu'
  };
}

export function readWindowsPrefs(): WindowsPrefs {
  try {
    const raw = window.localStorage.getItem(WINDOWS_STORAGE_KEY);
    return parseWindowsPrefs(raw === null ? null : JSON.parse(raw));
  } catch {
    return { ...DEFAULT_WINDOWS_PREFS };
  }
}

type Listener = (prefs: WindowsPrefs) => void;
const listeners = new Set<Listener>();

/** Merges `patch`, stores it and tells this page. */
export function writeWindowsPrefs(patch: Partial<WindowsPrefs>): WindowsPrefs {
  const next = parseWindowsPrefs({ ...readWindowsPrefs(), ...patch });
  try {
    window.localStorage.setItem(WINDOWS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* a refused storage still runs for this session */
  }
  for (const listener of listeners) listener(next);
  return next;
}

/** Runs on a write from this page or from another one. Returns the function that stops it. */
export function subscribeWindowsPrefs(listener: Listener): () => void {
  const fromOtherPage = (event: StorageEvent) => {
    if (event.key === WINDOWS_STORAGE_KEY) listener(readWindowsPrefs());
  };
  listeners.add(listener);
  window.addEventListener('storage', fromOtherPage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', fromOtherPage);
  };
}

/** The pins after pinning or unpinning `id`: a new pin goes last. */
export function togglePin(pinned: readonly string[], id: string): string[] {
  return pinned.includes(id) ? pinned.filter((known) => known !== id) : [...pinned, id].slice(-PINNED_MAX);
}
