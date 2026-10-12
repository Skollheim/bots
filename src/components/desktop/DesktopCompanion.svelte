<!--
  The companion set loose on the desktop: the characters where the user
  dropped them, their HUD, their replies, what they have to tell, the music
  they hear and, once opened, the sheet with the field to ask the one clicked
  something and the requests agents are waiting on. "Back to the island", in
  the sheet, puts them back at the top of the screen; so does dragging them
  against its top edge.
-->
<script lang="ts">
  import { tick } from 'svelte';
  import { PanelTop } from '@lucide/svelte';
  import type { Companion } from '../../lib/companion/companion.svelte';
  import { writeCompanionPrefs } from '../../lib/companion/prefs';
  import { inShell, showMain, type CompanionLayout } from '../../lib/companion/shell';
  import { strings } from '../../lib/strings';
  import CompanionAsk from '../companion/CompanionAsk.svelte';
  import CompanionAttachments from '../companion/CompanionAttachments.svelte';
  import CompanionCrew from '../companion/CompanionCrew.svelte';
  import CompanionFocusCards from '../companion/CompanionFocusCards.svelte';
  import CompanionFound from '../companion/CompanionFound.svelte';
  import CompanionHistory from '../companion/CompanionHistory.svelte';
  import CompanionHud from '../companion/CompanionHud.svelte';
  import CompanionNotes from '../companion/CompanionNotes.svelte';
  import CompanionPanel from '../companion/CompanionPanel.svelte';
  import CompanionRadar from '../companion/CompanionRadar.svelte';
  import CompanionMissionCards from '../companion/CompanionMissionCards.svelte';
  import CompanionTaskCards from '../companion/CompanionTaskCards.svelte';
  import CompanionTimer from '../companion/CompanionTimer.svelte';
  import CompanionTools from '../companion/CompanionTools.svelte';
  import MediaPill from '../companion/MediaPill.svelte';

  interface Props {
    companion: Companion;
    layout: CompanionLayout;
    /** What shows changed: the page sends its hit areas again. */
    onresize: () => void;
  }

  let { companion, layout, onresize }: Props = $props();

  // The music pill outlives the pointer a little: crossing the gap between the
  // character, the quotas and the pill must not take it away.
  const MEDIA_LINGER = 900;
  let mediaShown = $state(false);
  let hudOpen = $state(false);
  $effect(() => {
    if (companion.open || companion.hover) {
      mediaShown = true;
      return;
    }
    const hide = setTimeout(() => (mediaShown = false), MEDIA_LINGER);
    return () => clearTimeout(hide);
  });

  const open = (threadId: string) => void showMain(threadId);
  const { notes, timer, focus, attached, tasks } = $derived(companion);

  $effect(() => {
    void [companion.open, companion.members.length, companion.talks.map((talk) => [talk.shown, talk.phase]), companion.media, mediaShown, notes.notices, notes.alarms, companion.mood.blocking, layout, hudOpen, timer.phase, focus.recap, focus.active, companion.history, attached.held, attached.over, attached.reading, attached.problem, tasks.pending, tasks.launched, companion.missions.pending];
    void tick().then(() => requestAnimationFrame(onresize));
  });
</script>

<div class="column" data-align={layout.align} data-edge={layout.edge}>
  <CompanionCrew
    members={companion.members}
    active={companion.active.id}
    open={companion.open}
    {layout}
    look={companion.look}
    mood={companion.mood.mood}
    busy={companion.mood.busy}
    alarm={notes.alarms.length > 0}
    blocking={companion.mood.blocking}
    cheering={companion.reactions.cheering}
    burst={companion.reactions.cheer}
    boings={companion.boings}
    dizzy={companion.dizzy}
    pointer={companion.senses.pointer}
    dragging={companion.dragging}
    onpick={(id) => companion.pick(id)}
    onpress={(event) => companion.onpress(event)}
    onmove={companion.onmove}
    onrelease={companion.onrelease}
    onenter={() => (companion.pointerOn = true)}
    onleave={() => {
      companion.pointerOn = false;
      if (!inShell()) companion.talks.forEach((talk) => talk.hold());
    }}
  >
    <CompanionHud
      threads={companion.threads}
      projects={companion.projects}
      own={companion.ownThreads}
      gauges={companion.gauges}
      hover={companion.hover}
      reachable={companion.reachable}
      {layout}
      bind:expanded={hudOpen}
      onopen={open}
      {onresize}
    />
    <CompanionTimer {timer} hover={companion.hover} {onresize} />
  </CompanionCrew>

  {#if companion.media && mediaShown}
    <div data-hit><MediaPill media={companion.media} oncontrol={(action) => companion.pressMediaKey(action)} /></div>
  {/if}

  <CompanionNotes members={companion.members} {notes} open={companion.open} reachable={companion.reachable} />
  {#if companion.finder.searching || companion.finder.found !== null}
    <CompanionFound finder={companion.finder} onopen={open} />
  {/if}
  {#if companion.radar.shown && !companion.open}
    <CompanionRadar radar={companion.radar} onopen={open} onreply={(threadId, text) => companion.replyFromRadar(threadId, text)} />
  {/if}
  <CompanionFocusCards {timer} {focus} onopen={open} />
  <CompanionTaskCards {tasks} onopen={open} />

  {#if companion.open}
    <section class="sheet" data-hit>
      <CompanionAsk
        bind:draft={companion.draft}
        thinking={companion.active.talk.thinking || companion.sending}
        canSee={inShell()}
        screens={companion.screens}
        scope={companion.prefs.screenScope}
        onask={(screen) => void companion.ask(screen)}
        onscope={(screenScope) => (companion.prefs = writeCompanionPrefs({ screenScope }))}
        onstop={() => void companion.active.talk.stop()}
        onsettings={() => void showMain(null)}
        to={companion.members.length > 1 ? companion.active.name : null}
      />
      <CompanionAttachments dropped={attached} />
      <CompanionTools {timer} {focus} workMinutes={companion.prefs.workMinutes} breakMinutes={companion.prefs.breakMinutes} bind:history={companion.history} onstart={() => companion.startTimer()} />
      {#if companion.history}
        <CompanionHistory snapshot={companion.crew.snapshot} agentId={companion.active.id} onpick={(exchange) => companion.active.talk.recall(exchange.reply)} />
      {/if}
      <CompanionPanel
        threads={companion.threads}
        projects={companion.projects}
        permissions={companion.permissions}
        questions={companion.questions}
        mood={companion.mood}
        own={companion.ownThreads}
        onact={(action) => companion.act(action)}
      />
      <button class="ghost small dock" onclick={() => companion.dock()} data-testid="companion-dock"><PanelTop size={13} />{strings.island.dock}</button>
    </section>
  {/if}
</div>

<style>
  .column {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    min-height: 0;
    max-height: 100%;
  }
  /* Near the bottom of the screen, what it shows opens upwards. */
  .column[data-edge='bottom'] {
    flex-direction: column-reverse;
  }
  .column[data-align='left'] {
    align-items: flex-start;
  }
  .column[data-align='right'] {
    align-items: flex-end;
  }

  .sheet {
    display: flex;
    flex-direction: column;
    width: 380px;
    min-height: 0;
    max-height: calc(100dvh - 110px);
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    box-shadow: var(--shadow-e2);
    overflow: hidden;
    animation: rise var(--dur-2) var(--ease-out-quint);
  }
  .sheet > :global(.panel) {
    flex: 1;
    min-height: 0;
  }
  .dock {
    flex: none;
    align-self: flex-start;
    gap: 6px;
    margin: 0 8px 8px;
    color: var(--color-muted-foreground);
  }

  @keyframes rise {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
  }
</style>
