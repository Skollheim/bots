<!--
  The island's Drop: files dropped on the island (anywhere on it) and a
  capture of the screen, or of a part of it, wait here for the next question;
  "Ask about them" turns to the chat with them.
-->
<script lang="ts">
  import { Crop, FilePlus, MessageCircle, Monitor } from '@lucide/svelte';
  import { inShell } from '../../../lib/companion/shell';
  import { useView } from '../../../lib/island/contract';
  import { strings } from '../../../lib/strings';
  import CompanionAttachments from '../../companion/CompanionAttachments.svelte';
  import ShotChip from './ShotChip.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.drop;
  const ready = $derived(companion.attached.held.length > 0 || companion.shot !== null);

  function ask() {
    view.show('chat');
    void companion.focusInput();
  }
</script>

<div class="drop" data-testid="island-drop">
  <section class="island-card zone" class:over={companion.attached.over}>
    <FilePlus size={22} strokeWidth={1.6} aria-hidden="true" />
    <p class="title">{copy.title}</p>
    <p class="hint">{copy.hint}</p>
  </section>

  <CompanionAttachments dropped={companion.attached} />
  <ShotChip />

  <div class="actions">
    {#if inShell()}
      <button class="small" onclick={() => void companion.capture(false)} data-testid="island-capture"><Monitor size={14} />{copy.capture}</button>
      <button class="small" onclick={() => void companion.capture(true)} data-testid="island-capture-zone"><Crop size={14} />{copy.zone}</button>
    {/if}
    <button class="small primary" disabled={!ready} onclick={ask} data-testid="island-drop-ask"><MessageCircle size={14} />{copy.ask}</button>
  </div>
</div>

<style>
  .drop {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 22px 16px;
    border-style: dashed;
    border-color: var(--island-line-strong);
    color: var(--island-muted);
    text-align: center;
    transition: border-color 160ms ease, background 160ms ease;
  }
  .zone.over {
    border-color: var(--island-talking);
    background: rgb(139 124 246 / 0.08);
    color: var(--island-text);
  }
  .title {
    margin: 4px 0 0;
    color: var(--island-text);
    font-weight: 500;
  }
  .hint {
    margin: 0;
    font-size: 12px;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }
  .actions button {
    gap: 6px;
  }
</style>
