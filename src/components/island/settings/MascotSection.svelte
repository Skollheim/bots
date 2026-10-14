<!--
  Settings, Mascot: the island's robot, and the first agent's on the desktop
  (`RobotPicker`), or back to the first agent's own look.
-->
<script lang="ts">
  import { strings } from '../../../lib/strings';
  import { MASCOT_FAMILIES, type CompanionPrefs, type Mascot } from '../../../lib/companion/prefs';
  import { CLASSIC_SKIN } from '../../../lib/companion/crew';
  import { parseRobot } from '../../../lib/robots';
  import RobotPicker from '../../agents/RobotPicker.svelte';

  let { prefs, save }: { prefs: CompanionPrefs; save: (patch: Partial<CompanionPrefs>) => void } = $props();

  /** What the picker shows until one is chosen: Boîte, the classic box. */
  const CLASSIC = parseRobot(CLASSIC_SKIN)!;
  const copy = $derived(strings.companion.settings);
</script>

<div class="card mascot" data-testid="companion-mascot">
  <RobotPicker robot={prefs.mascot ?? CLASSIC} families={MASCOT_FAMILIES} compact onpick={(robot) => save({ mascot: robot as Mascot })} />
  {#if prefs.mascot}
    <button type="button" class="ghost small reset" onclick={() => save({ mascot: null })} data-testid="companion-mascot-reset">{copy.mascotReset}</button>
  {/if}
</div>

<style>
  .reset {
    margin-top: 10px;
    color: var(--color-muted-foreground);
  }
</style>
