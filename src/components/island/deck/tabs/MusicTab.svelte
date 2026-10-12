<!--
  The deck's music tab: the track playing, larger than the side bubble's
  player. The cover, the title and the artist, the meter that moves with the
  sound, previous, play or pause and next, the timeline (a click or a drag
  moves the track), and the synced lyrics once the user turned them on
  (`music/MusicLyrics.svelte`, they send the title and the artist to
  LRCLIB). Nothing playing: a quiet tile, with Spotify to open where it
  played. The time moves once a second and the meter reads the sound only
  while the track plays.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import { MicVocal, Music2, Pause, Play, SkipBack, SkipForward, SquareArrowOutUpRight } from '@lucide/svelte';
  import { appName, canShow } from '../../../../lib/companion/media';
  import { writeCompanionPrefs } from '../../../../lib/companion/prefs';
  import { useView } from '../../../../lib/island/contract';
  import { fill, strings } from '../../../../lib/strings';
  import Marquee from '../../../companion/Marquee.svelte';
  import MusicLyrics from '../../music/MusicLyrics.svelte';
  import MusicMeter from '../../music/MusicMeter.svelte';
  import MusicTimeline from '../../music/MusicTimeline.svelte';
  import DeckTile from '../DeckTile.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const media = $derived(companion.media);
  const music = $derived(companion.music);
  const copy = strings.companion.media;
  const deck = strings.island.deck.music;

  const title = $derived(media ? media.title || appName(media.app) : '');
  const artist = $derived(media ? media.artist || appName(media.app) : '');
  const showable = $derived(media ? canShow(media.app) : music.knowsSpotify);

  // The meter reads the level only while the music plays.
  $effect(() => {
    const app = media?.app;
    if (!app || !media?.playing) return;
    return untrack(() => music.meter(app));
  });

  // The time moves once a second while the track plays.
  let now = $state(Date.now());
  $effect(() => {
    if (!media?.playing || !music.base) return;
    untrack(() => (now = Date.now()));
    const timer = setInterval(() => (now = Date.now()), 1000);
    return () => clearInterval(timer);
  });
  const duration = $derived(music.base?.duration ?? 0);
  const position = $derived(music.base ? music.position(now) : 0);

  const lyricsOn = $derived(companion.prefs.lyrics);
  $effect(() => {
    const [name, by] = [media?.title ?? '', media?.artist ?? ''];
    const wanted = lyricsOn && name !== '' && by !== '' && duration > 0;
    untrack(() => music.wantLyrics(wanted ? { title: name, artist: by, duration } : null));
  });
  function toggleLyrics() {
    companion.prefs = writeCompanionPrefs({ lyrics: !lyricsOn });
  }
</script>

<div class="music" class:empty={!media} data-testid="deck-tab-music">
  {#if media}
    <DeckTile area="player" testid="deck-player">
      <div class="player">
        <button class="cover" disabled={!showable} aria-label={fill(copy.show, { app: appName(media.app) })} title={fill(copy.show, { app: appName(media.app) })} onclick={() => companion.pressMediaKey('show')}>
          {#if media.art}
            <img src={media.art} alt="" />
          {:else}
            <Music2 size={44} strokeWidth={1.5} aria-hidden="true" />
          {/if}
        </button>
        <div class="track">
          <p class="app">{appName(media.app)}</p>
          <p class="title"><Marquee text={title} strong fade={16} /></p>
          <p class="artist"><Marquee text={artist} fade={16} /></p>
          <div class="meter"><MusicMeter levels={music.levels} count={16} playing={media.playing && music.measured} height={22} /></div>
          <MusicTimeline {position} {duration} seekable={media.seekable === true} onseek={(to) => companion.seekMedia(to)} />
          <div class="controls">
            <button class="round" aria-label={copy.previous} title={copy.previous} onclick={() => companion.pressMediaKey('previous')}><SkipBack size={17} fill="currentColor" /></button>
            <button class="round play" aria-label={media.playing ? copy.pause : copy.play} title={media.playing ? copy.pause : copy.play} onclick={() => companion.pressMediaKey('toggle')} data-testid="deck-music-play">
              {#if media.playing}<Pause size={20} fill="currentColor" />{:else}<Play size={20} fill="currentColor" />{/if}
            </button>
            <button class="round" aria-label={copy.next} title={copy.next} onclick={() => companion.pressMediaKey('next')}><SkipForward size={17} fill="currentColor" /></button>
          </div>
        </div>
      </div>
    </DeckTile>

    <DeckTile area="lyrics" heading={copy.lyrics} testid="deck-lyrics">
      {#snippet aside()}
        <button class="toggle" class:on={lyricsOn} aria-pressed={lyricsOn} aria-label={copy.lyrics} title={lyricsOn ? copy.lyricsHide : copy.lyricsShow} onclick={toggleLyrics} data-testid="deck-lyrics-toggle">
          <MicVocal size={13} strokeWidth={2.2} />
        </button>
      {/snippet}
      {#if lyricsOn && duration > 0}
        <div class="lyrics"><MusicLyrics lines={music.lyrics?.lines} base={music.base} /></div>
      {:else}
        <p class="quiet">{deck.lyricsOff}</p>
      {/if}
    </DeckTile>
  {:else}
    <DeckTile testid="deck-music-empty">
      <div class="nothing">
        <Music2 size={28} strokeWidth={1.5} aria-hidden="true" />
        <p class="title">{deck.empty}</p>
        <p class="quiet">{deck.emptyHint}</p>
        {#if showable}
          <button class="small" onclick={() => companion.pressMediaKey('show')}><SquareArrowOutUpRight size={13} />{copy.openSpotify}</button>
        {/if}
      </div>
    </DeckTile>
  {/if}
</div>

<style>
  .music {
    display: grid;
    grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
    grid-template-areas: 'player lyrics';
    gap: var(--deck-gap);
  }
  .music.empty {
    grid-template-columns: minmax(0, 1fr);
    grid-template-areas: none;
  }
  p {
    margin: 0;
  }
  .player {
    display: flex;
    gap: 18px;
    align-items: center;
  }
  .cover {
    flex: none;
    display: grid;
    place-items: center;
    width: 168px;
    height: 168px;
    padding: 0;
    overflow: hidden;
    border: none;
    border-radius: 14px;
    background: var(--deck-field);
    color: var(--island-muted);
    cursor: pointer;
  }
  .cover:disabled {
    cursor: default;
  }
  .cover img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
  .track {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 4px;
    min-width: 0;
  }
  .app {
    color: var(--island-muted);
    font-size: 12px;
  }
  .track .title {
    color: var(--island-text);
    font-size: 20px;
    line-height: 1.25;
  }
  .artist {
    color: var(--island-muted);
    font-size: 14px;
  }
  .meter {
    margin: 6px 0 2px;
    color: var(--deck-accent);
  }
  .controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    margin-top: 6px;
  }
  .round {
    display: grid;
    place-items: center;
    width: 38px;
    height: 38px;
    padding: 0;
    border: none;
    border-radius: 50%;
    background: var(--deck-field);
    color: var(--island-text);
    cursor: pointer;
    transition: transform 150ms ease;
  }
  .round:active {
    transform: scale(0.92);
  }
  .round.play {
    width: 48px;
    height: 48px;
    background: var(--deck-accent);
    color: var(--island-bg);
  }
  .toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    height: 24px;
    padding: 0 9px;
    border: none;
    border-radius: 999px;
    background: var(--deck-field);
    color: var(--island-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .toggle.on {
    background: var(--deck-accent-soft);
    color: var(--deck-accent-ink);
  }
  .cover:focus-visible,
  .round:focus-visible,
  .toggle:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 2px;
  }
  /* The player's two rows of lyrics, larger here. */
  .lyrics {
    display: flex;
    align-items: center;
    flex: 1;
    min-height: 120px;
    padding-left: 2px;
  }
  .lyrics > :global(*) {
    flex: 1;
    transform: scale(1.3);
    transform-origin: left center;
    max-width: calc(100% / 1.3);
  }
  .quiet {
    color: var(--island-muted);
    font-size: 12.5px;
    line-height: 1.45;
  }
  .nothing {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    padding: 34px 16px;
    color: var(--island-faint);
    text-align: center;
  }
  .nothing .title {
    color: var(--island-text);
    font-weight: 500;
  }
  .nothing .small {
    gap: 6px;
    margin-top: 6px;
  }
  @media (prefers-reduced-motion: reduce) {
    .round {
      transition: none;
    }
  }
</style>
