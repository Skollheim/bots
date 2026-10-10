/*
 * Where Bots reads its sentences: a proxy that answers in the language the app
 * speaks, French or English, and falls back to English key by key.
 *
 * The language itself is Boite's (`@boite/ui/lib/i18n.svelte`): the shared
 * components Bots borrows from Boite (Menu, InfoTip, the quota reader) speak
 * through it, so Bots follows the same choice and the whole window speaks one
 * language. Both catalogues are small and bundled.
 *
 * The lookup mirrors Boite's (packages/ui/src/lib/i18n.svelte.ts at c4a8b0f7).
 */
import { activeLocale } from '@boite/ui/lib/i18n.svelte';
import { strings as en, fill, type Strings } from './strings.en';
import { fr } from './strings.fr';

export { fill };
export type { Strings };

/** The catalogue as a translation sees it: every sentence a plain `string`. */
export type Messages = Widen<Strings>;

type Widen<T> = T extends string
  ? string
  : T extends readonly (infer U)[]
    ? readonly Widen<U>[]
    : { readonly [K in keyof T]: Widen<T[K]> };

const catalogues: Record<string, unknown> = { en, fr };

function resolve(root: unknown, path: readonly string[]): unknown {
  let node: unknown = root;
  for (const key of path) {
    if (node === null || typeof node !== 'object') return undefined;
    node = (node as Record<string, unknown>)[key];
  }
  return node;
}

const nodes = new Map<string, object>();

const isLevel = (value: unknown): boolean => value !== null && typeof value === 'object' && !Array.isArray(value);

function node(path: readonly string[]): object {
  const id = path.join('.');
  const known = nodes.get(id);
  if (known) return known;

  // `activeLocale()` reads Boite's language state, which ties a component to it.
  const read = (key: string): unknown => {
    const next = [...path, key];
    const value = resolve(catalogues[activeLocale()], next);
    return value === undefined ? resolve(en, next) : value;
  };

  const made = new Proxy(Object.create(null) as object, {
    get(_target, key) {
      if (typeof key !== 'string') return undefined;
      const value = read(key);
      return isLevel(value) ? node([...path, key]) : value;
    },
    has(_target, key) {
      return typeof key === 'string' && read(key) !== undefined;
    },
    ownKeys() {
      const keys = new Set<string>();
      for (const source of [resolve(en, path), resolve(catalogues[activeLocale()], path)]) {
        if (isLevel(source)) for (const key of Object.keys(source as object)) keys.add(key);
      }
      return [...keys];
    },
    getOwnPropertyDescriptor(_target, key) {
      if (typeof key !== 'string') return undefined;
      const value = read(key);
      if (value === undefined) return undefined;
      return { configurable: true, enumerable: true, writable: false, value: isLevel(value) ? node([...path, key]) : value };
    },
    set() {
      throw new Error('strings are read-only: edit lib/strings.en.ts and its translation');
    }
  });

  nodes.set(id, made);
  return made;
}

/** Every user-facing sentence of Bots, in the language the app is speaking. */
export const strings = node([]) as Messages;
