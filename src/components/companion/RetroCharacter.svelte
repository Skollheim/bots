<!--
  The companion as a Retro robot (`lib/robots.ts`, family `retro`): the head
  with a screen the Agents page draws (`RobotFace`), moved like an old
  machine: in stiff steps, never a smooth glide. Its antenna wiggles now and
  then, a scanline runs down its screen, which flickers; it blinks, follows
  the pointer with its eyes, jolts when poked, rattles when dizzy, jumps for
  joy, shakes and waves its antenna when it calls, and dims its screen to
  sleep. `CompanionCharacter` draws it in the box's place.

  It is drawn whole, a little smaller than the square, so its body is not cut
  flat. The scanline and the glow sit on the screen in a clipped layer of
  their own, moved by transform and opacity only.
-->
<script lang="ts">
  import RobotFace, { retroHead } from '../agents/RobotFace.svelte';
  import { faceState, type CharacterProps } from '../../lib/companion/character';
  import CharacterMarks from './CharacterMarks.svelte';
  import { beat, onscreen } from '../../lib/companion/beats';

  let { robot, face, tone, look, bouncing, dizzy, act, size, label }: CharacterProps = $props();

  const pc = (units: number) => `${+(units * 100 / 64).toFixed(4)}%`;
  const retro = $derived(retroHead(robot.shape));
  const screen = $derived(retro.screen);
  /** Drawn down to fit whole: the body hangs 28 units under the head, past RobotFace's 64. */
  const fit = $derived(+(64 / (retro.head.y + retro.head.h + 29)).toFixed(3));
  // Calling, it shakes itself: RobotFace's own hop would move the head out from under the screen's layer.
  const state = $derived(faceState(face) === 'waiting' ? 'idle' : faceState(face));
  // At rest the antenna wiggles and the screen flickers now and then, started by the page's one timer (`beats.ts`);
  // at work, or when it calls, they keep going.
  const wiggles = $derived(['awake', 'typing', 'game', 'groove'].includes(face));
  const flickers = $derived(face !== 'sleep' && face !== 'alarm' && face !== 'calling' && tone !== 'working');
</script>

<div
  class="retro f-{face} t-{tone} {act ? `a-${act}` : ''}"
  class:boing={bouncing}
  class:dizzy
  style:width="{size}px"
  style:height="{size}px"
  role="img"
  aria-label={label}
  use:onscreen
  use:beat={{ name: 'wiggle', every: 4200, length: 1260, active: wiggles }}
>
  <div class="layer rig">
    <div class="layer fit" style:scale={fit}>
      <RobotFace {robot} {state} gaze={face === 'sleep' ? null : look} bare />
      <div class="glass" style:left={pc(screen.x)} style:top={pc(screen.y)} style:width={pc(screen.w)} style:height={pc(screen.h)} style:border-radius="{(size * 6) / 64}px" aria-hidden="true">
        <div class="glow" use:beat={{ name: 'flicker', every: 5000, length: 350, active: flickers }}></div>
        <div class="scanline"></div>
        <div class="dim"></div>
      </div>
    </div>
  </div>
  <CharacterMarks {face} />
</div>

<style>
  .retro { position: relative; display: inline-block; flex: none; }
  .layer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  /* The whole robot, antenna to body, in the square (`fit`). */
  .fit { transform-origin: 50% 1%; }
  .fit :global(.robot) { overflow: visible; }
  .rig { transform-origin: 50% 96%; }
  .glass { position: absolute; overflow: hidden; pointer-events: none; }
  .glass > div { position: absolute; inset: 0; }
  .glow { background: var(--robot-led); opacity: 0; }
  .scanline {
    height: 24%;
    background: linear-gradient(transparent, color-mix(in srgb, var(--robot-led) 45%, transparent), transparent);
    opacity: 0.5;
    transform: translateY(-100%);
  }
  .dim { background: var(--robot-screen); opacity: 0; transition: opacity var(--dur-3, 0.3s) steps(3); }

  /* Asleep or calm, the eyes a flat line and the screen dimmed; startled, wide open. */
  .f-sleep .rig :global(.eyes),
  .f-calm .rig :global(.eyes),
  .f-rest .rig :global(.eyes) { transform: scaleY(0.15); }
  .f-sleep .dim { opacity: 0.6; }
  .f-calm .dim, .f-rest .dim { opacity: 0.35; }
  .f-startled .rig :global(.eyes) { transform: scale(1.3); }

  /* The body, in steps. */
  .f-awake .rig, .f-typing .rig, .f-game .rig { animation: idle 3.2s steps(1, end) infinite; }
  .f-sleep .rig, .f-calm .rig, .f-rest .rig { animation: idle 6s steps(1, end) infinite; }
  .t-working .rig { animation: hum 0.8s steps(1, end) infinite; }
  .f-groove .rig { animation: groove 1s steps(1, end) infinite; }
  .f-happy .rig { animation: hop 1.2s steps(4, end) infinite; }
  .f-worried .rig { animation: shiver 0.24s steps(1, end) infinite; }
  .f-alarm .rig, .f-calling .rig { animation: ring 0.9s steps(1, end) infinite; }
  .f-cheer .rig { animation: jump 0.8s steps(5, end) infinite; }
  .a-stretch .rig { animation: stretch 1.4s steps(1, end); }
  .boing .rig { animation: boing 0.6s steps(1, end); }
  .dizzy .rig { animation: rattle 0.6s steps(1, end) infinite; }
  .dizzy .rig :global(.eyes) { animation: spin 0.8s steps(8, end) infinite; }

  /* The antenna: a wiggle now and then at rest, all the time at work, waving when it calls. */
  /* No weightier than the rule it replaced: a poke's wave still wins over a wiggle under way. */
  .retro:global(:where([data-beat-wiggle])) .rig :global(.antenna) { animation: wiggle-once 1.26s ease-in-out; }
  /* Kept on their own layers between gestures: made at each one, they would be painted again each time. */
  .f-awake .rig :global(.antenna), .f-typing .rig :global(.antenna), .f-game .rig :global(.antenna), .f-groove .rig :global(.antenna) { will-change: transform; }
  .glow { will-change: opacity; }
  .t-working .rig :global(.antenna) { animation: wiggle 1.2s ease-in-out infinite; }
  .f-alarm .rig :global(.antenna), .f-calling .rig :global(.antenna) { animation: wave 0.45s ease-in-out infinite alternate; }
  .f-happy .rig :global(.antenna), .f-cheer .rig :global(.antenna), .boing .rig :global(.antenna) { animation: wave 0.25s ease-in-out infinite alternate; }
  .f-sleep .rig :global(.antenna) { transform: rotate(-14deg); }
  .dizzy .rig :global(.antenna) { animation: wave 0.15s linear infinite alternate; }

  /* The screen: a scanline running down, faster at work; a flicker now and then; a glow when it calls. */
  .scanline { animation: scan 2.8s linear infinite; }
  .t-working .scanline { animation-duration: 1.1s; }
  .f-sleep .scanline { animation-duration: 6s; opacity: 0.2; }
  .glow:global([data-beat-flicker]) { animation: flicker-once 0.35s steps(1, end); }
  .t-working .glow { animation: flicker 1.7s steps(1, end) infinite; }
  .f-alarm .glow, .f-calling .glow { animation: alert 0.7s steps(1, end) infinite; }
  .f-sleep .glow { animation: none; }

  @keyframes idle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-1.5%); } }
  @keyframes hum { 0%, 100% { transform: translateY(0); } 25% { transform: translateY(-1.5%); } 50% { transform: translateY(0); } 75% { transform: translateY(-1%) rotate(0.8deg); } }
  @keyframes groove { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-4deg); } 50% { transform: rotate(0) translateY(-1.5%); } 75% { transform: rotate(4deg); } }
  @keyframes hop { 0%, 50%, 100% { transform: translateY(0); } 25% { transform: translateY(-10%); } }
  @keyframes shiver { 0%, 100% { transform: translateX(0); } 50% { transform: translateX(-1.5%); } }
  @keyframes ring { 0%, 50%, 100% { transform: rotate(0); } 10% { transform: rotate(-6deg); } 20% { transform: rotate(5deg); } 30% { transform: rotate(-4deg); } 40% { transform: rotate(2deg); } }
  @keyframes jump { 0%, 100% { transform: translateY(0) scale(1.04, 0.96); } 40%, 60% { transform: translateY(-16%) scale(1, 1); } }
  @keyframes stretch { 0%, 100% { transform: scale(1, 1); } 30%, 70% { transform: scale(1, 1.06); } }
  /* Poked: a jolt up, a clank down, a small rattle. */
  @keyframes boing {
    0% { transform: translateY(0); }
    15% { transform: translateY(-10%); }
    40% { transform: translateY(0) scale(1.04, 0.95); }
    55% { transform: translateX(-1.5%); }
    70% { transform: translateX(1.5%); }
    85%, 100% { transform: translateX(0); }
  }
  @keyframes rattle { 0%, 100% { transform: rotate(0); } 25% { transform: rotate(-8deg) translateX(-1.5%); } 50% { transform: rotate(0); } 75% { transform: rotate(8deg) translateX(1.5%); } }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes wiggle { 0%, 70%, 100% { transform: rotate(0); } 76% { transform: rotate(-12deg); } 84% { transform: rotate(10deg); } 92% { transform: rotate(-5deg); } }
  /* The moving 30 % of `wiggle`, played once. */
  @keyframes wiggle-once { 0%, 100% { transform: rotate(0); } 20% { transform: rotate(-12deg); } 46.667% { transform: rotate(10deg); } 73.333% { transform: rotate(-5deg); } }
  @keyframes wave { from { transform: rotate(-16deg); } to { transform: rotate(16deg); } }
  @keyframes scan { from { transform: translateY(-100%); } to { transform: translateY(420%); } }
  @keyframes flicker { 0%, 100% { opacity: 0; } 62% { opacity: 0.14; } 64% { opacity: 0; } 67% { opacity: 0.1; } 69% { opacity: 0; } }
  /* The lit 7 % of `flicker`, played once. */
  @keyframes flicker-once { 0% { opacity: 0.14; } 28.571% { opacity: 0; } 71.429% { opacity: 0.1; } 100% { opacity: 0; } }
  @keyframes alert { 0%, 100% { opacity: 0; } 50% { opacity: 0.22; } }

  @media (prefers-reduced-motion: reduce) {
    .retro, .retro *, .retro :global(*) { animation: none !important; transition: none !important; }
    .scanline { opacity: 0; }
  }
  :global(html[data-motion='reduced']) .retro :global(*) { animation: none !important; }
</style>
