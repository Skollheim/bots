import type { ThreadSummary } from '@boite/contracts';

/*
 * When the companion reads the core's lists again. Each read asks every machine
 * for its threads, permissions and questions, and a slow core takes seconds to
 * answer. A turn's progress (its context, its time) sends a thread change
 * several times a second; each one used to schedule a read, and the reads
 * overlapped while the core was slow.
 */

/** A changed thread asks for the requests to be read again only when it is new or its status moved: a permission that waits turns it `waiting`. */
export function asksRead(before: ThreadSummary | undefined, after: ThreadSummary): boolean {
  return before === undefined || before.status !== after.status;
}

/** Runs `read` one at a time: a call during a read waits for it, and one more read follows it however many calls came. */
export function oneAtATime(read: () => Promise<void>): () => Promise<void> {
  let running: Promise<void> | null = null;
  let again = false;
  const run = (): Promise<void> => {
    if (running) {
      again = true;
      return running;
    }
    running = read().finally(() => {
      running = null;
      if (!again) return;
      again = false;
      void run();
    });
    return running;
  };
  return run;
}
