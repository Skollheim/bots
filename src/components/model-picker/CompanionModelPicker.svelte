<!--
  The companion's model and effort in Bots's settings, chosen as in Boite's
  composer: Boite's model picker with an "Automatic" tile first (the first
  agent that is on and signed in, on its small model), and its effort chip once
  a model with levels is chosen. A pick is written to the companion's prefs
  (`writeCompanionPrefs`) and handed back through `onchange`.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { CoreLink } from '../../lib/core.svelte';
  import { writeCompanionPrefs, type CompanionPrefs } from '../../lib/companion/prefs';
  import { companionChoice, companionPick } from '../../lib/model-picker/companion';
  import { PickerStore, type PickPatch } from '../../lib/model-picker/store.svelte';
  import EffortSlider from './EffortSlider.svelte';
  import ModelPicker from './ModelPicker.svelte';

  let {
    store,
    prefs,
    onchange
  }: {
    store: CoreLink;
    prefs: CompanionPrefs;
    /** The prefs as written, after each pick. */
    onchange?: (next: CompanionPrefs) => void;
  } = $props();

  const picker = $derived(new PickerStore(store));
  const choice = $derived(companionChoice(prefs, picker));
  const model = $derived(picker.modelOf(choice));
  const levels = $derived(model?.effort?.levels ?? []);

  // The chosen agent's list names its model and levels, as Boite's composer reads it on mount.
  $effect(() => {
    const current = choice;
    if (current) untrack(() => void picker.probeModels(current.providerId, current.accountId));
  });

  function save(patch: Partial<CompanionPrefs>) {
    onchange?.(writeCompanionPrefs(patch));
  }
</script>

<div class="companion-model" data-testid="companion-model">
  <ModelPicker store={picker} {choice} auto={{ active: prefs.providerId === null, onpick: () => save(companionPick('auto')) }} onpick={(patch: PickPatch) => save(companionPick(patch))} />
  {#if choice && levels.length > 0}
    <EffortSlider {levels} active={prefs.effort ?? model?.effort?.default ?? null} onpick={(id) => save({ effort: id })} />
  {/if}
  {#if picker.error}<p class="problem" role="alert">{picker.error}</p>{/if}
</div>

<style>
  .companion-model {
    display: inline-flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: flex-end;
    gap: 2px;
    min-width: 0;
  }
  .problem {
    flex-basis: 100%;
    margin: 4px 0 0;
    color: var(--color-danger);
    font-size: var(--text-sm);
    text-align: right;
  }
</style>
