import { afterEach, expect, test, vi } from 'vitest';
import { RpcErrorCode } from '@boite/contracts';
import { RpcFailure, type Client } from '@boite/ui/lib/client';
import { reveal, revealProblem, useReveal } from './reveal';
import { GroupClient } from './group/group-client';
import { showAgent, showMain, showUpdates } from './companion/shell';
import { fill, strings } from './strings';

afterEach(() => useReveal(null, null));

const clientWith = (call: (method: string, params: unknown) => Promise<unknown>) => ({ call }) as unknown as Client;

test('a thread and an agent go to Boite through ui.reveal', async () => {
  const call = vi.fn(async () => ({ delivered: 1 }));
  useReveal(clientWith(call), () => {});
  await showMain('t-1');
  await showAgent('agent-1');
  expect(call).toHaveBeenNthCalledWith(1, 'ui.reveal', { target: { kind: 'thread', threadId: 't-1' } });
  expect(call).toHaveBeenNthCalledWith(2, 'ui.reveal', { target: { kind: 'agent', agentId: 'agent-1' } });
});

test('a Boite without ui.reveal says so in a short sentence, without throwing', async () => {
  const failed = vi.fn();
  useReveal(clientWith(async () => { throw new RpcFailure({ code: RpcErrorCode.MethodNotFound, message: 'unknown method ui.reveal' }); }), failed);
  await expect(showMain('t-1')).resolves.toBeUndefined();
  expect(failed).toHaveBeenCalledWith(strings.bots.revealUnsupported);
});

test('another failure carries its reason, cut short', async () => {
  const failed = vi.fn();
  useReveal(clientWith(async () => { throw new Error('x'.repeat(300)); }), failed);
  const told = await reveal({ kind: 'thread', threadId: 't-1' });
  expect(told).toBe(failed.mock.calls[0]![0]);
  expect(told!.length).toBeLessThan(200);
  expect(revealProblem(new Error('closed'))).toContain('closed');
});

test('the update card opens Boite on its app updates; an older Boite says where they are', async () => {
  const call = vi.fn(async () => ({ delivered: 1 }));
  useReveal(clientWith(call), () => {});
  await showUpdates();
  expect(call).toHaveBeenCalledWith('ui.reveal', { target: { kind: 'update' } });

  const failed = vi.fn();
  useReveal(clientWith(async () => { throw new RpcFailure({ code: RpcErrorCode.InvalidParams, message: 'ui.reveal target must be { kind: "thread", threadId } or { kind: "agent", agentId }' }); }), failed);
  await expect(showUpdates()).resolves.toBeUndefined();
  expect(failed).toHaveBeenCalledWith(strings.island.update.manual);
  // A thread refused for its params is still the plain failure.
  expect(revealProblem(new RpcFailure({ code: RpcErrorCode.InvalidParams, message: 'gone' }), { kind: 'thread', threadId: 't-1' })).toContain('gone');
});

test('without a client yet, the reveal fails quietly too', async () => {
  const failed = vi.fn();
  useReveal(null, failed);
  expect(await reveal({ kind: 'agent', agentId: 'a' })).not.toBeNull();
  expect(failed).toHaveBeenCalledTimes(1);
});

/** A group client whose thread `t-srv` runs on boite, `core-srv`; `features` is what this machine's core said at hello. */
function groupWith(call: (method: string, params: unknown) => Promise<unknown>, features: Record<string, unknown> = {}): GroupClient {
  const group = Object.create(GroupClient.prototype) as GroupClient;
  Object.defineProperty(group, 'core', { value: { features } });
  return Object.assign(group, {
    call,
    selfId: () => 'core-here',
    coreIdOf: (threadId: string) => (threadId === 't-srv' ? 'core-srv' : null),
    machineOf: (threadId: string) => (threadId === 't-srv' ? 'boite' : null),
    nameOf: (coreId: string) => (coreId === 'core-srv' ? 'boite' : null)
  });
}

test('a thread of another machine goes to this machine’s Boite with its machine named', async () => {
  const call = vi.fn(async () => ({ delivered: 1 }));
  const failed = vi.fn();
  useReveal(groupWith(call), failed);
  expect(await reveal({ kind: 'thread', threadId: 't-srv' })).toBeNull();
  expect(call).toHaveBeenCalledWith('ui.reveal', { target: { kind: 'thread', threadId: 't-srv', coreId: 'core-srv' } });
  // This machine's own thread names none, as an older core expects.
  await showMain('t-1');
  expect(call).toHaveBeenLastCalledWith('ui.reveal', { target: { kind: 'thread', threadId: 't-1' } });
  expect(failed).not.toHaveBeenCalled();
});

test('a Boite that does not know machines refuses the thread: the notice says where it runs', async () => {
  const call = vi.fn(async () => {
    throw new RpcFailure({ code: RpcErrorCode.InvalidParams, message: 'ui.reveal target.threadId t-srv is not a thread of this core' });
  });
  const failed = vi.fn();
  useReveal(groupWith(call), failed);
  const told = await reveal({ kind: 'thread', threadId: 't-srv' });
  expect(told).toBe(fill(strings.bots.revealElsewhere, { machine: 'boite' }));
  expect(failed).toHaveBeenCalledWith(told);
});

test('an agent of another machine goes only to a Boite known to take machines', async () => {
  // Unknown: an older core would open an agent of its own with that id. Said instead of sent.
  const call = vi.fn(async () => ({ delivered: 1 }));
  const failed = vi.fn();
  useReveal(groupWith(call), failed);
  await showAgent('agent-forge', 'core-srv');
  expect(call).not.toHaveBeenCalled();
  expect(failed).toHaveBeenCalledWith(fill(strings.bots.revealAgentElsewhere, { machine: 'boite' }));

  // Its hello says so.
  const said = vi.fn(async () => ({ delivered: 1 }));
  useReveal(groupWith(said, { revealMachines: true }), () => {});
  await showAgent('agent-forge', 'core-srv');
  expect(said).toHaveBeenCalledWith('ui.reveal', { target: { kind: 'agent', agentId: 'agent-forge', coreId: 'core-srv' } });

  // Or it already showed a thread of another machine.
  const shown = vi.fn(async () => ({ delivered: 1 }));
  const group = groupWith(shown);
  useReveal(group, () => {});
  await showMain('t-srv');
  await showAgent('agent-forge', 'core-srv');
  expect(shown).toHaveBeenLastCalledWith('ui.reveal', { target: { kind: 'agent', agentId: 'agent-forge', coreId: 'core-srv' } });

  // This machine's agent names no machine.
  await showAgent('agent-1', null);
  expect(shown).toHaveBeenLastCalledWith('ui.reveal', { target: { kind: 'agent', agentId: 'agent-1' } });
});
