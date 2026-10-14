import { afterEach, expect, test } from 'vitest';
import {
  addApp,
  addLink,
  addTab,
  addTool,
  BAR_EDIT_KEY,
  BAR_MAX,
  BAR_STORAGE_KEY,
  barTabs,
  canRemove,
  cleanLabel,
  DEFAULT_BAR,
  hiddenTabs,
  hiddenTools,
  isDefaultBar,
  LABEL_MAX,
  linkHost,
  moveItem,
  moveTool,
  parseBar,
  readBar,
  readBarEdit,
  removeItem,
  removeTool,
  renameItem,
  shownTab,
  subscribeBar,
  subscribeBarEdit,
  webLink,
  writeBar,
  writeBarEdit
} from './bar';
import { DECK_TABS } from './deck-tabs';

afterEach(() => window.localStorage.clear());

const steam = { id: 'C:\\Start Menu\\Programs\\Steam.lnk', name: 'Steam' };

test('the bar starts with every tab in the deck order and every control', () => {
  const bar = parseBar(null);
  expect(barTabs(bar)).toEqual([...DECK_TABS]);
  expect(bar.tools).toEqual(['quotas', 'pin', 'sound']);
  expect(isDefaultBar(bar)).toBe(true);
  expect(hiddenTabs(bar)).toEqual([]);
  // The default is never handed out to be changed in place.
  bar.items.pop();
  expect(DEFAULT_BAR.items).toHaveLength(DECK_TABS.length);
});

test('a stored bar is read field by field: unknown things, repeats and odd names go', () => {
  const bar = parseBar({
    items: [
      { kind: 'tab', tab: 'chat', label: '  My   chat  ' },
      { kind: 'tab', tab: 'chat' },
      { kind: 'tab', tab: 'home' },
      { kind: 'app', app: steam.id, name: 'Steam', label: '' },
      { kind: 'app', app: '', name: 'Nothing' },
      { kind: 'link', key: 'link:a', url: 'https://example.com', label: 7 },
      { kind: 'link', key: 'link:b', url: 'javascript:alert(1)' },
      { kind: 'link', url: 'https://nokey.example' },
      'threads'
    ],
    tools: ['sound', 'sound', 'settings', 'pin']
  });
  expect(bar.items.map((item) => item.key)).toEqual(['tab:chat', `app:${steam.id}`, 'link:a']);
  expect(bar.items[0]!.label).toBe('My chat');
  expect(bar.items[1]!.label).toBeNull();
  expect(bar.tools).toEqual(['sound', 'pin']);
});

test('a bar without a tab starts again from the default tabs, keeping its controls', () => {
  const bar = parseBar({ items: [{ kind: 'app', app: steam.id, name: 'Steam' }], tools: [] });
  expect(barTabs(bar)).toEqual([...DECK_TABS]);
  expect(bar.tools).toEqual([]);
});

test('tabs come and go, the last one stays, and the deck opens on one the bar shows', () => {
  let bar = removeItem(parseBar(null), 'tab:music');
  expect(hiddenTabs(bar)).toEqual(['music']);
  expect(shownTab(bar, 'music')).toBe('threads');
  expect(shownTab(bar, 'stats')).toBe('stats');
  bar = addTab(bar, 'music');
  expect(barTabs(bar).at(-1)).toBe('music');
  expect(addTab(bar, 'music')).toBe(bar);

  let one = parseBar({ items: [{ kind: 'tab', tab: 'chat' }, { kind: 'app', app: steam.id, name: 'Steam' }] });
  expect(canRemove(one, 'tab:chat')).toBe(false);
  expect(removeItem(one, 'tab:chat')).toBe(one);
  expect(canRemove(one, `app:${steam.id}`)).toBe(true);
  one = removeItem(one, `app:${steam.id}`);
  expect(one.items).toHaveLength(1);
  expect(canRemove(one, 'nothing')).toBe(false);
});

test('things move along the bar, names change and an empty name gives the default back', () => {
  let bar = moveItem(parseBar(null), 0, 3);
  expect(barTabs(bar).slice(0, 4)).toEqual(['today', 'chat', 'stats', 'threads']);
  bar = moveItem(bar, 8, -5);
  expect(barTabs(bar)[0]).toBe('system');
  bar = renameItem(bar, 'tab:today', '  Day ');
  expect(bar.items.find((item) => item.key === 'tab:today')!.label).toBe('Day');
  bar = renameItem(bar, 'tab:today', '   ');
  expect(bar.items.find((item) => item.key === 'tab:today')!.label).toBeNull();
  expect(cleanLabel('x'.repeat(LABEL_MAX + 10))).toHaveLength(LABEL_MAX);
});

test('an app goes in once, and the bar takes BAR_MAX things at most', () => {
  let bar = addApp(parseBar(null), steam);
  expect(bar.items.at(-1)).toEqual({ kind: 'app', key: `app:${steam.id}`, app: steam.id, name: 'Steam', label: null });
  expect(addApp(bar, steam)).toBe(bar);
  for (let n = 0; bar.items.length < BAR_MAX; n++) bar = addApp(bar, { id: `app-${n}`, name: `App ${n}` });
  expect(addApp(bar, { id: 'one-more', name: 'One more' })).toBe(bar);
  expect(addLink(bar, 'example.com', null, 'link:full')).toBe(bar);
  expect(parseBar({ items: [...bar.items, { kind: 'tab', tab: 'chat' }] }).items).toHaveLength(BAR_MAX);
});

test('a typed address becomes a whole web link, anything else is refused', () => {
  expect(webLink('github.com')).toBe('https://github.com/');
  expect(webLink(' http://localhost:3000/x ')).toBe('http://localhost:3000/x');
  expect(webLink('localhost:5173')).toBe('https://localhost:5173/');
  expect(webLink('https://intranet')).toBe('https://intranet/');
  for (const bad of ['', 'hello', 'javascript:alert(1)', 'file:///C:/x', 'ftp://x.org', 'https://', 'https://:80/x', 'exa mple.com', 'a.com/"x', `https://a.com/${'a'.repeat(2048)}`]) {
    expect(webLink(bad), bad).toBeNull();
  }
  expect(linkHost('https://www.github.com/klNuno')).toBe('github.com');
  const bar = addLink(parseBar(null), 'github.com', '  GitHub ', 'link:gh')!;
  expect(bar.items.at(-1)).toEqual({ kind: 'link', key: 'link:gh', url: 'https://github.com/', label: 'GitHub' });
  expect(addLink(bar, 'not an address', null)).toBeNull();
  const made = addLink(parseBar(null), 'example.com', null)!;
  expect(made.items.at(-1)!.key).toMatch(/^link:/);
});

test('controls go and come back at the end, and move', () => {
  let bar = removeTool(parseBar(null), 'pin');
  expect(hiddenTools(bar)).toEqual(['pin']);
  bar = addTool(bar, 'pin');
  expect(bar.tools).toEqual(['quotas', 'sound', 'pin']);
  expect(addTool(bar, 'pin')).toBe(bar);
  expect(moveTool(bar, 2, 0).tools).toEqual(['pin', 'quotas', 'sound']);
});

test('the bar is kept, told to this page, and read back from what the other window wrote', () => {
  const heard: string[][] = [];
  const stop = subscribeBar((bar) => heard.push(barTabs(bar)));
  writeBar(removeItem(parseBar(null), 'tab:system'));
  expect(barTabs(readBar())).not.toContain('system');
  expect(JSON.parse(window.localStorage.getItem(BAR_STORAGE_KEY)!).items).toHaveLength(DECK_TABS.length - 1);

  window.localStorage.setItem(BAR_STORAGE_KEY, JSON.stringify({ items: [{ kind: 'tab', tab: 'chat' }] }));
  window.dispatchEvent(new StorageEvent('storage', { key: BAR_STORAGE_KEY }));
  expect(heard.at(-1)).toEqual(['chat']);
  stop();
  window.localStorage.setItem(BAR_STORAGE_KEY, '{oops');
  expect(readBar()).toEqual(DEFAULT_BAR);
});

test('the edit mode is asked for and ended through one key both windows hear', () => {
  const heard: boolean[] = [];
  const stop = subscribeBarEdit((on) => heard.push(on));
  expect(readBarEdit()).toBe(false);
  writeBarEdit(true);
  expect(window.localStorage.getItem(BAR_EDIT_KEY)).toBe('1');
  expect(readBarEdit()).toBe(true);
  // Done on the island, heard in Settings.
  window.localStorage.removeItem(BAR_EDIT_KEY);
  window.dispatchEvent(new StorageEvent('storage', { key: BAR_EDIT_KEY }));
  writeBarEdit(false);
  expect(heard).toEqual([true, false, false]);
  stop();
});
