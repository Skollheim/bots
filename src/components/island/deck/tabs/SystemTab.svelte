<!--
  The deck's "system" tab: the computer's readings (processor, memory,
  disks, how long it has been on), its busiest apps, which may be closed
  unless protected, the four power buttons, and "Why is it slow?", which puts
  the readings to the chat. Anything that changes the computer asks first,
  inline. The readings refresh every two seconds while the tab shows.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Lock, Moon, Power, RotateCcw, ShieldCheck, Sparkles, X } from '@lucide/svelte';
  import { fill, strings } from '../../../../lib/strings';
  import { useView } from '../../../../lib/island/contract';
  import { closeProcess, power, systemSample, type Power as PowerAction, type Proc, type Sample } from '../../../../lib/windows/native';
  import { InlineConfirm } from '../../../../lib/windows/confirm.svelte';
  import { readWindowsPrefs, writeWindowsPrefs, type ProcessSort } from '../../../../lib/windows/prefs';
  import { formatBytes, percent, processLabel, slowQuestion, topProcesses, uptimeOf } from '../../../../lib/windows/system';
  import Tile from '../computer/Tile.svelte';

  const REFRESH_MS = 2_000;
  const POWER: { action: PowerAction; icon: typeof Lock }[] = [
    { action: 'lock', icon: Lock },
    { action: 'sleep', icon: Moon },
    { action: 'restart', icon: RotateCcw },
    { action: 'shutdown', icon: Power }
  ];

  const view = useView();
  const copy = $derived(strings.island.deck.system);
  const confirm = new InlineConfirm();

  let sample = $state.raw<Sample | null>(null);
  let failed = $state(false);
  let sort = $state<ProcessSort>(readWindowsPrefs().processSort);
  let problem = $state('');

  const bytes = (value: number) => formatBytes(value, copy.point);
  const rows = $derived(sample ? topProcesses(sample.processes, sort) : []);
  const uptime = $derived(uptimeOf(sample?.uptime ?? 0));
  const memoryShare = $derived(sample ? percent(sample.memoryUsed, sample.memoryTotal) : 0);

  onMount(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const next = await systemSample();
        if (!alive) return;
        sample = next;
        failed = false;
      } catch {
        if (alive) failed = true;
      }
      if (alive) timer = setTimeout(read, REFRESH_MS);
    };
    void read();
    return () => {
      alive = false;
      clearTimeout(timer);
      confirm.dispose();
    };
  });

  function choose(next: ProcessSort) {
    sort = next;
    writeWindowsPrefs({ processSort: next });
  }

  async function act(action: PowerAction) {
    if (!confirm.confirm(`power:${action}`)) return;
    problem = '';
    await power(action).catch(() => (problem = copy.failed));
  }

  async function close(proc: Proc) {
    if (!confirm.confirm(`proc:${proc.pid}`)) return;
    problem = '';
    try {
      await closeProcess(proc.pid, proc.started);
      if (sample) sample = { ...sample, processes: sample.processes.filter((row) => row.pid !== proc.pid) };
    } catch {
      problem = fill(copy.closeFailed, { name: processLabel(proc.name) });
    }
  }

  async function askWhySlow() {
    if (!sample) return;
    const { assistant } = view.companion;
    assistant.draft = slowQuestion(sample, copy.slowIntro);
    view.show('chat');
    await assistant.send();
  }

  /** Focuses an armed row's or button's "Confirm" as it appears. */
  function focusNow(element: HTMLElement) {
    element.focus();
  }

  function onkeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && confirm.armed) {
      event.stopPropagation();
      confirm.cancel();
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tab" data-testid="deck-tab-system" {onkeydown}>
  <Tile heading={copy.cpu} area="cpu" testid="system-cpu">
    <p class="big">{sample ? Math.round(sample.cpu) : '–'}<span class="unit">%</span></p>
    <div class="bar" role="presentation"><span style:transform="scaleX({(sample?.cpu ?? 0) / 100})"></span></div>
  </Tile>

  <Tile heading={copy.memory} area="mem" testid="system-memory">
    <p class="big">{sample ? bytes(sample.memoryUsed) : '–'}</p>
    <p class="small">{sample ? fill(copy.of, { total: bytes(sample.memoryTotal) }) : ''}</p>
    <div class="bar" role="presentation"><span style:transform="scaleX({memoryShare / 100})"></span></div>
  </Tile>

  <Tile heading={copy.uptime} area="up" testid="system-uptime">
    <p class="big">
      {#if !sample}–{:else if uptime.days > 0}{fill(copy.days, { days: String(uptime.days), hours: String(uptime.hours) })}{:else}{fill(copy.hours, { hours: String(uptime.hours), minutes: String(uptime.minutes) })}{/if}
    </p>
  </Tile>

  <Tile heading={copy.disks} area="disks" scroll testid="system-disks">
    <ul class="drives">
      {#each sample?.drives ?? [] as drive (drive.mount)}
        {@const used = percent(drive.total - drive.free, drive.total)}
        <li>
          <p class="drive-name"><span class="mount">{drive.mount}</span>{#if drive.label}<span class="label">{drive.label}</span>{/if}</p>
          <div class="bar" class:low={used >= 90} role="presentation"><span style:transform="scaleX({used / 100})"></span></div>
          <p class="small numeric">{fill(copy.free, { free: bytes(drive.free) })} · {fill(copy.of, { total: bytes(drive.total) })}</p>
        </li>
      {/each}
    </ul>
  </Tile>

  <Tile heading={copy.power} area="power" testid="system-power">
    <div class="power">
      {#each POWER as { action, icon: Icon } (action)}
        {#if confirm.is(`power:${action}`)}
          <div class="square armed" role="group" aria-label={copy.ask[action]} data-testid="system-power-confirm">
            <span class="ask">{copy.ask[action]}</span>
            <button class="yes" {@attach focusNow} onclick={() => act(action)}>{copy.confirm}</button>
            <button class="no" onclick={() => confirm.cancel()}>{copy.cancel}</button>
          </div>
        {:else}
          <button class="square" onclick={() => confirm.arm(`power:${action}`)} data-testid="system-power-{action}">
            <Icon size={22} strokeWidth={1.8} />
            <span>{copy.actions[action]}</span>
          </button>
        {/if}
      {/each}
    </div>
  </Tile>

  <Tile heading={copy.processes} area="procs" testid="system-processes">
    {#snippet aside()}
      <div class="switch" role="group" aria-label={copy.processes}>
        <button class:on={sort === 'cpu'} aria-pressed={sort === 'cpu'} onclick={() => choose('cpu')}>{copy.byCpu}</button>
        <button class:on={sort === 'memory'} aria-pressed={sort === 'memory'} onclick={() => choose('memory')}>{copy.byMemory}</button>
      </div>
    {/snippet}
    <ol class="procs">
      {#each rows as proc (proc.pid)}
        {@const name = processLabel(proc.name)}
        <li class:armed={confirm.is(`proc:${proc.pid}`)}>
          <span class="proc-name" title={proc.name}>{name}</span>
          {#if confirm.is(`proc:${proc.pid}`)}
            <span class="row-ask">
              <button class="yes" {@attach focusNow} onclick={() => close(proc)}>{copy.closeAsk}</button>
              <button class="no" onclick={() => confirm.cancel()}>{copy.cancel}</button>
            </span>
          {:else}
            <span class="value numeric">{sort === 'cpu' ? `${proc.cpu.toFixed(1).replace('.', copy.point)} %` : bytes(proc.memory)}</span>
            {#if proc.protected}
              <span class="guard" title={fill(copy.protected, { name })} aria-label={fill(copy.protected, { name })}><ShieldCheck size={15} /></span>
            {:else}
              <button class="icon" aria-label={fill(copy.close, { name })} title={fill(copy.close, { name })} onclick={() => confirm.arm(`proc:${proc.pid}`)} data-testid="system-close">
                <X size={15} />
              </button>
            {/if}
          {/if}
        </li>
      {/each}
    </ol>
    {#if failed && !sample}<p class="note">{copy.unavailable}</p>{/if}
    {#if problem}<p class="note problem" role="status">{problem}</p>{/if}
    <button class="slow" disabled={!sample} onclick={askWhySlow} data-testid="system-slow"><Sparkles size={15} />{copy.slow}</button>
  </Tile>
</div>

<style>
  .tab {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, 1.5fr);
    grid-template-rows: auto auto auto;
    grid-template-areas:
      'cpu mem up procs'
      'disks disks disks procs'
      'power power power procs';
    gap: var(--deck-gap);
    color: var(--island-text);
    font-family: var(--island-font);
  }
  p {
    margin: 0;
  }
  .big {
    font-family: var(--deck-numeral-font);
    font-size: 28px;
    font-variant-numeric: tabular-nums;
    font-weight: 600;
    line-height: 1.1;
    white-space: nowrap;
  }
  .unit {
    margin-left: 2px;
    color: var(--island-muted);
    font-size: 18px;
  }
  .small {
    color: var(--island-muted);
    font-size: 12px;
  }
  .numeric {
    font-family: var(--deck-numeral-font);
    font-variant-numeric: tabular-nums;
  }
  .bar {
    height: 6px;
    margin-top: auto;
    overflow: hidden;
    border-radius: 3px;
    background: var(--island-pill);
  }
  .bar span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--deck-accent);
    transform-origin: left;
    transition: transform 0.5s ease;
  }
  .bar.low span {
    background: var(--island-danger);
  }

  .drives {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(150px, 1fr));
    gap: 10px 14px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .drives li {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }
  .drive-name {
    display: flex;
    gap: 6px;
    min-width: 0;
    font-size: 13px;
  }
  .mount {
    font-weight: 600;
  }
  .label {
    overflow: hidden;
    color: var(--island-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .drives .bar {
    margin-top: 0;
  }

  .power {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: var(--deck-gap);
  }
  .square {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 8px;
    height: 92px;
    padding: 8px;
    border: none;
    border-radius: 14px;
    background: var(--deck-field);
    color: var(--island-text);
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    transition: transform 0.12s ease, background-color 0.15s ease;
  }
  button.square:hover {
    background: var(--deck-tile-hover);
  }
  button.square:active,
  .yes:active,
  .no:active,
  .slow:active,
  .icon:active {
    transform: scale(0.96);
  }
  .square.armed {
    gap: 6px;
    background: var(--deck-accent-soft);
    cursor: default;
  }
  .ask {
    color: var(--deck-accent-ink);
    font-size: 12px;
    font-weight: 600;
    text-align: center;
  }
  .yes,
  .no {
    min-width: 0;
    padding: 4px 10px;
    border: none;
    border-radius: 999px;
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .yes {
    background: var(--deck-accent);
    color: var(--island-bg);
    font-weight: 600;
  }
  .no {
    background: transparent;
    color: var(--island-muted);
  }
  .no:hover {
    color: var(--island-text);
  }
  .square.armed .yes,
  .square.armed .no {
    width: 100%;
  }

  .switch {
    display: flex;
    padding: 2px;
    border-radius: 999px;
    background: var(--deck-field);
  }
  .switch button {
    padding: 3px 10px;
    border: none;
    border-radius: 999px;
    background: transparent;
    color: var(--island-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .switch button.on {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  .procs {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .procs li {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 34px;
    padding: 0 4px 0 10px;
    border-radius: 10px;
    font-size: 13px;
  }
  .procs li:hover,
  .procs li.armed {
    background: var(--deck-field);
  }
  .proc-name {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .value {
    color: var(--island-muted);
    white-space: nowrap;
  }
  .guard,
  .icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 26px;
    height: 26px;
  }
  .guard {
    color: var(--island-faint);
  }
  .icon {
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--island-muted);
    cursor: pointer;
  }
  .icon:hover {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .row-ask {
    display: flex;
    gap: 4px;
  }
  .note {
    color: var(--island-muted);
    font-size: 12px;
  }
  .problem {
    color: var(--island-danger);
  }
  .slow {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    margin-top: auto;
    padding: 9px 12px;
    border: none;
    border-radius: 12px;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    font: inherit;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    transition: transform 0.12s ease;
  }
  .slow:hover:not(:disabled) {
    background: var(--deck-accent);
    color: var(--island-bg);
  }
  .slow:disabled {
    opacity: 0.5;
    cursor: default;
  }
  button:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 2px;
  }
  @media (prefers-reduced-motion: reduce) {
    .bar span,
    .square,
    .yes,
    .no,
    .slow,
    .icon {
      transition: none;
    }
    button:active {
      transform: none !important;
    }
  }
</style>
