<!--
  The screen captured ahead of the question (`Companion.shot`): a small chip
  with its picture, and a button that takes it back.
-->
<script lang="ts">
  import { Monitor, X } from '@lucide/svelte';
  import { useView } from '../../../lib/island/contract';
  import { strings } from '../../../lib/strings';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.drop;
</script>

{#if companion.shot}
  <div class="shot" data-testid="island-shot">
    <Monitor size={13} aria-hidden="true" />
    <span>{copy.captured}</span>
    <button class="ghost icon" aria-label={copy.removeShot} title={copy.removeShot} onclick={() => (companion.shot = null)}><X size={12} /></button>
  </div>
{/if}

<style>
  .shot {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    margin: 8px 8px 0;
    padding: 2px 4px 2px 10px;
    border: 1px solid var(--island-line-strong);
    border-radius: 999px;
    color: var(--island-text);
    font-size: 12px;
  }
</style>
