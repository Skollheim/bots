/**
 * The group's demo, with `?fake=1&machines=1|ask|away`: two more fake cores,
 * « boite » (the server) and « laptop » (`server-demo.ts`), join this one's
 * group, « PC ». Home, the pill and the HUD show a thread of each (« Corriger
 * le gameplay » on boite, « Write the install guide » on laptop), and the
 * island's Chat lists their agents, Forge and Scout, beside this machine's.
 * With `ask`, boite's thread asks to push a moment after the island opens:
 * the request shows here and is answered there. With `away`, laptop never
 * answers: it shows as offline in the deck's machines tile, and nothing of it
 * waits on it.
 *
 * Bots reaches each member the way it reaches a real one (`group.ticket`,
 * then a client of its own), except that the socket is the fake itself.
 */
import { GroupClient } from '../group/group-client';
import { memoryKeys } from '../group/member-keys';
import { FakeClient } from '../fake-client';

export const DEMO_MACHINES = { local: 'PC', server: 'boite', laptop: 'laptop' } as const;
export const SERVER_CORE = 'fake-core-boite';
export const LAPTOP_CORE = 'fake-core-laptop';
const SERVER_URL = 'http://100.64.0.2:8777';
const LAPTOP_URL = 'http://100.64.0.3:8777';

/** Whether the page asks for the group's demo. */
export function wantsMachines(machines: string | null): boolean {
  return machines === '1' || machines === 'ask' || machines === 'away';
}

/**
 * This fake core under the group client; with `machines`, grouped with
 * boite and laptop first, the way machines are: one makes the group and
 * invites, the others join.
 */
export async function demoGroup(local: FakeClient, machines: string | null, changed: () => void, tests: { delayMs?: number; made?: FakeClient[] } = {}): Promise<GroupClient> {
  if (!wantsMachines(machines)) return new GroupClient(local, { keys: memoryKeys(), changed });
  const delay = tests.delayMs === undefined ? {} : { delayMs: tests.delayMs };
  const server = new FakeClient({ ...delay, coreId: SERVER_CORE, coreName: DEMO_MACHINES.server, publicUrl: SERVER_URL, hudDemo: false, serverDemo: machines === 'ask' ? 'ask' : 'on' });
  const laptop = new FakeClient({ ...delay, coreId: LAPTOP_CORE, coreName: DEMO_MACHINES.laptop, publicUrl: LAPTOP_URL, hudDemo: false, serverDemo: 'laptop' });
  // A test closes them, the laptop out of reach included.
  tests.made?.push(server, laptop);
  await Promise.all([local.connect(), server.connect(), laptop.connect()]);
  await local.call('group.create', { name: 'Maison' });
  for (const member of [server, laptop]) {
    const { invite } = await local.call('group.invite', {});
    await member.call('group.join', { invite });
  }
  const byUrl = new Map<string, FakeClient>([
    [SERVER_URL, server],
    [LAPTOP_URL, laptop]
  ]);
  return new GroupClient(local, {
    keys: memoryKeys(),
    changed,
    open: (link) => byUrl.get(link.url) ?? server,
    reach: async (addresses) => (machines === 'away' && addresses.includes(LAPTOP_URL) ? null : (addresses[0] ?? null))
  });
}
