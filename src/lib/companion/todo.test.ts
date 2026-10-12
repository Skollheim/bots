import { afterEach, expect, test } from 'vitest';
import { applyTodo, changeTodos, parseTodo, readTodos, today, TODO_KEY, TODO_LENGTH, TODO_LIMIT, todoBlock, todoCount, writeTodos, type TodoItem } from './todo';

afterEach(() => window.localStorage.clear());

const at = (day: number, hours: number) => new Date(2026, 9, day, hours).getTime();
const now = at(9, 14);
const item = (id: string, text: string, doneAt: number | null = null): TodoItem => ({ id, text, doneAt, at: at(9, 8) });

test('a line reads as the ops it asks', () => {
  expect(parseTodo('add | gym at 18:00')).toEqual([{ kind: 'add', text: 'gym at 18:00' }]);
  expect(parseTodo('add |   ')).toEqual([]);
  expect(parseTodo('done | 2')).toEqual([{ kind: 'done', index: 2 }]);
  expect(parseTodo('check | 1, 3')).toEqual([{ kind: 'done', index: 1 }, { kind: 'done', index: 3 }]);
  expect(parseTodo('uncheck | #2')).toEqual([{ kind: 'undo', index: 2 }]);
  expect(parseTodo('delete | 4')).toEqual([{ kind: 'remove', index: 4 }]);
  expect(parseTodo('rename | 2 | call the bank | today')).toEqual([{ kind: 'rename', index: 2, text: 'call the bank | today' }]);
  expect(parseTodo('rename | 2')).toEqual([]);
  expect(parseTodo('clear')).toEqual([{ kind: 'clear', all: false }]);
  expect(parseTodo('clear | all')).toEqual([{ kind: 'clear', all: true }]);
  expect(parseTodo('done | two')).toEqual([]);
  expect(parseTodo('juggle | 1')).toEqual([]);
  expect(parseTodo(`add | ${'x'.repeat(TODO_LENGTH + 10)}`)[0]).toEqual({ kind: 'add', text: 'x'.repeat(TODO_LENGTH) });
});

test('numbers name the items as the list stood, whatever went before', () => {
  const list = [item('a', 'one'), item('b', 'two'), item('c', 'three')];
  const next = applyTodo(list, [{ kind: 'remove', index: 1 }, { kind: 'done', index: 2 }, { kind: 'rename', index: 3, text: '  3rd  item ' }, { kind: 'done', index: 9 }], now);
  expect(next).toEqual([item('b', 'two', now), item('c', '3rd item')]);
  expect(applyTodo(next, [{ kind: 'undo', index: 1 }, { kind: 'add', text: 'four' }], now).map((entry) => [entry.text, entry.doneAt])).toEqual([
    ['two', null],
    ['3rd item', null],
    ['four', null]
  ]);
});

test('a tick keeps its time, clear lets the done ones go, or all', () => {
  const list = [item('a', 'one', at(9, 9)), item('b', 'two')];
  expect(applyTodo(list, [{ kind: 'done', index: 1 }], now)[0]!.doneAt).toBe(at(9, 9));
  expect(applyTodo(list, [{ kind: 'clear', all: false }], now).map((entry) => entry.id)).toEqual(['b']);
  expect(applyTodo(list, [{ kind: 'clear', all: true }], now)).toEqual([]);
});

test('the list keeps its newest items past the limit', () => {
  const ops = Array.from({ length: TODO_LIMIT + 5 }, (_, index) => ({ kind: 'add' as const, text: `item ${index}` }));
  const next = applyTodo([], ops, now);
  expect(next).toHaveLength(TODO_LIMIT);
  expect(next[0]!.text).toBe('item 5');
  expect(new Set(next.map((entry) => entry.id)).size).toBe(TODO_LIMIT);
});

test('the done ones of an earlier day are gone the next', () => {
  const list = [item('a', 'one', at(8, 23)), item('b', 'two', at(9, 0)), item('c', 'three')];
  expect(today(list, now).map((entry) => entry.id)).toEqual(['b', 'c']);
});

test('the request line numbers the list, ticks shown, and nothing when it is empty', () => {
  expect(todoBlock([])).toBeNull();
  expect(todoBlock([item('a', 'buy [milk]'), item('b', 'call', now)])).toBe('to-do list: 1. [ ] buy  milk ; 2. [x] call');
  expect(todoCount([item('a', 'one'), item('b', 'two', now)])).toEqual({ done: 1, total: 2 });
});

test('the list is kept per core, read back whole, bad entries dropped', () => {
  changeTodos('desk', [{ kind: 'add', text: 'one' }, { kind: 'add', text: 'two' }], now);
  changeTodos('desk', [{ kind: 'done', index: 2 }], now);
  changeTodos('server', [{ kind: 'add', text: 'other' }], now);
  expect(readTodos('desk', now).map((entry) => [entry.text, entry.doneAt])).toEqual([
    ['one', null],
    ['two', now]
  ]);
  expect(readTodos('server', now).map((entry) => entry.text)).toEqual(['other']);
  // The next day, the tick is gone.
  expect(readTodos('desk', at(10, 8)).map((entry) => entry.text)).toEqual(['one']);
  writeTodos('server', []);
  expect(JSON.parse(window.localStorage.getItem(TODO_KEY)!)).not.toHaveProperty('server');
  window.localStorage.setItem(TODO_KEY, JSON.stringify({ desk: [{ id: 'x' }, item('a', 'kept'), 'nope'] }));
  expect(readTodos('desk', now).map((entry) => entry.id)).toEqual(['a']);
});
