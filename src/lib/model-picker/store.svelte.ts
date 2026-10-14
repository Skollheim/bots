/*
 * What Boite's model picker asks of Boite's `Store`, on top of Bots's own
 * link to the core (`lib/core.svelte.ts`): the providers the picker may
 * offer, their accounts, the models each agent lists, the reads of those
 * lists, and Boite's starred models.
 *
 * Each member follows the one of the same name in Boite at 4b6335b1:
 * packages/ui/src/lib/store/accounts.svelte.ts (offeredProviders, providerOf,
 * providerOn, accountsOf, accountOf, usableAccountOf, installOf) and
 * packages/ui/src/lib/store/models.svelte.ts (modelsOf, modelOf,
 * modelsPending, isProbing, probeModels, catalogHas, defaultModelOf,
 * favorites, toggleFavorite).
 *
 * The favorites are Boite's own list, read from the core's settings and
 * written back with `settings.set { modelFavorites }`, as Boite writes them:
 * a star set in either app shows in the other. Boite's settings pages cannot
 * be opened from here (`ui.reveal` shows a thread, an agent or the updates),
 * so `opensSettings` is false and the picker leaves out what leads there.
 */
import { providerEnabled, type Account, type ModelInfo, type ProviderId, type ProviderInstallState, type ProviderSummary } from '@boite/contracts';
import { DEFAULT_MODEL_NAMES, INITIAL_MODEL_DEFAULTS, BUILT_IN_MODELS, fallbackModelDefault, resolveModelDefault } from '@boite/ui/lib/model-defaults';
import type { CoreLink } from '../core.svelte';
import { favoritesIn, resolveFavorites, toggledFavorites, type ResolvedFavorite } from './favorites';

/** What a picker shows as chosen: Boite's `Choice` without the permission mode. */
export interface PickerChoice {
  providerId: ProviderId;
  accountId: string;
  model: string | null;
  /** A level id of that model, or null for the model's own default. */
  effort: string | null;
}

/** What the picker hands back: the instance and its model together. */
export interface PickPatch {
  providerId: ProviderId;
  accountId: string;
  model: string | null;
}

/** The part of `CoreLink` the picker reads. */
export type PickerLink = Pick<
  CoreLink,
  'client' | 'owner' | 'providers' | 'accounts' | 'settings' | 'probedModels' | 'accountsOf' | 'modelsOf' | 'probeModels' | 'isProbing' | 'saveSettings'
>;

const probeKey = (providerId: ProviderId, accountId: string) => `${providerId}::${accountId}`;

export class PickerStore {
  /** A pick the picker could not make: shown under it, cleared by the next pick. */
  error = $state<string | null>(null);
  /** Boite counts its reconnections and page changes to drop a late pick; Bots's picker lives in one place. */
  readonly clientGeneration = 0;
  readonly navigationGeneration = 0;
  /** Boite's Providers page is not reachable from Bots. */
  readonly opensSettings = false;

  readonly favorites: ResolvedFavorite[] = $derived.by(() => resolveFavorites(favoritesIn(this.link.settings).items, this));

  constructor(private readonly link: PickerLink) {}

  get owner(): boolean {
    return this.link.owner;
  }

  get providers(): ProviderSummary[] {
    return this.link.providers;
  }

  /** The providers a picker may offer: the ones turned on, in the core's order. */
  get offeredProviders(): ProviderSummary[] {
    return this.link.providers.filter((provider) => providerEnabled(provider));
  }

  providerOf(id: ProviderId): ProviderSummary | null {
    return this.link.providers.find((provider) => provider.id === id) ?? null;
  }

  /** Whether this provider is known here and turned on. */
  providerOn(id: ProviderId): boolean {
    return providerEnabled(this.providerOf(id));
  }

  accountsOf(providerId: ProviderId): Account[] {
    return this.link.accountsOf(providerId);
  }

  accountOf(id: string): Account | null {
    const account = this.link.accounts.find((entry) => entry.id === id);
    if (!account) return null;
    return this.accountsOf(account.providerId).find((entry) => entry.id === id) ?? account;
  }

  /** The account a turn of this provider runs on, as the core picks it: `preferred` unless signed out, else the best signed-in one. */
  usableAccountOf(providerId: ProviderId, preferred: string | null = null): Account | null {
    const accounts = this.accountsOf(providerId);
    const own = accounts.find((account) => account.id === preferred);
    if (own && own.status !== 'unauthenticated') return own;
    const rank = { ok: 0, unknown: 1, error: 2, unauthenticated: 3 } as const;
    return accounts.filter((account) => account.id !== preferred && account.status !== 'unauthenticated').sort((a, b) => rank[a.status] - rank[b.status])[0] ?? null;
  }

  /** Null when this provider ships no release for Boite to install. */
  installOf(id: ProviderId): ProviderInstallState | null {
    return this.providerOf(id)?.install ?? null;
  }

  modelsOf(providerId: ProviderId, accountId: string | null): ModelInfo[] {
    return this.link.modelsOf(providerId, accountId);
  }

  /** The model a choice runs on, out of what its own instance offers; the built-in default by name before a read. */
  modelOf(choice: PickerChoice | null): ModelInfo | null {
    if (!choice) return null;
    const offered = this.modelsOf(choice.providerId, choice.accountId).find((model) => model.id === choice.model);
    if (offered) return offered;
    if (!choice.model || choice.model !== INITIAL_MODEL_DEFAULTS[choice.providerId]?.model) return null;
    const builtIn = BUILT_IN_MODELS[choice.providerId];
    return builtIn?.id === choice.model ? builtIn : { id: choice.model, name: DEFAULT_MODEL_NAMES[choice.model] ?? choice.model };
  }

  isProbing(providerId: ProviderId, accountId: string | null): boolean {
    return this.link.isProbing(providerId, accountId);
  }

  /** The first read of this instance runs and nothing has answered yet: the picker shows it reading. */
  modelsPending(providerId: ProviderId, accountId: string | null): boolean {
    return accountId !== null && !this.link.probedModels[probeKey(providerId, accountId)] && this.isProbing(providerId, accountId);
  }

  /** Asks the agent what it can run; a failure leaves the list as it was, as in Boite. */
  probeModels(providerId: ProviderId, accountId: string, refresh = false): Promise<void> {
    const account = this.accountOf(accountId);
    if (!refresh && (account?.status === 'unauthenticated' || account?.status === 'error')) return Promise.resolve();
    return this.link.probeModels(providerId, accountId, refresh).catch((error: unknown) => {
      if (refresh) this.error = error instanceof Error ? error.message : String(error);
    });
  }

  /** The core already listed this model for this account: a pick lands at once. */
  catalogHas(providerId: ProviderId, accountId: string, model: string): boolean {
    return this.link.probedModels[probeKey(providerId, accountId)]?.some((entry) => entry.id === model) ?? false;
  }

  /** Boite keeps the user's own defaults in its window; Bots goes by the built-in ones and the catalogue. */
  defaultModelOf(provider: ProviderSummary, accountId?: string): string | null {
    const models = accountId ? this.modelsOf(provider.id, accountId) : provider.models;
    if (accountId && this.link.probedModels[probeKey(provider.id, accountId)]) {
      const fallback = fallbackModelDefault(provider.id, models);
      if (fallback) return fallback.model;
    }
    return INITIAL_MODEL_DEFAULTS[provider.id]?.model ?? resolveModelDefault(provider.id, models, {})?.model ?? null;
  }

  /**
   * Stars or unstars a model of this account, in Boite's list. The star names
   * the account by label; unstarring removes every shared item the row stands
   * for. A paired device reads the favorites and never writes them.
   */
  toggleFavorite(providerId: ProviderId, accountId: string, model: { id: string; name: string }): void {
    if (!this.owner) return;
    const current = favoritesIn(this.link.settings);
    const shown = this.favorites.find((entry) => entry.providerId === providerId && entry.accountId === accountId && entry.model.id === model.id);
    const label = this.accountOf(accountId)?.label;
    const next = shown
      ? toggledFavorites(current, null, shown.items)
      : toggledFavorites(current, { providerId, model: { id: model.id, name: model.name }, ...(label ? { account: label } : {}) }, []);
    this.link.saveSettings({ modelFavorites: next }).catch((error: unknown) => {
      this.error = error instanceof Error ? error.message : String(error);
    });
  }

  /** Boite's Providers page and connection dialog live in Boite's window: nothing opens from here. */
  showSettings(_page: 'accounts'): void {}
  openConnect(): void {}
}
