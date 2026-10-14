<!--
  The companion as a Capsule (`lib/robots.ts`, family `capsule`): the leaning
  face the Agents page draws (`RobotFace`), rocking on its base. At rest it
  tilts back and forth as it breathes; it blinks and follows the pointer with
  its eyes; what it wears on top spins while it works and when it is poked;
  it hops and leans when poked, wobbles when dizzy, jumps for joy with a
  whole turn, rings when it calls and rests its head to sleep.
  `CompanionCharacter` draws it in the box's place.

  The rock and the spin are layers of their own (the rig, RobotFace's `cap`),
  moved by transform only.
-->
<script lang="ts">
  import RobotFace from '../agents/RobotFace.svelte';
  import { faceState, type CharacterProps } from '../../lib/companion/character';
  import CharacterMarks from './CharacterMarks.svelte';

  let { robot, face, tone, look, bouncing, dizzy, act, size, label }: CharacterProps = $props();
</script>

<div
  class="capsule f-{face} t-{tone} {act ? `a-${act}` : ''}"
  class:boing={bouncing}
  class:dizzy
  style:width="{size}px"
  style:height="{size}px"
  role="img"
  aria-label={label}
>
  <div class="rig">
    <div class="fit">
      <RobotFace {robot} state={faceState(face)} gaze={face === 'sleep' ? null : look} bare />
    </div>
  </div>
  <CharacterMarks {face} />
</div>

<style>
  .capsule { position: relative; display: inline-block; flex: none; }
  /* It rocks on the bottom of its face. */
  .rig { width: 100%; height: 100%; transform-origin: 54% 96%; }
  /* Whole, not cut by the square: RobotFace's lean pushes the face down to 69 of its 64 units. */
  .fit { width: 100%; height: 100%; transform: scale(0.9); transform-origin: 50% 0; }
  .fit :global(.robot) { overflow: visible; }

  /* Asleep or calm, the eyes nearly shut; startled, wide open. */
  .f-sleep .rig :global(.eyes),
  .f-calm .rig :global(.eyes),
  .f-rest .rig :global(.eyes) { transform: scaleY(0.15); }
  .f-startled .rig :global(.eyes) { transform: scale(1.25); }

  /* The rock: a tilt back and forth while it breathes, slower and further over asleep. */
  .f-awake .rig, .f-typing .rig, .f-game .rig { animation: rock 4.4s ease-in-out infinite; }
  .f-sleep .rig, .f-calm .rig, .f-rest .rig { animation: nap 6s ease-in-out infinite; }
  .t-working .rig { animation: hum 1.2s ease-in-out infinite; }
  .f-groove .rig { animation: groove 0.5s ease-in-out infinite alternate; }
  .f-happy .rig { animation: hop 1.2s ease-in-out infinite; }
  .f-worried .rig { animation: shiver 0.3s linear infinite; }
  .f-alarm .rig, .f-calling .rig { animation: ring 0.9s ease-in-out infinite; }
  .f-cheer .rig { transform-origin: 50% 56%; animation: twirl 1.2s ease-in-out infinite; }
  .a-stretch .rig { animation: stretch 1.4s ease-in-out; }
  .boing .rig { animation: boing 0.7s ease-out; }
  .dizzy .rig { animation: wobble 0.6s ease-in-out infinite; }
  .dizzy .rig :global(.eyes) { animation: spin 0.6s linear infinite; }

  /* The top: it spins at work, when poked or dizzy, and twitches when it calls. */
  .t-working .rig :global(.cap) { animation: whirl 1.2s linear infinite; }
  .f-alarm .rig :global(.cap), .f-calling .rig :global(.cap) { animation: twitch 0.9s ease-in-out infinite; }
  .boing .rig :global(.cap) { animation: whirl 0.7s ease-out; }
  .dizzy .rig :global(.cap) { animation: whirl 0.5s linear infinite; }

  @keyframes rock { 0%, 100% { transform: rotate(0) scale(1, 1); } 50% { transform: rotate(6deg) scale(1.01, 1.025); } }
  @keyframes nap { 0%, 100% { transform: rotate(-9deg) translateY(2%); } 50% { transform: rotate(-7deg) translateY(2%) scale(1.01, 1.02); } }
  @keyframes hum { 0%, 100% { transform: rotate(0) translateY(0); } 25% { transform: rotate(2deg) translateY(-1.5%); } 75% { transform: rotate(-2deg) translateY(-1.5%); } }
  @keyframes groove { from { transform: rotate(-6deg); } to { transform: rotate(6deg) translateY(-1.5%); } }
  @keyframes hop { 0%, 60%, 100% { transform: translateY(0) rotate(0); } 30% { transform: translateY(-9%) rotate(8deg); } }
  @keyframes shiver { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-1.5%); } 75% { transform: translateX(1.5%); } }
  @keyframes ring { 0%, 40%, 100% { transform: rotate(0); } 8% { transform: rotate(-8deg); } 16% { transform: rotate(7deg); } 24% { transform: rotate(-5deg); } 32% { transform: rotate(2deg); } }
  /* Jumps for joy and turns once in the air. */
  @keyframes twirl {
    0% { transform: translateY(0) rotate(0) scale(1.05, 0.95); }
    15% { transform: translateY(0) rotate(0) scale(1, 1); }
    50% { transform: translateY(-16%) rotate(180deg); }
    85% { transform: translateY(0) rotate(360deg) scale(1, 1); }
    100% { transform: translateY(0) rotate(360deg) scale(1.05, 0.95); }
  }
  @keyframes stretch { 0%, 100% { transform: scale(1, 1); } 40%, 60% { transform: scale(0.96, 1.08) rotate(5deg); } }
  /* Poked: it hops, tips back, then settles. */
  @keyframes boing {
    0% { transform: translateY(0) rotate(0); }
    30% { transform: translateY(-10%) rotate(-14deg); }
    60% { transform: translateY(0) rotate(8deg) scale(1.04, 0.96); }
    80% { transform: rotate(-3deg); }
    100% { transform: translateY(0) rotate(0); }
  }
  @keyframes wobble { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-12deg) translateX(-1.5%); } 75% { transform: rotate(12deg) translateX(1.5%); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  /* Turned round its own upright, so a hat or an antenna shows its other side. */
  @keyframes whirl { from { transform: rotateY(0); } to { transform: rotateY(360deg); } }
  @keyframes twitch { 0%, 50%, 100% { transform: rotate(0); } 15% { transform: rotate(-10deg); } 30% { transform: rotate(8deg); } }

  @media (prefers-reduced-motion: reduce) {
    .capsule, .capsule *, .capsule :global(*) { animation: none !important; }
  }
  :global(html[data-motion='reduced']) .capsule :global(*) { animation: none !important; }
</style>
