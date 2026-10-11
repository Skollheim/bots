/**
 * The group's demo, with `?fake=1&machines=1|ask`: a second fake core,
 * « Serveur » (`server-demo.ts`), joins this one's group, so Home, the pill
 * and the HUD show a thread of another machine (« Corriger le gameplay ·
 * Petites-Rives · Serveur »). With `ask`, that thread asks to push a moment
 * after the island opens: the request shows here and is answered there.
 *
 * Bots reaches the server the way it reaches a real member (`group.ticket`,
 * then a client of its own), except that the socket is the fake itself.
 */
import { GroupClient } from '../group/group-client';
import { memoryKeys } from '../group/member-keys';
import { FakeClient } from '../fake-client';

const SERVER_CORE = 'fake-core-serveur';

/**
 * This fake core under the group client; with `machines`, grouped with the
 * server first, the way two machines are: one makes the group and invites,
 * the other joins.
 */
export async function demoGroup(local: FakeClient, machines: string | null, changed: () => void): Promise<GroupClient> {
  if (machines !== '1' && machines !== 'ask') return new GroupClient(local, { keys: memoryKeys(), changed });
  const server = new FakeClient({ coreId: SERVER_CORE, coreName: 'Serveur', publicUrl: 'http://100.64.0.2:8777', hudDemo: false, serverDemo: machines === 'ask' ? 'ask' : 'on' });
  await Promise.all([local.connect(), server.connect()]);
  await local.call('group.create', { name: 'Maison' });
  const { invite } = await local.call('group.invite', {});
  await server.call('group.join', { invite });
  return new GroupClient(local, { keys: memoryKeys(), changed, open: () => server, reach: async (addresses) => addresses[0] ?? null });
}
