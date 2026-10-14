/*
 * The tray menu's labels, in the language the app speaks: the shell builds
 * the menu in English before any page has loaded (`src-tauri/src/tray.rs`),
 * and the companion's window renames it once its language is known, then
 * again whenever it changes.
 */
import { activeLocale } from '@boite/ui/lib/i18n.svelte';
import { inShell } from './companion/shell';
import { strings } from './strings';

export async function nameTray(): Promise<void> {
  if (!inShell()) return;
  const { invoke } = await import('@tauri-apps/api/core');
  const { tray } = strings.bots;
  await invoke('bots_tray_labels', { tooltip: tray.tooltip, settings: tray.settings, quit: tray.quit }).catch(() => {});
}

/** Names the tray now and after every language change; returns the cleanup. */
export function followTrayLocale(): () => void {
  return $effect.root(() => {
    $effect(() => {
      activeLocale();
      void nameTray();
    });
  });
}
