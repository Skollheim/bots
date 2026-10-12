/*
 * The user's to-do list: plain items, tied to no thread, that the companion
 * keeps when asked (`[[todo: add | gym at 18:00]]`, `[[todo: done | 2]]`) and
 * the island's Home shows (`TodoCard.svelte`), ticked by hand too. Per core,
 * in `localStorage` (`per-core.ts`). A done item stays, struck through, until
 * the user clears the done ones, or until the next day: yesterday's ticks are
 * let go the first time the list is read on a later day. Pure.
 */
import { indexOf } from './missions';
import { cleanText, makeId, readPerCore, subscribePerCore, writePerCore } from './per-core';

export interface TodoItem {
  id: string;
  text: string;
  /** When it was ticked, epoch milliseconds; null while it is still to do. */
  doneAt: number | null;
  /** When it was added. */
  at: number;
}

/** What a reply asks of the list; an item is named by its number in the list the request line carried. */
export type TodoOp =
  | { kind: 'add'; text: string }
  | { kind: 'done' | 'undo' | 'remove'; index: number }
  | { kind: 'rename'; index: number; text: string }
  | { kind: 'clear'; all: boolean };

export const TODO_KEY = 'bots.todo';
export const TODO_LIMIT = 50;
export const TODO_LENGTH = 200;

const OP_NAMES = new Map<string, 'done' | 'undo' | 'remove'>([
  ['done', 'done'],
  ['check', 'done'],
  ['tick', 'done'],
  ['undo', 'undo'],
  ['uncheck', 'undo'],
  ['untick', 'undo'],
  ['remove', 'remove'],
  ['delete', 'remove']
]);

/**
 * `add | text`, `done | 2` (or `done | 1, 3`), `undo | 2`, `rename | 2 | new
 * text`, `remove | 2`, `clear` (the done items) or `clear | all`. The ops a
 * line asks; none when it cannot be read.
 */
export function parseTodo(content: string): TodoOp[] {
  const bar = content.indexOf('|');
  const head = (bar < 0 ? content : content.slice(0, bar)).trim().toLowerCase();
  const rest = bar < 0 ? '' : content.slice(bar + 1).trim();
  if (head === 'add') {
    const text = cleanText(rest, TODO_LENGTH);
    return text ? [{ kind: 'add', text }] : [];
  }
  if (head === 'clear') return [{ kind: 'clear', all: /^(all|everything|tout)$/i.test(rest) }];
  if (head === 'rename' || head === 'edit') {
    const second = rest.indexOf('|');
    const index = second < 0 ? null : indexOf(rest.slice(0, second));
    const text = second < 0 ? '' : cleanText(rest.slice(second + 1), TODO_LENGTH);
    return index !== null && text ? [{ kind: 'rename', index, text }] : [];
  }
  const kind = OP_NAMES.get(head);
  if (!kind) return [];
  const indexes = rest.split(/[\s,]+/).filter(Boolean).map(indexOf);
  if (indexes.length === 0 || indexes.some((index) => index === null)) return [];
  return indexes.map((index) => ({ kind, index: index! }));
}

/** Local midnight of the day `now` falls in. */
const dayStart = (now: number) => {
  const at = new Date(now);
  return new Date(at.getFullYear(), at.getMonth(), at.getDate()).getTime();
};

/** The list as the day shows it: items ticked on an earlier day are gone. */
export function today(items: readonly TodoItem[], now: number): TodoItem[] {
  const start = dayStart(now);
  return items.filter((item) => item.doneAt === null || item.doneAt >= start);
}

/**
 * The list once the ops are done, in order. Numbers name the items as the
 * list stood when the reply was asked for, so `remove | 1` then `done | 2`
 * still mean the first and second the agent saw. A number past the list does
 * nothing.
 */
export function applyTodo(items: readonly TodoItem[], ops: readonly TodoOp[], now: number): TodoItem[] {
  const seen = [...items];
  const idOf = (index: number) => seen[index - 1]?.id ?? null;
  let next = [...items];
  const change = (index: number, update: (item: TodoItem) => TodoItem | null) => {
    const id = idOf(index);
    if (id !== null) next = next.flatMap((item) => (item.id !== id ? [item] : (update(item) ?? [])));
  };
  for (const op of ops) {
    if (op.kind === 'add') {
      const text = cleanText(op.text, TODO_LENGTH);
      if (text) next = [...next, { id: makeId(now), text, doneAt: null, at: now }];
    } else if (op.kind === 'clear') next = op.all ? [] : next.filter((item) => item.doneAt === null);
    else if (op.kind === 'done') change(op.index, (item) => ({ ...item, doneAt: item.doneAt ?? now }));
    else if (op.kind === 'undo') change(op.index, (item) => ({ ...item, doneAt: null }));
    else if (op.kind === 'remove') change(op.index, () => null);
    else if (op.kind === 'rename') change(op.index, (item) => ({ ...item, text: cleanText(op.text, TODO_LENGTH) || item.text }));
  }
  return next.slice(-TODO_LIMIT);
}

/** The list, numbered for `[[todo: done | N]]`; null when it is empty. */
export function todoBlock(items: readonly TodoItem[]): string | null {
  if (items.length === 0) return null;
  return `to-do list: ${items.map((item, index) => `${index + 1}. [${item.doneAt === null ? ' ' : 'x'}] ${item.text.replace(/[[\]\n]/g, ' ')}`).join('; ')}`;
}

/** Done and total, for the card's counter. */
export function todoCount(items: readonly TodoItem[]): { done: number; total: number } {
  return { done: items.filter((item) => item.doneAt !== null).length, total: items.length };
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------

export function parseStoredTodo(entry: unknown): TodoItem | null {
  const { id, text, doneAt, at } = (entry ?? {}) as Record<string, unknown>;
  if (typeof id !== 'string' || typeof text !== 'string' || text.trim() === '' || typeof at !== 'number' || !Number.isFinite(at)) return null;
  return { id, text, at, doneAt: typeof doneAt === 'number' && Number.isFinite(doneAt) ? doneAt : null };
}

/** The list of `core`, as `today` shows it. */
export function readTodos(core: string, now = Date.now()): TodoItem[] {
  return today(readPerCore(TODO_KEY, core, parseStoredTodo), now);
}

export function writeTodos(core: string, items: readonly TodoItem[]): void {
  writePerCore(TODO_KEY, core, items.slice(-TODO_LIMIT));
}

/** Applies the ops to the stored list and keeps the result. */
export function changeTodos(core: string, ops: readonly TodoOp[], now = Date.now()): TodoItem[] {
  const next = applyTodo(readTodos(core, now), ops, now);
  writeTodos(core, next);
  return next;
}

export const subscribeTodos = (listener: () => void): (() => void) => subscribePerCore(TODO_KEY, listener);
