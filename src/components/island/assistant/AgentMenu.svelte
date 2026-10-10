<!--
  Which of the user's Boite agents the assistant talks to: the one in use
  (its robot and name) as a quiet button, and a menu of the active agents
  with their name and domain. A custom menu: arrows move, Enter picks,
  Escape closes and gives the focus back. The island stays open while it is.
-->
<script lang="ts">
  import { Check, ChevronDown } from '@lucide/svelte';
  import { skinOf } from '../../../lib/companion/crew';
  import type { Assistant } from '../../../lib/island/assistant.svelte';
  import { useView } from '../../../lib/island/contract';
  import { fill, strings } from '../../../lib/strings';
  import RobotFace from '../../agents/RobotFace.svelte';

  let { assistant, open = $bindable(false) }: { assistant: Assistant; open?: boolean } = $props();
  const view = useView();
  const copy = strings.island.assistant;

  let trigger = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLDivElement | null>(null);

  const agent = $derived(assistant.agent);

  $effect(() => {
    view.hold('assistant-agents', open);
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menu?.contains(event.target as Node) && !trigger?.contains(event.target as Node)) open = false;
    };
    document.addEventListener('pointerdown', outside, true);
    queueMicrotask(() => menu?.querySelector<HTMLElement>('[aria-checked="true"], [role="menuitemradio"]')?.focus());
    return () => document.removeEventListener('pointerdown', outside, true);
  });
  $effect(() => () => view.hold('assistant-agents', false));

  function close() {
    open = false;
    trigger?.focus();
  }

  function keys(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      return close();
    }
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const items = [...(menu?.querySelectorAll<HTMLElement>('[role="menuitemradio"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }

  function pick(id: string) {
    assistant.pick(id);
    close();
  }
</script>

{#if agent}
  <div class="picker">
    <button
      bind:this={trigger}
      class="trigger"
      aria-haspopup="menu"
      aria-expanded={open}
      aria-label={fill(copy.choose, { name: agent.name })}
      title={fill(copy.choose, { name: agent.name })}
      data-testid="assistant-agent"
      onclick={() => (open = !open)}
    >
      <span class="avatar"><RobotFace robot={skinOf(agent)} state="still" /></span>
      <span class="name">{agent.name}</span>
      <ChevronDown size={13} />
    </button>

    {#if open}
      <div bind:this={menu} class="menu" role="menu" aria-label={copy.agents} tabindex="-1" onkeydown={keys} data-testid="assistant-agent-menu">
        <p class="label">{copy.agents}</p>
        {#each assistant.agents as entry (entry.id)}
          <button role="menuitemradio" aria-checked={entry.id === agent.id} class="item" onclick={() => pick(entry.id)}>
            <span class="avatar"><RobotFace robot={skinOf(entry)} state="still" /></span>
            <span class="who">
              <span class="item-name">{entry.name}</span>
              {#if entry.domain}<span class="domain">{entry.domain}</span>{/if}
            </span>
            {#if entry.id === agent.id}<Check size={13} />{/if}
          </button>
        {/each}
      </div>
    {/if}
  </div>
{/if}

<style>
  .picker {
    position: relative;
    min-width: 0;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    max-width: 100%;
    height: 26px;
    padding: 0 8px 0 4px;
    border: 1px solid var(--island-line);
    border-radius: 999px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 12.5px;
    font-weight: 600;
    cursor: pointer;
  }
  .trigger:hover,
  .trigger[aria-expanded='true'] {
    border-color: var(--island-line-strong);
  }
  .avatar {
    display: inline-grid;
    flex: none;
    place-items: center;
    width: 20px;
    height: 20px;
    border-radius: 50%;
    overflow: hidden;
  }
  .name {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .menu {
    position: absolute;
    z-index: 5;
    top: calc(100% + 6px);
    left: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
    width: 240px;
    max-height: 260px;
    padding: 6px;
    border: 1px solid var(--island-line-strong);
    border-radius: 12px;
    background: var(--island-menu);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
    overflow-y: auto;
  }
  .label {
    margin: 2px 8px 4px;
    color: var(--island-faint);
    font-size: 11px;
    font-weight: 600;
  }
  .item {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 36px;
    padding: 4px 8px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--island-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
  }
  .item:is(:hover, :focus-visible) {
    background: var(--island-card-hover);
    outline: none;
  }
  .item .avatar {
    width: 24px;
    height: 24px;
  }
  .who {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }
  .item-name {
    font-size: 12.5px;
  }
  .domain {
    overflow: hidden;
    color: var(--island-muted);
    font-size: 11.5px;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
