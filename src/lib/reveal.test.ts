import { afterEach, expect, test, vi } from 'vitest';
import { RpcErrorCode } from '@boite/contracts';
import { RpcFailure, type Client } from '@boite/ui/lib/client';
import { reveal, revealProblem, useReveal } from './reveal';
import { showAgent, showMain } from './companion/shell';
import { strings } from './strings';

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

test('without a client yet, the reveal fails quietly too', async () => {
  const failed = vi.fn();
  useReveal(null, failed);
  expect(await reveal({ kind: 'agent', agentId: 'a' })).not.toBeNull();
  expect(failed).toHaveBeenCalledTimes(1);
});
