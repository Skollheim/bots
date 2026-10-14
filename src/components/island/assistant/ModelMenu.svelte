<!--
  The assistant's model and effort, as Boite's composer chooses them: Boite's
  model picker (providers, favorites, search, accounts) and its effort chip
  (`components/model-picker/`), on the agent's own selection. A pick changes
  the agent everywhere, in Boite too (`Assistant.setModel`, `setEffort`).
  The popover hangs under the chat's head, inside the island's window, and the
  island stays open while either is.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import type { Assistant } from '../../../lib/island/assistant.svelte';
  import { useView } from '../../../lib/island/contract';
  import { pickerStoreFor } from '../../../lib/model-picker/link';
  import type { PickerChoice } from '../../../lib/model-picker/store.svelte';
  import EffortSlider from '../../model-picker/EffortSlider.svelte';
  import ModelPicker from '../../model-picker/ModelPicker.svelte';

  let {
    assistant,
    open = $bindable(false),
    anchor
  }: { assistant: Assistant; open?: boolean; anchor?: () => HTMLElement | null } = $props();
  const view = useView();

  /** Boite's popover height: the island's window has room for it under the chat's head. */
  const CAP = 360;
  /** The closing animation's length, after which a popover leaves the page. */
  const GONE_MS = 400;

  const store = $derived(view.core.client ? pickerStoreFor(view.core.client) : null);
  const selection = $derived(assistant.agent?.selection ?? null);
  const choice = $derived<PickerChoice | null>(
    selection ? { providerId: selection.providerId, accountId: selection.accountId, model: selection.model, effort: selection.effort } : null
  );
  const model = $derived(store?.modelOf(choice) ?? assistant.current);
  const levels = $derived(model?.effort?.levels ?? assistant.efforts);

  let pickerOpen = $state(false);
  let effortOpen = $state(false);
  $effect(() => {
    open = pickerOpen || effortOpen;
  });
  $effect(() => view.hold('assistant-menu', open));
  $effect(() => () => view.hold('assistant-menu', false));

  // A popover over the island's edge takes clicks there: the window reads its
  // areas once it is placed, and again once it has gone.
  $effect(() => {
    const shown = open;
    const read = setTimeout(() => view.resized?.(), shown ? 60 : GONE_MS);
    return () => clearTimeout(read);
  });

  // Boite's composer reads the agent's list as it mounts, which names the model on the chip.
  $effect(() => {
    const current = choice;
    if (store && current) untrack(() => void store.probeModels(current.providerId, current.accountId));
  });

  // A pick the picker could not make reads as the chat's own problem line.
  $effect(() => {
    const error = store?.error;
    if (!store || !error) return;
    untrack(() => {
      assistant.problem = error;
      store.error = null;
    });
  });
</script>

{#if store}
  <div class="model" data-testid="assistant-model">
    <ModelPicker {store} {choice} {anchor} cap={CAP} onopen={(shown) => (pickerOpen = shown)} onpick={(patch) => void assistant.setModel(patch.model, patch)} />
    {#if levels.length > 0}
      <EffortSlider {levels} active={choice?.effort ?? model?.effort?.default ?? null} onopen={(shown) => (effortOpen = shown)} onpick={(id) => void assistant.setEffort(id)} />
    {/if}
  </div>
{/if}

<style>
  .model {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    min-width: 0;
  }
</style>
