<!--
  Settings, Brain and model: what an agent made here for B.O.T.S runs on (the
  agent and its model, the account, the effort) and what it may do on this
  computer. Its own component, so the model picker can change on its own.
-->
<script lang="ts">
  import { defaultTitleModel, providerEnabled, type ModelInfo } from '@boite/contracts';
  import { separator, type MenuItem } from '@boite/ui/lib/menu';
  import { DEFAULT_MODEL_NAMES } from '@boite/ui/lib/model-defaults';
  import { fill, strings } from '../../../lib/strings';
  import type { CoreLink } from '../../../lib/core.svelte';
  import type { CompanionControl, CompanionPrefs } from '../../../lib/companion/prefs';
  import SettingPick from './SettingPick.svelte';

  let { store, prefs, save }: { store: CoreLink; prefs: CompanionPrefs; save: (patch: Partial<CompanionPrefs>) => void } = $props();

  const AUTO = 'auto';
  const CONTROLS: CompanionControl[] = ['ask', 'auto'];
  const copy = $derived(strings.companion.settings);

  /** The agents that can answer: on, here, with an account signed in. */
  let usable = $derived(
    store.providers.filter((provider) => providerEnabled(provider) && provider.available).flatMap((provider) => {
      const accounts = store.accountsOf(provider.id).filter((account) => account.status === 'ok');
      return accounts.length > 0 ? [{ provider, accounts }] : [];
    })
  );

  // Reading an agent's models starts it for a moment: the chosen one is read
  // to name its model and efforts, the others once the model menu is reached.
  $effect(() => {
    const chosen = usable.find((entry) => entry.provider.id === prefs.providerId);
    if (chosen) void store.probeModels(chosen.provider.id, (accountOf(chosen.provider.id) ?? chosen.accounts[0]!).id).catch(() => {});
  });

  function readAllModels() {
    for (const { provider, accounts } of usable) void store.probeModels(provider.id, accounts[0]!.id).catch(() => {});
  }

  const accountOf = (providerId: string) => {
    const accounts = usable.find((entry) => entry.provider.id === providerId)?.accounts ?? [];
    return accounts.find((account) => account.id === prefs.accountId) ?? accounts[0] ?? null;
  };

  let groups = $derived(
    usable.map(({ provider, accounts }) => {
      const account = provider.id === prefs.providerId ? (accountOf(provider.id) ?? accounts[0]!) : accounts[0]!;
      const offered = store.modelsOf(provider.id, account.id).filter((model) => model.id !== 'default');
      const small = defaultTitleModel(provider, offered);
      const named = (id: string): ModelInfo => offered.find((model) => model.id === id) ?? { id, name: DEFAULT_MODEL_NAMES[id] ?? id };
      const chosen = prefs.providerId === provider.id ? prefs.model : null;
      const ids = [small, chosen, ...offered.filter((model) => model.legacy !== true).map((model) => model.id)];
      return { provider, small, models: [...new Set(ids.filter((id): id is string => id !== null))].map(named) };
    })
  );

  const idOf = (providerId: string, model: string) => JSON.stringify([providerId, model]);

  let modelItems = $derived<MenuItem[]>([
    { id: AUTO, label: copy.automatic, hint: copy.automaticHint, active: prefs.providerId === null },
    ...groups.flatMap(({ provider, small, models }) => [
      separator(`sep-${provider.id}`),
      ...models.map((model) => ({
        id: idOf(provider.id, model.id),
        label: model.name,
        hint: provider.shortName,
        active: prefs.providerId === provider.id && (prefs.model ?? small) === model.id
      }))
    ])
  ]);

  let group = $derived(groups.find((entry) => entry.provider.id === prefs.providerId));
  let modelId = $derived(group ? (prefs.model ?? group.small) : null);
  let model = $derived(group?.models.find((entry) => entry.id === modelId));
  let currentModel = $derived(prefs.providerId === null ? copy.automatic : model ? `${model.name} · ${group!.provider.shortName}` : (prefs.model ?? prefs.providerId));

  let accounts = $derived(usable.find((entry) => entry.provider.id === prefs.providerId)?.accounts ?? []);
  let account = $derived(prefs.providerId === null ? null : accountOf(prefs.providerId));
  let accountItems = $derived<MenuItem[]>(accounts.map((entry) => ({ id: entry.id, label: entry.label, active: entry.id === account?.id })));

  let levels = $derived(model?.effort?.levels ?? []);
  let effortItems = $derived<MenuItem[]>([
    { id: AUTO, label: copy.effortDefault, active: prefs.effort === null },
    ...levels.map((level) => ({ id: level.id, label: level.label, hint: level.description, active: prefs.effort === level.id }))
  ]);
  let currentEffort = $derived(levels.find((level) => level.id === prefs.effort)?.label ?? copy.effortDefault);

  let controlItems = $derived<MenuItem[]>(CONTROLS.map((control) => ({ id: control, label: copy.controls[control], hint: copy.controlsHint[control], active: prefs.control === control })));
  let warmMinutes = $derived(store.settings?.warmProcessMinutes ?? null);

  function pickModel(id: string) {
    if (id === AUTO) return save({ providerId: null, accountId: null, model: null, effort: null });
    const [providerId, model] = JSON.parse(id) as [string, string];
    save({ providerId, model, accountId: accountOf(providerId)?.id ?? null, effort: null });
  }
</script>

<div class="card">
  <SettingPick label={copy.model} hint={copy.modelHint} items={modelItems} current={currentModel} onpick={pickModel} testid="companion-model" onreach={readAllModels} />
  {#if accounts.length > 1}
    <SettingPick label={copy.account} items={accountItems} current={account?.label ?? ''} onpick={(id) => save({ accountId: id })} testid="companion-account" />
  {/if}
  {#if levels.length > 0}
    <SettingPick label={copy.effort} items={effortItems} current={currentEffort} onpick={(id) => save({ effort: id === AUTO ? null : id })} testid="companion-effort" />
  {/if}
  <SettingPick label={copy.control} hint={copy.controlHint} items={controlItems} current={copy.controls[prefs.control]} onpick={(id) => save({ control: id as CompanionControl })} testid="companion-control" />
  <!-- Acting without asking is the one choice that needs saying aloud. -->
  {#if prefs.control === 'auto'}<p class="hint caution">{copy.controlsHint.auto}</p>{/if}
</div>
{#if warmMinutes !== null}
  <p class="hint warm">{warmMinutes > 0 ? fill(copy.warmOn, { minutes: String(warmMinutes) }) : copy.warmOff}</p>
{/if}

<style>
  .caution {
    padding-bottom: 12px;
    color: var(--island-attention);
  }
  .warm {
    padding: 0 4px;
  }
</style>
