<!--
  Settings, Companion: the "always allow" rules made from the island
  (`lib/island/allow.svelte.ts`). Each says where it holds, the tool, and the
  command, path or input it covers; one goes with its X, all with "Forget all".
  They live on this computer; Bots answers with them only while it runs.
-->
<script lang="ts">
  import { X } from '@lucide/svelte';
  import { ruleText, type AllowRule } from '../../lib/island/allow-rules';
  import { forgetAllRules, forgetRule, storedRules, subscribeRules } from '../../lib/island/allow.svelte';
  import { fill, strings } from '../../lib/strings';

  const copy = $derived(strings.island.allow);

  let rules = $state.raw<AllowRule[]>(storedRules());

  $effect(() => subscribeRules((next) => (rules = next)));

  function place(rule: AllowRule): string {
    const name = rule.scopeName || rule.scopeId;
    return fill(rule.scope === 'thread' ? copy.scopeThread : copy.scopeProject, { name });
  }
</script>

<section class="card" data-testid="companion-allow-rules">
  <div class="head">
    <h2>{copy.title}</h2>
    {#if rules.length > 0}
      <button class="ghost small" onclick={forgetAllRules} data-testid="companion-allow-forget">{copy.forgetAll}</button>
    {/if}
  </div>
  <p class="hint">{copy.lead}</p>
  {#if rules.length === 0}
    <p class="hint">{copy.empty}</p>
  {:else}
    <ul class="list">
      {#each rules as rule (rule.id)}
        <li>
          <span class="item">
            <span class="place">{place(rule)}</span>
            <code title={rule.value}>{ruleText(rule, 120)}</code>
          </span>
          <button class="ghost icon" aria-label={copy.remove} title={copy.remove} onclick={() => forgetRule(rule.id)}><X size={14} /></button>
        </li>
      {/each}
    </ul>
  {/if}
</section>

<style>
  .head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }
  .list {
    display: flex;
    flex-direction: column;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .list li {
    display: flex;
    align-items: center;
    gap: 8px;
    min-height: var(--row);
    border-bottom: 1px solid var(--color-border);
  }
  .list li:last-child {
    border-bottom: none;
  }
  .item {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    padding: 6px 0;
    font-size: var(--text-sm);
    line-height: 1.4;
  }
  .place {
    color: var(--color-muted-foreground);
    font-size: var(--text-xs);
  }
  .item code {
    overflow-wrap: anywhere;
  }
  .list .icon {
    flex: none;
  }
</style>
