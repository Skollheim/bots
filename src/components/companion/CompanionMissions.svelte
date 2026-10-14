<!--
  Settings, Companion: the missions the companion launches on its own
  (`lib/companion/missions.ts`), set by an agent's `[[mission: …]]` and kept on
  this computer for the core in use: how often, the next run, the project and
  the instruction, to pause, resume or remove. A mission whose project is gone
  stays listed, marked, and does not run.
-->
<script lang="ts">
  import { Pause, Play, TriangleAlert, X } from '@lucide/svelte';
  import type { CoreLink } from '../../lib/core.svelte';
  import { coreKey } from '../../lib/island/followed';
  import { pauseMission, readMissions, removeMission, subscribeMissions, type Mission } from '../../lib/companion/missions';
  import { repeatText, whenText } from '../../lib/companion/mission-text';
  import { fill, strings } from '../../lib/strings';

  let { store }: { store: CoreLink } = $props();

  const copy = $derived(strings.companion.settings);

  const core = () => coreKey(store.client?.core);
  const known = $derived(new Set(store.projects.map((project) => project.id)));

  /** Moves on any change from the companion's window or this one. */
  let changed = $state(0);
  $effect(() => subscribeMissions(() => changed++));
  // Read again on a change, and when the core changes or comes back.
  const missions: Mission[] = $derived.by(() => {
    void [changed, store.client, store.connection];
    return readMissions(core());
  });

  const gone = (mission: Mission) => mission.missing || (store.projects.length > 0 && !known.has(mission.projectId));
</script>

<!-- Titled by the settings panel's section, which tells what a mission is behind its "i". -->
<section class="card" data-testid="companion-missions">
  {#if missions.length === 0}
    <p class="hint">{copy.missionsEmpty}</p>
  {:else}
    <ul class="list">
      {#each missions as mission (mission.id)}
        <li class:paused={mission.paused} data-testid="companion-mission">
          <span class="item">
            <span class="line">
              <span class="repeat">{repeatText(mission)}</span>
              {#if mission.paused}
                <span class="meta">{copy.missionPaused}</span>
              {:else if mission.repeat.kind !== 'once'}
                <span class="meta">{fill(copy.missionNext, { when: whenText(mission.due) })}</span>
              {/if}
              <span class="project">{mission.project}</span>
            </span>
            <span class="prompt">{mission.prompt}</span>
            {#if gone(mission)}
              <span class="gone"><TriangleAlert size={12} aria-hidden="true" />{copy.missionGone}</span>
            {/if}
          </span>
          <button
            class="ghost icon"
            aria-label={mission.paused ? copy.resumeMission : copy.pauseMission}
            title={mission.paused ? copy.resumeMission : copy.pauseMission}
            onclick={() => pauseMission(core(), mission.id, !mission.paused)}
          >
            {#if mission.paused}<Play size={14} />{:else}<Pause size={14} />{/if}
          </button>
          <button class="ghost icon" aria-label={copy.removeMission} title={copy.removeMission} onclick={() => removeMission(core(), mission.id)}><X size={14} /></button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .hint {
    padding: 12px 0;
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 4px;
    min-height: var(--row);
    padding: 6px 0;
    border-bottom: 1px solid var(--color-border);
  }
  .list li:last-child {
    border-bottom: none;
  }
  .item {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: var(--text-sm);
    line-height: 1.4;
  }
  .line {
    display: flex;
    flex-wrap: wrap;
    gap: 2px 8px;
  }
  .repeat {
    font-weight: 500;
  }
  .meta,
  .project {
    color: var(--color-muted-foreground);
    font-variant-numeric: tabular-nums;
  }
  .prompt {
    color: var(--color-muted-foreground);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .paused .repeat,
  .paused .prompt {
    opacity: 0.7;
  }
  .gone {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    color: var(--color-danger);
    font-size: var(--text-xs);
  }
  .list .icon {
    flex: none;
  }
</style>
