import { expect, test } from 'vitest';
import type { PermissionRequest, QuestionRequest } from '@boite/contracts';
import { keyAction, placeIn, requestQueue, step } from './requests';

const permission = (id: string, createdAt: number): PermissionRequest => ({ id, threadId: 't', turnId: 'u', toolName: 'Bash', input: { command: 'ls' }, description: null, createdAt });
const question = (id: string, createdAt: number, extra: Partial<QuestionRequest> = {}): QuestionRequest => ({
  id,
  threadId: 't',
  turnId: 'u',
  text: 'Which one?',
  options: [{ id: 'short', label: 'Short' }, { id: 'long', label: 'Long' }],
  allowText: true,
  multiple: false,
  createdAt,
  ...extra
});

const press = (key: string, extra: { modified?: boolean; typing?: boolean; control?: boolean } = {}) => ({ key, modified: false, typing: false, control: false, ...extra });

test('permissions come first, then the questions an agent stopped for, oldest first', () => {
  const queue = requestQueue([permission('p2', 20), permission('p1', 10)], [question('q2', 5), question('q1', 1), question('later', 0, { async: true })]);
  expect(queue.map((entry) => entry.id)).toEqual(['p1', 'p2', 'q1', 'q2']);
});

test('the card stays on its request when the queue changes, else at its place', () => {
  const queue = requestQueue([permission('a', 1), permission('b', 2), permission('c', 3)], []);
  expect(placeIn(queue, 'c', 0)).toBe(2);
  expect(placeIn(queue, 'gone', 1)).toBe(1);
  expect(placeIn(queue, 'gone', 5)).toBe(2);
  expect(placeIn([], 'a', 3)).toBe(0);
});

test('previous and next wrap round', () => {
  expect(step(0, 3, -1)).toBe(2);
  expect(step(2, 3, 1)).toBe(0);
  expect(step(0, 0, 1)).toBe(0);
});

test('a permission: Enter allows once, Escape denies, nothing else', () => {
  const [pending] = requestQueue([permission('p', 1)], []);
  expect(keyAction(pending!, press('Enter'))).toEqual({ kind: 'allow' });
  expect(keyAction(pending!, press('Escape'))).toEqual({ kind: 'deny' });
  expect(keyAction(pending!, press('a'))).toBeNull();
  expect(keyAction(pending!, press('1'))).toBeNull();
});

test('Enter on a focused button presses that button, never allows behind it', () => {
  const [pending] = requestQueue([permission('p', 1)], []);
  expect(keyAction(pending!, press('Enter', { control: true }))).toBeNull();
  expect(keyAction(pending!, press('Escape', { control: true }))).toEqual({ kind: 'deny' });
});

test('a question: 1 to 9 pick a choice that exists', () => {
  const [pending] = requestQueue([], [question('q', 1)]);
  expect(keyAction(pending!, press('1'))).toEqual({ kind: 'pick', optionId: 'short' });
  expect(keyAction(pending!, press('2'))).toEqual({ kind: 'pick', optionId: 'long' });
  expect(keyAction(pending!, press('3'))).toBeNull();
  expect(keyAction(pending!, press('Enter'))).toBeNull();
});

test('keys typed in a field or with a modifier are left alone', () => {
  const [pending] = requestQueue([permission('p', 1)], []);
  expect(keyAction(pending!, press('Enter', { typing: true }))).toBeNull();
  expect(keyAction(pending!, press('Escape', { modified: true }))).toBeNull();
  expect(keyAction(null, press('Enter'))).toBeNull();
});
