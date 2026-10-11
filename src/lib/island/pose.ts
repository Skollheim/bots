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
 *   unfolded, and the Edit diff of one step open;
 * - `reply=<threadId>`: that finished thread's card answered from its row;
 * - `music=playing|paused`: a track in the music drop, its cover and meter;
 * - `timer=1`: a pomodoro running, in its drop on the left;
 * - `memory=thread|budget|machine|stopped`: the memory warning, or what the
 *   guard stopped;
 * - `update=nightly|stable`: a newer Boite in Home;
 * - `sessions=none`: Home's sessions shown empty, the robot napping (pair it
 *   with `calm=1`);
 * - `rest=live|quota|music|robot`: what the pill shows at rest (pair `music`
 *   with `music=playing`). A thread followed in the pill is chosen through
 *   `localStorage` (`bots.followed`, `followed.ts`) before the page loads.
 *
 * A wallpaper goes under the transparent window, so the black island shows.
 */
import type { Companion } from '../companion/companion.svelte';
import { PILL_RESTS, writeCompanionPrefs, type PillRest } from '../companion/prefs';
import { ISLAND_TABS, type IslandFrame, type IslandTab } from './frame.svelte';
import { posed } from './posed.svelte';
import type { PressureReason } from './pressure';
import { unfolding } from './sessions.svelte';

const GB = 1024 * 1024 * 1024;
/** An original cover for the music poses: two soft circles on a dusk gradient. */
const COVER =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ff5f8f"/><stop offset="1" stop-color="#5b3cc4"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="34" cy="60" r="22" fill="#ffd36e" opacity=".85"/><circle cx="62" cy="38" r="16" fill="#fff" opacity=".35"/></svg>'
  );

function poseMusic(companion: Companion, playing: boolean): void {
  // The shell's reads stop, kept so a later write of the prefs keeps them off: the posed track stays.
  companion.prefs = writeCompanionPrefs({ music: false });
  setTimeout(() => {
    const media = { title: 'Midnight Circuit', artist: 'Neon Tides', app: 'Spotify.exe', playing, art: COVER, position: 74_000, duration: 213_000, seekable: true };
    companion.music.demo = true;
    companion.music.accent = 'rgb(255 140 178)';
    companion.media = media;
    companion.music.sync(media);
  }, 50);
}

function poseMemory(reason: PressureReason | 'stopped'): void {
  if (reason === 'stopped') {
    posed.stopped = { threadId: 'thr-demo', title: 'Unity build', program: 'node.exe', bytes: 3.1 * GB, at: Date.now() };
    return;
  }
  const limits = { thread: [3.6 * GB, 4 * GB], budget: [7.2 * GB, 8 * GB], machine: [1.4 * GB, 1 * GB] }[reason];
  posed.pressure = { reason, threadId: 'thr-demo', title: 'Unity build', bytes: 3.6 * GB, used: limits[0]!, limit: limits[1]! };
}

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
  const reply = params.get('reply');
  if (reply) {
    await until(() => companion.notes.notices.some((notice) => notice.threadId === reply));
    const notice = companion.notes.notices.find((entry) => entry.threadId === reply);
    if (notice) companion.notes.answer(notice.id);
  }
  const music = params.get('music');
  if (music === 'playing' || music === 'paused') poseMusic(companion, music === 'playing');
  if (params.get('timer') === '1') companion.startTimer();
  const memory = params.get('memory');
  if (memory === 'thread' || memory === 'budget' || memory === 'machine' || memory === 'stopped') poseMemory(memory);
  const update = params.get('update');
  if (update === 'nightly' || update === 'stable') {
    const version = update === 'nightly' ? '2.0.0-nightly.20261011.1' : '2.0.0';
    posed.release = { version, track: update, url: '', publishedAt: null };
  }
  if (params.get('sessions') === 'none') posed.idle = true;
  const rest = params.get('rest') as PillRest | null;
  if (rest && PILL_RESTS.includes(rest)) companion.prefs = { ...companion.prefs, pillRest: rest };
  const pose = params.get('pose');
  const tab = params.get('tab') as IslandTab | null;
  if (pose === 'peek') {
    companion.prefs = { ...companion.prefs, openOnHover: false };
    companion.pointerOn = true;
  } else if (pose === 'open') frame.show(tab && ISLAND_TABS.includes(tab) ? tab : 'home');
  else if (pose === 'desktop') companion.prefs = { ...companion.prefs, robots: 'desktop' };
  await (await import('./assistant-pose')).strikeAssistantPose(companion, params);
}
