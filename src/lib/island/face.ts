/*
 * The lead robot's face on the island: where its eyes look (the pointer, near
 * enough) and the mood it shows. Shared by the pill (`IslandBar.svelte`) and
 * the open island (`Island.svelte`).
 */
import type { Companion } from '../companion/companion.svelte';
import type { Gaze } from '../../components/companion/CompanionCharacter.svelte';

const GAZE_REACH = { x: 240, y: 180 };

export function gazeOf(companion: Companion, element: HTMLElement | null): Gaze | null {
  const pointer = companion.senses.pointer;
  if (!pointer || !element || companion.dragging) return null;
  const rect = element.getBoundingClientRect();
  const clamp = (value: number) => Math.max(-1, Math.min(1, value));
  return { x: clamp((pointer.x - rect.x - rect.width / 2) / GAZE_REACH.x), y: clamp((pointer.y - rect.y - rect.height / 2) / GAZE_REACH.y) };
}

export function moodOf(companion: Companion, talking: boolean, leader: boolean) {
  return talking || (leader && companion.assistant.running) ? 'working' : leader ? companion.mood.mood : 'idle';
}
