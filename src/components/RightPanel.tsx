import React, { useMemo, useState } from 'react';
import {
  Store,
  Landmark,
  Scale,
  Truck,
  FileText,
  Award,
  ArrowUpRight,
  ArrowDownRight,
  AlertTriangle,
  CheckCircle2,
  Play,
  ExternalLink,
  Check,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { useSandboxStore } from '../store/useSandboxStore';
import { BUILDING_MAP, BUG_FLAGS_INFO } from '../utils/cityData';
import {
  deriveMetricsFromEventLog,
  derivePerformanceSeriesFromEventLog,
} from '../utils/simulationEngine';
import { BuildingId } from '../types/sandbox';

const BUILDING_ICONS: Record<BuildingId, React.ReactNode> = {
  flawed_shop: <Store className="w-4 h-4 text-[#E8765A]" />,
  bank_tower: <Landmark className="w-4 h-4 text-[#0070E0]" />,
  resolution_center: <Scale className="w-4 h-4 text-[#FFC439]" />,
  gig_hub: <Truck className="w-4 h-4 text-[#7FB69E]" />,
  rent_office: <FileText className="w-4 h-4 text-[#E8765A]" />,
  mayors_office: <Award className="w-4 h-4 text-[#0070E0]" />,
};

export const RightPanel: React.FC = () => {
  const {
    selectedBuildingId,
    buildings,
    events,
    bugFlags,
    toggleBugFlag,
    runBuildingTestAgain,
    setLedgerModalOpen,
    setInspectedEvent,
  } = useSandboxStore();

  const [hoveredTooltip, setHoveredTooltip] = useState<string | null>(null);

  const building =
    buildings.find((b) => b.id === selectedBuildingId) ||
    BUILDING_MAP[selectedBuildingId] ||
    BUILDING_MAP.flawed_shop;

  const metrics = useMemo(() => deriveMetricsFromEventLog(events), [events]);
  const chartData = useMemo(() => derivePerformanceSeriesFromEventLog(events), [events]);

  // Pull the top 3 detected issues from the event log
  const top3DetectedIssues = useMemo(() => {
    const issueEvents = events.filter(
      (e) =>
        e.flagsInvolved.length > 0 ||
        Boolean(e.paypalErrorName) ||
        e.type === 'abandon' ||
        e.type === 'dispute' ||
        e.httpStatus >= 400
    );
    return issueEvents.slice(0, 3);
  }, [events]);

  const activeBugCount = Object.values(bugFlags).filter(Boolean).length;
  const hasIssues = activeBugCount > 0 || top3DetectedIssues.length > 0;

  return (
    <div className="absolute right-[24px] top-[94px] bottom-[18px] w-[368px] flex flex-col justify-between gap-2.5 z-20 pointer-events-none">
      {/* 3. RIGHT PANEL: "Building detail" (default Flawed Shop) */}
      <aside
        aria-label="Building Detail Panel"
        className="pointer-events-auto warm-panel px-4 py-3.5 flex flex-col justify-between gap-2.5 flex-1 min-h-0"
      >
        {/* Header: Building Icon + Name + Status Badge */}
        <div className="flex items-start justify-between gap-2">
          <div
            className="flex items-start gap-2.5 min-w-0"
            title={`${building.name} — ${building.subtitle}: ${building.description}`}
          >
            <div className="w-8 h-8 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/10 flex items-center justify-center shrink-0 mt-0.5">
              {BUILDING_ICONS[building.id]}
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-[15px] font-bold text-[#1F2340] leading-tight line-clamp-2">
                {building.name}
              </h2>
              <p className="text-[11px] font-semibold text-[#1F2340]/68 leading-snug line-clamp-2">
                {building.subtitle}
              </p>
            </div>
          </div>

          <span
            title={
              hasIssues
                ? `${activeBugCount} active bug flags and ${top3DetectedIssues.length} recent issue events`
                : 'Building operating with zero detected issues'
            }
            className={`px-2.5 py-1 rounded-full text-[11px] font-bold flex items-center gap-1 shrink-0 ${
              hasIssues
                ? 'bg-[#FF5D73]/18 text-[#B91C1C] border border-[#FF5D73]/40'
                : 'bg-[#3DDC97]/22 text-[#065F46] border border-[#3DDC97]/50'
            }`}
          >
            {hasIssues ? (
              <>
                <AlertTriangle className="w-3 h-3 text-[#FF5D73]" />
                <span>Issues detected</span>
              </>
            ) : (
              <>
                <CheckCircle2 className="w-3 h-3 text-[#15803D]" />
                <span>Healthy</span>
              </>
            )}
          </span>
        </div>

        {/* Building Thumbnail + Mini Stats (Conversion, Abandonment with delta arrows) */}
        <div className="grid grid-cols-12 gap-2 items-stretch">
          {/* Building Artwork Thumbnail */}
          <div
            className="col-span-5 rounded-2xl border border-[#1F2340]/12 overflow-hidden relative min-h-[64px] bg-gradient-to-br from-[#FFF4E0] to-[#7FB69E]/40"
            style={{
              backgroundImage: 'url("/assets/aistudio/CITY_a9a783b3.jpg")',
              backgroundSize: '420%',
              backgroundPosition: building.thumbPosition,
            }}
            title={`${building.name}: ${building.description}`}
            aria-label={`${building.name} thumbnail`}
          >
            <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-[#1F2340]/80 to-transparent px-2 py-1">
              <span className="text-[10px] font-bold text-white block leading-tight line-clamp-2">
                {building.name}
              </span>
            </div>
          </div>

          {/* Mini Stats */}
          <div className="col-span-7 grid grid-cols-2 gap-2">
            <div
              title={`Conversion rate: ${metrics.conversionRate.toFixed(1)}% (Average checkout time ${metrics.avgCheckoutTimeSec.toFixed(1)}s)`}
              className="p-2 rounded-2xl bg-[#FFF4E0]/90 border border-[#1F2340]/10 flex flex-col justify-between"
            >
              <span className="text-[10px] font-bold text-[#1F2340]/65">Conversion</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="font-mono text-sm font-bold text-[#1F2340] tabular-nums">
                  {metrics.conversionRate.toFixed(1)}%
                </span>
                {metrics.conversionRate >= 50 ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#15803D]" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-[#D95D39]" />
                )}
              </div>
              <span className="text-[10px] font-semibold text-[#1F2340]/60 leading-tight line-clamp-2">
                Avg {metrics.avgCheckoutTimeSec.toFixed(1)}s
              </span>
            </div>

            <div
              title={`Cart abandonment rate: ${metrics.cartAbandonRate.toFixed(1)}% — Top abandon step: ${metrics.topAbandonStep}`}
              className="p-2 rounded-2xl bg-[#FFF4E0]/90 border border-[#1F2340]/10 flex flex-col justify-between"
            >
              <span className="text-[10px] font-bold text-[#1F2340]/65">Abandonment</span>
              <div className="flex items-center gap-1 mt-0.5">
                <span className="font-mono text-sm font-bold text-[#1F2340] tabular-nums">
                  {metrics.cartAbandonRate.toFixed(1)}%
                </span>
                {metrics.cartAbandonRate > 30 ? (
                  <ArrowUpRight className="w-3.5 h-3.5 text-[#FF5D73]" />
                ) : (
                  <ArrowDownRight className="w-3.5 h-3.5 text-[#15803D]" />
                )}
              </div>
              <span className="text-[10px] font-semibold text-[#1F2340]/60 leading-tight line-clamp-2">
                {metrics.topAbandonStep}
              </span>
            </div>
          </div>
        </div>

        {/* Top 3 Detected Issues (2-line wrapping + full text tooltip + click to inspect debug ID) */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <span className="font-display text-xs font-bold text-[#1F2340]">
              Top 3 detected issues
            </span>
            <span className="font-mono text-[10px] font-semibold text-[#1F2340]/60">
              Click event for Debug ID
            </span>
          </div>
          <div className="space-y-1.5">
            {top3DetectedIssues.length === 0 ? (
              <div className="p-2.5 rounded-xl bg-[#3DDC97]/15 border border-[#3DDC97]/40 text-xs font-semibold text-[#065F46]">
                Zero checkout issues detected in current log window.
              </div>
            ) : (
              top3DetectedIssues.map((ev) => {
                const errorBanner =
                  ev.paypalErrorName || ev.paypalDebugId
                    ? `Real PayPal error: ${ev.paypalErrorName || `HTTP_${ev.httpStatus}`}, debug ID ${ev.paypalDebugId || 'n/a'}`
                    : null;
                const fullTooltip = `[${ev.simTimeFormatted}] ${ev.citizenName} @ ${ev.buildingName} (${ev.paypalApi} → HTTP ${ev.httpStatus})${errorBanner ? ` — ${errorBanner}` : ''}: ${ev.summary}`;
                const isLive = ev.source === 'LIVE_SANDBOX';

                return (
                  <button
                    key={ev.id}
                    type="button"
                    title={fullTooltip}
                    onClick={() => setInspectedEvent(ev)}
                    onMouseEnter={() => setHoveredTooltip(fullTooltip)}
                    onMouseLeave={() => setHoveredTooltip(null)}
                    className="w-full text-left px-2.5 py-1.5 rounded-xl bg-[#FFF4E0]/95 border border-[#E8765A]/30 text-[11px] hover:border-[#0070E0] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-1 font-mono text-[10px] mb-0.5">
                      <span className="font-bold text-[#1F2340] truncate">
                        {ev.citizenName} · HTTP {ev.httpStatus}
                        {ev.paypalErrorName ? ` · ${ev.paypalErrorName}` : ''}
                      </span>
                      <span
                        className={`px-1.5 py-0.2 rounded text-[9px] font-bold shrink-0 ${
                          isLive
                            ? 'bg-[#3DDC97]/30 text-[#065F46] border border-[#15803D]/30'
                            : 'bg-[#1F2340]/10 text-[#1F2340]'
                        }`}
                      >
                        {isLive ? 'LIVE' : 'SIMULATED'}
                      </span>
                    </div>
                    <p className="text-[#1F2340]/90 font-semibold leading-snug line-clamp-2">
                      {errorBanner ? `${errorBanner} — ${ev.summary}` : ev.summary}
                    </p>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* "Suggested fixes" Checklist (2-line wrapping + full text tooltip on hover) */}
        <div className="relative">
          <div className="flex items-center justify-between mb-1">
            <span className="font-display text-xs font-bold text-[#1F2340]">
              Suggested fixes (Bug Lab)
            </span>
            <span className="font-mono text-[10px] font-bold text-[#E8765A]">
              {activeBugCount} active bugs
            </span>
          </div>
          <div className="grid grid-cols-2 gap-1.5">
            {BUG_FLAGS_INFO.map((bug) => {
              const isBugActive = bugFlags[bug.key];
              const isFixApplied = !isBugActive;
              const isSimulatedOnlyBug =
                bug.key === 'slowDisputeResponse' || bug.key === 'couponStackingBug';
              const fullBugTooltip = `${bug.label} (${isFixApplied ? 'Fixed' : 'Bug Active'}): ${bug.description} — Impact: ${bug.paypalImpact}`;
              return (
                <button
                  key={bug.key}
                  type="button"
                  role="checkbox"
                  aria-checked={isFixApplied}
                  aria-label={`Suggested fix: ${bug.label}`}
                  title={fullBugTooltip}
                  onMouseEnter={() => setHoveredTooltip(fullBugTooltip)}
                  onMouseLeave={() => setHoveredTooltip(null)}
                  onClick={() => toggleBugFlag(bug.key)}
                  className={`px-2 py-1.5 rounded-xl border text-left transition-all flex items-start gap-2 cursor-pointer ${
                    isFixApplied
                      ? 'bg-[#3DDC97]/15 border-[#3DDC97]/50 text-[#1F2340]'
                      : 'bg-[#FFF4E0] border-[#E8765A]/45 text-[#1F2340] hover:bg-[#F5E6C8]'
                  }`}
                >
                  <span
                    className={`w-4 h-4 mt-0.5 rounded-md flex items-center justify-center shrink-0 border ${
                      isFixApplied
                        ? 'bg-[#3DDC97] border-[#15803D]/30 text-[#1F2340]'
                        : 'bg-white border-[#E8765A] text-transparent'
                    }`}
                  >
                    <Check className="w-3 h-3 stroke-[3]" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-[11px] font-bold leading-snug line-clamp-2">
                      {bug.label}
                    </div>
                    <div className="font-mono text-[9px] font-semibold text-[#1F2340]/60">
                      {isFixApplied
                        ? 'Fixed'
                        : isSimulatedOnlyBug
                          ? 'Bug Active (SIM)'
                          : 'Bug Active (LIVE 422)'}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Floating Rich Hover Tooltip Popover showing full untruncated text */}
          {hoveredTooltip && (
            <div
              role="tooltip"
              className="pointer-events-none absolute right-[376px] bottom-0 w-[310px] p-3 rounded-2xl bg-[#1F2340] text-[#FFF8EA] text-xs font-semibold leading-relaxed shadow-xl border border-[#FFF8EA]/20 z-50"
            >
              {hoveredTooltip}
            </div>
          )}
        </div>

        {/* Big Blue Primary Button "Run test again" */}
        <button
          type="button"
          onClick={runBuildingTestAgain}
          className="w-full py-2 px-4 rounded-2xl bg-[#0070E0] hover:bg-[#005bb5] text-white font-display text-sm font-bold flex items-center justify-center gap-2 shadow-md transition-colors cursor-pointer shrink-0"
        >
          <Play className="w-4 h-4 fill-current" />
          <span>Run test again</span>
        </button>
      </aside>

      {/* 6. CITY PERFORMANCE Mini Card (Bottom Right, always fully visible) */}
      <section
        aria-label="City Performance Chart Card"
        className="pointer-events-auto warm-panel px-4 py-3 flex flex-col gap-1.5 shrink-0"
      >
        <div className="flex items-center justify-between gap-2">
          <div
            className="min-w-0"
            title="City Performance: Real-time Conversion % vs. Cart Abandonment % derived from the central Event Log"
          >
            <h3 className="font-display text-sm font-bold text-[#1F2340] leading-tight">
              City Performance
            </h3>
            <p className="text-[11px] font-semibold text-[#1F2340]/65 leading-snug line-clamp-2">
              Conversion vs. Abandonment over time
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLedgerModalOpen(true)}
            className="px-2.5 py-1 rounded-xl bg-[#0070E0]/12 hover:bg-[#0070E0]/20 text-[#0070E0] text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer shrink-0"
          >
            <span>View details</span>
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>

        {/* Small Recharts LineChart */}
        <div className="h-[84px] w-full pt-0.5">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 4, right: 8, left: -24, bottom: 0 }}>
              <XAxis
                dataKey="time"
                tick={{ fontSize: 10, fill: '#1F2340', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis
                domain={[0, 100]}
                tick={{ fontSize: 10, fill: '#1F2340', fontFamily: 'JetBrains Mono' }}
                axisLine={false}
                tickLine={false}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#FFF8EA',
                  borderColor: 'rgba(31,35,64,0.15)',
                  borderRadius: '12px',
                  fontSize: '11px',
                  fontWeight: 700,
                  color: '#1F2340',
                }}
              />
              <Line
                type="monotone"
                dataKey="conversion"
                name="Conversion %"
                stroke="#3DDC97"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#3DDC97' }}
                isAnimationActive={false}
              />
              <Line
                type="monotone"
                dataKey="abandon"
                name="Abandon %"
                stroke="#FF5D73"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#FF5D73' }}
                isAnimationActive={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
};
