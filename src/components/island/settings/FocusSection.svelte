<!--
  Settings, Focus: the pomodoro's work and break, and the focus it keeps
  while the work runs.
-->
<script lang="ts">
  import type { MenuItem } from '@boite/ui/lib/menu';
  import { fill, strings } from '../../../lib/strings';
  import type { CompanionPrefs } from '../../../lib/companion/prefs';
  import SettingPick from './SettingPick.svelte';
  import SettingSwitch from './SettingSwitch.svelte';

  let { prefs, save }: { prefs: CompanionPrefs; save: (patch: Partial<CompanionPrefs>) => void } = $props();

  const WORK_MINUTES = [15, 20, 25, 30, 45, 50, 60, 90];
  const BREAK_MINUTES = [3, 5, 10, 15];
  const copy = $derived(strings.companion.settings);
  const minutesLabel = (count: number) => fill(copy.minutes, { count: String(count) });
  const minuteItems = (choices: number[], current: number): MenuItem[] =>
    [...new Set([...choices, current])].sort((a, b) => a - b).map((count) => ({ id: String(count), label: minutesLabel(count), active: count === current }));
  let workItems = $derived(minuteItems(WORK_MINUTES, prefs.workMinutes));
  let breakItems = $derived(minuteItems(BREAK_MINUTES, prefs.breakMinutes));
</script>

<div class="card">
  <SettingPick label={copy.workMinutes} items={workItems} current={minutesLabel(prefs.workMinutes)} onpick={(id) => save({ workMinutes: Number(id) })} testid="companion-work-minutes" />
  <SettingPick label={copy.breakMinutes} items={breakItems} current={minutesLabel(prefs.breakMinutes)} onpick={(id) => save({ breakMinutes: Number(id) })} testid="companion-break-minutes" />
  <SettingSwitch label={copy.focusOnWork} hint={copy.focusOnWorkHint} checked={prefs.focusOnWork} onchange={(focusOnWork) => save({ focusOnWork })} testid="companion-focus-on-work" />
</div>
