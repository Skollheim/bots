/*
 * The attention card's queue: the requests that stop an agent, one shown at a
 * time with "1 of 3" and previous / next, and the keys that answer the one in
 * view. Pure, so the order, the paging and the keys are tested without a DOM.
 */
import type { PermissionRequest, QuestionRequest } from '@boite/contracts';

export type PendingRequest =
  | { kind: 'permission'; id: string; request: PermissionRequest }
  | { kind: 'question'; id: string; request: QuestionRequest };

/** Permissions first, then the questions an agent stopped for, each oldest first. */
export function requestQueue(permissions: readonly PermissionRequest[], questions: readonly QuestionRequest[]): PendingRequest[] {
  const byAge = <T extends { createdAt: number }>(list: readonly T[]): T[] => [...list].sort((a, b) => a.createdAt - b.createdAt);
  return [
    ...byAge(permissions).map((request): PendingRequest => ({ kind: 'permission', id: request.id, request })),
    ...byAge(questions.filter((question) => !question.async)).map((request): PendingRequest => ({ kind: 'question', id: request.id, request }))
  ];
}

export interface Arrivals {
  /** The ids of the requests an agent stopped for. */
  blocking: Set<string>;
  /** One of them is new: the robots call. */
  call: boolean;
  /** One that opens the panel is new. */
  open: boolean;
}

/**
 * What new requests do. Any new one calls; it opens the panel, except on the
 * island, where a permission is answered from the pill (`IslandBar.svelte`):
 * there only a new question opens it. The first look (`seen` null) is no news.
 */
export function arrivals(permissions: readonly PermissionRequest[], questions: readonly QuestionRequest[], seen: ReadonlySet<string> | null, island: boolean): Arrivals {
  const asked = questions.filter((question) => !question.async).map((question) => question.id);
  const blocking = new Set([...permissions.map((request) => request.id), ...asked]);
  const fresh = (id: string) => seen !== null && !seen.has(id);
  return { blocking, call: [...blocking].some(fresh), open: (island ? asked : [...blocking]).some(fresh) };
}

/**
 * Where the card stands once the queue changed: on the same request when it
 * is still there, else at the same place, the last one if the end left.
 */
export function placeIn(queue: readonly PendingRequest[], currentId: string | null, index: number): number {
  if (queue.length === 0) return 0;
  const kept = currentId === null ? -1 : queue.findIndex((entry) => entry.id === currentId);
  if (kept >= 0) return kept;
  return Math.min(Math.max(index, 0), queue.length - 1);
}

/** One step back or forward, wrapping round. */
export function step(index: number, length: number, by: -1 | 1): number {
  if (length === 0) return 0;
  return (index + by + length) % length;
}

export type CardKey = { kind: 'allow' } | { kind: 'deny' } | { kind: 'pick'; optionId: string };

export interface KeyPress {
  key: string;
  /** Ctrl, Alt or Meta held: a shortcut of something else. */
  modified: boolean;
  /** The key went to a text field, which keeps its own keys. */
  typing: boolean;
  /** The key went to a button or a link, which Enter presses. */
  control: boolean;
}

/**
 * What a key does to the request in view. A permission: Enter allows once,
 * Escape denies. A question: 1 to 9 pick a choice (toggle it on a question
 * that takes several). Boite's core answers a permission allow or deny,
 * once; "always allow" is a rule Bots keeps and applies (`allow.svelte.ts`),
 * offered by a button, not a key.
 */
export function keyAction(pending: PendingRequest | null, press: KeyPress): CardKey | null {
  if (!pending || press.modified || press.typing) return null;
  if (pending.kind === 'permission') {
    if (press.key === 'Enter' && !press.control) return { kind: 'allow' };
    if (press.key === 'Escape') return { kind: 'deny' };
    return null;
  }
  if (press.key.length === 1 && press.key >= '1' && press.key <= '9') {
    const option = pending.request.options[Number(press.key) - 1];
    return option ? { kind: 'pick', optionId: option.id } : null;
  }
  return null;
}
