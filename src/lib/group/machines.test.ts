import { afterEach, expect, test, vi } from 'vitest';
import type { AgentProfile, AgentsSnapshot, PermissionRequest, ThreadSummary } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { Crew } from '../companion/crew.svelte';
import { writeCompanionPrefs, readCompanionPrefs } from '../companion/prefs';
import { FakeClient } from '../fake-client';
import { ASSISTANT_DEMO_AGENT } from '../fake-client/assistant-demo';
import { DEMO_MACHINES, demoGroup, LAPTOP_CORE, SERVER_CORE } from '../fake-client/machines-demo';
import { LAPTOP_AGENT, LAPTOP_THREAD, SERVER_AGENT, SERVER_THREAD } from '../fake-client/server-demo';
import { Assistant, type AssistantHost } from '../island/assistant.svelte';
import { machineLoads } from '../island/deck-data';
import { fill, strings } from '../strings';
import { agentKey, mergeElsewhere, pickPlaced, placedAgents, snapshotAt, type MachineAgents } from './agents';
import { GroupClient } from './group-client';
import { AGENT_EVENTS, heardEverywhere, unplacedName } from './routing';

const made: FakeClient[] = [];
const groups: GroupClient[] = [];
afterEach(() => {
  groups.splice(0).forEach((group) => group.close());
  made.splice(0).forEach((client) => client.close());
  localStorage.clear();
});

/** The demo's group of three: « PC » here, « boite » and « laptop » (`away`: laptop never answers). */
async function threeMachines(mode: '1' | 'ask' | 'away' = '1') {
  const local = new FakeClient({ delayMs: 0, assistantDemo: true, hudDemo: false, coreName: DEMO_MACHINES.local });
  made.push(local);
  const group = await demoGroup(local, mode, () => {}, { delayMs: 0, made });
  groups.push(group);
  await group.connect();
  const reachable = mode === 'away' ? 1 : 2;
  await vi.waitFor(() => expect(group.machines().filter((machine) => machine.state === 'ready')).toHaveLength(reachable));
  const localCall = vi.spyOn(local, 'call');
  return { local, group, localCall };
}

function crewOf(group: GroupClient): Crew {
  writeCompanionPrefs({ agents: [ASSISTANT_DEMO_AGENT], crewMade: true });
  // No projects yet: the companion's roles and first agent stay out of these tests.
  return new Crew({ client: () => group, prefs: readCompanionPrefs, projects: () => null, waiting: () => false, answered: () => {}, loaded: () => {} });
}

const ids = (threads: ThreadSummary[]) => threads.map((thread) => thread.id);

test('the agents of every machine are listed, each with its machine, this one’s first', async () => {
  const { group } = await threeMachines();
  const crew = crewOf(group);
  await crew.load();
  await vi.waitFor(() => expect(crew.elsewhere).toHaveLength(2));
  const listed = placedAgents(crew.snapshot, crew.elsewhere).map((agent) => [agent.profile.name, agent.machine, agent.key]);
  expect(listed).toEqual([
    ['Atlas', null, ASSISTANT_DEMO_AGENT],
    ['Ledger', null, 'agent-ledger'],
    ['Forge', DEMO_MACHINES.server, agentKey(SERVER_CORE, SERVER_AGENT)],
    ['Scout', DEMO_MACHINES.laptop, agentKey(LAPTOP_CORE, LAPTOP_AGENT)]
  ]);
  // The companion's own row stays this machine's.
  expect(crew.members.map((agent) => agent.id)).toEqual([ASSISTANT_DEMO_AGENT]);
  crew.dispose();
});

test('the assistant talks to an agent of another machine on that machine', async () => {
  const { group, localCall } = await threeMachines();
  const crew = crewOf(group);
  await crew.load();
  await vi.waitFor(() => expect(crew.elsewhere).toHaveLength(2));
  let kept: string | null = null;
  const assistant = new Assistant({
    client: () => group,
    snapshot: () => crew.snapshot,
    elsewhere: () => crew.elsewhere,
    reload: () => void crew.load(),
    remembered: () => kept,
    remember: (key) => (kept = key),
    fallback: () => null,
    outgoing: () => [],
    keep: async () => [],
    sent: () => {},
    giveBack: () => {}
  });
  const forge = agentKey(SERVER_CORE, SERVER_AGENT);
  assistant.pick(forge);
  expect(kept).toBe(forge);
  expect(assistant.agent?.name).toBe('Forge');
  expect(assistant.machine).toBe(DEMO_MACHINES.server);
  expect(assistant.machines).toBe(true);
  assistant.draft = 'Deploy the gameplay fix';
  await assistant.send();
  expect(assistant.problem).toBe('');
  // The message is boite's: in its agents' snapshot, never in this machine's.
  const there = await group.at(SERVER_CORE).call('agents.snapshot', {});
  expect(there.messages.some((message) => message.text.startsWith('Deploy the gameplay fix'))).toBe(true);
  expect(localCall.mock.calls.some(([method]) => method === 'agents.message.send')).toBe(false);
  expect(localCall.mock.calls.some(([method]) => method === 'providers.probe')).toBe(false);
  crew.dispose();
});

test('the same agent id on two machines does not collide: each call goes to the one picked', async () => {
  const profile = (id: string, name: string) => ({ id, name, status: 'active', revision: 1, selection: { providerId: 'p', accountId: 'a', model: null, effort: 'high' } }) as unknown as AgentProfile;
  const snapshot = (name: string) => ({ profiles: [profile('a1', name)], sessions: [], messages: [], work: [], deliveries: [], more: { message: false } }) as unknown as AgentsSnapshot;
  const local = snapshot('Here');
  const elsewhere: MachineAgents[] = [{ coreId: 'core-b', machine: 'boite', snapshot: snapshot('There') }];
  const placed = placedAgents(local, elsewhere);
  expect(placed.map((agent) => agent.key)).toEqual(['a1', 'core-b/a1']);
  expect(pickPlaced(placed, 'core-b/a1')?.profile.name).toBe('There');
  expect(snapshotAt('core-b', local, elsewhere)).toBe(elsewhere[0]!.snapshot);
  expect(snapshotAt(null, local, elsewhere)).toBe(local);

  const sent: [string | null, string, unknown][] = [];
  const answer = (method: string) => (method === 'agents.message.send' ? { id: `m${sent.length}` } : method === 'providers.probe' ? { models: [] } : {});
  const bound = (coreId: string | null): Client => ({ call: async (method: string, params: unknown) => (sent.push([coreId, method, params]), answer(method)), on: () => () => {} }) as unknown as Client;
  const group = Object.assign(Object.create(GroupClient.prototype) as GroupClient, { ...bound(null), at: (coreId: string | null) => bound(coreId) });
  const host: AssistantHost = { client: () => group, snapshot: () => local, elsewhere: () => elsewhere, reload: () => {}, remembered: () => null, remember: () => {}, fallback: () => null, outgoing: () => [], keep: async () => [], sent: () => {}, giveBack: () => {} };
  const assistant = new Assistant(host);
  assistant.pick('core-b/a1');
  assistant.draft = 'one';
  await assistant.send();
  assistant.pick('a1');
  assistant.draft = 'two';
  await assistant.send();
  const messages = sent.filter(([, method]) => method === 'agents.message.send').map(([coreId, , params]) => [coreId, (params as { text: string }).text]);
  expect(messages).toEqual([
    ['core-b', 'one'],
    [null, 'two']
  ]);
});

test('every thread call of the island for a thread of another machine goes to that machine', async () => {
  const { group, localCall } = await threeMachines('ask');
  const threads = await group.call('threads.list', { includeArchived: true });
  expect(ids(threads)).toEqual(expect.arrayContaining([SERVER_THREAD, LAPTOP_THREAD]));
  expect(group.machineOf(LAPTOP_THREAD)).toBe(DEMO_MACHINES.laptop);

  // Sessions, the HUD, recap and finished cards, sub-agents, PR watch, archive.
  await group.call('threads.subscribe', { threadId: SERVER_THREAD });
  expect((await group.call('threads.get', { threadId: SERVER_THREAD, limit: 6 })).title).toBe('Corriger le gameplay');
  await group.call('delegation.get', { threadId: SERVER_THREAD });
  await group.call('questions.list', { threadId: SERVER_THREAD });
  await group.call('threads.unsubscribe', { threadId: SERVER_THREAD });
  await group.call('threads.pullRequestReview', { threadId: SERVER_THREAD, url: 'https://example.com/pull/1' }).catch(() => null);
  await group.call('threads.archive', { threadId: LAPTOP_THREAD });
  const thread = (method: string) => localCall.mock.calls.some(([called, params]) => called === method && [SERVER_THREAD, LAPTOP_THREAD].includes((params as { threadId?: string }).threadId ?? ''));
  for (const method of ['threads.subscribe', 'threads.get', 'delegation.get', 'questions.list', 'threads.unsubscribe', 'threads.pullRequestReview', 'threads.archive']) expect(thread(method)).toBe(false);
  expect((await group.at(LAPTOP_CORE).call('threads.list', { includeArchived: true })).find((entry) => entry.id === LAPTOP_THREAD)?.archived).toBe(true);

  // boite's thread asks to push: the request shows here, the answer goes back there.
  let request: PermissionRequest | undefined;
  await vi.waitFor(async () => {
    request = (await group.call('permissions.list', {})).find((entry) => entry.threadId === SERVER_THREAD);
    expect(request).toBeDefined();
  }, { timeout: 4_000 });
  await group.call('permissions.answer', { requestId: request!.id, decision: 'allow' });
  expect(localCall.mock.calls.some(([method]) => method === 'permissions.answer')).toBe(false);
  expect(await group.at(SERVER_CORE).call('permissions.list', {})).toEqual([]);
});

test('a machine out of reach is shown offline in one place and holds nothing up', async () => {
  const { group } = await threeMachines('away');
  expect(group.machines().map((machine) => [machine.name, machine.state])).toEqual([
    [DEMO_MACHINES.server, 'ready'],
    [DEMO_MACHINES.laptop, 'unreached']
  ]);
  const threads = await group.call('threads.list', {});
  expect(ids(threads)).toContain(SERVER_THREAD);
  expect(ids(threads)).not.toContain(LAPTOP_THREAD);
  const crew = crewOf(group);
  await crew.load();
  await vi.waitFor(() => expect(crew.elsewhere.map((entry) => entry.machine)).toEqual([DEMO_MACHINES.server]));
  await expect(group.at(LAPTOP_CORE).call('agents.snapshot', {})).rejects.toThrow(fill(strings.bots.machineAway, { machine: DEMO_MACHINES.laptop }));
  expect(group.at(LAPTOP_CORE).state).toBe('closed');
  // The deck's machines tile is where it says so.
  const loads = machineLoads(threads, (threadId) => group.coreIdOf(threadId), group.machines(), 'Ce PC');
  expect(loads.map((load) => [load.name, load.online])).toEqual([
    ['Ce PC', true],
    [DEMO_MACHINES.server, true],
    [DEMO_MACHINES.laptop, false]
  ]);
  crew.dispose();
});

test('a client bound to a machine: this one’s own core, or the member', async () => {
  const { local, group } = await threeMachines();
  expect(group.at(null)).toBe(local);
  expect(group.at(group.selfId())).toBe(local);
  expect(group.nameOf(SERVER_CORE)).toBe(DEMO_MACHINES.server);
  expect(group.at(SERVER_CORE).state).toBe('ready');
  const heard = vi.fn();
  const off = group.at(SERVER_CORE).on('agents.changed', heard);
  await group.at(SERVER_CORE).call('agents.profile.save', { value: { name: 'Mason', domain: '', instructions: '', avatar: '', status: 'active', tools: [], accountIntegration: 'provider', selection: { providerId: 'claude', accountId: 'a-claude-main', model: null, effort: 'high', permissionMode: 'default' } } } as never);
  await vi.waitFor(() => expect(heard).toHaveBeenCalled());
  off();
});

test('agent events are heard from every machine; a member slow to answer keeps its agents while connected', () => {
  expect(AGENT_EVENTS.has('agents.changed')).toBe(true);
  expect(heardEverywhere('agents.changed')).toBe(true);
  expect(heardEverywhere('thread.updated')).toBe(true);
  expect(heardEverywhere('quotas.updated' as never)).toBe(false);
  const of = (coreId: string) => ({ coreId, machine: coreId, snapshot: { profiles: [] } as unknown as AgentsSnapshot });
  const before = [of('a'), of('b')];
  const fresh = of('a');
  expect(mergeElsewhere(before, [fresh], [{ coreId: 'a' }, { coreId: 'b' }])).toEqual([fresh, before[1]]);
  expect(mergeElsewhere(before, [fresh], [{ coreId: 'a' }])).toEqual([fresh]);
  expect(unplacedName('Petites-Rives · boite', 'boite')).toBe('Petites-Rives');
  expect(unplacedName('Petites-Rives', null)).toBe('Petites-Rives');
});
