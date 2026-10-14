<!--
  Settings, Island: what the companion shows and does around the island:
  music and lyrics, the quotas (one switch per subscription), closing and
  hiding, sounds, the recap after an absence and the waiting threads' radar.
-->
<script lang="ts">
  import { untrack } from 'svelte';
  import ProviderLogo from '@boite/ui/components/ProviderLogo.svelte';
  import { gatewayReader } from '@boite/ui/lib/quota-reader.svelte';
  import { fill, strings } from '../../../lib/strings';
  import type { CoreLink } from '../../../lib/core.svelte';
  import { hudGauges } from '../../../lib/companion/hud';
  import type { CompanionPrefs } from '../../../lib/companion/prefs';
  import SettingPick from './SettingPick.svelte';
  import SettingSwitch from './SettingSwitch.svelte';

  let { store, prefs, save }: { store: CoreLink; prefs: CompanionPrefs; save: (patch: Partial<CompanionPrefs>) => void } = $props();

  const copy = $derived(strings.companion.settings);
  const RADAR_MINUTES = [5, 10, 15, 30, 60];
  const radarLabel = (count: number) => (count === 0 ? copy.radarOff : fill(copy.minutes, { count: String(count) }));
  let radarItems = $derived(
    [...new Set([0, ...RADAR_MINUTES, prefs.radarMinutes])]
      .sort((a, b) => a - b)
      .map((count) => ({ id: String(count), label: radarLabel(count), active: count === prefs.radarMinutes }))
  );

  /** The gateway's subscriptions, as the companion draws them, to pick the ones it shows. */
  let gateway = $derived(gatewayReader(store.endpointUrl ?? 'here'));
  let gauges = $derived(hudGauges(gateway.state));
  $effect(() => {
    const client = store.client;
    const current = gateway;
    if (!client || !store.owner || store.connection !== 'ready' || !prefs.quotas) return;
    const off = client.on('subscriptionProxy.quotasUpdated', (value) => current.accept(value));
    untrack(() => void current.read(client));
    return off;
  });

  function showQuota(id: string, shown: boolean) {
    const others = prefs.hiddenQuotas.filter((hidden) => hidden !== id);
    save({ hiddenQuotas: shown ? others : [...others, id] });
  }
</script>

<div class="card">
  <SettingSwitch label={copy.music} hint={copy.musicHint} checked={prefs.music} onchange={(music) => save({ music })} testid="companion-music" />
  <SettingSwitch label={copy.lyrics} hint={copy.lyricsHint} checked={prefs.lyrics} onchange={(lyrics) => save({ lyrics })} testid="companion-lyrics" />
  <SettingSwitch label={copy.quotas} hint={copy.quotasHint} checked={prefs.quotas} onchange={(quotas) => save({ quotas })} testid="companion-quotas" />
  {#if prefs.quotas && gauges.length > 0}
    <div class="quotas" role="group" aria-label={copy.quotasShown}>
      {#each gauges as gauge (gauge.id)}
        <label class="quota">
          <span class="quota-name"><ProviderLogo providerId={gauge.providerId} size={16} /><span class="ui-label">{gauge.name}</span></span>
          <input type="checkbox" role="switch" checked={!prefs.hiddenQuotas.includes(gauge.id)} onchange={(event) => showQuota(gauge.id, event.currentTarget.checked)} data-testid="companion-quota" />
        </label>
      {/each}
    </div>
  {/if}
</div>

<div class="card">
  <SettingSwitch label={copy.closeOutside} hint={copy.closeOutsideHint} checked={prefs.closeOutside} onchange={(closeOutside) => save({ closeOutside })} testid="companion-close-outside" />
  <SettingSwitch label={copy.hideFullscreen} hint={copy.hideFullscreenHint} checked={prefs.hideFullscreen} onchange={(hideFullscreen) => save({ hideFullscreen })} testid="companion-hide-fullscreen" />
  <SettingSwitch label={copy.sounds} hint={copy.soundsHint} checked={prefs.sounds} onchange={(sounds) => save({ sounds })} testid="companion-sounds" />
</div>

<div class="card">
  <SettingSwitch label={copy.awayRecap} hint={copy.awayRecapHint} checked={prefs.awayRecap} onchange={(awayRecap) => save({ awayRecap })} testid="companion-away-recap" />
  <SettingPick label={copy.radar} hint={copy.radarHint} items={radarItems} current={radarLabel(prefs.radarMinutes)} onpick={(id) => save({ radarMinutes: Number(id) })} testid="companion-radar-minutes" />
</div>

<style>
  /* The subscriptions under "Show quotas", one switch each, set in under it. */
  .quotas {
    display: flex;
    flex-direction: column;
    margin: -4px 0 12px;
    padding-left: 14px;
    border-left: 2px solid var(--island-line-strong);
  }
  .quota {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 5px 0;
    font-size: var(--text-sm);
  }
  .quota-name {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }
  .quota-name .ui-label {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
