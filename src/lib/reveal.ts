/*
 * Showing a thread, an agent or the app updates in Boite's own window: the owner-only RPC
 * `ui.reveal`, which the core passes to Boite's open windows and answers with
 * how many took it. Bots's windows have no page of their own for a thread.
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
 * `update`, Boite's app updates in its settings, came with beboite/boite#418:
 * the contract in vendor/boite does not name it yet. An older core refuses it
 * as invalid params.
 */
export type RevealTarget = UiRevealTarget | { kind: 'update' };

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

/** Asks Boite to show the target. Null when it went out, else the sentence that was told. */
export async function reveal(target: RevealTarget): Promise<string | null> {
  try {
    if (!client) throw new Error(strings.bots.waiting);
    // A thread of another machine: this machine's Boite takes `ui.reveal` for its own threads only,
    // and that machine's core would bring Boite up over there. Said instead of sent.
    const machine = target.kind === 'thread' && client instanceof GroupClient ? client.machineOf(target.threadId) : null;
    if (machine !== null) {
      const message = fill(strings.bots.revealElsewhere, { machine });
      onfail?.(message);
      return message;
    }
    await client.call('ui.reveal', { target: target as UiRevealTarget });
    return null;
  } catch (error) {
    const message = revealProblem(error, target);
    onfail?.(message);
    return message;
  }
}
