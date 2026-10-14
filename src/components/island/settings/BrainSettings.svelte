<!--
  Settings, Brain and model: what an agent made here for B.O.T.S runs on (the
  agent, its model and account in Boite's model picker, the effort) and what it may do on this
  computer. Its own component, so the model picker can change on its own.
-->
<script lang="ts">
  import InfoTip from '@boite/ui/components/InfoTip.svelte';
  import type { MenuItem } from '@boite/ui/lib/menu';
  import { fill, strings } from '../../../lib/strings';
  import type { CoreLink } from '../../../lib/core.svelte';
  import type { CompanionControl, CompanionPrefs } from '../../../lib/companion/prefs';
  import CompanionModelPicker from '../../model-picker/CompanionModelPicker.svelte';
  import SettingPick from './SettingPick.svelte';

  let { store, prefs, save }: { store: CoreLink; prefs: CompanionPrefs; save: (patch: Partial<CompanionPrefs>) => void } = $props();

  const CONTROLS: CompanionControl[] = ['ask', 'auto'];
  const copy = $derived(strings.companion.settings);

  let controlItems = $derived<MenuItem[]>(CONTROLS.map((control) => ({ id: control, label: copy.controls[control], hint: copy.controlsHint[control], active: prefs.control === control })));
  let warmMinutes = $derived(store.settings?.warmProcessMinutes ?? null);
</script>

<div class="card">
  <div class="switch-row">
    <span class="text ui-label-box">
      <span class="ui-label">{copy.model}</span>{#if copy.modelHint}<InfoTip topic={copy.model} text={copy.modelHint} />{/if}
    </span>
    <CompanionModelPicker {store} {prefs} onchange={(next) => save(next)} />
  </div>
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
