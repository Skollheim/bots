<!--
  The agent's model and effort, in one quiet button: a menu of the models the
  core offers for the agent's account, and the effort as three choices (low,
  medium, high). They are the agent's own: the menu says a change reaches it
  everywhere, in Boite too. A custom menu: arrows move, Enter picks, Escape
  closes and gives the focus back. The island stays open while it is.
-->
<script lang="ts">
  import { Check, ChevronDown } from '@lucide/svelte';
  import type { Assistant, Effort } from '../../../lib/island/assistant.svelte';
  import { useView } from '../../../lib/island/contract';
  import { fill, strings } from '../../../lib/strings';

  let { assistant, open = $bindable(false) }: { assistant: Assistant; open?: boolean } = $props();
  const view = useView();
  const copy = strings.island.assistant;

  let trigger = $state<HTMLButtonElement | null>(null);
  let menu = $state<HTMLDivElement | null>(null);

  const current = $derived(assistant.offered.find((model) => model.id === assistant.model));
  const label = $derived(
    `${current?.name ?? assistant.model ?? copy.defaultModel} · ${assistant.effort ? copy.efforts[assistant.effort] : copy.defaultEffort}`
  );

  $effect(() => {
    view.hold('assistant-menu', open);
    if (!open) return;
    const outside = (event: PointerEvent) => {
      if (!menu?.contains(event.target as Node) && !trigger?.contains(event.target as Node)) open = false;
    };
    document.addEventListener('pointerdown', outside, true);
    queueMicrotask(() => menu?.querySelector<HTMLElement>('[aria-checked="true"], [role^="menuitem"]')?.focus());
    return () => document.removeEventListener('pointerdown', outside, true);
  });
  $effect(() => () => view.hold('assistant-menu', false));

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
    const items = [...(menu?.querySelectorAll<HTMLElement>('[role^="menuitem"]') ?? [])];
    const at = items.indexOf(document.activeElement as HTMLElement);
    items[(at + (event.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length]?.focus();
  }

  function pickModel(id: string) {
    void assistant.setModel(id);
  }

  function pickEffort(effort: Effort) {
    void assistant.setEffort(effort);
  }
</script>

<div class="picker">
  <button
    bind:this={trigger}
    class="trigger"
    aria-haspopup="menu"
    aria-expanded={open}
    aria-label="{copy.picker}: {label}"
    title={copy.picker}
    data-testid="assistant-model"
    onclick={() => (open = !open)}
  >
    <span class="name">{label}</span>
    <ChevronDown size={13} />
  </button>

  {#if open}
    <div bind:this={menu} class="menu" role="menu" aria-label={copy.picker} tabindex="-1" onkeydown={keys} data-testid="assistant-model-menu">
      <p class="label">{copy.model}</p>
      {#each assistant.offered as model (model.id)}
        <button role="menuitemradio" aria-checked={model.id === assistant.model} class="item" onclick={() => pickModel(model.id)}>
          <span>{model.name}</span>
          {#if model.id === assistant.model}<Check size={13} />{/if}
        </button>
      {:else}
        <p class="none">{copy.noModels}</p>
      {/each}
      <p class="label">{copy.effort}</p>
      <div class="efforts" role="group" aria-label={copy.effort}>
        {#each assistant.efforts as effort (effort)}
          <button role="menuitemradio" aria-checked={effort === assistant.effort} class="effort" class:on={effort === assistant.effort} onclick={() => pickEffort(effort)}>
            {copy.efforts[effort]}
          </button>
        {/each}
      </div>
      <p class="note">{fill(copy.everywhere, { name: assistant.agent?.name ?? '' })}</p>
    </div>
  {/if}
</div>

<style>
  .picker {
    position: relative;
    min-width: 0;
  }
  .trigger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    max-width: 100%;
    height: 26px;
    padding: 0 8px 0 10px;
    border: 1px solid var(--island-line);
    border-radius: 999px;
    background: none;
    color: var(--island-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .trigger:hover,
  .trigger[aria-expanded='true'] {
    border-color: var(--island-line-strong);
    color: var(--island-text);
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
    width: 230px;
    max-height: 260px;
    padding: 6px;
    border: 1px solid var(--island-line-strong);
    border-radius: 12px;
    background: var(--island-menu);
    box-shadow: 0 12px 32px rgb(0 0 0 / 0.5);
    overflow-y: auto;
  }
  .label {
    margin: 6px 8px 4px;
    color: var(--island-faint);
    font-size: 11px;
    font-weight: 600;
  }
  .label:first-child {
    margin-top: 2px;
  }
  .item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    min-height: 28px;
    padding: 0 8px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 12.5px;
    text-align: left;
    cursor: pointer;
  }
  .item:is(:hover, :focus-visible) {
    background: var(--island-card-hover);
    outline: none;
  }
  .note {
    margin: 8px 8px 2px;
    color: var(--island-subtle);
    font-size: 11.5px;
    line-height: 1.35;
  }
  .none {
    margin: 2px 8px 4px;
    color: var(--island-muted);
    font-size: 12px;
  }
  .efforts {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(0, 1fr));
    gap: 2px;
    padding: 2px;
    border-radius: 9px;
    background: var(--island-pill);
  }
  .effort {
    height: 26px;
    border: 0;
    border-radius: 7px;
    background: none;
    color: var(--island-muted);
    font: inherit;
    font-size: 12px;
    cursor: pointer;
  }
  .effort.on {
    background: var(--island-card-hover);
    color: var(--island-text);
  }
  .effort:focus-visible {
    outline: 1px solid var(--island-line-strong);
  }
</style>
