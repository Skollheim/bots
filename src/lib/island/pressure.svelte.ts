/*
 * The island's memory watch: reads how close the agents are to the memory
 * guard's limits (`resources.memoryStatus`), and when one comes near, which
 * conversation holds the most (`resources.usage`). The island warns with a
 * card that names it and stops it (`resources.killTree`, as Boite's task
 * manager does), and says so when the guard stopped something itself
 * (`resources.memory`). Pure thresholds: `pressure.ts`.
 */
import type { Client } from '@boite/ui/lib/client';
import { CALM_SHARE, guardOff, heaviest, NEAR_SHARE, nearness, pressureOf, samePressure, stoppedOf, WARN_SHARE, type AgentLoad, type Pressure, type Stopped } from './pressure';

/** How often the core is read while every limit is far, and once one comes near. */
export const CALM_EVERY = 20_000;
export const NEAR_EVERY = 5_000;
/** With the guard off, now and then, in case it is turned on. */
const OFF_EVERY = 120_000;
/** How long the card says what the guard stopped. */
const STOPPED_MS = 60_000;
const MB = 1024 * 1024;

export class MemoryWatch {
  pressure = $state.raw<Pressure | null>(null);
  stopped = $state.raw<Stopped | null>(null);
  stopping = $state(false);
  problem = $state('');
  /** A warning set aside: it stays hidden until the memory calms down or another conversation is the cause. */
  #ignored = $state.raw<Pressure | null>(null);
  /** The warning to show: the pressure, unless set aside. */
  readonly warning = $derived(this.pressure && !samePressure(this.pressure, this.#ignored) ? this.pressure : null);

  #stoppedTimer: ReturnType<typeof setTimeout> | undefined;

  /** Reads now and again, faster near a limit, and on every memory event. Returns the stop. */
  follow(client: Client, titleOf: (threadId: string) => string): () => void {
    let ended = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const next = async () => {
      let wait = CALM_EVERY;
      try {
        wait = await this.read(client);
      } catch {
        // The next read tries again.
      }
      if (!ended) timer = setTimeout(() => void next(), wait);
    };
    void next();
    const off = client.on('resources.memory', (event) => {
      const gone = stoppedOf(event, titleOf);
      if (gone) {
        this.stopped = gone;
        clearTimeout(this.#stoppedTimer);
        this.#stoppedTimer = setTimeout(() => (this.stopped = null), STOPPED_MS);
      }
      void this.read(client).catch(() => {});
    });
    return () => {
      ended = true;
      clearTimeout(timer);
      clearTimeout(this.#stoppedTimer);
      off();
    };
  }

  /** One read; returns how long to wait before the next. */
  async read(client: Client): Promise<number> {
    const status = await client.call('resources.memoryStatus', {});
    if (guardOff(status)) {
      this.pressure = null;
      this.#ignored = null;
      return OFF_EVERY;
    }
    // The conversations are read only near a limit: the budget, the reserve, or the agents together near one conversation's cap.
    const cap = status.limits.threadMemoryCapMb * MB;
    const closeToCap = cap > 0 && status.agentBytes >= cap * NEAR_SHARE;
    let agents: AgentLoad[] = [];
    if (nearness(status) >= NEAR_SHARE || closeToCap || status.state === 'critical') agents = (await client.call('resources.usage', {})).agents;
    const next = pressureOf(status, agents, this.pressure ? CALM_SHARE : WARN_SHARE);
    if (!samePressure(next, this.pressure) || next?.used !== this.pressure?.used || next?.bytes !== this.pressure?.bytes) this.pressure = next;
    const near = nearness(status, heaviest(agents)?.load.memoryBytes ?? 0) >= NEAR_SHARE;
    // Set aside until the memory calms down well under the line.
    if (!next && !near) this.#ignored = null;
    return near ? NEAR_EVERY : CALM_EVERY;
  }

  /** Stops the conversation's processes, as Boite's task manager does. */
  async stop(client: Client, threadId: string, failed: (reason: string) => string): Promise<void> {
    if (this.stopping) return;
    this.stopping = true;
    this.problem = '';
    try {
      await client.call('resources.killTree', { threadId });
      await this.read(client).catch(() => {});
    } catch (error) {
      this.problem = failed(error instanceof Error ? error.message : String(error));
    } finally {
      this.stopping = false;
    }
  }

  /** Sets the warning aside until it changes. */
  ignore(): void {
    this.#ignored = this.pressure;
    this.problem = '';
  }

  dismissStopped(): void {
    clearTimeout(this.#stoppedTimer);
    this.stopped = null;
  }

  /** A capture pose's warning (`pose.ts`). */
  pose(pressure: Pressure | null, stopped: Stopped | null = null): void {
    this.pressure = pressure;
    this.stopped = stopped;
  }
}
