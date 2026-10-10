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
 * that takes several). Boite's core has no "always allow" to offer: a
 * permission is answered allow or deny, once.
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
