<!--
  The marks beside a companion of any family but the box (which draws its
  own): a z rising while it sleeps, a ! blinking while it calls, sparks for
  joy (`markOf`). They move by transform and opacity only.
-->
<script lang="ts">
  import { markOf, type Face } from '../../lib/companion/character';

  let { face }: { face: Face } = $props();
  const mark = $derived(markOf(face));
</script>

{#if mark === 'z'}
  <span class="mark z" aria-hidden="true">z</span>
{:else if mark === 'shout'}
  <span class="mark shout" aria-hidden="true">!</span>
{:else if mark === 'spark'}
  <svg class="mark spark" viewBox="0 0 100 100" aria-hidden="true"><path d="M9 22 l-5 -4 M50 9 v-6 M91 22 l5 -4" /></svg>
{/if}

<style>
  .mark {
    position: absolute;
    pointer-events: none;
    color: var(--color-foreground);
    font: 700 var(--text-sm) / 1 var(--font-sans);
  }
  .z { top: 0; right: 4%; animation: zz 3s ease-in-out infinite; }
  .shout { top: 2%; right: 0; color: var(--island-attention, var(--color-live)); animation: beacon 0.7s ease-in-out infinite alternate; }
  .spark { inset: 0; width: 100%; height: 100%; overflow: visible; fill: none; stroke: var(--island-done, var(--color-success)); stroke-width: 3; stroke-linecap: round; animation: beacon 1.2s ease-in-out infinite alternate; }

  @keyframes zz { 0% { transform: translate(0, 0); opacity: 0; } 25% { opacity: 0.9; } 100% { transform: translate(6px, -10px); opacity: 0; } }
  @keyframes beacon { from { opacity: 1; } to { opacity: 0.3; } }
  @media (prefers-reduced-motion: reduce) {
    .mark { animation: none !important; }
  }
</style>
