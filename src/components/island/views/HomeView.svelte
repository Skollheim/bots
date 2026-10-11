<!--
  The island's Home: the live sessions (`sessions/SessionsList.svelte`), the
  reminders and what finished, the focus timer and its tools, the threads
  that waited a while, the tasks launched, and the day's recap
  (`assistant/RecapCard.svelte`), and a newer Boite when one is out
  (`UpdateCard.svelte`). The quotas and the music show in the tab bar.
-->
<script lang="ts">
  import { useView } from '../../../lib/island/contract';
  import { strings } from '../../../lib/strings';
  import CompanionFocusCards from '../../companion/CompanionFocusCards.svelte';
  import CompanionNotes from '../../companion/CompanionNotes.svelte';
  import CompanionRadar from '../../companion/CompanionRadar.svelte';
  import CompanionTaskCards from '../../companion/CompanionTaskCards.svelte';
  import CompanionTimer from '../../companion/CompanionTimer.svelte';
  import CompanionTools from '../../companion/CompanionTools.svelte';

  import RecapCard from '../assistant/RecapCard.svelte';
  import SessionsList from '../sessions/SessionsList.svelte';
  import UpdateCard from './UpdateCard.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.home;
  const open = (threadId: string) => void view.reveal(threadId).catch(() => {});
  /** The cards Sessions carries: on their rows, or held while an archive can still be undone. */
  const carried = $derived([...view.sessions.ended, ...view.sessions.undo.lines.map((line) => line.threadId)]);

  /** The earlier answers show in the chat: turned on here, the island turns to it. */
  function showHistory(on: boolean) {
    companion.history = on;
    if (on) view.show('chat');
  }
</script>

<div class="home" data-testid="island-home">
  <!-- A finished thread Sessions still shows carries its card on its row. -->
  <CompanionNotes members={[]} notes={companion.notes} open={false} reachable={companion.reachable} except={carried} changes />

  <SessionsList />

  <UpdateCard />

  <RecapCard />

  {#if companion.radar.shown}
    <CompanionRadar radar={companion.radar} onopen={open} onreply={(threadId, text) => companion.replyFromRadar(threadId, text)} />
  {/if}
  <CompanionFocusCards timer={companion.timer} focus={companion.focus} onopen={open} />
  <CompanionTaskCards tasks={companion.tasks} onopen={open} />

  <section class="island-card focus">
    <h3 class="island-heading">{copy.focus}</h3>
    <CompanionTimer timer={companion.timer} hover={true} onresize={() => {}} />
    <CompanionTools
      timer={companion.timer}
      focus={companion.focus}
      workMinutes={companion.prefs.workMinutes}
      breakMinutes={companion.prefs.breakMinutes}
      bind:history={() => companion.history, (on) => showHistory(on)}
      onstart={() => companion.startTimer()}
    />
  </section>
</div>

<style>
  .home {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .focus :global([data-testid='companion-tools']) {
    padding: 4px 0 0;
  }
</style>
