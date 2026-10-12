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
 * - `unfold=<threadId>,…`: Home's session rows shown unfolded, their
 *   sub-agents listed (`t-hud-team` has some in every state);
 * - `reply=<threadId>`: that finished thread's card answered from its row;
 * - `music=playing|paused|bare`: a track in the music drop, its cover and meter
 *   (`bare`: playing, without a cover); `window.botsPose.next('cover' | 'bare')`
 *   then moves to another track, with or without its cover;
 * - `lyrics=1`: with `music=…`, synced lyrics on, the posed track's words
 *   made up here, never asked online;
 * - `timer=1`: a pomodoro running, in its drop on the left;
 * - `memory=thread|budget|machine|stopped`: the memory warning, or what the
 *   guard stopped;
 * - `update=nightly|stable`: a newer Boite in Home;
 * - `sessions=none`: Home's sessions shown empty, the robot napping (pair it
 *   with `calm=1`);
 * - `rest=live|quota|music|robot`: what the pill shows at rest (pair `music`
 *   with `music=playing`). A thread followed in the pill is chosen through
 *   `localStorage` (`bots.followed`, `followed.ts`) before the page loads.
 * - `rule=1`: an "always allow" rule for the tests thread's command, which
 *   the fake core asks again a moment later: Bots answers it, the pill's
 *   shield shows (pair it with `calm=1`);
 * - `pr=green|red`: the tests thread opens PR #12, whose CI runs, then goes
 *   green or red (the fake core's side: `fake-client/allow-demo.ts`);
 * - `machines=1|ask`: a second machine of the group, « Serveur », whose
 *   « Corriger le gameplay » thread works among this machine's (`ask`: it
 *   asks to push two seconds in); read by the companion, the fake side in
 *   `fake-client/machines-demo.ts`.
 * - `todo=1`: a to-do list in Home, one item ticked;
 * - `mission=ask|list`: a mission waiting for the user's word, or three set
 *   (one paused, one whose project is gone) for Settings.
 *
 * A wallpaper goes under the transparent window, so the black island shows.
 */
import type { Companion } from '../companion/companion.svelte';
import { nextAt, type Repeat } from '../companion/missions';
import { PILL_RESTS, writeCompanionPrefs, type PillRest } from '../companion/prefs';
import { DEMO_COMMAND, DEMO_THREAD } from '../fake-client/allow-demo';
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
/** The next track's cover: a teal tide under a pale moon. */
const COVER_NEXT =
  'data:image/svg+xml,' +
  encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#123a5c"/><stop offset="1" stop-color="#1fb3a3"/></linearGradient></defs><rect width="96" height="96" fill="url(#g)"/><circle cx="66" cy="30" r="14" fill="#f4f1d0" opacity=".9"/><path d="M0 70 Q24 58 48 70 T96 70 V96 H0Z" fill="#0b2235" opacity=".7"/></svg>'
  );

/** Original words for the posed track, timed as LRCLIB gives them, with an instrumental break. */
const LYRICS = `[ti:Midnight Circuit]
[ar:Neon Tides]
[00:14.20] Static on the skyline, the city hums in blue
[00:18.60] Every light a heartbeat, every street a clue
[00:23.10] We run the midnight circuit
[00:26.40] Till the morning breaks in two
[00:30.00]
[00:58.30] Wires in the rain, they spell your name
[01:02.40] Neon on the water, burning all the same
[01:06.70] We run the midnight circuit
[01:10.20] Hold on, hold on
[01:13.50] Through the static and the glow
[01:17.90] Take the long way home
[01:21.60]
[01:52.00] Static on the skyline, the city hums in blue
[01:56.40] We run the midnight circuit
[02:00.10] Till the morning breaks in two`;

/** The track after the posed one, with or without its cover (`window.botsPose.next('cover' | 'bare')`). */
const NEXT_TRACK = { title: 'Glass Harbor', artist: 'Neon Tides', app: 'Spotify.exe', position: 3_000, duration: 188_000, seekable: true };

function poseMusic(companion: Companion, playing: boolean, art: string | null, lyrics: boolean): void {
  // The shell's reads stop, kept so a later write of the prefs keeps them off: the posed track stays.
  companion.prefs = writeCompanionPrefs({ music: false, ...(lyrics ? { lyrics: true } : {}) });
  setTimeout(() => {
    const media = { title: 'Midnight Circuit', artist: 'Neon Tides', app: 'Spotify.exe', playing, art, position: 74_000, duration: 213_000, seekable: true };
    companion.music.demo = true;
    companion.music.demoLyrics = { 'Neon Tides\nMidnight Circuit': LYRICS };
    companion.music.accent = art ? 'rgb(255 140 178)' : null;
    companion.media = media;
    companion.music.sync(media);
  }, 50);
  // Captures move to the next track by hand, to show the change.
  (window as { botsPose?: unknown }).botsPose = {
    next(kind: 'cover' | 'bare') {
      const media = { ...NEXT_TRACK, playing, art: kind === 'cover' ? COVER_NEXT : null };
      companion.music.accent = kind === 'cover' ? 'rgb(120 230 214)' : null;
      companion.media = media;
      companion.music.sync(media);
    }
  };
}

function poseMemory(reason: PressureReason | 'stopped'): void {
  if (reason === 'stopped') {
    posed.stopped = { threadId: 'thr-demo', title: 'Unity build', program: 'node.exe', bytes: 3.1 * GB, at: Date.now() };
    return;
  }
  const limits = { thread: [3.6 * GB, 4 * GB], budget: [7.2 * GB, 8 * GB], machine: [1.4 * GB, 1 * GB] }[reason];
  posed.pressure = { reason, threadId: 'thr-demo', title: 'Unity build', bytes: 3.6 * GB, used: limits[0]!, limit: limits[1]! };
}

/** A short to-do list, the second item ticked. */
function poseTodo(companion: Companion): void {
  const texts = ['Relire la PR du lecteur audio', 'Répondre à Léa sur le planning', 'Tester la build Windows', 'Préparer la démo de vendredi'];
  companion.todos.apply([{ kind: 'clear', all: true }, ...texts.map((text) => ({ kind: 'add' as const, text }))]);
  companion.todos.apply([{ kind: 'done', index: 2 }]);
}

/** A mission waiting for the user's word (`ask`), or three set, one paused and one whose project is gone (`list`, for Settings). */
function poseMissions(companion: Companion, kind: 'ask' | 'list'): void {
  const found = [...companion.projects].find(([, name]) => companion.projectNames?.includes(name));
  if (!found) return;
  const project = { id: found[0], name: found[1] };
  const now = Date.now();
  const at = (repeat: Repeat, minutes: number) => ({ minutes, repeat, due: nextAt(repeat, minutes, now) });
  const entries = [
    { ...at({ kind: 'weekdays' }, 9 * 60), projectId: project.id, project: project.name, prompt: 'Lance les tests et résume les échecs de la nuit.' },
    { ...at({ kind: 'weekly', day: 5 }, 17 * 60 + 30), projectId: project.id, project: project.name, prompt: 'Prépare les notes de version de la semaine.' },
    { ...at({ kind: 'once' }, 22 * 60), projectId: 'p-gone', project: 'ancien-site', prompt: 'Archive les vieux journaux.' }
  ];
  companion.missions.pending = (kind === 'ask' ? entries.slice(0, 1) : entries).map((entry, index) => ({ ...entry, id: `mission-pose-${index}` }));
  if (kind === 'ask') return;
  for (const entry of entries.map((_, index) => `mission-pose-${index}`)) companion.missions.confirm(entry, now);
  const weekly = companion.missions.list.findIndex((mission) => mission.repeat.kind === 'weekly');
  if (weekly >= 0) void companion.missions.request([{ kind: 'pause', index: weekly + 1 }], now);
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
  const reply = params.get('reply');
  if (reply) {
    await until(() => companion.notes.notices.some((notice) => notice.threadId === reply));
    const notice = companion.notes.notices.find((entry) => entry.threadId === reply);
    if (notice) companion.notes.answer(notice.id);
  }
  const music = params.get('music');
  if (music === 'playing' || music === 'paused' || music === 'bare') poseMusic(companion, music !== 'paused', music === 'bare' ? null : COVER, params.get('lyrics') === '1');
  if (params.get('timer') === '1') companion.startTimer();
  const memory = params.get('memory');
  if (memory === 'thread' || memory === 'budget' || memory === 'machine' || memory === 'stopped') poseMemory(memory);
  const update = params.get('update');
  if (update === 'nightly' || update === 'stable') {
    const version = update === 'nightly' ? '2.0.0-nightly.20261011.1' : '2.0.0';
    posed.release = { version, track: update, url: '', publishedAt: null };
  }
  if (params.get('sessions') === 'none') posed.idle = true;
  if (params.get('todo') === '1') poseTodo(companion);
  const mission = params.get('mission');
  if (mission === 'ask' || mission === 'list') poseMissions(companion, mission);
  const rest = params.get('rest') as PillRest | null;
  if (rest && PILL_RESTS.includes(rest)) companion.prefs = { ...companion.prefs, pillRest: rest };
  if (params.get('rule') === '1') {
    const request = { id: 'perm-rule-pose', threadId: DEMO_THREAD, turnId: '', toolName: 'Bash', input: { command: DEMO_COMMAND }, description: '', createdAt: Date.now() };
    companion.rules.add(request, 'thread', companion.threads, companion.projects);
  }
  const pose = params.get('pose');
  const tab = params.get('tab') as IslandTab | null;
  if (pose === 'peek') {
    companion.prefs = { ...companion.prefs, openOnHover: false };
    companion.pointerOn = true;
  } else if (pose === 'open') frame.show(tab && ISLAND_TABS.includes(tab) ? tab : 'home');
  else if (pose === 'desktop') companion.prefs = { ...companion.prefs, robots: 'desktop' };
  await (await import('./assistant-pose')).strikeAssistantPose(companion, params);
}
