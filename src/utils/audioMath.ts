import type { LinkColorToken, VolumeUnit } from '../types/audio';

export const MIN_GAIN_DB = -80;
export const MAX_GAIN_DB = 0;

export function clamp(val: number, min: number, max: number): number {
  if (!Number.isFinite(val)) return min;
  return Math.min(Math.max(val, min), max);
}

export function roundToHalfDb(val: number): number {
  return Math.round(val * 2) / 2;
}

export function roundToTenthDb(val: number): number {
  return Math.round(val * 10) / 10;
}

export function gainToPercent(gainDb: number, minDb: number, maxDb: number): number {
  const span = maxDb - minDb;
  if (span <= 0) return 0;
  const pct = ((clamp(gainDb, minDb, maxDb) - minDb) / span) * 100;
  return Math.round(clamp(pct, 0, 100));
}

export function percentToGain(percent: number, minDb: number, maxDb: number): number {
  const span = maxDb - minDb;
  if (span <= 0) return minDb;
  const raw = minDb + (clamp(percent, 0, 100) / 100) * span;
  return clamp(roundToHalfDb(raw), minDb, maxDb);
}

export function formatVolumeReadout(
  gainDb: number,
  minDb: number,
  maxDb: number,
  unit: VolumeUnit,
  muted: boolean
): string {
  if (muted) return 'MUTED';
  if (unit === 'percent') {
    return `${gainToPercent(gainDb, minDb, maxDb)}%`;
  }
  const rounded = roundToTenthDb(clamp(gainDb, MIN_GAIN_DB, MAX_GAIN_DB));
  const formatted = Number.isInteger(rounded) ? `${rounded}.0` : rounded.toFixed(1);
  return `${formatted} dB`;
}

/**
 * Sonance Open API v1.5 limits strings to 32 UTF-8 bytes/chars and does not
 * support escaping double-quotes inside quoted values.
 */
export function sanitizeZoneName(input: string): string {
  const withoutQuotes = input.replace(/"/g, '').replace(/[\r\n]/g, ' ');
  // Trim to <= 32 UTF-8 bytes cleanly
  const encoder = new TextEncoder();
  let out = withoutQuotes;
  while (encoder.encode(out).length > 32 && out.length > 0) {
    out = out.slice(0, -1);
  }
  return out;
}

export function formatWireString(val: string): string {
  const safe = sanitizeZoneName(val.trim()) || 'Zone';
  return /\s/.test(safe) ? `"${safe}"` : safe;
}

export const LINK_COLOR_CLASSES: Record<
  LinkColorToken,
  { dot: string; text: string; border: string; bgSoft: string }
> = {
  sky: {
    dot: 'bg-sky-400',
    text: 'text-sky-400',
    border: 'border-sky-500/40',
    bgSoft: 'bg-sky-500/12',
  },
  amber: {
    dot: 'bg-amber-400',
    text: 'text-amber-400',
    border: 'border-amber-500/40',
    bgSoft: 'bg-amber-500/12',
  },
  emerald: {
    dot: 'bg-emerald-400',
    text: 'text-emerald-400',
    border: 'border-emerald-500/40',
    bgSoft: 'bg-emerald-500/12',
  },
  violet: {
    dot: 'bg-violet-400',
    text: 'text-violet-400',
    border: 'border-violet-500/40',
    bgSoft: 'bg-violet-500/12',
  },
  rose: {
    dot: 'bg-rose-400',
    text: 'text-rose-400',
    border: 'border-rose-500/40',
    bgSoft: 'bg-rose-500/12',
  },
};

export const LINK_COLOR_ORDER: LinkColorToken[] = ['sky', 'amber', 'emerald', 'violet', 'rose'];
