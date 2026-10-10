import type { AgentConversationMessage, AgentProfile, AgentsSnapshot, AgentWork, Attachment, Message, ThreadSummary } from '@boite/contracts';
import { expect, test, vi } from 'vitest';
import { FakeClient } from '../fake-client';
import { ASSISTANT_DEMO_AGENT } from '../fake-client/assistant-demo';
import {
  applyCompleted,
  applyDelta,
  applyPart,
  applyStarted,
  Assistant,
  bubbleOf,
  conversation,
  effortOf,
  effortsOf,
  failureOf,
  liveText,
  offeredModels,
  openWork,
  pickAgent,
  selectionSave,
  settled,
  splitFiles,
  toolLine,
  toolTarget,
  withFiles,
  type AssistantHost
} from './assistant.svelte';

const scope = (id = 'ag') => ({ kind: 'agent' as const, id });

function said(id: string, senderId: string | null, text: string, over: Partial<AgentConversationMessage> = {}): AgentConversationMessage {
  return { id, revision: 1, createdAt: 0, updatedAt: 0, scope: scope(), senderId, text, recipientIds: [], replyTo: null, episodeId: 'e', sourceRunId: null, ...over };
}

function work(id: string, status: AgentWork['status'], over: Partial<AgentWork> = {}): AgentWork {
  return { id, revision: 1, createdAt: 0, updatedAt: 0, agentId: 'ag', scope: scope(), messageId: null, status, error: null, runId: null, ...over } as AgentWork;
}

function profile(id: string, over: Partial<AgentProfile> = {}): AgentProfile {
  return {
    id, revision: 3, createdAt: 0, updatedAt: 0, name: id, domain: '', instructions: 'be brief', avatar: '',
    selection: { providerId: 'p', accountId: 'a', model: 'm1', effort: 'high', permissionMode: 'default' },
    status: 'active', tools: [], accountIntegration: 'provider', ...over
  };
}

function snapshotOf(over: Partial<AgentsSnapshot> = {}): AgentsSnapshot {
  return { profiles: [], sessions: [], messages: [], work: [], deliveries: [], more: { message: false }, ...over } as unknown as AgentsSnapshot;
}

function streamed(id: string, role: Message['role'], parts: Message['parts'], state: Message['state'] = 'complete'): Message {
  return { id, threadId: 't', turnId: 'u', role, parts, state, createdAt: 0 };
}

test('files travel as kept paths at the end of the message, and come back as names', () => {
  expect(withFiles('Look', [])).toBe('Look');
  const text = withFiles('Look at these', ['C:\\kept\\a.log', '/tmp/b.png']);
  expect(text).toBe('Look at these\n\n[[files: C:\\kept\\a.log | /tmp/b.png]]');
  expect(splitFiles(text)).toEqual({ text: 'Look at these', files: ['a.log', 'b.png'] });
  expect(splitFiles(withFiles('', ['C:\\a.txt']))).toEqual({ text: '', files: ['a.txt'] });
  expect(splitFiles('Hi\n\n[[context: the island]]')).toEqual({ text: 'Hi', files: [] });
  expect(splitFiles('A [[files: in the middle]] of a line.')).toEqual({ text: 'A [[files: in the middle]] of a line.', files: [] });
});

test('a message shows as the user’s bubble or the agent’s answer; an empty one does not show', () => {
  expect(bubbleOf(said('m1', null, withFiles('See', ['C:\\x\\night.log'])))).toEqual({ id: 'm1', role: 'user', text: 'See', files: ['night.log'], streaming: false });
  expect(bubbleOf(said('m2', 'ag', '  Done.  '))).toEqual({ id: 'm2', role: 'assistant', text: 'Done.', files: [], streaming: false });
  expect(bubbleOf(said('m3', 'ag', '   '))).toBeNull();
});

test('the conversation is the direct one, oldest first, the later revision of a message winning', () => {
  const snapshot = snapshotOf({
    messages: [said('b', 'ag', 'new', { createdAt: 2, revision: 2 }), said('x', 'ag', 'group', { createdAt: 3, scope: { kind: 'group', id: 'g' } }), said('o', 'other', 'theirs', { createdAt: 4, scope: scope('other') })]
  });
  const older = [said('a', null, 'first', { createdAt: 1 }), said('b', 'ag', 'stale', { createdAt: 2, revision: 1 })];
  expect(conversation(snapshot, older, 'ag').map((message) => `${message.id}:${message.text}`)).toEqual(['a:first', 'b:new']);
});

test('a sent message is settled once answered, its work over, or never delivered', () => {
  const snapshot = snapshotOf({
    messages: [said('r', 'ag', 'Done', { replyTo: 'm1' })],
    work: [work('w2', 'running', { messageId: 'm2' }), work('w3', 'done', { messageId: 'm3' }), work('w5', 'pending', { messageId: 'm5', purpose: 'compaction' } as Partial<AgentWork>)],
    deliveries: [{ messageId: 'm4', status: 'failed' }] as unknown as AgentsSnapshot['deliveries']
  });
  expect(settled(snapshot, 'ag', 'm1')).toBe(true);
  expect(settled(snapshot, 'ag', 'm2')).toBe(false);
  expect(settled(snapshot, 'ag', 'm3')).toBe(true);
  expect(settled(snapshot, 'ag', 'm4')).toBe(true);
  expect(settled(snapshot, 'ag', 'm6')).toBe(false);
  expect(openWork(snapshot, 'ag').map((entry) => entry.id)).toEqual(['w2']);
});

test('the newest request that failed says why', () => {
  const messages = [said('m1', null, 'Go')];
  expect(failureOf(snapshotOf({ work: [work('w', 'error', { messageId: 'm1', error: 'Quota reached' })] }), messages, 'ag')).toBe('The answer stopped: Quota reached');
  expect(failureOf(snapshotOf({ work: [work('w', 'cancelled', { messageId: 'm1' })] }), messages, 'ag')).toBeNull();
  expect(failureOf(snapshotOf({ work: [work('w', 'error', { messageId: 'm1' })] }), [...messages, said('r', 'ag', 'late')], 'ag')).toBeNull();
});

test('the agent in use is the chosen one, else the kept one, else the first active one', () => {
  const agents = [profile('a'), profile('b'), profile('c')];
  expect(pickAgent(agents, 'b', 'c')?.id).toBe('b');
  expect(pickAgent(agents, null, 'gone', 'c')?.id).toBe('c');
  expect(pickAgent(agents, 'gone')?.id).toBe('a');
  expect(pickAgent([], 'a')).toBeNull();
});

test('the tool line names the running call and its target', () => {
  expect(toolTarget({ file_path: 'C:\\Dev\\src\\app.ts' })).toBe('app.ts');
  expect(toolTarget({ command: 'bun run test\nmore' })).toBe('bun run test');
  expect(toolTarget(null)).toBeNull();
  const running = streamed('m', 'assistant', [{ type: 'tool', toolId: 'x', name: 'Read', input: { path: 'src/a.ts' }, output: null, status: 'running' }], 'streaming');
  expect(toolLine([running], null)).toBe('Read a.ts');
  const command = streamed('c', 'assistant', [{ type: 'tool', toolId: 'y', name: 'Bash', input: { command: 'bun run test\nmore' }, output: null, status: 'running' }], 'streaming');
  expect(toolLine([command], null)).toBe('Command bun run test');
  const unknown = streamed('u', 'assistant', [{ type: 'tool', toolId: 'z', name: 'mcp__notes__list', input: {}, output: null, status: 'running' }], 'streaming');
  expect(toolLine([unknown], null)).toBe('Tool');
  expect(toolLine([], { progress: { turnId: 'u', phase: 'tool', detail: 'Bash' } } as Pick<ThreadSummary, 'progress'>)).toBe('Bash');
  expect(toolLine([], null)).toBeNull();
});

test('the stream builds the answer: started, deltas, a part replaced, completed', () => {
  const messages: Message[] = [];
  applyStarted(messages, streamed('a', 'assistant', [], 'streaming'));
  applyDelta(messages, { threadId: 't', messageId: 'a', partIndex: 0, text: 'Hel' });
  applyDelta(messages, { threadId: 't', messageId: 'a', partIndex: 0, text: 'lo' });
  applyPart(messages, { threadId: 't', messageId: 'a', partIndex: 2, part: { type: 'tool', toolId: 'x', name: 'Read', input: {}, output: null, status: 'running' } });
  applyDelta(messages, { threadId: 't', messageId: 'zz', partIndex: 0, text: 'lost' });
  expect(messages[0]!.parts.map((part) => part.type)).toEqual(['text', 'text', 'tool']);
  expect(liveText(messages)).toBe('Hello');
  applyCompleted(messages, { threadId: 't', messageId: 'a', state: 'complete' });
  expect(messages[0]!.state).toBe('complete');
  applyStarted(messages, streamed('a', 'assistant', [{ type: 'text', text: 'again' }]));
  expect(messages).toHaveLength(1);
});

test('efforts are low, medium and high, none for the default, narrowed to what the model takes', () => {
  expect(effortOf(null)).toBeNull();
  expect(effortOf('xhigh')).toBeNull();
  expect(effortOf('low')).toBe('low');
  expect(effortsOf(undefined)).toEqual(['low', 'medium', 'high']);
  expect(effortsOf({ id: 'm', name: 'M', effort: { levels: [{ id: 'medium', label: 'M' }, { id: 'high', label: 'H' }, { id: 'xhigh', label: 'X' }], default: 'high' } })).toEqual(['medium', 'high']);
  const models = [{ id: 'default', name: 'Default' }, { id: 'new', name: 'New' }, { id: 'old', name: 'Old', legacy: true }];
  expect(offeredModels(models, 'new').map((model) => model.id)).toEqual(['new']);
  expect(offeredModels(models, 'old').map((model) => model.id)).toEqual(['new', 'old']);
});

test('a change of model saves the whole agent with its selection merged', () => {
  const save = selectionSave(profile('ag'), { model: 'm2' });
  expect(save).toMatchObject({ id: 'ag', expectedRevision: 3, value: { name: 'ag', instructions: 'be brief', status: 'active' } });
  expect(save.value.selection).toEqual({ providerId: 'p', accountId: 'a', model: 'm2', effort: 'high', permissionMode: 'default' });
  expect(save.value).not.toHaveProperty('revision');
});

/** An assistant on a client, with the snapshot read as the companion reads it. */
function harness(client: FakeClient | { call: (...args: never[]) => unknown; on: (...args: never[]) => () => void }, over: Partial<AssistantHost> = {}) {
  let snapshot = $state.raw<AgentsSnapshot | null>(null);
  let kept: string | null = null;
  const tray: Attachment[] = [];
  const given: Attachment[][] = [];
  const typed = client as FakeClient;
  const assistant: Assistant = new Assistant({
    client: () => typed,
    snapshot: () => snapshot,
    reload: () => void load(),
    remembered: () => kept,
    remember: (id) => (kept = id),
    fallback: () => null,
    outgoing: () => [...tray],
    keep: async (files) => files.map((file) => `C:\\kept\\${file.name}`),
    sent: () => void tray.splice(0),
    giveBack: (files) => void given.push(files),
    ...over
  });
  async function load() {
    snapshot = await typed.call('agents.snapshot', {});
    assistant.follow();
  }
  const offs = [assistant.attach(typed), typed.on('agents.changed', () => void load())];
  return { assistant, load, tray, given, kept: () => kept, close: () => offs.forEach((off) => off()) };
}

test('the demo agent’s conversation shows, a message goes to it, and its answer comes back', async () => {
  const client = new FakeClient({ delayMs: 0, assistantDemo: true });
  await client.connect();
  const call = vi.spyOn(client, 'call');
  const { assistant, load, tray, close } = harness(client);
  assistant.open(ASSISTANT_DEMO_AGENT);
  await load();
  expect(assistant.agent?.name).toBe('Atlas');
  expect(assistant.agents.length).toBeGreaterThanOrEqual(2);
  expect(assistant.bubbles.map((bubble) => bubble.role)).toEqual(['user', 'assistant', 'user', 'assistant']);
  expect(assistant.bubbles[1]!.text).toContain('```rust');
  expect(assistant.bubbles[2]!.files).toEqual(['night.log']);
  expect(assistant.model).toBe('claude-sonnet-5-5');
  expect(assistant.effort).toBe('high');

  tray.push({ kind: 'file', mimeType: 'text/plain', data: btoa('hi'), name: 'notes.txt' } as Attachment);
  assistant.draft = 'Hello there';
  await assistant.send();
  expect(tray).toHaveLength(0);
  expect(assistant.draft).toBe('');
  const sent = call.mock.calls.find(([method]) => method === 'agents.message.send')?.[1] as Record<string, unknown>;
  expect(sent).toMatchObject({ scope: { kind: 'agent', id: ASSISTANT_DEMO_AGENT }, recipientIds: [ASSISTANT_DEMO_AGENT], text: 'Hello there\n\n[[files: C:\\kept\\notes.txt]]' });
  expect(String(sent.requestId)).toMatch(/^[A-Za-z0-9_-]{8,128}$/);
  await vi.waitFor(() => expect(assistant.bubbles.at(-2)).toMatchObject({ role: 'user', text: 'Hello there', files: ['notes.txt'] }));
  await vi.waitFor(() => expect(assistant.running).toBe(false), { timeout: 4000 });
  expect(assistant.bubbles.at(-1)!.role).toBe('assistant');
  expect(assistant.threadId).not.toBeNull();
  expect(assistant.problem).toBe('');
  close();
  client.close();
});

test('Stop cancels the agent’s work in the conversation', async () => {
  const client = new FakeClient({ delayMs: 40, assistantDemo: true });
  await client.connect();
  const call = vi.spyOn(client, 'call');
  const { assistant, load, close } = harness(client);
  assistant.open(ASSISTANT_DEMO_AGENT);
  await load();
  assistant.draft = 'Take your time';
  await assistant.send();
  await vi.waitFor(() => expect(assistant.work.length).toBeGreaterThan(0));
  await assistant.stop();
  expect(call.mock.calls.some(([method, params]) => method === 'agents.work.control' && (params as { action: string }).action === 'cancel')).toBe(true);
  await vi.waitFor(() => expect(assistant.running).toBe(false), { timeout: 4000 });
  close();
  client.close();
});

test('the model and the effort change on the agent itself', async () => {
  const client = new FakeClient({ delayMs: 0, assistantDemo: true });
  await client.connect();
  const { assistant, load, close } = harness(client);
  assistant.open(ASSISTANT_DEMO_AGENT);
  await load();
  await vi.waitFor(() => expect(assistant.offered.length).toBeGreaterThan(0));
  const other = assistant.offered.find((model) => model.id !== assistant.model)!;
  await assistant.setModel(other.id);
  await vi.waitFor(() => expect(assistant.model).toBe(other.id));
  await assistant.setEffort('low');
  await vi.waitFor(() => expect(assistant.effort).toBe('low'));
  const agents = await client.call('agents.snapshot', {});
  expect(agents.profiles.find((agent) => agent.id === ASSISTANT_DEMO_AGENT)?.selection).toMatchObject({ model: other.id, effort: 'low' });
  close();
  client.close();
});

test('picking another agent keeps it for the next launch and starts clean', async () => {
  const client = new FakeClient({ delayMs: 0, assistantDemo: true });
  await client.connect();
  const { assistant, load, kept, close } = harness(client);
  assistant.open(ASSISTANT_DEMO_AGENT);
  await load();
  const other = assistant.agents.find((agent) => agent.id !== ASSISTANT_DEMO_AGENT)!;
  assistant.pick(other.id);
  expect(kept()).toBe(other.id);
  expect(assistant.agentId).toBe(other.id);
  expect(assistant.bubbles.every((bubble) => bubble.id.startsWith('m-atlas') === false)).toBe(true);
  close();
  client.close();
});

test('files that cannot be kept stay in the tray with the text', async () => {
  const client = new FakeClient({ delayMs: 0, assistantDemo: true });
  await client.connect();
  const call = vi.spyOn(client, 'call');
  const { assistant, load, tray, given, close } = harness(client, { keep: async () => null });
  assistant.open(ASSISTANT_DEMO_AGENT);
  await load();
  tray.push({ kind: 'file', mimeType: 'text/plain', data: '', name: 'a.txt' } as Attachment);
  assistant.draft = 'With a file';
  await assistant.send();
  expect(assistant.problem).toBe('The files could not be passed on outside the app.');
  expect(assistant.draft).toBe('With a file');
  expect(given.flat().map((file) => file.name)).toEqual(['a.txt']);
  expect(call.mock.calls.some(([method]) => method === 'agents.message.send')).toBe(false);
  close();
  client.close();
});

test('older messages come a page at a time from the history, before the oldest in hand', async () => {
  const agent = profile('ag');
  const snapshot = snapshotOf({ profiles: [agent], messages: [said('m9', 'ag', 'nine', { createdAt: 9, updatedAt: 9 })], more: { message: true } as AgentsSnapshot['more'] });
  const call = vi.fn(async (method: string) => {
    if (method === 'agents.snapshot') return snapshot;
    if (method === 'agents.history') return { messages: [said('m1', null, 'one', { createdAt: 1, updatedAt: 1 })], more: false };
    if (method === 'providers.probe') return { models: [], probedAt: 0 };
    return {};
  });
  const { assistant, load, close } = harness({ call, on: () => () => {} });
  await load();
  await vi.waitFor(() => expect(assistant.bubbles.map((bubble) => bubble.id)).toEqual(['m1', 'm9']));
  expect(call).toHaveBeenCalledWith('agents.history', expect.objectContaining({ kind: 'message', scopes: [scope()], before: { updatedAt: 9, id: 'm9' } }));
  expect(assistant.hasOlder).toBe(false);
  await assistant.loadOlder();
  expect(call.mock.calls.filter(([method]) => method === 'agents.history')).toHaveLength(1);
  close();
});
