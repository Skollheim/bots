/*
 * Measures what each demo pose costs while it sits still: the main thread's
 * time (Performance.getMetrics deltas) and the frame intervals a rAF probe
 * sees, in headless Chrome driven over plain CDP, GPU on, never SwiftShader.
 * `open-close` opens the island from the pill and closes it, four times.
 *
 * Measure the production build with the poses in (`perf.vite.config.ts`):
 * the dev server's Svelte traces every state write, and that tracing is
 * most of what it would measure.
 *
 *   bun x vite build --config scripts/perf.vite.config.ts
 *   bun x vite preview --config scripts/perf.vite.config.ts --port 5282
 *   bun scripts/perf-probe.ts --base http://localhost:5282 [--seconds 10]
 *     [--only closed,deck-music] [--json out.json] [--profile] [--frames] [--unthrottled]
 *
 * Each pose runs two phases of `--seconds`: the metrics alone, so a probe
 * does not add frames to an idle page, then the rAF probe for the intervals.
 * `--profile` adds the functions that took the most main thread time
 * during the metrics phase, by self time, a browser call named with the
 * page's function that made it.
 * `--frames` traces the compositor over the metrics phase instead and
 * counts, per second, the frames it drew (`DrawFrame`), the frames it was
 * woken for (`BeginFrame`) and the frames the display put out. At the
 * default 60 Hz, a page that animates smoothly draws about 60 a second and
 * would draw 240 on a 240 Hz screen; a page at rest draws none.
 * `--unthrottled` makes Chrome draw as fast as the GPU allows: on a
 * machine whose GPU is shared (a game, another guest), it takes that GPU
 * from them; keep to the 60 Hz runs there.
 * `--unthrottled` lifts Chrome's frame cap, the closest a headless browser
 * gets to a high refresh screen: what the page does per frame then shows as
 * frames it cannot keep. A headless Linux Chrome says nothing of WebView2's
 * own compositor or of a real 144 or 240 Hz display's vsync.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

/** `motion`: the island opened from the pill and closed again, four times, measured while it moves. */
type Pose = { name: string; query: string; motion?: boolean };

const FAMILIES = ['box', 'jelly', 'bubble', 'capsule', 'retro'];

/** The poses of `src/lib/island/pose.ts` the measures go through. */
export const POSES: Pose[] = [
  { name: 'closed', query: 'pose=collapsed&calm=1' },
  { name: 'open-close', query: 'pose=collapsed&calm=1', motion: true },
  { name: 'closed-working', query: 'pose=collapsed' },
  { name: 'peek', query: 'pose=peek&calm=1' },
  ...['threads', 'today', 'chat', 'stats', 'music', 'apps', 'clipboard', 'wallpaper', 'system'].map((tab) => ({ name: `open-${tab}`, query: `pose=open&tab=${tab}&calm=1` })),
  { name: 'deck-music', query: 'pose=deck&tab=music&calm=1' },
  { name: 'assistant', query: 'pose=open&tab=chat&scene=running&calm=1' },
  { name: 'desktop-idle', query: 'pose=desktop&calm=1&sessions=none' },
  { name: 'desktop-working', query: 'pose=desktop' },
  // At rest, for `--frames`: each family's companion awake and asleep (the gallery, `MascotGallery.svelte`), and in the app.
  ...FAMILIES.flatMap((family) => [
    { name: `rest-${family}`, query: `view=mascots&family=${family}&mood=idle` },
    { name: `asleep-${family}`, query: `view=mascots&family=${family}&mood=asleep` },
    { name: `closed-${family}`, query: `pose=collapsed&calm=1&skin=${family}` },
    { name: `desktop-${family}`, query: `pose=desktop&calm=1&skin=${family}` }
  ])
];

const METRICS = ['TaskDuration', 'ScriptDuration', 'LayoutDuration', 'RecalcStyleDuration', 'LayoutCount', 'RecalcStyleCount'] as const;

function arg(name: string): string | null {
  const at = process.argv.indexOf(`--${name}`);
  return at < 0 ? null : (process.argv[at + 1] ?? '');
}

/** One CDP connection to a page, its replies matched by id. */
export class Cdp {
  private next = 0;
  private waiting = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private handlers = new Map<string, ((params: unknown) => void)[]>();
  /** Hears an event of the page (`Tracing.dataCollected`). */
  on(method: string, handler: (params: unknown) => void): void {
    this.handlers.set(method, [...(this.handlers.get(method) ?? []), handler]);
  }
  private constructor(private socket: WebSocket) {
    socket.addEventListener('message', (event) => {
      const data = JSON.parse(String(event.data)) as { id?: number; method?: string; params?: unknown; result?: unknown; error?: { message: string } };
      if (data.method) for (const handler of this.handlers.get(data.method) ?? []) handler(data.params);
      if (data.id === undefined) return;
      const pending = this.waiting.get(data.id);
      this.waiting.delete(data.id);
      if (data.error) pending?.reject(new Error(data.error.message));
      else pending?.resolve(data.result);
    });
  }
  static open(url: string): Promise<Cdp> {
    return new Promise((resolve, reject) => {
      const socket = new WebSocket(url);
      socket.addEventListener('open', () => resolve(new Cdp(socket)));
      socket.addEventListener('error', () => reject(new Error(`CDP connection to ${url} failed`)));
    });
  }
  send<T = Record<string, unknown>>(method: string, params: Record<string, unknown> = {}): Promise<T> {
    const id = ++this.next;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => this.waiting.set(id, { resolve: resolve as (value: unknown) => void, reject }));
  }
  async evaluate<T>(expression: string): Promise<T> {
    const reply = await this.send<{ result: { value: T }; exceptionDetails?: { text: string } }>('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
    if (reply.exceptionDetails) throw new Error(reply.exceptionDetails.text);
    return reply.result.value;
  }
  close(): void {
    this.socket.close();
  }
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function metrics(cdp: Cdp): Promise<Record<string, number>> {
  const { metrics: list } = await cdp.send<{ metrics: { name: string; value: number }[] }>('Performance.getMetrics');
  return Object.fromEntries(list.map(({ name, value }) => [name, value]));
}

/** What runs on the page: its CSS animations and transitions, by animated property. */
const ANIMATIONS = `(() => {
  const running = document.getAnimations().filter((a) => a.playState === 'running');
  const props = {};
  for (const a of running) {
    const frames = a.effect && a.effect.getKeyframes ? a.effect.getKeyframes() : [];
    const keys = new Set(frames.flatMap((f) => Object.keys(f).filter((k) => !['offset', 'computedOffset', 'easing', 'composite'].includes(k))));
    const name = (a.animationName || a.transitionProperty || 'js') + ':' + [...keys].join('+');
    props[name] = (props[name] || 0) + 1;
  }
  return { running: running.length, props };
})()`;

/** Opens the island with a click on the pill, closes it with Escape, and keeps the frame times while it moves. */
const MOTION = `(async () => {
  const stamps = [];
  const record = (ms) => new Promise((resolve) => {
    const end = performance.now() + ms;
    const tick = (now) => { stamps.push(now); if (now < end) requestAnimationFrame(tick); else resolve(); };
    requestAnimationFrame(tick);
  });
  const gaps = [];
  for (let round = 0; round < 4; round++) {
    for (const move of ['open', 'close']) {
      stamps.length = 0;
      if (move === 'open') document.querySelector('.island .bar')?.click();
      else dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      await record(900);
      for (let i = 1; i < stamps.length; i++) gaps.push(stamps[i] - stamps[i - 1]);
    }
  }
  return gaps;
})()`;

const PROBE = (ms: number) => `new Promise((resolve) => {
  const stamps = [];
  const end = performance.now() + ${ms};
  const tick = (now) => { stamps.push(now); if (now < end) requestAnimationFrame(tick); else resolve(stamps); };
  requestAnimationFrame(tick);
})`;

function quantile(sorted: number[], q: number): number {
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

export type PoseResult = {
  pose: string;
  perSecond: Record<(typeof METRICS)[number], number>;
  frames: { count: number; p50: number; p95: number; p99: number; dropped: number };
  animations: { running: number; props: Record<string, number> };
  /** With `--frames`: what the compositor did per second over the phase (`DrawFrame`: frames drawn; `BeginFrame`: woken for a frame; `swaps`: frames the display put out). */
  compositor?: { draws: number; wakes: number; swaps: number };
  /** With `--profile`: the heaviest functions, self time in ms over the phase. */
  hot?: { at: string; ms: number }[];
};

type CallFrame = { functionName: string; url: string; lineNumber: number; columnNumber: number };
type Profile = { nodes: { id: number; callFrame: CallFrame; children?: number[] }[]; samples: number[]; timeDeltas: number[] };

function where(frame: CallFrame): string {
  const file = frame.url.replace(/^.*\/(src|node_modules|vendor|assets)\//, '$1/').replace(/\?.*$/, '');
  return `${frame.functionName || '(anonymous)'} ${file}:${frame.lineNumber + 1}:${frame.columnNumber + 1}`;
}

/** Self time by function, heaviest first; idle and the program's own bookkeeping left out. */
function hottest(profile: Profile, count = 12): { at: string; ms: number }[] {
  const byId = new Map(profile.nodes.map((node) => [node.id, node.callFrame]));
  const parent = new Map<number, number>();
  for (const node of profile.nodes) for (const child of node.children ?? []) parent.set(child, node.id);
  const self = new Map<string, number>();
  profile.samples.forEach((id, index) => {
    const frame = byId.get(id);
    if (!frame || ['(idle)', '(program)', '(root)'].includes(frame.functionName)) return;
    // A browser call (a layout read, a style write) is named with the page's function that made it.
    const caller = frame.url ? null : byId.get(parent.get(id) ?? -1);
    const at = caller?.url ? `${frame.functionName} < ${where(caller)}` : where(frame);
    self.set(at, (self.get(at) ?? 0) + (profile.timeDeltas[index] ?? 0) / 1000);
  });
  return [...self].sort((a, b) => b[1] - a[1]).slice(0, count).map(([at, ms]) => ({ at, ms: Math.round(ms * 10) / 10 }));
}

async function measure(port: number, base: string, pose: Pose, seconds: number, profile = false, frames = false): Promise<PoseResult> {
  const created = (await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()) as { id: string; webSocketDebuggerUrl: string };
  const cdp = await Cdp.open(created.webSocketDebuggerUrl);
  try {
    await cdp.send('Page.enable');
    await cdp.send('Performance.enable', { timeDomain: 'threadTicks' });
    await cdp.send('Page.navigate', { url: `${base}/?fake=1&${pose.query}` });
    await cdp.evaluate(`new Promise((r) => document.readyState === 'complete' ? r() : addEventListener('load', () => r()))`);
    // The pose lands, its entrance animations end.
    await sleep(4000);
    if (profile) {
      await cdp.send('Profiler.enable');
      await cdp.send('Profiler.setSamplingInterval', { interval: 200 });
      await cdp.send('Profiler.start');
    }
    const traced: { name: string }[] = [];
    let traceDone: Promise<void> = Promise.resolve();
    if (frames) {
      cdp.on('Tracing.dataCollected', (params) => traced.push(...(params as { value: { name: string }[] }).value));
      traceDone = new Promise((resolve) => cdp.on('Tracing.tracingComplete', () => resolve()));
      await cdp.send('Tracing.start', { traceConfig: { includedCategories: ['disabled-by-default-devtools.timeline.frame', 'viz'] }, transferMode: 'ReportEvents' });
    }
    const before = await metrics(cdp);
    const moving = pose.motion ? cdp.evaluate<number[]>(MOTION) : sleep(seconds * 1000).then(() => null);
    const motionGaps = await moving;
    const after = await metrics(cdp);
    let compositor: PoseResult['compositor'];
    if (frames) {
      await cdp.send('Tracing.end');
      await traceDone;
      const count = (name: string) => traced.filter((event) => event.name === name).length / seconds;
      compositor = { draws: count('DrawFrame'), wakes: count('BeginFrame'), swaps: count('Display::DrawAndSwap') };
    }
    const hot = profile ? hottest((await cdp.send<{ profile: Profile }>('Profiler.stop')).profile) : undefined;
    // A moving pose lasts as long as its moves: 4 rounds of two 900 ms moves.
    const span = motionGaps ? 7.2 : seconds;
    const perSecond = Object.fromEntries(
      METRICS.map((key) => {
        const delta = (after[key] ?? 0) - (before[key] ?? 0);
        // Durations come in seconds: ms of main thread per second of wall time.
        return [key, key.endsWith('Duration') ? (delta * 1000) / span : delta / span];
      })
    ) as PoseResult['perSecond'];
    const animations = await cdp.evaluate<PoseResult['animations']>(ANIMATIONS);
    const stamps = motionGaps || frames ? [] : await cdp.evaluate<number[]>(PROBE(seconds * 1000));
    const gaps = (motionGaps ?? stamps.slice(1).map((stamp, index) => stamp - stamps[index]!)).sort((a, b) => a - b);
    const p50 = quantile(gaps, 0.5);
    return {
      pose: pose.name,
      perSecond,
      frames: { count: gaps.length, p50, p95: quantile(gaps, 0.95), p99: quantile(gaps, 0.99), dropped: gaps.filter((gap) => gap > p50 * 1.5).length },
      animations,
      ...(compositor ? { compositor } : {}),
      ...(hot ? { hot } : {})
    };
  } finally {
    cdp.close();
    await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`).catch(() => undefined);
  }
}

export async function launch(unthrottled: boolean): Promise<{ port: number; stop: () => void }> {
  const profile = mkdtempSync(join(tmpdir(), 'bots-perf-'));
  const flags = [
    '--headless=new',
    '--remote-debugging-port=0',
    `--user-data-dir=${profile}`,
    '--mute-audio',
    '--enable-gpu',
    '--use-gl=angle',
    '--use-angle=gl-egl',
    '--disable-software-rasterizer',
    '--window-size=1280,900',
    '--no-first-run',
    ...(unthrottled ? ['--disable-frame-rate-limit', '--disable-gpu-vsync'] : [])
  ];
  const chrome = spawn(process.env.CHROME ?? '/usr/bin/google-chrome', flags, { stdio: 'ignore' });
  const stop = () => {
    chrome.kill();
    rmSync(profile, { recursive: true, force: true });
  };
  for (let tries = 0; tries < 100; tries++) {
    try {
      const port = Number(readFileSync(join(profile, 'DevToolsActivePort'), 'utf8').split('\n')[0]);
      if (port) return { port, stop };
    } catch {
      /* not written yet */
    }
    await sleep(100);
  }
  stop();
  throw new Error('Chrome did not open its DevTools port');
}

/** Refuses a software renderer: its numbers say nothing about a real GPU. */
async function renderer(port: number): Promise<string> {
  const created = (await (await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method: 'PUT' })).json()) as { id: string; webSocketDebuggerUrl: string };
  const cdp = await Cdp.open(created.webSocketDebuggerUrl);
  const name = await cdp.evaluate<string | null>(`(() => { const gl = document.createElement('canvas').getContext('webgl2'); const d = gl && gl.getExtension('WEBGL_debug_renderer_info'); return d ? gl.getParameter(d.UNMASKED_RENDERER_WEBGL) : null; })()`);
  cdp.close();
  await fetch(`http://127.0.0.1:${port}/json/close/${created.id}`).catch(() => undefined);
  if (!name || /swiftshader|llvmpipe|softpipe/i.test(name)) throw new Error(`Hardware rendering unavailable: ${name}`);
  return name;
}

const fixed = (value: number, digits = 1) => value.toFixed(digits);

export function table(results: PoseResult[]): string {
  const head = '| Pose | Task ms/s | Script ms/s | Layout ms/s | Style ms/s | Layouts/s | Styles/s | Frame p50 | p95 | p99 | Dropped | Running anims |';
  const rows = results.map(({ pose, perSecond: m, frames: f, animations: a }) =>
    `| ${pose} | ${fixed(m.TaskDuration)} | ${fixed(m.ScriptDuration)} | ${fixed(m.LayoutDuration, 2)} | ${fixed(m.RecalcStyleDuration, 2)} | ${fixed(m.LayoutCount)} | ${fixed(m.RecalcStyleCount)} | ${fixed(f.p50)} | ${fixed(f.p95)} | ${fixed(f.p99)} | ${f.dropped} | ${a.running} |`
  );
  return [head, '|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|', ...rows].join('\n');
}

/** With `--frames`: the compositor's work per second, pose by pose. */
export function framesTable(results: PoseResult[]): string {
  const head = '| Pose | Frames drawn/s | Compositor wakes/s | Display swaps/s | Task ms/s | Running anims |';
  const rows = results.map(({ pose, compositor: c, perSecond: m, animations: a }) => `| ${pose} | ${fixed(c?.draws ?? 0)} | ${fixed(c?.wakes ?? 0)} | ${fixed(c?.swaps ?? 0)} | ${fixed(m.TaskDuration)} | ${a.running} |`);
  return [head, '|---|---:|---:|---:|---:|---:|', ...rows].join('\n');
}

if (import.meta.main) {
  const base = arg('base') ?? 'http://localhost:5174';
  const seconds = Number(arg('seconds') ?? 10);
  const only = arg('only')?.split(',');
  const poses = only ? POSES.filter(({ name }) => only.includes(name)) : POSES;
  const { port, stop } = await launch(process.argv.includes('--unthrottled'));
  try {
    console.log(`GPU: ${await renderer(port)}`);
    // A first load warms Vite's transforms, kept out of the numbers.
    await measure(port, base, poses[0]!, 1);
    const results: PoseResult[] = [];
    for (const pose of poses) {
      const result = await measure(port, base, pose, seconds, process.argv.includes('--profile'), process.argv.includes('--frames'));
      results.push(result);
      for (const { at, ms } of result.hot ?? []) console.error(`  ${ms.toFixed(1)} ms  ${at}`);
      console.error(`${pose.name}: task ${fixed(result.perSecond.TaskDuration)} ms/s, frames p50 ${fixed(result.frames.p50)} ms, anims ${JSON.stringify(result.animations.props)}`);
    }
    console.log(process.argv.includes('--frames') ? framesTable(results) : table(results));
    const json = arg('json');
    if (json) writeFileSync(json, JSON.stringify(results, null, 2));
  } finally {
    stop();
  }
}
