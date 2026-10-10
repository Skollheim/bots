import { afterEach, expect, test } from 'vitest';
import { setLocaleSetting } from '@boite/ui/lib/i18n.svelte';
import { strings as en } from './strings.en';
import { fr } from './strings.fr';
import { fill, strings } from './strings';

afterEach(async () => {
  await setLocaleSetting('en');
  window.localStorage.clear();
});

/** Every sentence path of a catalogue. */
function paths(node: unknown, prefix = ''): string[] {
  if (typeof node === 'string') return [prefix];
  if (!node || typeof node !== 'object' || Array.isArray(node)) return [prefix];
  return Object.entries(node).flatMap(([key, value]) => paths(value, prefix ? `${prefix}.${key}` : key));
}

test('French carries every English sentence', () => {
  expect(paths(fr).sort()).toEqual(paths(en).sort());
});

test('the strings follow the language Boite speaks', async () => {
  await setLocaleSetting('en');
  expect(strings.bots.waiting).toBe('Start Boite to wake the bots');
  await setLocaleSetting('fr');
  expect(strings.bots.waiting).toBe('Lancez Boite pour réveiller les bots');
  expect(Object.keys(strings.bots.tray)).toEqual(['tooltip', 'settings', 'quit']);
});

test('fill puts values in their places and leaves unknown ones', () => {
  expect(fill('{a} and {b}', { a: 'one' })).toBe('one and {b}');
});
