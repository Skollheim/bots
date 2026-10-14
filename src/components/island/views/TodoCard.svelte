<!--
  The user's to-do list, under Home beside the day's recap: what the replies'
  `[[todo: …]]` lines and the user's own hand put there, each item ticked by
  hand or removed, a field to add one, and the done ones cleared at once or
  gone by the next day. Kept per core (`lib/companion/todo.svelte.ts`).
-->
<script lang="ts">
  import { Check, Plus, X } from '@lucide/svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import { useView } from '../../../lib/island/contract';
  import { todoCount } from '../../../lib/companion/todo';
  import { fill, strings } from '../../../lib/strings';

  interface Props {
    /** The list scrolls inside a deck tile with no bar, its edges fading (`deck-scroll`); its height is the tile's to set. */
    tile?: boolean;
  }

  let { tile = false }: Props = $props();

  const view = useView();
  const todos = $derived(view.companion.todos);
  const copy = strings.companion.todo;

  const items = $derived(todos.items);
  const count = $derived(todoCount(items));
  let text = $state('');
  /** The item just ticked: only its check springs, not the ones already done. */
  let fresh = $state<string | null>(null);

  const still = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const motion = still ? 0 : 200;

  function toggle(id: string, done: boolean) {
    fresh = done ? null : id;
    todos.toggle(id);
  }

  function add(event: SubmitEvent) {
    event.preventDefault();
    const clean = text.trim();
    if (!clean) return;
    todos.add(clean);
    text = '';
  }
</script>

<section class="island-card todo" data-testid="island-todo">
  <h3 class="island-heading head">
    <span>{copy.title}</span>
    {#if count.total > 0}
      <span class="count" aria-label={fill(copy.countLabel, { done: String(count.done), total: String(count.total) })}>{fill(copy.count, { done: String(count.done), total: String(count.total) })}</span>
    {/if}
    {#if count.done > 0}
      <button class="clear" onclick={() => todos.clearDone()} data-testid="island-todo-clear">{copy.clearDone}</button>
    {/if}
  </h3>

  {#if items.length > 0}
    <ul class:deck-scroll={tile} class:island-fade={tile}>
      {#each items as item (item.id)}
        {@const done = item.doneAt !== null}
        <li class:done animate:flip={{ duration: motion }} out:fade={{ duration: motion }} data-testid="island-todo-item">
          <button
            class="box"
            role="checkbox"
            aria-checked={done}
            aria-label={fill(done ? copy.uncheck : copy.check, { text: item.text })}
            onclick={() => toggle(item.id, done)}
          >
            {#if done}<span class="tick" class:fresh={fresh === item.id} aria-hidden="true"><Check size={11} strokeWidth={3} /></span>{/if}
          </button>
          <span class="text">{item.text}</span>
          <button class="remove" aria-label={fill(copy.remove, { text: item.text })} title={fill(copy.remove, { text: item.text })} onclick={() => todos.remove(item.id)}>
            <X size={12} />
          </button>
        </li>
      {/each}
    </ul>
  {/if}

  <form class="add" onsubmit={add}>
    <input
      bind:value={text}
      placeholder={copy.placeholder}
      aria-label={copy.placeholder}
      maxlength={200}
      onkeydown={(event) => {
        if (event.key === 'Escape' && text) {
          event.stopPropagation();
          text = '';
        }
      }}
      data-testid="island-todo-input"
    />
    <button type="submit" class="plus" aria-label={copy.add} title={copy.add} disabled={!text.trim()}><Plus size={14} /></button>
  </form>
</section>

<style>
  .head {
    display: flex;
    align-items: baseline;
    gap: 8px;
  }
  .count {
    color: var(--island-muted);
    font-variant-numeric: tabular-nums;
  }
  .clear {
    margin-left: auto;
    height: auto;
    padding: 0 2px;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--island-muted);
    font: inherit;
    cursor: pointer;
  }
  .clear:hover {
    color: var(--island-text);
  }
  ul {
    display: flex;
    flex-direction: column;
    gap: 1px;
    margin: 0 0 6px;
    padding: 0;
    list-style: none;
  }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: 26px;
    margin: 0 -6px;
    padding: 2px 6px;
    border-radius: 9px;
  }
  li:hover {
    background: var(--island-card-hover);
  }
  .box {
    flex: none;
    display: grid;
    place-items: center;
    width: 16px;
    height: 16px;
    padding: 0;
    border: 1.5px solid var(--island-line-strong);
    border-radius: 5px;
    background: none;
    color: var(--island-card);
    cursor: pointer;
    transition: border-color var(--dur-2) ease;
  }
  .box:hover {
    border-color: var(--island-muted);
  }
  .done .box {
    border-color: var(--island-done);
    background: var(--island-done);
  }
  .tick {
    display: grid;
  }
  .tick.fresh {
    animation: tick 260ms cubic-bezier(0.34, 1.56, 0.64, 1);
  }
  .text {
    flex: 1;
    min-width: 0;
    color: var(--island-text);
    overflow-wrap: anywhere;
    transition: opacity var(--dur-2) ease;
  }
  .done .text {
    color: var(--island-muted);
    text-decoration: line-through;
    opacity: 0.8;
  }
  .remove {
    flex: none;
    display: grid;
    place-items: center;
    width: 22px;
    height: 22px;
    padding: 0;
    border: none;
    border-radius: 6px;
    background: none;
    color: var(--island-muted);
    opacity: 0;
    cursor: pointer;
    transition: opacity var(--dur-2) ease;
  }
  li:hover .remove,
  .remove:focus-visible {
    opacity: 1;
  }
  .remove:hover {
    color: var(--island-danger);
  }
  .add {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  input {
    flex: 1;
    min-width: 0;
    height: 28px;
    padding: 0 10px;
    border: 1px solid var(--island-line);
    border-radius: 9px;
    background: none;
    color: var(--island-text);
    font: inherit;
    font-size: 12.5px;
  }
  input::placeholder {
    color: var(--island-muted);
  }
  input:focus-visible {
    outline: none;
    border-color: var(--island-talking);
  }
  .plus {
    flex: none;
    display: grid;
    place-items: center;
    width: 28px;
    height: 28px;
    padding: 0;
    border: 1px solid var(--island-line);
    border-radius: 9px;
    background: none;
    color: var(--island-text);
    cursor: pointer;
  }
  .plus:disabled {
    color: var(--island-faint);
    cursor: default;
  }
  .box:focus-visible,
  .remove:focus-visible,
  .clear:focus-visible,
  .plus:focus-visible {
    outline: 2px solid var(--island-talking);
    outline-offset: 1px;
  }
  @keyframes tick {
    from {
      opacity: 0;
      transform: scale(0.3);
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .tick.fresh {
      animation: none;
    }
  }
</style>
