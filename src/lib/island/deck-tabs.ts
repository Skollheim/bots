/*
 * The deck's tabs, in the order the tab bar shows them. Boite's own come
 * first: the threads, the day, the chat, the numbers and the music; then
 * the computer's: its apps, its clipboard, its wallpaper and its power.
 * Each tab is one component under `components/island/deck/tabs/`.
 */
export const DECK_TABS = ['threads', 'today', 'chat', 'stats', 'music', 'apps', 'clipboard', 'wallpaper', 'system'] as const;

export type DeckTab = (typeof DECK_TABS)[number];

export const isDeckTab = (value: unknown): value is DeckTab => (DECK_TABS as readonly unknown[]).includes(value);
