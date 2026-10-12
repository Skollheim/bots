<!--
  A mission a reply asks for (`[[mission: …]]`), waiting for the user's word
  when the companion asks before acting: when it runs, how often, in which
  project and the instruction, to schedule or cancel. Its runs later go
  without asking. Each card takes clicks (`data-hit`).
-->
<script lang="ts">
  import { CalendarClock, Repeat } from '@lucide/svelte';
  import type { Missions } from '../../lib/companion/missions.svelte';
  import { repeatText, whenText } from '../../lib/companion/mission-text';
  import { fill, strings } from '../../lib/strings';

  let { missions }: { missions: Missions } = $props();

  const copy = $derived(strings.companion.mission);
  const next = $derived(strings.companion.settings.missionNext);
</script>

{#each missions.pending as mission (mission.id)}
  <div class="card ask" data-hit role="group" aria-label={fill(copy.confirmTitle, { project: mission.project })} data-testid="companion-mission-confirm">
    <header>
      <span class="mark" aria-hidden="true"><CalendarClock size={14} /></span>
      <span class="title">{fill(copy.confirmTitle, { project: mission.project })}</span>
    </header>
    <p class="when">
      <Repeat size={12} aria-hidden="true" />
      <span>{repeatText(mission)}</span>
      {#if mission.repeat.kind !== 'once'}<span class="next">{fill(next, { when: whenText(mission.due) })}</span>{/if}
    </p>
    <p class="prompt">{mission.prompt}</p>
    <div class="actions">
      <button class="ghost small" onclick={() => missions.cancel(mission.id)} data-testid="companion-mission-cancel">{copy.cancel}</button>
      <button class="primary small" onclick={() => missions.confirm(mission.id)} data-testid="companion-mission-schedule">{copy.schedule}</button>
    </div>
  </div>
{/each}

<style>
  .card {
    width: 340px;
    border: 1px solid var(--color-accent);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-e2);
    animation: rise var(--dur-2) var(--ease-out-quint);
  }
  .ask {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding: 8px 8px 8px 12px;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
  }
  .mark {
    flex: none;
    display: grid;
    color: var(--color-accent);
  }
  .title {
    min-width: 0;
    font-size: var(--text-sm);
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .when {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 4px 6px;
    margin: 0;
    font-size: var(--text-xs);
    font-weight: 500;
    font-variant-numeric: tabular-nums;
  }
  .next {
    color: var(--color-muted-foreground);
    font-weight: 400;
  }
  .prompt {
    margin: 0;
    max-height: 96px;
    overflow-y: auto;
    scrollbar-width: thin;
    font-size: var(--text-xs);
    line-height: 1.45;
    color: var(--color-muted-foreground);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
  }
  .small {
    height: var(--control-sm);
    padding: 0 10px;
    font-size: var(--text-xs);
  }
  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .card {
      animation: none;
    }
  }
</style>
