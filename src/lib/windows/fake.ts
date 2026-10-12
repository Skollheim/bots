/*
 * What the computer tabs show in a browser, where there is no shell (`bun run
 * dev`, the poses, the captures): believable numbers, apps, clipboard
 * entries and wallpapers, all made up here. Nothing touches the computer:
 * an action changes these fakes only.
 */
import { activeLocale } from '@boite/ui/lib/i18n.svelte';
import type { App, ClipEntry, ClipItem, Engine, Folder, Proc, Sample, Wallpapers } from './native';

const GB = 1024 ** 3;
const MB = 1024 ** 2;

const svg = (body: string, view = '0 0 64 64'): string =>
  'data:image/svg+xml,' + encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="${view}">${body}</svg>`);

/** An app's made-up icon: a rounded square in its color, its initial on it. */
function appIcon(name: string, from: string, to: string): string {
  const letter = name.charAt(0).toUpperCase();
  return svg(
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
      `<rect x="4" y="4" width="56" height="56" rx="14" fill="url(#g)"/>` +
      `<text x="32" y="42" font-family="Segoe UI, sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="#fff">${letter}</text>`
  );
}

const PROGRAMS = 'C:\\ProgramData\\Microsoft\\Windows\\Start Menu\\Programs\\';
const APPS: [string, string, string][] = [
  ['Audacity', '#2f6bff', '#13b8ff'],
  ['Blender', '#ff8a3d', '#e2552d'],
  ['Calculator', '#5d6170', '#2e3038'],
  ['Discord', '#5865f2', '#3c45c9'],
  ['Docker Desktop', '#1d91e6', '#0b5fae'],
  ['Écran de veille', '#38b48b', '#1f7a5c'],
  ['Firefox', '#ff9500', '#c13584'],
  ['GIMP', '#7a6a53', '#4b3f30'],
  ['Git Bash', '#f05133', '#a3301b'],
  ['Godot Engine', '#478cbf', '#2c5f86'],
  ['Notepad++', '#7cc142', '#3f8a20'],
  ['OBS Studio', '#3b3b44', '#17171c'],
  ['Obsidian', '#8b5cf6', '#5b2fc9'],
  ['Paint', '#e9a23b', '#d35d6e'],
  ['PowerShell', '#2d73c4', '#163d73'],
  ['Spotify', '#1ed760', '#118a3d'],
  ['Steam', '#1b2838', '#2a475e'],
  ['Terminal', '#2b2b31', '#0d0d10'],
  ['Unity Hub', '#55565c', '#222327'],
  ['Visual Studio Code', '#23a9f2', '#0065a9'],
  ['VLC media player', '#ff8800', '#d65a00'],
  ['Wallpaper Engine', '#2e7de1', '#1c3f8f'],
  ['WinRAR', '#7a3b8f', '#3e1d4a'],
  ['Zed', '#3a3a8c', '#1f1f52']
];

export const FAKE_APPS: App[] = APPS.map(([name]) => ({ id: `${PROGRAMS}${name}.lnk`, name }));

export function fakeAppIcon(id: string): string | null {
  const found = APPS.find(([name]) => id === `${PROGRAMS}${name}.lnk`);
  return found ? appIcon(found[0], found[1], found[2]) : null;
}

// ---------------------------------------------------------------------------
// System
// ---------------------------------------------------------------------------

interface FakeProc { pid: number; name: string; cpu: number; memory: number; protected: boolean }

const BOOT = Date.now() - (3 * 86_400 + 5 * 3_600 + 42 * 60) * 1_000;
let processes: FakeProc[] = [
  { pid: 8124, name: 'Unity.exe', cpu: 18, memory: 3.4 * GB, protected: false },
  { pid: 10432, name: 'chrome.exe', cpu: 7, memory: 1.9 * GB, protected: false },
  { pid: 5520, name: 'Code.exe', cpu: 4, memory: 1.1 * GB, protected: false },
  { pid: 2204, name: 'Discord.exe', cpu: 1.6, memory: 640 * MB, protected: false },
  { pid: 9932, name: 'Spotify.exe', cpu: 1.2, memory: 420 * MB, protected: false },
  { pid: 4410, name: 'boite-core.exe', cpu: 2.4, memory: 380 * MB, protected: true },
  { pid: 7720, name: 'claude.exe', cpu: 3.1, memory: 510 * MB, protected: true },
  { pid: 1880, name: 'dwm.exe', cpu: 2.2, memory: 160 * MB, protected: true },
  { pid: 6672, name: 'OBS Studio.exe', cpu: 5.5, memory: 720 * MB, protected: false }
];

/** A gentle wobble around each base value, so a reading moves like a real one. */
const wobble = (base: number, seed: number, spread: number): number => Math.max(0, base + Math.sin(Date.now() / 1_700 + seed) * spread);

export function fakeSample(): Sample {
  const rows: Proc[] = processes.map((proc, index) => ({
    pid: proc.pid,
    name: proc.name,
    cpu: Math.round(wobble(proc.cpu, index, proc.cpu * 0.35) * 10) / 10,
    memory: Math.round(wobble(proc.memory, index * 2, proc.memory * 0.03)),
    started: 1_760_000_000 + proc.pid,
    protected: proc.protected
  }));
  return {
    cpu: Math.round(wobble(31, 0.5, 9) * 10) / 10,
    memoryUsed: Math.round(wobble(19.6 * GB, 1, 0.3 * GB)),
    memoryTotal: 32 * GB,
    drives: [
      { mount: 'C:', label: 'Windows', total: 953 * GB, free: 212 * GB },
      { mount: 'D:', label: 'Jeux', total: 1863 * GB, free: 1104 * GB },
      { mount: 'E:', label: 'Dev', total: 931 * GB, free: 74 * GB }
    ],
    uptime: Math.floor((Date.now() - BOOT) / 1_000),
    processes: rows
  };
}

export function fakeClose(pid: number): void {
  processes = processes.filter((proc) => proc.pid !== pid || proc.protected);
}

// ---------------------------------------------------------------------------
// Clipboard
// ---------------------------------------------------------------------------

const SHOT = svg(
  '<defs><linearGradient id="s" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e2140"/><stop offset="1" stop-color="#3a2d62"/></linearGradient></defs>' +
    '<rect width="160" height="100" fill="url(#s)"/><rect x="12" y="12" width="64" height="8" rx="4" fill="#8b7cf6" opacity=".9"/>' +
    '<rect x="12" y="28" width="110" height="6" rx="3" fill="#fff" opacity=".35"/><rect x="12" y="40" width="90" height="6" rx="3" fill="#fff" opacity=".25"/>' +
    '<rect x="12" y="60" width="136" height="28" rx="6" fill="#000" opacity=".35"/>',
  '0 0 160 100'
);

const minutesAgo = (minutes: number): number => Date.now() - minutes * 60_000;

function seedClips(): { entry: ClipEntry; whole: ClipItem }[] {
  const texts: [string, number][] = [
    ['git rebase -i origin/main', 1],
    ['https://docs.unity3d.com/Manual/ExecutionOrder.html', 4],
    [activeLocale() === 'fr' ? 'Merci pour le retour ! Je regarde ça demain matin et je vous redis.' : "Thanks for the feedback! I'll look at it tomorrow morning and get back to you.", 12],
    ['const ready = await until(() => companion.threads.length > 0);\nif (!ready) return;', 38],
    ['#8B7CF6', 95]
  ];
  const clips: { entry: ClipEntry; whole: ClipItem }[] = texts.map(([text, minutes], index) => ({
    entry: { id: 10 - index, kind: 'text', text, chars: [...text].length, width: 0, height: 0, thumb: null, at: minutesAgo(minutes) },
    whole: { text, image: null }
  }));
  clips.splice(2, 0, { entry: { id: 20, kind: 'image', text: null, chars: 0, width: 1920, height: 1200, thumb: SHOT, at: minutesAgo(7) }, whole: { text: null, image: SHOT } });
  return clips;
}

let clips = seedClips();
const clipListeners = new Set<(entries: ClipEntry[]) => void>();

export const fakeClips = (): ClipEntry[] => clips.map((clip) => clip.entry);
export const fakeClipItem = (id: number): ClipItem | null => clips.find((clip) => clip.entry.id === id)?.whole ?? null;

function told(): void {
  for (const listener of clipListeners) listener(fakeClips());
}

export function fakeClipListen(listener: (entries: ClipEntry[]) => void): () => void {
  clipListeners.add(listener);
  return () => clipListeners.delete(listener);
}

export function fakeClipCopy(id: number): void {
  const index = clips.findIndex((clip) => clip.entry.id === id);
  if (index < 0) return;
  const [clip] = clips.splice(index, 1);
  clips.unshift({ ...clip!, entry: { ...clip!.entry, at: Date.now() } });
  told();
}

export function fakeClipRemove(id: number | null): void {
  clips = id === null ? [] : clips.filter((clip) => clip.entry.id !== id);
  told();
}

/** On: the demo list again; off: forgotten. */
export function fakeClipWatch(listen: boolean): void {
  if (!listen) clips = [];
  else if (clips.length === 0) clips = seedClips();
  told();
}

/** The poses' empty clipboard. */
export function fakeClipEmpty(): void {
  clips = [];
  told();
}

// ---------------------------------------------------------------------------
// Wallpapers
// ---------------------------------------------------------------------------

/** A made-up landscape: a sky, a sun or moon, two hill lines. */
function landscape(sky: [string, string], sun: string, hills: [string, string]): string {
  return svg(
    `<defs><linearGradient id="k" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="${sky[0]}"/><stop offset="1" stop-color="${sky[1]}"/></linearGradient></defs>` +
      `<rect width="320" height="180" fill="url(#k)"/><circle cx="228" cy="62" r="24" fill="${sun}" opacity=".9"/>` +
      `<path d="M0 120 Q80 92 160 118 T320 108 V180 H0Z" fill="${hills[0]}"/><path d="M0 150 Q100 124 200 148 T320 140 V180 H0Z" fill="${hills[1]}"/>`,
    '0 0 320 180'
  );
}

const PICTURES = 'C:\\Users\\me\\Pictures\\Fonds\\';
const SCENES: [string, string][] = [
  ['Dune au matin.jpg', landscape(['#f6c27a', '#f08a5d'], '#fff4d6', ['#c8693f', '#8d4128'])],
  ['Lac bleu.jpg', landscape(['#7fb6e8', '#cfe6f7'], '#ffffff', ['#3e7cad', '#22527a'])],
  ['Nuit violette.png', landscape(['#1b1236', '#4a2f7a'], '#f1ecff', ['#2c1f52', '#160f2e'])],
  ['Forêt.jpg', landscape(['#a8d8b9', '#e8f4dc'], '#fffbe0', ['#3f7d4f', '#24563a'])],
  ['Aurore.jpg', landscape(['#0f2b3a', '#2fbf9f'], '#d8fff5', ['#123c4a', '#0a2430'])],
  ['Ville la nuit.jpg', landscape(['#0d1020', '#283a6b'], '#ffd36e', ['#1a1f38', '#0b0d18'])],
  ['Brume.jpg', landscape(['#c9cdd6', '#eef0f4'], '#ffffff', ['#9aa1af', '#6f7686'])],
  ['Coucher rose.jpg', landscape(['#ff9fb2', '#ffd1a1'], '#fff3e0', ['#c25d7c', '#86385a'])],
  ['Glacier.png', landscape(['#d8eefc', '#9fd0f2'], '#ffffff', ['#6fa9d6', '#3a78a8'])]
];

let current = `${PICTURES}${SCENES[2]![0]}`;

export function fakeWallpapers(): Wallpapers {
  const recent = [current, ...SCENES.slice(0, 5).map(([name]) => `${PICTURES}${name}`).filter((path) => path !== current)].slice(0, 5);
  return { recent, current };
}

export function fakeFolder(path: string): Folder {
  const images = SCENES.map(([name]) => `${PICTURES}${name}`);
  return { path, images, count: images.length };
}

export const FAKE_FOLDER = PICTURES.slice(0, -1);

export function fakeThumb(path: string): string | null {
  return SCENES.find(([name]) => path.endsWith(`\\${name}`))?.[1] ?? null;
}

export function fakeSetWallpaper(path: string): string {
  current = path;
  return current;
}

// ---------------------------------------------------------------------------
// Wallpaper Engine
// ---------------------------------------------------------------------------

const WORKSHOP = 'D:\\SteamLibrary\\steamapps\\workshop\\content\\431960\\';
const LIVE: [string, string, Engine['wallpapers'][number]['kind'], string][] = [
  ['2801146512', 'Pluie sur la ville', 'scene', landscape(['#14182b', '#33406b'], '#9fb4ff', ['#1e2440', '#0e1124'])],
  ['2799012231', 'Lofi room', 'video', landscape(['#3b2a4f', '#c27aa8'], '#ffe0b8', ['#2a1d3a', '#170f22'])],
  ['2788410090', 'Koi pond', 'scene', landscape(['#0f4c4a', '#5fc1a8'], '#fff6d8', ['#0b3634', '#06201f'])],
  ['2779300512', 'Neon grid', 'web', landscape(['#12002b', '#5a0f8c'], '#ff4fd8', ['#24004d', '#0d001c'])],
  ['2771100458', 'Montagnes calmes', 'video', landscape(['#9bc4e2', '#e3eef7'], '#ffffff', ['#56708a', '#33475c'])],
  ['2766028777', 'Galaxy drift', 'scene', landscape(['#05060f', '#1d1b4b'], '#c9c3ff', ['#0b0a1e', '#05040f'])],
  ['2759981234', 'Desert wind', 'video', landscape(['#f2b66d', '#f7dfb0'], '#fff7e6', ['#c27a3f', '#8a5126'])],
  ['2751230087', 'Clock widget', 'application', landscape(['#202024', '#3a3a42'], '#8b7cf6', ['#18181c', '#0e0e11'])]
];

let liveCurrent = `${WORKSHOP}${LIVE[0]![0]}\\project.json`;
let liveRunning = true;
let liveInstalled = true;

export function fakeEngine(): Engine | null {
  if (!liveInstalled) return null;
  return {
    running: liveRunning,
    monitors: 2,
    wallpapers: LIVE.map(([id, title, kind]) => ({ id: `${WORKSHOP}${id}\\project.json`, title, kind, preview: true })).sort((a, b) => a.title.localeCompare(b.title))
  };
}

export const fakeEngineThumb = (id: string): string | null => LIVE.find(([folder]) => id === `${WORKSHOP}${folder}\\project.json`)?.[3] ?? null;
export const fakeEngineCurrent = (): string[] => (liveRunning ? [liveCurrent, liveCurrent] : []);

export function fakeEngineApply(id: string): void {
  liveCurrent = id;
}

export function fakeEngineStart(): void {
  liveRunning = true;
}

/** The poses' Wallpaper Engine installed but stopped. */
export function fakeEngineStopped(): void {
  liveRunning = false;
}

/** The poses' computer without Wallpaper Engine. */
export function fakeEngineMissing(): void {
  liveInstalled = false;
}
