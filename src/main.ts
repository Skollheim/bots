/*
 * The page's entry: the companion's transparent window, which draws the
 * island, the robots and the settings panel. The language comes first, so
 * nothing is drawn in English and swapped a tick later.
 */
import '@boite/ui/app.css';
import './bots.css';
import { mount } from 'svelte';
import { startLocale } from '@boite/ui/lib/i18n.svelte';
import App from './App.svelte';
import { followTrayLocale } from './lib/tray.svelte';

const target = document.getElementById('app')!;

void startLocale().then(() => {
  mount(App, { target });
  followTrayLocale();
});
