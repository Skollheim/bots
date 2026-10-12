/*
 * The apps tab's pure part: the search, which forgives accents and case,
 * and the order: pinned apps first, in the order they were pinned.
 */
import type { App } from './native';

/** Lowercase, without accents, for comparing. */
export function fold(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();
}

/** The initials of a name's words: "Visual Studio Code" → "vsc". */
const initials = (folded: string): string => folded.split(/[^a-z0-9]+/).filter(Boolean).map((word) => word[0]).join('');

/**
 * How well `name` answers `query`, lower is better; null when it does not:
 * 0 the name starts with it, 1 a word does, 2 the initials do, 3 it is inside.
 */
export function rank(name: string, query: string): number | null {
  const needle = fold(query);
  if (!needle) return 0;
  const hay = fold(name);
  if (hay.startsWith(needle)) return 0;
  if (hay.split(/[^a-z0-9]+/).some((word) => word.startsWith(needle))) return 1;
  if (!needle.includes(' ') && initials(hay).startsWith(needle)) return 2;
  if (hay.includes(needle)) return 3;
  return null;
}

export interface Shown { pinned: App[]; others: App[] }

/**
 * The apps to show for `query`. Without a query: the pins in their order,
 * then the rest by name. With one: the pinned matches first, then the
 * others, each by rank then name.
 */
export function showApps(apps: readonly App[], pinned: readonly string[], query: string): Shown {
  const byId = new Map(apps.map((app) => [app.id, app]));
  const pins = pinned.map((id) => byId.get(id)).filter((app): app is App => app !== undefined);
  const pinSet = new Set(pins.map((app) => app.id));
  const rest = apps.filter((app) => !pinSet.has(app.id));
  if (!fold(query)) return { pinned: pins, others: [...rest].sort((a, b) => a.name.localeCompare(b.name)) };
  const matching = (list: App[]) =>
    list
      .map((app) => ({ app, score: rank(app.name, query) }))
      .filter((row): row is { app: App; score: number } => row.score !== null)
      .sort((a, b) => a.score - b.score || a.app.name.localeCompare(b.app.name))
      .map((row) => row.app);
  return { pinned: matching(pins), others: matching(rest) };
}

/** The app Enter launches: the first one shown. */
export const firstShown = (shown: Shown): App | null => shown.pinned[0] ?? shown.others[0] ?? null;
