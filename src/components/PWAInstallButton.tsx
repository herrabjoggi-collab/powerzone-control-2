import React, { useState } from 'react';
import { Download, PlusSquare, Share, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

export const PWAInstallButton: React.FC = () => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showIOSGuide, setShowIOSGuide] = useState(false);

  if (isInstalled) {
    return null;
  }

  if (isInstallable) {
    return (
      <button
        type="button"
        onClick={() => void install()}
        className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition-colors whitespace-nowrap shrink-0"
      >
        <Download className="w-4 h-4" aria-hidden="true" />
        <span>Install App</span>
      </button>
    );
  }

  if (isIOS) {
    return (
      <>
        <button
          type="button"
          onClick={() => setShowIOSGuide(true)}
          className="inline-flex items-center justify-center gap-2 min-h-[44px] px-4 py-2 rounded-xl bg-[#1B2029] border border-white/15 hover:border-sky-400/50 text-slate-100 font-medium text-sm transition-colors whitespace-nowrap shrink-0"
        >
          <PlusSquare className="w-4 h-4 text-sky-400" aria-hidden="true" />
          <span>Add to Home Screen</span>
        </button>

        {showIOSGuide && (
          <div
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 backdrop-blur-sm p-4 pb-safe"
            role="dialog"
            aria-modal="true"
            aria-labelledby="ios-install-title"
          >
            <div className="w-full max-w-sm bg-[#14181F] border border-white/10 rounded-2xl p-5 shadow-2xl">
              <div className="flex items-center justify-between gap-3 mb-3">
                <h3 id="ios-install-title" className="text-base font-semibold text-slate-100">
                  Install on iPhone Home Screen
                </h3>
                <button
                  type="button"
                  onClick={() => setShowIOSGuide(false)}
                  aria-label="Close installation guide"
                  className="min-w-[44px] min-h-[44px] -mr-2 flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" aria-hidden="true" />
                </button>
              </div>
              <ol className="space-y-3 text-sm text-slate-300">
                <li className="flex items-start gap-2.5">
                  <span className="font-mono text-xs text-sky-400 pt-0.5">1.</span>
                  <span>
                    Tap the <strong className="text-white inline-flex items-center gap-1">Share <Share className="w-3.5 h-3.5 inline text-sky-400" aria-hidden="true" /></strong> button in Safari&apos;s toolbar.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono text-xs text-sky-400 pt-0.5">2.</span>
                  <span>
                    Scroll down and tap <strong className="text-white">Add to Home Screen</strong>.
                  </span>
                </li>
                <li className="flex items-start gap-2.5">
                  <span className="font-mono text-xs text-sky-400 pt-0.5">3.</span>
                  <span>
                    Launch <strong className="text-white">PowerZone</strong> from your Home Screen for full-screen offline control.
                  </span>
                </li>
              </ol>
              <button
                type="button"
                onClick={() => setShowIOSGuide(false)}
                className="mt-5 w-full min-h-[44px] rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-semibold text-sm transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        )}
      </>
    );
  }

  return null;
};
