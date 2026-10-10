<!--
  Bots's settings window: where the companion stands, which agents stand as
  it, what they run on and what they show. It reaches Boite on its own
  (`lib/core.svelte.ts`) and shares the companion's preferences through
  `localStorage`, which both windows of the app read.
-->
<script lang="ts">
  import { onMount } from 'svelte';
  import { startTheme } from '@boite/ui/lib/theme';
  import BotsNotice from './components/BotsNotice.svelte';
  import CompanionSettings from './components/CompanionSettings.svelte';
  import { CoreLink } from './lib/core.svelte';
  import { useReveal } from './lib/reveal';
  import { strings } from './lib/strings';

  const link = new CoreLink();
  let notice = $state<string | null>(null);

  $effect(() => {
    document.title = strings.bots.settingsTitle;
  });

  onMount(() => {
    const stopTheme = startTheme();
    // The island's dark tokens, on the body so menus opened over the page wear them too.
    document.body.classList.add('island-tokens');
    const demo = import.meta.env.DEV && new URLSearchParams(location.search).get('fake') === '1';
    void link
      .start(demo ? async () => new (await import('./lib/fake-client')).FakeClient() : undefined)
      .then(() => useReveal(link.client, (message) => (notice = message)));
    return () => {
      document.body.classList.remove('island-tokens');
      stopTheme();
      useReveal(null, null);
      link.stop();
    };
  });
</script>

<div class="settings" data-testid="bots-settings">
  {#if link.waiting}
    <div class="waiting"><BotsNotice text={strings.bots.waiting} hint={strings.bots.waitingHint} sticky ondismiss={() => {}} /></div>
  {/if}
  <CompanionSettings store={link} />
  <div class="notice"><BotsNotice text={notice} ondismiss={() => (notice = null)} /></div>
</div>

<style>
  .settings {
    height: 100%;
    overflow-y: auto;
    background: var(--island-bg);
    color: var(--color-foreground);
  }
  /* Dark cards, as the island's: hairline edges, no shadow. */
  .settings :global(.page .card) {
    border: 1px solid var(--island-line);
    border-radius: 14px;
    background: var(--island-card);
    box-shadow: none;
  }
  .settings :global(.page .switch-row) {
    border-color: var(--island-line);
  }
  /* Section labels as the island's: sentence case, quiet grey. */
  .settings :global(.page .card h2) {
    color: var(--island-muted);
    font-size: var(--text-sm);
    font-weight: 500;
  }
  .waiting {
    display: flex;
    justify-content: center;
    padding: 16px 16px 0;
  }
  .notice {
    position: fixed;
    right: 16px;
    bottom: 16px;
  }
</style>
