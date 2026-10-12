/*
 * The deck's inline confirmation: a dangerous button turns into "Confirm" and
 * "Cancel" for a few seconds, then back. One armed at a time per tab: arming
 * another disarms the first. The timer is the tab's: `dispose` it on unmount.
 */

export const CONFIRM_MS = 4_000;

export interface ConfirmTimers {
  set: (run: () => void, ms: number) => unknown;
  clear: (handle: unknown) => void;
}

const browserTimers: ConfirmTimers = {
  set: (run, ms) => setTimeout(run, ms),
  clear: (handle) => clearTimeout(handle as ReturnType<typeof setTimeout>)
};

export class InlineConfirm {
  /** The key of the button waiting for its confirmation, or null. */
  armed = $state<string | null>(null);
  #handle: unknown = null;
  readonly #timers: ConfirmTimers;
  readonly #ms: number;

  constructor(ms = CONFIRM_MS, timers: ConfirmTimers = browserTimers) {
    this.#ms = ms;
    this.#timers = timers;
  }

  is(key: string): boolean {
    return this.armed === key;
  }

  arm(key: string): void {
    this.#stop();
    this.armed = key;
    this.#handle = this.#timers.set(() => {
      this.#handle = null;
      this.armed = null;
    }, this.#ms);
  }

  cancel(): void {
    this.#stop();
    this.armed = null;
  }

  /** True once, when `key` was armed: the caller then does the action. */
  confirm(key: string): boolean {
    if (this.armed !== key) return false;
    this.cancel();
    return true;
  }

  dispose(): void {
    this.cancel();
  }

  #stop(): void {
    if (this.#handle !== null) this.#timers.clear(this.#handle);
    this.#handle = null;
  }
}
