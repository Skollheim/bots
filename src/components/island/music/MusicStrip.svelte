<!--
  The music in the open island's tab bar, between the tabs and the tools: the
  cover (which opens Spotify), the meter, the title running by, and previous,
  play or pause, next. With nothing playing where Spotify played, a button
  that opens it. The music stays at hand at the top, open or not.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { Music2, Pause, Play, SkipBack, SkipForward } from '@lucide/svelte';
  import type { Companion } from '../../../lib/companion/companion.svelte';
  import { appName, canShow, type MediaAction } from '../../../lib/companion/media';
  import { fill, strings } from '../../../lib/strings';
  import Marquee from '../../companion/Marquee.svelte';
  import MusicMeter from './MusicMeter.svelte';

  let { companion }: { companion: Companion } = $props();

  const copy = strings.companion.media;
  const media = $derived(companion.media);
  const music = $derived(companion.music);

  $effect(() => {
    const app = media?.app;
    if (!app || !media?.playing || companion.senses.fullscreen || companion.senses.away) return;
    return untrack(() => music.meter(app));
  });

  const press = (action: MediaAction) => companion.pressMediaKey(action);
  const line = $derived(media ? [media.title || appName(media.app), media.artist].filter(Boolean).join(' · ') : '');
</script>

{#if media}
  <div class="strip" class:paused={!media.playing} style:--music-accent={music.accent ?? undefined} role="group" aria-label={copy.label} data-testid="island-music-strip">
    {#if canShow(media.app)}
      <button class="cover" aria-label={fill(copy.show, { app: appName(media.app) })} title={fill(copy.show, { app: appName(media.app) })} onclick={() => press('show')}>
        {#if media.art}<img src={media.art} alt="" />{:else}<Music2 size={12} />{/if}
      </button>
    {:else}
      <span class="cover">{#if media.art}<img src={media.art} alt="" />{:else}<Music2 size={12} />{/if}</span>
    {/if}
    <MusicMeter levels={music.levels} count={5} playing={media.playing && music.measured} height={12} />
    <span class="text"><Marquee text={line} /></span>
    <span class="buttons">
      <button aria-label={copy.previous} title={copy.previous} onclick={() => press('previous')}><SkipBack size={12} fill="currentColor" /></button>
      <button class="play" aria-label={media.playing ? copy.pause : copy.play} title={media.playing ? copy.pause : copy.play} onclick={() => press('toggle')}>
        {#if media.playing}<Pause size={12} fill="currentColor" />{:else}<Play size={12} fill="currentColor" />{/if}
      </button>
      <button aria-label={copy.next} title={copy.next} onclick={() => press('next')}><SkipForward size={12} fill="currentColor" /></button>
    </span>
  </div>
{:else if music.knowsSpotify}
  <button class="spotify" onclick={() => press('show')} data-testid="island-music-spotify">
    <Music2 size={13} />
    <span>{copy.openSpotify}</span>
  </button>
{/if}

<style>
  .strip {
    --music-accent: rgb(236 234 244);
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    max-width: 280px;
    height: 30px;
    padding: 0 3px 0 3px;
    border-radius: 999px;
    background: color-mix(in srgb, var(--music-accent) 9%, var(--island-pill));
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
  .cover {
    display: grid;
    flex: none;
    place-items: center;
    width: 24px;
    height: 24px;
    overflow: hidden;
    border-radius: 50%;
    background: var(--island-card);
    color: var(--island-muted);
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .paused .cover img {
    filter: saturate(0.4) brightness(0.8);
  }
  .text {
    flex: 1;
    min-width: 0;
    font-size: 12px;
  }
  .buttons {
    display: flex;
    flex: none;
    align-items: center;
  }
  .buttons button {
    display: grid;
    place-items: center;
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: var(--island-muted);
  }
  .buttons button:hover {
    color: var(--island-text);
  }
  .buttons .play {
    background: var(--island-text);
    color: var(--island-bg);
  }
  .buttons .play:hover {
    color: var(--island-bg);
  }
  .spotify {
    display: flex;
    align-items: center;
    gap: 6px;
    height: 28px;
    padding: 0 12px;
    border-radius: 999px;
    color: var(--island-muted);
    font-size: 12px;
  }
  .spotify:hover {
    background: var(--island-pill);
    color: var(--island-text);
  }
</style>
