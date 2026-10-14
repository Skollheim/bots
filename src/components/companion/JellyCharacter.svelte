<!--
  The companion as a Jelly (`lib/robots.ts`, family `jelly`): the blob the
  Agents page draws (`RobotFace`), moved the way Boîte moves
  (`CompanionCharacter`, which draws this one in its place). It breathes at
  rest, blinks, follows the pointer with its eyes, hops when poked, wobbles
  when dizzy, jumps for joy, rings when it calls and hums while it works.
-->
<script lang="ts">
  import RobotFace from '../agents/RobotFace.svelte';
  import { faceState, type CharacterProps } from '../../lib/companion/character';
  import CharacterMarks from './CharacterMarks.svelte';

  let { robot, face, tone, look, bouncing, dizzy, act, size, label }: CharacterProps = $props();
</script>

<div
  class="jelly f-{face} t-{tone} {act ? `a-${act}` : ''}"
  class:boing={bouncing}
  class:dizzy
  style:width="{size}px"
  style:height="{size}px"
  role="img"
  aria-label={label}
>
  <div class="rig">
    <RobotFace {robot} state={faceState(face)} gaze={face === 'sleep' ? null : look} bare />
  </div>
  <CharacterMarks {face} />
</div>

<style>
  .jelly {
    position: relative;
    display: inline-block;
    flex: none;
  }
  .rig {
    width: 100%;
    height: 100%;
    transform-origin: 50% 100%;
  }
  /* Asleep or calm, the eyes nearly shut; startled, wide open. */
  .f-sleep .rig :global(.eyes),
  .f-calm .rig :global(.eyes) { transform: scaleY(0.15); }
  .f-startled .rig :global(.eyes) { transform: scale(1.25); }
  .f-awake .rig, .f-typing .rig, .f-game .rig { animation: breathe 4s ease-in-out infinite; }
  .f-sleep .rig, .f-calm .rig { animation: breathe 6s ease-in-out infinite; }
  .f-groove .rig { animation: groove 0.5s ease-in-out infinite alternate; }
  .t-working .rig { animation: hum 1.4s ease-in-out infinite; }
  .f-happy .rig { animation: hop 1.2s ease-in-out infinite; }
  .f-worried .rig { animation: shiver 0.3s linear infinite; }
  .f-alarm .rig, .f-calling .rig { animation: ring 0.9s ease-in-out infinite; }
  .f-cheer .rig { animation: jump 0.6s ease-out infinite; }
  .a-stretch .rig { animation: stretch 1.4s ease-in-out; }
  .boing .rig { animation: boing 0.65s ease-out; }
  .dizzy .rig { animation: wobble 0.6s ease-in-out infinite; }
  .dizzy .rig :global(.eyes) { animation: spin 0.6s linear infinite; }

  @keyframes breathe { 0%, 100% { transform: scale(1, 1); } 50% { transform: scale(1.02, 1.04); } }
  @keyframes groove { from { transform: rotate(-4deg); } to { transform: rotate(4deg) translateY(-1.5px); } }
  @keyframes hum { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5px); } }
  @keyframes hop { 0%, 60%, 100% { transform: translateY(0); } 30% { transform: translateY(-5px); } }
  @keyframes shiver { 0%, 100% { transform: translateX(0); } 25% { transform: translateX(-1px); } 75% { transform: translateX(1px); } }
  @keyframes ring { 0%, 40%, 100% { transform: rotate(0); } 8% { transform: rotate(-7deg); } 16% { transform: rotate(6deg); } 24% { transform: rotate(-4deg); } 32% { transform: rotate(2deg); } }
  @keyframes jump { 0%, 100% { transform: translateY(0) scale(1.05, 0.95); } 45% { transform: translateY(-10px) scale(0.96, 1.05); } }
  @keyframes stretch { 0%, 100% { transform: scale(1, 1); } 40%, 60% { transform: scale(0.95, 1.1); } }
  @keyframes boing { 0% { transform: scale(1, 1); } 25% { transform: scale(1.12, 0.84); } 55% { transform: scale(0.93, 1.1); } 80% { transform: scale(1.03, 0.97); } 100% { transform: scale(1, 1); } }
  @keyframes wobble { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-9deg) translateX(-1px); } 75% { transform: rotate(9deg) translateX(1px); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @media (prefers-reduced-motion: reduce) {
    .jelly, .jelly * { animation: none !important; }
  }
</style>
