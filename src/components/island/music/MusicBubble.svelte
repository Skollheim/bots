<!--
  The music bubble: a small black drop beside the island's pill, the music's
  own (`lib/companion/music.svelte.ts`). Folded, the cover and a meter that
  moves with the sound, the track's progress along its bottom edge. Under the
  pointer or the keyboard it unfolds into the player: the cover (which opens
  Spotify), the title and the artist, the meter, previous, play or pause, and
  next, and the timeline, where a click or a drag moves the track
  (`MusicTimeline`). It wears the cover's colour. A sideways swipe skips a
  track. With nothing playing, it still opens Spotify where Spotify played.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { Music2, Pause, Play, SkipBack, SkipForward, SquareArrowOutUpRight } from '@lucide/svelte';
  import type { Companion } from '../../../lib/companion/companion.svelte';
  import { appName, canShow, type MediaAction } from '../../../lib/companion/media';
  import { inShell } from '../../../lib/companion/shell';
  import { fill, strings } from '../../../lib/strings';
  import Marquee from '../../companion/Marquee.svelte';
  import MusicMeter from './MusicMeter.svelte';
  import MusicTimeline from './MusicTimeline.svelte';

  interface Props {
    companion: Companion;
    /** The bubble changed size, for the page to send its hit areas again. */
    onresize: () => void;
    /** The room beside the island, up to the window's edge: the player fits in it. */
    room?: number;
  }

  let { companion, onresize, room = 276 }: Props = $props();

  const copy = strings.companion.media;
  /** The player's width when the room allows, and the least it takes. */
  const OPEN_WIDTH = 276;
  const OPEN_LEAST = 220;
  /** The pointer rests this long before the bubble unfolds, and leaves this long before it folds. */
  const ENTER_MS = 120;
  const LEAVE_MS = 320;
  /** A swipe this long skips a track, once until the swipe ends. */
  const SWIPE = 40;
  const SWIPE_REST_MS = 700;

  const media = $derived(companion.media);
  const music = $derived(companion.music);
  const showable = $derived(media ? canShow(media.app) : companion.music.knowsSpotify);

  let pointer = $state(false);
  let keyboard = $state(false);
  let pinned = $state(false);
  const open = $derived(media !== null && (pointer || keyboard || pinned));

  let hoverTimer: ReturnType<typeof setTimeout> | undefined;
  function enter() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => (pointer = true), ENTER_MS);
  }
  function leave() {
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => {
      pointer = false;
      pinned = false;
    }, LEAVE_MS);
  }
  $effect(() => () => clearTimeout(hoverTimer));

  // A click-through window does not see the pointer go: the shell's word wins.
  $effect(() => {
    if (inShell() && !companion.hover) {
      clearTimeout(hoverTimer);
      pointer = false;
      pinned = false;
    }
  });

  // The meter reads the level only while the music plays and someone can see it.
  $effect(() => {
    const app = media?.app;
    if (!app || !media?.playing || companion.senses.fullscreen || companion.senses.away) return;
    return untrack(() => music.meter(app));
  });

  // The time moves once a second while the track plays.
  let now = $state(Date.now());
  $effect(() => {
    if (!media?.playing || !music.base || companion.senses.fullscreen) return;
    now = Date.now();
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  const duration = $derived(music.base?.duration ?? 0);
  const position = $derived(music.base ? music.position(now) : 0);
  const progress = $derived(duration > 0 ? position / duration : 0);

  // The hit area follows the bubble: once at the change, once the change is drawn.
  $effect(() => {
    void [open, media === null];
    const read = setTimeout(onresize);
    return () => clearTimeout(read);
  });

  function press(action: MediaAction) {
    companion.pressMediaKey(action);
  }

  let swiped = 0;
  let swipeAt = 0;
  function wheel(event: WheelEvent) {
    if (!media || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
    const at = performance.now();
    if (at - swipeAt > SWIPE_REST_MS) swiped = 0;
    swipeAt = at;
    if (swiped === Infinity) return;
    swiped += event.deltaX;
    if (Math.abs(swiped) < SWIPE) return;
    press(swiped > 0 ? 'next' : 'previous');
    swiped = Infinity;
  }
</script>

{#if media || showable}
  <div
    class="bubble"
    class:open
    class:idle={!media}
    class:paused={media !== null && !media.playing}
    style:--music-accent={music.accent ?? undefined}
    style:--open-w="{Math.max(OPEN_LEAST, Math.min(OPEN_WIDTH, Math.floor(room)))}px"
    data-hit
    data-testid="island-music"
    role="group"
    aria-label={copy.label}
    onpointerenter={enter}
    onpointerleave={leave}
    onwheel={wheel}
    onfocusin={(event) => (keyboard = (event.target as HTMLElement).matches(':focus-visible'))}
    onfocusout={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) keyboard = false;
    }}
    ontransitionend={(event) => {
      if (event.target === event.currentTarget && event.propertyName === 'width') onresize();
    }}
  >
    {#if !media}
      <button class="fold" aria-label={copy.openSpotify} title={copy.openSpotify} onclick={() => press('show')} data-testid="island-music-spotify">
        <span class="note"><Music2 size={14} strokeWidth={2} /></span>
      </button>
    {:else if !open}
      <button class="fold" aria-expanded="false" aria-label={fill(copy.now, { title: media.title || appName(media.app), artist: media.artist })} onclick={() => (pinned = true)}>
        {#if media.art}<img class="thumb" src={media.art} alt="" />{:else}<span class="thumb blank"><Music2 size={12} /></span>{/if}
        <MusicMeter levels={music.levels} count={5} playing={media.playing && music.measured} height={14} />
      </button>
      {#if duration > 0}<span class="line" aria-hidden="true"><i style:transform="scaleX({progress.toFixed(4)})"></i></span>{/if}
    {:else}
      <div class="player">
        {#if showable}
          <button class="cover" aria-label={fill(copy.show, { app: appName(media.app) })} title={fill(copy.show, { app: appName(media.app) })} onclick={() => press('show')} data-testid="island-music-show">
            {#if media.art}<img src={media.art} alt="" />{:else}<span class="blank"><Music2 size={20} /></span>{/if}
            <span class="go" aria-hidden="true"><SquareArrowOutUpRight size={10} strokeWidth={2.4} /></span>
          </button>
        {:else}
          <span class="cover">{#if media.art}<img src={media.art} alt="" />{:else}<span class="blank"><Music2 size={20} /></span>{/if}</span>
        {/if}
        <div class="info">
          <span class="title"><Marquee text={media.title || appName(media.app)} strong /></span>
          <span class="artist"><Marquee text={media.artist || appName(media.app)} /></span>
          <div class="deck">
            <MusicMeter levels={music.levels} count={9} playing={media.playing && music.measured} height={16} />
            <span class="buttons">
              <button class="skip" aria-label={copy.previous} title={copy.previous} onclick={() => press('previous')} data-testid="island-music-previous"><SkipBack size={14} fill="currentColor" /></button>
              <button class="play" aria-label={media.playing ? copy.pause : copy.play} title={media.playing ? copy.pause : copy.play} onclick={() => press('toggle')} data-testid="island-music-toggle">
                {#if media.playing}<Pause size={14} fill="currentColor" />{:else}<Play size={14} fill="currentColor" />{/if}
              </button>
              <button class="skip" aria-label={copy.next} title={copy.next} onclick={() => press('next')} data-testid="island-music-next"><SkipForward size={14} fill="currentColor" /></button>
            </span>
          </div>
        </div>
        {#if duration > 0}
          <MusicTimeline {position} {duration} seekable={media.seekable === true} onseek={(to) => companion.seekMedia(to)} />
        {/if}
      </div>
    {/if}
  </div>
{/if}

<style>
  .bubble {
    --music-accent: rgb(236 234 244);
    position: relative;
    width: 68px;
    height: 32px;
    overflow: hidden;
    border-radius: 0 0 16px 16px;
    background: var(--island-bg);
    color: var(--island-text);
    transition:
      width 300ms cubic-bezier(0.2, 0.9, 0.3, 1.1),
      height 300ms cubic-bezier(0.2, 0.9, 0.3, 1.1),
      border-radius 300ms ease;
    animation: bud 420ms cubic-bezier(0.2, 0.9, 0.3, 1.25);
  }
  .bubble.idle {
    width: 40px;
  }
  .bubble.open {
    width: var(--open-w);
    height: 116px;
    border-radius: 0 0 24px 24px;
    background:
      radial-gradient(150px 110px at 44px 44px, color-mix(in srgb, var(--music-accent) 24%, transparent), transparent 72%),
      var(--island-bg);
  }
  button {
    padding: 0;
    border: none;
    background: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
  }
  button:focus-visible {
    outline: 2px solid var(--music-accent);
    outline-offset: 1px;
  }

  /* Folded: the cover and the meter. */
  .fold {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    height: 100%;
    padding: 0 10px 0 6px;
  }
  .idle .fold {
    justify-content: center;
    padding: 0;
  }
  .note {
    display: grid;
    place-items: center;
    color: var(--island-muted);
  }
  .idle .fold:hover .note {
    color: var(--island-text);
  }
  .thumb {
    flex: none;
    width: 22px;
    height: 22px;
    border-radius: 6px;
    object-fit: cover;
    box-shadow: 0 0 0 1px rgb(255 255 255 / 0.08);
  }
  .blank {
    display: grid;
    place-items: center;
    background: var(--island-pill);
    color: var(--island-muted);
  }
  .paused .thumb {
    filter: saturate(0.4) brightness(0.8);
  }
  .line {
    position: absolute;
    right: 12px;
    bottom: 3px;
    left: 12px;
    height: 2px;
    overflow: hidden;
    border-radius: 1px;
    background: rgb(255 255 255 / 0.1);
    pointer-events: none;
  }
  .line i {
    display: block;
    width: 100%;
    height: 100%;
    background: var(--music-accent);
    transform-origin: left;
  }

  /* Unfolded: the player. */
  .player {
    display: grid;
    grid-template-columns: 60px minmax(0, 1fr);
    column-gap: 12px;
    row-gap: 9px;
    width: var(--open-w);
    padding: 10px 14px 10px 12px;
    animation: appear 220ms 60ms ease-out both;
  }
  .cover {
    position: relative;
    display: block;
    width: 60px;
    height: 60px;
    border-radius: 12px;
    box-shadow: 0 6px 20px color-mix(in srgb, var(--music-accent) 30%, transparent);
  }
  .cover img,
  .cover .blank {
    display: grid;
    width: 100%;
    height: 100%;
    border-radius: 12px;
    object-fit: cover;
  }
  .paused .cover img {
    filter: saturate(0.5) brightness(0.85);
  }
  .go {
    position: absolute;
    right: 3px;
    bottom: 3px;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    border-radius: 5px;
    background: rgb(0 0 0 / 0.6);
    color: #fff;
    opacity: 0.75;
    transition: opacity 160ms ease;
  }
  .cover:hover .go,
  .cover:focus-visible .go {
    opacity: 1;
  }
  .info {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .title {
    font-size: 13px;
    line-height: 17px;
  }
  .artist {
    color: var(--island-muted);
    font-size: 12px;
    line-height: 16px;
  }
  .deck {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    margin-top: 5px;
  }
  .buttons {
    display: flex;
    align-items: center;
    gap: 2px;
  }
  .skip {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    color: var(--island-text);
    opacity: 0.85;
  }
  .skip:hover {
    background: var(--island-pill);
    opacity: 1;
  }
  .play {
    display: grid;
    place-items: center;
    width: 30px;
    height: 30px;
    border-radius: 50%;
    background: var(--island-text);
    color: var(--island-bg);
    transition: transform 140ms ease;
  }
  .play:hover {
    transform: scale(1.06);
  }
  .play:active {
    transform: scale(0.94);
  }

  @keyframes bud {
    from {
      opacity: 0;
      transform: translateX(-18px) scale(0.4);
    }
  }
  @keyframes appear {
    from {
      opacity: 0;
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .bubble,
    .player {
      transition: none;
      animation: none;
    }
  }
</style>
