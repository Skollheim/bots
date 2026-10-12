/*
 * The deck's tabs, in the order the tab bar shows them. Boite's own come
 * first: the threads, the day, the chat, the numbers and the music; then
 * the computer's: its apps, its clipboard, its wallpaper and its power.
 * Each tab is one component under `components/island/deck/tabs/`.
 *
 * The deck opens on the last tab used, kept in `localStorage`; the tab bar
 * is a tablist whose focus moves with the arrows, Home and End (`tabKey`).
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

/** Which way the content slides from one tab to another: 1 to the right of the bar, -1 to the left, 0 for none. */
export function travel(from: DeckTab, to: DeckTab): -1 | 0 | 1 {
  const delta = DECK_TABS.indexOf(to) - DECK_TABS.indexOf(from);
  return delta === 0 ? 0 : delta > 0 ? 1 : -1;
}

/** The tab a key moves the focus to in the tab bar, or null for a key it ignores. The arrows wrap around. */
export function tabKey(key: string, from: DeckTab): DeckTab | null {
  const at = DECK_TABS.indexOf(from);
  const last = DECK_TABS.length - 1;
  if (key === 'ArrowRight') return DECK_TABS[at === last ? 0 : at + 1]!;
  if (key === 'ArrowLeft') return DECK_TABS[at === 0 ? last : at - 1]!;
  if (key === 'Home') return DECK_TABS[0];
  if (key === 'End') return DECK_TABS[last]!;
  return null;
}
