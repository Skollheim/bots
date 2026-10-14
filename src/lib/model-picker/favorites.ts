/*
 * The starred models, Boite's own list: every core keeps it in its settings
 * (`Settings.modelFavorites`) and Boite's model picker reads and writes it
 * there, so a star set in Boite shows in Bots and back.
 *
 * From Boite at 4b6335b1: the types (packages/contracts/src/index.ts),
 * `compareModelFavorites` and the check of a stored list (packages/contracts/
 * src/settings-validation.ts), `resolveFavorites` (packages/ui/src/lib/
 * model-favorites.svelte.ts) and the star toggle (packages/ui/src/lib/store/
 * models.svelte.ts). The contracts Bots vendors are older and do not carry them.
 */
import type { Account, ProviderId, Settings } from '@boite/contracts';

/** One starred model. Accounts are named by label: an id means nothing on another machine. */
export interface ModelFavorite {
  providerId: ProviderId;
  model: { id: string; name: string };
  /** The label of the account it was starred under. Missing: the account the picker uses for that provider. */
  account?: string;
}

/** The starred models, with the time they last changed. */
export interface ModelFavorites {
  /** Milliseconds since the epoch of the last change: between two lists, the later one wins. */
  at: number;
  items: ModelFavorite[];
}

/** One favorite as this machine's picker offers it: on one of its accounts. */
export interface FavoriteModel {
  providerId: ProviderId;
  accountId: string;
  model: { id: string; name: string };
}

/** One favorite as one machine's picker offers it. */
export interface ResolvedFavorite extends FavoriteModel {
  /** Every shared item shown as this row: unstarring it removes them all. */
  items: ModelFavorite[];
}

/** What resolving a favorite reads of one machine. */
export interface FavoriteMachine {
  providerOn(id: ProviderId): boolean;
  accountsOf(providerId: ProviderId): Account[];
  usableAccountOf(providerId: ProviderId): Account | null;
}

/** Starred models kept for all of the owner's machines. */
export const MODEL_FAVORITES_MAX = 200;
const FAVORITE_TEXT_MAX = 200;
export const EMPTY_FAVORITES: ModelFavorites = { at: 0, items: [] };

/** One line of printable text of 1 to `FAVORITE_TEXT_MAX` characters, trimmed, or null. */
function favoriteText(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  return text.length > 0 && text.length <= FAVORITE_TEXT_MAX && !/[\u0000-\u001f]/.test(text) ? text : null;
}

/** The list as a core stores it: each field trimmed, unknown keys dropped, a repeat kept once. Null when malformed. */
export function cleanFavorites(value: unknown): ModelFavorites | null {
  if (typeof value !== 'object' || value === null) return null;
  const { at, items } = value as { at?: unknown; items?: unknown };
  if (typeof at !== 'number' || !Number.isSafeInteger(at) || at < 0 || !Array.isArray(items) || items.length > MODEL_FAVORITES_MAX) return null;
  const kept: ModelFavorite[] = [];
  const seen = new Set<string>();
  for (const raw of items as Partial<ModelFavorite>[]) {
    if (typeof raw !== 'object' || raw === null) return null;
    const providerId = favoriteText(raw.providerId), id = favoriteText(raw.model?.id), name = favoriteText(raw.model?.name);
    const account = raw.account === undefined ? undefined : favoriteText(raw.account);
    if (providerId === null || id === null || name === null || account === null) return null;
    const key = itemKey({ providerId, model: { id, name }, ...(account === undefined ? {} : { account }) });
    if (seen.has(key)) continue;
    seen.add(key);
    kept.push({ providerId, model: { id, name }, ...(account === undefined ? {} : { account }) });
  }
  return { at, items: kept };
}

/** The favorites a core's settings hold; the empty list on an older core or before the first star. */
export function favoritesIn(settings: Settings | null): ModelFavorites {
  return cleanFavorites((settings as { modelFavorites?: unknown } | null)?.modelFavorites) ?? EMPTY_FAVORITES;
}

/**
 * Which of two favorite lists wins, above zero when `a` does: the later `at`,
 * then the greater content, so two lists of the same time never flip back and
 * forth. Core and clients decide alike.
 */
export function compareFavorites(a: ModelFavorites, b: ModelFavorites): number {
  if (a.at !== b.at) return a.at - b.at;
  const content = (list: ModelFavorites) => JSON.stringify(list.items.map((item) => [item.providerId, item.model.id, item.model.name, item.account ?? null]));
  const x = content(a), y = content(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

function itemKey(item: ModelFavorite): string {
  return JSON.stringify([item.providerId, item.model.id, item.account ?? null]);
}

/**
 * The list after a star (`add`) or an unstar (`remove`, every shared item the
 * row stands for), as a change made at `now`: later than the list it replaces.
 */
export function toggledFavorites(current: ModelFavorites, add: ModelFavorite | null, remove: ModelFavorite[], now = Date.now()): ModelFavorites {
  const gone = new Set(remove.map(itemKey));
  let items = current.items.filter((item) => !gone.has(itemKey(item)));
  if (add && !items.some((item) => itemKey(item) === itemKey(add))) items = [...items, add];
  return { at: Math.max(now, current.at + 1), items: items.slice(-MODEL_FAVORITES_MAX) };
}

/**
 * The favorites one machine offers. A provider that is off or has no account
 * there offers none. Each runs on the account with the same label, else on
 * the account the picker uses for that provider; two that land on the same
 * account and model make one row, the exact label first.
 */
export function resolveFavorites(items: ModelFavorite[], machine: FavoriteMachine): ResolvedFavorite[] {
  const placed = items.flatMap((item) => {
    if (!machine.providerOn(item.providerId)) return [];
    const accounts = machine.accountsOf(item.providerId);
    const exact = item.account === undefined ? undefined : accounts.find((account) => account.label === item.account);
    const account = exact ?? machine.usableAccountOf(item.providerId) ?? accounts[0];
    return account ? [{ item, accountId: account.id, exact: exact !== undefined }] : [];
  });
  const rows = new Map<string, ResolvedFavorite>();
  for (const pass of [true, false]) {
    for (const { item, accountId, exact } of placed) {
      if (exact !== pass) continue;
      const key = JSON.stringify([item.providerId, accountId, item.model.id]);
      const row = rows.get(key);
      if (row) row.items.push(item);
      else rows.set(key, { providerId: item.providerId, accountId, model: item.model, items: [item] });
    }
  }
  // The shared order, not the passes' order.
  const order = new Map(items.map((item, index) => [item, index]));
  const first = (row: ResolvedFavorite) => Math.min(...row.items.map((item) => order.get(item)!));
  return [...rows.values()].sort((a, b) => first(a) - first(b));
}
