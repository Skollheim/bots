/*
 * The computer tabs' native side: one typed function per shell command
 * (`src-tauri/src/computer`). In a browser, where there is no shell, each one
 * answers from `fake.ts` instead, so the page and the poses run without the
 * app and nothing there touches the computer.
 *
 * A command that fails rejects with the shell's message, a string.
 */
import { inShell, listenShell } from '../companion/shell';
import * as fake from './fake';

export interface Drive { mount: string; label: string; total: number; free: number }
export interface Proc { pid: number; name: string; cpu: number; memory: number; started: number; protected: boolean }
export interface Sample { cpu: number; memoryUsed: number; memoryTotal: number; drives: Drive[]; uptime: number; processes: Proc[] }
export type Power = 'lock' | 'sleep' | 'restart' | 'shutdown';

export interface App { id: string; name: string }

export interface ClipEntry {
  id: number;
  kind: 'text' | 'image';
  /** The text's start, at most 2,000 characters. */
  text: string | null;
  /** The whole text's length. */
  chars: number;
  width: number;
  height: number;
  /** A small PNG of an image, as a data URL. */
  thumb: string | null;
  /** When it was copied, in milliseconds since 1970. */
  at: number;
}
/** One entry whole: its text, or its image as a PNG data URL. */
export interface ClipItem { text: string | null; image: string | null }

export interface Wallpapers { recent: string[]; current: string | null }
export interface Folder { path: string; images: string[]; count: number }

export type EngineKind = 'scene' | 'video' | 'web' | 'application' | 'other';
export interface EngineWallpaper { id: string; title: string; kind: EngineKind; preview: boolean }
export interface Engine { running: boolean; monitors: number; wallpapers: EngineWallpaper[] }
export type EngineControl = 'pause' | 'play' | 'mute' | 'unmute' | 'next' | 'start';

async function call<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<T>(command, args);
}

const shell = inShell;

// System -------------------------------------------------------------------

export const systemSample = (): Promise<Sample> => (shell() ? call('computer_system') : Promise.resolve(fake.fakeSample()));

/** Closes a process; `started` is the start time read with it, so a reused pid is left alone. */
export async function closeProcess(pid: number, started: number): Promise<void> {
  if (shell()) return call('computer_close', { pid, started });
  fake.fakeClose(pid);
}

export async function power(action: Power): Promise<void> {
  if (shell()) return call('computer_power', { action });
  /* the browser locks, sleeps and stops nothing */
}

// Apps ---------------------------------------------------------------------

export const listApps = (): Promise<App[]> => (shell() ? call('computer_apps') : Promise.resolve(fake.FAKE_APPS));
export const appIcon = (id: string): Promise<string | null> => (shell() ? call('computer_app_icon', { id }) : Promise.resolve(fake.fakeAppIcon(id)));

export async function openApp(id: string): Promise<void> {
  if (shell()) return call('computer_app_open', { id });
}

// Links --------------------------------------------------------------------

/** Opens a web link of the island's bar in the default browser; the shell takes http and https only. */
export async function openLink(url: string): Promise<void> {
  if (shell()) return call('computer_link_open', { url });
  window.open(url, '_blank', 'noopener');
}

// Clipboard ----------------------------------------------------------------

/** Starts or stops the clipboard listener; off also forgets the list. */
export async function watchClipboard(listen: boolean, paused: boolean): Promise<void> {
  if (shell()) return call('computer_clipboard_watch', { listen, paused });
  fake.fakeClipWatch(listen);
}

export const listClipboard = (): Promise<ClipEntry[]> => (shell() ? call('computer_clipboard_list') : Promise.resolve(fake.fakeClips()));

/** Hears the list each time it changes. Returns the function that stops. */
export async function onClipboard(handler: (entries: ClipEntry[]) => void): Promise<() => void> {
  if (shell()) return listenShell<ClipEntry[]>('clipboard', handler);
  return fake.fakeClipListen(handler);
}

/** Puts an entry back on the clipboard. */
export async function copyClip(id: number): Promise<void> {
  if (shell()) return call('computer_clipboard_copy', { id });
  fake.fakeClipCopy(id);
}

/** Forgets one entry, or all of them with null. */
export async function removeClip(id: number | null): Promise<void> {
  if (shell()) return call('computer_clipboard_remove', { id });
  fake.fakeClipRemove(id);
}

export const clipItem = (id: number): Promise<ClipItem | null> => (shell() ? call('computer_clipboard_item', { id }) : Promise.resolve(fake.fakeClipItem(id)));

// Wallpapers ---------------------------------------------------------------

export const listWallpapers = (): Promise<Wallpapers> => (shell() ? call('computer_wallpapers') : Promise.resolve(fake.fakeWallpapers()));
export const wallpaperFolder = (path: string): Promise<Folder> => (shell() ? call('computer_wallpaper_folder', { path }) : Promise.resolve(fake.fakeFolder(path)));
/** The system's folder picker; null when cancelled. */
export const pickWallpaperFolder = (): Promise<string | null> => (shell() ? call('computer_wallpaper_pick') : Promise.resolve(fake.FAKE_FOLDER));
export const wallpaperThumb = (path: string): Promise<string | null> => (shell() ? call('computer_wallpaper_thumb', { path }) : Promise.resolve(fake.fakeThumb(path)));
/** Sets the wallpaper on every screen; answers the wallpaper the system now reports. */
export const setWallpaper = (path: string): Promise<string | null> => (shell() ? call('computer_wallpaper_set', { path }) : Promise.resolve(fake.fakeSetWallpaper(path)));

// Wallpaper Engine ----------------------------------------------------------

/** Wallpaper Engine and its wallpapers; null when it is not installed. */
export const engineInfo = (): Promise<Engine | null> => (shell() ? call('computer_engine') : Promise.resolve(fake.fakeEngine()));
export const engineThumb = (id: string): Promise<string | null> => (shell() ? call('computer_engine_thumb', { id }) : Promise.resolve(fake.fakeEngineThumb(id)));

/** Opens a listed wallpaper on one screen (from 0), or on all of them with null. */
export async function engineApply(id: string, monitor: number | null): Promise<void> {
  if (shell()) return call('computer_engine_apply', { id, monitor });
  fake.fakeEngineApply(id);
}

/** Each screen's wallpaper, as its project.json path; empty when not running. */
export const engineCurrent = (): Promise<string[]> => (shell() ? call('computer_engine_current') : Promise.resolve(fake.fakeEngineCurrent()));

export async function engineControl(control: EngineControl): Promise<void> {
  if (shell()) return call('computer_engine_control', { control });
  if (control === 'start') fake.fakeEngineStart();
}
