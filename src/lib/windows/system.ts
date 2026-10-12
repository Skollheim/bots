/*
 * The system tab's pure part: how its numbers read, which processes it
 * lists, and the question "Why is it slow?" puts to the chat.
 */
import type { Proc, Sample } from './native';
import type { ProcessSort } from './prefs';

const UNITS = ['B', 'KB', 'MB', 'GB', 'TB'] as const;

/** A size in bytes, with one decimal below 10 of a unit: 512 MB, 3.4 GB, 1.8 TB. */
export function formatBytes(bytes: number, decimal = '.'): string {
  let value = Math.max(0, bytes);
  let unit = 0;
  while (value >= 1024 && unit < UNITS.length - 1) {
    value /= 1024;
    unit += 1;
  }
  const shown = value < 10 && unit > 0 ? (Math.round(value * 10) / 10).toFixed(1) : String(Math.round(value));
  return `${shown.replace('.', decimal)} ${UNITS[unit]}`;
}

export interface Uptime { days: number; hours: number; minutes: number }

export function uptimeOf(seconds: number): Uptime {
  const total = Math.max(0, Math.floor(seconds / 60));
  return { days: Math.floor(total / 1440), hours: Math.floor((total % 1440) / 60), minutes: total % 60 };
}

/** A share from 0 to 100, rounded for a tile. */
export const percent = (part: number, whole: number): number => (whole > 0 ? Math.min(100, Math.max(0, Math.round((part / whole) * 100))) : 0);

/** The five busiest processes by `sort`, the busiest first; ties keep the name order. */
export function topProcesses(processes: readonly Proc[], sort: ProcessSort, count = 5): Proc[] {
  const key = (proc: Proc) => (sort === 'cpu' ? proc.cpu : proc.memory);
  return [...processes].sort((a, b) => key(b) - key(a) || a.name.localeCompare(b.name)).slice(0, count);
}

/** A process's name without `.exe`. */
export const processLabel = (name: string): string => name.replace(/\.exe$/i, '');

/**
 * The question "Why is it slow?" sends: the readings as plain lines, so the
 * assistant can answer from them. `intro` is the localized sentence before.
 */
export function slowQuestion(sample: Sample, intro: string): string {
  const lines = [
    intro,
    '',
    `CPU: ${Math.round(sample.cpu)} %`,
    `Memory: ${formatBytes(sample.memoryUsed)} / ${formatBytes(sample.memoryTotal)} (${percent(sample.memoryUsed, sample.memoryTotal)} %)`,
    ...sample.drives.map((drive) => `Disk ${drive.mount}: ${formatBytes(drive.free)} free of ${formatBytes(drive.total)}`),
    `Uptime: ${formatUptimeEn(sample.uptime)}`,
    '',
    'Busiest by CPU:',
    ...topProcesses(sample.processes, 'cpu').map((proc) => `- ${proc.name}: ${proc.cpu.toFixed(1)} % CPU, ${formatBytes(proc.memory)}`),
    'Busiest by memory:',
    ...topProcesses(sample.processes, 'memory').map((proc) => `- ${proc.name}: ${formatBytes(proc.memory)}, ${proc.cpu.toFixed(1)} % CPU`)
  ];
  return lines.join('\n');
}

function formatUptimeEn(seconds: number): string {
  const { days, hours, minutes } = uptimeOf(seconds);
  return days > 0 ? `${days} d ${hours} h` : `${hours} h ${minutes} min`;
}
