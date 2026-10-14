<!--
  An on/off setting's row in the settings panel: its name, its "i", and the
  switch on the right.
-->
<script lang="ts">
  import InfoTip from '@boite/ui/components/InfoTip.svelte';

  interface Props {
    label: string;
    hint?: string | null;
    checked: boolean;
    onchange: (on: boolean) => void;
    testid: string;
  }

  let { label, hint = null, checked, onchange, testid }: Props = $props();
</script>

<label class="switch-row">
  <span class="text ui-label-box"><span class="ui-label">{label}</span>{#if hint}<InfoTip topic={label} text={hint} />{/if}</span>
  <input type="checkbox" role="switch" {checked} onchange={(event) => onchange(event.currentTarget.checked)} data-testid={testid} />
</label>
