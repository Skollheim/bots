import { describe, expect, it } from 'vitest';
import type { Proc, Sample } from './native';
import { formatBytes, percent, processLabel, slowQuestion, topProcesses, uptimeOf } from './system';

const GB = 1024 ** 3;
const proc = (name: string, cpu: number, memory: number, pid = name.length): Proc => ({ pid, name, cpu, memory, started: 1, protected: false });

describe('system readings', () => {
  it('formats sizes', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512 * 1024 ** 2)).toBe('512 MB');
    expect(formatBytes(3.44 * GB)).toBe('3.4 GB');
    expect(formatBytes(3.44 * GB, ',')).toBe('3,4 GB');
    expect(formatBytes(953 * GB)).toBe('953 GB');
    expect(formatBytes(1.8 * 1024 * GB)).toBe('1.8 TB');
    expect(formatBytes(-5)).toBe('0 B');
  });

  it('splits the uptime', () => {
    expect(uptimeOf(3 * 86_400 + 5 * 3_600 + 42 * 60 + 59)).toEqual({ days: 3, hours: 5, minutes: 42 });
    expect(uptimeOf(59)).toEqual({ days: 0, hours: 0, minutes: 0 });
  });

  it('works out shares', () => {
    expect(percent(1, 4)).toBe(25);
    expect(percent(5, 0)).toBe(0);
    expect(percent(9, 4)).toBe(100);
  });

  it('ranks the busiest processes', () => {
    const rows = [proc('a.exe', 1, 5 * GB, 1), proc('b.exe', 9, 1 * GB, 2), proc('c.exe', 9, 2 * GB, 3), proc('d.exe', 4, 0, 4), proc('e.exe', 0, 0, 5), proc('f.exe', 0, 0, 6)];
    expect(topProcesses(rows, 'cpu').map((row) => row.name)).toEqual(['b.exe', 'c.exe', 'd.exe', 'a.exe', 'e.exe']);
    expect(topProcesses(rows, 'memory', 2).map((row) => row.name)).toEqual(['a.exe', 'c.exe']);
    expect(processLabel('Unity.EXE')).toBe('Unity');
  });

  it('puts the readings into the question', () => {
    const sample: Sample = {
      cpu: 87.4,
      memoryUsed: 30 * GB,
      memoryTotal: 32 * GB,
      drives: [{ mount: 'C:', label: 'Windows', total: 100 * GB, free: 2 * GB }],
      uptime: 90_000,
      processes: [proc('Unity.exe', 60, 8 * GB, 1), proc('chrome.exe', 12, 3 * GB, 2)]
    };
    const text = slowQuestion(sample, 'Why?');
    expect(text.startsWith('Why?\n')).toBe(true);
    expect(text).toContain('CPU: 87 %');
    expect(text).toContain('Memory: 30 GB / 32 GB (94 %)');
    expect(text).toContain('Disk C:: 2.0 GB free of 100 GB');
    expect(text).toContain('Uptime: 1 d 1 h');
    expect(text).toContain('- Unity.exe: 60.0 % CPU, 8.0 GB');
  });
});
