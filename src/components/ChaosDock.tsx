import React from 'react';
import { Flame, TrendingUp, Skull, WifiOff, Coins } from 'lucide-react';
import { useSandboxStore } from '../store/useSandboxStore';
import { CHAOS_BUTTONS } from '../utils/cityData';
import { ChaosType } from '../types/sandbox';

const SCENARIO_ICONS: Record<ChaosType, React.ReactNode> = {
  black_friday: <Flame className="w-4 h-4 text-[#E8765A]" />,
  viral_tiktok: <TrendingUp className="w-4 h-4 text-[#0070E0]" />,
  fraud_ring: <Skull className="w-4 h-4 text-[#FF5D73]" />,
  webhook_outage: <WifiOff className="w-4 h-4 text-[#D97706]" />,
  currency_swing: <Coins className="w-4 h-4 text-[#15803D]" />,
};

export const ChaosDock: React.FC = () => {
  const { activeChaos, chaosTimeRemaining, triggerChaos } = useSandboxStore();

  return (
    <footer
      aria-label="Quick Scenarios Dock"
      className="absolute bottom-[18px] left-[323px] right-[404px] warm-panel px-4 py-2.5 flex items-center justify-between gap-3 z-20"
    >
      <div
        className="shrink-0 pr-2 border-r border-[#1F2340]/10"
        title="Quick scenarios: Trigger realistic traffic surges, fraud rings, webhook outages, or FX volatility"
      >
        <span className="font-display text-xs font-bold text-[#1F2340] block leading-tight">
          Quick scenarios
        </span>
        <span className="text-[10px] font-semibold text-[#1F2340]/60 block">
          Stress-test payments
        </span>
      </div>

      <div className="flex-1 grid grid-cols-5 gap-2">
        {CHAOS_BUTTONS.map((btn) => {
          const isActive = activeChaos === btn.id;
          return (
            <button
              key={btn.id}
              type="button"
              title={`${btn.label}: ${btn.subtitle} (${btn.durationSec}s scenario)`}
              onClick={() => triggerChaos(btn.id)}
              className={`px-3 py-2 rounded-2xl border text-left transition-all flex items-center justify-between gap-2 cursor-pointer ${
                isActive
                  ? 'bg-[#FFF4E0] border-[#0070E0] ring-3 ring-[#0070E0]/30 shadow-sm'
                  : 'bg-[#FFF4E0]/85 border-[#1F2340]/12 hover:bg-[#FFF4E0] hover:border-[#1F2340]/25'
              }`}
            >
              <div className="flex items-center gap-2 min-w-0">
                <div className="w-7 h-7 rounded-full bg-white/90 border border-[#1F2340]/10 flex items-center justify-center shrink-0">
                  {SCENARIO_ICONS[btn.id]}
                </div>
                <div className="min-w-0">
                  <div className="font-display text-xs font-bold text-[#1F2340] leading-tight line-clamp-2">
                    {btn.label}
                  </div>
                  <div className="text-[10px] font-semibold text-[#1F2340]/65 leading-tight line-clamp-2">
                    {btn.subtitle}
                  </div>
                </div>
              </div>

              {isActive && (
                <span className="font-mono text-[11px] font-bold text-[#0070E0] tabular-nums shrink-0 pr-1">
                  {Math.ceil(chaosTimeRemaining)}s
                </span>
              )}
            </button>
          );
        })}
      </div>
    </footer>
  );
};
