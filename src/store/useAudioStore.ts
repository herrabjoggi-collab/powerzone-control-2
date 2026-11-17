import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { SonanceAmpClient } from '../services/sonanceClient';
import type {
  AmpId,
  AmplifierConfig,
  AppPreferences,
  ConnectionStatus,
  LinkGroup,
  PersistedAudioState,
  VolumeUnit,
  ZoneChannel,
  ZoneState,
} from '../types/audio';
import {
  clamp,
  LINK_COLOR_ORDER,
  MAX_GAIN_DB,
  MIN_GAIN_DB,
  roundToHalfDb,
  roundToTenthDb,
  sanitizeZoneName,
} from '../utils/audioMath';

const STORAGE_KEY = 'powerzone.control.v1';

interface DragSnapshot {
  anchorZoneId: string;
  anchorStartGain: number;
  memberStartGains: Record<string, number>;
}

const DEFAULT_ZONES: ZoneState[] = [
  { id: 'amp1:A', ampId: 'amp1', zid: 'A', name: 'Zone 1', gainDb: -24, gainMin: -80, gainMax: 0, muted: false, muteEnabled: true, gpioVcLocked: 0, stereo: false, linkGroupId: null },
  { id: 'amp1:B', ampId: 'amp1', zid: 'B', name: 'Zone 2', gainDb: -24, gainMin: -80, gainMax: 0, muted: false, muteEnabled: true, gpioVcLocked: 0, stereo: false, linkGroupId: null },
  { id: 'amp1:C', ampId: 'amp1', zid: 'C', name: 'Zone 3', gainDb: -28, gainMin: -80, gainMax: 0, muted: false, muteEnabled: true, gpioVcLocked: 0, stereo: false, linkGroupId: null },
  { id: 'amp1:D', ampId: 'amp1', zid: 'D', name: 'Zone 4', gainDb: -28, gainMin: -80, gainMax: 0, muted: false, muteEnabled: true, gpioVcLocked: 0, stereo: false, linkGroupId: null },
  { id: 'amp2:A', ampId: 'amp2', zid: 'A', name: 'Zone 5', gainDb: -22, gainMin: -80, gainMax: 0, muted: false, muteEnabled: true, gpioVcLocked: 0, stereo: false, linkGroupId: null },
  { id: 'amp2:B', ampId: 'amp2', zid: 'B', name: 'Zone 6', gainDb: -22, gainMin: -80, gainMax: 0, muted: false, muteEnabled: true, gpioVcLocked: 0, stereo: false, linkGroupId: null },
  { id: 'amp2:C', ampId: 'amp2', zid: 'C', name: 'Zone 7', gainDb: -30, gainMin: -80, gainMax: 0, muted: false, muteEnabled: true, gpioVcLocked: 0, stereo: false, linkGroupId: null },
  { id: 'amp2:D', ampId: 'amp2', zid: 'D', name: 'Zone 8', gainDb: -30, gainMin: -80, gainMax: 0, muted: false, muteEnabled: true, gpioVcLocked: 0, stereo: false, linkGroupId: null },
];

function createDefaultPersistedState(): PersistedAudioState {
  return {
    version: 1,
    amps: {
      amp1: {
        id: 'amp1',
        label: 'Amplifier 1',
        ip: '192.168.64.100',
        wsUrlOverride: '',
        deviceInfo: {
          modelName: 'PowerZone Connect 504',
          firmware: '',
          systemState: 'ON',
          deviceName: '',
          venueName: '',
        },
      },
      amp2: {
        id: 'amp2',
        label: 'Amplifier 2',
        ip: '192.168.64.101',
        wsUrlOverride: '',
        deviceInfo: {
          modelName: 'PowerZone Connect 504',
          firmware: '',
          systemState: 'ON',
          deviceName: '',
          venueName: '',
        },
      },
    },
    zones: DEFAULT_ZONES.map((z) => ({ ...z })),
    linkGroups: [],
    preferences: {
      unitMode: 'db',
      autoReconnect: true,
    },
  };
}

function loadPersistedState(): PersistedAudioState {
  const defaults = createDefaultPersistedState();
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw) as Partial<PersistedAudioState>;
    if (!parsed || typeof parsed !== 'object') return defaults;

    const mergedZones = defaults.zones.map((defZone) => {
      const saved = parsed.zones?.find((z) => z.id === defZone.id);
      if (!saved) return defZone;
      const gainMin = clamp(Number(saved.gainMin ?? defZone.gainMin), MIN_GAIN_DB, MAX_GAIN_DB);
      const gainMax = clamp(Number(saved.gainMax ?? defZone.gainMax), gainMin, MAX_GAIN_DB);
      return {
        ...defZone,
        name: sanitizeZoneName(saved.name || defZone.name) || defZone.name,
        gainMin,
        gainMax,
        gainDb: clamp(Number(saved.gainDb ?? defZone.gainDb), gainMin, gainMax),
        muted: Boolean(saved.muted),
        muteEnabled: saved.muteEnabled !== undefined ? Boolean(saved.muteEnabled) : true,
        linkGroupId: typeof saved.linkGroupId === 'string' ? saved.linkGroupId : null,
      };
    });

    const validZoneIds = new Set(mergedZones.map((z) => z.id));
    const mergedGroups: LinkGroup[] = Array.isArray(parsed.linkGroups)
      ? parsed.linkGroups
          .filter((g) => g && typeof g.id === 'string' && typeof g.name === 'string')
          .map((g, idx) => ({
            id: g.id,
            name: g.name.trim() || `Group ${idx + 1}`,
            colorToken: LINK_COLOR_ORDER.includes(g.colorToken)
              ? g.colorToken
              : LINK_COLOR_ORDER[idx % LINK_COLOR_ORDER.length],
            enabled: g.enabled !== undefined ? Boolean(g.enabled) : true,
            linkMute: g.linkMute !== undefined ? Boolean(g.linkMute) : true,
            zoneIds: Array.isArray(g.zoneIds)
              ? g.zoneIds.filter((id) => validZoneIds.has(id))
              : [],
          }))
      : [];

    // Reconcile zone.linkGroupId consistency with linkGroups
    const groupByZone = new Map<string, string>();
    for (const g of mergedGroups) {
      for (const zid of g.zoneIds) {
        groupByZone.set(zid, g.id);
      }
    }
    for (const z of mergedZones) {
      z.linkGroupId = groupByZone.get(z.id) ?? null;
    }

    return {
      version: 1,
      amps: {
        amp1: {
          ...defaults.amps.amp1,
          ...(parsed.amps?.amp1 ?? {}),
          id: 'amp1',
          deviceInfo: {
            ...defaults.amps.amp1.deviceInfo,
            ...(parsed.amps?.amp1?.deviceInfo ?? {}),
          },
        },
        amp2: {
          ...defaults.amps.amp2,
          ...(parsed.amps?.amp2 ?? {}),
          id: 'amp2',
          deviceInfo: {
            ...defaults.amps.amp2.deviceInfo,
            ...(parsed.amps?.amp2?.deviceInfo ?? {}),
          },
        },
      },
      zones: mergedZones,
      linkGroups: mergedGroups,
      preferences: {
        unitMode: parsed.preferences?.unitMode === 'percent' ? 'percent' : 'db',
        autoReconnect:
          parsed.preferences?.autoReconnect !== undefined
            ? Boolean(parsed.preferences.autoReconnect)
            : true,
      },
    };
  } catch {
    return defaults;
  }
}

export interface NoticeMessage {
  id: number;
  text: string;
  tone: 'info' | 'warning';
}

export function useAudioStore() {
  const initial = useRef<PersistedAudioState | null>(null);
  if (!initial.current) {
    initial.current = loadPersistedState();
  }

  const [amps, setAmps] = useState<Record<AmpId, AmplifierConfig>>(() => ({
    amp1: {
      ...initial.current!.amps.amp1,
      connectionStatus: 'simulated',
      lastError: null,
      lastPingMs: null,
      lastSyncedAt: null,
    },
    amp2: {
      ...initial.current!.amps.amp2,
      connectionStatus: 'simulated',
      lastError: null,
      lastPingMs: null,
      lastSyncedAt: null,
    },
  }));
  const [zones, setZones] = useState<ZoneState[]>(() => initial.current!.zones);
  const [linkGroups, setLinkGroups] = useState<LinkGroup[]>(() => initial.current!.linkGroups);
  const [preferences, setPreferences] = useState<AppPreferences>(() => initial.current!.preferences);
  const [notice, setNotice] = useState<NoticeMessage | null>(null);

  const zonesRef = useRef(zones);
  zonesRef.current = zones;
  const linkGroupsRef = useRef(linkGroups);
  linkGroupsRef.current = linkGroups;
  const dragSnapshotRef = useRef<DragSnapshot | null>(null);
  const clientsRef = useRef<Record<AmpId, SonanceAmpClient> | null>(null);
  const noticeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pushNotice = useCallback((text: string, tone: 'info' | 'warning' = 'info') => {
    setNotice({ id: Date.now(), text, tone });
    if (noticeTimerRef.current) clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = setTimeout(() => {
      setNotice(null);
    }, 4500);
  }, []);

  // Persist changes locally for 100% offline durability
  useEffect(() => {
    try {
      const payload: PersistedAudioState = {
        version: 1,
        amps: {
          amp1: {
            id: 'amp1',
            label: amps.amp1.label,
            ip: amps.amp1.ip,
            wsUrlOverride: amps.amp1.wsUrlOverride,
            deviceInfo: amps.amp1.deviceInfo,
          },
          amp2: {
            id: 'amp2',
            label: amps.amp2.label,
            ip: amps.amp2.ip,
            wsUrlOverride: amps.amp2.wsUrlOverride,
            deviceInfo: amps.amp2.deviceInfo,
          },
        },
        zones,
        linkGroups,
        preferences,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      // Ignore storage quota errors
    }
  }, [amps, zones, linkGroups, preferences]);

  const handleRegisterUpdate = useCallback((ampId: AmpId, register: string, rawValue: string) => {
    // System / device registers
    if (register === 'SYSTEM.DEVICE.MODEL_NAME') {
      setAmps((prev) => ({
        ...prev,
        [ampId]: {
          ...prev[ampId],
          lastSyncedAt: Date.now(),
          deviceInfo: { ...prev[ampId].deviceInfo, modelName: rawValue },
        },
      }));
      return;
    }
    if (register === 'SYSTEM.DEVICE.FIRMWARE') {
      setAmps((prev) => ({
        ...prev,
        [ampId]: {
          ...prev[ampId],
          lastSyncedAt: Date.now(),
          deviceInfo: { ...prev[ampId].deviceInfo, firmware: rawValue },
        },
      }));
      return;
    }
    if (register === 'SYSTEM.STATUS.STATE') {
      setAmps((prev) => ({
        ...prev,
        [ampId]: {
          ...prev[ampId],
          lastSyncedAt: Date.now(),
          deviceInfo: { ...prev[ampId].deviceInfo, systemState: rawValue },
        },
      }));
      return;
    }
    if (register === 'SETUP.SYSTEM.DEVICE_NAME') {
      setAmps((prev) => ({
        ...prev,
        [ampId]: {
          ...prev[ampId],
          deviceInfo: { ...prev[ampId].deviceInfo, deviceName: rawValue },
        },
      }));
      return;
    }
    if (register === 'SETUP.SYSTEM.VENUE_NAME') {
      setAmps((prev) => ({
        ...prev,
        [ampId]: {
          ...prev[ampId],
          deviceInfo: { ...prev[ampId].deviceInfo, venueName: rawValue },
        },
      }));
      return;
    }

    // Zone registers: ZONE-{A|B|C|D}.{FIELD}
    const zoneMatch = /^ZONE-([ABCD])\.(NAME|GAIN|GAIN_MIN|GAIN_MAX|MUTE|MUTE_ENABLE|GPIO_VC|STEREO)$/.exec(
      register
    );
    if (!zoneMatch) return;

    const zid = zoneMatch[1] as ZoneChannel;
    const field = zoneMatch[2];
    const targetZoneId = `${ampId}:${zid}`;

    setZones((prev) =>
      prev.map((z) => {
        if (z.id !== targetZoneId) return z;
        switch (field) {
          case 'NAME': {
            const cleaned = sanitizeZoneName(rawValue);
            return cleaned ? { ...z, name: cleaned } : z;
          }
          case 'GAIN': {
            const parsed = Number.parseFloat(rawValue);
            if (!Number.isFinite(parsed)) return z;
            return { ...z, gainDb: clamp(roundToTenthDb(parsed), z.gainMin, z.gainMax) };
          }
          case 'GAIN_MIN': {
            const parsed = Number.parseFloat(rawValue);
            if (!Number.isFinite(parsed)) return z;
            const nextMin = clamp(roundToTenthDb(parsed), MIN_GAIN_DB, z.gainMax);
            return { ...z, gainMin: nextMin, gainDb: clamp(z.gainDb, nextMin, z.gainMax) };
          }
          case 'GAIN_MAX': {
            const parsed = Number.parseFloat(rawValue);
            if (!Number.isFinite(parsed)) return z;
            const nextMax = clamp(roundToTenthDb(parsed), z.gainMin, MAX_GAIN_DB);
            return { ...z, gainMax: nextMax, gainDb: clamp(z.gainDb, z.gainMin, nextMax) };
          }
          case 'MUTE':
            return { ...z, muted: rawValue === '1' || rawValue.toUpperCase() === 'TRUE' };
          case 'MUTE_ENABLE':
            return { ...z, muteEnabled: rawValue === '1' || rawValue.toUpperCase() === 'TRUE' };
          case 'GPIO_VC': {
            const pin = Number.parseInt(rawValue, 10);
            return { ...z, gpioVcLocked: Number.isFinite(pin) ? pin : 0 };
          }
          case 'STEREO':
            return { ...z, stereo: rawValue === '1' || rawValue.toUpperCase() === 'TRUE' };
          default:
            return z;
        }
      })
    );
  }, []);

  // Initialize WebSocket clients once
  useEffect(() => {
    const callbacks = {
      onStatusChange: (ampId: AmpId, status: ConnectionStatus, error: string | null) => {
        setAmps((prev) => ({
          ...prev,
          [ampId]: {
            ...prev[ampId],
            connectionStatus: status,
            lastError: error,
          },
        }));
      },
      onRegisterUpdate: handleRegisterUpdate,
      onPingResult: (ampId: AmpId, rttMs: number) => {
        setAmps((prev) => ({
          ...prev,
          [ampId]: {
            ...prev[ampId],
            lastPingMs: rttMs,
          },
        }));
      },
      onNotice: (ampId: AmpId, message: string) => {
        const label = ampId === 'amp1' ? 'Amp 1' : 'Amp 2';
        pushNotice(`${label}: ${message}`, 'warning');
      },
    };

    const client1 = new SonanceAmpClient('amp1', callbacks);
    const client2 = new SonanceAmpClient('amp2', callbacks);
    client1.setAutoReconnect(initial.current!.preferences.autoReconnect);
    client2.setAutoReconnect(initial.current!.preferences.autoReconnect);
    clientsRef.current = { amp1: client1, amp2: client2 };

    // Attempt connection if online (auto-falls back cleanly to simulated if unreachable)
    if (typeof navigator === 'undefined' || navigator.onLine !== false) {
      client1.connect(initial.current!.amps.amp1.ip, initial.current!.amps.amp1.wsUrlOverride);
      client2.connect(initial.current!.amps.amp2.ip, initial.current!.amps.amp2.wsUrlOverride);
    }

    return () => {
      client1.destroy();
      client2.destroy();
      clientsRef.current = null;
    };
  }, [handleRegisterUpdate, pushNotice]);

  // Keep autoReconnect synced
  useEffect(() => {
    if (!clientsRef.current) return;
    clientsRef.current.amp1.setAutoReconnect(preferences.autoReconnect);
    clientsRef.current.amp2.setAutoReconnect(preferences.autoReconnect);
  }, [preferences.autoReconnect]);

  // --- Slider Drag & Relative-Offset Linking ---
  const beginGainDrag = useCallback((zoneId: string) => {
    const currentZones = zonesRef.current;
    const target = currentZones.find((z) => z.id === zoneId);
    if (!target) return;

    const memberStartGains: Record<string, number> = { [target.id]: target.gainDb };
    const activeGroup = target.linkGroupId
      ? linkGroupsRef.current.find((g) => g.id === target.linkGroupId && g.enabled)
      : null;

    if (activeGroup) {
      for (const z of currentZones) {
        if (z.linkGroupId === activeGroup.id && z.gpioVcLocked === 0) {
          memberStartGains[z.id] = z.gainDb;
        }
      }
    }

    dragSnapshotRef.current = {
      anchorZoneId: zoneId,
      anchorStartGain: target.gainDb,
      memberStartGains,
    };
  }, []);

  const endGainDrag = useCallback(() => {
    dragSnapshotRef.current = null;
  }, []);

  const setZoneGain = useCallback(
    (zoneId: string, nextGainRaw: number) => {
      const currentZones = zonesRef.current;
      const target = currentZones.find((z) => z.id === zoneId);
      if (!target) return;

      if (target.gpioVcLocked !== 0) {
        pushNotice(
          `${target.name} volume is locked by hardware GPIO VC ${target.gpioVcLocked}.`,
          'warning'
        );
        return;
      }

      const clampedTarget = clamp(roundToHalfDb(nextGainRaw), target.gainMin, target.gainMax);
      const snapshot =
        dragSnapshotRef.current?.anchorZoneId === zoneId ? dragSnapshotRef.current : null;
      const anchorBase = snapshot ? snapshot.anchorStartGain : target.gainDb;
      const delta = clampedTarget - anchorBase;

      const updatedZonesToDispatch: ZoneState[] = [];

      const activeGroup = target.linkGroupId
        ? linkGroupsRef.current.find((g) => g.id === target.linkGroupId && g.enabled)
        : null;

      setZones((prev) =>
        prev.map((z) => {
          if (z.id === zoneId) {
            const nextZone = { ...z, gainDb: clampedTarget };
            updatedZonesToDispatch.push(nextZone);
            return nextZone;
          }

          if (activeGroup && z.linkGroupId === activeGroup.id) {
            if (z.gpioVcLocked !== 0) return z;
            const startVal = snapshot?.memberStartGains[z.id] ?? z.gainDb;
            const nextVal = clamp(roundToHalfDb(startVal + delta), z.gainMin, z.gainMax);
            const nextZone = { ...z, gainDb: nextVal };
            updatedZonesToDispatch.push(nextZone);
            return nextZone;
          }

          return z;
        })
      );

      const clients = clientsRef.current;
      if (clients) {
        for (const z of updatedZonesToDispatch) {
          clients[z.ampId].setZoneGain(z.zid, z.gainDb);
        }
      }
    },
    [pushNotice]
  );

  const toggleZoneMute = useCallback(
    (zoneId: string) => {
      const currentZones = zonesRef.current;
      const target = currentZones.find((z) => z.id === zoneId);
      if (!target) return;

      if (!target.muteEnabled) {
        pushNotice(`Mute is disabled in hardware for ${target.name}.`, 'warning');
        return;
      }

      const nextMuted = !target.muted;
      const group = target.linkGroupId
        ? linkGroupsRef.current.find((g) => g.id === target.linkGroupId && g.enabled)
        : null;
      const propagateMute = Boolean(group && group.linkMute);

      const affected: ZoneState[] = [];

      setZones((prev) =>
        prev.map((z) => {
          const isMatch =
            z.id === zoneId ||
            (propagateMute && z.linkGroupId === target.linkGroupId && z.muteEnabled);
          if (!isMatch) return z;
          const next = { ...z, muted: nextMuted };
          affected.push(next);
          return next;
        })
      );

      const clients = clientsRef.current;
      if (clients) {
        for (const z of affected) {
          clients[z.ampId].setZoneMute(z.zid, z.muted);
        }
      }
    },
    [pushNotice]
  );

  // --- Amplifier Config & Connection Controls ---
  const updateAmpConfig = useCallback(
    (ampId: AmpId, patch: Partial<Pick<AmplifierConfig, 'label' | 'ip' | 'wsUrlOverride'>>) => {
      setAmps((prev) => ({
        ...prev,
        [ampId]: {
          ...prev[ampId],
          ...patch,
        },
      }));
    },
    []
  );

  const connectAmp = useCallback((ampId: AmpId, overrideIp?: string, overrideWs?: string) => {
    const client = clientsRef.current?.[ampId];
    if (!client) return;
    setAmps((prev) => {
      const cfg = prev[ampId];
      client.connect(overrideIp ?? cfg.ip, overrideWs ?? cfg.wsUrlOverride);
      return prev;
    });
  }, []);

  const disconnectAmp = useCallback((ampId: AmpId) => {
    clientsRef.current?.[ampId].disconnect('simulated', 'Disconnected manually — offline simulation.');
  }, []);

  const pingAmp = useCallback(
    async (ampId: AmpId) => {
      const client = clientsRef.current?.[ampId];
      if (!client || client.getStatus() !== 'connected') {
        pushNotice(`Amp ${ampId === 'amp1' ? '1' : '2'} is in offline simulation mode.`, 'info');
        return;
      }
      try {
        const ms = await client.ping();
        pushNotice(`Amp ${ampId === 'amp1' ? '1' : '2'} PONG (${ms} ms)`, 'info');
      } catch (err) {
        pushNotice(err instanceof Error ? err.message : 'Ping failed', 'warning');
      }
    },
    [pushNotice]
  );

  const pullAmp = useCallback(
    async (ampId: AmpId) => {
      const client = clientsRef.current?.[ampId];
      if (!client || client.getStatus() !== 'connected') {
        pushNotice(`Connect to Amp ${ampId === 'amp1' ? '1' : '2'} first to pull hardware state.`, 'warning');
        return;
      }
      await client.pullAllRegisters();
      pushNotice(`Synced registers from Amp ${ampId === 'amp1' ? '1' : '2'}.`, 'info');
    },
    [pushNotice]
  );

  const setAmpPower = useCallback(
    async (ampId: AmpId, on: boolean) => {
      const client = clientsRef.current?.[ampId];
      if (!client || client.getStatus() !== 'connected') {
        setAmps((prev) => ({
          ...prev,
          [ampId]: {
            ...prev[ampId],
            deviceInfo: {
              ...prev[ampId].deviceInfo,
              systemState: on ? 'ON' : 'STANDBY',
            },
          },
        }));
        return;
      }
      try {
        await client.setPower(on);
      } catch (err) {
        pushNotice(err instanceof Error ? err.message : 'Power command failed', 'warning');
      }
    },
    [pushNotice]
  );

  // --- Zone Setup Controls ---
  const renameZone = useCallback((zoneId: string, nextName: string, pushToAmp = false) => {
    const cleaned = sanitizeZoneName(nextName);
    setZones((prev) =>
      prev.map((z) => (z.id === zoneId ? { ...z, name: cleaned } : z))
    );
    if (pushToAmp && cleaned.trim()) {
      const target = zonesRef.current.find((z) => z.id === zoneId);
      if (target) {
        const client = clientsRef.current?.[target.ampId];
        if (client && client.getStatus() === 'connected') {
          void client.setZoneName(target.zid, cleaned.trim()).catch(() => {});
        }
      }
    }
  }, []);

  const pushZoneNameToAmp = useCallback(
    async (zoneId: string) => {
      const target = zonesRef.current.find((z) => z.id === zoneId);
      if (!target) return;
      const client = clientsRef.current?.[target.ampId];
      if (!client || client.getStatus() !== 'connected') {
        pushNotice(`Saved "${target.name}" locally (amp in offline simulation).`, 'info');
        return;
      }
      try {
        await client.setZoneName(target.zid, target.name.trim() || `Zone`);
        pushNotice(`Pushed name "${target.name}" to amplifier.`, 'info');
      } catch (err) {
        pushNotice(err instanceof Error ? err.message : 'Failed to push name', 'warning');
      }
    },
    [pushNotice]
  );

  const updateZoneBounds = useCallback((zoneId: string, minDb: number, maxDb: number) => {
    const safeMin = clamp(roundToHalfDb(minDb), MIN_GAIN_DB, MAX_GAIN_DB);
    const safeMax = clamp(roundToHalfDb(maxDb), safeMin, MAX_GAIN_DB);
    let updatedZone: ZoneState | null = null;
    setZones((prev) =>
      prev.map((z) => {
        if (z.id !== zoneId) return z;
        updatedZone = {
          ...z,
          gainMin: safeMin,
          gainMax: safeMax,
          gainDb: clamp(z.gainDb, safeMin, safeMax),
        };
        return updatedZone;
      })
    );
    if (updatedZone) {
      const z = updatedZone as ZoneState;
      const client = clientsRef.current?.[z.ampId];
      if (client && client.getStatus() === 'connected') {
        void client.setZoneBounds(z.zid, safeMin, safeMax).catch(() => {});
      }
    }
  }, []);

  // --- Link Group Management ---
  const createLinkGroup = useCallback((name: string, zoneIds: string[], linkMute = true) => {
    const cleanIds = Array.from(new Set(zoneIds));
    const id = `grp-${Date.now().toString(36)}`;
    const nextColor =
      LINK_COLOR_ORDER[linkGroupsRef.current.length % LINK_COLOR_ORDER.length];
    const cleanName = name.trim() || `Group ${linkGroupsRef.current.length + 1}`;

    const newGroup: LinkGroup = {
      id,
      name: cleanName,
      colorToken: nextColor,
      enabled: true,
      linkMute,
      zoneIds: cleanIds,
    };

    const selectedSet = new Set(cleanIds);
    setLinkGroups((prev) =>
      prev
        .map((g) => ({
          ...g,
          zoneIds: g.zoneIds.filter((zid) => !selectedSet.has(zid)),
        }))
        .concat(newGroup)
    );
    setZones((prev) =>
      prev.map((z) => (selectedSet.has(z.id) ? { ...z, linkGroupId: id } : z))
    );
  }, []);

  const updateLinkGroup = useCallback(
    (groupId: string, patch: Partial<Pick<LinkGroup, 'name' | 'linkMute' | 'enabled'>>) => {
      setLinkGroups((prev) =>
        prev.map((g) => (g.id === groupId ? { ...g, ...patch } : g))
      );
    },
    []
  );

  const toggleZoneInGroup = useCallback((groupId: string, zoneId: string) => {
    const currentGroup = linkGroupsRef.current.find((g) => g.id === groupId);
    if (!currentGroup) return;
    const isAlreadyInGroup = currentGroup.zoneIds.includes(zoneId);

    setLinkGroups((prev) =>
      prev.map((g) => {
        if (g.id === groupId) {
          return {
            ...g,
            zoneIds: isAlreadyInGroup
              ? g.zoneIds.filter((id) => id !== zoneId)
              : [...g.zoneIds, zoneId],
          };
        }
        return {
          ...g,
          zoneIds: g.zoneIds.filter((id) => id !== zoneId),
        };
      })
    );

    setZones((prev) =>
      prev.map((z) => {
        if (z.id !== zoneId) return z;
        return { ...z, linkGroupId: isAlreadyInGroup ? null : groupId };
      })
    );
  }, []);

  const deleteLinkGroup = useCallback((groupId: string) => {
    setLinkGroups((prev) => prev.filter((g) => g.id !== groupId));
    setZones((prev) =>
      prev.map((z) => (z.linkGroupId === groupId ? { ...z, linkGroupId: null } : z))
    );
  }, []);

  // --- Preferences & Reset ---
  const setUnitMode = useCallback((unitMode: VolumeUnit) => {
    setPreferences((prev) => ({ ...prev, unitMode }));
  }, []);

  const setAutoReconnect = useCallback((autoReconnect: boolean) => {
    setPreferences((prev) => ({ ...prev, autoReconnect }));
  }, []);

  const resetToDefaults = useCallback(() => {
    const def = createDefaultPersistedState();
    setAmps({
      amp1: {
        ...def.amps.amp1,
        connectionStatus: 'simulated',
        lastError: null,
        lastPingMs: null,
        lastSyncedAt: null,
      },
      amp2: {
        ...def.amps.amp2,
        connectionStatus: 'simulated',
        lastError: null,
        lastPingMs: null,
        lastSyncedAt: null,
      },
    });
    setZones(def.zones);
    setLinkGroups(def.linkGroups);
    setPreferences(def.preferences);
    clientsRef.current?.amp1.disconnect('simulated', null);
    clientsRef.current?.amp2.disconnect('simulated', null);
    pushNotice('Configuration reset to factory defaults.', 'info');
  }, [pushNotice]);

  const groupMap = useMemo(() => {
    const map = new Map<string, LinkGroup>();
    for (const g of linkGroups) map.set(g.id, g);
    return map;
  }, [linkGroups]);

  return {
    amps,
    zones,
    linkGroups,
    groupMap,
    preferences,
    notice,
    dismissNotice: () => setNotice(null),
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
  };
}
