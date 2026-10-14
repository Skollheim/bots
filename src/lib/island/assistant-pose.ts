/*
 * The assistant's demo poses, for the captures (`?fake=1&pose=open&tab=chat&scene=…`),
 * dev bundle only. `scene` takes a comma list:
 *
 * - `running`: an answer streaming in, a tool at work and Stop showing;
 * - `chips`: two files waiting for the next message;
 * - `menu` / `agents`: the model picker open (on the favorites, as Boite
 *   opens it while some are starred), or the agents menu;
 * - `models`: the picker on the agent's provider, its models listed;
 * - `search`: the picker on OpenCode's long list, searched for `nvidia`;
 * - `effort`: the effort chip's popover open;
 * - `quotas`: the quotas pill's panel open;
 * - `recap`: Home scrolled down to the Today card.
 */
import type { Attachment, Message } from '@boite/contracts';
import type { Companion } from '../companion/companion.svelte';

async function until(ready: () => boolean, tries = 60): Promise<void> {
  for (let tried = 0; tried < tries && !ready(); tried++) await new Promise((resolve) => setTimeout(resolve, 100));
}

const STREAMING = [
  'Going through the log now. So far:',
  '',
  '1. The three retries wait 2, 4 and 8 s, under the 30 s cap.',
  '2. The turn at 02:14 goes back in the queue, as it should.',
  '',
  'Checking the last'
].join('\n');

function streaming(): Message {
  return {
    id: 'pose-live',
    threadId: 'pose',
    turnId: 'pose',
    role: 'assistant',
    state: 'streaming',
    createdAt: Date.now(),
    parts: [
      { type: 'text', text: STREAMING },
      { type: 'tool', toolId: 'pose-tool', name: 'Read', input: { file_path: 'C:\\Users\\demo\\Downloads\\night.log' }, output: null, status: 'running' }
    ]
  };
}

const file = (name: string, mimeType: string): Attachment => ({ kind: 'file', mimeType, data: btoa('demo'), name }) as Attachment;

function click(testId: string): Promise<void> {
  return clickSelector(`[data-testid="${testId}"]`);
}

function clickSelector(selector: string): Promise<void> {
  return until(() => document.querySelector(selector) !== null).then(() => {
    document.querySelector<HTMLElement>(selector)?.click();
  });
}

export async function strikeAssistantPose(companion: Companion, params: URLSearchParams): Promise<void> {
  const scenes = new Set((params.get('scene') ?? '').split(',').filter(Boolean));
  if (scenes.size === 0) return;
  const assistant = companion.assistant;
  await until(() => assistant.agent !== null && assistant.bubbles.length > 0);
  if (scenes.has('chips')) companion.attached.held = [file('night.log', 'text/plain'), file('retries.png', 'image/png')];
  if (scenes.has('running')) {
    assistant.sending = true;
    assistant.stream = [streaming()];
  }
  if (scenes.has('menu') || scenes.has('models') || scenes.has('search')) await click('composer-picker');
  if (scenes.has('models')) await clickSelector('[data-testid="composer-picker-menu"] [data-provider="claude"]');
  if (scenes.has('search')) {
    await clickSelector('[data-testid="composer-picker-menu"] [data-provider="opencode"]');
    await until(() => document.querySelector('[data-testid="picker-search"]') !== null);
    const search = document.querySelector<HTMLInputElement>('[data-testid="picker-search"]');
    if (search) {
      search.value = 'nvidia';
      search.dispatchEvent(new Event('input', { bubbles: true }));
    }
  }
  if (scenes.has('effort')) await click('composer-effort');
  if (scenes.has('agents')) await click('assistant-agent');
  if (scenes.has('quotas')) await click('island-quotas');
  if (scenes.has('recap')) {
    await until(() => document.querySelector('[data-testid="island-recap"]') !== null);
    document.querySelector('[data-testid="island-recap"]')?.scrollIntoView({ block: 'end' });
  }
}
