<!--
  The deck's top-left character: the agent the Chat talks to, drawn as it
  stands on the island (its family's character, moved by the same mood). A
  click turns it to the next of the user's agents, round to the first: the
  face swipes out to the left as the next one comes in from the right, its
  name riding along for a moment, and the Chat talks to that one at once
  (`assistant.pick` keeps it for the next launch). With one agent, a click
  pokes it as before. It never comes out of the island by a drag.
-->
<script lang="ts">
  import { cubicOut } from 'svelte/easing';
  import type { Companion, Member } from '../../../lib/companion/companion.svelte';
  import { unlockSounds } from '../../../lib/companion/sounds';
  import { gazeOf, moodOf } from '../../../lib/island/face';
  import { islandMember, islandSkin, nextAgent } from '../../../lib/island/swap';
  import { fill, strings } from '../../../lib/strings';
  import CompanionCharacter from '../../companion/CompanionCharacter.svelte';

  interface Props {
    companion: Companion;
    lead: Member;
    cheering: boolean;
    reduced: boolean;
  }

  let { companion, lead, cheering, reduced }: Props = $props();

  /** How long the name stays beside the face after a swap. */
  const NAME_MS = 1600;
  /** How far a face slides as it comes or goes, in pixels. */
  const SLIDE = 22;

  const copy = strings.island;
  const assistant = $derived(companion.assistant);
  const placed = $derived(assistant.placed);
  const next = $derived(nextAgent(assistant.agents, placed?.key ?? null));

  // The Chat's agent; before the agents are read, the character standing.
  const shown = $derived.by(() => {
    if (!placed) return { key: companion.active.id, name: companion.active.name, skin: companion.active.skin, member: companion.active };
    const first = assistant.agents[0]?.key ?? null;
    const member = islandMember(placed, companion.members, first);
    return { key: placed.key, name: placed.profile.name, skin: islandSkin(placed, companion.members, first), member };
  });
  const leader = $derived(shown.member?.id === lead.id);
  const name = $derived(shown.name ?? copy.label);
  const label = $derived(next ? fill(copy.agentSwap.label, { name, next: next.profile.name }) : fill(copy.robot, { name }));

  let button = $state<HTMLButtonElement | null>(null);
  /** A swap the user asked for is playing: only that one slides. */
  let swiping = $state(false);
  /** The name shown beside the face after a swap. */
  let said = $state<string | null>(null);
  let swipeTimer: ReturnType<typeof setTimeout> | undefined;
  let nameTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => () => {
    clearTimeout(swipeTimer);
    clearTimeout(nameTimer);
  });

  function click() {
    // Read once: `next` moves on as soon as the Chat turns.
    const to = next;
    if (!to) return companion.poke(shown.key);
    swiping = true;
    said = to.profile.name;
    assistant.pick(to.key);
    companion.bounce(to.key);
    clearTimeout(swipeTimer);
    clearTimeout(nameTimer);
    swipeTimer = setTimeout(() => (swiping = false), 400);
    nameTimer = setTimeout(() => (said = null), NAME_MS);
  }

  /** A face sliding in from `from` pixels, or out to them; still when reduced or not a swap. */
  function slide(_node: Element, { from }: { from: number }) {
    const moving = swiping && !reduced;
    return { duration: moving ? 280 : 0, easing: cubicOut, css: (t: number, u: number) => `transform: translateX(${(u * from).toFixed(1)}px); opacity: ${t}` };
  }
</script>

<div class="agent">
  <button
    bind:this={button}
    class="character"
    aria-label={label}
    title={next ? fill(copy.agentSwap.tip, { next: next.profile.name }) : (shown.name ?? undefined)}
    data-testid="island-robot"
    data-agent={shown.key}
    onclick={click}
    onpointerdown={unlockSounds}
  >
    <span class="stack">
      {#key shown.key}
        <span class="slot" in:slide={{ from: SLIDE }} out:slide={{ from: -SLIDE }}>
          <!-- Its eyes follow the pointer while it is on the island, and it cheers when any thread finishes. -->
          <CompanionCharacter
            mood={moodOf(companion, (shown.member?.talk.thinking ?? false) || (!leader && assistant.running), leader)}
            busy={leader && companion.mood.busy}
            alarm={companion.notes.alarms.length > 0}
            cheer={cheering}
            boing={companion.boings[shown.key] ?? 0}
            dizzy={companion.dizzy[shown.key] ?? false}
            gaze={companion.pointerOn ? gazeOf(companion, button) : null}
            skin={shown.skin}
            size={34}
            {...companion.look}
          />
        </span>
      {/key}
    </span>
    {#if companion.blocking > 0}
      {@const waiting = fill(copy.sessions.waitingCount, { count: String(companion.blocking) })}
      <span class="badge" role="status" title={waiting} data-testid="island-waiting">
        <span aria-hidden="true">{companion.blocking}</span>
        <span class="sr">{waiting}</span>
      </span>
    {/if}
  </button>
  <!-- The name rides in with the face, then goes; a screen reader hears it once. -->
  <span class="said" aria-live="polite" data-testid="island-agent-name">
    {#if said}<span class="tag" class:moving={!reduced}>{said}</span>{/if}
  </span>
</div>

<style>
  .agent {
    position: relative;
    flex: none;
  }
  .character {
    position: relative;
    display: grid;
    place-items: center;
    padding: 0;
    border: none;
    background: none;
    cursor: pointer;
    touch-action: none;
  }
  .character:focus-visible {
    outline: 2px solid var(--deck-accent);
    outline-offset: 1px;
    border-radius: 12px;
  }
  /* The face going and the one coming share the same place while they slide. */
  .stack {
    display: grid;
  }
  .slot {
    grid-area: 1 / 1;
    display: grid;
    place-items: center;
  }
  .badge {
    position: absolute;
    top: -3px;
    right: -7px;
    min-width: 16px;
    height: 16px;
    padding: 0 4px;
    border-radius: 999px;
    background: var(--island-attention);
    color: var(--island-attention-ink);
    font-size: 10px;
    font-weight: 700;
    line-height: 16px;
    text-align: center;
    font-variant-numeric: tabular-nums;
  }
  .said {
    position: absolute;
    top: 50%;
    left: calc(100% + 8px);
    z-index: 5;
    translate: 0 -50%;
    pointer-events: none;
  }
  .tag {
    display: block;
    max-width: 120px;
    padding: 3px 9px;
    overflow: hidden;
    border: 1px solid var(--island-line-strong);
    border-radius: 999px;
    background: var(--island-bg);
    color: var(--island-text);
    font-size: 12px;
    font-weight: 600;
    line-height: 16px;
    white-space: nowrap;
    text-overflow: ellipsis;
  }
  /* In from the face's side, a beat, then out: the whole stay is one play, so nothing runs after it. */
  .tag.moving {
    animation: said 1600ms cubic-bezier(0.22, 1, 0.36, 1) both;
  }
  @keyframes said {
    0% { opacity: 0; transform: translateX(-10px); }
    18%, 80% { opacity: 1; transform: translateX(0); }
    100% { opacity: 0; transform: translateX(0); }
  }
  .sr {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: nowrap;
  }
</style>
