/*
 * The deck's tabs, in the order the tab bar shows them. Boite's own come
 * first: the threads, the day, the chat, the numbers and the music; then
 * the computer's: its apps, its clipboard, its wallpaper and its power.
 * Each tab is one component under `components/island/deck/tabs/`.
 *
 * The deck opens on the last tab used, kept in `localStorage`; the tab bar
 * is a tablist whose focus moves with the arrows, Home and End (`tabKey`).
 * The user may leave tabs out of the bar and reorder them (`bar.ts`): both
 * then follow the bar's order, `order`, which is the deck's by default.
 */
export const DECK_TABS = ['threads', 'today', 'chat', 'stats', 'music', 'apps', 'clipboard', 'wallpaper', 'system'] as const;

export type DeckTab = (typeof DECK_TABS)[number];

export const isDeckTab = (value: unknown): value is DeckTab => (DECK_TABS as readonly unknown[]).includes(value);

/** Where the last tab used is kept. */
export const DECK_TAB_KEY = 'bots.deckTab';
/** The tab the deck opens on the first time. */
export const FIRST_TAB: DeckTab = 'threads';

type Store = Pick<Storage, 'getItem' | 'setItem'>;

/** The last tab used; the first tab when none was kept or the kept one is gone. */
export function readDeckTab(store: Store | null): DeckTab {
  try {
    const kept = store?.getItem(DECK_TAB_KEY);
    return isDeckTab(kept) ? kept : FIRST_TAB;
  } catch {
    return FIRST_TAB;
  }
}

export function writeDeckTab(store: Store | null, tab: DeckTab): void {
  try {
    store?.setItem(DECK_TAB_KEY, tab);
  } catch {
    /* a refused storage still remembers for this session */
  }
}

/** Which way the content slides from one tab to another: 1 to the right of the bar, -1 to the left, 0 for none or for a tab the bar leaves out. */
export function travel(from: DeckTab, to: DeckTab, order: readonly DeckTab[] = DECK_TABS): -1 | 0 | 1 {
  const [a, b] = [order.indexOf(from), order.indexOf(to)];
  if (a < 0 || b < 0 || a === b) return 0;
  return b > a ? 1 : -1;
}

/** The tab a key moves the focus to in the tab bar, or null for a key it ignores. The arrows wrap around. */
export function tabKey(key: string, from: DeckTab, order: readonly DeckTab[] = DECK_TABS): DeckTab | null {
  if (order.length === 0) return null;
  const at = Math.max(0, order.indexOf(from));
  const last = order.length - 1;
  if (key === 'ArrowRight') return order[at === last ? 0 : at + 1]!;
  if (key === 'ArrowLeft') return order[at === 0 ? last : at - 1]!;
  if (key === 'Home') return order[0]!;
  if (key === 'End') return order[last]!;
  return null;
}
