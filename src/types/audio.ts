export type AmpId = 'amp1' | 'amp2';

export type ZoneChannel = 'A' | 'B' | 'C' | 'D';

export type ConnectionStatus = 'connected' | 'connecting' | 'simulated' | 'error';

export type VolumeUnit = 'db' | 'percent';

export type LinkColorToken = 'sky' | 'amber' | 'emerald' | 'violet' | 'rose';

export interface AmplifierDeviceInfo {
  modelName: string;
  firmware: string;
  systemState: 'INIT' | 'STANDBY' | 'STANDBY_FORCED' | 'ON' | string;
  deviceName: string;
  venueName: string;
}

export interface AmplifierConfig {
  id: AmpId;
  label: string;
  ip: string;
  wsUrlOverride: string;
  connectionStatus: ConnectionStatus;
  lastError: string | null;
  lastPingMs: number | null;
  lastSyncedAt: number | null;
  deviceInfo: AmplifierDeviceInfo;
}

export interface ZoneState {
  id: string; // e.g. 'amp1:A'
  ampId: AmpId;
  zid: ZoneChannel;
  name: string;
  gainDb: number;
  gainMin: number;
  gainMax: number;
  muted: boolean;
  muteEnabled: boolean;
  gpioVcLocked: number; // 0 = unlocked, 1..4 = GPIO volume control pin
  stereo: boolean;
  linkGroupId: string | null;
}

export interface LinkGroup {
  id: string;
  name: string;
  colorToken: LinkColorToken;
  enabled: boolean;
  linkMute: boolean;
  zoneIds: string[];
}

export interface AppPreferences {
  unitMode: VolumeUnit;
  autoReconnect: boolean;
}

export interface PersistedAudioState {
  version: number;
  amps: Record<AmpId, Pick<AmplifierConfig, 'id' | 'label' | 'ip' | 'wsUrlOverride' | 'deviceInfo'>>;
  zones: ZoneState[];
  linkGroups: LinkGroup[];
  preferences: AppPreferences;
}
