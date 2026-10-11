<!--
  Home's live sessions: one row per thread at work or waiting on the user,
  waiting ones first, kept two minutes after they end (longer while the
  thread's finished card stands: it folds into the row). With nothing at work,
  the lead robot naps beside "Nothing running": a few breaths, then still.
-->
<script lang="ts">
  import { useView } from '../../../lib/island/contract';
  import { posed } from '../../../lib/island/posed.svelte';
  import { strings } from '../../../lib/strings';
  import CompanionCharacter from '../../companion/CompanionCharacter.svelte';
  import SessionRow from './SessionRow.svelte';

  const view = useView();
  const sessions = $derived(view.sessions);
  // A capture pose (`sessions=none`, `pose.ts`) shows the list empty; the dev bundle only.
  const rows = $derived(import.meta.env.DEV && posed.idle ? [] : sessions.rows);
  const projects = $derived(view.companion.projects);
  const notes = $derived(view.companion.notes);
  const lead = $derived(view.companion.members[0] ?? null);
  const ended = $derived(new Set(sessions.ended));
  const notices = $derived(new Map(notes.notices.filter((notice) => ended.has(notice.threadId)).map((notice) => [notice.threadId, notice])));
  const copy = strings.island.sessions;
  const reveal = (threadId: string) => void view.reveal(threadId).catch(() => {});
</script>

<section class="island-card" data-testid="island-sessions">
  <h3 class="island-heading">{copy.title}</h3>
  {#if rows.length === 0}
    <div class="none" data-testid="island-sessions-none">
      <span class="nap" aria-hidden="true">
        <CompanionCharacter mood="idle" asleep lively={false} skin={lead?.skin ?? null} size={40} />
      </span>
      <p class="words">
        <span class="line">{copy.none}</span>
        <span class="hint">{copy.noneHint}</span>
      </p>
    </div>
  {:else}
    <ul class="rows">
      {#each rows as row (row.id)}
        <SessionRow {row} project={(row.projectId && projects.get(row.projectId)) || ''} now={sessions.now} notice={notices.get(row.id) ?? null} {notes} onreveal={reveal} />
      {/each}
    </ul>
  {/if}
</section>

<style>
  .none {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 4px 0 2px;
    animation: settle 320ms ease-out;
  }
  .nap {
    flex: none;
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
  }
  /* A few slow breaths and a "z" as it dozes off, then it lies still: nothing loops in a calm Home. */
  .nap :global(*) {
    animation-iteration-count: 2 !important;
  }
  .words {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
    margin: 0;
  }
  .line {
    color: var(--island-text);
    font-size: 13px;
    font-weight: 500;
  }
  .hint {
    color: var(--island-muted);
    font-size: 12px;
  }
  .rows {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  @keyframes settle {
    from {
      opacity: 0;
      transform: translateY(3px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .none {
      animation: none;
    }
  }
</style>
