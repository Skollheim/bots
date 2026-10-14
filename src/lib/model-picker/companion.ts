/*
 * The companion's model as Boite's picker shows and edits it. The companion's
 * prefs (`lib/companion/prefs.ts`) keep a provider, an account, a model and a
 * level; a null provider is "Automatic": the first agent that is on and signed
 * in, on its small model. A null model on a chosen provider is that
 * provider's small model too, so the picker marks it as the one in use.
 */
import { defaultTitleModel } from '@boite/contracts';
import type { CompanionPrefs } from '../companion/prefs';
import type { PickerChoice, PickPatch, PickerStore } from './store.svelte';

type Choosing = Pick<CompanionPrefs, 'providerId' | 'accountId' | 'model' | 'effort'>;

/** What the picker shows as chosen; null while the companion chooses by itself or the provider has no account here. */
export function companionChoice(prefs: Choosing, store: Pick<PickerStore, 'providerOf' | 'accountsOf' | 'usableAccountOf' | 'modelsOf'>): PickerChoice | null {
  if (prefs.providerId === null) return null;
  const accounts = store.accountsOf(prefs.providerId);
  const account = accounts.find((entry) => entry.id === prefs.accountId) ?? store.usableAccountOf(prefs.providerId) ?? accounts[0];
  if (!account) return null;
  const provider = store.providerOf(prefs.providerId);
  const small = provider ? defaultTitleModel(provider, store.modelsOf(provider.id, account.id).filter((model) => model.id !== 'default')) : null;
  return { providerId: prefs.providerId, accountId: account.id, model: prefs.model ?? small, effort: prefs.effort };
}

/** The prefs a pick writes: a model starts on its own default level, as in Boite's agent editor. */
export function companionPick(patch: PickPatch | 'auto'): Choosing {
  if (patch === 'auto') return { providerId: null, accountId: null, model: null, effort: null };
  return { providerId: patch.providerId, accountId: patch.accountId, model: patch.model, effort: null };
}
