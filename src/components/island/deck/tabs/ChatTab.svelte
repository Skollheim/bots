<!--
  The deck's chat tab: the conversation with one of the user's Boite agents
  (`assistant/AssistantChat.svelte`, its history and its composer), across
  the deck's whole width.

  What goes with the next message rides in the composer: the files dropped
  and the screen capture held show as chips above the field, and in the
  shell the two capture buttons sit beside it (the whole screen, or a zone).
  Files are dropped anywhere on the deck; where they go shows only while
  they are dragged over it (`Deck.svelte`).
-->
<script lang="ts">
  import { Crop, Monitor } from '@lucide/svelte';
  import { inShell } from '../../../../lib/companion/shell';
  import { useView } from '../../../../lib/island/contract';
  import { strings } from '../../../../lib/strings';
  import AssistantChat from '../../assistant/AssistantChat.svelte';
  import DeckTile from '../DeckTile.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.drop;
  const shell = inShell();
</script>

{#snippet captures()}
  <span class="captures" role="group" aria-label={strings.island.deck.chat.attach}>
    <button class="capture" aria-label={copy.capture} title={copy.capture} onclick={() => void companion.capture(false)} data-testid="island-capture">
      <Monitor size={15} strokeWidth={1.9} />
    </button>
    <button class="capture" aria-label={copy.zone} title={copy.zone} onclick={() => void companion.capture(true)} data-testid="island-capture-zone">
      <Crop size={15} strokeWidth={1.9} />
    </button>
  </span>
{/snippet}

<div class="chat" data-testid="deck-tab-chat">
  <DeckTile area="main" testid="deck-chat">
    <AssistantChat tools={shell ? captures : undefined} />
  </DeckTile>
</div>

<style>
  .chat {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'main';
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
  .captures {
    display: flex;
    flex: none;
    gap: 2px;
  }
  .capture {
    display: inline-grid;
    place-items: center;
    width: 28px;
    height: 28px;
    min-height: 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    box-shadow: none;
    color: var(--island-muted);
    cursor: pointer;
    transition:
      background 160ms ease,
      color 160ms ease;
  }
  .capture:hover:not(:disabled) {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .capture:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
  }
  @media (prefers-reduced-motion: reduce) {
    .capture {
      transition: none;
    }
  }
</style>
