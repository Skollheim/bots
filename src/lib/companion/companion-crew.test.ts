/*
 * The agents that stand as the companion: the look each one wears, the row
 * read from the agents snapshot, the replies and memories the companion reads
 * and saves back, the agent it makes, and the notes it shows besides.
 */
import { afterEach, expect, test, vi } from 'vitest';
import type { Account, AgentConversationMessage, AgentMemory, AgentProfile, AgentScope, AgentsSnapshot, ProviderSummary } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { BOX_COLORS, boxColorOf, encodeRobot, ROBOT_FAMILIES, ROBOT_PARTS, robotOf, seededRobot, type Robot } from '../robots';
import { strings } from '../strings';
import type { Brain } from './brain';
import { ROLE_START } from './brain';
import { AGENT_TOOLS, CLASSIC_SKIN, companionAgent, freshSkin, membersOf, memoriesToForget, memoryToKeep, needsFirstAgent, profileWith, repliesAfter, replyTo, skinOf } from './crew';
import { Crew } from './crew.svelte';
import { addReminder, readMemory, readReminders, remember } from './memory';
import { Notes } from './notes.svelte';
import { readCompanionPrefs, writeCompanionPrefs } from './prefs';

afterEach(() => {
  vi.useRealTimers();
  window.localStorage.clear();
});

const record = { revision: 3, createdAt: 0, updatedAt: 0 };
const direct = (id: string): AgentScope => ({ kind: 'agent', id });
const BRAIN: Brain = { providerId: 'claude', accountId: 'acc', model: 'haiku', effort: null };

const profile = (id: string, extra: Partial<AgentProfile> = {}): AgentProfile => ({
  ...record,
  id,
  name: id,
  domain: '',
  instructions: '',
  avatar: '',
  selection: { ...BRAIN, permissionMode: 'default' },
  status: 'active',
  tools: [],
  accountIntegration: 'provider',
  ...extra
});

/** The agent a core keeps for a profile save: what was sent, under `id`. */
const madeFrom = (id: string, save: unknown): AgentProfile => profile(id, (save as { value: Partial<AgentProfile> }).value);

const said =(id: string, senderId: string | null, createdAt: number, extra: Partial<AgentConversationMessage> = {}): AgentConversationMessage => ({
  ...record,
  id,
  scope: direct('bots'),
  senderId,
  text: id,
  recipientIds: [],
  replyTo: null,
  episodeId: 'e',
  sourceRunId: null,
  createdAt,
  ...extra
});

const memory = (id: string, text: string, scope = direct('bots')): AgentMemory => ({ ...record, id, scope, title: text, text, sourceScopes: [scope], sourceRunId: null, expiresAt: null });

const snapshotOf = (part: Partial<AgentsSnapshot>) => ({ profiles: [], messages: [], sessions: [], work: [], memories: [], ...part }) as unknown as AgentsSnapshot;

// ---------------------------------------------------------------------------
// Looks
// ---------------------------------------------------------------------------

test('an agent stands as its own robot, of any family, or the box its id draws when its picture is text', () => {
  expect(skinOf(profile('bots', { avatar: CLASSIC_SKIN }))).toEqual({ family: 'box', shape: 0, color: 0, eyes: 0, top: 0 });
  const box = { family: 'box', shape: 4, color: 7, eyes: 2, top: 5 } as const;
  expect(skinOf(profile('a', { avatar: encodeRobot(box) }))).toEqual(box);
  for (const family of ['jelly', 'bubble', 'capsule', 'retro'] as const) {
    const robot = { family, shape: 1, color: 2, eyes: 1, top: 3 };
    expect(skinOf(profile('a', { avatar: encodeRobot(robot) }))).toEqual(robot);
  }
  // No avatar: the robot the Agents page draws for its id.
  expect(skinOf(profile('seeded'))).toEqual(seededRobot('seeded'));
  expect(skinOf(profile('emoji', { avatar: '🦊' }))).toEqual(seededRobot('emoji', 'box'));
});

test('a fresh look takes a family and a colour nobody wears, never the classic body, a box always with an accessory', () => {
  const box = (color: number): Robot => ({ family: 'box', shape: 0, color, eyes: 0, top: 0 });
  const seeds = Array.from({ length: 40 }, (_, index) => `seed-${index}`);
  for (const seed of seeds) {
    const others = [box(0), box(1), box(2), box(3)];
    const skin = robotOf('x', freshSkin(seed, others))!;
    expect(skin.family).not.toBe('box');
    expect(boxColorOf(skin)).toBeGreaterThan(3);
    expect(freshSkin(seed, others)).toBe(freshSkin(seed, others));
  }
  // Over many seeds, every family but the one worn comes up.
  const drawn = new Set(seeds.map((seed) => robotOf('x', freshSkin(seed, [box(0)]))!.family));
  expect([...drawn].sort()).toEqual(['bubble', 'capsule', 'jelly', 'retro']);
  // Every family worn: any family again, a box with an accessory on its lid.
  const crowd: Robot[] = ROBOT_FAMILIES.map((family) => ({ family, shape: 0, color: 0, eyes: 0, top: 0 }));
  const boxes = seeds.map((seed) => robotOf('x', freshSkin(seed, crowd))!).filter((skin) => skin.family === 'box');
  expect(boxes.length).toBeGreaterThan(0);
  for (const skin of boxes) {
    expect(skin.color).toBeGreaterThan(0);
    expect(skin.top).toBeGreaterThan(0);
    expect(skin.top).toBeLessThan(ROBOT_PARTS.box.top);
  }
  // Every colour worn: still never the classic body.
  const all = [...crowd, ...Array.from({ length: BOX_COLORS }, (_, color) => box(color))];
  for (const seed of seeds) expect(boxColorOf(robotOf('x', freshSkin(seed, all))!)).toBeGreaterThan(0);
  // One box colour left: a jelly takes it, as its own colour one below.
  const jellies: Robot[] = ['box', 'bubble', 'capsule', 'retro'].map((family) => ({ family, shape: 0, color: 0, eyes: 0, top: 0 }) as Robot);
  const lastFree = [...jellies, ...Array.from({ length: BOX_COLORS }, (_, color) => box(color)).filter((robot) => robot.color !== 6)];
  const last = robotOf('x', freshSkin('one-left', lastFree))!;
  expect(last).toMatchObject({ family: 'jelly', color: 5 });
});

// ---------------------------------------------------------------------------
// The row and its conversations
// ---------------------------------------------------------------------------

test('the row keeps the order the user gave it, an archived or deleted agent left out', () => {
  const snapshot = snapshotOf({ profiles: [profile('a'), profile('b'), profile('gone', { status: 'archived' }), profile('paused', { status: 'paused' })] });
  expect(membersOf(snapshot, ['b', 'missing', 'gone', 'a', 'paused']).map((agent) => agent.id)).toEqual(['b', 'a', 'paused']);
  expect(membersOf(null, ['a'])).toEqual([]);
});

test('a core needs the first agent until one the preferences name is its own, archived or not', () => {
  const snapshot = snapshotOf({ profiles: [profile('a'), profile('gone', { status: 'archived' })] });
  expect(needsFirstAgent(snapshot, { agents: [], crewMade: false })).toBe(true);
  expect(needsFirstAgent(snapshot, { agents: ['a'], crewMade: true })).toBe(false);
  expect(needsFirstAgent(snapshot, { agents: ['gone'], crewMade: true })).toBe(false);
  // Made on another core: none of those agents is this one's.
  expect(needsFirstAgent(snapshot, { agents: ['elsewhere'], crewMade: true })).toBe(true);
  // A row the user emptied stays empty.
  expect(needsFirstAgent(snapshot, { agents: [], crewMade: true })).toBe(false);
});

test('a request gets the reply its agent wrote to it; a note about an entrusted thread is no reply', () => {
  const snapshot = snapshotOf({
    messages: [
      said('u1', null, 1),
      said('note', 'bots', 2, { thread: { id: 't', title: 'Fix', event: 'done' } }),
      said('other', 'helper', 3, { replyTo: 'u1', scope: direct('helper') }),
      said('r1', 'bots', 4, { replyTo: 'u1' }),
      said('r2', 'bots', 6)
    ]
  });
  expect(replyTo(snapshot, 'bots', 'u1')?.id).toBe('r1');
  expect(replyTo(snapshot, 'bots', 'u9')).toBeNull();
  expect(repliesAfter(snapshot, 'bots', 0).map((message) => message.id)).toEqual(['r1', 'r2']);
  expect(repliesAfter(snapshot, 'bots', 4).map((message) => message.id)).toEqual(['r2']);
  // Each agent has its own conversation.
  expect(repliesAfter(snapshot, 'helper', 0).map((message) => message.id)).toEqual(['other']);
});

test('a fact is kept once in the agent memory, and a forget expires the memories it names', () => {
  const memories = [memory('m1', 'Plays Overwatch on Fridays'), memory('m2', 'Is called Chris')];
  expect(memoryToKeep(memories, 'bots', '  ')).toBeNull();
  expect(memoryToKeep(memories, 'bots', 'is called  chris.')).toBeNull();
  expect(memoryToKeep(memories, 'bots', 'Likes  green\ntea')).toEqual({
    value: { scope: direct('bots'), title: 'Likes green tea', text: 'Likes green tea', sourceScopes: [direct('bots')], sourceRunId: null, expiresAt: null }
  });
  const forgotten = memoriesToForget(memories, 'overwatch', 42);
  expect(forgotten).toEqual([{ id: 'm1', expectedRevision: 3, value: { scope: direct('bots'), title: 'Plays Overwatch on Fridays', text: 'Plays Overwatch on Fridays', sourceScopes: [direct('bots')], sourceRunId: null, expiresAt: 42 } }]);
  expect(memoriesToForget(memories, 'nothing like it', 42)).toEqual([]);
});

test('the companion makes an active agent with its tools, and saves another look at the revision it read', () => {
  const made = companionAgent('Bots', 'Desk', 'Role', CLASSIC_SKIN, BRAIN, 'bypassPermissions');
  expect(made).toEqual({
    value: { name: 'Bots', domain: 'Desk', instructions: 'Role', avatar: CLASSIC_SKIN, selection: { ...BRAIN, permissionMode: 'bypassPermissions' }, status: 'active', tools: AGENT_TOOLS, accountIntegration: 'provider' }
  });
  made.value.tools.push('extra');
  expect(AGENT_TOOLS).not.toContain('extra');
  const agent = profile('bots', { name: 'Bots', instructions: 'Mine', tools: ['memory'] });
  const saved = profileWith(agent, { avatar: 'robot:b.1.2.3.4' });
  expect(saved).toMatchObject({ id: 'bots', expectedRevision: 3, value: { name: 'Bots', instructions: 'Mine', avatar: 'robot:b.1.2.3.4', tools: ['memory'] } });
  expect(saved.value).not.toHaveProperty('revision');
});

test('a first agent that could not be made is tried again, later on its own and at once when asked', async () => {
  vi.useFakeTimers();
  writeCompanionPrefs({ providerId: 'claude', accountId: 'acc' });
  // At startup the core is still checking the account.
  let status = 'checking';
  const saves: unknown[] = [];
  const call = vi.fn(async (method: string, params?: unknown) => {
    // The core shows the agent once it is made.
    if (method === 'agents.snapshot') return snapshotOf({ profiles: saves.map((save) => madeFrom('bots', save)) });
    if (method === 'providers.list') return { loaded: [{ id: 'claude', name: 'Claude', shortName: 'Claude', protocol: 'acp', available: true, models: [] } as unknown as ProviderSummary], rejected: [] };
    if (method === 'accounts.list') return [{ id: 'acc', providerId: 'claude', label: 'acc', status } as Account];
    if (method === 'agents.profile.save') {
      saves.push(params);
      return profile('bots');
    }
    return {};
  });
  const client = { call } as unknown as Client;
  const crew = new Crew({ client: () => client, prefs: readCompanionPrefs, projects: () => ['boite'], waiting: () => false, answered: () => {}, loaded: () => {} });
  const settle = async () => {
    for (let tick = 0; tick < 30; tick += 1) await Promise.resolve();
  };
  const asked = () => call.mock.calls.filter(([method]) => method === 'providers.list').length;

  await crew.load();
  await settle();
  expect(crew.problem).toBe(strings.companion.brainOff);
  expect(asked()).toBe(1);
  await vi.advanceTimersByTimeAsync(61_000);
  await settle();
  expect(asked()).toBe(2);
  expect(saves).toEqual([]);

  status = 'ok';
  crew.retry();
  await vi.advanceTimersByTimeAsync(200);
  await settle();
  expect(saves).toHaveLength(1);
  expect(crew.problem).toBeNull();
  expect(readCompanionPrefs()).toMatchObject({ agents: ['bots'], crewMade: true });
  crew.retry();
  await vi.advanceTimersByTimeAsync(200);
  await settle();
  expect(saves).toHaveLength(1);
  crew.dispose();
});

test('agents remembered from another core do not hold the row: Bots makes its agent here, or takes back the one with the role', async () => {
  const providers = { loaded: [{ id: 'claude', name: 'Claude', shortName: 'Claude', protocol: 'acp', available: true, models: [] } as unknown as ProviderSummary], rejected: [] };
  let profiles = [profile('helper')];
  // The agents made; a save naming an id only updates that one.
  const made: unknown[] = [];
  const call = vi.fn(async (method: string, params?: unknown) => {
    if (method === 'agents.snapshot') return snapshotOf({ profiles });
    if (method === 'providers.list') return providers;
    if (method === 'accounts.list') return [{ id: 'acc', providerId: 'claude', label: 'acc', status: 'ok' } as Account];
    if (method === 'agents.profile.save') {
      const id = (params as { id?: string }).id;
      if (id === undefined) made.push(params);
      const saved = madeFrom(id ?? 'bots', params);
      profiles = [...profiles.filter((kept) => kept.id !== saved.id), saved];
      return saved;
    }
    return {};
  });
  const client = { call } as unknown as Client;
  const host = { client: () => client, prefs: readCompanionPrefs, projects: () => ['boite'], waiting: () => false, answered: () => {}, loaded: () => {} };

  writeCompanionPrefs({ agents: ['elsewhere'], crewMade: true });
  const crew = new Crew(host);
  await crew.load();
  await vi.waitFor(() => expect(crew.members.map((agent) => agent.id)).toEqual(['bots']));
  expect(readCompanionPrefs()).toMatchObject({ agents: ['bots'], crewMade: true });
  // Read again, the row holds: no second agent.
  await crew.load();
  expect(made).toHaveLength(1);
  crew.dispose();

  // A core where Bots made its agent before gets that one back.
  writeCompanionPrefs({ agents: ['elsewhere'], crewMade: true });
  profiles = [profile('helper'), profile('old', { instructions: `Mine\n\n${ROLE_START}\nRole` })];
  const again = new Crew(host);
  await again.load();
  await vi.waitFor(() => expect(readCompanionPrefs().agents).toEqual(['old']));
  // Its role is brought up to date, and no agent is made.
  await vi.waitFor(() => expect(profiles.find((kept) => kept.id === 'old')?.instructions).toContain("Boite's projects: boite."));
  expect(made).toHaveLength(1);
  again.dispose();
});

test('on a fresh core, whose agent never listed its models, Bots reads them and makes its agent on the small one', async () => {
  // Claude lists its models through the agent: the provider names none until they are read, and the core refuses a profile without one.
  const providers = { loaded: [{ id: 'claude', name: 'Claude', shortName: 'Claude', protocol: 'claude', available: true, models: [] } as unknown as ProviderSummary], rejected: [] };
  const listed = [{ id: 'claude-opus-5-5', name: 'Opus', default: true }, { id: 'claude-haiku-4-5-20251001', name: 'Haiku' }];
  let probed = false;
  const made: unknown[] = [];
  const call = vi.fn(async (method: string, params?: unknown) => {
    if (method === 'agents.snapshot') return snapshotOf({ profiles: made.map((save) => madeFrom('bots', save)) });
    if (method === 'providers.list') return providers;
    if (method === 'accounts.list') return [{ id: 'acc', providerId: 'claude', label: 'acc', status: 'ok' } as Account];
    if (method === 'providers.probe') {
      expect(params).toEqual({ providerId: 'claude', accountId: 'acc' });
      probed = true;
      return { models: listed, probedAt: 1 };
    }
    if (method === 'agents.profile.save') {
      const { selection } = (params as { value: { selection: { model: string | null } } }).value;
      if (!probed || selection.model === null) throw new Error('selection.model: choose a default model');
      made.push(params);
      return madeFrom('bots', params);
    }
    return {};
  });
  const client = { call } as unknown as Client;
  const crew = new Crew({ client: () => client, prefs: readCompanionPrefs, projects: () => ['boite'], waiting: () => false, answered: () => {}, loaded: () => {} });
  await crew.load();
  await vi.waitFor(() => expect(readCompanionPrefs()).toMatchObject({ agents: ['bots'], crewMade: true }));
  expect((made[0] as { value: { selection: { model: string } } }).value.selection.model).toBe('claude-haiku-4-5-20251001');
  expect(crew.problem).toBeNull();
  crew.dispose();
});

test('the facts kept on this computer go to the first agent one by one; one that could not go stays here', async () => {
  writeCompanionPrefs({ providerId: 'claude', accountId: 'acc' });
  remember('likes tea');
  remember('works on Boite');
  let made: unknown = null;
  const call = vi.fn(async (method: string, params?: unknown) => {
    if (method === 'agents.snapshot') return snapshotOf({ profiles: made ? [madeFrom('bots', made)] : [] });
    if (method === 'providers.list') return { loaded: [{ id: 'claude', name: 'Claude', shortName: 'Claude', protocol: 'acp', available: true, models: [] } as unknown as ProviderSummary], rejected: [] };
    if (method === 'accounts.list') return [{ id: 'acc', providerId: 'claude', label: 'acc', status: 'ok' } as Account];
    if (method === 'agents.profile.save') {
      made = params;
      return profile('bots');
    }
    if (method === 'agents.memory.save' && JSON.stringify(params).includes('tea')) throw new Error('core busy');
    return {};
  });
  const client = { call } as unknown as Client;
  const crew = new Crew({ client: () => client, prefs: readCompanionPrefs, projects: () => ['boite'], waiting: () => false, answered: () => {}, loaded: () => {} });
  await crew.load();
  await vi.waitFor(() => expect(call.mock.calls.filter(([method]) => method === 'agents.memory.save')).toHaveLength(2));
  await vi.waitFor(() => expect(readMemory().map((fact) => fact.text)).toEqual(['likes tea']));
  crew.dispose();
});

// ---------------------------------------------------------------------------
// Notes
// ---------------------------------------------------------------------------

test('a finished thread the agents work in is not told as news', () => {
  const notes = new Notes({ client: () => null, threads: () => [], ownThreads: () => ['own'], holding: () => false, rang: () => {} });
  notes.finished(['own', 'other']);
  expect(notes.notices.map((notice) => notice.threadId)).toEqual(['other']);
  notes.dispose();
});

test('a reminder that comes due rings, and again a few times while nobody answers it', () => {
  vi.useFakeTimers();
  addReminder('Take the tea out', Date.now() + 1500);
  const rang = vi.fn();
  const notes = new Notes({ client: () => null, threads: () => [], ownThreads: () => [], holding: () => false, rang });

  vi.advanceTimersByTime(1000);
  expect(rang).not.toHaveBeenCalled();
  vi.advanceTimersByTime(2000);
  expect(rang).toHaveBeenCalledTimes(1);
  expect(notes.alarms.map((alarm) => alarm.text)).toEqual(['Take the tea out']);
  expect(readReminders()).toEqual([]);
  vi.advanceTimersByTime(60_000);
  expect(rang).toHaveBeenCalledTimes(2);
  vi.advanceTimersByTime(10 * 60_000);
  expect(rang).toHaveBeenCalledTimes(3);
  notes.done(notes.alarms[0]!.id);
  addReminder('Call back', Date.now() + 500);
  vi.advanceTimersByTime(1000);
  expect(rang).toHaveBeenCalledTimes(4);
  notes.done(notes.alarms[0]!.id);
  vi.advanceTimersByTime(5 * 60_000);
  expect(rang).toHaveBeenCalledTimes(4);
  notes.dispose();
});
