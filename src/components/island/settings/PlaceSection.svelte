<!--
  Settings, Place: the robots in the island or loose on the desktop, how the
  island opens and rests, its bar's edit mode, the screen, the place on the
  desktop and the shortcut. The preferences are this computer's
  (`lib/companion/prefs.ts`); the window follows each change as it is made.
-->
<script lang="ts">
  import { PencilRuler } from '@lucide/svelte';
  import InfoTip from '@boite/ui/components/InfoTip.svelte';
  import type { MenuItem } from '@boite/ui/lib/menu';
  import { fill, strings } from '../../../lib/strings';
  import { COMPANION_HOTKEYS, PILL_RESTS, type CompanionAnchor, type CompanionPrefs, type CompanionRobots, type PillRest } from '../../../lib/companion/prefs';
  import { readStatus, subscribeCompanionData } from '../../../lib/companion/memory';
  import { companionMonitors, type CompanionMonitor } from '../../../lib/companion/shell';
  import { writeBarEdit } from '../../../lib/island/bar';
  import SettingPick from './SettingPick.svelte';
  import SettingSwitch from './SettingSwitch.svelte';

  let { prefs, save }: { prefs: CompanionPrefs; save: (patch: Partial<CompanionPrefs>) => void } = $props();

  const PRIMARY = 'primary';
  const OFF = 'off';
  const ROBOTS: CompanionRobots[] = ['island', 'desktop'];
  const copy = $derived(strings.companion.settings);

  let monitors = $state.raw<CompanionMonitor[]>([]);
  let status = $state(readStatus());
  $effect(() => subscribeCompanionData(() => (status = readStatus())));
  $effect(() => {
    void companionMonitors().then((list) => (monitors = list)).catch(() => {});
  });

  let screenItems = $derived<MenuItem[]>([
    { id: PRIMARY, label: copy.primary, active: prefs.monitor === null },
    ...monitors.map((monitor) => ({
      id: monitor.name,
      label: monitor.name,
      hint: fill(copy.screenSize, { width: String(monitor.width), height: String(monitor.height) }),
      active: prefs.monitor === monitor.name
    }))
  ]);

  // Where it was dropped is offered once it has been dropped somewhere.
  let anchors = $derived<CompanionAnchor[]>(prefs.spot ? ['left', 'center', 'right', 'free'] : ['left', 'center', 'right']);
  let anchorItems = $derived<MenuItem[]>(anchors.map((anchor) => ({ id: anchor, label: copy.anchors[anchor], active: prefs.anchor === anchor })));

  let hotkeyItems = $derived<MenuItem[]>([
    { id: OFF, label: copy.hotkeyOff, active: prefs.hotkey === null },
    ...COMPANION_HOTKEYS.map((hotkey) => ({ id: hotkey, label: hotkey, active: prefs.hotkey === hotkey }))
  ]);
  let hotkeyTaken = $derived(prefs.hotkey !== null && status.hotkeyError === prefs.hotkey);

  let pillRestItems = $derived<MenuItem[]>(PILL_RESTS.map((rest) => ({ id: rest, label: copy.pillRests[rest], hint: copy.pillRestHints[rest], active: prefs.pillRest === rest })));
</script>

<div class="card">
  <div class="switch-row">
    <span class="text ui-label-box"><span class="ui-label">{copy.robots}</span><InfoTip topic={copy.robots} text={copy.robotsHint} /></span>
    <div class="segmented" role="radiogroup" aria-label={copy.robots} data-testid="companion-robots">
      {#each ROBOTS as robots (robots)}
        <button type="button" role="radio" aria-checked={prefs.robots === robots} class:on={prefs.robots === robots} onclick={() => save({ robots })} data-testid={`companion-robots-${robots}`}>{copy.robotsChoice[robots]}</button>
      {/each}
    </div>
  </div>
  <SettingPick label={copy.screen} hint={copy.screenHint} items={screenItems} current={prefs.monitor ?? copy.primary} onpick={(id) => save({ monitor: id === PRIMARY ? null : id })} testid="companion-screen" />
  {#if prefs.robots === 'desktop'}
    <SettingPick label={copy.position} hint={copy.positionHint} items={anchorItems} current={copy.anchors[prefs.anchor]} onpick={(id) => save({ anchor: id as CompanionAnchor })} testid="companion-position" />
  {/if}
  <SettingPick label={copy.hotkey} hint={copy.hotkeyHint} items={hotkeyItems} current={prefs.hotkey ?? copy.hotkeyOff} onpick={(id) => save({ hotkey: id === OFF ? null : id })} testid="companion-hotkey" />
  {#if hotkeyTaken}<p class="hint problem" role="alert">{fill(copy.hotkeyTaken, { hotkey: prefs.hotkey! })}</p>{/if}
</div>

{#if prefs.robots === 'island'}
  <div class="card">
    <SettingSwitch label={copy.openOnHover} hint={copy.openOnHoverHint} checked={prefs.openOnHover} onchange={(openOnHover) => save({ openOnHover })} testid="companion-open-on-hover" />
    <SettingPick label={copy.pillRest} hint={copy.pillRestHint} items={pillRestItems} current={copy.pillRests[prefs.pillRest]} onpick={(id) => save({ pillRest: id as PillRest })} testid="companion-pill-rest" />
    <div class="switch-row">
      <span class="text ui-label-box"><span class="ui-label">{copy.bar}</span><InfoTip topic={copy.bar} text={copy.barHint} /></span>
      <!-- The edit mode is the island's: the panel makes way for it (`App.svelte`). -->
      <button type="button" class="small" onclick={() => writeBarEdit(true)} data-testid="companion-bar-edit"><PencilRuler size={13} />{copy.barEdit}</button>
    </div>
  </div>
{/if}

<style>
  .problem {
    padding-bottom: 12px;
    color: var(--color-danger);
  }
  /* Two choices side by side, the chosen one a pill, as in the island's tab bar. */
  .segmented {
    display: flex;
    gap: 2px;
    padding: 2px;
    border: 1px solid var(--island-line);
    border-radius: 999px;
    background: var(--island-bg);
  }
  .segmented button {
    min-height: 26px;
    padding: 0 12px;
    border: none;
    border-radius: 999px;
    background: none;
    box-shadow: none;
    color: var(--island-muted);
    font-size: var(--text-sm);
  }
  .segmented button:hover {
    color: var(--island-text);
  }
  .segmented button.on {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
</style>
