/*
 * The page's entry: the companion's transparent window, or Bots's settings
 * window on `?view=settings` (the dev bundle adds `?view=mascots`, every
 * companion family side by side). The language comes first, so nothing is drawn
 * in English and swapped a tick later.
 */
import '@boite/ui/app.css';
import './bots.css';
import { mount } from 'svelte';
import { startLocale } from '@boite/ui/lib/i18n.svelte';
import { followTrayLocale } from './lib/tray.svelte';

const target = document.getElementById('app')!;
const view = new URLSearchParams(location.search).get('view');
const settings = view === 'settings';
// Every companion family side by side, for captures: the dev bundle only.
const mascots = import.meta.env.DEV && view === 'mascots';
document.documentElement.dataset.view = settings ? 'settings' : 'bots';

void startLocale().then(async () => {
  const page = mascots
    ? (await import('./MascotGallery.svelte')).default
    : settings
      ? (await import('./SettingsApp.svelte')).default
      : (await import('./App.svelte')).default;
  mount(page, { target });
  if (!settings && !mascots) followTrayLocale();
});
