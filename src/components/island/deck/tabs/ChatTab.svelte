<!--
  The deck's chat tab: the conversation with one of the user's Boite agents
  (`assistant/AssistantChat.svelte`, its history and its composer) in the
  main tile, and beside it what goes with the next message: where to drop
  files (anywhere on the deck works too) and the screen captures. The files
  and the capture held show in the composer, as chips.
-->
<script lang="ts">
  import { Crop, FilePlus, Monitor } from '@lucide/svelte';
  import { inShell } from '../../../../lib/companion/shell';
  import { useView } from '../../../../lib/island/contract';
  import { strings } from '../../../../lib/strings';
  import AssistantChat from '../../assistant/AssistantChat.svelte';
  import DeckTile from '../DeckTile.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.drop;
</script>

<div class="chat" data-testid="deck-tab-chat">
  <DeckTile area="main" testid="deck-chat">
    <AssistantChat />
  </DeckTile>

  <DeckTile area="side" heading={strings.island.deck.chat.attach} testid="island-drop">
    <div class="zone" class:over={companion.attached.over}>
      <FilePlus size={22} strokeWidth={1.6} aria-hidden="true" />
      <p class="title">{copy.title}</p>
      <p class="hint">{copy.hint}</p>
    </div>
    {#if inShell()}
      <div class="actions">
        <button class="small" onclick={() => void companion.capture(false)} data-testid="island-capture"><Monitor size={14} />{copy.capture}</button>
        <button class="small" onclick={() => void companion.capture(true)} data-testid="island-capture-zone"><Crop size={14} />{copy.zone}</button>
      </div>
    {/if}
  </DeckTile>
</div>

<style>
  .chat {
    display: grid;
    grid-template-columns: minmax(0, 1fr) 236px;
    grid-template-areas: 'main side';
    gap: var(--deck-gap);
    align-items: start;
  }
  /* The conversation takes the deck's height; its composer keeps a field of its own inside the tile. */
  .chat :global(.assistant .list) {
    max-height: 250px;
  }
  .chat :global(.assistant .composer.island-card) {
    padding: 8px 8px 8px 12px;
    border-radius: 16px;
    background: var(--deck-field);
  }
  .zone {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 4px;
    padding: 18px 12px;
    border: 1.5px dashed var(--island-line-strong);
    border-radius: 14px;
    color: var(--island-muted);
    text-align: center;
    transition: border-color 160ms ease;
  }
  .zone.over {
    border-color: var(--deck-accent);
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
    line-height: 1.4;
  }
  .actions {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .actions button {
    gap: 6px;
    justify-content: flex-start;
  }
  @media (prefers-reduced-motion: reduce) {
    .zone {
      transition: none;
    }
  }
</style>
