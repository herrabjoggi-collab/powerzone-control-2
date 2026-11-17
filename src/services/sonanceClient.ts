import type { AmpId, ConnectionStatus, ZoneChannel } from '../types/audio';
import { clamp, formatWireString, MAX_GAIN_DB, MIN_GAIN_DB, roundToTenthDb } from '../utils/audioMath';

export interface SonanceClientCallbacks {
  onStatusChange: (ampId: AmpId, status: ConnectionStatus, error: string | null) => void;
  onRegisterUpdate: (ampId: AmpId, register: string, value: string) => void;
  onPingResult: (ampId: AmpId, rttMs: number) => void;
  onNotice: (ampId: AmpId, message: string) => void;
}

interface PendingCommand {
  commandKey: string;
  sentAt: number;
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

const SLIDER_COALESCE_MS = 60;
const KEEPALIVE_INTERVAL_MS = 6000;
const COMMAND_TIMEOUT_MS = 4500;
const CONNECT_TIMEOUT_MS = 4000;

export function buildAmpWsUrl(ip: string, wsUrlOverride?: string): string {
  const override = (wsUrlOverride ?? '').trim();
  if (override) {
    return override;
  }
  const cleanHost = ip.trim().replace(/^wss?:\/\//i, '').replace(/\/.*$/, '');
  return `ws://${cleanHost}/ws`;
}

export function isMixedContentWsBlocked(targetUrl: string): boolean {
  if (typeof window === 'undefined') return false;
  if (window.location.protocol !== 'https:') return false;
  if (!targetUrl.toLowerCase().startsWith('ws://')) return false;
  try {
    const parsed = new URL(targetUrl);
    return parsed.hostname !== 'localhost' && parsed.hostname !== '127.0.0.1';
  } catch {
    return true;
  }
}

function unquoteWireValue(raw: string): string {
  const trimmed = raw.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

/**
 * Sonance Open API v1.5 WebSocket Client
 * Speaks the line-oriented `GET` / `SET` / `SUBSCRIBE REG` / `PING` protocol on `/ws`.
 */
export class SonanceAmpClient {
  private readonly ampId: AmpId;
  private readonly callbacks: SonanceClientCallbacks;
  private ws: WebSocket | null = null;
  private currentUrl = '';
  private status: ConnectionStatus = 'simulated';
  private manualDisconnect = false;
  private pendingCommands: PendingCommand[] = [];
  private coalescedSets = new Map<string, string>();
  private coalesceTimer: ReturnType<typeof setTimeout> | null = null;
  private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private connectTimer: ReturnType<typeof setTimeout> | null = null;
  private reconnectAttempts = 0;
  private autoReconnect = true;

  constructor(ampId: AmpId, callbacks: SonanceClientCallbacks) {
    this.ampId = ampId;
    this.callbacks = callbacks;
  }

  public setAutoReconnect(enabled: boolean): void {
    this.autoReconnect = enabled;
    if (!enabled && this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  public getStatus(): ConnectionStatus {
    return this.status;
  }

  public connect(ip: string, wsUrlOverride?: string): void {
    const cleanIp = ip.trim();
    const override = (wsUrlOverride ?? '').trim();
    if (!cleanIp && !override) {
      this.disconnect('simulated', 'No amplifier IP configured — running offline simulation.');
      return;
    }

    const url = buildAmpWsUrl(cleanIp, override);
    this.currentUrl = url;
    this.manualDisconnect = false;
    this.clearTimers();
    this.closeSocketOnly();

    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      this.updateStatus('simulated', 'Device is offline — local simulation active.');
      return;
    }

    this.updateStatus('connecting', null);

    try {
      const socket = new WebSocket(url);
      this.ws = socket;

      this.connectTimer = setTimeout(() => {
        if (this.ws === socket && socket.readyState === WebSocket.CONNECTING) {
          this.closeSocketOnly();
          const mixedNote = isMixedContentWsBlocked(url)
            ? 'Blocked or timed out: HTTPS pages require wss:// or local HTTP access for ws:// amplifiers.'
            : `Amplifier at ${url} did not respond in time.`;
          this.handleFallback(mixedNote);
        }
      }, CONNECT_TIMEOUT_MS);

      socket.onopen = () => {
        if (this.ws !== socket) return;
        if (this.connectTimer) {
          clearTimeout(this.connectTimer);
          this.connectTimer = null;
        }
        this.reconnectAttempts = 0;
        this.updateStatus('connected', null);
        this.startKeepalive();
        void this.initializeSession();
      };

      socket.onmessage = (event) => {
        if (this.ws !== socket) return;
        if (typeof event.data === 'string') {
          this.handleWirePayload(event.data);
        }
      };

      socket.onerror = () => {
        if (this.ws !== socket) return;
        // Let onclose finalize transition with context.
      };

      socket.onclose = () => {
        if (this.ws !== socket) return;
        this.ws = null;
        this.clearTimers();
        this.rejectAllPending('Connection closed');

        if (this.manualDisconnect) {
          this.updateStatus('simulated', null);
          return;
        }

        const mixedNote = isMixedContentWsBlocked(url)
          ? 'Browser blocked insecure ws:// from HTTPS origin — using offline simulation (use wss:// or local HTTP).'
          : `Unreachable (${url}) — offline simulation active.`;
        this.handleFallback(mixedNote);
      };
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'WebSocket connection blocked — using offline simulation.';
      this.handleFallback(msg);
    }
  }

  public disconnect(nextStatus: ConnectionStatus = 'simulated', reason: string | null = null): void {
    this.manualDisconnect = true;
    this.clearTimers();
    this.closeSocketOnly();
    this.rejectAllPending('Disconnected');
    this.updateStatus(nextStatus, reason);
  }

  public destroy(): void {
    this.disconnect('simulated', null);
  }

  private handleFallback(reason: string): void {
    this.updateStatus('simulated', reason);
    if (this.autoReconnect && !this.manualDisconnect && typeof navigator !== 'undefined' && navigator.onLine !== false) {
      const delayMs = Math.min(30000, 4000 * Math.pow(1.6, Math.min(this.reconnectAttempts, 4)));
      this.reconnectAttempts += 1;
      this.reconnectTimer = setTimeout(() => {
        if (!this.manualDisconnect && this.currentUrl) {
          this.connect('', this.currentUrl);
        }
      }, delayMs);
    }
  }

  private updateStatus(status: ConnectionStatus, error: string | null): void {
    this.status = status;
    this.callbacks.onStatusChange(this.ampId, status, error);
  }

  private closeSocketOnly(): void {
    if (this.ws) {
      const old = this.ws;
      this.ws = null;
      old.onopen = null;
      old.onmessage = null;
      old.onerror = null;
      old.onclose = null;
      try {
        old.close();
      } catch {
        // Ignore close errors
      }
    }
  }

  private clearTimers(): void {
    if (this.coalesceTimer) {
      clearTimeout(this.coalesceTimer);
      this.coalesceTimer = null;
    }
    if (this.keepaliveTimer) {
      clearInterval(this.keepaliveTimer);
      this.keepaliveTimer = null;
    }
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.connectTimer) {
      clearTimeout(this.connectTimer);
      this.connectTimer = null;
    }
    this.coalescedSets.clear();
  }

  private startKeepalive(): void {
    if (this.keepaliveTimer) clearInterval(this.keepaliveTimer);
    this.keepaliveTimer = setInterval(() => {
      if (this.ws && this.ws.readyState === WebSocket.OPEN) {
        void this.ping().catch(() => {});
      }
    }, KEEPALIVE_INTERVAL_MS);
  }

  private async initializeSession(): Promise<void> {
    try {
      await this.pullAllRegisters();
      await this.sendCommand('SUBSCRIBE REG');
    } catch {
      // Individual errors surface via callback notices
    }
  }

  public async pullAllRegisters(): Promise<void> {
    const queries = [
      'GET SYSTEM.DEVICE.MODEL_NAME',
      'GET SYSTEM.DEVICE.FIRMWARE',
      'GET SYSTEM.STATUS.STATE',
      'GET SETUP.SYSTEM.DEVICE_NAME',
      'GET SETUP.SYSTEM.VENUE_NAME',
      'GET ZONE-*.NAME',
      'GET ZONE-*.GAIN',
      'GET ZONE-*.GAIN_MIN',
      'GET ZONE-*.GAIN_MAX',
      'GET ZONE-*.MUTE',
      'GET ZONE-*.MUTE_ENABLE',
      'GET ZONE-*.GPIO_VC',
      'GET ZONE-*.STEREO',
    ];
    for (const q of queries) {
      await this.sendCommand(q).catch(() => {});
    }
  }

  public async ping(): Promise<number> {
    const start = performance.now();
    await this.sendCommand('PING');
    const rtt = Math.round(performance.now() - start);
    this.callbacks.onPingResult(this.ampId, rtt);
    return rtt;
  }

  public enqueueSet(register: string, value: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.coalescedSets.set(register, value);
    if (!this.coalesceTimer) {
      this.coalesceTimer = setTimeout(() => {
        this.coalesceTimer = null;
        this.flushCoalescedSets();
      }, SLIDER_COALESCE_MS);
    }
  }

  private flushCoalescedSets(): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      this.coalescedSets.clear();
      return;
    }
    const entries = Array.from(this.coalescedSets.entries());
    this.coalescedSets.clear();
    for (const [reg, val] of entries) {
      void this.sendCommand(`SET ${reg} ${val}`).catch(() => {});
    }
  }

  public setZoneGain(zid: ZoneChannel, gainDb: number): void {
    const safeGain = roundToTenthDb(clamp(gainDb, MIN_GAIN_DB, MAX_GAIN_DB));
    this.enqueueSet(`ZONE-${zid}.GAIN`, safeGain.toFixed(1));
  }

  public setZoneMute(zid: ZoneChannel, muted: boolean): void {
    this.enqueueSet(`ZONE-${zid}.MUTE`, muted ? '1' : '0');
  }

  public async setZoneName(zid: ZoneChannel, name: string): Promise<void> {
    await this.sendCommand(`SET ZONE-${zid}.NAME ${formatWireString(name)}`);
  }

  public async setZoneBounds(zid: ZoneChannel, minDb: number, maxDb: number): Promise<void> {
    const safeMin = roundToTenthDb(clamp(minDb, MIN_GAIN_DB, MAX_GAIN_DB));
    const safeMax = roundToTenthDb(clamp(maxDb, safeMin, MAX_GAIN_DB));
    await this.sendCommand(`SET ZONE-${zid}.GAIN_MIN ${safeMin.toFixed(1)}`);
    await this.sendCommand(`SET ZONE-${zid}.GAIN_MAX ${safeMax.toFixed(1)}`);
  }

  public async setPower(on: boolean): Promise<void> {
    await this.sendCommand(on ? 'POWER_ON' : 'POWER_OFF');
    await this.sendCommand('GET SYSTEM.STATUS.STATE').catch(() => {});
  }

  public sendCommand(line: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
        reject(new Error('Amplifier not connected'));
        return;
      }

      const commandKey = line.trim().split(/\s+/)[0].toUpperCase();
      const timer = setTimeout(() => {
        const idx = this.pendingCommands.findIndex((p) => p.timer === timer);
        if (idx !== -1) this.pendingCommands.splice(idx, 1);
        reject(new Error(`Timeout waiting for *${commandKey}`));
      }, COMMAND_TIMEOUT_MS);

      this.pendingCommands.push({
        commandKey,
        sentAt: performance.now(),
        resolve,
        reject,
        timer,
      });

      try {
        this.ws.send(`${line}\n`);
      } catch (err) {
        clearTimeout(timer);
        const idx = this.pendingCommands.findIndex((p) => p.timer === timer);
        if (idx !== -1) this.pendingCommands.splice(idx, 1);
        reject(err instanceof Error ? err : new Error('Send failed'));
      }
    });
  }

  private handleWirePayload(payload: string): void {
    const lines = payload.split(/\r?\n/);
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line) continue;

      if (line.startsWith('+')) {
        // Register update: +<REGISTER> <VALUE>
        const spaceIdx = line.indexOf(' ');
        if (spaceIdx > 1) {
          const register = line.slice(1, spaceIdx).trim().toUpperCase();
          const rawValue = unquoteWireValue(line.slice(spaceIdx + 1));
          this.callbacks.onRegisterUpdate(this.ampId, register, rawValue);
        }
        continue;
      }

      if (line.startsWith('*')) {
        const ackCmd = line.slice(1).trim().split(/\s+/)[0].toUpperCase();
        const matchIdx = this.pendingCommands.findIndex((p) => p.commandKey === ackCmd);
        if (matchIdx !== -1) {
          const [pending] = this.pendingCommands.splice(matchIdx, 1);
          clearTimeout(pending.timer);
          pending.resolve();
        }
        continue;
      }

      if (line.startsWith('#')) {
        // Error: #<command>|<message> or #E0: ...
        const body = line.slice(1);
        const pipeIdx = body.indexOf('|');
        const errCmd = pipeIdx !== -1 ? body.slice(0, pipeIdx).trim().toUpperCase() : '';
        const errMsg = pipeIdx !== -1 ? body.slice(pipeIdx + 1).trim() : body.trim();
        this.callbacks.onNotice(this.ampId, errMsg);

        const matchIdx = errCmd
          ? this.pendingCommands.findIndex((p) => p.commandKey === errCmd)
          : 0;
        if (matchIdx >= 0 && matchIdx < this.pendingCommands.length) {
          const [pending] = this.pendingCommands.splice(matchIdx, 1);
          clearTimeout(pending.timer);
          pending.reject(new Error(errMsg));
        }
        continue;
      }

      if (line === 'PONG') {
        // Server emits PONG followed by *PING
        continue;
      }
    }
  }

  private rejectAllPending(reason: string): void {
    const items = this.pendingCommands.splice(0, this.pendingCommands.length);
    for (const item of items) {
      clearTimeout(item.timer);
      item.reject(new Error(reason));
    }
  }
}
