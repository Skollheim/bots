/*
 * The project names Bots shows, the other machines' included: a thread of
 * another machine of the group reads « Petites-Rives · Portable » wherever
 * its project is named (Home's rows, the pill, the HUD, the requests, the
 * rules), so it says where it runs. This machine's projects stay as they are.
 */
import type { Project } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { GroupClient } from './group-client';
import { placedName } from './routing';

/** Project id → the name to show; `local` is this machine's own list, for what starts here. */
export async function placedProjects(client: Client): Promise<{ names: Map<string, string>; local: Project[] }> {
  const local = await client.call('projects.list', {});
  const names = new Map(local.map((project) => [project.id, project.name]));
  if (client instanceof GroupClient) {
    for (const { core, result } of await client.elsewhere('projects.list', {})) {
      for (const project of result) if (!names.has(project.id)) names.set(project.id, placedName(project.name, core.name));
    }
  }
  return { names, local };
}
