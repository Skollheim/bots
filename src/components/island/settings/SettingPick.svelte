<!--
  A setting's row in the settings panel: its name, its "i" when it has more
  to say, and a menu of its choices on the right (Boite's `Menu`).
-->
<script lang="ts">
  import { ChevronDown } from '@lucide/svelte';
  import InfoTip from '@boite/ui/components/InfoTip.svelte';
  import Menu from '@boite/ui/components/Menu.svelte';
  import type { MenuItem } from '@boite/ui/lib/menu';

  interface Props {
    label: string;
    hint?: string | null;
    items: MenuItem[];
    current: string;
    onpick: (id: string) => void;
    testid: string;
    /** The menu is reached: focus is the one sign, a click focusing its button too. */
    onreach?: () => void;
  }

  let { label, hint = null, items, current, onpick, testid, onreach }: Props = $props();
</script>

<div class="switch-row" onfocusin={onreach}>
  <span class="text ui-label-box">
    <span class="ui-label">{label}</span>{#if hint}<InfoTip topic={label} text={hint} />{/if}
  </span>
  <Menu {items} {onpick} {label} placement="bottom" align="end" {testid}>
    <span class="current ui-label">{current}</span><ChevronDown size={13} />
  </Menu>
</div>

<style>
  .current {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 26ch;
  }
</style>
