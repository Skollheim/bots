import { expect, test } from 'vitest';
import { fill, strings } from '../strings';
import type { RestLine } from './pill-rest';
import type { Pressure } from './pressure';
import { emphasis, fitWords, pillText, pillView, TITLE_MAX, type PillFacts } from './pill-view';

const copy = strings.island.pill;
const calm: PillFacts = { waiting: { count: 0, from: null }, told: null, rule: null, memory: null, rest: null, robot: false, focus: null, working: { count: 0, first: null }, goal: null };
const busy: PillFacts = { ...calm, working: { count: 3, first: 'Bench against legacy' }, goal: { done: 2, total: 5 } };
const quota: RestLine = { name: 'Max', doing: '18 % left', progress: null, kind: 'quota', tone: 'amber' };

test('someone waiting comes before everything else, in amber, the asking thread named', () => {
  const view = pillView({ ...busy, waiting: { count: 1, from: 'Atlas' }, told: { text: 'Port the scheduler · done', tone: 'done' }, rest: quota });
  expect(view).toMatchObject({ state: 'waiting', tone: 'attention', strong: 'Atlas', meta: null, progress: null });
  expect(pillText(view)).toBe(fill(copy.waitsOne, { name: 'Atlas' }));
  expect(pillView({ ...calm, waiting: { count: 1, from: null } }).strong).toBe(copy.someone);
});

test('several waiting are counted', () => {
  const view = pillView({ ...busy, waiting: { count: 3, from: 'Atlas' } });
  expect(view).toMatchObject({ state: 'waiting', tone: 'attention', strong: '3' });
  expect(pillText(view)).toBe(fill(copy.waitsMany, { count: '3' }));
});

test('a thread just ended is told next, green or red, then what a rule allowed with its shield', () => {
  expect(pillView({ ...busy, told: { text: 'Port the scheduler · done', tone: 'done' }, rule: 'Allowed by a rule', rest: quota })).toMatchObject({
    state: 'told',
    tone: 'done',
    glyph: null,
    after: 'Port the scheduler · done'
  });
  expect(pillView({ ...calm, told: { text: 'Tidy the README · failed', tone: 'failed' } }).tone).toBe('failed');
  expect(pillView({ ...busy, rule: 'Allowed by a rule · Bash · bun run test' })).toMatchObject({ state: 'told', tone: 'done', glyph: 'rule' });
});

test('at rest, what Settings chose comes before the agents at work, its mark tinted and not its words', () => {
  expect(pillView({ ...busy, rest: quota })).toMatchObject({ state: 'rest', tone: 'plain', glyph: 'quota', glyphTone: 'amber', strong: 'Max', after: ' 18 % left', progress: null });
  const timer: RestLine = { name: 'Work', doing: '24:59', progress: null, kind: 'timer', tone: 'amber', paused: true };
  expect(pillView({ ...busy, rest: timer })).toMatchObject({ glyph: 'timer', paused: true });
  expect(pillView({ ...busy, robot: true })).toMatchObject({ state: 'idle', strong: '', after: '' });
});

test('agents at work are counted, with the task list followed as a count and a hairline', () => {
  const view = pillView(busy);
  expect(view).toMatchObject({ state: 'working', tone: 'plain', strong: '3', meta: '2/5', progress: 0.4 });
  expect(pillText(view)).toBe(fill(copy.workingMany, { count: '3' }));
  expect(pillView({ ...busy, goal: null })).toMatchObject({ meta: null, progress: null });
  expect(pillText(pillView({ ...calm, working: { count: 1, first: 'Bench against legacy' } }))).toBe(fill(copy.workingOne, { name: 'Bench against legacy' }));
});

test('a thread followed or picked speaks alone: at work its goal, ended its state', () => {
  const focus: RestLine = { name: 'notes', doing: '2/5 Read queue.test.ts', progress: 0.4, kind: 'live', tone: 'working' };
  expect(pillView({ ...busy, focus })).toMatchObject({ state: 'working', strong: 'notes', meta: '2/5', progress: 0.4 });
  expect(pillView({ ...busy, focus: { ...focus, doing: 'Done', progress: null, tone: 'done' } })).toMatchObject({ tone: 'plain', strong: 'notes', after: ' · done', meta: null, progress: null });
  expect(pillView({ ...busy, focus: { ...focus, doing: 'Failed', tone: 'failed' } }).tone).toBe('failed');
});

test('with nothing going on, the robot alone', () => {
  expect(pillView(calm)).toMatchObject({ state: 'idle', strong: '', after: '', meta: null, progress: null });
});

test('long titles are cut on a word, never in one', () => {
  expect(fitWords('Port the scheduler', 28)).toBe('Port the scheduler');
  expect(fitWords('Write the bench runner inside the project', 28)).toBe('Write the bench runner…');
  expect(fitWords('Fix it: the login', 9)).toBe('Fix it…');
  expect(fitWords('Supercalifragilistic', 8)).toBe('Superca…');
  const named = pillView({ ...calm, waiting: { count: 1, from: 'Bench against legacy and the new parser' } }).strong;
  expect(named.length).toBeLessThanOrEqual(TITLE_MAX + 1);
  expect(named.endsWith('…')).toBe(true);
});

test('a template is split around its value', () => {
  expect(emphasis('{name} is waiting for you', 'name', 'Atlas')).toEqual({ before: '', strong: 'Atlas', after: ' is waiting for you' });
  expect(emphasis('Wait for {name}', 'name', 'Atlas')).toEqual({ before: 'Wait for ', strong: 'Atlas', after: '' });
});

test('the memory warning comes after a request and a thing told, before the rest and the agents, its chip tinted', () => {
  const GB = 1024 * 1024 * 1024;
  const pressure: Pressure = { reason: 'machine', threadId: 't', title: 'Unity build', bytes: 0.6 * GB, used: 2.8 * GB, limit: 3.2 * GB };
  const memory = { pressure, red: true };
  expect(pillView({ ...busy, waiting: { count: 1, from: 'Atlas' }, memory }).state).toBe('waiting');
  expect(pillView({ ...busy, told: { text: 'Port the scheduler · done', tone: 'done' }, memory }).state).toBe('told');
  const view = pillView({ ...busy, rest: quota, robot: true, memory });
  expect(view).toMatchObject({ state: 'rest', tone: 'plain', glyph: 'memory', glyphTone: 'red', strong: '2.8 GB', meta: null });
  expect(pillText(view)).toBe(fill(copy.memory.machine, { used: '2.8 GB' }));
  const thread = pillView({ ...calm, memory: { pressure: { ...pressure, reason: 'thread', used: 3.5 * GB, limit: 4 * GB }, red: false } });
  expect(pillText(thread)).toBe(fill(copy.memory.thread, { title: 'Unity build', used: '3.5 GB', limit: '4.0 GB' }));
  expect(thread.glyphTone).toBe('amber');
});
