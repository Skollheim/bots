<!--
  A short sentence beside the characters: Bots waiting for Boite to start, a
  thread Boite could not show, the demo mode. A sticky one stays until its
  cause is gone; another fades after a few seconds or on a click.
-->
<script lang="ts">
  import { X } from '@lucide/svelte';
  import { strings } from '../lib/strings';

  let { text, hint = null, sticky = false, ondismiss }: { text: string | null; hint?: string | null; sticky?: boolean; ondismiss: () => void } = $props();

  const SHOWN_MS = 6_000;

  $effect(() => {
    if (!text || sticky) return;
    const timer = setTimeout(ondismiss, SHOWN_MS);
    return () => clearTimeout(timer);
  });
</script>

{#if text}
  <div class="notice" role="status" data-hit data-testid="bots-notice">
    <p>
      <span class="text">{text}</span>
      {#if hint}<span class="hint">{hint}</span>{/if}
    </p>
    {#if !sticky}
      <button class="ghost icon" aria-label={strings.companion.dismiss} title={strings.companion.dismiss} onclick={ondismiss}><X size={13} /></button>
    {/if}
  </div>
{/if}

<style>
  .notice {
    display: flex;
    align-items: flex-start;
    gap: 6px;
    max-width: 320px;
    padding: 8px 10px;
    border: 1px solid var(--color-border);
    border-radius: var(--radius-lg);
    background: var(--color-surface);
    color: var(--color-foreground);
    box-shadow: var(--shadow-frame);
    font-size: var(--text-sm);
    pointer-events: auto;
  }
  p {
    display: flex;
    flex-direction: column;
    gap: 2px;
    margin: 0;
    flex: 1;
  }
  .text {
    font-weight: 600;
  }
  .hint {
    color: var(--color-muted-foreground);
    font-size: var(--text-xs);
  }
</style>
