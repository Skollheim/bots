/*
 * The wallpaper tab's pure part: paths compared the way Windows does, the
 * name a file shows, and the Wallpaper Engine search and type filter.
 */
import { fold } from './apps';
import type { EngineKind, EngineWallpaper } from './native';

/** Two Windows paths name the same file: case and slashes aside. */
export function samePath(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  const norm = (path: string) => path.replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
  return norm(a) === norm(b);
}

/** A file's name without its folder nor its extension. */
export function fileLabel(path: string): string {
  const name = path.split(/[\\/]/).filter(Boolean).pop() ?? path;
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(0, dot) : name;
}

/** A folder's last part, for its pill. */
export const folderLabel = (path: string): string => path.split(/[\\/]/).filter(Boolean).pop() ?? path;

export type KindFilter = EngineKind | 'all';

/** The kinds present, in a stable order, for the filter. */
export function kindsOf(wallpapers: readonly EngineWallpaper[]): EngineKind[] {
  const order: EngineKind[] = ['scene', 'video', 'web', 'application', 'other'];
  const present = new Set(wallpapers.map((wallpaper) => wallpaper.kind));
  return order.filter((kind) => present.has(kind));
}

/** The wallpapers `query` and `kind` keep, in their order. */
export function filterEngine(wallpapers: readonly EngineWallpaper[], query: string, kind: KindFilter): EngineWallpaper[] {
  const needle = fold(query);
  return wallpapers.filter((wallpaper) => (kind === 'all' || wallpaper.kind === kind) && (!needle || fold(wallpaper.title).includes(needle)));
}

/** Whether `id` shows on the screen chosen (null: any screen). */
export function engineIsCurrent(id: string, current: readonly string[], monitor: number | null): boolean {
  if (monitor === null) return current.some((path) => samePath(path, id));
  return samePath(current[monitor], id);
}
