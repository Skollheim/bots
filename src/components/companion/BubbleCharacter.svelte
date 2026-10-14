<!--
  The companion as a Bubble (`lib/robots.ts`, family `bubble`): the round
  robot the Agents page draws (`RobotFace`), floating. It drifts up and down
  at rest and breathes, blinks, follows the pointer with its eyes, squashes
  like a soap bubble when poked, wobbles when dizzy, jumps for joy, rings
  when it calls, and while it works it bobs fast and lets small bubbles rise.
  Asleep, it sinks low and drifts slowly. `CompanionCharacter` draws it in
  the box's place.

  It is drawn whole, a little smaller than the square, since a floating bubble
  cut flat at the bottom would look set down. The drift and the mood's motion
  are two layers, so a poke never stops it floating. Transform and opacity
  only.
-->
<script lang="ts">
  import RobotFace from '../agents/RobotFace.svelte';
  import { faceState, type CharacterProps } from '../../lib/companion/character';
  import { robotColor } from '../../lib/robots';
  import CharacterMarks from './CharacterMarks.svelte';

  let { robot, face, tone, look, bouncing, dizzy, act, size, label }: CharacterProps = $props();

  /** How far each shape is drawn down to fit whole: RobotFace's bubbles reach 67 to 77 of its 64 units. */
  const FIT = [0.95, 0.89, 0.84, 0.87];
</script>

<div
  class="bubble f-{face} t-{tone} {act ? `a-${act}` : ''}"
  class:boing={bouncing}
  class:dizzy
  style:width="{size}px"
  style:height="{size}px"
  style:--rb={robotColor(robot)}
  role="img"
  aria-label={label}
>
  <div class="layer drift">
    <div class="layer rig">
      <div class="layer fit" style:scale={FIT[robot.shape] ?? FIT[2]}>
        <RobotFace {robot} state={faceState(face)} gaze={face === 'sleep' ? null : look} bare />
      </div>
    </div>
    {#if face === 'working'}
      <!-- Small bubbles rise beside it while it works. -->
      <svg class="layer fizz" viewBox="0 0 100 100" aria-hidden="true"><circle cx="88" cy="70" r="5" /></svg>
      <svg class="layer fizz f2" viewBox="0 0 100 100" aria-hidden="true"><circle cx="10" cy="62" r="3.5" /></svg>
      <svg class="layer fizz f3" viewBox="0 0 100 100" aria-hidden="true"><circle cx="93" cy="52" r="2.5" /></svg>
    {/if}
  </div>
  <CharacterMarks {face} />
</div>

<style>
  .bubble { position: relative; display: inline-block; flex: none; }
  .layer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  /* The whole bubble, hat to bottom, in the square (`FIT`). */
  .fit { transform-origin: 50% 2%; }
  .fit :global(.robot) { overflow: visible; }
  /* Its middle, where a squash and a ring turn. */
  .rig { transform-origin: 50% 58%; }
  .fizz { pointer-events: none; opacity: 0; }
  .fizz circle {
    fill: color-mix(in srgb, var(--rb) 35%, transparent);
    stroke: color-mix(in srgb, var(--rb) 70%, var(--robot-ink));
    stroke-width: 1.5;
  }

  /* Asleep or calm, the eyes nearly shut; startled, wide open. */
  .f-sleep .rig :global(.eyes),
  .f-calm .rig :global(.eyes),
  .f-rest .rig :global(.eyes) { transform: scaleY(0.15); }
  .f-startled .rig :global(.eyes) { transform: scale(1.25); }

  /* Floating, always: slow at rest, sunk and slower asleep, quick at work. */
  .drift { animation: float 3.6s ease-in-out infinite; }
  .f-sleep .drift, .f-calm .drift, .f-rest .drift { animation: doze 6s ease-in-out infinite; }
  .t-working .drift { animation: bob 1.1s ease-in-out infinite; }
  .f-cheer .drift, .f-happy .drift { animation: none; }

  /* The mood. */
  .f-awake .rig, .f-typing .rig, .f-game .rig { animation: breathe 4s ease-in-out infinite; }
  .t-working .rig { animation: hum 0.9s ease-in-out infinite; }
  .f-groove .rig { animation: groove 0.5s ease-in-out infinite alternate; }
  .f-happy .rig { animation: hop 1.2s ease-in-out infinite; }
  .f-worried .rig { animation: shiver 0.3s linear infinite; }
  .f-alarm .rig, .f-calling .rig { animation: ring 0.9s ease-in-out infinite; }
  .f-cheer .rig { animation: jump 0.7s ease-out infinite; }
  .a-stretch .rig { animation: stretch 1.4s ease-in-out; }
  .boing .rig { animation: boing 0.8s ease-out; }
  .dizzy .rig { animation: wobble 0.6s ease-in-out infinite; }
  .dizzy .rig :global(.eyes) { animation: spin 0.6s linear infinite; }
  .fizz { animation: rise 1.8s ease-out infinite; }
  .fizz.f2 { animation-delay: 0.6s; }
  .fizz.f3 { animation-delay: 1.2s; }

  @keyframes float { 0%, 100% { transform: translateY(0) rotate(0); } 30% { transform: translateY(-5%) rotate(-2deg); } 70% { transform: translateY(-2%) rotate(2deg); } }
  @keyframes doze { 0%, 100% { transform: translateY(5%) rotate(-3deg); } 50% { transform: translateY(3%) rotate(-1deg); } }
  @keyframes bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-3%); } }
  @keyframes breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.03, 1.03); } }
  /* At work it hums like a bubble about to split: a soft squash one way, then the other. */
  @keyframes hum { 0%, 100% { transform: scale(1, 1); } 30% { transform: scale(1.04, 0.97); } 65% { transform: scale(0.97, 1.04); } }
  @keyframes groove { from { transform: rotate(-5deg); } to { transform: rotate(5deg) translateY(-2%); } }
  @keyframes hop { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-10%); } }
  @keyframes shiver { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-2%); } 75% { transform: translateX(2%); } }
  @keyframes ring { 0%, 40%, 100% { transform: rotate(0); } 8% { transform: rotate(-9deg); } 16% { transform: rotate(8deg); } 24% { transform: rotate(-5deg); } 32% { transform: rotate(3deg); } }
  @keyframes jump { 0%, 100% { transform: translateY(0) scale(1.06, 0.94); } 45% { transform: translateY(-18%) scale(0.95, 1.06); } }
  @keyframes stretch { 0%, 100% { transform: scale(1, 1); } 40%, 60% { transform: scale(1.08, 1.08); } }
  /* A soap bubble poked: flattened, stretched, then a few smaller wobbles. */
  @keyframes boing {
    0% { transform: scale(1, 1); }
    18% { transform: scale(1.18, 0.82); }
    40% { transform: scale(0.88, 1.13) translateY(-6%); }
    60% { transform: scale(1.07, 0.95); }
    80% { transform: scale(0.98, 1.03); }
    100% { transform: scale(1, 1); }
  }
  @keyframes wobble { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-11deg) translateX(-2%); } 75% { transform: rotate(11deg) translateX(2%); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes rise { 0% { transform: translateY(0) scale(0.6); opacity: 0; } 20% { opacity: 1; } 100% { transform: translateY(-38%) scale(1.1); opacity: 0; } }

  @media (prefers-reduced-motion: reduce) {
    .bubble, .bubble *, .bubble :global(*) { animation: none !important; }
  }
  :global(html[data-motion='reduced']) .bubble :global(*) { animation: none !important; }
</style>
