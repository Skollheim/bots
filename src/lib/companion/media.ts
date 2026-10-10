/*
 * The music playing on this computer, as the shell reads it from the system's
 * media session (Spotify first): for the companion's headphones, the island's
 * music bubble and its controls. Outside the shell nothing plays.
 */

export interface MediaState {
  title: string;
  artist: string;
  /** The session's app id: `Spotify.exe`, `MSEdge`, an AUMID... */
  app: string;
  playing: boolean;
  /** The track's cover, 96 px at most, as a data URL: Windows only, and not every player has one. */
  art?: string | null;
  /** Where the track was at the read, in milliseconds; absent when the player tells no timeline. */
  position?: number | null;
  /** How long the track lasts, in milliseconds; absent as for `position`. */
  duration?: number | null;
  /** The player takes a new position (`seekMedia`): absent or false where it does not. */
  seekable?: boolean;
}

/** The three buttons, and `show`: the player's window comes forward (Spotify; opened when no music plays). */
export type MediaAction = 'toggle' | 'next' | 'previous' | 'show';

/**
 * Whether two reads show the same music: a poll that finds nothing new leaves
 * the page alone. The position moves on every read, so it does not count:
 * `MusicClock` follows it.
 */
export function sameMedia(a: MediaState | null, b: MediaState | null): boolean {
  if (a === null || b === null) return a === b;
  return (
    a.title === b.title &&
    a.artist === b.artist &&
    a.app === b.app &&
    a.playing === b.playing &&
    (a.art ?? null) === (b.art ?? null) &&
    (a.seekable ?? false) === (b.seekable ?? false) &&
    Math.round((a.duration ?? 0) / 1000) === Math.round((b.duration ?? 0) / 1000)
  );
}

export async function readMedia(): Promise<MediaState | null> {
  if (window.__TAURI_INTERNALS__ === undefined) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<MediaState | null>('companion_media');
}

export async function pressMedia(action: MediaAction): Promise<void> {
  if (window.__TAURI_INTERNALS__ === undefined) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('companion_media_control', { action });
}

/** Moves the track to `position`, in milliseconds, for a player that is `seekable`. */
export async function seekMedia(position: number): Promise<void> {
  if (window.__TAURI_INTERNALS__ === undefined) return;
  const { invoke } = await import('@tauri-apps/api/core');
  await invoke('companion_media_control', { action: 'seek', position: Math.max(0, Math.round(position)) });
}

/** The music's loudest peak since the last read, 0 to 1, for `app`'s player; null where nothing is measured. */
export async function readLevel(app: string): Promise<number | null> {
  if (window.__TAURI_INTERNALS__ === undefined) return null;
  const { invoke } = await import('@tauri-apps/api/core');
  return invoke<number | null>('companion_media_levels', { app });
}

/** A readable name for the app a session belongs to. */
export function appName(app: string): string {
  const id = app.toLowerCase();
  if (id.includes('spotify')) return 'Spotify';
  if (id.includes('chrome')) return 'Chrome';
  if (id.includes('msedge') || id.includes('edge')) return 'Edge';
  if (id.includes('firefox')) return 'Firefox';
  if (id.includes('deezer')) return 'Deezer';
  return app.replace(/\.exe$/i, '').split(/[!\\/]/).pop() ?? app;
}

/** Whether the session's player comes forward on `show`: Spotify only. */
export function canShow(app: string): boolean {
  return app.toLowerCase().includes('spotify');
}

/** `m:ss`, or `h:mm:ss` past an hour, of a time in milliseconds. */
export function trackTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const [hours, minutes, seconds] = [Math.floor(total / 3600), Math.floor((total % 3600) / 60), total % 60];
  const ss = String(seconds).padStart(2, '0');
  return hours > 0 ? `${hours}:${String(minutes).padStart(2, '0')}:${ss}` : `${minutes}:${ss}`;
}
