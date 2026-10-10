/*
 * The page's entry: the companion's transparent window, or Bots's settings
 * window on `?view=settings`. The language comes first, so nothing is drawn
 * in English and swapped a tick later.
 */
import '@boite/ui/app.css';
import './bots.css';
import { mount } from 'svelte';
import { startLocale } from '@boite/ui/lib/i18n.svelte';
import { followTrayLocale } from './lib/tray.svelte';

const target = document.getElementById('app')!;
const settings = new URLSearchParams(location.search).get('view') === 'settings';
document.documentElement.dataset.view = settings ? 'settings' : 'bots';

void startLocale().then(async () => {
  const page = settings ? (await import('./SettingsApp.svelte')).default : (await import('./App.svelte')).default;
  mount(page, { target });
  if (!settings) followTrayLocale();
});
