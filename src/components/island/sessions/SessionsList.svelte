<!--
  Home's live sessions: one row per thread at work or waiting on the user,
  waiting ones first, kept two minutes after they end. An empty list says so
  in one line.
-->
<script lang="ts">
  import { useView } from '../../../lib/island/contract';
  import { strings } from '../../../lib/strings';
  import SessionRow from './SessionRow.svelte';

  const view = useView();
  const sessions = $derived(view.sessions);
  const projects = $derived(view.companion.projects);
  const copy = strings.island.sessions;
  const reveal = (threadId: string) => void view.reveal(threadId).catch(() => {});
</script>

<section class="island-card" data-testid="island-sessions">
  <h3 class="island-heading">{copy.title}</h3>
  {#if sessions.rows.length === 0}
    <p class="none">{copy.none}</p>
  {:else}
    <ul class="rows">
      {#each sessions.rows as row (row.id)}
        <SessionRow {row} project={(row.projectId && projects.get(row.projectId)) || ''} now={sessions.now} onreveal={reveal} />
      {/each}
    </ul>
  {/if}
</section>

<style>
  .none {
    margin: 0;
    color: var(--island-muted);
  }
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
</style>
