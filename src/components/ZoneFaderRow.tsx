import React, { useCallback, useRef, useState } from 'react';
import { Lock, Volume2, VolumeX } from 'lucide-react';
import type { LinkGroup, VolumeUnit, ZoneState } from '../types/audio';
import {
  clamp,
  formatVolumeReadout,
  gainToPercent,
  LINK_COLOR_CLASSES,
  roundToHalfDb,
} from '../utils/audioMath';

interface ZoneFaderRowProps {
  zone: ZoneState;
  linkGroup: LinkGroup | null;
  unitMode: VolumeUnit;
  onBeginDrag: (zoneId: string) => void;
  onChangeGain: (zoneId: string, nextGainDb: number) => void;
  onEndDrag: () => void;
  onToggleMute: (zoneId: string) => void;
}

export const ZoneFaderRow: React.FC<ZoneFaderRowProps> = ({
  zone,
  linkGroup,
  unitMode,
  onBeginDrag,
  onChangeGain,
  onEndDrag,
  onToggleMute,
}) => {
  const trackRef = useRef<HTMLDivElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const percent = gainToPercent(zone.gainDb, zone.gainMin, zone.gainMax);
  const readout = formatVolumeReadout(
    zone.gainDb,
    zone.gainMin,
    zone.gainMax,
    unitMode,
    zone.muted
  );
  const isLocked = zone.gpioVcLocked !== 0;

  const computeGainFromClientX = useCallback(
    (clientX: number) => {
      const el = trackRef.current;
      if (!el) return zone.gainDb;
      const rect = el.getBoundingClientRect();
      if (rect.width <= 0) return zone.gainDb;
      const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
      const rawDb = zone.gainMin + ratio * (zone.gainMax - zone.gainMin);
      return clamp(roundToHalfDb(rawDb), zone.gainMin, zone.gainMax);
    },
    [zone.gainDb, zone.gainMax, zone.gainMin]
  );

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isLocked) {
      onChangeGain(zone.id, zone.gainDb);
      return;
    }
    e.preventDefault();
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    onBeginDrag(zone.id);
    const nextGain = computeGainFromClientX(e.clientX);
    onChangeGain(zone.id, nextGain);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging || isLocked) return;
    const nextGain = computeGainFromClientX(e.clientX);
    onChangeGain(zone.id, nextGain);
  };

  const finishDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDragging) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    setIsDragging(false);
    onEndDrag();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (isLocked) return;
    const step = e.shiftKey ? 3 : 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      next = clamp(zone.gainDb + step, zone.gainMin, zone.gainMax);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      next = clamp(zone.gainDb - step, zone.gainMin, zone.gainMax);
    } else if (e.key === 'Home') {
      next = zone.gainMin;
    } else if (e.key === 'End') {
      next = zone.gainMax;
    }
    if (next !== null) {
      e.preventDefault();
      onBeginDrag(zone.id);
      onChangeGain(zone.id, next);
      onEndDrag();
    }
  };

  const groupStyle = linkGroup ? LINK_COLOR_CLASSES[linkGroup.colorToken] : null;
  const isConsolidatedGroup = Boolean(
    linkGroup && linkGroup.enabled && linkGroup.zoneIds.length >= 2
  );
  const displayTitle = isConsolidatedGroup && linkGroup ? linkGroup.name : zone.name;

  return (
    <div className="bg-[#14181F] border border-white/[0.08] rounded-xl px-3.5 py-2.5 transition-colors duration-150">
      {/* Top row: Zone or Active Group Name (+ subtle metadata) and tabular dB/% readout */}
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-[15px] font-semibold tracking-tight text-slate-100 truncate">
            {displayTitle}
          </span>
          {linkGroup && groupStyle && (
            <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap shrink-0">
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span
                aria-hidden="true"
                className={`w-1.5 h-1.5 rounded-full ${
                  linkGroup.enabled ? groupStyle.dot : 'bg-slate-600'
                }`}
              />
              <span className={linkGroup.enabled ? groupStyle.text : 'text-slate-500'}>
                {isConsolidatedGroup
                  ? `${linkGroup.zoneIds.length} zones`
                  : `${linkGroup.name} (unlinked)`}
              </span>
            </span>
          )}
          {isLocked && (
            <span
              className="inline-flex items-center gap-1 text-xs text-amber-400 whitespace-nowrap shrink-0"
              title={`Controlled by GPIO VC ${zone.gpioVcLocked}`}
            >
              <Lock className="w-3 h-3" aria-hidden="true" />
              <span>VC</span>
            </span>
          )}
        </div>

        <span
          className={`font-mono text-xs font-medium tabular-nums whitespace-nowrap shrink-0 ${
            zone.muted
              ? 'text-rose-400'
              : isDragging
                ? 'text-sky-300'
                : 'text-slate-300'
          }`}
        >
          {readout}
        </span>
      </div>

      {/* Bottom row: Tactile Volume Slider + 44x44px Mute Button */}
      <div className="flex items-center gap-3">
        <div
          ref={trackRef}
          role="slider"
          tabIndex={isLocked ? -1 : 0}
          aria-label={`${zone.name} volume`}
          aria-valuemin={zone.gainMin}
          aria-valuemax={zone.gainMax}
          aria-valuenow={zone.gainDb}
          aria-valuetext={readout}
          aria-disabled={isLocked}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={finishDrag}
          onPointerCancel={finishDrag}
          onKeyDown={handleKeyDown}
          style={{ touchAction: 'none' }}
          className={`relative flex-1 min-h-[44px] flex items-center select-none focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 rounded-lg ${
            isLocked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'
          }`}
        >
          {/* Rail */}
          <div className="relative w-full h-3 rounded-full bg-[#0B0D10] border border-white/[0.07] overflow-hidden">
            {/* Active fill */}
            <div
              className={`h-full rounded-full transition-[background-color] duration-150 ${
                zone.muted ? 'bg-slate-600/60' : 'bg-sky-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>

          {/* Precision Fader Thumb */}
          <div
            aria-hidden="true"
            className={`absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-6 h-6 rounded-full border shadow-md transition-transform duration-100 ${
              isDragging ? 'scale-110' : 'scale-100'
            } ${
              zone.muted
                ? 'bg-slate-400 border-slate-700'
                : 'bg-slate-100 border-sky-400/70'
            }`}
            style={{ left: `${percent}%` }}
          >
            <span
              className={`block w-1.5 h-1.5 rounded-full mx-auto mt-[8px] ${
                zone.muted ? 'bg-slate-700' : 'bg-sky-500'
              }`}
            />
          </div>
        </div>

        <button
          type="button"
          onClick={() => onToggleMute(zone.id)}
          aria-pressed={zone.muted}
          aria-label={zone.muted ? `Unmute ${zone.name}` : `Mute ${zone.name}`}
          className={`min-w-[44px] min-h-[44px] rounded-xl border flex items-center justify-center transition-colors duration-150 shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-sky-400/80 ${
            zone.muted
              ? 'bg-rose-500/18 border-rose-500/50 text-rose-400 hover:bg-rose-500/25'
              : 'bg-[#1B2029] border-white/[0.08] text-slate-300 hover:text-white hover:border-white/20'
          }`}
        >
          {zone.muted ? (
            <VolumeX className="w-5 h-5" aria-hidden="true" />
          ) : (
            <Volume2 className="w-5 h-5" aria-hidden="true" />
          )}
        </button>
      </div>
    </div>
  );
};
