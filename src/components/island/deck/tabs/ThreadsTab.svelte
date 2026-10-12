<!--
  The deck's threads tab: the live sessions in the main tile
  (`sessions/SessionsList.svelte`), and beside them, each only when it has
  something, the reminders and the threads that finished, a newer Boite,
  the radar's threads that waited (answered from here), the pull requests
  the threads opened and their CI, the machines of the group and how many
  threads each runs, and the tasks handed to other agents.
-->
<script lang="ts">
  import { CircleCheck, CircleDashed, CircleX, GitPullRequest, Minus } from '@lucide/svelte';
  import { threadLabel } from '../../../../lib/companion/describe';
  import { GroupClient } from '../../../../lib/group/group-client';
  import { useView } from '../../../../lib/island/contract';
  import { machineLoads } from '../../../../lib/island/deck-data';
  import { fill, strings } from '../../../../lib/strings';
  import CompanionNotes from '../../../companion/CompanionNotes.svelte';
  import CompanionRadar from '../../../companion/CompanionRadar.svelte';
  import CompanionTaskCards from '../../../companion/CompanionTaskCards.svelte';
  import SessionsList from '../../sessions/SessionsList.svelte';
  import UpdateCard from '../../views/UpdateCard.svelte';
  import DeckTile from '../DeckTile.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.deck.threads;
  const CI_ICONS = { pending: CircleDashed, passed: CircleCheck, failed: CircleX, none: Minus } as const;

  const open = (threadId: string) => void view.reveal(threadId).catch(() => {});
  /** The cards Sessions carries: on their rows, or held while an archive can still be undone. */
  const carried = $derived([...view.sessions.ended, ...view.sessions.undo.lines.map((line) => line.threadId)]);
  const notesShown = $derived(companion.notes.alarms.length > 0 || companion.notes.notices.some((notice) => !carried.includes(notice.threadId)));
  const tasksShown = $derived(companion.tasks.pending.length > 0 || companion.tasks.launched.length > 0);
  const board = $derived(view.prs.board);
  const machines = $derived.by(() => {
    const client = view.core.client;
    if (!(client instanceof GroupClient)) return [];
    return machineLoads(companion.threads, (threadId) => client.coreIdOf(threadId), client.machines(), copy.here);
  });
  const side = $derived(notesShown || !!view.update.offer || companion.radar.shown || board.length > 0 || machines.length > 0 || tasksShown);
</script>

<div class="threads" class:alone={!side} data-testid="deck-tab-threads">
  <DeckTile area="main" scroll testid="deck-sessions">
    <SessionsList />
  </DeckTile>

  {#if side}
    <div class="side">
      {#if notesShown}
        <DeckTile scroll testid="deck-notes">
          <CompanionNotes members={[]} notes={companion.notes} open={false} reachable={companion.reachable} except={carried} changes />
        </DeckTile>
      {/if}
      <UpdateCard />
      {#if companion.radar.shown}
        <DeckTile testid="deck-radar">
          <CompanionRadar radar={companion.radar} onopen={open} onreply={(threadId, text) => companion.replyFromRadar(threadId, text)} />
        </DeckTile>
      {/if}
      {#if board.length > 0}
        <DeckTile heading={copy.prs} testid="deck-prs">
          <ul class="list">
            {#each board as card (card.url)}
              {@const Icon = CI_ICONS[card.ci]}
              <li>
                <button class="row" title={card.url} onclick={() => open(card.threadId)}>
                  <GitPullRequest size={13} strokeWidth={2} aria-hidden="true" />
                  <span class="number">{fill(strings.island.pr.number, { number: String(card.number) })}</span>
                  <span class="name">{threadLabel(companion.threads, companion.projects, card.threadId).title}</span>
                  <span class="ci" data-ci={card.ci}><Icon size={12} strokeWidth={2.2} aria-hidden="true" />{copy.ci[card.ci]}</span>
                </button>
              </li>
            {/each}
          </ul>
        </DeckTile>
      {/if}
      {#if machines.length > 0}
        <DeckTile heading={copy.machines} testid="deck-machines">
          <ul class="list">
            {#each machines as machine (machine.coreId ?? '')}
              <li class="machine" class:offline={!machine.online}>
                <span class="dot" aria-hidden="true"></span>
                <span class="name">{machine.name}</span>
                <span class="count">{machine.online ? (machine.working > 0 ? fill(copy.working, { count: String(machine.working) }) : copy.idle) : copy.offline}</span>
              </li>
            {/each}
          </ul>
        </DeckTile>
      {/if}
      {#if tasksShown}
        <DeckTile testid="deck-tasks">
          <CompanionTaskCards tasks={companion.tasks} onopen={open} />
        </DeckTile>
      {/if}
    </div>
  {/if}
</div>

<style>
  .threads {
    display: grid;
    grid-template-columns: minmax(0, 1.55fr) minmax(0, 1fr);
    grid-template-areas: 'main side';
    gap: var(--deck-gap);
    align-items: start;
  }
  .threads.alone {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: 'main';
  }
  .threads > :global(.tile) {
    max-height: 394px;
  }
  .side {
    grid-area: side;
    display: flex;
    flex-direction: column;
    gap: var(--deck-gap);
    max-height: 394px;
    min-height: 0;
    overflow-y: auto;
    scrollbar-width: thin;
    scrollbar-color: var(--island-line-strong) transparent;
  }
  .side > :global(.tile) {
    flex: none;
  }
  /* The update card stands as a tile of its own. */
  .side > :global(.island-card) {
    border: none;
    border-radius: var(--deck-tile-radius);
    background: var(--deck-tile);
  }
  .list {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: auto;
    padding: 5px 6px;
    border: none;
    border-radius: 10px;
    background: none;
    color: var(--island-muted);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .row:hover {
    background: var(--deck-tile-hover);
  }
  .row:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: -2px;
  }
  .number {
    flex: none;
    color: var(--island-text);
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }
  .name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    color: var(--island-text);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .ci {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 4px;
    font-size: 12px;
  }
  .ci[data-ci='pending'] {
    color: var(--island-working);
  }
  .ci[data-ci='passed'] {
    color: var(--island-done);
  }
  .ci[data-ci='failed'] {
    color: var(--island-danger);
  }
  .machine {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 4px 6px;
  }
  .dot {
    flex: none;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: var(--island-done);
  }
  .offline .dot {
    background: var(--island-faint);
  }
  .count {
    flex: none;
    color: var(--island-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
</style>
