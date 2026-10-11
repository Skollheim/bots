/**
 * The fake core's side of two captures, with `?fake=1`:
 * - `rule=1`: a command the island's demo pose made a rule for is asked again
 *   on the thread running the tests, a moment after the island follows it, so
 *   Bots answers it on its own (`allow.svelte.ts`);
 * - `pr=green|red`: that thread links pull request #12 once followed, and its
 *   checks run (one pending, then all green, or one failing) so the island's
 *   CI tracking (`pr-watch.svelte.ts`) has something to tell.
 */
import type { PermissionRequest, PullRequestCheck } from '@boite/contracts';
import type { FakeContext, FakeMethods } from '@boite/ui/lib/fake-client/context';

export const DEMO_THREAD = 't-hud-tests';
export const DEMO_COMMAND = 'bun run test';
export const DEMO_PR = 'https://github.com/chris/notes/pull/12';

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

function askAgain(ctx: FakeContext): void {
  const thread = ctx.threads.get(DEMO_THREAD);
  if (!thread) return;
  const request: PermissionRequest = {
    id: 'perm-rule-demo',
    threadId: DEMO_THREAD,
    turnId: thread.turns.at(-1)?.id ?? 'turn-demo',
    toolName: 'Bash',
    input: { command: DEMO_COMMAND, description: 'Run the whole suite' },
    description: DEMO_COMMAND,
    createdAt: Date.now()
  };
  ctx.pendingPermissions.set(request.id, { request, resolve: () => {} });
  ctx.emit('permission.requested', structuredClone(request));
}

/** The checks on each read: pending twice, then done. */
function checksFor(read: number, outcome: 'green' | 'red'): PullRequestCheck[] {
  const lint = { name: 'Lint', state: 'SUCCESS', url: `${DEMO_PR}/checks` };
  if (read < 2) return [lint, { name: 'UI tests', state: 'IN_PROGRESS', url: `${DEMO_PR}/checks` }];
  return [lint, { name: 'UI tests', state: outcome === 'green' ? 'SUCCESS' : 'FAILURE', url: `${DEMO_PR}/checks` }];
}

export function seedAllowDemo(ctx: FakeContext, methods: FakeMethods, params: URLSearchParams): void {
  if (params.get('rule') === '1') whenFollowed(ctx, DEMO_THREAD, () => setTimeout(() => askAgain(ctx), 2_500));
  const outcome = params.get('pr');
  if (outcome !== 'green' && outcome !== 'red') return;
  const review = methods['threads.pullRequestReview'];
  let reads = 0;
  methods['threads.pullRequestReview'] = async (request) => {
    const answer = await review(request);
    return request.url === DEMO_PR ? { ...answer, checks: checksFor(reads++, outcome) } : answer;
  };
  whenFollowed(ctx, DEMO_THREAD, () => setTimeout(() => void methods['threads.linkPullRequest']({ threadId: DEMO_THREAD, url: DEMO_PR }), 1_500));
}
