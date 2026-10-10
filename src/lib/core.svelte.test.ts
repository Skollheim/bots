import { expect, test, vi } from 'vitest';
import type { ObservableClient } from '@boite/ui/lib/client';
import { CoreLink } from './core.svelte';

function linked(call: (method: string, params: unknown) => Promise<unknown>) {
  const client = {
    principal: 'owner',
    call: vi.fn(call),
    on: () => () => {},
    onState: () => () => {},
    connect: async () => {},
    close: () => {}
  };
  const link = new CoreLink();
  return { link, client, ready: link.start(async () => client as unknown as ObservableClient) };
}

const probes = (client: { call: { mock: { calls: unknown[][] } } }) => client.call.mock.calls.filter(([method]) => method === 'providers.probe').length;

test('an agent is started once to read its models, however often they are asked for', async () => {
  const { link, client, ready } = linked(async () => ({ models: [{ id: 'small', name: 'Small' }], probedAt: 1 }));
  await ready;
  await Promise.all([link.probeModels('claude', 'a1'), link.probeModels('claude', 'a1')]);
  await link.probeModels('claude', 'a1');
  expect(probes(client)).toBe(1);
  expect(link.modelsOf('claude', 'a1').map((model) => model.id)).toEqual(['small']);
});

test('a failed read is not tried again by each account update', async () => {
  const { link, client, ready } = linked(async () => {
    throw new Error('the agent did not answer');
  });
  await ready;
  await expect(link.probeModels('opencode', 'a2')).rejects.toThrow('the agent did not answer');
  await expect(link.probeModels('opencode', 'a2')).rejects.toThrow('the agent did not answer');
  expect(probes(client)).toBe(1);
});
