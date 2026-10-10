<!--
  The island's Chat: whom the question goes to when several robots stand,
  the last answer of the one picked, kept here once the bubble went (or what
  keeps it from answering), the threads a search found, the earlier answers
  on demand, the files and the capture that go with the next question, and
  the field to ask it. While the field has the keyboard, the island stays open.
-->
<script lang="ts">
  import { ExternalLink, History, Square } from '@lucide/svelte';
  import { inShell, showAgent, showMain } from '../../../lib/companion/shell';
  import { writeCompanionPrefs } from '../../../lib/companion/prefs';
  import { useView } from '../../../lib/island/contract';
  import { strings } from '../../../lib/strings';
  import CompanionAsk from '../../companion/CompanionAsk.svelte';
  import CompanionAttachments from '../../companion/CompanionAttachments.svelte';
  import CompanionFound from '../../companion/CompanionFound.svelte';
  import CompanionHistory from '../../companion/CompanionHistory.svelte';
  import RobotFace from '../../agents/RobotFace.svelte';
  import ShotChip from './ShotChip.svelte';

  const view = useView();
  const companion = $derived(view.companion);
  const copy = strings.island.chat;
  const talk = $derived(companion.active.talk);
  const several = $derived(companion.members.length > 1);
  const said = $derived(talk.phase !== 'none');

  $effect(() => () => view.hold('chat', false));

  function pick(id: string) {
    companion.activeId = id;
    companion.bounce(id);
    companion.history = false;
    void companion.focusInput();
  }
</script>

<div class="chat" data-testid="island-chat">
  {#if several}
    <div class="crew" role="radiogroup" aria-label={copy.to}>
      {#each companion.members as member (member.id)}
        <button class="member" class:on={member.id === companion.active.id} role="radio" aria-checked={member.id === companion.active.id} onclick={() => pick(member.id)}>
          {#if member.skin}<span class="avatar"><RobotFace robot={member.skin} state="still" /></span>{/if}
          {member.name}
        </button>
      {/each}
    </div>
  {/if}

  <section class="island-card answer" class:empty={!said} role="status" aria-live="polite" data-testid="island-reply">
    {#if !said}
      <p class="hint">{copy.empty}</p>
    {:else if talk.problem}
      <p class="text problem">{talk.problem}</p>
    {:else if talk.reply}
      <p class="text">{talk.reply}</p>
    {:else}
      <p class="text waiting">{strings.companion.thinking}</p>
    {/if}
    {#if said}
      <div class="tools">
        {#if talk.thinking}
          <button class="ghost icon" aria-label={strings.companion.stop} title={strings.companion.stop} onclick={() => void talk.stop()}><Square size={13} /></button>
        {/if}
        {#if companion.active.id}
          <button class="ghost icon" aria-label={strings.companion.openThread} title={strings.companion.openThread} onclick={() => void showAgent(companion.active.id)}><ExternalLink size={13} /></button>
        {/if}
      </div>
    {/if}
  </section>

  {#if companion.finder.searching || companion.finder.found !== null}
    <CompanionFound finder={companion.finder} onopen={(threadId) => void showMain(threadId)} />
  {/if}

  {#if companion.crew.snapshot && companion.active.id}
    <button class="ghost small toggle" aria-expanded={companion.history} onclick={() => (companion.history = !companion.history)} data-testid="island-history">
      <History size={13} />{companion.history ? copy.hideHistory : copy.history}
    </button>
    {#if companion.history}
      <CompanionHistory snapshot={companion.crew.snapshot} agentId={companion.active.id} onpick={(exchange) => talk.recall(exchange.reply)} />
    {/if}
  {/if}

  <div
    class="island-card ask"
    role="group"
    onfocusin={() => view.hold('chat', true)}
    onfocusout={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) view.hold('chat', false);
    }}
  >
    <CompanionAttachments dropped={companion.attached} />
    {#if companion.shot}<ShotChip />{/if}
    <CompanionAsk
      bind:draft={companion.draft}
      thinking={talk.thinking || companion.sending}
      canSee={inShell()}
      screens={companion.screens}
      scope={companion.prefs.screenScope}
      onask={(screen) => void companion.ask(screen)}
      onscope={(screenScope) => (companion.prefs = writeCompanionPrefs({ screenScope }))}
      onstop={() => void talk.stop()}
      onsettings={() => void showMain(null)}
      to={several ? companion.active.name : null}
    />
  </div>
</div>

<style>
  .chat {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .crew {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }
  .member {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    height: 26px;
    padding: 0 10px 0 4px;
    border: 1px solid var(--island-line);
    border-radius: 999px;
    background: none;
    color: var(--island-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .member.on {
    border-color: transparent;
    background: var(--island-pill);
    color: var(--island-text);
  }
  .avatar {
    width: 18px;
    height: 18px;
    border-radius: 50%;
    overflow: hidden;
  }
  .answer {
    display: flex;
    align-items: flex-start;
    gap: 8px;
  }
  .answer.empty {
    border-style: dashed;
  }
  .hint,
  .text {
    flex: 1;
    margin: 0;
    min-width: 0;
    max-height: 180px;
    overflow-y: auto;
    white-space: pre-wrap;
    overflow-wrap: anywhere;
  }
  .hint,
  .waiting {
    color: var(--island-muted);
  }
  .problem {
    color: var(--island-danger);
  }
  .tools {
    display: flex;
    flex: none;
    gap: 2px;
  }
  .toggle {
    align-self: flex-start;
    gap: 6px;
    color: var(--island-muted);
  }
  .ask {
    padding: 0;
  }
</style>
