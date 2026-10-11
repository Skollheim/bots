<!--
  The open player's synced lyrics (`lib/companion/music-lyrics.ts`): the line
  sung now, bright, and the next one dimmed under it. When the line changes
  the two roll up a row, the old one fading out above; a seek jumps without
  rolling. An instrumental break shows a quiet note. One timer waits for the
  next line, only while the track plays: nothing runs between two lines.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { fade } from 'svelte/transition';
  import { positionAt, type MusicBase } from '../../../lib/companion/music';
  import { lineAt, nextChangeAt, type LyricLine } from '../../../lib/companion/music-lyrics';
  import { strings } from '../../../lib/strings';

  interface Props {
    /** The track's lines; null when it has none, undefined while they are asked. */
    lines: LyricLine[] | null | undefined;
    /** Where the track is, as the player's clock counts it. */
    base: MusicBase | null;
  }

  let { lines, base }: Props = $props();

  const copy = strings.companion.media;
  /** A line's height: the rows roll by this much. */
  const ROW = 17;
  /** The timer wakes this much after the next line starts, never just before it. */
  const LATE_MS = 30;

  // A seek, a pause or another track: the clock is read again.
  let now = $state(Date.now());
  $effect.pre(() => {
    void [base, lines];
    untrack(() => (now = Date.now()));
  });
  const index = $derived(lines ? lineAt(lines, positionAt(base, now)) : -1);

  // One timer to the next line, while the track plays.
  $effect(() => {
    if (!lines || !base?.playing) return;
    const position = positionAt(base, now);
    const next = nextChangeAt(lines, position);
    if (next === null) return;
    const timer = setTimeout(() => (now = Date.now()), next - position + LATE_MS);
    return () => clearTimeout(timer);
  });

  // The rows roll for the next line only; any other change (a seek, a jump back) shows at once.
  let last = -1;
  let rolling = $state(false);
  $effect.pre(() => {
    const at = index;
    untrack(() => {
      rolling = at === last + 1;
      last = at;
    });
  });

  /** The line gone, the line sung, the next one. */
  const shown = $derived(lines ? [index - 1, index, index + 1].filter((at) => at >= 0 && at < lines.length) : []);
</script>

<div class="lyrics" data-testid="island-music-lyrics">
  {#if lines === null}
    <span class="none" in:fade={{ duration: 200 }}>{copy.lyricsNone}</span>
  {:else if lines}
    {#key lines}
      <div class="roll" class:still={!rolling} style:transform="translateY({-Math.max(0, index) * ROW}px)" in:fade={{ duration: 200 }}>
        {#each shown as at (at)}
          {@const text = lines[at]!.text}
          <span class="line" class:current={at === index} class:past={at < index} class:gap={!text} style:top="{at * ROW}px" aria-hidden={at < index} in:fade={{ duration: 220 }}>{text || '♪'}</span>
        {/each}
      </div>
    {/key}
  {/if}
</div>

<style>
  .lyrics {
    position: relative;
    display: grid;
    grid-column: 1 / -1;
    height: 34px;
    margin: -3px 0 -2px;
    overflow: hidden;
  }
  .roll {
    position: relative;
    grid-area: 1 / 1;
    transition: transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1.12);
  }
  .roll.still {
    transition: none;
  }
  .line {
    position: absolute;
    right: 0;
    left: 0;
    height: 17px;
    overflow: hidden;
    color: var(--island-text);
    font-size: 13px;
    font-weight: 600;
    line-height: 17px;
    text-overflow: ellipsis;
    white-space: nowrap;
    /* The next line, dimmed and a little smaller: AA on black, and on a bright backdrop (`--lyric-dim`). */
    opacity: var(--lyric-dim, 0.62);
    transform: scale(0.94);
    transform-origin: left center;
    transition:
      opacity 300ms ease,
      transform 420ms cubic-bezier(0.2, 0.9, 0.3, 1.12);
  }
  .current {
    opacity: 1;
    transform: none;
  }
  .past {
    opacity: 0;
  }
  .gap {
    color: var(--island-muted);
  }
  .none {
    grid-area: 1 / 1;
    align-self: center;
    color: var(--island-muted);
    font-size: 11.5px;
    line-height: 14px;
  }
  @media (prefers-reduced-motion: reduce) {
    .roll {
      transition: none;
    }
    .line {
      transition: opacity 200ms ease;
    }
  }
</style>
