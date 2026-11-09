import React, { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  X,
  Play,
  MessageSquareQuote,
  Target,
  Sparkles,
  History,
  CheckCircle2,
  ArrowRight,
  Table2,
  Search,
  Terminal,
  ExternalLink,
  Award,
  Download,
  RefreshCw,
  AlertTriangle,
  Cpu,
  Filter,
} from 'lucide-react';
import { AgGridReact } from 'ag-grid-react';
import {
  AllCommunityModule,
  ColDef,
  ModuleRegistry,
  themeQuartz,
} from 'ag-grid-community';
import { useSandboxStore } from '../store/useSandboxStore';
import { CitizenMood, SandboxEvent } from '../types/sandbox';

ModuleRegistry.registerModules([AllCommunityModule]);

const warmGridTheme = themeQuartz.withParams({
  backgroundColor: '#FFF8EA',
  foregroundColor: '#1F2340',
  headerBackgroundColor: '#FFF4E0',
  headerTextColor: '#1F2340',
  borderColor: 'rgba(31, 35, 64, 0.12)',
  rowHoverColor: 'rgba(0, 112, 224, 0.08)',
  fontFamily: '"JetBrains Mono", monospace',
  fontSize: 12,
  headerFontSize: 12,
});

const MOOD_COLORS: Record<CitizenMood, string> = {
  delighted: '#3DDC97',
  calm: '#3DDC97',
  annoyed: '#FFC439',
  furious: '#FF5D73',
  scheming: '#FF5D73',
};

export const CitizenProfileModal: React.FC = () => {
  const {
    citizens,
    selectedCitizenId,
    selectCitizen,
    events,
    forceCitizenAction,
    citizenBrainLoadingId,
    beforeAfterModal,
    closeBeforeAfterModal,
    ledgerModalOpen,
    setLedgerModalOpen,
    highlightedLedgerEventId,
    setHighlightedLedgerEventId,
    mayorReportModalOpen,
    setMayorReportModalOpen,
    mayorAiReport,
    mayorReportLoading,
    generateMayorsReport,
    inspectEvidenceEventInLedger,
    fixAndRerunAllBugs,
    inspectedEvent,
    setInspectedEvent,
  } = useSandboxStore();

  // Ledger Filter States (LIVE/SIMULATED, Citizen, API, Error Name, Search)
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [sourceFilter, setSourceFilter] = useState<'ALL' | 'LIVE_SANDBOX' | 'SIMULATED'>('ALL');
  const [citizenFilter, setCitizenFilter] = useState<string>('ALL');
  const [apiFilter, setApiFilter] = useState<string>('ALL');
  const [errorNameFilter, setErrorNameFilter] = useState<string>('ALL');

  const citizen = citizens.find((c) => c.id === selectedCitizenId);
  const citizenEvents = citizen
    ? events.filter((e) => e.citizenId === citizen.id).slice(0, 8)
    : [];

  // Unique filter options derived from events
  const uniqueApis = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      if (ev.paypalApi) set.add(ev.paypalApi);
    }
    return Array.from(set);
  }, [events]);

  const uniqueErrorNames = useMemo(() => {
    const set = new Set<string>();
    for (const ev of events) {
      if (ev.paypalErrorName) set.add(ev.paypalErrorName);
    }
    return Array.from(set);
  }, [events]);

  const filteredLedgerEvents = useMemo(() => {
    return events.filter((ev) => {
      if (highlightedLedgerEventId && ev.id !== highlightedLedgerEventId) {
        return false;
      }
      if (sourceFilter !== 'ALL' && ev.source !== sourceFilter) {
        return false;
      }
      if (citizenFilter !== 'ALL' && ev.citizenId !== citizenFilter) {
        return false;
      }
      if (apiFilter !== 'ALL' && !ev.paypalApi.toLowerCase().includes(apiFilter.toLowerCase())) {
        return false;
      }
      if (errorNameFilter !== 'ALL' && (ev.paypalErrorName || 'NONE') !== errorNameFilter) {
        return false;
      }
      if (!ledgerSearch.trim()) return true;
      const q = ledgerSearch.toLowerCase();
      return (
        ev.citizenName.toLowerCase().includes(q) ||
        ev.summary.toLowerCase().includes(q) ||
        ev.paypalApi.toLowerCase().includes(q) ||
        ev.type.toLowerCase().includes(q) ||
        ev.id.toLowerCase().includes(q) ||
        (ev.paypalDebugId && ev.paypalDebugId.toLowerCase().includes(q)) ||
        (ev.paypalErrorName && ev.paypalErrorName.toLowerCase().includes(q))
      );
    });
  }, [
    events,
    highlightedLedgerEventId,
    sourceFilter,
    citizenFilter,
    apiFilter,
    errorNameFilter,
    ledgerSearch,
  ]);

  const handleExportLedgerJson = () => {
    const payload = JSON.stringify(filteredLedgerEvents, null, 2);
    const blob = new Blob([payload], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `sandbox-city-ledger-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const columnDefs = useMemo<ColDef<SandboxEvent>[]>(
    () => [
      { field: 'id', headerName: 'Event ID', width: 110, pinned: 'left', sortable: true, filter: true },
      { field: 'simTimeFormatted', headerName: 'Sim Time', width: 95, sortable: true },
      {
        field: 'source',
        headerName: 'Source',
        width: 105,
        sortable: true,
        filter: true,
        valueFormatter: (p) => (p.value === 'LIVE_SANDBOX' ? 'LIVE' : 'SIMULATED'),
        cellStyle: (p) => ({
          color: p.value === 'LIVE_SANDBOX' ? '#065F46' : '#1F2340',
          fontWeight: 800,
        }),
      },
      {
        field: 'decisionSource',
        headerName: 'Brain',
        width: 105,
        sortable: true,
        filter: true,
        valueFormatter: (p) => p.value || 'Rule-based',
        cellStyle: (p) => ({
          color: p.value === 'Gemini' ? '#0070E0' : '#1F2340',
          fontWeight: 700,
        }),
      },
      { field: 'citizenName', headerName: 'Citizen', width: 115, sortable: true, filter: true },
      { field: 'type', headerName: 'Action', width: 110, sortable: true, filter: true },
      {
        field: 'httpStatus',
        headerName: 'HTTP',
        width: 80,
        sortable: true,
        cellStyle: (p) => ({
          color: Number(p.value) >= 400 ? '#D9384A' : '#0F766E',
          fontWeight: 700,
        }),
      },
      {
        field: 'paypalDebugId',
        headerName: 'PayPal-Debug-Id',
        width: 150,
        sortable: true,
        filter: true,
        valueFormatter: (p) => p.value || '—',
      },
      {
        field: 'paypalErrorName',
        headerName: 'PayPal Error',
        width: 175,
        sortable: true,
        filter: true,
        valueFormatter: (p) => p.value || '—',
      },
      {
        field: 'latencyMs',
        headerName: 'Latency',
        width: 90,
        sortable: true,
        valueFormatter: (p) => `${p.value}ms`,
      },
      { field: 'paypalApi', headerName: 'PayPal Endpoint', width: 235, sortable: true, filter: true },
      { field: 'summary', headerName: 'Summary', width: 360, sortable: true, filter: true },
    ],
    []
  );

  return (
    <>
      {/* 1. CITIZEN PROFILE CARD (Opens when clicking a citizen) */}
      <AnimatePresence>
        {citizen && (
          <motion.div
            key={citizen.id}
            initial={{ opacity: 0, y: 12, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.97 }}
            transition={{ duration: 0.16 }}
            role="dialog"
            aria-label={`${citizen.name} Citizen Profile Card`}
            className="absolute left-[325px] top-[185px] w-[395px] max-h-[750px] overflow-y-auto warm-panel p-5 z-40 text-[#1F2340]"
          >
            {/* Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#1F2340]/10">
              <div className="flex items-center gap-3">
                <div
                  className="w-12 h-12 rounded-full flex items-center justify-center font-display text-base font-bold text-[#1F2340] shrink-0"
                  style={{
                    backgroundColor: citizen.secondaryColor,
                    boxShadow: `0 0 0 3.5px ${MOOD_COLORS[citizen.mood]}`,
                  }}
                >
                  {citizen.isBotRing ? '3x' : citizen.name.charAt(0)}
                </div>
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-display text-lg font-bold text-[#1F2340]">
                      {citizen.name}
                    </h3>
                    <span className="px-2 py-0.5 rounded-full bg-[#1F2340]/8 font-mono text-[10px] font-bold uppercase">
                      {citizen.mood}
                    </span>
                    <span
                      aria-label={`Decision source: ${citizen.decisionSource || 'Rule-based'}`}
                      className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold flex items-center gap-1 ${
                        citizen.decisionSource === 'Gemini'
                          ? 'bg-[#0070E0]/15 text-[#0070E0] border border-[#0070E0]/35'
                          : 'bg-[#1F2340]/10 text-[#1F2340]/80 border border-[#1F2340]/15'
                      }`}
                    >
                      <Cpu className="w-3 h-3" />
                      <span>{citizen.decisionSource || 'Rule-based'}</span>
                    </span>
                  </div>
                  <p className="text-xs font-bold text-[#1F2340]/70">
                    {citizen.archetype} · Currency: {citizen.preferredCurrency}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => selectCitizen(null)}
                aria-label="Close Citizen Profile"
                className="p-1.5 rounded-full bg-[#FFF4E0] hover:bg-[#F5E6C8] text-[#1F2340] border border-[#1F2340]/10 transition-colors cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Budget, Patience, Trust Meter */}
            <div className="grid grid-cols-3 gap-2 my-3">
              <div className="p-2.5 rounded-2xl bg-[#FFF4E0] border border-[#1F2340]/10">
                <span className="text-[10px] font-bold text-[#1F2340]/65 block">Budget</span>
                <span className="font-mono text-sm font-bold text-[#1F2340] tabular-nums">
                  ${citizen.budget.toFixed(2)}
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-[#FFF4E0] border border-[#1F2340]/10">
                <span className="text-[10px] font-bold text-[#1F2340]/65 block">Patience</span>
                <span className="font-mono text-sm font-bold text-[#1F2340] tabular-nums">
                  {citizen.patience}%
                </span>
              </div>
              <div className="p-2.5 rounded-2xl bg-[#FFF4E0] border border-[#1F2340]/10">
                <span className="text-[10px] font-bold text-[#1F2340]/65 block">Trust</span>
                <span className="font-mono text-sm font-bold text-[#0070E0] tabular-nums">
                  {citizen.trust}%
                </span>
              </div>
            </div>

            {/* Latest Thought + Decision Label ("Gemini" or "Rule-based") */}
            <div className="p-3 rounded-2xl bg-[#FFF4E0] border border-[#E8765A]/35 mb-3">
              <div className="flex items-center justify-between gap-1.5 text-[11px] font-bold text-[#E8765A] mb-1">
                <span className="flex items-center gap-1.5">
                  <MessageSquareQuote className="w-3.5 h-3.5" />
                  <span>Latest Thought</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-md font-mono text-[10px] font-bold ${
                    citizen.decisionSource === 'Gemini'
                      ? 'bg-[#0070E0] text-white'
                      : 'bg-[#1F2340]/12 text-[#1F2340]'
                  }`}
                >
                  {citizen.decisionSource || 'Rule-based'}
                  {citizen.lastToolCalled ? ` · ${citizen.lastToolCalled}` : ''}
                </span>
              </div>
              <p className="text-xs font-semibold text-[#1F2340] italic leading-relaxed">
                &ldquo;{citizen.lastThought}&rdquo;
              </p>
            </div>

            {/* Goals & Quirks */}
            <div className="grid grid-cols-2 gap-2.5 mb-3">
              <div className="p-2.5 rounded-2xl bg-[#FFF4E0]/80 border border-[#1F2340]/10">
                <div className="flex items-center gap-1 text-[11px] font-bold text-[#15803D] mb-1">
                  <Target className="w-3 h-3" />
                  <span>Goals</span>
                </div>
                <ul className="space-y-1 text-[11px] font-semibold text-[#1F2340]/85">
                  {citizen.goals.map((g) => (
                    <li key={g} className="leading-snug">
                      • {g}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="p-2.5 rounded-2xl bg-[#FFF4E0]/80 border border-[#1F2340]/10">
                <div className="flex items-center gap-1 text-[11px] font-bold text-[#E8765A] mb-1">
                  <Sparkles className="w-3 h-3" />
                  <span>Quirks</span>
                </div>
                <ul className="space-y-1 text-[11px] font-semibold text-[#1F2340]/85">
                  {citizen.quirks.map((q) => (
                    <li key={q} className="leading-snug">
                      • {q}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Action Trigger Button */}
            <button
              type="button"
              onClick={() => forceCitizenAction(citizen.id)}
              disabled={citizenBrainLoadingId === citizen.id}
              className="w-full py-2.5 px-3 rounded-2xl bg-[#0070E0] hover:bg-[#005bb5] disabled:opacity-60 text-white text-xs font-bold flex items-center justify-center gap-2 transition-colors mb-3 shadow-sm cursor-pointer"
            >
              {citizenBrainLoadingId === citizen.id ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Gemini Brain Tool Calling...</span>
                </>
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 fill-current" />
                  <span>Run {citizen.name}&apos;s Next Payment Action Now</span>
                </>
              )}
            </button>

            {/* Citizen Event Log History */}
            <div>
              <div className="flex items-center justify-between text-[11px] font-bold text-[#1F2340] mb-1.5">
                <span className="flex items-center gap-1.5">
                  <History className="w-3.5 h-3.5 text-[#0070E0]" />
                  <span>Recent Decisions &amp; Events ({citizenEvents.length})</span>
                </span>
                <span className="font-mono text-[10px] text-[#1F2340]/60">Click for Debug ID</span>
              </div>
              <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                {citizenEvents.map((ev) => {
                  const isLive = ev.source === 'LIVE_SANDBOX';
                  const decLabel = ev.decisionSource || 'Rule-based';
                  return (
                    <button
                      key={ev.id}
                      type="button"
                      onClick={() => setInspectedEvent(ev)}
                      className="w-full text-left p-2 rounded-xl bg-[#FFF4E0] hover:border-[#0070E0] border border-[#1F2340]/10 text-[11px] cursor-pointer"
                    >
                      <div className="flex items-center justify-between font-mono text-[10px] text-[#1F2340]/70 mb-0.5">
                        <span className="font-bold">
                          {ev.simTimeFormatted} · {ev.type.toUpperCase()} · {decLabel}
                        </span>
                        <span
                          className={
                            ev.httpStatus >= 400
                              ? 'text-[#D9384A] font-bold'
                              : 'text-[#15803D] font-bold'
                          }
                        >
                          HTTP {ev.httpStatus} · {isLive ? 'LIVE' : 'SIMULATED'}
                        </span>
                      </div>
                      <p className="text-[#1F2340] font-semibold leading-snug line-clamp-2">
                        {ev.summary}
                      </p>
                    </button>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. THE MAYOR'S REPORT MODAL (Code-Computed Stats + Gemini Structured JSON + Evidence Links) */}
      <AnimatePresence>
        {mayorReportModalOpen && mayorAiReport && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#1F2340]/45 backdrop-blur-xs flex items-center justify-center z-50 p-8"
          >
            <motion.div
              initial={{ scale: 0.94, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              role="dialog"
              aria-label="The Mayor's Report Modal"
              className="w-[960px] max-h-[840px] warm-panel p-6 border-2 border-[#0070E0] flex flex-col gap-4 overflow-hidden text-[#1F2340]"
            >
              {/* Header */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#1F2340]/12 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-11 h-11 rounded-2xl bg-[#0070E0]/15 border border-[#0070E0]/30 flex items-center justify-center shrink-0">
                    <Award className="w-6 h-6 text-[#0070E0]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-display text-xl font-bold text-[#1F2340]">
                        The Mayor&apos;s Official Telemetry Report
                      </h2>
                      <span
                        className={`px-2.5 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                          mayorAiReport.source === 'Gemini'
                            ? 'bg-[#0070E0] text-white'
                            : 'bg-[#1F2340]/12 text-[#1F2340]'
                        }`}
                      >
                        {mayorAiReport.source} JSON Schema
                      </span>
                    </div>
                    <p className="text-xs font-semibold text-[#1F2340]/70">
                      All statistics are computed deterministically in code; click any cited evidence ID to inspect in the Ledger and highlight the building.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => generateMayorsReport()}
                    disabled={mayorReportLoading}
                    className="px-3 py-1.5 rounded-xl bg-[#FFF4E0] hover:bg-[#F5E6C8] border border-[#1F2340]/15 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw
                      className={`w-3.5 h-3.5 text-[#0070E0] ${mayorReportLoading ? 'animate-spin' : ''}`}
                    />
                    <span>{mayorReportLoading ? 'Analyzing...' : 'Refresh with Gemini'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMayorReportModalOpen(false);
                      fixAndRerunAllBugs();
                    }}
                    className="px-3.5 py-1.5 rounded-xl bg-[#0070E0] hover:bg-[#005bb5] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Fix and rerun</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setMayorReportModalOpen(false)}
                    aria-label="Close Mayor's Report Modal"
                    className="p-1.5 rounded-full bg-[#FFF4E0] hover:bg-[#F5E6C8] border border-[#1F2340]/15 text-[#1F2340] cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              </div>

              {/* Mayor's Witty Headline */}
              <div className="p-3.5 rounded-2xl bg-[#FFF4E0] border-2 border-[#FFC439] flex items-center gap-3 shrink-0">
                <MessageSquareQuote className="w-5 h-5 text-[#E8765A] shrink-0" />
                <p className="font-display text-sm font-bold text-[#1F2340] leading-snug">
                  &ldquo;{mayorAiReport.headline}&rdquo;
                </p>
              </div>

              {/* Code-Computed Statistics Strip */}
              <div className="grid grid-cols-6 gap-2 font-mono text-xs shrink-0">
                <div className="p-2.5 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/10">
                  <span className="text-[10px] text-[#1F2340]/65 block">CONVERSION</span>
                  <span className="text-sm font-extrabold text-[#15803D]">
                    {mayorAiReport.stats.conversionRate.toFixed(1)}%
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/10">
                  <span className="text-[10px] text-[#1F2340]/65 block">ABANDONMENT</span>
                  <span className="text-sm font-extrabold text-[#D9384A]">
                    {mayorAiReport.stats.cartAbandonRate.toFixed(1)}%
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/10">
                  <span className="text-[10px] text-[#1F2340]/65 block">PAYPAL ERRORS</span>
                  <span className="text-sm font-extrabold text-[#E8765A]">
                    {mayorAiReport.stats.livePayPalErrorCount}
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/10">
                  <span className="text-[10px] text-[#1F2340]/65 block">DISPUTES</span>
                  <span className="text-sm font-extrabold text-[#1F2340]">
                    {mayorAiReport.stats.disputesCount} (${mayorAiReport.stats.disputedVolume})
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/10">
                  <span className="text-[10px] text-[#1F2340]/65 block">REFUNDS</span>
                  <span className="text-sm font-extrabold text-[#1F2340]">
                    {mayorAiReport.stats.refundsCount} (${mayorAiReport.stats.refundedVolume})
                  </span>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/10">
                  <span className="text-[10px] text-[#1F2340]/65 block">WEBHOOK ISSUES</span>
                  <span className="text-sm font-extrabold text-[#1F2340]">
                    {mayorAiReport.stats.webhookIssuesCount}
                  </span>
                </div>
              </div>

              {/* Breakdown Pills: Abandonment by Step & Error Counts by PayPal Error Name */}
              <div className="grid grid-cols-2 gap-3 text-xs shrink-0">
                <div className="p-2.5 rounded-xl bg-[#FFF4E0]/80 border border-[#1F2340]/10">
                  <span className="font-bold text-[11px] text-[#1F2340]/70 block mb-1">
                    Abandonment by Step (Computed in Code)
                  </span>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                    {Object.entries(mayorAiReport.stats.abandonmentByStep).length === 0 ? (
                      <span className="text-[#15803D] font-bold">0 abandonments</span>
                    ) : (
                      Object.entries(mayorAiReport.stats.abandonmentByStep).map(([step, cnt]) => (
                        <span
                          key={step}
                          className="px-2 py-0.5 rounded bg-[#FF5D73]/15 text-[#B91C1C] font-bold"
                        >
                          {step}: {cnt}
                        </span>
                      ))
                    )}
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-[#FFF4E0]/80 border border-[#1F2340]/10">
                  <span className="font-bold text-[11px] text-[#1F2340]/70 block mb-1">
                    Error Counts by PayPal Error Name (Computed in Code)
                  </span>
                  <div className="flex flex-wrap gap-1.5 font-mono text-[10px]">
                    {Object.entries(mayorAiReport.stats.errorCountsByPayPalErrorName).length ===
                    0 ? (
                      <span className="text-[#15803D] font-bold">0 PayPal errors</span>
                    ) : (
                      Object.entries(mayorAiReport.stats.errorCountsByPayPalErrorName).map(
                        ([errName, cnt]) => (
                          <span
                            key={errName}
                            className="px-2 py-0.5 rounded bg-[#E8765A]/20 text-[#9A3412] font-bold"
                          >
                            {errName}: {cnt}
                          </span>
                        )
                      )
                    )}
                  </div>
                </div>
              </div>

              {/* Structured Findings List with Clickable Evidence Event IDs */}
              <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
                {mayorAiReport.findings.map((finding, idx) => (
                  <div
                    key={`${finding.title}_${idx}`}
                    className="p-3.5 rounded-2xl bg-[#FFF4E0] border border-[#1F2340]/12 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-extrabold uppercase ${
                            finding.severity === 'critical'
                              ? 'bg-[#FF5D73]/25 text-[#B91C1C]'
                              : finding.severity === 'warning'
                                ? 'bg-[#FFC439]/35 text-[#92400E]'
                                : 'bg-[#3DDC97]/30 text-[#065F46]'
                          }`}
                        >
                          {finding.severity}
                        </span>
                        <h3 className="font-display text-sm font-bold text-[#1F2340]">
                          {finding.title}
                        </h3>
                      </div>
                      <div className="flex items-center gap-1.5 font-mono text-[10px]">
                        <span className="px-2 py-0.5 rounded bg-[#1F2340] text-[#FFF8EA] font-bold">
                          {finding.paypal_error_name}
                        </span>
                        <span className="px-2 py-0.5 rounded bg-[#0070E0]/12 text-[#0070E0] font-bold">
                          Flag: {finding.related_bug_flag}
                        </span>
                      </div>
                    </div>

                    <p className="text-xs font-semibold text-[#1F2340]/85 leading-relaxed">
                      <strong className="text-[#15803D]">Suggested Fix:</strong>{' '}
                      {finding.suggested_fix}
                    </p>

                    <div className="flex items-center justify-between gap-2 flex-wrap pt-1 border-t border-[#1F2340]/8 text-[11px]">
                      <div className="font-semibold text-[#1F2340]/75">
                        Affected citizens:{' '}
                        <span className="font-bold text-[#1F2340]">
                          {finding.affected_citizens.join(', ')}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-mono text-[10px] font-bold text-[#1F2340]/60">
                          Evidence IDs (click to open in Ledger):
                        </span>
                        {finding.evidence_event_ids.map((evId) => (
                          <button
                            key={evId}
                            type="button"
                            onClick={() => inspectEvidenceEventInLedger(evId)}
                            aria-label={`Inspect evidence event ${evId} in Ledger`}
                            className="px-2 py-0.5 rounded-lg bg-[#0070E0] hover:bg-[#005bb5] text-white font-mono text-[10px] font-bold cursor-pointer transition-colors"
                          >
                            {evId}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 3. EVENT TELEMETRY INSPECTOR MODAL (Clicking any LIVE or SIMULATED event shows PayPal-Debug-Id & Raw Status) */}
      <AnimatePresence>
        {inspectedEvent && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#1F2340]/45 backdrop-blur-xs flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.94, y: 10 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 10 }}
              role="dialog"
              aria-label="Event Telemetry and PayPal Debug ID Inspector"
              className="w-[560px] warm-panel p-5 border-2 border-[#0070E0] space-y-3"
            >
              <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#1F2340]/12">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-xl bg-[#0070E0]/15 flex items-center justify-center">
                    <Terminal className="w-5 h-5 text-[#0070E0]" />
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="font-display text-base font-bold text-[#1F2340]">
                        PayPal Event Telemetry Inspector
                      </h3>
                      <span
                        className={`px-2 py-0.5 rounded-full font-mono text-[10px] font-bold ${
                          inspectedEvent.source === 'LIVE_SANDBOX'
                            ? 'bg-[#3DDC97]/30 text-[#065F46] border border-[#15803D]/40'
                            : 'bg-[#1F2340]/12 text-[#1F2340]'
                        }`}
                      >
                        {inspectedEvent.source === 'LIVE_SANDBOX' ? 'LIVE' : 'SIMULATED'}
                      </span>
                      <span className="px-2 py-0.5 rounded-full bg-[#0070E0]/15 text-[#0070E0] font-mono text-[10px] font-bold">
                        {inspectedEvent.decisionSource || 'Rule-based'}
                      </span>
                    </div>
                    <p className="font-mono text-[11px] font-semibold text-[#1F2340]/70">
                      {inspectedEvent.id} · {inspectedEvent.simTimeFormatted} ·{' '}
                      {inspectedEvent.citizenName}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setInspectedEvent(null)}
                  aria-label="Close Event Inspector"
                  className="p-1.5 rounded-full bg-[#FFF4E0] hover:bg-[#F5E6C8] border border-[#1F2340]/15 text-[#1F2340] cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2.5 font-mono text-xs">
                <div className="p-3 rounded-xl bg-[#1F2340] text-[#FFF8EA]">
                  <span className="text-[10px] text-[#8EC5FF] block">PayPal-Debug-Id</span>
                  <span className="font-bold text-sm select-all">
                    {inspectedEvent.paypalDebugId || 'None (Simulated Event)'}
                  </span>
                </div>
                <div className="p-3 rounded-xl bg-[#1F2340] text-[#FFF8EA]">
                  <span className="text-[10px] text-[#FFC439] block">Raw Response Status</span>
                  <span className="font-bold text-sm">
                    {inspectedEvent.rawResponseStatus ||
                      `HTTP ${inspectedEvent.httpStatus} (${inspectedEvent.latencyMs}ms)`}
                  </span>
                </div>
              </div>

              {inspectedEvent.paypalErrorName && (
                <div className="p-3 rounded-xl bg-[#FF5D73]/15 border border-[#FF5D73]/40 text-xs font-bold text-[#B91C1C]">
                  Real PayPal error: {inspectedEvent.paypalErrorName}, debug ID{' '}
                  {inspectedEvent.paypalDebugId || 'n/a'}
                </div>
              )}

              <div className="p-3 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/12 space-y-1 text-xs">
                <div className="font-mono text-[11px] font-bold text-[#0070E0]">
                  {inspectedEvent.paypalApi}
                </div>
                <p className="font-semibold text-[#1F2340] leading-relaxed">
                  {inspectedEvent.summary}
                </p>
                {inspectedEvent.approveUrl && (
                  <a
                    href={inspectedEvent.approveUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 mt-1.5 px-3 py-1.5 rounded-lg bg-[#0070E0] text-white text-xs font-bold"
                  >
                    <span>Open Sandbox Buyer Approval Link</span>
                    <ExternalLink className="w-3.5 h-3.5" />
                  </a>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 4. MAYOR'S REPORT BEFORE / AFTER COMPARISON MODAL (Deterministic Seed + Animated Bars + Disappeared Errors) */}
      <AnimatePresence>
        {beforeAfterModal?.open && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#1F2340]/45 backdrop-blur-xs flex items-center justify-center z-50"
          >
            <motion.div
              initial={{ scale: 0.92, y: 16 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.94, y: 12 }}
              role="dialog"
              aria-label="Mayor's Report Before and After Comparison"
              className="w-[680px] warm-panel p-6 border-2 border-[#3DDC97] relative text-[#1F2340]"
            >
              {/* Green "BUGS RESOLVED" Stamp */}
              <div className="flex items-start justify-between gap-4 pb-3 border-b border-[#1F2340]/10">
                <div>
                  <div className="flex items-center gap-2 mb-1.5">
                    <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-[#3DDC97]/25 border-2 border-[#15803D] text-[#065F46] font-display text-xs font-extrabold uppercase tracking-wider">
                      <CheckCircle2 className="w-4 h-4 text-[#15803D]" />
                      Bugs resolved
                    </span>
                    <span className="px-2.5 py-1 rounded-full bg-[#1F2340]/10 font-mono text-[10px] font-bold">
                      Deterministic Seed #{beforeAfterModal.seed}
                    </span>
                  </div>
                  <h3 className="font-display text-xl font-bold text-[#1F2340]">
                    Mayor&apos;s Deterministic Fix &amp; Rerun Comparison
                  </h3>
                  <p className="text-xs font-semibold text-[#1F2340]/70">
                    Flagged Bug Lab flags were turned off and the population reran the exact same scripted scenario.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={closeBeforeAfterModal}
                  aria-label="Close Comparison Modal"
                  className="p-2 rounded-full bg-[#FFF4E0] hover:bg-[#F5E6C8] text-[#1F2340] border border-[#1F2340]/12 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* 5 Animated Bar Rows: Conversion, Abandonment, Live PayPal Errors, Failures, Disputes */}
              <div className="space-y-2.5 my-4">
                {[
                  {
                    label: 'Conversion Rate',
                    beforeVal: beforeAfterModal.before.conversionRate,
                    afterVal: beforeAfterModal.after.conversionRate,
                    maxVal: 100,
                    unit: '%',
                    goodDirection: 'up' as const,
                  },
                  {
                    label: 'Cart Abandonment',
                    beforeVal: beforeAfterModal.before.cartAbandonRate,
                    afterVal: beforeAfterModal.after.cartAbandonRate,
                    maxVal: 100,
                    unit: '%',
                    goodDirection: 'down' as const,
                  },
                  {
                    label: 'Live PayPal Errors',
                    beforeVal:
                      beforeAfterModal.before.livePayPalErrorsCount ??
                      beforeAfterModal.before.bugImpactedEventsCount,
                    afterVal: beforeAfterModal.after.livePayPalErrorsCount ?? 0,
                    maxVal: Math.max(
                      6,
                      beforeAfterModal.before.livePayPalErrorsCount ??
                        beforeAfterModal.before.bugImpactedEventsCount
                    ),
                    unit: '',
                    goodDirection: 'down' as const,
                  },
                  {
                    label: 'Total Failures',
                    beforeVal:
                      beforeAfterModal.before.totalFailuresCount ??
                      beforeAfterModal.before.bugImpactedEventsCount,
                    afterVal: beforeAfterModal.after.totalFailuresCount ?? 0,
                    maxVal: Math.max(
                      6,
                      beforeAfterModal.before.totalFailuresCount ??
                        beforeAfterModal.before.bugImpactedEventsCount
                    ),
                    unit: '',
                    goodDirection: 'down' as const,
                  },
                  {
                    label: 'Disputes Opened',
                    beforeVal: beforeAfterModal.before.disputesOpened,
                    afterVal: beforeAfterModal.after.disputesOpened,
                    maxVal: Math.max(4, beforeAfterModal.before.disputesOpened),
                    unit: '',
                    goodDirection: 'down' as const,
                  },
                ].map((row) => {
                  const beforePct = Math.min(100, Math.round((row.beforeVal / row.maxVal) * 100));
                  const afterPct = Math.min(100, Math.round((row.afterVal / row.maxVal) * 100));
                  return (
                    <div
                      key={row.label}
                      className="p-3 rounded-2xl bg-[#FFF4E0] border border-[#1F2340]/10"
                    >
                      <div className="flex items-center justify-between text-xs font-bold mb-1.5">
                        <span>{row.label}</span>
                        <div className="flex items-center gap-2 font-mono">
                          <span className="text-[#FF5D73]">
                            BEFORE: {row.beforeVal}
                            {row.unit}
                          </span>
                          <ArrowRight className="w-3.5 h-3.5 text-[#1F2340]/40" />
                          <span className="text-[#15803D] font-extrabold">
                            AFTER: {row.afterVal}
                            {row.unit}
                          </span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2 items-center">
                        <div className="h-2.5 rounded-full bg-[#1F2340]/10 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(6, beforePct)}%` }}
                            transition={{ duration: 0.55, ease: 'easeOut' }}
                            className="h-full rounded-full bg-[#FF5D73]"
                          />
                        </div>
                        <div className="h-2.5 rounded-full bg-[#1F2340]/10 overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.max(6, afterPct)}%` }}
                            transition={{ duration: 0.7, ease: 'easeOut' }}
                            className="h-full rounded-full bg-[#3DDC97]"
                          />
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* List of PayPal Errors That Disappeared */}
              <div className="p-3 rounded-2xl bg-[#3DDC97]/15 border border-[#15803D]/30 mb-3">
                <span className="text-[11px] font-bold text-[#065F46] block mb-1.5">
                  PayPal Errors Eliminated in Deterministic Rerun:
                </span>
                <div className="flex flex-wrap gap-1.5 font-mono text-[11px]">
                  {beforeAfterModal.disappearedPayPalErrors.map((errCode) => (
                    <span
                      key={errCode}
                      className="px-2.5 py-0.5 rounded-lg bg-[#15803D] text-white font-bold flex items-center gap-1"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span className="line-through opacity-90">{errCode}</span>
                      <span>RESOLVED</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between pt-1">
                <span className="text-xs font-bold text-[#1F2340]/70">
                  Patched flags: {beforeAfterModal.fixedFlags.join(', ')}
                </span>
                <button
                  type="button"
                  onClick={closeBeforeAfterModal}
                  className="px-5 py-2.5 rounded-xl bg-[#0070E0] hover:bg-[#005bb5] text-white font-display text-xs font-bold shadow-sm cursor-pointer"
                >
                  Continue Exploring City
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 5. FULL LEDGER (AG GRID) & EVENT LOG MODAL */}
      <AnimatePresence>
        {ledgerModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-[#1F2340]/45 backdrop-blur-xs flex items-center justify-center z-50 p-10"
          >
            <motion.div
              initial={{ scale: 0.95, y: 12 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.95, y: 12 }}
              role="dialog"
              aria-label="Full City Event Ledger Modal"
              className="w-[1420px] h-[840px] warm-panel p-6 flex flex-col gap-3.5"
            >
              <div className="flex items-center justify-between border-b border-[#1F2340]/10 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#0070E0]/15 flex items-center justify-center">
                    <Table2 className="w-5 h-5 text-[#0070E0]" />
                  </div>
                  <div>
                    <h2 className="font-display text-xl font-bold text-[#1F2340]">
                      Sandbox City Central Event Ledger ({filteredLedgerEvents.length} events)
                    </h2>
                    <p className="text-xs font-semibold text-[#1F2340]/70">
                      Sortable &amp; filterable by LIVE/SIMULATED, citizen, PayPal API, and error name. Click any row for Debug ID.
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2.5">
                  {highlightedLedgerEventId && (
                    <button
                      type="button"
                      onClick={() => setHighlightedLedgerEventId(null)}
                      className="px-3 py-1.5 rounded-xl bg-[#FFC439] text-[#1F2340] font-mono text-xs font-bold cursor-pointer"
                    >
                      Evidence Filter: {highlightedLedgerEventId} ×
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={handleExportLedgerJson}
                    aria-label="Export JSON"
                    className="px-3.5 py-2 rounded-xl bg-[#0070E0] hover:bg-[#005bb5] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Export JSON</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setLedgerModalOpen(false)}
                    aria-label="Close Ledger Modal"
                    className="p-2 rounded-full bg-[#FFF4E0] hover:bg-[#F5E6C8] text-[#1F2340] border border-[#1F2340]/15 cursor-pointer"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Filter Bar: LIVE/SIMULATED, Citizen, API, Error Name, and Free-Text Search */}
              <div className="grid grid-cols-12 gap-2.5 items-center shrink-0">
                <div className="col-span-2 flex items-center gap-1.5">
                  <Filter className="w-3.5 h-3.5 text-[#0070E0] shrink-0" />
                  <select
                    aria-label="Filter by Source"
                    value={sourceFilter}
                    onChange={(e) =>
                      setSourceFilter(e.target.value as 'ALL' | 'LIVE_SANDBOX' | 'SIMULATED')
                    }
                    className="w-full px-2.5 py-2 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/15 text-xs font-bold text-[#1F2340]"
                  >
                    <option value="ALL">All Sources (LIVE + SIM)</option>
                    <option value="LIVE_SANDBOX">LIVE Only</option>
                    <option value="SIMULATED">SIMULATED Only</option>
                  </select>
                </div>

                <div className="col-span-2">
                  <select
                    aria-label="Filter by Citizen"
                    value={citizenFilter}
                    onChange={(e) => setCitizenFilter(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/15 text-xs font-bold text-[#1F2340]"
                  >
                    <option value="ALL">All Citizens</option>
                    {citizens.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-3">
                  <select
                    aria-label="Filter by PayPal API"
                    value={apiFilter}
                    onChange={(e) => setApiFilter(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/15 text-xs font-bold text-[#1F2340]"
                  >
                    <option value="ALL">All PayPal APIs</option>
                    {uniqueApis.map((api) => (
                      <option key={api} value={api}>
                        {api}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-2">
                  <select
                    aria-label="Filter by Error Name"
                    value={errorNameFilter}
                    onChange={(e) => setErrorNameFilter(e.target.value)}
                    className="w-full px-2.5 py-2 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/15 text-xs font-bold text-[#1F2340]"
                  >
                    <option value="ALL">All Error Names</option>
                    {uniqueErrorNames.map((err) => (
                      <option key={err} value={err}>
                        {err}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="col-span-3 relative">
                  <Search className="w-4 h-4 text-[#1F2340]/50 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={ledgerSearch}
                    onChange={(e) => setLedgerSearch(e.target.value)}
                    placeholder="Search Debug ID, summary, endpoint..."
                    aria-label="Search Ledger"
                    className="w-full pl-9 pr-3 py-2 rounded-xl bg-[#FFF4E0] border border-[#1F2340]/15 text-xs font-semibold text-[#1F2340] placeholder-[#1F2340]/45"
                  />
                </div>
              </div>

              <div className="flex-1 w-full rounded-2xl overflow-hidden border border-[#1F2340]/12">
                <AgGridReact<SandboxEvent>
                  theme={warmGridTheme}
                  rowData={filteredLedgerEvents}
                  columnDefs={columnDefs}
                  rowHeight={38}
                  headerHeight={40}
                  animateRows={false}
                  onRowClicked={(e) => {
                    if (e.data) setInspectedEvent(e.data);
                  }}
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
};
