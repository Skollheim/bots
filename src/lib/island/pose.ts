/*
 * Demo poses, for the captures of the island (`?fake=1&pose=…`), loaded by the
 * companion's window in the dev bundle only:
 *
 * - `pose=collapsed|peek|open|desktop`: the island's size, or the robots loose
 *   on the desktop;
 * - `tab=home|chat|drop`: the tab the open island shows;
 * - `calm=1`: the requests the fake core starts with are answered first, so
 *   the tab shows without the amber card over it;
 * - `answer=permissions`: only the permissions are answered first, so the
 *   card shows the question;
 * - `unfold=<threadId>,…` and `diff=<toolId>`: Home's session rows shown
 *   unfolded, and the Edit diff of one step open.
 *
 * A wallpaper goes under the transparent window, so the black island shows.
 */
import type { Companion } from '../companion/companion.svelte';
import { ISLAND_TABS, type IslandFrame, type IslandTab } from './frame.svelte';
import { unfolding } from './sessions.svelte';

const WALLPAPER = 'html[data-companion] body { background: linear-gradient(160deg, #34466e, #7d6797 55%, #d49c78) !important; }';

async function until(ready: () => boolean, tries = 60): Promise<void> {
  for (let tried = 0; tried < tries && !ready(); tried++) await new Promise((resolve) => setTimeout(resolve, 100));
}

export async function strikePose(companion: Companion, frame: IslandFrame, params: URLSearchParams): Promise<void> {
  const style = document.createElement('style');
  style.textContent = WALLPAPER;
  document.head.append(style);
  await until(() => companion.threads.length > 0 && companion.crew.members.length > 0);
  if (params.get('calm') === '1') {
    for (const request of companion.permissions) await companion.act({ kind: 'allow', request });
    for (const question of companion.questions) await companion.act({ kind: 'skip', question });
    await until(() => companion.blocking === 0);
  } else if (params.get('answer') === 'permissions') {
    for (const request of companion.permissions) await companion.act({ kind: 'allow', request });
    await until(() => companion.permissions.length === 0);
  }
  const unfold = params.get('unfold');
  if (unfold) unfolding.rows = unfold.split(',').filter(Boolean);
  unfolding.diff = params.get('diff');
  const pose = params.get('pose');
  const tab = params.get('tab') as IslandTab | null;
  if (pose === 'peek') {
    companion.prefs = { ...companion.prefs, openOnHover: false };
    companion.pointerOn = true;
  } else if (pose === 'open') frame.show(tab && ISLAND_TABS.includes(tab) ? tab : 'home');
  else if (pose === 'desktop') companion.prefs = { ...companion.prefs, robots: 'desktop' };
}
