/**
 * The fake cores of the other machines in the group's demo
 * (`machines-demo.ts`): in place of the fake's seed, each has one project, a
 * thread at work in it and an agent of its own. « boite », the server, fixes
 * a game's gameplay (with `ask`, that thread asks to push a moment after it
 * starts) and has Forge; « laptop » writes a site's docs and has Scout.
 */
import type { Message, MessagePart, PermissionRequest, Thread } from '@boite/contracts';
import type { FakeContext } from '@boite/ui/lib/fake-client/context';
import { profile, rowsOf } from './assistant-demo';

export const SERVER_THREAD = 't-srv-gameplay';
export const SERVER_PROJECT = 'p-srv-rives';
export const SERVER_AGENT = 'agent-forge';
export const LAPTOP_THREAD = 't-lap-docs';
export const LAPTOP_AGENT = 'agent-scout';
const ASK_AFTER_MS = 2_000;

/** What one machine of the demo runs: one project, one thread at work with its steps, one agent. */
interface MachineSeed {
  thread: string;
  project: { id: string; name: string; path: string };
  title: string;
  branch: string;
  steps: [name: string, input: unknown, ago: number][];
  agent: { id: string; name: string; domain: string };
  /** How long the thread has been at work. */
  minutes: number;
}

const SEEDS = {
  server: {
    thread: SERVER_THREAD,
    project: { id: SERVER_PROJECT, name: 'Petites-Rives', path: '/srv/petites-rives' },
    title: 'Corriger le gameplay',
    branch: 'fix/gameplay',
    steps: [
      ['Read', { file_path: '/srv/petites-rives/Assets/Scripts/Player/PlayerController.cs' }, 80_000],
      ['Grep', { pattern: 'jumpBuffer' }, 50_000],
      ['Bash', { command: 'dotnet test Gameplay.Tests' }, 15_000]
    ],
    agent: { id: SERVER_AGENT, name: 'Forge', domain: 'Builds and deploys' },
    minutes: 5
  },
  laptop: {
    thread: LAPTOP_THREAD,
    project: { id: 'p-lap-site', name: 'mtsu.dev', path: '/home/demo/mtsu.dev' },
    title: 'Write the install guide',
    branch: 'docs/install',
    steps: [
      ['Read', { file_path: '/home/demo/mtsu.dev/docs/index.md' }, 60_000],
      ['Edit', { file_path: '/home/demo/mtsu.dev/docs/install.md' }, 20_000]
    ],
    agent: { id: LAPTOP_AGENT, name: 'Scout', domain: 'Research on the go' },
    minutes: 2
  }
} satisfies Record<string, MachineSeed>;

type ToolPart = Extract<MessagePart, { type: 'tool' }>;

function tool(toolId: string, name: string, input: unknown, status: ToolPart['status'], at: number): ToolPart {
  return { type: 'tool', toolId, name, input, output: null, status, startedAt: at, finishedAt: status === 'running' ? null : at + 800 };
}

/** A machine's own seed in place of the fake's: `server` or `laptop`; with `ask`, the server's request on its way. */
export function seedMachineDemo(ctx: FakeContext, machine: keyof typeof SEEDS, ask = false): void {
  const spec: MachineSeed = SEEDS[machine];
  const model = [...ctx.threads.values()].find((thread) => !thread.parentThreadId);
  const project = ctx.projects[0];
  if (!model || !project) return;
  const now = Date.now();
  const started = now - spec.minutes * 60_000 - 12_000;
  const turnId = `turn-${spec.thread}`;
  ctx.threads.clear();
  ctx.pendingPermissions.clear();
  ctx.pendingQuestions.clear();
  ctx.importable = [];
  ctx.scheduler = { ...ctx.scheduler, running: [], queued: [] };
  ctx.projects = [{ ...structuredClone(project), ...spec.project }];
  const steps: Message = {
    id: `m-${spec.thread}`,
    threadId: spec.thread,
    turnId,
    role: 'assistant',
    state: 'streaming',
    createdAt: started + 1_000,
    parts: spec.steps.map(([name, input, ago], index) => tool(`${spec.thread}-${index}`, name, input, index === spec.steps.length - 1 ? 'running' : 'done', now - ago))
  };
  const last = spec.steps.at(-1)!;
  const thread: Thread = {
    ...structuredClone(model),
    id: spec.thread,
    projectId: spec.project.id,
    title: spec.title,
    titleSource: 'user',
    cwd: spec.project.path,
    branch: spec.branch,
    status: 'running',
    archived: false,
    pinned: false,
    unread: false,
    sessionId: `sess-${spec.thread}`,
    load: null,
    context: null,
    createdAt: started - 1_000,
    updatedAt: started,
    turns: [{ id: turnId, threadId: spec.thread, status: 'running', queuedAt: started - 500, startedAt: started, finishedAt: null, usage: null, error: null }],
    messages: [steps],
    background: [],
    progress: { turnId, phase: 'tool', detail: last[0], at: now - last[2], providerAt: now - last[2] }
  };
  delete thread.parentThreadId;
  ctx.threads.set(thread.id, thread);
  ctx.scheduler.running.push({ turnId, threadId: thread.id, startedAt: started });
  const agent = profile(spec.agent.id, spec.agent.name, spec.agent.domain, null, now - 3 * 24 * 3_600_000);
  rowsOf(ctx).set(`profile:${agent.id}`, agent);
  if (ask) setTimeout(() => askToPush(ctx, thread), ASK_AFTER_MS);
}

function askToPush(ctx: FakeContext, thread: Thread): void {
  const request: PermissionRequest = {
    id: 'perm-srv-push',
    threadId: thread.id,
    turnId: thread.turns.at(-1)?.id ?? `turn-${thread.id}`,
    toolName: 'Bash',
    input: { command: 'git push origin fix/gameplay', description: 'Push the gameplay fix' },
    description: 'git push origin fix/gameplay',
    createdAt: Date.now()
  };
  ctx.pendingPermissions.set(request.id, {
    request,
    resolve: () => {
      thread.status = 'running';
      ctx.touch(thread);
    }
  });
  thread.status = 'waiting';
  ctx.touch(thread);
  ctx.emit('permission.requested', structuredClone(request));
}
