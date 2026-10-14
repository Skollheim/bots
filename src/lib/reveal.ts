/*
 * Showing a thread, an agent or the app updates in Boite's own window: the owner-only RPC
 * `ui.reveal`, which the core passes to Boite's open windows and answers with
 * how many took it. Bots's windows have no page of their own for a thread.
 *
 * A thread or an agent of another machine of the group goes to this
 * machine's core all the same, its machine named by `coreId`: Boite's window
 * here opens it under that machine. A core older than that refuses a thread
 * it does not hold, and the notice says where it runs instead, as Bots did
 * before. It would take an agent's id for one of its own, so an agent of
 * another machine goes only to a core that says it knows machines
 * (`features.revealMachines`), or that already showed a thread of another.
 *
 * A Boite older than the RPC answers "method not found": that, like any other
 * failure, comes back as a short sentence for the window to show, never as a
 * thrown error.
 */
import { RpcErrorCode, type UiRevealTarget } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { GroupClient } from './group/group-client';
import { fill, strings } from './strings';

/**
 * What Boite's window may be asked to show. `update`, Boite's app updates in
 * its settings, came with beboite/boite#418; `coreId`, the machine a thread or
 * an agent lives on, with the reveal across machines. The contract in
 * vendor/boite names neither yet: an older core refuses `update` as invalid
 * params, and a thread of another machine as not its own.
 */
export type RevealTarget = { kind: 'thread'; threadId: string; coreId?: string } | { kind: 'agent'; agentId: string; coreId?: string } | { kind: 'update' };

let client: Client | null = null;
let onfail: ((message: string) => void) | null = null;

/** The client the window talks to Boite through, and where a failure is told. */
export function useReveal(next: Client | null, failed: ((message: string) => void) | null): void {
  client = next;
  onfail = failed;
}

/** The sentence a failure becomes; a Boite that cannot open its updates says where they are. */
export function revealProblem(error: unknown, target?: RevealTarget): string {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : null;
  if (target?.kind === 'update' && (code === RpcErrorCode.MethodNotFound || code === RpcErrorCode.InvalidParams)) return strings.island.update.manual;
  if (code === RpcErrorCode.MethodNotFound) return strings.bots.revealUnsupported;
  const reason = error instanceof Error ? error.message : String(error);
  return fill(strings.bots.revealFailed, { reason: reason.length > 120 ? `${reason.slice(0, 119)}…` : reason });
}

/** The cores that showed a thread of another machine: they know machines, whatever their features say. */
const knowsMachines = new WeakSet<object>();

function takesMachines(client: Client): boolean {
  const features = (client as { core?: { features?: Record<string, unknown> } | null }).core?.features;
  return features?.['revealMachines'] === true || knowsMachines.has(client);
}

/** The machine the target lives on, when it is another of the group: its id and its name. */
function machineOf(target: RevealTarget, group: GroupClient | null): { coreId: string; name: string } | null {
  if (target.kind === 'update' || !group) return null;
  const coreId = target.coreId ?? (target.kind === 'thread' ? group.coreIdOf(target.threadId) : null);
  if (coreId === null || coreId === group.selfId()) return null;
  return { coreId, name: group.nameOf(coreId) ?? (target.kind === 'thread' ? group.machineOf(target.threadId) : null) ?? coreId };
}

/** The target as a core of any age takes it: a thread or an agent of this machine names no machine. */
function here(target: RevealTarget): UiRevealTarget {
  if (target.kind === 'thread') return { kind: 'thread', threadId: target.threadId };
  if (target.kind === 'agent') return { kind: 'agent', agentId: target.agentId };
  return target as unknown as UiRevealTarget;
}

function told(message: string): string {
  onfail?.(message);
  return message;
}

/** Asks Boite to show the target. Null when it went out, else the sentence that was told. */
export async function reveal(target: RevealTarget): Promise<string | null> {
  try {
    if (!client) throw new Error(strings.bots.waiting);
    const machine = machineOf(target, client instanceof GroupClient ? client : null);
    if (machine === null) {
      await client.call('ui.reveal', { target: here(target) });
      return null;
    }
    const elsewhere = fill(target.kind === 'agent' ? strings.bots.revealAgentElsewhere : strings.bots.revealElsewhere, { machine: machine.name });
    if (target.kind === 'agent' && !takesMachines(client)) return told(elsewhere);
    try {
      await client.call('ui.reveal', { target: { ...target, coreId: machine.coreId } as never });
    } catch (error) {
      // A core that does not know that machine, or does not know machines yet: where it runs is said instead.
      if (error && typeof error === 'object' && (error as { code?: unknown }).code === RpcErrorCode.InvalidParams) return told(elsewhere);
      throw error;
    }
    if (target.kind === 'thread') knowsMachines.add(client);
    return null;
  } catch (error) {
    return told(revealProblem(error, target));
  }
}
