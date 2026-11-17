import React, { useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Check,
  Download,
  Link2,
  Power,
  RefreshCw,
  RotateCcw,
  Trash2,
  Unlink,
  Unplug,
  Wifi,
  WifiOff,
} from 'lucide-react';
import type { SwStatus } from '../hooks/useServiceWorker';
import { buildAmpWsUrl, isMixedContentWsBlocked } from '../services/sonanceClient';
import type {
  AmpId,
  AmplifierConfig,
  AppPreferences,
  LinkGroup,
  VolumeUnit,
  ZoneState,
} from '../types/audio';
import { LINK_COLOR_CLASSES, MAX_GAIN_DB, MIN_GAIN_DB } from '../utils/audioMath';
import { PWAInstallButton } from './PWAInstallButton';

interface SetupViewProps {
  amps: Record<AmpId, AmplifierConfig>;
  zones: ZoneState[];
  linkGroups: LinkGroup[];
  preferences: AppPreferences;
  isOnline: boolean;
  swStatus: SwStatus;
  updateAvailable: boolean;
  checkingUpdate: boolean;
  cacheVersion: string | null;
  cachedAssetCount: number | null;
  lastCheckNote: string | null;
  onUpdateAmpConfig: (
    ampId: AmpId,
    patch: Partial<Pick<AmplifierConfig, 'label' | 'ip' | 'wsUrlOverride'>>
  ) => void;
  onConnectAmp: (ampId: AmpId) => void;
  onDisconnectAmp: (ampId: AmpId) => void;
  onPingAmp: (ampId: AmpId) => Promise<void>;
  onPullAmp: (ampId: AmpId) => Promise<void>;
  onSetAmpPower: (ampId: AmpId, on: boolean) => Promise<void>;
  onRenameZone: (zoneId: string, nextName: string) => void;
  onPushZoneName: (zoneId: string) => Promise<void>;
  onUpdateZoneBounds: (zoneId: string, minDb: number, maxDb: number) => void;
  onCreateLinkGroup: (name: string, zoneIds: string[], linkMute: boolean) => void;
  onUpdateLinkGroup: (
    groupId: string,
    patch: Partial<Pick<LinkGroup, 'name' | 'linkMute' | 'enabled'>>
  ) => void;
  onToggleZoneInGroup: (groupId: string, zoneId: string) => void;
  onDeleteLinkGroup: (groupId: string) => void;
  onSetUnitMode: (unit: VolumeUnit) => void;
  onSetAutoReconnect: (enabled: boolean) => void;
  onSetOfflineSimulation: (enabled: boolean) => void;
  onCheckForUpdate: () => Promise<void>;
  onApplyUpdate: () => void;
  onResetDefaults: () => void;
}

export const SetupView: React.FC<SetupViewProps> = ({
  amps,
  zones,
  linkGroups,
  preferences,
  isOnline,
  swStatus,
  updateAvailable,
  checkingUpdate,
  cacheVersion,
  cachedAssetCount,
  lastCheckNote,
  onUpdateAmpConfig,
  onConnectAmp,
  onDisconnectAmp,
  onPingAmp,
  onPullAmp,
  onSetAmpPower,
  onRenameZone,
  onPushZoneName,
  onUpdateZoneBounds,
  onCreateLinkGroup,
  onUpdateLinkGroup,
  onToggleZoneInGroup,
  onDeleteLinkGroup,
  onSetUnitMode,
  onSetAutoReconnect,
  onSetOfflineSimulation,
  onCheckForUpdate,
  onApplyUpdate,
  onResetDefaults,
}) => {
  const [newGroupName, setNewGroupName] = useState('');
  const [newGroupZones, setNewGroupZones] = useState<string[]>([]);
  const [newGroupLinkMute, setNewGroupLinkMute] = useState(true);
  const [confirmReset, setConfirmReset] = useState(false);

  const toggleDraftZone = (zoneId: string) => {
    setNewGroupZones((prev) =>
      prev.includes(zoneId) ? prev.filter((id) => id !== zoneId) : [...prev, zoneId]
    );
  };

  const handleCreateGroup = (e: React.FormEvent) => {
    e.preventDefault();
    if (newGroupZones.length < 2) return;
    onCreateLinkGroup(newGroupName, newGroupZones, newGroupLinkMute);
    setNewGroupName('');
    setNewGroupZones([]);
    setNewGroupLinkMute(true);
  };

  const ampList: AmpId[] = ['amp1', 'amp2'];
  const anyMixedContent = ampList.some((id) => {
    const url = buildAmpWsUrl(amps[id].ip, amps[id].wsUrlOverride);
    return isMixedContentWsBlocked(url);
  });

  return (
    <div className="space-y-6">
      {/* Section 1: Zone Link Groups (Relative Sync) */}
      <section aria-labelledby="setup-links-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="setup-links-heading" className="text-base font-semibold text-slate-100">
            Zone Link Groups
          </h2>
          <span className="text-xs text-slate-400">
            Relative offset sync across both amplifiers
          </span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Create Link Group Form */}
          <form
            onSubmit={handleCreateGroup}
            className="bg-[#14181F] border border-white/[0.08] rounded-xl p-4 space-y-4"
          >
            <h3 className="text-sm font-semibold text-slate-100">Create Link Group</h3>

            <label className="block space-y-1.5">
              <span className="text-xs font-medium text-slate-400">Group Name</span>
              <input
                type="text"
                value={newGroupName}
                maxLength={28}
                onChange={(e) => setNewGroupName(e.target.value)}
                placeholder="e.g. Main Floor"
                className="w-full min-h-[44px] px-3 rounded-lg bg-[#0B0D10] border border-white/10 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
              />
            </label>

            <div className="space-y-2">
              <span className="text-xs font-medium text-slate-400 block">
                Select 2 or more zones
              </span>
              <div className="grid grid-cols-2 gap-2">
                {zones.map((z) => {
                  const selected = newGroupZones.includes(z.id);
                  return (
                    <button
                      key={z.id}
                      type="button"
                      onClick={() => toggleDraftZone(z.id)}
                      aria-pressed={selected}
                      className={`min-h-[44px] px-3 py-2 rounded-lg border text-left text-xs font-medium flex items-center justify-between gap-2 transition-colors ${
                        selected
                          ? 'bg-sky-500/15 border-sky-500/50 text-sky-200'
                          : 'bg-[#0B0D10] border-white/10 text-slate-300 hover:border-white/25'
                      }`}
                    >
                      <span className="truncate">{z.name}</span>
                      {selected && <Check className="w-3.5 h-3.5 text-sky-400 shrink-0" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <label className="inline-flex items-center gap-2.5 min-h-[44px] cursor-pointer text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={newGroupLinkMute}
                  onChange={(e) => setNewGroupLinkMute(e.target.checked)}
                  className="w-4 h-4 rounded accent-sky-500"
                />
                <span>Link Mute across group</span>
              </label>

              <button
                type="submit"
                disabled={newGroupZones.length < 2}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 disabled:opacity-40 disabled:pointer-events-none text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap"
              >
                <Link2 className="w-4 h-4" aria-hidden="true" />
                <span>Create Group</span>
              </button>
            </div>
          </form>

          {/* Existing Link Groups */}
          <div className="space-y-3">
            {linkGroups.length === 0 ? (
              <div className="bg-[#14181F] border border-white/[0.08] rounded-xl p-5 text-sm text-slate-400">
                No link groups configured yet. Select two or more zones to adjust them together while preserving their relative dB offsets.
              </div>
            ) : (
              linkGroups.map((group) => {
                const colors = LINK_COLOR_CLASSES[group.colorToken];
                return (
                  <div
                    key={group.id}
                    className="bg-[#14181F] border border-white/[0.08] rounded-xl p-4 space-y-3"
                  >
                    <div className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className={`w-2 h-2 rounded-full shrink-0 ${
                          group.enabled ? colors.dot : 'bg-slate-600'
                        }`}
                      />
                      <input
                        type="text"
                        value={group.name}
                        maxLength={28}
                        aria-label="Link group name"
                        onChange={(e) =>
                          onUpdateLinkGroup(group.id, { name: e.target.value })
                        }
                        className="flex-1 min-w-0 min-h-[40px] px-2.5 rounded-lg bg-[#0B0D10] border border-white/10 text-sm font-medium text-slate-100 focus:outline-none focus:border-sky-500"
                      />
                      <button
                        type="button"
                        onClick={() =>
                          onUpdateLinkGroup(group.id, { enabled: !group.enabled })
                        }
                        aria-pressed={group.enabled}
                        className={`inline-flex items-center gap-1.5 min-h-[44px] px-3 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                          group.enabled
                            ? 'bg-sky-500/15 border-sky-500/40 text-sky-300 hover:bg-sky-500/25'
                            : 'bg-[#1B2029] border-white/10 text-slate-400 hover:text-slate-200 hover:border-white/25'
                        }`}
                      >
                        {group.enabled ? (
                          <Link2 className="w-3.5 h-3.5" aria-hidden="true" />
                        ) : (
                          <Unlink className="w-3.5 h-3.5" aria-hidden="true" />
                        )}
                        <span>{group.enabled ? 'Linked' : 'Paused'}</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => onDeleteLinkGroup(group.id)}
                        aria-label={`Delete group ${group.name}`}
                        className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-[#1B2029] border border-white/10 text-slate-400 hover:text-rose-400 hover:border-rose-500/40 transition-colors shrink-0"
                      >
                        <Trash2 className="w-4 h-4" aria-hidden="true" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                      {zones.map((z) => {
                        const inGroup = group.zoneIds.includes(z.id);
                        return (
                          <button
                            key={z.id}
                            type="button"
                            onClick={() => onToggleZoneInGroup(group.id, z.id)}
                            aria-pressed={inGroup}
                            className={`min-h-[40px] px-2.5 py-1.5 rounded-lg border text-xs truncate transition-colors ${
                              inGroup
                                ? `${colors.bgSoft} ${colors.border} ${colors.text} font-medium`
                                : 'bg-[#0B0D10] border-white/[0.07] text-slate-400 hover:text-slate-200'
                            }`}
                          >
                            {z.name}
                          </button>
                        );
                      })}
                    </div>

                    <label className="inline-flex items-center gap-2.5 min-h-[40px] cursor-pointer text-xs text-slate-300">
                      <input
                        type="checkbox"
                        checked={group.linkMute}
                        onChange={(e) =>
                          onUpdateLinkGroup(group.id, { linkMute: e.target.checked })
                        }
                        className="w-4 h-4 rounded accent-sky-500"
                      />
                      <span>Sync Mute across group members</span>
                    </label>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Section 2: Zone Naming & Gain Limits */}
      <section aria-labelledby="setup-zones-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="setup-zones-heading" className="text-base font-semibold text-slate-100">
            Zone Names &amp; Gain Limits
          </h2>
          <span className="text-xs text-slate-400">Max 32 chars · -80.0 to 0.0 dB</span>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {zones.map((z) => {
            const ampLabel = z.ampId === 'amp1' ? 'Amp 1' : 'Amp 2';
            return (
              <div
                key={z.id}
                className="bg-[#14181F] border border-white/[0.08] rounded-xl p-3.5 space-y-3"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="font-mono text-xs text-slate-400">
                    {ampLabel} · Ch {z.zid}
                  </span>
                  {z.gpioVcLocked !== 0 && (
                    <span className="text-xs text-amber-400">
                      Locked by GPIO VC {z.gpioVcLocked}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={z.name}
                    maxLength={32}
                    aria-label={`${ampLabel} Channel ${z.zid} name`}
                    onChange={(e) => onRenameZone(z.id, e.target.value)}
                    className="flex-1 min-h-[44px] px-3 rounded-lg bg-[#0B0D10] border border-white/10 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                  />
                  <button
                    type="button"
                    onClick={() => void onPushZoneName(z.id)}
                    className="min-h-[44px] px-3.5 rounded-lg bg-[#1B2029] border border-white/10 hover:border-white/25 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap shrink-0"
                  >
                    Push Name
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Min dB</span>
                    <input
                      type="number"
                      min={MIN_GAIN_DB}
                      max={z.gainMax}
                      step={1}
                      value={z.gainMin}
                      onChange={(e) =>
                        onUpdateZoneBounds(z.id, Number(e.target.value), z.gainMax)
                      }
                      className="w-full min-h-[40px] px-2.5 rounded-lg bg-[#0B0D10] border border-white/10 font-mono text-xs tabular-nums text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className="text-xs text-slate-400">Max dB</span>
                    <input
                      type="number"
                      min={z.gainMin}
                      max={MAX_GAIN_DB}
                      step={1}
                      value={z.gainMax}
                      onChange={(e) =>
                        onUpdateZoneBounds(z.id, z.gainMin, Number(e.target.value))
                      }
                      className="w-full min-h-[40px] px-2.5 rounded-lg bg-[#0B0D10] border border-white/10 font-mono text-xs tabular-nums text-slate-200 focus:outline-none focus:border-sky-500"
                    />
                  </label>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* Section 3: Display Preferences, PWA Install & Offline Cache */}
      <section aria-labelledby="setup-app-heading" className="space-y-3">
        <h2 id="setup-app-heading" className="text-base font-semibold text-slate-100">
          Display &amp; Offline App
        </h2>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Display & Behavior */}
          <div className="bg-[#14181F] border border-white/[0.08] rounded-xl p-4 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-100">Volume Readout Unit</p>
                <p className="text-xs text-slate-400">Shown on the main zone mixer</p>
              </div>
              <div
                role="group"
                aria-label="Volume unit"
                className="flex items-center gap-1 p-1 rounded-xl bg-[#0B0D10] border border-white/10 shrink-0"
              >
                <button
                  type="button"
                  onClick={() => onSetUnitMode('db')}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    preferences.unitMode === 'db'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  dB
                </button>
                <button
                  type="button"
                  onClick={() => onSetUnitMode('percent')}
                  className={`min-h-[36px] px-3 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${
                    preferences.unitMode === 'percent'
                      ? 'bg-sky-500 text-slate-950 font-semibold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Percent %
                </button>
              </div>
            </div>

            <label className="flex items-center justify-between gap-3 min-h-[44px] cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-100">Offline Simulation Mode</p>
                <p className="text-xs text-slate-400">
                  Allow testing faders locally when amplifiers are disconnected
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.offlineSimulation}
                onChange={(e) => onSetOfflineSimulation(e.target.checked)}
                className="w-5 h-5 rounded accent-sky-500 shrink-0"
              />
            </label>

            <label className="flex items-center justify-between gap-3 min-h-[44px] cursor-pointer">
              <div>
                <p className="text-sm font-medium text-slate-100">Auto-Reconnect Amplifiers</p>
                <p className="text-xs text-slate-400">
                  Retry unreachable IPs automatically in background
                </p>
              </div>
              <input
                type="checkbox"
                checked={preferences.autoReconnect}
                onChange={(e) => onSetAutoReconnect(e.target.checked)}
                className="w-5 h-5 rounded accent-sky-500 shrink-0"
              />
            </label>

            <div className="pt-2 border-t border-white/[0.06] flex flex-wrap items-center justify-between gap-3">
              <PWAInstallButton />

              {!confirmReset ? (
                <button
                  type="button"
                  onClick={() => setConfirmReset(true)}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1B2029] border border-white/10 hover:border-rose-500/40 text-xs font-medium text-slate-300 hover:text-rose-300 transition-colors whitespace-nowrap"
                >
                  <RotateCcw className="w-4 h-4" aria-hidden="true" />
                  <span>Reset Defaults</span>
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onResetDefaults();
                      setConfirmReset(false);
                    }}
                    className="min-h-[44px] px-3.5 py-2 rounded-xl bg-rose-500/20 border border-rose-500/50 text-xs font-semibold text-rose-300 whitespace-nowrap"
                  >
                    Confirm Reset
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmReset(false)}
                    className="min-h-[44px] px-3 py-2 rounded-xl bg-[#1B2029] text-xs font-medium text-slate-300 whitespace-nowrap"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Offline Cache & GitHub Pages Update Trigger */}
          <div className="bg-[#14181F] border border-white/[0.08] rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-100">
                Offline Cache &amp; App Updates
              </h3>
              <span
                className={`text-xs font-medium ${
                  isOnline ? 'text-emerald-400' : 'text-amber-400'
                }`}
              >
                {isOnline ? 'Online' : 'Offline Mode'}
              </span>
            </div>

            <div className="text-xs text-slate-400 space-y-1">
              <p>
                Service Worker:{' '}
                <span className="text-slate-200 font-medium">
                  {swStatus === 'active'
                    ? 'Cached for offline launch'
                    : swStatus === 'registering'
                      ? 'Initializing cache'
                      : swStatus === 'error'
                        ? 'Registration blocked in preview'
                        : 'Not supported'}
                </span>
              </p>
              {cacheVersion && (
                <p className="font-mono tabular-nums">
                  Build: <span className="text-slate-200">{cacheVersion}</span>
                  {cachedAssetCount ? ` · ${cachedAssetCount} files cached` : ''}
                </p>
              )}
              {lastCheckNote && <p className="text-sky-300 pt-1">{lastCheckNote}</p>}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => void onCheckForUpdate()}
                disabled={checkingUpdate}
                className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-xl bg-[#1B2029] border border-white/10 hover:border-white/25 text-xs font-medium text-slate-100 transition-colors whitespace-nowrap"
              >
                <RefreshCw
                  className={`w-4 h-4 text-sky-400 ${checkingUpdate ? 'animate-spin' : ''}`}
                  aria-hidden="true"
                />
                <span>{checkingUpdate ? 'Checking...' : 'Check for Update'}</span>
              </button>

              {updateAvailable && (
                <button
                  type="button"
                  onClick={onApplyUpdate}
                  className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap"
                >
                  <span>Apply Update &amp; Reload</span>
                </button>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* Section 4: Amplifiers (Last) */}
      <section aria-labelledby="setup-amps-heading" className="space-y-3">
        <div className="flex items-baseline justify-between gap-4">
          <h2 id="setup-amps-heading" className="text-base font-semibold text-slate-100">
            Amplifiers
          </h2>
          <span className="text-xs text-slate-400">
            Sonance Open API · Port 80 /ws
          </span>
        </div>

        {/* Mixed-content guidance only when relevant on HTTPS origins */}
        {anyMixedContent && (
          <div className="bg-[#14181F] border border-amber-500/30 rounded-xl p-4 flex items-start gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" aria-hidden="true" />
            <div className="text-sm text-slate-300 space-y-1">
              <p className="font-medium text-amber-300">
                HTTPS origin with local ws:// amplifier IP
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Safari and modern browsers block unencrypted <span className="font-mono text-slate-300">ws://</span> sockets when a page is loaded over <span className="font-mono text-slate-300">https://</span> (such as GitHub Pages). If an amplifier does not connect directly, enter a secure <span className="font-mono text-slate-300">wss://</span> proxy URL below or allow local HTTP access; offline simulation remains active automatically.
              </p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {ampList.map((ampId, index) => {
            const amp = amps[ampId];
            const isConnected = amp.connectionStatus === 'connected';
            const isConnecting = amp.connectionStatus === 'connecting';
            const isStandby = amp.deviceInfo.systemState !== 'ON';

            return (
              <div
                key={ampId}
                className="bg-[#14181F] border border-white/[0.08] rounded-xl p-4 space-y-4"
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-slate-100 truncate">
                      {amp.label || `Amplifier ${index + 1}`}
                    </h3>
                    <p className="text-xs text-slate-400 truncate mt-0.5">
                      {amp.deviceInfo.modelName || 'PowerZone Connect 504'}
                      {amp.deviceInfo.firmware ? ` · FW ${amp.deviceInfo.firmware}` : ''}
                      {` · ${amp.deviceInfo.systemState || 'ON'}`}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5 text-xs font-medium whitespace-nowrap shrink-0">
                    {isConnected ? (
                      <>
                        <Wifi className="w-3.5 h-3.5 text-emerald-400" aria-hidden="true" />
                        <span className="text-emerald-400">
                          Connected{amp.lastPingMs !== null ? ` · ${amp.lastPingMs}ms` : ''}
                        </span>
                      </>
                    ) : isConnecting ? (
                      <>
                        <RefreshCw
                          className="w-3.5 h-3.5 text-sky-400 animate-spin"
                          aria-hidden="true"
                        />
                        <span className="text-sky-400">Connecting</span>
                      </>
                    ) : (
                      <>
                        <WifiOff
                          className={`w-3.5 h-3.5 ${
                            preferences.offlineSimulation ? 'text-amber-400' : 'text-rose-400'
                          }`}
                          aria-hidden="true"
                        />
                        <span
                          className={
                            preferences.offlineSimulation ? 'text-amber-400' : 'text-rose-400'
                          }
                        >
                          {preferences.offlineSimulation
                            ? 'Disconnected (Sim)'
                            : 'Disconnected'}
                        </span>
                      </>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-400">Amplifier Name</span>
                    <input
                      type="text"
                      value={amp.label}
                      maxLength={32}
                      onChange={(e) => onUpdateAmpConfig(ampId, { label: e.target.value })}
                      className="w-full min-h-[44px] px-3 rounded-lg bg-[#0B0D10] border border-white/10 text-sm text-slate-100 focus:outline-none focus:border-sky-500"
                      placeholder={`Amplifier ${index + 1}`}
                    />
                  </label>

                  <label className="block space-y-1.5">
                    <span className="text-xs font-medium text-slate-400">IP Address</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={amp.ip}
                      onChange={(e) => onUpdateAmpConfig(ampId, { ip: e.target.value })}
                      className="w-full min-h-[44px] px-3 rounded-lg bg-[#0B0D10] border border-white/10 font-mono text-sm tabular-nums text-slate-100 focus:outline-none focus:border-sky-500"
                      placeholder={index === 0 ? '192.168.64.100' : '192.168.64.101'}
                    />
                  </label>
                </div>

                <label className="block space-y-1.5">
                  <span className="text-xs font-medium text-slate-400">
                    Custom WebSocket URL (optional wss:// override)
                  </span>
                  <input
                    type="url"
                    value={amp.wsUrlOverride}
                    onChange={(e) => onUpdateAmpConfig(ampId, { wsUrlOverride: e.target.value })}
                    className="w-full min-h-[44px] px-3 rounded-lg bg-[#0B0D10] border border-white/10 font-mono text-xs text-slate-200 focus:outline-none focus:border-sky-500"
                    placeholder={`ws://${amp.ip || '192.168.64.100'}/ws`}
                  />
                </label>

                {amp.lastError && (
                  <p className="text-xs text-slate-400 leading-relaxed">{amp.lastError}</p>
                )}

                <div className="flex flex-wrap items-center gap-2 pt-1">
                  {isConnected || isConnecting ? (
                    <button
                      type="button"
                      onClick={() => onDisconnectAmp(ampId)}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg bg-[#1B2029] border border-white/10 hover:border-white/25 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                    >
                      <Unplug className="w-4 h-4" aria-hidden="true" />
                      <span>Disconnect</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onConnectAmp(ampId)}
                      className="inline-flex items-center gap-1.5 min-h-[44px] px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-xs font-semibold text-slate-950 transition-colors whitespace-nowrap"
                    >
                      <Wifi className="w-4 h-4" aria-hidden="true" />
                      <span>Connect</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => void onPingAmp(ampId)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg bg-[#1B2029] border border-white/10 hover:border-white/25 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <Activity className="w-4 h-4 text-sky-400" aria-hidden="true" />
                    <span>Ping</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void onPullAmp(ampId)}
                    className="inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg bg-[#1B2029] border border-white/10 hover:border-white/25 text-xs font-medium text-slate-200 transition-colors whitespace-nowrap"
                  >
                    <Download className="w-4 h-4 text-sky-400" aria-hidden="true" />
                    <span>Pull State</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => void onSetAmpPower(ampId, isStandby)}
                    className={`inline-flex items-center gap-1.5 min-h-[44px] px-3.5 py-2 rounded-lg border text-xs font-medium transition-colors whitespace-nowrap ${
                      isStandby
                        ? 'bg-amber-500/15 border-amber-500/40 text-amber-300 hover:bg-amber-500/25'
                        : 'bg-[#1B2029] border-white/10 text-slate-200 hover:border-white/25'
                    }`}
                  >
                    <Power className="w-4 h-4" aria-hidden="true" />
                    <span>{isStandby ? 'Wake Amp' : 'Standby'}</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};
