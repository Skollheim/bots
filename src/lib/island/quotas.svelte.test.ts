import type { AccountQuota } from '@boite/contracts';
import { expect, test, vi } from 'vitest';
import type { HudGauge } from '../companion/hud';
import { compactCount, proxyAccounts, QuotaWatch, quotaAccounts, resetIn, tightest, toneOf, tokensOf } from './quotas.svelte';

const HOUR = 3_600_000;

function row(accountId: string, used: number[], over: Partial<AccountQuota> = {}): AccountQuota {
  return {
    accountId,
    providerId: 'claude',
    providerName: 'Claude',
    label: accountId,
    enabled: true,
    status: 'ready',
    checkedAt: 0,
    error: null,
    windows: used.map((usedPercent, index) => ({ id: `w${index}`, label: index === 0 ? '5 hours' : 'Weekly', usedPercent, resetsAt: (index + 1) * HOUR })),
    ...over
  } as AccountQuota;
}

test('a window turns amber under 25 % left and red under 10 %', () => {
  expect(toneOf(25)).toBe('ok');
  expect(toneOf(24)).toBe('amber');
  expect(toneOf(10)).toBe('amber');
  expect(toneOf(9)).toBe('red');
});

test('the accounts come tightest first, each with its windows tightest first', () => {
  const accounts = quotaAccounts([row('roomy', [10, 40]), row('tight', [20, 81])]);
  expect(accounts.map((account) => account.id)).toEqual(['tight', 'roomy']);
  expect(accounts[0]!.bars.map((bar) => bar.left)).toEqual([19, 80]);
  expect(accounts[0]!.tone).toBe('amber');
  expect(tightest(accounts)).toMatchObject({ account: { id: 'tight' }, bar: { label: 'Weekly', left: 19 } });
});

test('rows that say nothing are left out, and nothing left means no pill', () => {
  const accounts = quotaAccounts([
    row('off', [99], { enabled: false }),
    row('disabled', [99], { status: 'disabled' }),
    row('unread', [99], { status: 'unavailable' }),
    row('empty', [])
  ]);
  expect(accounts).toEqual([]);
  expect(tightest(accounts)).toBeNull();
});

test('a share used past the limit reads as nothing left, never below zero', () => {
  expect(quotaAccounts([row('over', [130])])[0]!.bars[0]!.left).toBe(0);
});

test('the proxy gauges join as one bar each, and the pill takes the tightest of both', () => {
  const gauge = (id: string, used: number | null): HudGauge => ({ id, providerId: 'claude', name: id, window: 'Weekly', used, level: 'ok', label: id });
  const proxy = proxyAccounts([gauge('claude:wide', 30), gauge('claude:unknown', null), gauge('claude:tight', 93)]);
  expect(proxy.map((account) => [account.id, account.left, account.tone])).toEqual([
    ['proxy:claude:tight', 7, 'red'],
    ['proxy:claude:wide', 70, 'ok']
  ]);
  expect(proxy[0]!.bars[0]).toMatchObject({ label: 'Weekly', resetsAt: null });
  const core = quotaAccounts([row('core', [80])]);
  expect(tightest(core, proxy)?.account.id).toBe('proxy:claude:tight');
  expect(tightest(core, [])?.account.id).toBe('core');
  expect(tightest([], [])).toBeNull();
});

test('the reset time reads in minutes, hours or days, and not at all once past', () => {
  expect(resetIn(null, 0)).toBeNull();
  expect(resetIn(1_000, 2_000)).toBeNull();
  expect(resetIn(45 * 60_000, 0)).toEqual({ value: 45, unit: 'min' });
  expect(resetIn(3 * HOUR, 0)).toEqual({ value: 3, unit: 'h' });
  expect(resetIn(72 * HOUR, 0)).toEqual({ value: 3, unit: 'd' });
});

test('tokens add up the cache and read at a glance', () => {
  expect(tokensOf({ inputTokens: 1, outputTokens: 2, cacheReadTokens: 3, cacheWriteTokens: 4, costUsdEquivalent: null })).toBe(10);
  expect(tokensOf(null)).toBe(0);
  expect(compactCount(950)).toBe('950');
  expect(compactCount(340_400)).toBe('340k');
  expect(compactCount(1_240_000)).toBe('1.2M');
});

test('the watch reads the core, then takes what it pushes', async () => {
  const handlers = new Map<string, (value: unknown) => void>();
  const client = {
    call: vi.fn(async (method: string) => (method === 'quotas.list' ? [row('a', [50])] : { byThread: {}, total: { inputTokens: 5, outputTokens: 5, cacheReadTokens: 0, cacheWriteTokens: 0, costUsdEquivalent: null } })),
    on: vi.fn((event: string, handler: (value: unknown) => void) => {
      handlers.set(event, handler);
      return () => handlers.delete(event);
    })
  };
  const watch = new QuotaWatch();
  const stop = watch.follow(client as never);
  await vi.waitFor(() => expect(watch.read).toBe(true));
  expect(watch.tightest?.bar.left).toBe(50);
  await vi.waitFor(() => expect(tokensOf(watch.usage)).toBe(10));
  handlers.get('quotas.updated')!([row('a', [95])]);
  expect(watch.tightest?.bar.tone).toBe('red');
  stop();
  expect(handlers.size).toBe(0);
});
