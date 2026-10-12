<!--
  The recap when the user comes back to the keyboard (`lib/island/away.ts`):
  how long they were away, then one line per thing that happened, each one
  opening what it tells (a thread in Boite, or the island's Home). "OK", or
  Escape, puts the card away.
-->
<script lang="ts">
  import { Bell, CircleCheck, CircleX, Clock, Gauge, GitPullRequest, MemoryStick, Sunrise } from '@lucide/svelte';
  import type { AwayIcon, AwayLine } from '../../../lib/island/away';
  import { fill, strings } from '../../../lib/strings';

  interface Props {
    lines: readonly AwayLine[];
    /** How long the user was away, as read (`awaySpan`). */
    span: string;
    onopen: (line: AwayLine) => void;
    ondismiss: () => void;
  }

  let { lines, span, onopen, ondismiss }: Props = $props();

  const copy = strings.island.away;
  const ICONS: Record<AwayIcon, typeof Clock> = {
    waiting: Clock,
    finished: CircleCheck,
    failed: CircleX,
    pr: GitPullRequest,
    alarm: Bell,
    quota: Gauge,
    memory: MemoryStick
  };

  function onkey(event: KeyboardEvent) {
    if (event.key !== 'Escape' || event.ctrlKey || event.altKey || event.metaKey) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    if (target && (target.isContentEditable || ['INPUT', 'TEXTAREA'].includes(target.tagName))) return;
    // The island's own Escape (it closes) waits behind the card's.
    event.preventDefault();
    event.stopPropagation();
    ondismiss();
  }
</script>

<svelte:window onkeydowncapture={onkey} />

<section class="away" role="status" aria-labelledby="away-title" data-testid="island-away">
  <header>
    <span class="icon" aria-hidden="true"><Sunrise size={15} strokeWidth={2} /></span>
    <p class="title" id="away-title">{copy.title}</p>
    <span class="span">{fill(copy.gone, { span })}</span>
  </header>
  <ul aria-label={copy.lines}>
    {#each lines as line (line.key)}
      {@const Icon = ICONS[line.icon]}
      <li data-tone={line.tone}>
        {#if line.target}
          <button class="line" title={copy.open} onclick={() => onopen(line)} data-testid="away-line">
            <Icon size={14} strokeWidth={2} aria-hidden="true" />
            <span class="text">{line.text}</span>
          </button>
        {:else}
          <span class="line still" data-testid="away-line">
            <Icon size={14} strokeWidth={2} aria-hidden="true" />
            <span class="text">{line.text}</span>
          </span>
        {/if}
      </li>
    {/each}
  </ul>
  <div class="actions">
    <button class="button primary" title={copy.okTitle} onclick={ondismiss} data-testid="away-ok">{copy.ok}</button>
  </div>
</section>

<style>
  .away {
    --tone: var(--island-talking);
    display: flex;
    flex: none;
    flex-direction: column;
    gap: 6px;
    padding: 10px 12px;
    border: 1px solid color-mix(in srgb, var(--tone) 40%, transparent);
    border-radius: 14px;
    background: linear-gradient(color-mix(in srgb, var(--tone) 10%, transparent), color-mix(in srgb, var(--tone) 3%, transparent) 64px), var(--island-card);
    box-shadow: var(--island-card-edge);
    animation: arrive 320ms ease-out;
  }
  header {
    display: flex;
    align-items: center;
    gap: 10px;
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
  p {
    margin: 0;
  }
  .title {
    flex: 1;
    min-width: 0;
    font-weight: 600;
  }
  .span {
    flex: none;
    color: var(--island-muted);
    font-size: 12px;
    font-variant-numeric: tabular-nums;
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0;
    padding: 0 0 0 30px;
    list-style: none;
  }
  li {
    --line: var(--island-attention);
  }
  li[data-tone='done'] {
    --line: var(--island-done);
  }
  li[data-tone='failed'] {
    --line: var(--island-danger);
  }
  li[data-tone='muted'] {
    --line: var(--island-muted);
  }
  .line {
    display: flex;
    align-items: center;
    justify-content: flex-start;
    gap: 8px;
    width: 100%;
    min-height: 26px;
    padding: 3px 8px;
    border: none;
    border-radius: 8px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 12px;
    text-align: left;
  }
  .line :global(svg) {
    flex: none;
    color: var(--line);
  }
  button.line {
    cursor: pointer;
  }
  button.line:hover {
    background: var(--island-pill);
  }
  .text {
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .actions {
    display: flex;
    justify-content: flex-end;
    margin-top: 2px;
  }
  .button {
    height: 28px;
    padding: 0 16px;
    border: 1px solid transparent;
    border-radius: 999px;
    background: var(--tone);
    /* Dark on the violet: white on it would not read (AA). */
    color: var(--island-attention-ink);
    font: inherit;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
  }
  .button:hover {
    filter: brightness(1.08);
  }
  .line:focus-visible,
  .button:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
  .button:focus-visible {
    outline-color: var(--island-text);
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .away {
      animation: none;
    }
  }
</style>
