/*
 * Lists the companion keeps on this computer for one core at a time, in
 * `localStorage` beside its memory and reminders (`memory.ts`): the scheduled
 * missions (`missions.ts`) and the to-do list (`todo.ts`). Each key holds
 * `{ [core]: entry[] }`, the core named as `coreKey` (`island/followed.ts`)
 * names it, so another Boite on another host keeps its own. Entries are read
 * one by one: what does not parse is dropped, the rest kept.
 */

const listeners = new Map<string, Set<() => void>>();

function loadMap(key: string): Record<string, unknown> {
  try {
    const raw = window.localStorage.getItem(key);
    const value: unknown = raw === null ? null : JSON.parse(raw);
    return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

/** The entries kept for `core`, each read by `parse`; null drops it. */
export function readPerCore<T>(key: string, core: string, parse: (entry: unknown) => T | null): T[] {
  const list = loadMap(key)[core];
  if (!Array.isArray(list)) return [];
  return list.flatMap((entry) => {
    const parsed = parse(entry);
    return parsed === null ? [] : [parsed];
  });
}

/** Keeps `entries` for `core`, the other cores' lists untouched; an empty list lets the core go. */
export function writePerCore<T>(key: string, core: string, entries: readonly T[]): void {
  const map = loadMap(key);
  if (entries.length > 0) map[core] = entries;
  else delete map[core];
  try {
    window.localStorage.setItem(key, JSON.stringify(map));
  } catch {
    /* a refused storage still runs for this session */
  }
  for (const listener of listeners.get(key) ?? []) listener();
}

/** Runs on any change to `key`, from this page or the other window (Settings). */
export function subscribePerCore(key: string, listener: () => void): () => void {
  const fromOtherPage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener();
  };
  let own = listeners.get(key);
  if (!own) listeners.set(key, (own = new Set()));
  own.add(listener);
  window.addEventListener('storage', fromOtherPage);
  return () => {
    own.delete(listener);
    window.removeEventListener('storage', fromOtherPage);
  };
}

export const makeId = (now: number): string => `${now.toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

/** Single spaces, trimmed, cut to `max` characters. */
export const cleanText = (text: string, max: number): string => text.replace(/\s+/g, ' ').trim().slice(0, max);
