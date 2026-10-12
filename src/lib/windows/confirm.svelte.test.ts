import { describe, expect, it } from 'vitest';
import { InlineConfirm, type ConfirmTimers } from './confirm.svelte';
import { LazyImages } from './images.svelte';

function fakeTimers() {
  const pending = new Map<number, () => void>();
  let next = 0;
  const timers: ConfirmTimers = {
    set: (run) => {
      next += 1;
      pending.set(next, run);
      return next;
    },
    clear: (handle) => pending.delete(handle as number)
  };
  const fire = () => [...pending.entries()].forEach(([id, run]) => (pending.delete(id), run()));
  return { timers, pending, fire };
}

describe('inline confirm', () => {
  it('arms one key, confirms it once', () => {
    const { timers } = fakeTimers();
    const confirm = new InlineConfirm(4_000, timers);
    expect(confirm.confirm('power:restart')).toBe(false);
    confirm.arm('power:restart');
    expect(confirm.is('power:restart')).toBe(true);
    expect(confirm.confirm('power:shutdown')).toBe(false);
    expect(confirm.confirm('power:restart')).toBe(true);
    expect(confirm.armed).toBeNull();
    expect(confirm.confirm('power:restart')).toBe(false);
  });

  it('disarms by itself, and when another is armed', () => {
    const { timers, pending, fire } = fakeTimers();
    const confirm = new InlineConfirm(4_000, timers);
    confirm.arm('a');
    confirm.arm('b');
    expect(pending.size).toBe(1);
    expect(confirm.armed).toBe('b');
    fire();
    expect(confirm.armed).toBeNull();
    confirm.arm('c');
    confirm.dispose();
    expect(pending.size).toBe(0);
    expect(confirm.armed).toBeNull();
  });
});

describe('lazy images', () => {
  it('loads each key once, a few at a time', async () => {
    const asked: string[] = [];
    const waiting: (() => void)[] = [];
    const images = new LazyImages(
      (key) =>
        new Promise<string | null>((resolve) => {
          asked.push(key);
          waiting.push(() => resolve(key === 'none' ? null : `data:${key}`));
        }),
      2
    );
    for (const key of ['a', 'b', 'none', 'a']) images.want(key);
    expect(asked).toEqual(['a', 'b']);
    waiting.shift()!();
    await new Promise((settled) => setTimeout(settled));
    expect(images.get('a')).toBe('data:a');
    expect(asked).toEqual(['a', 'b', 'none']);
    waiting.splice(0).forEach((resolve) => resolve());
    await new Promise((settled) => setTimeout(settled));
    expect(images.get('none')).toBeNull();
    expect(images.get('b')).toBe('data:b');
  });

  it('forgets the queue when the tab goes, and keeps a failed load as none', async () => {
    const images = new LazyImages((key) => (key === 'bad' ? Promise.reject(new Error('x')) : new Promise<string | null>(() => {})), 1);
    images.want('slow');
    images.want('queued');
    images.drop();
    images.want('queued');
    expect(images.get('queued')).toBeUndefined();
    const failing = new LazyImages(() => Promise.reject(new Error('x')));
    failing.want('bad');
    await new Promise((settled) => setTimeout(settled));
    expect(failing.get('bad')).toBeNull();
  });
});
