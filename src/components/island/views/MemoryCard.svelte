<!--
  The memory warning over the island's view, before Boite's memory guard stops
  something: what is near its limit, how near, the conversation holding the
  most, and a button that stops it (`resources.killTree`, as Boite's task
  manager does). Ignore sets the warning aside until another conversation is
  the cause. Once the guard stopped a process itself, a line says which.
-->
<script lang="ts">
  import { MemoryStick, X } from '@lucide/svelte';
  import { useView } from '../../../lib/island/contract';
  import { sizeText, type Pressure } from '../../../lib/island/pressure';
  import { fill, strings } from '../../../lib/strings';

  const view = useView();
  const memory = $derived(view.memory);
  const copy = strings.island.memory;
  /** Past this share of the limit, the bar turns red. */
  const RED_SHARE = 0.95;

  const size = (bytes: number) => sizeText(bytes, copy);
  const named = (title: string) => title || copy.agent;
  const warning = $derived(memory.warning);
  const stopped = $derived(memory.stopped);

  function title(pressure: Pressure): string {
    return pressure.reason === 'thread' ? fill(copy.title.thread, { title: named(pressure.title) }) : copy.title[pressure.reason];
  }

  /** How full the measured limit is, for the bar; the free memory has none. */
  const share = $derived(warning && warning.reason !== 'machine' && warning.limit > 0 ? Math.min(1, warning.used / warning.limit) : null);

  function stop(threadId: string) {
    const client = view.core.client;
    if (client) void memory.stop(client, threadId, (reason) => fill(copy.failed, { reason }));
  }
</script>

{#if warning}
  <section class="memory" class:red={warning.reason === 'machine' || (share ?? 0) >= RED_SHARE} role="alert" data-testid="island-memory" data-reason={warning.reason}>
    <span class="icon" aria-hidden="true"><MemoryStick size={15} strokeWidth={2} /></span>
    <div class="body">
      <p class="title">{title(warning)}</p>
      <p class="numbers">
        <span>{fill(copy.used[warning.reason], { used: size(warning.used), limit: size(warning.limit) })}</span>
        {#if share !== null}<span class="bar" aria-hidden="true"><span class="fill" style:transform="scaleX({share})"></span></span>{/if}
      </p>
      {#if warning.reason !== 'thread' && warning.threadId}
        <p class="culprit">{fill(copy.culprit, { title: named(warning.title), size: size(warning.bytes) })}</p>
      {/if}
      {#if warning.threadId}<p class="next">{copy.next}</p>{/if}
      {#if memory.problem}<p class="problem" role="alert">{memory.problem}</p>{/if}
      <div class="actions">
        <button class="button ghost" onclick={() => memory.ignore()} data-testid="memory-ignore">{copy.ignore}</button>
        {#if warning.threadId}
          {@const threadId = warning.threadId}
          <button class="button primary" disabled={memory.stopping || !view.core.client} title={copy.stopTitle} onclick={() => stop(threadId)} data-testid="memory-stop">
            {memory.stopping ? copy.stopping : copy.stop}
          </button>
        {/if}
      </div>
    </div>
  </section>
{:else if stopped}
  <section class="memory quiet" role="status" data-testid="island-memory-stopped">
    <span class="icon" aria-hidden="true"><MemoryStick size={15} strokeWidth={2} /></span>
    <p class="body said">
      {stopped.threadId
        ? fill(copy.stopped, { program: stopped.program || copy.process, title: named(stopped.title), size: size(stopped.bytes) })
        : fill(copy.stoppedAlone, { program: stopped.program || copy.process, size: size(stopped.bytes) })}
    </p>
    <button class="close" aria-label={copy.close} title={copy.close} onclick={() => memory.dismissStopped()}><X size={13} strokeWidth={2} /></button>
  </section>
{/if}

<style>
  .memory {
    --tone: var(--island-attention);
    display: flex;
    flex: none;
    gap: 10px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--tone) 45%, transparent);
    border-radius: 14px;
    background: linear-gradient(color-mix(in srgb, var(--tone) 10%, transparent), color-mix(in srgb, var(--tone) 3%, transparent) 64px), var(--island-card);
    animation: arrive 320ms ease-out;
  }
  .memory.red {
    --tone: var(--island-danger);
  }
  .memory.quiet {
    --tone: var(--island-muted);
    align-items: center;
    border-color: var(--island-line-strong);
    background: var(--island-card);
  }
  .icon {
    display: grid;
    flex: none;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: color-mix(in srgb, var(--tone) 16%, transparent);
    color: var(--tone);
  }
  .body {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
    margin: 0;
  }
  p {
    margin: 0;
  }
  .title {
    font-weight: 600;
    line-height: 26px;
  }
  .numbers {
    display: flex;
    align-items: center;
    gap: 10px;
    color: var(--island-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  .bar {
    flex: 1;
    max-width: 180px;
    height: 4px;
    overflow: hidden;
    border-radius: 2px;
    background: var(--island-pill);
  }
  .fill {
    display: block;
    height: 100%;
    background: var(--tone);
    transform-origin: left;
    transition: transform 400ms ease-out;
  }
  .culprit {
    font-size: 12px;
  }
  .next,
  .said {
    color: var(--island-muted);
    font-size: 12px;
  }
  .problem {
    color: var(--island-danger);
    font-size: 12px;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    gap: 6px;
    margin-top: 2px;
  }
  .button {
    height: 28px;
    padding: 0 12px;
    border: 1px solid var(--island-line-strong);
    border-radius: 999px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 12px;
    font-weight: 500;
    cursor: pointer;
  }
  .button:hover:not(:disabled) {
    background: var(--island-pill);
  }
  .button:disabled {
    cursor: default;
    opacity: 0.55;
  }
  .button.primary {
    border-color: transparent;
    background: var(--tone);
    color: var(--island-attention-ink);
  }
  .button.primary:hover:not(:disabled) {
    background: var(--tone);
    filter: brightness(1.08);
  }
  .close {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: none;
    color: var(--island-muted);
    cursor: pointer;
  }
  .close:hover {
    background: var(--island-pill);
    color: var(--island-text);
  }
  .button:focus-visible,
  .close:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .memory {
      animation: none;
    }
    .fill {
      transition: none;
    }
  }
</style>
