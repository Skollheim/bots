<!--
  The machine a thread or an agent of another machine of the group runs on,
  as a small quiet chip: its name in the group's roster. This machine's own
  get none, and nothing shows while the user has one machine.
-->
<script lang="ts">
  import { fill, strings } from '../../lib/strings';

  let { machine }: { machine: string } = $props();
</script>

<span class="machine" title={fill(strings.bots.onMachine, { machine })} data-testid="machine-chip">{machine}</span>

<style>
  .machine {
    display: inline-block;
    flex: none;
    max-width: 9em;
    padding: 0 6px;
    border: 1px solid var(--island-line);
    border-radius: 999px;
    color: var(--island-muted);
    font-size: 10.5px;
    font-weight: 600;
    line-height: 14px;
    overflow: hidden;
    text-overflow: ellipsis;
    vertical-align: middle;
    white-space: nowrap;
  }
</style>
