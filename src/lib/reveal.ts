/*
 * Showing a thread or an agent in Boite's own window: the owner-only RPC
 * `ui.reveal`, which the core passes to Boite's open windows and answers with
 * how many took it. Bots's windows have no page of their own for a thread.
 *
 * A Boite older than the RPC answers "method not found": that, like any other
 * failure, comes back as a short sentence for the window to show, never as a
 * thrown error.
 */
import { RpcErrorCode } from '@boite/contracts';
import type { Client } from '@boite/ui/lib/client';
import { fill, strings } from './strings';

export type RevealTarget = { kind: 'thread'; threadId: string } | { kind: 'agent'; agentId: string };

/** The RPC is newer than the contracts Bots builds against, so it is called by name. */
interface LooseClient {
  call(method: string, params: unknown): Promise<unknown>;
}

let client: Client | null = null;
let onfail: ((message: string) => void) | null = null;

/** The client the window talks to Boite through, and where a failure is told. */
export function useReveal(next: Client | null, failed: ((message: string) => void) | null): void {
  client = next;
  onfail = failed;
}

/** The sentence a failure becomes. */
export function revealProblem(error: unknown): string {
  const code = error && typeof error === 'object' && 'code' in error ? (error as { code: unknown }).code : null;
  if (code === RpcErrorCode.MethodNotFound) return strings.bots.revealUnsupported;
  const reason = error instanceof Error ? error.message : String(error);
  return fill(strings.bots.revealFailed, { reason: reason.length > 120 ? `${reason.slice(0, 119)}…` : reason });
}

/** Asks Boite to show the target. Null when it went out, else the sentence that was told. */
export async function reveal(target: RevealTarget): Promise<string | null> {
  try {
    if (!client) throw new Error(strings.bots.waiting);
    await (client as unknown as LooseClient).call('ui.reveal', { target });
    return null;
  } catch (error) {
    const message = revealProblem(error);
    onfail?.(message);
    return message;
  }
}
