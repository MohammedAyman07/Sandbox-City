import React from 'react';
import { Users } from 'lucide-react';
import { useSandboxStore } from '../store/useSandboxStore';
import { CITIZEN_LIVE_STATUSES } from '../utils/cityData';
import { CitizenMood } from '../types/sandbox';

function getMoodRingStyle(mood: CitizenMood): {
  ringColor: string;
  barClass: string;
  moodLabel: string;
} {
  if (mood === 'delighted' || mood === 'calm') {
    return {
      ringColor: '#3DDC97', // Green happy
      barClass: 'bg-[#3DDC97]',
      moodLabel: 'Happy',
    };
  }
  if (mood === 'annoyed') {
    return {
      ringColor: '#FFC439', // Amber unsure
      barClass: 'bg-[#FFC439]',
      moodLabel: 'Unsure',
    };
  }
  return {
    ringColor: '#FF5D73', // Red upset
    barClass: 'bg-[#FF5D73]',
    moodLabel: 'Upset',
  };
}

export const CitizenRosterAndBugLab: React.FC = () => {
  const { citizens, selectedCitizenId, selectCitizen } = useSandboxStore();

  return (
    <aside
      aria-label="Citizens Online Roster"
      className="absolute left-[24px] top-[94px] w-[285px] warm-panel p-4 flex flex-col gap-2 z-20"
    >
      {/* Panel Title */}
      <div className="flex items-center justify-between gap-2 px-1 pb-1.5 border-b border-[#1F2340]/10">
        <div className="flex items-center gap-2 shrink-0">
          <div className="w-7 h-7 rounded-xl bg-[#7FB69E]/25 flex items-center justify-center shrink-0">
            <Users className="w-4 h-4 text-[#1F2340]" />
          </div>
          <h2 className="font-display text-[15px] font-bold text-[#1F2340] whitespace-nowrap">
            Citizens (8 online)
          </h2>
        </div>
        <span className="text-[10px] font-bold text-[#1F2340]/55 whitespace-nowrap">
          Inspect
        </span>
      </div>

      {/* Vertical List of 8 Citizens */}
      <div className="flex flex-col gap-2">
        {citizens.map((citizen) => {
          const isSelected = citizen.id === selectedCitizenId;
          const moodStyle = getMoodRingStyle(citizen.mood);
          const liveStatus =
            citizen.mood === 'furious'
              ? 'Need help...'
              : citizen.isBotRing
                ? 'Suspicious...'
                : CITIZEN_LIVE_STATUSES[citizen.id] || 'Shopping...';

          const fullTooltip = `${citizen.name} (${citizen.archetype}) — Status: ${liveStatus} | Patience: ${citizen.patience}% | Last thought: "${citizen.lastThought}"`;

          return (
            <button
              key={citizen.id}
              type="button"
              onClick={() => selectCitizen(isSelected ? null : citizen.id)}
              title={fullTooltip}
              aria-label={`Inspect citizen ${citizen.name}`}
              className={`w-full text-left px-3 py-2 rounded-2xl border transition-all flex items-center gap-3 cursor-pointer ${
                isSelected
                  ? 'bg-[#FFF4E0] border-[#0070E0] shadow-[0_0_0_2px_rgba(0,112,224,0.25)]'
                  : 'bg-[#FFF4E0]/75 border-[#1F2340]/8 hover:bg-[#FFF4E0] hover:border-[#1F2340]/20'
              }`}
            >
              {/* Round Avatar with Colored Mood Ring (green happy, amber unsure, red upset) */}
              <div
                className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 font-display text-xs font-bold text-[#1F2340] relative"
                style={{
                  backgroundColor: citizen.secondaryColor,
                  boxShadow: `0 0 0 3px ${moodStyle.ringColor}`,
                }}
              >
                {citizen.isBotRing ? '3x' : citizen.name.charAt(0)}
              </div>

              {/* Name, Live Status & Thin Progress Bar */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-1.5">
                  <span className="font-bold text-xs text-[#1F2340] leading-snug line-clamp-2">
                    {citizen.name}
                  </span>
                  <span className="text-[11px] font-semibold text-[#1F2340]/70 leading-snug line-clamp-2 text-right">
                    {liveStatus}
                  </span>
                </div>

                {/* Thin Progress Bar */}
                <div className="mt-1.5 h-1.5 w-full bg-[#1F2340]/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${moodStyle.barClass}`}
                    style={{ width: `${Math.max(18, citizen.patience)}%` }}
                  />
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
};
