/*
 * The island's view contract: what a view of the island (`components/island/
 * views/`) receives from the frame (`Island.svelte`), and how it talks back.
 * A view reads it with `useView()`; the frame sets it once with `provideView()`.
 *
 * - `companion`: the companion's state and actions (`lib/companion/
 *   companion.svelte.ts`): the crew and their conversations, the threads, the
 *   requests, the timer, the reminders. A view draws them; it changes them only
 *   through the companion's methods.
 * - `core`: the link to Boite's core, the client (null until found) and whether
 *   it answers. Every call goes through the core's RPC, never elsewhere.
 * - `island`: the frame's state, read-only: its size, its tab, its pin, its glow.
 * - `attention(key)`: the view needs the user. The island opens, glows amber and
 *   plays the call cue (unless `quiet`) until the returned function lets it go.
 *   Permissions and questions are the frame's own: they need no call.
 * - `hold(key, on)`: the view wants the island to stay open while the pointer
 *   is away (a field with the keyboard, a menu, a drag over it); `false` lets it go.
 * - `reveal(threadId)`: shows a thread in Boite's window.
 * - `show(tab)`: turns the island to another tab.
 */
import { getContext, setContext } from 'svelte';
import type { Client } from '@boite/ui/lib/client';
import type { Companion } from '../companion/companion.svelte';
import type { IslandGlow, IslandSize, IslandTab } from './frame.svelte';

export interface IslandCore {
  readonly client: Client | null;
  readonly reachable: boolean;
}

export interface IslandState {
  readonly size: IslandSize;
  readonly tab: IslandTab;
  readonly pinned: boolean;
  readonly glow: IslandGlow;
}

export interface ViewContext {
  readonly companion: Companion;
  readonly core: IslandCore;
  readonly island: IslandState;
  attention(key: string, options?: { quiet?: boolean }): () => void;
  hold(key: string, on: boolean): void;
  reveal(threadId: string): Promise<void>;
  show(tab: IslandTab): void;
}

const KEY = Symbol('island-view');

export function provideView(context: ViewContext): void {
  setContext(KEY, context);
}

export function useView(): ViewContext {
  const context = getContext<ViewContext | undefined>(KEY);
  if (!context) throw new Error('An island view is drawn inside the island only.');
  return context;
}
