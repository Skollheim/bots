import { afterEach, expect, test, vi } from 'vitest';
import { RpcErrorCode, type CoreInfo, type PermissionRequest, type RpcEventName, type ThreadSummary } from '@boite/contracts';
import { RpcFailure, type ClientState, type EventHandler, type ObservableClient } from '@boite/ui/lib/client';
import { FakeClient } from '../fake-client';
import { SERVER_PROJECT, SERVER_THREAD } from '../fake-client/server-demo';
import { strings } from '../strings';
import { GroupClient, type MemberLink } from './group-client';
import { memoryKeys, storedKeys, MEMBER_KEYS_STORAGE, type MemberKeys } from './member-keys';
import { placedProjects } from './placed';
import { isMerged, memberBackoff, placedName, threadOfCall, threadOfEvent } from './routing';

/**
 * A member's socket, as the group client sees it: its state is the test's to
 * move (dropped, back, closed), its calls and events the fake server's.
 */
class Member implements ObservableClient {
  state: ClientState = 'idle';
  principal = null;
  core = null;
  readonly calls: string[] = [];
  readonly heard: string[] = [];
  readonly #states = new Set<(state: ClientState) => void>();
  constructor(readonly link: MemberLink, readonly server: FakeClient, readonly token = 'key-1') {}
  onState(handler: (state: ClientState) => void) {
    this.#states.add(handler);
    return () => void this.#states.delete(handler);
  }
  move(state: ClientState) {
    this.state = state;
    this.#states.forEach((handler) => handler(state));
  }
  on<E extends RpcEventName>(event: E, handler: EventHandler<E>) {
    this.heard.push(event);
    return this.server.on(event, handler);
  }
  async connect() {
    if (this.link.ticket !== undefined && !this.link.onSession({ id: 'session-1', token: this.token })) {
      this.move('closed');
      throw new Error('refused');
    }
    this.move('ready');
    return {} as CoreInfo;
  }
  call(method: string, params: unknown) {
    this.calls.push(method);
    return this.server.call(method as never, params as never);
  }
  close() {
    this.move('closed');
  }
}

const opened: FakeClient[] = [];
afterEach(() => {
  opened.splice(0).forEach((client) => client.close());
  localStorage.clear();
  vi.useRealTimers();
});

async function machines(options: { grouped?: boolean; ask?: boolean } = {}) {
  const local = new FakeClient({ delayMs: 0, coreName: 'Bureau' });
  const server = new FakeClient({ delayMs: 0, coreId: `fake-core-srv-${opened.length}`, coreName: 'Serveur', publicUrl: 'http://100.64.0.2:8777', hudDemo: false, serverDemo: options.ask ? 'ask' : 'on' });
  opened.push(local, server);
  await Promise.all([local.connect(), server.connect()]);
  if (options.grouped ?? true) {
    await local.call('group.create', { name: 'Maison' });
    const { invite } = await local.call('group.invite', {});
    await server.call('group.join', { invite });
  }
  return { local, server };
}

function grouped(local: ObservableClient, server: FakeClient, extra: { keys?: MemberKeys; retryMs?: number; answerMs?: number } = {}) {
  const members: Member[] = [];
  const changed = vi.fn();
  const keys = extra.keys ?? memoryKeys();
  const group = new GroupClient(local, {
    keys,
    changed,
    reach: async (addresses) => addresses[0] ?? null,
    open: (link) => {
      const member = new Member(link, server);
      members.push(member);
      return member;
    },
    ...(extra.retryMs === undefined ? {} : { retryMs: extra.retryMs }),
    ...(extra.answerMs === undefined ? {} : { answerMs: extra.answerMs })
  });
  return { group, members, changed, keys };
}

const ids = (threads: ThreadSummary[]) => threads.map((thread) => thread.id);
const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

test('no group: the lists are this machine’s, nothing is opened elsewhere', async () => {
  const { local, server } = await machines({ grouped: false });
  const { group, members } = grouped(local, server);
  await group.connect();
  await settle();
  expect(ids(await group.call('threads.list', {}))).toEqual(ids(await local.call('threads.list', {})));
  expect(members).toHaveLength(0);
  expect(group.machines()).toEqual([]);
});

test('a core older than groups works as before', async () => {
  const { local, server } = await machines({ grouped: false });
  const older = {
    get state() {
      return local.state;
    },
    principal: null,
    core: null,
    onState: (handler: (state: ClientState) => void) => local.onState(handler),
    on: (event: never, handler: never) => local.on(event, handler),
    connect: () => local.connect(),
    close: () => local.close(),
    call: (method: string, params: never) =>
      method === 'group.get' ? Promise.reject(new RpcFailure({ code: RpcErrorCode.MethodNotFound, message: 'unknown method group.get' })) : local.call(method as never, params)
  } as unknown as ObservableClient;
  const { group, members } = grouped(older, server);
  await group.connect();
  await settle();
  expect(members).toHaveLength(0);
  expect((await group.call('threads.list', {})).length).toBeGreaterThan(0);
});

test('the lists of every member are merged, and each thread says its machine', async () => {
  const { local, server } = await machines();
  const { group, members, keys } = grouped(local, server);
  await group.connect();
  await vi.waitFor(() => expect(members[0]?.state).toBe('ready'));
  // Reached with a ticket this machine vouched with; the key that came back is kept, by member.
  expect(members[0]!.link).toMatchObject({ url: 'http://100.64.0.2:8777', token: '' });
  expect(members[0]!.link.ticket).toBeTruthy();
  expect(keys.get(group.machines()[0]!.coreId)).toMatchObject({ url: 'http://100.64.0.2:8777', token: 'key-1' });

  const threads = await group.call('threads.list', {});
  const mine = ids(await local.call('threads.list', {}));
  expect(ids(threads)).toEqual([...mine, SERVER_THREAD]);
  expect(group.machineOf(SERVER_THREAD)).toBe('Serveur');
  expect(group.machineOf(mine[0]!)).toBeNull();
  expect(group.answered()).toEqual([group.machines()[0]!.coreId]);

  const { names, local: own } = await placedProjects(group);
  expect(names.get(SERVER_PROJECT)).toBe('Petites-Rives · Serveur');
  expect(own.some((project) => project.id === SERVER_PROJECT)).toBe(false);
});

test('a call that names a thread goes to its machine; the rest stays here', async () => {
  const { local, server } = await machines();
  const { group, members } = grouped(local, server);
  await group.connect();
  await vi.waitFor(() => expect(members[0]?.state).toBe('ready'));
  const localThread = (await local.call('threads.list', {}))[0]!.id;
  await group.call('threads.list', {});
  members[0]!.calls.length = 0;

  await group.call('threads.get', { threadId: SERVER_THREAD });
  await group.call('delegation.get', { threadId: SERVER_THREAD });
  await group.call('permissions.list', { threadId: SERVER_THREAD });
  await group.call('threads.get', { threadId: localThread });
  await group.call('projects.list', {});
  expect(members[0]!.calls).toEqual(['threads.get', 'delegation.get', 'permissions.list']);
});

test('a request of another machine shows here and is answered there', async () => {
  const { local, server } = await machines({ ask: true });
  const { group, members } = grouped(local, server);
  const heard = vi.fn();
  group.on('permission.requested', heard);
  group.on('quotas.updated', heard);
  await group.connect();
  await vi.waitFor(() => expect(members[0]?.state).toBe('ready'));
  await vi.waitFor(() => expect(heard).toHaveBeenCalledWith(expect.objectContaining({ id: 'perm-srv-push', threadId: SERVER_THREAD })), { timeout: 4_000 });

  const requests = await group.call('permissions.list', {});
  expect(requests.map((request: PermissionRequest) => request.id)).toContain('perm-srv-push');
  await group.call('permissions.answer', { requestId: 'perm-srv-push', decision: 'allow' });
  expect(members[0]!.calls.at(-1)).toBe('permissions.answer');
  expect((await server.call('permissions.list', {})).some((request) => request.id === 'perm-srv-push')).toBe(false);
  // The server's own quotas are not this machine's business: only thread events are heard there.
  expect(members[0]!.heard).toEqual(['permission.requested']);
});

test('a member that drops leaves the lists, is away rather than gone, and comes back', async () => {
  const { local, server } = await machines();
  const { group, members, changed } = grouped(local, server);
  await group.connect();
  await vi.waitFor(() => expect(members[0]?.state).toBe('ready'));
  await group.call('threads.list', {});
  changed.mockClear();

  members[0]!.move('connecting');
  expect(changed).toHaveBeenCalledTimes(1);
  expect(ids(await group.call('threads.list', {}))).not.toContain(SERVER_THREAD);
  expect(group.away(SERVER_THREAD)).toBe(true);
  await expect(group.call('threads.get', { threadId: SERVER_THREAD })).rejects.toThrow(strings.bots.machineAway.replace('{machine}', 'Serveur'));

  members[0]!.move('ready');
  expect(changed).toHaveBeenCalledTimes(2);
  expect(ids(await group.call('threads.list', {}))).toContain(SERVER_THREAD);
  expect(group.away(SERVER_THREAD)).toBe(false);
  // The same socket came back: nothing new was opened.
  expect(members).toHaveLength(1);
});

test('a member slow to answer gives its last list and never holds this machine', async () => {
  const { local, server } = await machines();
  const { group, members } = grouped(local, server, { answerMs: 20 });
  await group.connect();
  await vi.waitFor(() => expect(members[0]?.state).toBe('ready'));
  await group.call('threads.list', {});
  members[0]!.call = (() => new Promise(() => {})) as never;
  const started = Date.now();
  expect(ids(await group.call('threads.list', {}))).toContain(SERVER_THREAD);
  expect(Date.now() - started).toBeLessThan(1_000);
  expect(group.answered()).toEqual([]);
});

test('a revoked key is forgotten, and a new ticket asked a minute later at most', async () => {
  const { local, server } = await machines();
  const keys = memoryKeys();
  const { group, members } = grouped(local, server, { keys, retryMs: 60 });
  await group.connect();
  await vi.waitFor(() => expect(members[0]?.state).toBe('ready'));
  const coreId = group.machines()[0]!.coreId;
  expect(keys.get(coreId)?.token).toBe('key-1');

  // What WsClient does: the refusal is told, then the client closes for good.
  members[0]!.link.onRevoked();
  members[0]!.move('closed');
  expect(keys.get(coreId)).toBeNull();
  expect(members).toHaveLength(1);
  // Paced: never at once, and the one timer waits at least a second.
  expect(members).toHaveLength(1);
  await vi.waitFor(() => expect(members[1]?.state).toBe('ready'), { timeout: 3_000 });
  expect(members[1]!.link.token).toBe('');
  expect(members[1]!.link.ticket).toBeTruthy();
  expect(keys.get(coreId)?.token).toBe('key-1');
});

test('a key held from before opens the member without a ticket; one from another group is not sent', async () => {
  const { local, server } = await machines();
  const group0 = await local.call('group.get', {});
  const coreId = group0!.cores.find((core) => core.coreId !== group0!.self)!.coreId;
  const keys = memoryKeys();
  keys.set(coreId, { url: 'http://100.64.0.2:8777', token: 'kept', groupId: group0!.id, epoch: 1 });
  const first = grouped(local, server, { keys });
  await first.group.connect();
  await vi.waitFor(() => expect(first.members[0]?.state).toBe('ready'));
  expect(first.members[0]!.link).toMatchObject({ token: 'kept' });
  expect(first.members[0]!.link.ticket).toBeUndefined();
  first.group.close();

  const { local: other, server: otherServer } = await machines();
  const elsewhere = memoryKeys();
  const otherGroup = await other.call('group.get', {});
  const otherId = otherGroup!.cores.find((core) => core.coreId !== otherGroup!.self)!.coreId;
  elsewhere.set(otherId, { url: 'http://100.64.0.2:8777', token: 'old', groupId: 'grp_gone', epoch: 1 });
  const second = grouped(other, otherServer, { keys: elsewhere });
  await second.group.connect();
  await vi.waitFor(() => expect(second.members[0]?.state).toBe('ready'));
  expect(second.members[0]!.link.token).toBe('');
});

test('a member that leaves the group is let go with its key', async () => {
  const { local, server } = await machines();
  const { group, members, keys, changed } = grouped(local, server);
  await group.connect();
  await vi.waitFor(() => expect(members[0]?.state).toBe('ready'));
  const coreId = group.machines()[0]!.coreId;
  changed.mockClear();
  await server.call('group.leave', {});
  await vi.waitFor(() => expect(group.machines()).toEqual([]));
  expect(members[0]!.state).toBe('closed');
  expect(keys.get(coreId)).toBeNull();
  expect(changed).toHaveBeenCalled();
  expect(ids(await group.call('threads.list', {}))).not.toContain(SERVER_THREAD);
});

test('the keys live in the storage, read anew each time, never empty', () => {
  const keys = storedKeys(localStorage);
  keys.set('core-a', { url: 'http://10.0.0.2:8777', token: 'secret', groupId: 'grp', epoch: 2 });
  expect(storedKeys(localStorage).get('core-a')?.token).toBe('secret');
  expect(keys.ids()).toEqual(['core-a']);
  keys.drop('core-a');
  expect(localStorage.getItem(MEMBER_KEYS_STORAGE)).toBeNull();
  localStorage.setItem(MEMBER_KEYS_STORAGE, '{"core-b":{"url":"x","token":"","groupId":"g","epoch":1},"core-c":3}');
  expect(storedKeys(localStorage).ids()).toEqual([]);
});

test('routing: what is merged, what names a thread, what an event is about', () => {
  expect(isMerged('threads.list', {})).toBe(true);
  expect(isMerged('permissions.list', {})).toBe(true);
  expect(isMerged('permissions.list', { threadId: 't' })).toBe(false);
  expect(isMerged('projects.list', {})).toBe(false);
  expect(threadOfCall('turns.start', { threadId: 't' })).toBe('t');
  expect(threadOfCall('threads.create', { threadId: 't' })).toBeNull();
  expect(threadOfCall('ui.reveal', { target: { kind: 'thread', threadId: 't' } })).toBeNull();
  expect(threadOfEvent('thread.updated', { id: 't' })).toBe('t');
  expect(threadOfEvent('turn.started', { threadId: 't' })).toBe('t');
  expect([0, 1, 2, 3, 4, 9].map(memberBackoff)).toEqual([1_000, 2_000, 4_000, 8_000, 60_000, 60_000]);
  expect(placedName('Petites-Rives', 'Portable')).toBe('Petites-Rives · Portable');
});
