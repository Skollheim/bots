<!--
  What the island lays over its view while an agent waits on the user: an
  amber card with the permissions to grant and the questions to answer
  (`CompanionPanel`, requests only). The island opened on its own for them and
  stays open until they are answered.
-->
<script lang="ts">
  import { BellRing } from '@lucide/svelte';
  import { useView } from '../../../lib/island/contract';
  import { strings } from '../../../lib/strings';
  import CompanionPanel from '../../companion/CompanionPanel.svelte';

  const view = useView();
  const companion = $derived(view.companion);
</script>

<section class="attention" role="alert" data-testid="island-attention">
  <header>
    <BellRing size={14} aria-hidden="true" />
    <span>{strings.island.attention.title}</span>
    <span class="count">{companion.blocking}</span>
  </header>
  <CompanionPanel
    threads={companion.threads}
    projects={companion.projects}
    permissions={companion.permissions}
    questions={companion.questions}
    mood={companion.mood}
    own={companion.ownThreads}
    onact={(action) => companion.act(action)}
    requestsOnly
  />
</section>

<style>
  .attention {
    flex: none;
    border: 1px solid rgb(245 165 36 / 0.45);
    border-radius: 14px;
    background: linear-gradient(rgb(245 165 36 / 0.1), rgb(245 165 36 / 0.03) 64px), var(--island-card);
    overflow: hidden;
    animation: arrive 320ms ease-out;
  }
  header {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 9px 12px 4px;
    color: var(--island-attention);
    font-weight: 600;
  }
  .count {
    margin-left: auto;
    min-width: 18px;
    height: 18px;
    padding: 0 5px;
    border-radius: 999px;
    background: var(--island-attention);
    color: #000;
    font-size: 11px;
    line-height: 18px;
    text-align: center;
  }
  .attention :global(.panel) {
    background: none;
    border: none;
  }
  @keyframes arrive {
    from {
      opacity: 0;
      transform: translateY(-6px);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .attention {
      animation: none;
    }
  }
</style>
