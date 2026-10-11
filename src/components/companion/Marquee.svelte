<!--
  One line of text that scrolls when it is longer than its room, and stops
  at an ellipsis with reduced motion.
-->
<script lang="ts">
  /**
   * `fade`: the left fade's room, outside the text's, so that still, the
   * first letter shows whole. It reaches into the gap before the text: no
   * wider than that gap.
   */
  let { text, strong = false, fade = 8 }: { text: string; strong?: boolean; fade?: number } = $props();

  /** Space between the end of the text and its copy, in pixels. */
  const GAP = 28;
  /** Pixels a second. */
  const SPEED = 28;

  let room = $state(0);
  let width = $state(0);

  const moving = $derived(room > 0 && width > room - fade + 1);
  const shift = $derived(width + GAP);
</script>

<span class="marquee" class:strong class:moving style="--fade: {fade}px" bind:clientWidth={room}>
  <span class="track" style="--gap: {GAP}px; --shift: {-shift}px; --time: {(shift / SPEED + 2).toFixed(1)}s">
    <span class="copy" bind:offsetWidth={width}>{text}</span>
    {#if moving}<span class="copy again" aria-hidden="true">{text}</span>{/if}
  </span>
</span>

<style>
  .marquee {
    display: block;
    min-width: 0;
    margin-left: calc(var(--fade) * -1);
    padding-left: var(--fade);
    overflow: hidden;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  .strong {
    font-weight: 600;
  }
  .track {
    display: inline-flex;
  }
  /* A box, so its width can be measured. */
  .copy {
    display: inline-block;
  }
  .moving .track {
    animation: roll var(--time) linear infinite;
  }
  .moving {
    /* The text fades at the edges as it goes by: no cut, no ellipsis. Only
       the mask's alpha counts, so it stays opaque whatever the text's colour. */
    mask-image: linear-gradient(90deg, transparent, #000 var(--fade), #000 calc(100% - 18px), transparent);
    text-overflow: clip;
  }
  .again {
    padding-left: var(--gap);
  }
  /* A pause at the start, then one turn. */
  @keyframes roll {
    0%,
    18% {
      transform: translateX(0);
    }
    100% {
      transform: translateX(var(--shift));
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .track,
    .copy {
      display: inline;
    }
    .moving .track {
      animation: none;
    }
    .moving {
      mask-image: none;
      text-overflow: ellipsis;
    }
    .again {
      display: none;
    }
  }
</style>
