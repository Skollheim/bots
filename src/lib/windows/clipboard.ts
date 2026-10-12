/*
 * The clipboard tab's pure part: how an entry reads in the list, how old it
 * is, and the chat draft "Send to chat" makes of a text.
 */
import type { ClipEntry } from './native';

/** A text entry's line in the list: spaces folded, cut at `max` characters. */
export function preview(text: string, max = 160): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  const chars = [...flat];
  return chars.length > max ? `${chars.slice(0, max - 1).join('')}…` : flat;
}

export type Age = { unit: 'now' } | { unit: 'minutes' | 'hours' | 'days'; count: number };

/** How long ago an entry was copied, coarse enough for a list. */
export function ageOf(at: number, now: number): Age {
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return { unit: 'now' };
  if (minutes < 60) return { unit: 'minutes', count: minutes };
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return { unit: 'hours', count: hours };
  return { unit: 'days', count: Math.floor(hours / 24) };
}

/** Whether an entry looks like a link: it then shows as one line, never opened. */
export const isLink = (entry: ClipEntry): boolean => entry.kind === 'text' && entry.text !== null && /^https?:\/\/\S+$/i.test(entry.text.trim());

/** A data URL as a file, for the chat's attachments. */
export function fileOfDataUrl(url: string, name: string): File | null {
  const match = /^data:([^;,]+);base64,(.*)$/.exec(url);
  if (!match) return null;
  const bytes = Uint8Array.from(atob(match[2]!), (char) => char.charCodeAt(0));
  return new File([bytes], name, { type: match[1] });
}
