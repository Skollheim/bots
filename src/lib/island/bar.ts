/*
 * The deck's bar as the user arranged it: which tabs it shows, in what order
 * and under what name, the shortcuts added among them (an app of the Start
 * menu, a web link) and the controls on its right (the quotas, the pin, the
 * sound). Settings stays there whatever happens: it is the way back here.
 *
 * Kept in `localStorage` under `bots.bar`, apart from the companion's prefs,
 * so the settings panel and the island share it, and a write from another
 * page reaches this one through `storage`. A missing or odd field takes the
 * default: every tab in `DECK_TABS` order, every control.
 *
 * The bar is edited on the island itself, in its edit mode (`DeckBar`,
 * `BarPalette`). Settings asks for that mode through `bots.barEdit`, which
 * holds "1" while the island is being edited; whichever window ends it
 * clears the key.
 */
import { DECK_TABS, isDeckTab, type DeckTab } from './deck-tabs';

/** The controls on the bar's right that can come and go. */
export const BAR_TOOLS = ['quotas', 'pin', 'sound'] as const;
export type BarTool = (typeof BAR_TOOLS)[number];
const isBarTool = (value: unknown): value is BarTool => (BAR_TOOLS as readonly unknown[]).includes(value);

/**
 * One thing of the bar. `label` is the user's name for it; null keeps the
 * default: the tab's own name, an app's icon alone, a link's host.
 */
export type BarItem =
  | { kind: 'tab'; key: string; tab: DeckTab; label: string | null }
  | { kind: 'app'; key: string; app: string; name: string; label: string | null }
  | { kind: 'link'; key: string; url: string; label: string | null };

export interface BarLayout {
  items: BarItem[];
  tools: BarTool[];
}

export const BAR_STORAGE_KEY = 'bots.bar';
export const BAR_EDIT_KEY = 'bots.barEdit';
/** What the bar holds at most: past that, it no longer fits the deck's width. */
export const BAR_MAX = 16;
/** A name's length at most. */
export const LABEL_MAX = 24;
const URL_MAX = 2048;

const tabItem = (tab: DeckTab, label: string | null = null): BarItem => ({ kind: 'tab', key: `tab:${tab}`, tab, label });

export const DEFAULT_BAR: BarLayout = { items: DECK_TABS.map((tab) => tabItem(tab)), tools: [...BAR_TOOLS] };

const isRecord = (value: unknown): value is Record<string, unknown> => value !== null && typeof value === 'object' && !Array.isArray(value);

/** A name as kept: trimmed, cut at `LABEL_MAX`; empty is none. */
export function cleanLabel(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.replace(/\s+/g, ' ').trim();
  return trimmed ? [...trimmed].slice(0, LABEL_MAX).join('') : null;
}

/**
 * What the user typed as a web address, made whole: `github.com` becomes
 * `https://github.com/`. Null for anything that is not an http or https
 * address with a host, which the shell would refuse too (`computer/links.rs`).
 */
export function webLink(text: string): string | null {
  const typed = text.trim();
  if (!typed || typed.length > URL_MAX || /[\s"<>`]/.test(typed)) return null;
  // `localhost:5173` is a host and its port; `mailto:` or `javascript:` is a scheme, and no web one.
  const schemed = /^[a-z][a-z0-9+.-]*:\/\//i.test(typed);
  if (!schemed && /^[a-z][a-z0-9+.-]*:(?!\d)/i.test(typed)) return null;
  const withScheme = schemed ? typed : `https://${typed}`;
  let url: URL;
  try {
    url = new URL(withScheme);
  } catch {
    return null;
  }
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !url.hostname) return null;
  // A bare word ("hello") is no address; "localhost" and an IP are.
  if (!/^https?:/i.test(typed) && !url.hostname.includes('.') && url.hostname !== 'localhost') return null;
  return url.href.length > URL_MAX ? null : url.href;
}

/** A link's host without its `www.`, the name a link shows by default. */
export function linkHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function itemOf(value: unknown): BarItem | null {
  if (!isRecord(value)) return null;
  const label = cleanLabel(value.label);
  if (value.kind === 'tab') return isDeckTab(value.tab) ? tabItem(value.tab, label) : null;
  if (value.kind === 'app') {
    const { app, name } = value;
    if (typeof app !== 'string' || !app || typeof name !== 'string' || !name.trim()) return null;
    return { kind: 'app', key: `app:${app}`, app, name: name.trim(), label };
  }
  if (value.kind === 'link') {
    const url = typeof value.url === 'string' ? webLink(value.url) : null;
    const key = typeof value.key === 'string' && value.key.startsWith('link:') ? value.key : null;
    return url && key ? { kind: 'link', key, url, label } : null;
  }
  return null;
}

/** Whatever was stored, as a bar: each thing once, at least one tab, `BAR_MAX` things at most. */
export function parseBar(raw: unknown): BarLayout {
  if (!isRecord(raw)) return structuredClone(DEFAULT_BAR);
  const seen = new Set<string>();
  const items: BarItem[] = [];
  for (const value of Array.isArray(raw.items) ? raw.items : []) {
    const item = itemOf(value);
    if (!item || seen.has(item.key) || items.length >= BAR_MAX) continue;
    seen.add(item.key);
    items.push(item);
  }
  const tools = Array.isArray(raw.tools) ? [...new Set(raw.tools.filter(isBarTool))] : [...BAR_TOOLS];
  // A bar without a tab is no deck: it starts again from the default.
  if (!items.some((item) => item.kind === 'tab')) return { items: structuredClone(DEFAULT_BAR.items), tools };
  return { items, tools };
}

/** The tabs the bar shows, in its order. */
export const barTabs = (layout: BarLayout): DeckTab[] => layout.items.flatMap((item) => (item.kind === 'tab' ? [item.tab] : []));

/** The tabs left out, in the deck's order. */
export function hiddenTabs(layout: BarLayout): DeckTab[] {
  const shown = new Set(barTabs(layout));
  return DECK_TABS.filter((tab) => !shown.has(tab));
}

export const hiddenTools = (layout: BarLayout): BarTool[] => BAR_TOOLS.filter((tool) => !layout.tools.includes(tool));

export const barFull = (layout: BarLayout): boolean => layout.items.length >= BAR_MAX;

/** The tab the deck opens on: `wanted` when the bar shows it, else its first tab. */
export function shownTab(layout: BarLayout, wanted: DeckTab): DeckTab {
  const tabs = barTabs(layout);
  return tabs.includes(wanted) ? wanted : (tabs[0] ?? wanted);
}

function moved<T>(list: readonly T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || from >= next.length) return next;
  const [item] = next.splice(from, 1);
  next.splice(Math.max(0, Math.min(to, next.length)), 0, item!);
  return next;
}

function added(layout: BarLayout, item: BarItem): BarLayout {
  if (barFull(layout) || layout.items.some((known) => known.key === item.key)) return layout;
  return { ...layout, items: [...layout.items, item] };
}

export const addTab = (layout: BarLayout, tab: DeckTab): BarLayout => added(layout, tabItem(tab));

export const addApp = (layout: BarLayout, app: { id: string; name: string }): BarLayout =>
  added(layout, { kind: 'app', key: `app:${app.id}`, app: app.id, name: app.name, label: null });

/** A link at the bar's end; null when `text` is no web address. `key` is made here, unique enough for one bar. */
export function addLink(layout: BarLayout, text: string, label: string | null, key = `link:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`): BarLayout | null {
  const url = webLink(text);
  return url ? added(layout, { kind: 'link', key, url, label: cleanLabel(label) }) : null;
}

/** Whether `key` may go: anything but the bar's last tab. */
export function canRemove(layout: BarLayout, key: string): boolean {
  const item = layout.items.find((known) => known.key === key);
  return item !== undefined && (item.kind !== 'tab' || barTabs(layout).length > 1);
}

export function removeItem(layout: BarLayout, key: string): BarLayout {
  return canRemove(layout, key) ? { ...layout, items: layout.items.filter((item) => item.key !== key) } : layout;
}

export const moveItem = (layout: BarLayout, from: number, to: number): BarLayout => ({ ...layout, items: moved(layout.items, from, to) });

export function renameItem(layout: BarLayout, key: string, label: string): BarLayout {
  return { ...layout, items: layout.items.map((item) => (item.key === key ? { ...item, label: cleanLabel(label) } : item)) };
}

export const addTool = (layout: BarLayout, tool: BarTool): BarLayout => (layout.tools.includes(tool) ? layout : { ...layout, tools: [...layout.tools, tool] });
export const removeTool = (layout: BarLayout, tool: BarTool): BarLayout => ({ ...layout, tools: layout.tools.filter((known) => known !== tool) });
export const moveTool = (layout: BarLayout, from: number, to: number): BarLayout => ({ ...layout, tools: moved(layout.tools, from, to) });

export const isDefaultBar = (layout: BarLayout): boolean => JSON.stringify(parseBar(layout)) === JSON.stringify(DEFAULT_BAR);

type Store = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;
const local = (): Store | null => (typeof window === 'undefined' ? null : window.localStorage);

export function readBar(store: Store | null = local()): BarLayout {
  try {
    const raw = store?.getItem(BAR_STORAGE_KEY);
    return parseBar(raw ? JSON.parse(raw) : null);
  } catch {
    return structuredClone(DEFAULT_BAR);
  }
}

type Listener<T> = (value: T) => void;
const barListeners = new Set<Listener<BarLayout>>();
const editListeners = new Set<Listener<boolean>>();

/** Stores the bar and tells this page; the other window hears it through `storage`. */
export function writeBar(layout: BarLayout, store: Store | null = local()): BarLayout {
  const next = parseBar(layout);
  try {
    store?.setItem(BAR_STORAGE_KEY, JSON.stringify(next));
  } catch {
    /* a refused storage still runs for this session */
  }
  for (const listener of barListeners) listener(next);
  return next;
}

/** The island is being edited, as both windows see it. */
export function readBarEdit(store: Store | null = local()): boolean {
  try {
    return store?.getItem(BAR_EDIT_KEY) === '1';
  } catch {
    return false;
  }
}

/** Asks for the edit mode, or ends it. */
export function writeBarEdit(on: boolean, store: Store | null = local()): void {
  try {
    if (on) store?.setItem(BAR_EDIT_KEY, '1');
    else store?.removeItem(BAR_EDIT_KEY);
  } catch {
    /* the other window just does not hear it */
  }
  for (const listener of editListeners) listener(on);
}

function follow<T>(key: string, listeners: Set<Listener<T>>, read: () => T, listener: Listener<T>): () => void {
  const fromOtherPage = (event: StorageEvent) => {
    if (event.key === key || event.key === null) listener(read());
  };
  listeners.add(listener);
  window.addEventListener('storage', fromOtherPage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('storage', fromOtherPage);
  };
}

/** Runs on each change of the bar, from this page or the other window. Returns the function that stops it. */
export const subscribeBar = (listener: Listener<BarLayout>): (() => void) => follow(BAR_STORAGE_KEY, barListeners, () => readBar(), listener);

/** Runs when the edit mode is asked for or ended, here or in the other window. */
export const subscribeBarEdit = (listener: Listener<boolean>): (() => void) => follow(BAR_EDIT_KEY, editListeners, () => readBarEdit(), listener);
