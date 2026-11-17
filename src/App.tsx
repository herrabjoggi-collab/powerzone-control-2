import { useState } from 'react';
import { RefreshCw, Wifi, WifiOff, X } from 'lucide-react';
import { SetupView } from './components/SetupView';
import { ZoneFaderRow } from './components/ZoneFaderRow';
import { useServiceWorker } from './hooks/useServiceWorker';
import { useAudioStore } from './store/useAudioStore';

type ActiveTab = 'zones' | 'setup';

export default function App() {
  const [activeTab, setActiveTab] = useState<ActiveTab>('zones');

  const {
    amps,
    zones,
    linkGroups,
    groupMap,
    preferences,
    notice,
    dismissNotice,
    beginGainDrag,
    setZoneGain,
    endGainDrag,
    toggleZoneMute,
    updateAmpConfig,
    connectAmp,
    disconnectAmp,
    reconnectAllAmps,
    pingAmp,
    pullAmp,
    setAmpPower,
    renameZone,
    pushZoneNameToAmp,
    updateZoneBounds,
    createLinkGroup,
    updateLinkGroup,
    toggleZoneInGroup,
    deleteLinkGroup,
    setUnitMode,
    setAutoReconnect,
    setOfflineSimulation,
    resetToDefaults,
  } = useAudioStore();

  const {
    isOnline,
    swStatus,
    updateAvailable,
    checkingUpdate,
    cacheVersion,
    cachedAssetCount,
    lastCheckNote,
    checkForUpdate,
    applyUpdate,
  } = useServiceWorker();

  const visibleZones = (() => {
    const seenActiveGroupIds = new Set<string>();
    return zones.filter((zone) => {
      if (!zone.linkGroupId) return true;
      const group = groupMap.get(zone.linkGroupId);
      if (!group || !group.enabled || group.zoneIds.length < 2) {
        return true;
      }
      if (seenActiveGroupIds.has(group.id)) {
        return false;
      }
      seenActiveGroupIds.add(group.id);
      return true;
    });
  })();

  const amp1Connected = amps.amp1.connectionStatus === 'connected';
  const amp2Connected = amps.amp2.connectionStatus === 'connected';
  const anyAmpConnecting =
    amps.amp1.connectionStatus === 'connecting' ||
    amps.amp2.connectionStatus === 'connecting';
  const allAmpsConnected = amp1Connected && amp2Connected;

  return (
    <div className="min-h-[100dvh] bg-[#0B0D10] text-slate-100 flex flex-col">
      {/* Compact Sticky Top Bar (< 15% mobile height, iOS safe-area aware) */}
      <header className="sticky top-0 z-30 bg-[#0B0D10]/90 backdrop-blur-md border-b border-white/[0.08] pt-safe">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between gap-4">
          <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            PowerZone
          </span>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Live Amplifier Connection Indicator in Header */}
            <button
              type="button"
              onClick={() => setActiveTab('setup')}
              title="Amplifier connection status — tap to configure in Setup"
              className="inline-flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0 px-2 py-1 rounded-lg hover:bg-white/[0.05] transition-colors"
            >
              {allAmpsConnected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                  <span className="text-emerald-400">2/2 Live</span>
                </>
              ) : amp1Connected || amp2Connected ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span className="text-amber-400">1/2 Live</span>
                </>
              ) : anyAmpConnecting ? (
                <>
                  <RefreshCw
                    className="w-3.5 h-3.5 text-sky-400 animate-spin"
                    aria-hidden="true"
                  />
                  <span className="text-sky-400">Connecting</span>
                </>
              ) : preferences.offlineSimulation ? (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-amber-400" aria-hidden="true" />
                  <span className="text-amber-400">Sim Mode</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-rose-400" aria-hidden="true" />
                  <span className="text-rose-400">Disconnected</span>
                </>
              )}
            </button>

            {updateAvailable && (
              <button
                type="button"
                onClick={applyUpdate}
                title="Update cached app version"
                className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 rounded-lg bg-sky-500/15 border border-sky-500/40 text-xs font-medium text-sky-300 hover:bg-sky-500/25 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Update</span>
              </button>
            )}

            <nav
              aria-label="Primary view"
              className="flex items-center gap-1 p-1 rounded-xl bg-[#14181F] border border-white/[0.08]"
            >
              <button
                type="button"
                onClick={() => setActiveTab('zones')}
                aria-current={activeTab === 'zones' ? 'page' : undefined}
                className={`min-h-[34px] px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'zones'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Zones
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('setup')}
                aria-current={activeTab === 'setup' ? 'page' : undefined}
                className={`min-h-[34px] px-3.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'setup'
                    ? 'bg-sky-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Setup
              </button>
            </nav>
          </div>
        </div>
      </header>

      {/* Non-blocking action / error toast */}
      {notice && (
        <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 pt-3">
          <div
            role="status"
            className={`flex items-center justify-between gap-3 px-3.5 py-2 rounded-xl border text-xs ${
              notice.tone === 'warning'
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-[#14181F] border-white/10 text-slate-200'
            }`}
          >
            <span>{notice.text}</span>
            <button
              type="button"
              onClick={dismissNotice}
              aria-label="Dismiss notice"
              className="p-1 text-slate-400 hover:text-white shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      {/* Main Content Area */}
      <main className="flex-1 max-w-6xl w-full mx-auto px-4 sm:px-6 py-3 sm:py-5 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {activeTab === 'zones' ? (
          <div className="space-y-3">
            {/* Connection / Disconnected Status Strip when not both live */}
            {!allAmpsConnected && (
              <div
                className={`rounded-xl border px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs ${
                  preferences.offlineSimulation
                    ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-200'
                }`}
              >
                <div className="flex items-center gap-2 min-w-0">
                  <WifiOff className="w-4 h-4 shrink-0" aria-hidden="true" />
                  <span className="leading-snug">
                    {!amp1Connected && !amp2Connected
                      ? preferences.offlineSimulation
                        ? 'Offline Simulation Active — Amplifiers are not connected (changes are local only).'
                        : 'Amplifiers Disconnected — Faders are locked until connected.'
                      : !amp1Connected
                        ? `${amps.amp1.label || 'Amplifier 1'} Disconnected${
                            preferences.offlineSimulation ? ' (Sim Mode)' : ' — Zones 1–4 locked'
                          }.`
                        : `${amps.amp2.label || 'Amplifier 2'} Disconnected${
                            preferences.offlineSimulation ? ' (Sim Mode)' : ' — Zones 5–8 locked'
                          }.`}
                  </span>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={reconnectAllAmps}
                    className="min-h-[34px] px-3 rounded-lg bg-[#14181F] border border-white/15 hover:border-white/30 text-slate-100 font-medium transition-colors whitespace-nowrap"
                  >
                    Reconnect
                  </button>
                  <button
                    type="button"
                    onClick={() => setOfflineSimulation(!preferences.offlineSimulation)}
                    className="min-h-[34px] px-3 rounded-lg bg-[#14181F] border border-white/15 hover:border-white/30 text-slate-200 font-medium transition-colors whitespace-nowrap"
                  >
                    {preferences.offlineSimulation ? 'Disable Sim' : 'Enable Sim'}
                  </button>
                </div>
              </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-4">
              {visibleZones.map((zone) => {
                const activeGroup = zone.linkGroupId
                  ? groupMap.get(zone.linkGroupId) ?? null
                  : null;
                const isConsolidated = Boolean(
                  activeGroup && activeGroup.enabled && activeGroup.zoneIds.length >= 2
                );
                const memberZones =
                  isConsolidated && activeGroup
                    ? zones.filter((z) => z.linkGroupId === activeGroup.id)
                    : [zone];

                const anyConnected = memberZones.some(
                  (z) => amps[z.ampId].connectionStatus === 'connected'
                );
                const allConnected = memberZones.every(
                  (z) => amps[z.ampId].connectionStatus === 'connected'
                );
                const isDisconnectedLocked =
                  !preferences.offlineSimulation && !anyConnected;
                const isSimulated = preferences.offlineSimulation && !allConnected;

                return (
                  <ZoneFaderRow
                    key={zone.id}
                    zone={zone}
                    linkGroup={activeGroup}
                    unitMode={preferences.unitMode}
                    isDisconnectedLocked={isDisconnectedLocked}
                    isSimulated={isSimulated}
                    onBeginDrag={beginGainDrag}
                    onChangeGain={setZoneGain}
                    onEndDrag={endGainDrag}
                    onToggleMute={toggleZoneMute}
                  />
                );
              })}
            </div>
          </div>
        ) : (
          <SetupView
            amps={amps}
            zones={zones}
            linkGroups={linkGroups}
            preferences={preferences}
            isOnline={isOnline}
            swStatus={swStatus}
            updateAvailable={updateAvailable}
            checkingUpdate={checkingUpdate}
            cacheVersion={cacheVersion}
            cachedAssetCount={cachedAssetCount}
            lastCheckNote={lastCheckNote}
            onUpdateAmpConfig={updateAmpConfig}
            onConnectAmp={connectAmp}
            onDisconnectAmp={disconnectAmp}
            onPingAmp={pingAmp}
            onPullAmp={pullAmp}
            onSetAmpPower={setAmpPower}
            onRenameZone={renameZone}
            onPushZoneName={pushZoneNameToAmp}
            onUpdateZoneBounds={updateZoneBounds}
            onCreateLinkGroup={createLinkGroup}
            onUpdateLinkGroup={updateLinkGroup}
            onToggleZoneInGroup={toggleZoneInGroup}
            onDeleteLinkGroup={deleteLinkGroup}
            onSetUnitMode={setUnitMode}
            onSetAutoReconnect={setAutoReconnect}
            onSetOfflineSimulation={setOfflineSimulation}
            onCheckForUpdate={checkForUpdate}
            onApplyUpdate={applyUpdate}
            onResetDefaults={resetToDefaults}
          />
        )}
      </main>
    </div>
  );
}
