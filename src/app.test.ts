import { afterEach, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from './App.svelte';
import { requestSettings, settingsPanel } from './lib/island/settings-panel.svelte';
import { strings } from './lib/strings';

/** The demo loads its fake core on demand: in a cold run its first import alone can take seconds. */
const DEMO_WAIT = { timeout: 15_000 };

let shown: { app: Record<string, unknown>; target: HTMLElement } | null = null;

function show(page: typeof App, search: string) {
  history.replaceState(null, '', `/${search}`);
  const target = document.body.appendChild(document.createElement('div'));
  shown = { app: mount(page, { target }), target };
  flushSync();
  return target;
}

afterEach(() => {
  if (shown) {
    unmount(shown.app);
    shown.target.remove();
    shown = null;
  }
  settingsPanel.close();
  window.localStorage.clear();
  history.replaceState(null, '', '/');
});

test('without Boite, the companion waits and says how to wake it', async () => {
  const target = show(App, '');
  await vi.waitFor(() => expect(target.querySelector('[data-testid="bots-notice"]')?.textContent).toContain(strings.bots.waiting));
  expect(target.querySelector('[data-testid="companion"]')).not.toBeNull();
});

test('the demo mode runs the companion on the fake core', async () => {
  const target = show(App, '?fake=1');
  await vi.waitFor(() => expect(target.querySelector('[data-testid="bots-notice"]')?.textContent).toContain(strings.bots.demo), DEMO_WAIT);
  expect(target.querySelector('[data-testid="companion"]')).not.toBeNull();
});

test('a request opens the island and its settings on a section; the deck\'s gear puts them away', async () => {
  const target = show(App, '?fake=1');
  await vi.waitFor(() => expect(target.querySelector('[data-testid="bots-notice"]')?.textContent).toContain(strings.bots.demo), DEMO_WAIT);
  requestSettings('crew');
  flushSync();
  expect(target.querySelector('[data-testid="island-settings-panel"]')).not.toBeNull();
  const gear = target.querySelector<HTMLButtonElement>('[data-testid="island-settings"]')!;
  expect(gear.getAttribute('aria-pressed')).toBe('true');
  expect(target.querySelector('[data-testid="settings-section-crew"]')?.getAttribute('aria-selected')).toBe('true');
  await vi.waitFor(() => expect(target.querySelector('[data-testid="companion-crew"] ul, [data-testid="companion-crew"] form')).not.toBeNull(), DEMO_WAIT);
  expect(target.querySelector('[data-testid="companion-open-advanced"]')).toBeNull();
  target.querySelector<HTMLButtonElement>('[data-testid="settings-section-place"]')!.click();
  flushSync();
  expect(target.querySelector('[data-testid="companion-robots"]')).not.toBeNull();
  gear.click();
  flushSync();
  expect(settingsPanel.open).toBe(false);
  expect(gear.getAttribute('aria-pressed')).toBe('false');
}, 40_000);

test('with the robots loose on the desktop, a request still opens the settings over the island', async () => {
  window.localStorage.setItem('bots.prefs', JSON.stringify({ robots: 'desktop', robotsPicked: true }));
  const target = show(App, '?fake=1');
  await vi.waitFor(() => expect(target.querySelector('[data-testid="bots-notice"]')?.textContent).toContain(strings.bots.demo), DEMO_WAIT);
  expect(target.querySelector('[data-testid="island"]')).toBeNull();
  requestSettings('place');
  flushSync();
  await vi.waitFor(() => expect(target.querySelector('[data-testid="companion-robots"]')).not.toBeNull(), DEMO_WAIT);
  target.querySelector<HTMLButtonElement>('[data-testid="companion-robots-island"]')!.click();
  flushSync();
  expect(JSON.parse(window.localStorage.getItem('bots.prefs')!)).toMatchObject({ robots: 'island', robotsPicked: false });
}, 40_000);

test('Escape closes the settings panel first, before a request waiting under it or the island', async () => {
  const target = show(App, '?fake=1');
  await vi.waitFor(() => expect(target.querySelector('[data-testid="bots-notice"]')?.textContent).toContain(strings.bots.demo), DEMO_WAIT);
  requestSettings('focus');
  flushSync();
  // The fake core starts with requests waiting: their card sits under the panel.
  await vi.waitFor(() => expect(target.querySelector('[data-testid="island-attention"]')).not.toBeNull(), DEMO_WAIT);
  const asked = target.querySelector('[data-testid="attention-of"]')?.textContent;
  expect(target.querySelector('[data-testid="island"]')?.getAttribute('data-size')).toBe('open');
  window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
  flushSync();
  expect(settingsPanel.open).toBe(false);
  expect(target.querySelector('[data-testid="island"]')?.getAttribute('data-size')).toBe('open');
  expect(target.querySelector('[data-testid="attention-of"]')?.textContent).toBe(asked);
}, 30_000);
