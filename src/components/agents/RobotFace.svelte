<script module lang="ts">
  /** The retro head's box per shape, which the screen, the ears and the antenna follow (64 units). */
  const RETRO_HEADS = [
    { x: 11, y: 16, w: 42, h: 36, r: 11 },
    { x: 10, y: 13, w: 44, h: 42, r: 21 },
    { x: 14, y: 12, w: 36, h: 42, r: 11 },
    { x: 7, y: 19, w: 50, h: 32, r: 11 },
  ];

  /** A retro robot's head and the dark screen on it, for anything drawn over them (`RetroCharacter`). */
  export function retroHead(shape: number) {
    const head = RETRO_HEADS[shape] ?? RETRO_HEADS[0]!;
    return { head, screen: { x: head.x + 5, y: head.y + 6, w: head.w - 10, h: Math.min(head.h - 15, 22) } };
  }
</script>

<script lang="ts">
  import { beat, onscreen } from '../../lib/companion/beats';
  import { boxPaint } from '../../lib/companion/skin';
  import { robotColor, type Robot } from '../../lib/robots';
  import BoxTop from '../companion/BoxTop.svelte';

  /**
   * One robot, drawn in a 64 unit square that its holder crops to a disc. The
   * colors are app.css tokens: `--robot-<n>` gives the body, the background is
   * that color washed out, the trim that color darkened. `state` moves the
   * face: a blink at rest, a glance from side to side while it works, a hop
   * while it waits on the user. `still` draws it without motion, for pickers.
   * `gaze` turns the eyes toward a point (each axis -1 to 1), and `bare`
   * leaves out the disc behind it, for the companion standing on its own.
   * The parts a companion moves on their own have a layer each: the eyes, a
   * capsule's top (`cap`) and a retro robot's antenna (`antenna`).
   *
   * It is drawn in stacked layers over the same square: what is behind the
   * eyes, the eyes, what is over them, and the light that pulses. What moves
   * (the eyes, the light, the whole robot) is a layer of its own, moved by
   * transform or opacity only, so the compositor plays it without the page
   * painting again.
   */
  let { robot, state = 'idle', gaze = null, bare = false }: { robot: Robot; state?: 'idle' | 'working' | 'waiting' | 'still'; gaze?: { x: number; y: number } | null; bare?: boolean } = $props();

  const INK = 'var(--robot-ink)';
  const retro = $derived(retroHead(robot.shape));
  const head = $derived(retro.head);
  const screen = $derived(retro.screen);
  const sy = $derived(screen.y + screen.h / 2);
  const lx = $derived(32 - screen.w / 4.2);
  const rx = $derived(32 + screen.w / 4.2);

  /*
   * Jelly: a blob that fills the disc on two small feet, with a shine, rosy
   * cheeks and a face near its top. Shapes, faces and tops vary a lot so two
   * agents rarely look alike.
   */
  const jellyBody = [
    'M7 46 C6 29 18 15 32 15 C47 15 58 29 57 46 C56 58 45 62 32 62 C19 62 8 58 7 46Z',
    'M32 8 C38 16 56 28 56 46 C56 58 45 63 32 63 C19 63 8 58 8 46 C8 28 26 16 32 8Z',
    'M3 50 C3 36 16 25 32 25 C48 25 61 36 61 50 C61 59 49 63 32 63 C15 63 3 59 3 50Z',
    'M7 48 C6 34 10 17 21 17 C27 17 29 22 32 22 C35 22 37 17 43 17 C54 17 58 34 57 48 C56 59 45 63 32 63 C19 63 8 59 7 48Z',
    'M32 10 C43 10 50 24 51 38 C52 53 44 62 32 62 C20 62 12 53 13 38 C14 24 21 10 32 10Z',
    'M6 47 C5 37 10 30 17 29 C17 21 24 16 32 16 C40 16 47 21 47 29 C54 30 59 37 58 47 C57 58 46 62 32 62 C18 62 7 58 6 47Z',
  ];
  /** Per shape: the top of the head the face hangs from, where a top grows, and the shine. */
  const jelly = $derived([
    { head: 16, crown: 15, shine: [20, 26] },
    { head: 12, crown: 9, shine: [25, 25] },
    { head: 25, crown: 25, shine: [16, 35] },
    { head: 16, crown: 22, shine: [18, 27] },
    { head: 12, crown: 10, shine: [22, 22] },
    { head: 17, crown: 16, shine: [22, 24] },
  ][robot.shape] ?? { head: 16, crown: 15, shine: [20, 26] });
  const ey = $derived(jelly.head + 15);
  const c = $derived(jelly.crown);
  /** A tall head nears the disc's edge: what grows straight up starts lower so it is not cropped. */
  const up = $derived(Math.max(jelly.crown, 15));
  const tip = $derived(Math.max(jelly.crown - 8, 6));
  const petals = [0, 72, 144, 216, 288].map(a => ({ x: 4.2 * Math.cos(a * Math.PI / 180), y: 4.2 * Math.sin(a * Math.PI / 180) }));
  /** The box's colours, from `lib/companion/skin.ts` like the companion's. */
  const paint = $derived(boxPaint(robot));
  /** The box is the companion's drawing (100 units) brought into this square. */
  const BOX = 'translate(7 13) scale(0.5)';

  /** The middle of the eyes' drawing (64 units), which a blink folds toward and a spin turns round. */
  const eyesAt = $derived.by((): [number, number] => {
    const eyes = robot.eyes;
    switch (robot.family) {
      case 'jelly':
        return eyes === 5 || eyes === 6 ? [34.4, ey - 0.9] : eyes === 3 ? [32, ey - 0.75] : eyes === 4 ? [32, ey + 1] : eyes > 6 ? [32.4, ey] : [32, ey];
      case 'bubble':
        return [32, eyes > 3 ? 41.875 : 41];
      case 'capsule':
        return eyes === 2 ? [32.25, 33] : eyes === 3 ? [32, 33.5] : [32, 33];
      case 'box':
        return [32, 43.5];
      default:
        return [32, eyes === 2 ? sy + 0.5 : eyes > 3 ? sy - 0.34 : sy];
    }
  });
  const pc = (units: number) => `${+(units * 100 / 64).toFixed(4)}%`;
  /** The gaze, in hundredths of the square. */
  const look = $derived(gaze ? `translate(${(gaze.x * 3.75).toFixed(3)}%, ${(gaze.y * 2.8125).toFixed(3)}%)` : undefined);
</script>

<div
  class="robot"
  data-family={robot.family}
  data-state={state}
  use:onscreen
  use:beat={{ name: 'blink', every: 4600, length: 368, active: state === 'idle' }}
  style:--rb={robotColor(robot)}
  style:--eyes-at="{pc(eyesAt[0])} {pc(eyesAt[1])}"
  style:--box-body={paint.body}
  style:--box-lid={paint.lid}
  style:--box-line={paint.line}
  style:--box-eye={paint.eye}
  aria-hidden="true"
>
  {#if !bare}<svg class="layer" viewBox="0 0 64 64"><rect class={robot.family === 'capsule' ? 'base' : 'soft'} width="64" height="64" /></svg>{/if}
  <div class="layer whole">
    {#if robot.family === 'jelly'}
      <svg class="layer" viewBox="0 0 64 64">
        <!-- Behind the body: what grows out of its top. -->
        {#if robot.top === 1}
          <path d="M32 {c + 1} C30 {c - 6} 26 {c - 8} 23 {c - 6}" fill="none" class="stroke-deep" stroke-width="2.4" stroke-linecap="round" />
        {:else if robot.top === 2}
          <path d="M32 {up + 1} L32 {up - 5}" class="stroke-leaf" stroke-width="2" />
          {#each petals as petal, i (i)}<circle cx={32 + petal.x} cy={up - 8 + petal.y} r="2.6" class="petal" />{/each}
          <circle cx="32" cy={up - 8} r="2.2" class="halo" />
        {:else if robot.top === 3}
          <path d="M26 {c + 2} C24 {c - 4} 21 {tip + 1} 18 {tip} M38 {c + 2} C40 {c - 4} 43 {tip + 1} 46 {tip}" fill="none" class="stroke-deep" stroke-width="2.2" stroke-linecap="round" />
          <circle cx="18" cy={tip} r="2.6" class="deep" /><circle cx="46" cy={tip} r="2.6" class="deep" />
        {:else if robot.top === 4}
          <path d="M31 {up + 1} C29 {up - 7} 37 {up - 9} 37 {up - 4} C37 {up - 1} 33 {up - 1} 33 {up - 4}" fill="none" class="stroke-deep" stroke-width="2.2" stroke-linecap="round" />
        {:else if robot.top === 5}
          <path d="M32 {up + 2} L32 {up - 5}" class="stroke-leaf" stroke-width="2.2" stroke-linecap="round" />
          <path d="M32 {up - 4} C27 {up - 11} 21 {up - 8} 22 {up - 4} C25 {up - 2} 29 {up - 2} 32 {up - 4}Z" class="leaf" />
          <path d="M32 {up - 6} C36 {up - 13} 43 {up - 11} 42 {up - 7} C39 {up - 4} 35 {up - 4} 32 {up - 6}Z" class="leaf light" />
        {:else if robot.top === 6}
          <path d="M27 {c + 3} L25 {c - 4} M32 {c + 2} L32 {c - 6} M37 {c + 3} L39 {c - 4}" fill="none" class="stroke-deep" stroke-width="2.2" stroke-linecap="round" />
        {/if}
        <ellipse cx="22" cy="62" rx="6" ry="3" class="deep" /><ellipse cx="42" cy="62" rx="6" ry="3" class="deep" />
        <path d={jellyBody[robot.shape] ?? jellyBody[0]} class="base" />
        <ellipse cx={jelly.shine[0]} cy={jelly.shine[1]} rx="6" ry="3.5" class="gloss" transform="rotate(-25 {jelly.shine[0]} {jelly.shine[1]})" />
        <ellipse class="blush" cx="15" cy={ey + 9} rx="3.6" ry="2.2" /><ellipse class="blush" cx="49" cy={ey + 9} rx="3.6" ry="2.2" />
      </svg>
      <div class="layer" style:transform={look}><div class="layer eyes">
        <svg class="layer" viewBox="0 0 64 64">
          {#if robot.eyes === 0 || robot.eyes === 1}
            <ellipse cx="26" cy={ey} rx="4.2" ry="6.2" fill={INK} /><ellipse cx="38" cy={ey} rx="4.2" ry="6.2" fill={INK} />
            {#if robot.eyes === 0}<ellipse cx="27.4" cy={ey - 2.6} rx="1.5" ry="2" class="white" /><ellipse cx="39.4" cy={ey - 2.6} rx="1.5" ry="2" class="white" />
            {:else}<circle cx="27" cy={ey - 4} r="1.6" class="white" /><circle cx="39" cy={ey - 4} r="1.6" class="white" />{/if}
          {:else if robot.eyes === 2}
            <circle cx="25" cy={ey} r="6" class="white" /><circle cx="39" cy={ey} r="6" class="white" />
            <circle cx="25" cy={ey + 1} r="2.6" fill={INK} /><circle cx="39" cy={ey + 1} r="2.6" fill={INK} />
          {:else if robot.eyes === 3}
            <path d="M21 {ey + 1} q5 -7 10 0 M33 {ey + 1} q5 -7 10 0" fill="none" class="stroke-ink" stroke-width="2.8" stroke-linecap="round" />
          {:else if robot.eyes === 4}
            <path d="M21 {ey} q5 4 10 0 M33 {ey} q5 4 10 0" fill="none" class="stroke-ink" stroke-width="2.4" stroke-linecap="round" />
          {:else if robot.eyes === 5 || robot.eyes === 6}
            <!-- White eyes, the right one a little bigger, looking up and away. -->
            <circle cx="28" cy={ey} r="4.6" class="white" /><circle cx="40" cy={ey - 1} r="5.4" class="white" />
            <circle cx={robot.eyes === 5 ? 29.6 : 28.4} cy={ey - 1.4} r="2.3" fill={INK} /><circle cx={robot.eyes === 5 ? 41.8 : 40.4} cy={ey - 2.6} r="2.6" fill={INK} />
          {:else}
            <ellipse cx="26" cy={ey} rx="4.2" ry="6.2" fill={INK} /><ellipse cx="27.4" cy={ey - 2.6} rx="1.5" ry="2" class="white" />
            <path d="M33 {ey + 1} q5 -6 10 0" fill="none" class="stroke-ink" stroke-width="2.8" stroke-linecap="round" />
          {/if}
        </svg>
      </div></div>
      <svg class="layer" viewBox="0 0 64 64">
        {#if robot.eyes === 0}<path d="M22 {ey + 9} Q32 {ey + 19} 42 {ey + 9}" fill="none" class="stroke-ink" stroke-width="2.4" stroke-linecap="round" />
        {:else if robot.eyes === 1 || robot.eyes === 4}<path d="M28 {ey + 11} q4 3 8 0" fill="none" class="stroke-ink" stroke-width="2.2" stroke-linecap="round" />
        {:else if robot.eyes === 2}<ellipse cx="32" cy={ey + 13} rx="3.4" ry="4" fill={INK} />
        {:else if robot.eyes === 3}<path d="M21 {ey + 8} Q32 {ey + 21} 43 {ey + 8} Z" fill={INK} /><path d="M27 {ey + 13} Q32 {ey + 17} 37 {ey + 13} Z" class="tongue" />
        {:else if robot.eyes === 5}<path d="M27 {ey + 10} Q34 {ey + 15} 41 {ey + 8}" fill="none" class="stroke-ink" stroke-width="2.2" stroke-linecap="round" />
        {:else if robot.eyes === 6}<ellipse cx="34" cy={ey + 12} rx="3.8" ry="4.6" fill={INK} /><ellipse cx="34" cy={ey + 13.6} rx="2.2" ry="2.3" class="tongue" />
        {:else}<path d="M24 {ey + 9} Q32 {ey + 17} 40 {ey + 9}" fill="none" class="stroke-ink" stroke-width="2.4" stroke-linecap="round" /><ellipse cx="35" cy={ey + 13.5} rx="2.6" ry="2.2" class="tongue" />{/if}
        <!-- Over the body: a bow on its top. -->
        {#if robot.top === 7}
          <path d="M32 {c - 1} L26 {c - 4.6} Q24 {c - 1} 26 {c + 2.6} Z M32 {c - 1} L38 {c - 4.6} Q40 {c - 1} 38 {c + 2.6} Z" class="bow" /><circle cx="32" cy={c - 1} r="2.2" class="bow knot" />
        {/if}
      </svg>

    {:else if robot.family === 'bubble'}
      <svg class="layer" viewBox="0 0 64 64">
        <!-- Behind the body: what grows out of its top. -->
        {#if robot.top === 1}
          <line x1="32" y1="18" x2="32" y2="8" class="stroke-deep" stroke-width="2.4" stroke-linecap="round" />
        {:else if robot.top === 2}
          <path d="M32 19 C32 13 32 11 32 9" class="stroke-leaf" stroke-width="2.2" fill="none" stroke-linecap="round" />
          <path d="M32 12 C26 5 20 8 21 12 C24 14 29 14 32 12Z" class="leaf" /><path d="M32 10 C37 3 44 5 43 9 C40 12 35 12 32 10Z" class="leaf light" />
        {:else if robot.top === 4}
          <path d="M9 40 C9 14 55 14 55 40" fill="none" class="stroke-ink" stroke-width="3.2" />
        {/if}
        <g class="base">
          {#if robot.shape === 0}<circle cx="32" cy="42" r="25" />
          {:else if robot.shape === 1}<path d="M32 13 C46 24 57 34 57 47 C57 61 45 72 32 72 C19 72 7 61 7 47 C7 34 18 24 32 13Z" />
          {:else if robot.shape === 2}<rect x="13" y="15" width="38" height="62" rx="19" />
          {:else}<rect x="9" y="18" width="46" height="56" rx="17" />{/if}
        </g>
        <ellipse class="shine" cx="22" cy="28" rx="7" ry="4.5" transform="rotate(-30 22 28)" />
        <ellipse class="blush" cx="17" cy="48" rx="3.6" ry="2.2" /><ellipse class="blush" cx="47" cy="48" rx="3.6" ry="2.2" />
      </svg>
      {#if robot.top === 1}<svg class="layer led" viewBox="0 0 64 64"><circle class="deep" cx="32" cy="7" r="3.6" /></svg>{/if}
      <div class="layer" style:transform={look}><div class="layer eyes">
        <svg class="layer" viewBox="0 0 64 64">
          {#if robot.eyes === 0}<circle cx="24.5" cy="41" r="3.3" fill={INK} /><circle cx="39.5" cy="41" r="3.3" fill={INK} />
          {:else if robot.eyes === 1}<rect x="21.8" y="36" width="5.4" height="10" rx="2.7" fill={INK} /><rect x="36.8" y="36" width="5.4" height="10" rx="2.7" fill={INK} />
          {:else if robot.eyes === 2}
            <circle class="white" cx="24" cy="41" r="6" /><circle class="white" cx="40" cy="41" r="6" />
            <circle cx="25" cy="41.8" r="3.1" fill={INK} /><circle cx="41" cy="41.8" r="3.1" fill={INK} />
            <circle class="white" cx="26.2" cy="40.4" r="1" /><circle class="white" cx="42.2" cy="40.4" r="1" />
          {:else if robot.eyes === 3}<path d="M20.5 42.5 q4 -6 8 0 M35.5 42.5 q4 -6 8 0" fill="none" class="stroke-ink" stroke-width="2.6" stroke-linecap="round" />
          {:else}<path d="M20.5 41 q4 3.5 8 0 M35.5 41 q4 3.5 8 0" fill="none" class="stroke-ink" stroke-width="2.4" stroke-linecap="round" />{/if}
        </svg>
      </div></div>
      {#if robot.top >= 3 && robot.top <= 6}
        <!-- Over the body: what it wears. -->
        <svg class="layer" viewBox="0 0 64 64">
          {#if robot.top === 3}
            <path d="M12 30 C12 14 52 14 52 30 Z" class="deep" /><rect x="10" y="27" width="44" height="6" rx="3" class="soft" /><circle cx="32" cy="13" r="4" class="soft" />
          {:else if robot.top === 4}
            <rect x="4" y="34" width="9" height="15" rx="4.5" fill={INK} /><rect x="51" y="34" width="9" height="15" rx="4.5" fill={INK} />
          {:else if robot.top === 5}
            <circle cx="24.5" cy="41" r="7.2" class="lens" /><circle cx="39.5" cy="41" r="7.2" class="lens" /><path d="M31.7 41 h0.6" class="stroke-ink" stroke-width="2" />
          {:else}
            <path d="M32 22 L22 16 Q19 22 22 28 Z M32 22 L42 16 Q45 22 42 28 Z" class="bow" /><circle cx="32" cy="22" r="3.2" class="bow knot" />
          {/if}
        </svg>
      {/if}

    {:else if robot.family === 'capsule'}
      <!-- Leaning to one side; the eyes lean with it. -->
      <div class="layer tilt">
        <!-- Behind the face: what it wears on top, with the antenna's light. -->
        <div class="layer cap">
          <svg class="layer" viewBox="0 0 64 64">
          {#if robot.top === 1}
            <line x1="32" y1="11" x2="35" y2="2" class="stroke-ink" stroke-width="2.4" stroke-linecap="round" />
          {:else if robot.top === 2}
            <rect x="2" y="28" width="8" height="14" rx="4" class="deep" /><rect x="54" y="28" width="8" height="14" rx="4" class="deep" />
          {:else if robot.top === 3}
            <path d="M26 12 C26 4 34 3 36 8 C38 3 45 6 41 13" class="deep" />
          {:else if robot.top === 4}
            <ellipse cx="32" cy="5" rx="14" ry="3.4" fill="none" class="stroke-halo" stroke-width="2.6" />
          {:else if robot.top === 5}
            <path d="M7 36 C7 6 57 6 57 36" fill="none" class="stroke-ink" stroke-width="3" />
            <rect x="1" y="30" width="9" height="15" rx="4.5" class="deep" /><rect x="54" y="30" width="9" height="15" rx="4.5" class="deep" />
          {/if}
          </svg>
          {#if robot.top === 1}<svg class="layer led" viewBox="0 0 64 64"><circle class="deep" cx="35.5" cy="2.5" r="3.6" /></svg>{/if}
        </div>
        <svg class="layer" viewBox="0 0 64 64">
          <g class="face">
            {#if robot.shape === 0}<circle cx="32" cy="36" r="26" />
            {:else if robot.shape === 1}<ellipse cx="32" cy="37" rx="23" ry="27" />
            {:else if robot.shape === 2}<rect x="7" y="12" width="50" height="50" rx="18" />
            {:else}<path d="M10 34 C10 14 54 12 56 32 C58 50 48 62 32 62 C16 62 10 52 10 34Z" />{/if}
          </g>
          <ellipse class="blush" cx="16" cy="43" rx="4.4" ry="2.6" /><ellipse class="blush" cx="48" cy="43" rx="4.4" ry="2.6" />
        </svg>
        <div class="layer" style:transform={look}><div class="layer eyes">
          <svg class="layer" viewBox="0 0 64 64">
            {#if robot.eyes === 0}<rect x="21" y="26.5" width="6" height="13" rx="3" fill={INK} /><rect x="37" y="26.5" width="6" height="13" rx="3" fill={INK} />
            {:else if robot.eyes === 1}<circle cx="24" cy="33" r="3.6" fill={INK} /><circle cx="40" cy="33" r="3.6" fill={INK} />
            {:else if robot.eyes === 2}<rect x="21" y="26.5" width="6" height="13" rx="3" fill={INK} /><path d="M36.5 34 q3.5 -5 7 0" fill="none" class="stroke-ink" stroke-width="2.8" stroke-linecap="round" />
            {:else if robot.eyes === 3}<path d="M20.5 35 q3.5 -6 7 0 M36.5 35 q3.5 -6 7 0" fill="none" class="stroke-ink" stroke-width="2.8" stroke-linecap="round" />
            {:else}
              <path d="M24 27 l1.9 4.1 4.4 .5 -3.3 3 .9 4.4 -3.9 -2.2 -3.9 2.2 .9 -4.4 -3.3 -3 4.4 -.5Z" fill={INK} />
              <path d="M40 27 l1.9 4.1 4.4 .5 -3.3 3 .9 4.4 -3.9 -2.2 -3.9 2.2 .9 -4.4 -3.3 -3 4.4 -.5Z" fill={INK} />
            {/if}
          </svg>
        </div></div>
      </div>

    {:else if robot.family === 'box'}
      <!-- Box: the desktop companion in the agent's colours, its accessory half as big again so it reads at 32px. -->
      <svg class="layer" viewBox="0 0 64 64"><g transform={BOX}><rect class="box-body" x="15" y="38" width="70" height="50" rx="9" /></g></svg>
      <div class="layer eyes">
        <svg class="layer" viewBox="0 0 64 64"><g transform={BOX}>
          <rect class="box-eye" class:lit={paint.lit} x="34.5" y="54" width="9" height="14" rx="4.5" />
          <rect class="box-eye" class:lit={paint.lit} x="56.5" y="54" width="9" height="14" rx="4.5" />
        </g></svg>
      </div>
      <svg class="layer" viewBox="0 0 64 64"><g transform={BOX}>
        <rect class="box-rim" x="15" y="38" width="70" height="50" rx="9" />
        <rect class="box-lid" x="10" y="26" width="80" height="13" rx="5" />
      </g></svg>
      <svg class="layer led" viewBox="0 0 64 64"><g transform={BOX}><rect class="box-led" x="43" y="30.25" width="14" height="4.5" rx="2.25" /></g></svg>
      <svg class="layer" viewBox="0 0 64 64"><g transform={BOX}><BoxTop top={paint.top} x={50} y={26} scale={1.5} /></g></svg>

    {:else}
      <!-- Retro: a head with a dark screen, the eyes lit on it. The antenna and its lights are a layer that turns round its foot. -->
      <div class="layer antenna" style:--antenna-at="50% {pc(head.y)}">
        <svg class="layer" viewBox="0 0 64 64">
        {#if robot.top === 0}
          <line x1="32" y1={head.y} x2="32" y2={head.y - 8} class="stroke-deep" stroke-width="2.4" />
        {:else if robot.top === 1}
          <line x1="24" y1={head.y} x2="20" y2={head.y - 8} class="stroke-deep" stroke-width="2.2" /><line x1="40" y1={head.y} x2="44" y2={head.y - 8} class="stroke-deep" stroke-width="2.2" />
        {:else if robot.top === 2}
          <line x1="32" y1={head.y} x2="32" y2={head.y - 6} class="stroke-deep" stroke-width="2.4" />
          <ellipse cx="24.5" cy={head.y - 7} rx="7.5" ry="2.2" class="deep" /><ellipse cx="39.5" cy={head.y - 7} rx="7.5" ry="2.2" class="deep" /><circle cx="32" cy={head.y - 7} r="2.2" fill={INK} />
        {/if}
        </svg>
        {#if robot.top === 0}
          <svg class="layer led" viewBox="0 0 64 64"><circle class="bulb" cx="32" cy={head.y - 9} r="3.4" /></svg>
        {:else if robot.top === 1}
          <svg class="layer led" viewBox="0 0 64 64"><circle class="halo" cx="19.5" cy={head.y - 9} r="2.8" /><circle class="halo" cx="44.5" cy={head.y - 9} r="2.8" /></svg>
        {/if}
      </div>
      <svg class="layer" viewBox="0 0 64 64">
        <rect x="20" y={head.y + head.h - 2} width="24" height="30" rx="7" class="deep" />
        <rect x={head.x - 5} y={head.y + head.h / 2 - 6} width="7" height="12" rx="3" class="deep" />
        <rect x={head.x + head.w - 2} y={head.y + head.h / 2 - 6} width="7" height="12" rx="3" class="deep" />
        <rect x={head.x} y={head.y} width={head.w} height={head.h} rx={head.r} class="base" />
        <rect x={screen.x} y={screen.y} width={screen.w} height={screen.h} rx="6" class="screen" />
        {#if head.h - (screen.y - head.y) - screen.h > 8}<path d="M27 {screen.y + screen.h + 4.5} h10" class="stroke-deep" stroke-width="2" stroke-linecap="round" />{/if}
        <ellipse cx={head.x + 9} cy={head.y + 4} rx="5" ry="2" class="shine" />
      </svg>
      <div class="layer" style:transform={look}><div class="layer eyes">
        <svg class="layer" viewBox="0 0 64 64"><g class="lit">
          {#if robot.eyes === 0}<circle cx={lx} cy={sy} r="3.2" /><circle cx={rx} cy={sy} r="3.2" />
          {:else if robot.eyes === 1}<rect x={lx - 2.5} y={sy - 5} width="5" height="10" rx="2.5" /><rect x={rx - 2.5} y={sy - 5} width="5" height="10" rx="2.5" />
          {:else if robot.eyes === 2}<path d="M{lx - 3.5} {sy + 2} q3.5 -6 7 0 M{rx - 3.5} {sy + 2} q3.5 -6 7 0" fill="none" class="stroke-led" stroke-width="2.6" stroke-linecap="round" />
          {:else if robot.eyes === 3}<rect x={32 - screen.w / 3} y={sy - 3} width={screen.w / 1.5} height="6" rx="3" />
          {:else}
            <path d="M{lx} {sy + 3.5} l-4 -4 a2.3 2.3 0 0 1 4 -2.6 a2.3 2.3 0 0 1 4 2.6Z" class="heart" />
            <path d="M{rx} {sy + 3.5} l-4 -4 a2.3 2.3 0 0 1 4 -2.6 a2.3 2.3 0 0 1 4 2.6Z" class="heart" />
          {/if}
        </g></svg>
      </div></div>
    {/if}
  </div>
</div>

<style>
  /* The square clips what moves out of it, as the drawing's own frame did. */
  .robot { position: relative; display: block; width: 100%; height: 100%; overflow: hidden; }
  /* Every layer is the same square. */
  .layer { position: absolute; inset: 0; width: 100%; height: 100%; overflow: visible; }
  .base { fill: var(--rb); }
  .soft { fill: color-mix(in srgb, var(--rb) 30%, var(--robot-shine)); }
  .deep { fill: color-mix(in srgb, var(--rb) 72%, var(--robot-ink)); }
  .stroke-deep { stroke: color-mix(in srgb, var(--rb) 72%, var(--robot-ink)); }
  .stroke-ink { stroke: var(--robot-ink); }
  .stroke-leaf { stroke: color-mix(in srgb, var(--robot-leaf) 75%, var(--robot-ink)); }
  .stroke-halo { stroke: var(--robot-halo); }
  .stroke-led { stroke: var(--robot-led); }
  .face { fill: var(--robot-face); }
  .white { fill: var(--robot-shine); }
  .shine { fill: var(--robot-shine); opacity: 0.3; }
  .blush { fill: var(--robot-blush); opacity: 0.5; }
  .leaf { fill: var(--robot-leaf); }
  .leaf.light { fill: color-mix(in srgb, var(--robot-leaf) 70%, var(--robot-shine)); }
  .lens { fill: color-mix(in srgb, var(--robot-shine) 35%, transparent); stroke: var(--robot-ink); stroke-width: 2; }
  .bow { fill: var(--robot-blush); }
  .bow.knot { fill: color-mix(in srgb, var(--robot-blush) 80%, var(--robot-ink)); }
  .bulb { fill: var(--robot-bulb); }
  .halo { fill: var(--robot-halo); }
  .screen { fill: var(--robot-screen); }
  .lit { fill: var(--robot-led); }
  .heart { fill: var(--robot-blush); }
  .gloss { fill: var(--robot-shine); opacity: 0.45; }
  .petal { fill: var(--robot-blush); }
  .tongue { fill: var(--robot-blush); }
  /* The box: the companion's outline, a lit light on its lid. */
  .box-body { fill: var(--box-body); }
  .box-rim { fill: none; stroke: var(--box-line); stroke-width: 4; stroke-linejoin: round; }
  .box-lid { fill: var(--box-lid); stroke: var(--box-line); stroke-width: 4; stroke-linejoin: round; }
  .box-eye { fill: var(--box-eye); }
  .box-eye.lit { stroke: var(--robot-ink); stroke-width: 2; }
  .box-led { fill: var(--robot-led); stroke: var(--box-line); stroke-width: 1.5; }
  /* The capsule leans round the middle of its face. */
  .tilt { transform: rotate(-11deg) translate(4.6875%, 9.375%); transform-origin: 50% 56.25%; }
  /* A capsule's top turns round the middle of its head, a retro antenna round its foot. */
  .cap { transform-origin: 52% 50%; }
  .antenna { transform-origin: var(--antenna-at); }

  /* A blink at rest, a glance while working, a hop while it waits on the user; moves in hundredths of the square. */
  .eyes { transform-origin: var(--eyes-at); }
  /* Kept on their own layer between blinks: made at each blink, they would be painted again each time. */
  [data-state='idle'] .eyes { will-change: transform; }
  /* At rest a blink about every 4.6 s, started by the page's one timer (`beats.ts`). */
  .robot:global([data-beat-blink])[data-state='idle'] .eyes { animation: robot-blink 0.368s; }
  [data-state='working'] .eyes { animation: robot-glance 2.4s ease-in-out infinite; }
  [data-state='working'] .led { animation: robot-pulse 1.2s ease-in-out infinite; }
  [data-state='waiting'] .whole { animation: robot-hop 1.8s ease-in-out infinite; }
  /* A jelly at work squishes on the spot. */
  [data-family='jelly'][data-state='working'] .whole { transform-origin: 50% 96.875%; animation: robot-squish 0.9s ease-in-out infinite; }
  @keyframes robot-squish { 0%, 100% { transform: scale(1, 1); } 40% { transform: scale(1.07, 0.93); } 70% { transform: scale(0.96, 1.04); } }
  /* The last 8 % of the 4.6 s loop it was: shut at 3/8 of the way. */
  @keyframes robot-blink { 0%, 100% { transform: scaleY(1); } 37.5% { transform: scaleY(0.12); } }
  @keyframes robot-glance { 0%, 20% { transform: translateX(0); } 30%, 50% { transform: translateX(-3.4375%); } 60%, 80% { transform: translateX(3.4375%); } 90%, 100% { transform: translateX(0); } }
  @keyframes robot-hop { 0%, 70%, 100% { transform: translateY(0); } 80% { transform: translateY(-4.6875%); } 90% { transform: translateY(0.78125%); } }
  @keyframes robot-pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.35; } }
  @media (prefers-reduced-motion: reduce) {
    .eyes, .led, .whole { animation: none !important; }
  }
  :global(html[data-motion='reduced']) .robot :is(.eyes, .led, .whole) { animation: none; }
</style>
