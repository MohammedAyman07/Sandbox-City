/**
 * @license
 * SPDX-License-Identifier: MIT
 */

import React, { useEffect, useRef, useState } from 'react';
import { TopBar } from './components/TopBar';
import { CitizenRosterAndBugLab } from './components/CitizenRosterAndBugLab';
import { CityCanvas } from './components/CityCanvas';
import { CitizenProfileModal } from './components/CitizenProfileModal';
import { RightPanel } from './components/RightPanel';
import { ChaosDock } from './components/ChaosDock';
import { useSandboxStore } from './store/useSandboxStore';
import { STAGE_HEIGHT, STAGE_WIDTH } from './utils/cityData';
import { AlertTriangle, Settings, X } from 'lucide-react';

export default function App() {
  const {
    mode,
    fallbackBanners,
    dismissFallbackBanner,
    setSettingsOpen,
    setMode,
    ingestServerEvent,
    updateServerStatus,
    fetchInitialServerStatus,
  } = useSandboxStore();

  const viewportRef = useRef<HTMLDivElement | null>(null);

  const [scale, setScale] = useState<number>(() => {
    if (typeof window === 'undefined') return 0.75;
    return Math.min(window.innerWidth / STAGE_WIDTH, window.innerHeight / STAGE_HEIGHT);
  });

  useEffect(() => {
    const computeScale = () => {
      const vw = viewportRef.current?.clientWidth || window.innerWidth;
      const vh = viewportRef.current?.clientHeight || window.innerHeight;
      const nextScale = Math.min(vw / STAGE_WIDTH, vh / STAGE_HEIGHT);
      setScale(Math.max(0.15, nextScale));
    };

    computeScale();
    window.addEventListener('resize', computeScale);

    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && viewportRef.current) {
      observer = new ResizeObserver(computeScale);
      observer.observe(viewportRef.current);
    }

    return () => {
      window.removeEventListener('resize', computeScale);
      if (observer) observer.disconnect();
    };
  }, []);

  // Connect to Server-Sent Events (/api/events/stream) for real-time backend telemetry
  useEffect(() => {
    fetchInitialServerStatus();

    if (typeof EventSource === 'undefined') return;
    const es = new EventSource('/api/events/stream');

    es.onmessage = (msg) => {
      try {
        const parsed = JSON.parse(msg.data);
        if (parsed.type === 'event' && parsed.event) {
          ingestServerEvent(
            parsed.event,
            parsed.liveCallsCount,
            parsed.maxLiveCalls,
            parsed.fallbackBanners
          );
        } else if (parsed.type === 'status') {
          updateServerStatus({
            liveCallsCount: parsed.liveCallsCount,
            maxLiveCalls: parsed.maxLiveCalls,
            fallbackBanners: parsed.fallbackBanners,
          });
        }
      } catch {
        // Ignore malformed SSE packet
      }
    };

    return () => {
      es.close();
    };
  }, [fetchInitialServerStatus, ingestServerEvent, updateServerStatus]);

  return (
    <div
      ref={viewportRef}
      className="relative w-screen h-screen bg-[#FFF4E0] text-[#1F2340] overflow-hidden select-none"
    >
      {/* Fixed 1920x1080 Design Stage scaled to fit BOTH width and height (contain, letterboxed, centered) */}
      <main
        style={{
          width: `${STAGE_WIDTH}px`,
          height: `${STAGE_HEIGHT}px`,
          position: 'absolute',
          left: '50%',
          top: '50%',
          transform: `translate(-50%, -50%) scale(${scale})`,
          transformOrigin: 'center center',
        }}
        className="overflow-hidden bg-[#FFF4E0] shadow-[0_0_60px_rgba(31,35,64,0.12)]"
      >
        {/* Full-Stage City Artwork + Interactive Map Layer + Mayor's Report Bubble */}
        <CityCanvas />

        {/* 1. Floating Top Bar (Brand, Clock, 4 Derived KPI Chips, Live Calls Counter, Mode Toggle, Settings) */}
        <TopBar />

        {/* 2. Floating Left Panel: "Citizens (8 online)" */}
        <CitizenRosterAndBugLab />

        {/* 3. Floating Right Panel: "Building detail" + 6. "City Performance" mini card */}
        <RightPanel />

        {/* 4. Floating Bottom Dock: "Quick scenarios" */}
        <ChaosDock />

        {/* Modals: Citizen Profile Card, Event Inspector, Mayor Before/After Comparison, Full AG Grid Ledger */}
        <CitizenProfileModal />

        {/* API Fallback Banner (shown when Live Sandbox encounters missing creds or auth/permission error) */}
        {mode === 'LIVE_SANDBOX' && fallbackBanners.length > 0 && (
          <div
            role="alert"
            aria-label="PayPal API Fallback Banner"
            className="absolute top-[94px] right-[404px] w-[440px] warm-panel p-3.5 z-40 border-2 border-[#E8765A] space-y-2"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-[#E8765A] shrink-0" />
                <span className="font-display text-xs font-bold text-[#1F2340]">
                  PayPal API Fallback to SIMULATED
                </span>
              </div>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => {
                    fetch('/api/reset-counter', { method: 'POST' }).catch(() => {});
                    useSandboxStore.setState({ liveCallsCount: 0, fallbackBanners: [] });
                  }}
                  className="px-2.5 py-1 rounded-lg bg-[#3DDC97] hover:bg-[#32B87D] text-[#1F2340] text-[10px] font-bold cursor-pointer"
                >
                  Reset Counter
                </button>
                <button
                  type="button"
                  onClick={() => setMode('SIMULATED')}
                  className="px-2.5 py-1 rounded-lg bg-[#0070E0] text-white text-[10px] font-bold cursor-pointer"
                >
                  Switch to Demo Mode
                </button>
              </div>
            </div>

            <div className="space-y-1.5 max-h-28 overflow-y-auto pr-1">
              {fallbackBanners.map((fb) => (
                <div
                  key={fb.service}
                  className="p-2 rounded-xl bg-[#FFF4E0] border border-[#E8765A]/40 flex items-start justify-between gap-2 text-[11px]"
                >
                  <div>
                    <span className="font-mono font-bold text-[#B91C1C]">[{fb.service} API]</span>{' '}
                    <span className="font-semibold text-[#1F2340]/90">{fb.reason}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => dismissFallbackBanner(fb.service)}
                    aria-label={`Dismiss ${fb.service} fallback banner`}
                    className="text-[#1F2340]/50 hover:text-[#1F2340] shrink-0 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-1">
              <span className="text-[10px] font-semibold text-[#1F2340]/70">
                Simulated fallback events are strictly badged SIMULATED.
              </span>
              <button
                type="button"
                onClick={() => setSettingsOpen(true)}
                className="px-2.5 py-1 rounded-lg bg-[#FFF4E0] border border-[#1F2340]/15 text-[#1F2340] text-[10px] font-bold flex items-center gap-1 cursor-pointer"
              >
                <Settings className="w-3 h-3" />
                <span>Open Settings Drawer</span>
              </button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
