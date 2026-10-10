import { expect, test } from 'vitest';
import { fill, strings } from '../strings';
import { islandStatus } from './status';

const calm = { blocking: 0, finished: false, talking: null, busy: 0 };

test('a request waiting comes before everything else', () => {
  expect(islandStatus({ blocking: 1, finished: true, talking: 'Ada', busy: 3 })).toEqual({ text: strings.island.waitingOne, tone: 'attention' });
  expect(islandStatus({ ...calm, blocking: 2 }).text).toBe(fill(strings.island.waitingMany, { count: '2' }));
});

test('a finished turn, then a reply on its way, then the agents at work', () => {
  expect(islandStatus({ ...calm, finished: true, talking: 'Ada', busy: 1 }).tone).toBe('done');
  expect(islandStatus({ ...calm, talking: 'Ada', busy: 1 })).toEqual({ text: fill(strings.island.talking, { name: 'Ada' }), tone: 'talking' });
  expect(islandStatus({ ...calm, talking: '' }).text).toBe(fill(strings.island.talking, { name: strings.island.label }));
  expect(islandStatus({ ...calm, busy: 1 }).text).toBe(fill(strings.island.busyOne, { count: '1' }));
  expect(islandStatus({ ...calm, busy: 4 })).toEqual({ text: fill(strings.island.busyMany, { count: '4' }), tone: 'working' });
});

test('with nothing going on, all is quiet', () => {
  expect(islandStatus(calm)).toEqual({ text: strings.island.quiet, tone: 'idle' });
});
