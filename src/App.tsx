import { useState } from 'react';
import { RefreshCw, WifiOff, X } from 'lucide-react';
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

  return (
    <div className="min-h-[100dvh] bg-[#0B0D10] text-slate-100 flex flex-col">
      {/* Compact Sticky Top Bar (< 15% mobile height, iOS safe-area aware) */}
      <header className="sticky top-0 z-30 bg-[#0B0D10]/90 backdrop-blur-md border-b border-white/[0.08] pt-safe">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 h-13 flex items-center justify-between gap-4">
          <span className="text-base font-bold tracking-tight text-slate-100 whitespace-nowrap shrink-0">
            PowerZone
          </span>

          <div className="flex items-center gap-2.5 shrink-0">
            {!isOnline && (
              <span
                title="Offline Mode"
                className="inline-flex items-center gap-1 text-xs text-amber-400 whitespace-nowrap shrink-0"
              >
                <WifiOff className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="hidden sm:inline">Offline</span>
              </span>
            )}

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
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 lg:gap-4">
            {visibleZones.map((zone) => (
              <ZoneFaderRow
                key={zone.id}
                zone={zone}
                linkGroup={zone.linkGroupId ? groupMap.get(zone.linkGroupId) ?? null : null}
                unitMode={preferences.unitMode}
                onBeginDrag={beginGainDrag}
                onChangeGain={setZoneGain}
                onEndDrag={endGainDrag}
                onToggleMute={toggleZoneMute}
              />
            ))}
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
            onCheckForUpdate={checkForUpdate}
            onApplyUpdate={applyUpdate}
            onResetDefaults={resetToDefaults}
          />
        )}
      </main>
    </div>
  );
}
