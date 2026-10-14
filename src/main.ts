/*
 * The page's entry: the companion's transparent window, which draws the
 * island, the robots and the settings panel (the dev bundle adds
 * `?view=mascots`, every companion family side by side). The language comes
 * first, so nothing is drawn in English and swapped a tick later.
 */
import '@boite/ui/app.css';
import './bots.css';
import { mount } from 'svelte';
import { startLocale } from '@boite/ui/lib/i18n.svelte';
import { followTrayLocale } from './lib/tray.svelte';

const target = document.getElementById('app')!;
// Every companion family side by side, for captures: the dev bundle only.
const mascots = import.meta.env.DEV && new URLSearchParams(location.search).get('view') === 'mascots';

void startLocale().then(async () => {
  const page = mascots ? (await import('./MascotGallery.svelte')).default : (await import('./App.svelte')).default;
  mount(page, { target });
  if (!mascots) followTrayLocale();
});
