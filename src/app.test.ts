import { afterEach, expect, test, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from './App.svelte';
import SettingsApp from './SettingsApp.svelte';
import { strings } from './lib/strings';

/** The demo loads its fake core on demand: in a cold run its first import alone can take seconds. */
const DEMO_WAIT = { timeout: 15_000 };

let shown: { app: Record<string, unknown>; target: HTMLElement } | null = null;

function show(page: typeof App | typeof SettingsApp, search: string) {
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

test('the settings window lists the crew, without a link to Boite\'s Advanced page', async () => {
  const target = show(SettingsApp, '?view=settings&fake=1');
  await vi.waitFor(() => expect(target.querySelector('[data-testid="companion-crew"] ul, [data-testid="companion-crew"] form')).not.toBeNull(), DEMO_WAIT);
  expect(target.querySelector('[data-testid="companion-settings"]')).not.toBeNull();
  expect(target.querySelector('[data-testid="companion-open-advanced"]')).toBeNull();
  expect(document.title).toBe(strings.bots.settingsTitle);
});

test('the settings window waits for Boite too', async () => {
  const target = show(SettingsApp, '?view=settings');
  await vi.waitFor(() => expect(target.querySelector('[data-testid="bots-notice"]')?.textContent).toContain(strings.bots.waiting));
});
