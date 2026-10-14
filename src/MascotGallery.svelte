<!--
  Every companion family in a few moods side by side, for captures and for
  looking at them move: `index.html?view=mascots`, in the dev bundle only
  (`main.ts`). `size=<px>` sets their size (64 by default, the desktop's);
  `family=<family>` shows every shape of that family instead; `mood=<mood>`
  (or `mood=asleep`) keeps that one column and `shapes=<n>` the first rows, for measuring one robot at rest.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { startTheme } from '@boite/ui/lib/theme';
  import CompanionCharacter from './components/companion/CompanionCharacter.svelte';
  import type { Mood } from './lib/companion/mood';
  import { ROBOT_FAMILIES, ROBOT_PARTS, type Robot, type RobotFamily } from './lib/robots';
  import { strings } from './lib/strings';

  /** One robot per family, each wearing something on top so the antenna, the cap and the lid move too. */
  const FAMILIES: Robot[] = [
    { family: 'box', shape: 0, color: 0, eyes: 0, top: 0 },
    { family: 'jelly', shape: 0, color: 3, eyes: 0, top: 3 },
    { family: 'bubble', shape: 0, color: 5, eyes: 2, top: 1 },
    { family: 'capsule', shape: 0, color: 1, eyes: 0, top: 1 },
    { family: 'retro', shape: 0, color: 7, eyes: 1, top: 0 },
  ];
  const ALL_MOODS: { mood: Mood; asleep?: boolean; caption: string }[] = [
    { mood: 'idle', caption: strings.companion.moods.idle },
    { mood: 'working', caption: strings.companion.moods.working },
    { mood: 'calling', caption: strings.companion.moods.calling },
    { mood: 'happy', caption: strings.companion.moods.happy },
    { mood: 'idle', asleep: true, caption: 'z' },
  ];
  const params = new URLSearchParams(location.search);
  const only = params.get('mood');
  const MOODS = only ? ALL_MOODS.filter((column) => (only === 'asleep' ? column.asleep : column.mood === only && !column.asleep)) : ALL_MOODS;
  const size = Number(params.get('size')) || 64;
  const family = params.get('family') as RobotFamily | null;
  const own = family && ROBOT_FAMILIES.includes(family) ? FAMILIES.find((robot) => robot.family === family)! : null;
  const shapes = Number(params.get('shapes')) || Infinity;
  const ROBOTS: Robot[] = (own ? Array.from({ length: ROBOT_PARTS[own.family].shape }, (_, shape) => ({ ...own, shape, top: (own.top + shape) % ROBOT_PARTS[own.family].top })) : FAMILIES).slice(0, shapes);
  onMount(() => startTheme());
</script>

<main class="gallery" style:--cell="{size + 40}px">
  <span></span>
  {#each MOODS as column, index (index)}<span class="caption">{column.caption}</span>{/each}
  {#each ROBOTS as robot, row (row)}
    <span class="caption">{strings.agents.robot.families[robot.family]}{own ? ` ${robot.shape + 1}` : ''}</span>
    {#each MOODS as column, index (index)}
      <span class="cell" data-family={robot.family} data-mood={column.mood}>
        <CompanionCharacter mood={column.mood} asleep={column.asleep} skin={robot} lively={false} {size} gaze={{ x: 0.6, y: -0.2 }} />
      </span>
    {/each}
  {/each}
</main>

<style>
  :global(html), :global(body) { margin: 0; min-height: 100%; background: var(--color-background); }
  .gallery { display: grid; grid-template-columns: 90px repeat(5, var(--cell)); gap: 10px 18px; align-items: center; justify-items: center; padding: 24px; width: max-content; }
  .caption { font: 600 var(--text-sm) / 1.2 var(--font-sans); color: var(--color-foreground); background: var(--color-surface); padding: 3px 8px; border-radius: var(--radius-md); }
  .cell { display: grid; place-items: center; width: var(--cell); height: var(--cell); }
</style>
