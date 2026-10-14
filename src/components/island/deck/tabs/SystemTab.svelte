<!--
  The deck's "system" tab: the computer's readings and what can be done
  about them. The machine's tile leads with the processor: its load in a large
  thin number, its last minute drawn beside it (kept only while the tab
  shows); then the memory used against all of it on a fine meter, how long
  the computer has been on in a small line, the disks in dense rows, and the
  four power buttons in a calm row at its foot. Beside it, the busiest apps,
  each with its share of the computer under its name, which may be closed
  unless protected, and "Why is it slow?", which puts the readings to the
  chat. Anything that changes the computer asks first, inline. The readings
  refresh every two seconds while the tab shows.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { Lock, Moon, Power, RotateCcw, ShieldCheck, Sparkles, X } from '@lucide/svelte';
  import { fill, strings } from '../../../../lib/strings';
  import { useView } from '../../../../lib/island/contract';
  import { closeProcess, power, systemSample, type Power as PowerAction, type Proc, type Sample } from '../../../../lib/windows/native';
  import { InlineConfirm } from '../../../../lib/windows/confirm.svelte';
  import { remember, sparkPaths, spanOf, type Reading } from '../../../../lib/windows/history';
  import { readWindowsPrefs, writeWindowsPrefs, type ProcessSort } from '../../../../lib/windows/prefs';
  import { bytesParts, formatBytes, percent, processLabel, processShare, slowQuestion, topProcesses, uptimeOf } from '../../../../lib/windows/system';
  import Tile from '../computer/Tile.svelte';

  const REFRESH_MS = 2_000;
  /** The drawing's box: stretched to the room it has, its line kept fine. */
  const SPARK = { width: 300, height: 48 };
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
  /** The processor's last minute, from the readings this tab took. */
  let history = $state.raw<Reading[]>([]);

  const bytes = (value: number) => formatBytes(value, copy.point);
  const rows = $derived(sample ? topProcesses(sample.processes, sort) : []);
  const uptime = $derived(uptimeOf(sample?.uptime ?? 0));
  const uptimeText = $derived(
    !sample ? '–' : uptime.days > 0 ? fill(copy.days, { days: String(uptime.days), hours: String(uptime.hours) }) : fill(copy.hours, { hours: String(uptime.hours), minutes: String(uptime.minutes) })
  );
  const memoryShare = $derived(sample ? percent(sample.memoryUsed, sample.memoryTotal) : 0);
  const memoryUsed = $derived(sample ? bytesParts(sample.memoryUsed, copy.point) : null);
  const spark = $derived(sparkPaths(history, SPARK.width, SPARK.height));
  const range = $derived(spanOf(history));
  const armedPower = $derived(POWER.find(({ action }) => confirm.is(`power:${action}`)) ?? null);

  onMount(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const read = async () => {
      try {
        const next = await systemSample();
        if (!alive) return;
        sample = next;
        history = remember(history, { at: Date.now(), value: next.cpu });
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
  <Tile area="machine" testid="system-vitals">
    <!-- The hero: the processor's load, and its last minute beside it. -->
    <div class="cpu" data-testid="system-cpu">
      <p class="head">
        <span>{copy.cpu}</span>
        <span class="uptime" data-testid="system-uptime">{copy.uptime} <span class="ink numeric">{uptimeText}</span></span>
      </p>
      <div class="reading">
        <p class="big">{sample ? Math.round(sample.cpu) : '–'}<span class="unit">%</span></p>
        <svg
          class="spark"
          viewBox="0 0 {SPARK.width} {SPARK.height}"
          preserveAspectRatio="none"
          role={range ? 'img' : undefined}
          aria-label={range ? fill(copy.lastMinute, { low: String(range.low), high: String(range.high) }) : undefined}
          aria-hidden={range ? undefined : 'true'}
        >
          <defs>
            <linearGradient id="system-spark-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0" class="stop-top" />
              <stop offset="1" class="stop-bottom" />
            </linearGradient>
          </defs>
          <line class="floor" x1="0" y1={SPARK.height - 0.5} x2={SPARK.width} y2={SPARK.height - 0.5} vector-effect="non-scaling-stroke" />
          {#if spark.line}
            <path class="area" d={spark.area} fill="url(#system-spark-fill)" />
            <path class="line" d={spark.line} vector-effect="non-scaling-stroke" />
          {/if}
        </svg>
      </div>
    </div>

    <div class="memory" data-testid="system-memory">
      <p class="head">
        <span>{copy.memory}</span>
        <span class="amount numeric">
          {#if memoryUsed && sample}<span class="ink">{memoryUsed.value}<span class="unit">{memoryUsed.unit}</span></span> {fill(copy.of, { total: bytes(sample.memoryTotal) })}{:else}–{/if}
        </span>
      </p>
      <div class="meter" role="presentation"><span style:transform="scaleX({memoryShare / 100})"></span></div>
    </div>

    <div class="drives-scroll deck-scroll island-fade" data-testid="system-disks">
      <ul class="drives" aria-label={copy.disks}>
        {#each sample?.drives ?? [] as drive (drive.mount)}
          {@const used = percent(drive.total - drive.free, drive.total)}
          <li class:low={used >= 90}>
            <span class="drive" title={drive.label}><span class="mount">{drive.mount}</span>{#if drive.label}<span class="label">{drive.label}</span>{/if}</span>
            <span class="meter" role="presentation"><span style:transform="scaleX({used / 100})"></span></span>
            <span class="free numeric"><span class="ink">{fill(copy.free, { free: bytes(drive.free) })}</span> {fill(copy.of, { total: bytes(drive.total) })}</span>
          </li>
        {/each}
      </ul>
    </div>

    <div class="power" role="group" aria-label={copy.power} data-testid="system-power">
      {#if armedPower}
        {@const { action, icon: Icon } = armedPower}
        <div class="armed" role="group" aria-label={copy.ask[action]} data-testid="system-power-confirm">
          <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
          <span class="ask">{copy.ask[action]}</span>
          <button class="yes" {@attach focusNow} onclick={() => act(action)}>{copy.confirm}</button>
          <button class="no" onclick={() => confirm.cancel()}>{copy.cancel}</button>
        </div>
      {:else}
        {#each POWER as { action, icon: Icon } (action)}
          <button class="action" onclick={() => confirm.arm(`power:${action}`)} data-testid="system-power-{action}">
            <Icon size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>{copy.actions[action]}</span>
          </button>
        {/each}
      {/if}
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
              <button class="act" aria-label={fill(copy.close, { name })} title={fill(copy.close, { name })} onclick={() => confirm.arm(`proc:${proc.pid}`)} data-testid="system-close">
                <X size={15} />
              </button>
            {/if}
          {/if}
          <!-- Its share of the computer, a hairline under the row. -->
          <span class="share" aria-hidden="true"><span style:transform="scaleX({processShare(proc, sort, sample?.memoryTotal ?? 0)})"></span></span>
        </li>
      {/each}
    </ol>
    {#if failed && !sample}<p class="note">{copy.unavailable}</p>{/if}
    {#if problem}<p class="note problem" role="status">{problem}</p>{/if}
    <button class="slow" disabled={!sample} onclick={askWhySlow} data-testid="system-slow"><Sparkles size={15} />{copy.slow}</button>
  </Tile>
</div>

<style>
  /* The app's global button (a fixed height, a border, a glaze and a shadow) is not the deck's look. */
  button {
    height: auto;
    border: none;
    box-shadow: none;
  }
  .yes:hover:not(:disabled) {
    background: var(--deck-accent);
  }
  .tab {
    /* The hover of a button without its own: the deck's, not the app's glaze. */
    --control-glaze: none;
    --color-control-hover: var(--deck-tile-hover);
    display: grid;
    grid-template-columns: minmax(0, 1.7fr) minmax(0, 1fr);
    grid-template-areas: 'machine procs';
    gap: var(--deck-gap);
    color: var(--island-text);
    font-family: var(--island-font);
  }
  p {
    margin: 0;
  }
  .numeric {
    font-family: var(--deck-numeral-font);
    font-variant-numeric: tabular-nums;
  }
  .ink {
    color: var(--island-text);
  }
  .unit {
    margin-left: 0.15em;
    color: var(--island-muted);
    font-size: var(--deck-unit);
    letter-spacing: 0;
  }
  /* A label on the left, what goes with it on the right, both small. */
  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 12px;
    color: var(--island-muted);
    font-size: var(--deck-small);
    white-space: nowrap;
  }
  .uptime,
  .amount {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* The processor: the number, and its minute stretched beside it. */
  .cpu {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .reading {
    display: flex;
    align-items: flex-end;
    gap: 18px;
  }
  .big {
    flex: none;
    min-width: 2.2em;
    font-family: var(--deck-numeral-font);
    font-size: var(--deck-display);
    font-weight: var(--deck-display-weight);
    font-variant-numeric: tabular-nums;
    letter-spacing: var(--deck-display-tracking);
    line-height: 1;
    white-space: nowrap;
  }
  .spark {
    flex: 1;
    min-width: 0;
    height: 44px;
    overflow: visible;
  }
  .stop-top {
    stop-color: var(--deck-accent);
    stop-opacity: 0.3;
  }
  .stop-bottom {
    stop-color: var(--deck-accent);
    stop-opacity: 0;
  }
  .floor {
    stroke: var(--island-pill);
    stroke-width: 1;
  }
  .line {
    fill: none;
    stroke: var(--deck-accent);
    stroke-width: 1.75;
    stroke-linejoin: round;
    stroke-linecap: round;
  }

  /* The memory: used against all of it, on a fine meter. */
  .memory {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-top: 10px;
  }
  .amount .ink {
    font-size: var(--deck-title);
    font-weight: var(--deck-display-weight);
    letter-spacing: -0.01em;
  }
  .meter {
    display: block;
    height: 3px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--island-pill);
  }
  .meter span {
    display: block;
    height: 100%;
    border-radius: inherit;
    background: var(--deck-accent);
    transform-origin: left;
    transition: transform 0.5s ease;
  }

  /* The disks: a dense row each, the drive, a meter and what is free; the
     rows share their columns, so the meters line up. */
  .drives-scroll {
    --island-fade-gap: 0px;
    display: flex;
    flex-direction: column;
    max-height: 104px;
    margin-top: 10px;
  }
  .drives {
    display: grid;
    grid-template-columns: minmax(0, max-content) minmax(0, 1fr) max-content;
    align-items: center;
    gap: 2px 14px;
    margin: 0;
    padding: 0;
    color: var(--island-muted);
    font-size: var(--deck-small);
    list-style: none;
  }
  .drives li {
    display: contents;
  }
  .drive {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    min-height: 24px;
  }
  .mount {
    flex: none;
    color: var(--island-text);
    font-weight: 600;
  }
  .label {
    min-width: 0;
    max-width: 96px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .free {
    white-space: nowrap;
  }
  .drives li.low .meter span {
    background: var(--island-danger);
  }
  .drives li.low .free .ink {
    color: var(--island-danger);
  }

  /* The power: four quiet buttons in a row at the tile's foot; the one asked takes the row. */
  .power {
    display: grid;
    grid-template-columns: repeat(4, minmax(0, 1fr));
    gap: 4px;
    margin-top: auto;
    padding-top: 10px;
  }
  .action,
  .armed {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 7px;
    height: 34px;
    padding: 0 8px;
    border-radius: 10px;
    font: inherit;
    font-size: var(--deck-small);
  }
  .action {
    min-width: 0;
    background: transparent;
    color: var(--island-muted);
    cursor: pointer;
    transition: transform 0.12s ease, background-color 0.15s ease, color 0.15s ease;
  }
  .action span {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .action:hover {
    background: var(--deck-tile-hover);
    color: var(--island-text);
  }
  .armed {
    grid-column: 1 / -1;
    gap: 8px;
    padding: 0 4px 0 12px;
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
    animation: arm 0.22s cubic-bezier(0.34, 1.4, 0.64, 1);
  }
  @keyframes arm {
    from {
      opacity: 0;
      transform: scale(0.97);
    }
  }
  .ask {
    flex: 1;
    font-weight: 600;
  }
  .action:active,
  .yes:active,
  .no:active,
  .slow:active,
  .act:active {
    transform: scale(0.96);
  }
  .yes,
  .no {
    min-width: 0;
    padding: 4px 10px;
    border: none;
    border-radius: 999px;
    font: inherit;
    font-size: var(--deck-small);
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
    font-size: var(--deck-small);
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
    position: relative;
    display: flex;
    align-items: center;
    gap: 8px;
    height: 36px;
    padding: 0 4px 2px 10px;
    border-radius: 10px;
    font-size: var(--deck-body);
  }
  .procs li:hover,
  .procs li.armed {
    background: var(--deck-tile-hover);
  }
  /* The share: a hairline from the name's start, as long as its part of the whole. */
  .share {
    position: absolute;
    right: 10px;
    bottom: 4px;
    left: 10px;
    height: 2px;
  }
  .share span {
    display: block;
    height: 100%;
    min-width: 2px;
    border-radius: 1px;
    background: var(--deck-accent);
    opacity: 0.7;
    transform-origin: left;
    transition: transform 0.5s ease;
  }
  .procs li.armed .share {
    visibility: hidden;
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
  .act {
    display: grid;
    flex: none;
    place-items: center;
    width: 26px;
    height: 26px;
  }
  .guard {
    color: var(--island-muted);
  }
  .act {
    padding: 0;
    border: none;
    border-radius: 8px;
    background: transparent;
    color: var(--island-muted);
    cursor: pointer;
  }
  .act:hover {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .row-ask {
    display: flex;
    gap: 4px;
  }
  .note {
    color: var(--island-muted);
    font-size: var(--deck-small);
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
    font-size: var(--deck-body);
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
    .meter span,
    .share span,
    .action,
    .yes,
    .no,
    .slow,
    .act {
      transition: none;
    }
    .armed {
      animation: none;
    }
    button:active {
      transform: none !important;
    }
  }
</style>
