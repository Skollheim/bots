/**
 * What Home's live sessions are looked at on, with `?fake=1`: on top of the
 * HUD demo, the thread running the tests works through its steps (a read, a
 * search, an Edit with its diff, a command) and keeps going, and a second one
 * finishes a moment after the island starts following it. The seed's waiting
 * permission and question make the attention card's "1 of 2".
 */
import type { Message, MessagePart, Thread } from '@boite/contracts';
import type { FakeContext } from '@boite/ui/lib/fake-client/context';

type ToolPart = Extract<MessagePart, { type: 'tool' }>;

const WORKING = 't-hud-tests';
const ENDING = 't-hud-readme';

const OLD_QUEUE = `export function next(queue: Job[]): Job | undefined {
  return queue.shift();
}
`;
const NEW_QUEUE = `export function next(queue: Job[]): Job | undefined {
  const ready = queue.findIndex((job) => job.at <= Date.now());
  if (ready < 0) return undefined;
  return queue.splice(ready, 1)[0];
}
`;

function tool(toolId: string, name: string, input: unknown, status: ToolPart['status'], at: number, extra: Partial<ToolPart> = {}): ToolPart {
  return { type: 'tool', toolId, name, input, output: null, status, startedAt: at, finishedAt: status === 'running' ? null : at + 800, ...extra };
}

/** The assistant message a thread's steps live in. */
function working(thread: Thread, id: string, parts: MessagePart[], at: number): Message {
  const turnId = thread.turns.at(-1)?.id ?? 'turn-demo';
  const message: Message = { id, threadId: thread.id, turnId, role: 'assistant', parts, state: 'streaming', createdAt: at };
  thread.messages.push(message);
  return message;
}

/** Sends a part as the core would, and keeps it in the thread so a later read agrees. */
function stream(ctx: FakeContext, thread: Thread, message: Message, part: MessagePart): void {
  const index = part.type === 'tool' ? message.parts.findIndex((entry) => entry.type === 'tool' && entry.toolId === part.toolId) : -1;
  const partIndex = index < 0 ? message.parts.length : index;
  message.parts[partIndex] = part;
  if (part.type === 'tool') thread.progress = { turnId: message.turnId, phase: 'tool', detail: part.name, at: Date.now(), providerAt: Date.now() };
  ctx.emitToThread(thread.id, 'message.part', { threadId: thread.id, messageId: message.id, partIndex, part: structuredClone(part) });
}

/** Runs `then` once the island follows the thread, so the demo never plays to an empty room. */
function whenFollowed(ctx: FakeContext, threadId: string, then: () => void): void {
  let tries = 0;
  const look = setInterval(() => {
    tries += 1;
    if (ctx.bus.subscribed.has(threadId)) {
      clearInterval(look);
      then();
    } else if (tries > 300) clearInterval(look);
  }, 200);
}

export function seedSessionsDemo(ctx: FakeContext): void {
  const now = Date.now();
  const tests = ctx.threads.get(WORKING);
  if (!tests) return;

  // The thread running the tests: three steps behind it, a command on its way.
  const queuePath = 'C:\\src\\notes\\lib\\queue.ts';
  const steps = working(tests, 'm-hud-2', [
    tool('tl-1', 'Read', { file_path: 'C:\\src\\notes\\lib\\scheduler.ts' }, 'done', now - 90_000),
    tool('tl-2', 'Grep', { pattern: 'queue.shift' }, 'done', now - 70_000),
    tool('tl-3', 'Edit', { file_path: queuePath, old_string: OLD_QUEUE, new_string: NEW_QUEUE }, 'done', now - 40_000, {
      documents: [{ kind: 'diff', path: queuePath, oldText: OLD_QUEUE, newText: NEW_QUEUE }]
    }),
    tool('tl-4', 'Bash', { command: 'bun run test --filter queue' }, 'running', now - 20_000)
  ], now - 95_000);

  const script: MessagePart[] = [
    tool('tl-4', 'Bash', { command: 'bun run test --filter queue' }, 'done', now - 20_000),
    tool('tl-5', 'Read', { file_path: 'C:\\src\\notes\\lib\\queue.test.ts' }, 'running', Date.now()),
    tool('tl-5', 'Read', { file_path: 'C:\\src\\notes\\lib\\queue.test.ts' }, 'done', Date.now()),
    tool('tl-6', 'Bash', { command: 'bun run test' }, 'running', Date.now())
  ];
  whenFollowed(ctx, WORKING, () => {
    script.forEach((part, index) => setTimeout(() => stream(ctx, tests, steps, part), 2_500 * (index + 1)));
  });

  // A thread finishing its turn a moment after the island starts following it.
  const started = now - 3 * 60_000 - 20_000;
  const turnId = 'turn-hud-readme';
  const readme: Thread = {
    ...structuredClone(tests),
    id: ENDING,
    projectId: 'p-boite',
    title: 'Tidy the README',
    cwd: 'C:\\src\\boite',
    sessionId: 'sess-hud-readme',
    createdAt: started - 1_000,
    updatedAt: started,
    turns: [{ id: turnId, threadId: ENDING, status: 'running', queuedAt: started - 500, startedAt: started, finishedAt: null, usage: null, error: null }],
    messages: [],
    progress: { turnId, phase: 'tool', detail: 'Edit', at: now - 4_000, providerAt: now - 4_000 }
  };
  const readmePath = 'C:\\src\\boite\\README.md';
  const readmeSteps = working(readme, 'm-readme-1', [
    tool('rd-1', 'Read', { file_path: readmePath }, 'done', started + 5_000),
    tool('rd-2', 'Edit', { file_path: readmePath, old_string: '## Install\n\nRun the script.', new_string: '## Install\n\nRun `bun install`, then `bun run dev`.' }, 'running', now - 4_000)
  ], started + 1_000);
  ctx.threads.set(readme.id, readme);
  ctx.scheduler.running.push({ turnId, threadId: readme.id, startedAt: started });

  whenFollowed(ctx, ENDING, () => {
    setTimeout(() => {
      const edit = readmeSteps.parts[1];
      if (edit?.type === 'tool') stream(ctx, readme, readmeSteps, { ...edit, status: 'done', finishedAt: Date.now() });
      const turn = readme.turns[0];
      if (!turn) return;
      turn.status = 'done';
      turn.finishedAt = Date.now();
      readmeSteps.state = 'complete';
      readme.progress = null;
      ctx.scheduler.running = ctx.scheduler.running.filter((entry) => entry.threadId !== readme.id);
      ctx.emit('turn.finished', structuredClone(turn));
      readme.status = 'idle';
      ctx.touch(readme);
    }, 1_200);
  });
}
