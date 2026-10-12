/*
 * The computer tabs' demo pose (`?fake=1&pose=decktab&tab=…`, dev bundle
 * only, from `lib/island/pose.ts`): one tab alone in a deck-wide black frame
 * over the page, on the browser's fake computer (`fake.ts`). Its states, which
 * `pose=deck` takes too (`poseComputer`, before the deck shows the tab):
 *
 * - `tab=apps|clipboard|wallpaper|system`;
 * - `q=<text>`: typed in the apps tab's search;
 * - `clip=empty`: the clipboard history empty;
 * - `source=engine|recent|folder`: the wallpaper tab's source (`folder`: a
 *   made-up folder picked); `engine=stopped|none`: Wallpaper Engine installed
 *   but not running, or not installed;
 * - `press=<data-testid>`: that button pressed once the tab shows, as for an
 *   inline confirmation (`system-power-restart`, `system-close`,
 *   `clipboard-clear`, `wallpaper-shot`); the first one when several match.
 */
import { mount, type Component } from 'svelte';
import type { Companion } from '../companion/companion.svelte';
import { FAKE_FOLDER, fakeClipEmpty, fakeEngineMissing, fakeEngineStopped } from './fake';
import { writeWindowsPrefs, type WallpaperSource } from './prefs';

const SETTLE_MS = 400;

/** The fake computer's states, set before a tab shows; the search and the press follow once it does. */
export function poseComputer(params: URLSearchParams): void {
  if (params.get('clip') === 'empty') fakeClipEmpty();
  const engine = params.get('engine');
  if (engine === 'stopped') fakeEngineStopped();
  if (engine === 'none') fakeEngineMissing();
  const source = params.get('source');
  writeWindowsPrefs({
    wallpaperSource: source === 'engine' || source === 'recent' || source === 'folder' ? (source as WallpaperSource) : null,
    wallpaperFolder: source === 'folder' ? FAKE_FOLDER : null,
    engineMonitor: null
  });
  if (params.has('q') || params.has('press')) setTimeout(() => act(params), SETTLE_MS);
}

function act(params: URLSearchParams): void {
  const query = params.get('q');
  const search = document.querySelector<HTMLInputElement>('[data-testid="apps-search"]');
  if (query && search) {
    search.value = query;
    search.dispatchEvent(new Event('input', { bubbles: true }));
  }
  const press = params.get('press');
  if (press) document.querySelector<HTMLElement>(`[data-testid="${CSS.escape(press)}"]`)?.click();
}

export async function poseDeckTab(companion: Companion, params: URLSearchParams): Promise<void> {
  const tabs: Record<string, () => Promise<{ default: Component }>> = {
    apps: () => import('../../components/island/deck/tabs/AppsTab.svelte'),
    clipboard: () => import('../../components/island/deck/tabs/ClipboardTab.svelte'),
    wallpaper: () => import('../../components/island/deck/tabs/WallpaperTab.svelte'),
    system: () => import('../../components/island/deck/tabs/SystemTab.svelte')
  };
  const load = tabs[params.get('tab') ?? ''] ?? tabs.system!;
  const [{ default: Pose }, { default: tab }] = await Promise.all([import('../../components/island/deck/computer/DeckTabPose.svelte'), load()]);
  poseComputer(params);
  const target = document.body.appendChild(document.createElement('div'));
  mount(Pose, { target, props: { companion, tab } });
}
