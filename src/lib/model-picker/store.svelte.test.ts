/*
 * The model picker's store over Bots's core link: Boite's starred models go
 * through the core's settings both ways, the agents' lists are read and
 * refreshed, and the companion's "Automatic" choice.
 */
import { flushSync, mount, unmount } from 'svelte';
import { afterEach, expect, test, vi } from 'vitest';
import type { ObservableClient } from '@boite/ui/lib/client';
import { CoreLink } from '../core.svelte';
import { FakeClient } from '../fake-client';
import { readCompanionPrefs, type CompanionPrefs } from '../companion/prefs';
import { strings } from '../strings';
import CompanionModelPicker from '../../components/model-picker/CompanionModelPicker.svelte';
import { companionChoice, companionPick } from './companion';
import { favoritesIn } from './favorites';
import { PickerStore } from './store.svelte';

const opus = { id: 'claude-opus-5-5', name: 'Opus 5.5' };

async function linked() {
  const client = new FakeClient({ delayMs: 0 });
  await client.connect();
  const link = new CoreLink();
  const call = vi.spyOn(client, 'call');
  link.follow(client);
  await vi.waitFor(() => expect(link.providers.length).toBeGreaterThan(0));
  await vi.waitFor(() => expect(link.settings).not.toBeNull());
  return { client, link, call, store: new PickerStore(link) };
}

let mounted: { component: Record<string, unknown>; target: HTMLElement } | null = null;
afterEach(() => {
  if (mounted) unmount(mounted.component);
  mounted?.target.remove();
  mounted = null;
  localStorage.clear();
});

test('a star goes to the core’s settings, where Boite reads it, and Boite’s stars come back', async () => {
  const { client, link, call, store } = await linked();
  const account = store.usableAccountOf('claude') ?? store.accountsOf('claude')[0]!;
  expect(store.favorites).toEqual([]);

  store.toggleFavorite('claude', account.id, opus);
  await vi.waitFor(() => expect(store.favorites.map((entry) => entry.model.id)).toEqual([opus.id]));
  const written = call.mock.calls.find(([method]) => method === 'settings.set')?.[1] as { modelFavorites: { at: number; items: unknown[] } };
  expect(written.modelFavorites.items).toEqual([{ providerId: 'claude', model: opus, account: account.label }]);

  // Boite reads the same list from the core.
  const boite = favoritesIn(await client.call('settings.get', {}));
  expect(boite.items).toEqual(written.modelFavorites.items);

  // Boite stars another model later: the core tells Bots, whose picker shows both.
  const sonnet = { providerId: 'claude', model: { id: 'claude-sonnet-5-5', name: 'Sonnet 5.5' }, account: account.label };
  await client.call('settings.set', { modelFavorites: { at: boite.at + 1, items: [...boite.items, sonnet] } } as never);
  await vi.waitFor(() => expect(store.favorites.map((entry) => entry.model.id)).toEqual([opus.id, sonnet.model.id]));
  expect(store.favorites[1]!.accountId).toBe(account.id);

  // Unstarring here removes it there too.
  store.toggleFavorite('claude', account.id, opus);
  await vi.waitFor(() => expect(favoritesIn(link.settings).items.map((item) => item.model.id)).toEqual([sonnet.model.id]));
  expect(favoritesIn(await client.call('settings.get', {})).items.map((item) => item.model.id)).toEqual([sonnet.model.id]);
  client.close();
});

test('a paired device reads the stars and never writes them', async () => {
  const { link, call } = await linked();
  Object.defineProperty(link, 'owner', { get: () => false });
  const store = new PickerStore(link);
  store.toggleFavorite('claude', 'a-claude-main', opus);
  expect(call.mock.calls.some(([method]) => method === 'settings.set')).toBe(false);
});

test('an agent’s list is read once, shown as pending meanwhile, and the refresh asks it again', async () => {
  const { client, call, store } = await linked();
  const account = store.usableAccountOf('claude') ?? store.accountsOf('claude')[0]!;
  // Claude has no catalogue of its own: nothing to offer before it is asked.
  expect(store.modelsOf('claude', account.id)).toEqual([]);
  expect(store.modelsPending('claude', account.id)).toBe(false);

  const read = store.probeModels('claude', account.id);
  expect(store.isProbing('claude', account.id)).toBe(true);
  expect(store.modelsPending('claude', account.id)).toBe(true);
  await read;
  expect(store.modelsPending('claude', account.id)).toBe(false);
  expect(store.modelsOf('claude', account.id).map((model) => model.id)).toContain(opus.id);
  expect(store.catalogHas('claude', account.id, opus.id)).toBe(true);
  expect(store.modelOf({ providerId: 'claude', accountId: account.id, model: opus.id, effort: null })?.name).toBe('Opus 5.5');

  await store.probeModels('claude', account.id);
  const probes = () => call.mock.calls.filter(([method]) => method === 'providers.probe');
  expect(probes()).toHaveLength(1);
  await store.probeModels('claude', account.id, true);
  expect(probes()).toHaveLength(2);
  expect(probes()[1]![1]).toMatchObject({ providerId: 'claude', accountId: account.id, refresh: true });
  client.close();
});

test('a failed refresh is told, a failed background read is not', async () => {
  const link = new CoreLink();
  const client = { principal: 'owner', state: 'ready', call: vi.fn(async () => { throw new Error('the agent did not answer'); }), on: () => () => {}, connect: async () => {}, close: () => {} };
  link.follow(client as unknown as ObservableClient);
  const store = new PickerStore(link);
  await store.probeModels('opencode', 'a2');
  expect(store.error).toBeNull();
  await store.probeModels('opencode', 'a2', true);
  expect(store.error).toBe('the agent did not answer');
});

test('Automatic is a null provider; a chosen provider without a model shows its small one', async () => {
  const { client, store } = await linked();
  const none = { providerId: null, accountId: null, model: null, effort: null };
  expect(companionChoice(none, store)).toBeNull();
  expect(companionPick('auto')).toEqual(none);

  const account = store.usableAccountOf('claude') ?? store.accountsOf('claude')[0]!;
  const chosen = companionChoice({ providerId: 'claude', accountId: null, model: null, effort: 'high' }, store);
  expect(chosen).toMatchObject({ providerId: 'claude', accountId: account.id, effort: 'high' });
  expect(chosen!.model).toMatch(/haiku/);
  expect(companionChoice({ providerId: 'claude', accountId: account.id, model: opus.id, effort: null }, store)?.model).toBe(opus.id);
  // A model picked starts on its own default level.
  expect(companionPick({ providerId: 'claude', accountId: account.id, model: opus.id })).toEqual({ providerId: 'claude', accountId: account.id, model: opus.id, effort: null });
  client.close();
});

test('the companion’s picker shows Automatic, and a model picked in it is written to the prefs', async () => {
  const { client, link, store } = await linked();
  const account = store.usableAccountOf('claude') ?? store.accountsOf('claude')[0]!;
  await store.probeModels('claude', account.id);
  const changes: CompanionPrefs[] = [];
  const target = document.body.appendChild(document.createElement('div'));
  const component = mount(CompanionModelPicker, { target, props: { store: link, prefs: readCompanionPrefs(), onchange: (next: CompanionPrefs) => changes.push(next) } });
  mounted = { component, target };
  flushSync();
  const trigger = target.querySelector<HTMLButtonElement>('[data-testid="composer-picker"]')!;
  expect(trigger.textContent).toContain(strings.modelPicker.auto);

  trigger.click();
  flushSync();
  // Open on the automatic column, its row marked as the one in use.
  expect(document.querySelector('[data-provider="auto"]')?.classList.contains('current')).toBe(true);
  expect(document.querySelector('[data-testid="picker-auto"]')?.classList.contains('current')).toBe(true);

  document.querySelector<HTMLButtonElement>('[data-provider="claude"]')!.click();
  flushSync();
  await vi.waitFor(() => expect(document.querySelector(`[data-model="${opus.id}"]`)).not.toBeNull());
  document.querySelector<HTMLButtonElement>(`[data-model="${opus.id}"]`)!.click();
  await vi.waitFor(() => expect(changes.at(-1)).toMatchObject({ providerId: 'claude', accountId: account.id, model: opus.id, effort: null }));
  expect(readCompanionPrefs()).toMatchObject({ providerId: 'claude', model: opus.id });
  client.close();
});
