/*
 * The deck's top-left character: the Chat's agent, which a click turns to the
 * next one, kept for the next launch; with one agent, a click pokes it.
 */
import { afterEach, expect, test } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import type { AgentProfile, AgentsSnapshot } from '@boite/contracts';
import type { Companion, Member } from '../../../lib/companion/companion.svelte';
import { Assistant } from '../../../lib/island/assistant.svelte';
import { fill, strings } from '../../../lib/strings';
import DeckAgent from './DeckAgent.svelte';

const profile = (id: string, name: string): AgentProfile =>
  ({ id, revision: 1, createdAt: 0, updatedAt: 0, name, domain: '', instructions: '', avatar: '', selection: { providerId: 'claude', accountId: 'a', model: null, effort: null, permissionMode: 'default' }, status: 'active', tools: [], accountIntegration: 'provider' }) as AgentProfile;

const snapshotOf = (...profiles: AgentProfile[]) => ({ profiles, messages: [], sessions: [], work: [], memories: [], deliveries: [], more: { message: false } }) as unknown as AgentsSnapshot;

class FakeCompanion {
  kept: string | null = null;
  pokes: string[] = [];
  bounces: string[] = [];
  readonly assistant: Assistant;
  readonly members: Member[];
  readonly active: Member;
  dropped = false;
  boings: Record<string, number> = {};
  dizzy: Record<string, boolean> = {};
  notes = { alarms: [] };
  mood = { mood: 'idle', busy: false };
  pointerOn = false;
  look = {};
  blocking = 0;
  senses = { pointer: null };
  dragging = false;

  constructor(snapshot: AgentsSnapshot, kept: string | null = null) {
    this.kept = kept;
    this.assistant = new Assistant({
      client: () => null,
      snapshot: () => snapshot,
      reload: () => {},
      remembered: () => this.kept,
      remember: (key: string) => void (this.kept = key),
      fallback: () => null,
      outgoing: () => [],
      keep: async () => [],
      sent: () => {},
      giveBack: () => {},
      context: () => ''
    } as unknown as ConstructorParameters<typeof Assistant>[0]);
    const lead = snapshot.profiles[0]!;
    this.active = { id: lead.id, name: lead.name, skin: null, talk: { thinking: false } } as unknown as Member;
    this.members = [this.active];
  }

  poke(id: string) {
    this.pokes.push(id);
  }
  bounce(id: string) {
    this.bounces.push(id);
  }
  onpress() {}
  onmove() {}
  onrelease() {}
}

let shown: { part: Record<string, unknown>; target: HTMLElement } | null = null;

function show(companion: FakeCompanion): HTMLElement {
  const target = document.body.appendChild(document.createElement('div'));
  const props = { companion: companion as unknown as Companion, lead: companion.members[0]!, cheering: false, reduced: true };
  shown = { part: mount(DeckAgent, { target, props }), target };
  flushSync();
  return target;
}

afterEach(() => {
  if (shown) {
    unmount(shown.part);
    shown.target.remove();
    shown = null;
  }
});

const robotOf = (target: HTMLElement) => target.querySelector<HTMLButtonElement>('[data-testid=island-robot]')!;

test('a click swaps to the next agent, which the Chat talks to and keeps, then round to the first', () => {
  const companion = new FakeCompanion(snapshotOf(profile('bots', 'Bots'), profile('nuno', 'Nuno')));
  const target = show(companion);
  const robot = robotOf(target);
  expect(robot.dataset.agent).toBe('bots');
  expect(robot.getAttribute('aria-label')).toBe(fill(strings.island.agentSwap.label, { name: 'Bots', next: 'Nuno' }));
  expect(robot.title).toBe(fill(strings.island.agentSwap.tip, { next: 'Nuno' }));

  robot.click();
  flushSync();
  expect(companion.assistant.agentId).toBe('nuno');
  expect(companion.kept).toBe('nuno');
  expect(companion.bounces).toEqual(['nuno']);
  expect(robotOf(target).dataset.agent).toBe('nuno');
  expect(target.querySelector('[data-testid=island-agent-name]')?.textContent).toContain('Nuno');
  expect(robotOf(target).getAttribute('aria-label')).toBe(fill(strings.island.agentSwap.label, { name: 'Nuno', next: 'Bots' }));

  robotOf(target).click();
  flushSync();
  expect(companion.assistant.agentId).toBe('bots');
  expect(companion.kept).toBe('bots');
  expect(companion.pokes).toEqual([]);
});

test('the kept agent shows first at the next launch', () => {
  const target = show(new FakeCompanion(snapshotOf(profile('bots', 'Bots'), profile('nuno', 'Nuno')), 'nuno'));
  expect(robotOf(target).dataset.agent).toBe('nuno');
});

test('with one agent, a click pokes it as before and nothing swaps', () => {
  const companion = new FakeCompanion(snapshotOf(profile('bots', 'Bots')));
  const target = show(companion);
  const robot = robotOf(target);
  expect(robot.getAttribute('aria-label')).toBe(fill(strings.island.robot, { name: 'Bots' }));
  robot.click();
  flushSync();
  expect(companion.pokes).toEqual(['bots']);
  expect(companion.kept).toBeNull();
  expect(robotOf(target).dataset.agent).toBe('bots');
});

test('a drag that just ended is no click', () => {
  const companion = new FakeCompanion(snapshotOf(profile('bots', 'Bots'), profile('nuno', 'Nuno')));
  const target = show(companion);
  companion.dropped = true;
  robotOf(target).click();
  flushSync();
  expect(companion.assistant.agentId).toBe('bots');
  expect(companion.kept).toBeNull();
});
