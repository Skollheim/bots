/*
 * The deck's top-left character: the next agent a click turns to, and the
 * look each one wears on the island.
 */
import { expect, test } from 'vitest';
import type { AgentProfile } from '@boite/contracts';
import { CLASSIC_ROBOT } from '../companion/crew';
import { encodeRobot, type Robot } from '../robots';
import { islandMember, islandSkin, nextAgent } from './swap';

const keys = (...names: string[]) => names.map((key) => ({ key }));

test('a click turns to the next agent, round to the first after the last', () => {
  const agents = keys('bots', 'nuno', 'core-b/scout');
  expect(nextAgent(agents, 'bots')?.key).toBe('nuno');
  expect(nextAgent(agents, 'nuno')?.key).toBe('core-b/scout');
  expect(nextAgent(agents, 'core-b/scout')?.key).toBe('bots');
  // Every agent is reached once before the first comes back.
  const seen: string[] = [];
  let at: string | null = 'bots';
  for (let step = 0; step < agents.length; step++) seen.push((at = nextAgent(agents, at)!.key));
  expect(seen).toEqual(['nuno', 'core-b/scout', 'bots']);
});

test('two agents swap back and forth; with one or none there is nothing to turn to', () => {
  const pair = keys('bots', 'nuno');
  expect(nextAgent(pair, 'bots')?.key).toBe('nuno');
  expect(nextAgent(pair, 'nuno')?.key).toBe('bots');
  expect(nextAgent(keys('bots'), 'bots')).toBeNull();
  expect(nextAgent([], null)).toBeNull();
});

test('an agent no longer listed turns to the one after the first', () => {
  expect(nextAgent(keys('bots', 'nuno', 'atlas'), 'gone')?.key).toBe('nuno');
  expect(nextAgent(keys('bots', 'nuno'), null)?.key).toBe('nuno');
});

const profile = (id: string, avatar = ''): AgentProfile =>
  ({ id, revision: 1, createdAt: 0, updatedAt: 0, name: id, domain: '', instructions: '', avatar, selection: { providerId: 'claude', accountId: 'a', model: null, effort: null, permissionMode: 'default' }, status: 'active', tools: [], accountIntegration: 'provider' }) as AgentProfile;
const local = (id: string, avatar = '') => ({ key: id, coreId: null, profile: profile(id, avatar) });

const mascot: Robot = { family: 'jelly', shape: 1, color: 2, eyes: 3, top: 0 };
const retro: Robot = { family: 'retro', shape: 1, color: 6, eyes: 2, top: 1 };

test('on the island, an agent of the row wears its look there (the lead the mascot), another its own face', () => {
  const members = [{ id: 'bots', skin: mascot }, { id: 'nuno', skin: retro }];
  expect(islandSkin(local('bots'), members)).toEqual(mascot);
  expect(islandSkin(local('nuno', encodeRobot(retro)), members)).toEqual(retro);
  // Outside the row: its own face, B.O.T.S's when it chose none.
  expect(islandSkin(local('atlas'), members)).toEqual(CLASSIC_ROBOT);
  expect(islandSkin(local('ledger', encodeRobot(retro)), members)).toEqual(retro);
  // Another machine's agent of the same id is not this machine's lead.
  expect(islandSkin({ key: 'core-b/bots', coreId: 'core-b', profile: profile('bots') }, members)).toEqual(CLASSIC_ROBOT);
});

test('with no row made, the agent the Chat lands on unasked is the island’s lone character', () => {
  const lone = [{ id: '', skin: mascot }];
  expect(islandMember(local('atlas'), lone, 'atlas')).toBe(lone[0]);
  expect(islandSkin(local('atlas'), lone, 'atlas')).toEqual(mascot);
  // Any other agent wears its own face.
  expect(islandMember(local('ledger', encodeRobot(retro)), lone, 'atlas')).toBeUndefined();
  expect(islandSkin(local('ledger', encodeRobot(retro)), lone, 'atlas')).toEqual(retro);
  // No mascot chosen: B.O.T.S's own face, as the pill shows.
  expect(islandSkin(local('atlas'), [{ id: '', skin: null }], 'atlas')).toEqual(CLASSIC_ROBOT);
});
