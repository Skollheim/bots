/*
 * The followed thread (`followed.ts`) held for the island: read once from
 * `localStorage`, written on each change. Which core it belongs to is asked
 * each time, so a change of core shows that core's own choice.
 */
import { FOLLOWED_KEY, parseFollowed, withFollowed, type FollowedMap } from './followed';

function read(): FollowedMap {
  try {
    return parseFollowed(window.localStorage.getItem(FOLLOWED_KEY));
  } catch {
    return {};
  }
}

export class Followed {
  #all = $state.raw<FollowedMap>(read());

  /** `core` names the core the choice belongs to (`coreKey`). */
  constructor(private readonly core: () => string) {}

  /** The thread followed on this core; null for none. */
  get id(): string | null {
    return this.#all[this.core()] ?? null;
  }

  set(threadId: string | null): void {
    const core = this.core();
    if ((this.#all[core] ?? null) === threadId) return;
    this.#all = withFollowed(this.#all, core, threadId);
    try {
      window.localStorage.setItem(FOLLOWED_KEY, JSON.stringify(this.#all));
    } catch {
      /* a refused storage still follows for this session */
    }
  }

  /** Follows the thread, or lets it go when it is the one followed. */
  toggle(threadId: string): void {
    this.set(this.id === threadId ? null : threadId);
  }
}
