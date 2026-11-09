import React, { useMemo, useState } from 'react';
import {
  Building2,
  Sun,
  Play,
  Pause,
  TrendingUp,
  ShoppingCart,
  ShieldAlert,
  Bug,
  ArrowUpRight,
  ArrowDownRight,
  Settings,
  Radio,
  RotateCcw,
  RefreshCw,
  Copy,
  Check,
  ExternalLink,
  X,
  Webhook,
  Sparkles,
} from 'lucide-react';
import { useSandboxStore } from '../store/useSandboxStore';
import { deriveMetricsFromEventLog, formatSimClock } from '../utils/simulationEngine';
import { PayPalApiConnectionState, PayPalApiServiceKey } from '../types/sandbox';

const API_SERVICES_ORDER: PayPalApiServiceKey[] = [
  'OAuth',
  'Orders',
  'Invoicing',
  'Payouts',
  'Disputes',
  'Webhooks',
];

function getStatusChipStyle(status: PayPalApiConnectionState): string {
  if (status === 'Connected') {
    return 'bg-[#3DDC97]/25 text-[#065F46] border-[#3DDC97]/60';
  }
  if (status === 'Error') {
    return 'bg-[#FF5D73]/20 text-[#B91C1C] border-[#FF5D73]/50';
  }
  return 'bg-[#FFC439]/25 text-[#92400E] border-[#FFC439]/60';
}

export const TopBar: React.FC = () => {
  const {
    mode,
    setMode,
    simDay,
    simMinuteOfDay,
    isPaused,
    togglePause,
    events,
    settingsOpen,
    setSettingsOpen,
    speed,
    setSpeed,
    resetSimulation,
    liveCallsCount,
    maxLiveCalls,
    apiHealth,
    healthLoading,
    runHealthCheck,
    seededOrders,
    seedingLoading,
    seedLivePurchases,
    triggerTestWebhook,
  } = useSandboxStore();

  const [copiedWebhook, setCopiedWebhook] = useState(false);

  const metrics = useMemo(() => deriveMetricsFromEventLog(events), [events]);
  const clockStr = formatSimClock(simDay, simMinuteOfDay);

  const webhookUrl =
    apiHealth?.webhookUrl ||
    (typeof window !== 'undefined'
      ? `${window.location.origin}/api/webhooks/paypal`
      : 'http://localhost:3000/api/webhooks/paypal');

  const handleCopyWebhook = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(webhookUrl);
      setCopiedWebhook(true);
      window.setTimeout(() => setCopiedWebhook(false), 1800);
    }
  };

  const kpiChips = [
    {
      id: 'conversion',
      icon: <TrendingUp className="w-4 h-4 text-[#3DDC97]" />,
      label: 'Conversion',
      value: `${metrics.conversionRate.toFixed(0)}%`,
      deltaUp: metrics.conversionRate >= 50,
      deltaColor: metrics.conversionRate >= 50 ? 'text-[#15803D]' : 'text-[#D95D39]',
      badgeBg: 'bg-[#3DDC97]/15',
    },
    {
      id: 'abandon',
      icon: <ShoppingCart className="w-4 h-4 text-[#E8765A]" />,
      label: 'Abandon',
      value: `${metrics.cartAbandonRate.toFixed(0)}%`,
      deltaUp: metrics.cartAbandonRate > 30,
      deltaColor: metrics.cartAbandonRate > 30 ? 'text-[#FF5D73]' : 'text-[#15803D]',
      badgeBg: 'bg-[#E8765A]/15',
    },
    {
      id: 'disputes',
      icon: <ShieldAlert className="w-4 h-4 text-[#FFC439]" />,
      label: 'Disputes',
      value: `${metrics.disputesOpened}`,
      deltaUp: metrics.disputesOpened > 0,
      deltaColor: metrics.disputesOpened > 0 ? 'text-[#D95D39]' : 'text-[#15803D]',
      badgeBg: 'bg-[#FFC439]/25',
    },
    {
      id: 'bugs',
      icon: <Bug className="w-4 h-4 text-[#FF5D73]" />,
      label: 'Bugs found',
      value: `${metrics.bugsFoundCount}/6`,
      deltaUp: metrics.bugsFoundCount > 0,
      deltaColor: metrics.bugsFoundCount > 0 ? 'text-[#FF5D73]' : 'text-[#15803D]',
      badgeBg: 'bg-[#FF5D73]/15',
    },
  ];

  return (
    <>
      <header
        aria-label="Top Navigation and Telemetry Bar"
        className="absolute top-[18px] left-[24px] right-[24px] h-[68px] warm-panel px-5 flex items-center justify-between gap-3 z-30"
      >
        {/* Left: Brand Lockup + Tagline + Sim Clock Pill */}
        <div className="flex items-center gap-3.5 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-2xl bg-gradient-to-br from-[#E8765A] to-[#FFC439] flex items-center justify-center shadow-sm border border-[#1F2340]/10">
              <Building2 className="w-5 h-5 text-[#1F2340]" />
            </div>
            <div>
              <div className="flex items-baseline gap-2">
                <h1 className="font-display text-[21px] font-bold tracking-tight text-[#1F2340] leading-none">
                  Sandbox City
                </h1>
                <span className="text-xs font-bold text-[#E8765A] tracking-wide">
                  Test. Improve. Grow.
                </span>
              </div>
              <p className="text-[11px] font-semibold text-[#1F2340]/65 mt-0.5">
                PayPal&apos;s sandbox is a ghost town. We give it a population.
              </p>
            </div>
          </div>

          {/* Sun Icon + Simulation Clock ("Fri 18:40") + Play/Pause Pill */}
          <div
            aria-label={`Simulation Clock ${clockStr}`}
            className="flex items-center gap-2 pl-3 pr-2 py-1.5 rounded-full bg-[#FFF4E0] border border-[#1F2340]/12 shadow-inner"
          >
            <Sun className="w-4 h-4 text-[#E8765A] shrink-0" />
            <span className="font-mono text-xs font-bold text-[#1F2340] tabular-nums whitespace-nowrap">
              {clockStr}
            </span>
            <button
              type="button"
              onClick={togglePause}
              aria-label={isPaused ? 'Resume Simulation' : 'Pause Simulation'}
              className="w-7 h-7 rounded-full bg-[#0070E0] hover:bg-[#005bb5] text-white flex items-center justify-center transition-colors shadow-sm cursor-pointer"
            >
              {isPaused ? (
                <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
              ) : (
                <Pause className="w-3.5 h-3.5" />
              )}
            </button>
          </div>
        </div>

        {/* Center: Four Derived KPI Chips */}
        <div
          role="region"
          aria-label="Live Derived Telemetry Metrics"
          className="flex items-center gap-2 shrink-0"
        >
          {kpiChips.map((chip) => (
            <div
              key={chip.id}
              className="px-3 py-1.5 rounded-2xl bg-[#FFF4E0]/90 border border-[#1F2340]/10 flex items-center gap-2 shadow-xs"
            >
              <div
                className={`w-7 h-7 rounded-xl ${chip.badgeBg} flex items-center justify-center`}
              >
                {chip.icon}
              </div>
              <div>
                <div className="text-[10px] font-bold text-[#1F2340]/65 leading-none">
                  {chip.label}
                </div>
                <div className="flex items-center gap-1 mt-1">
                  <span className="font-mono text-sm font-bold text-[#1F2340] tabular-nums leading-none">
                    {chip.value}
                  </span>
                  {chip.deltaUp ? (
                    <ArrowUpRight className={`w-3.5 h-3.5 ${chip.deltaColor}`} />
                  ) : (
                    <ArrowDownRight className={`w-3.5 h-3.5 ${chip.deltaColor}`} />
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Far Right: "Live calls: n / 40" Counter + Demo Mode | Live Sandbox Toggle + Settings Drawer Button */}
        <div className="flex items-center gap-2.5 shrink-0">
          {/* Live Calls Counter */}
          <button
            type="button"
            onClick={() => {
              if (liveCallsCount >= maxLiveCalls) {
                fetch('/api/reset-counter', { method: 'POST' }).catch(() => {});
                useSandboxStore.setState({ liveCallsCount: 0, fallbackBanners: [] });
              }
            }}
            aria-label={`Live calls counter ${liveCallsCount} of ${maxLiveCalls}`}
            title={liveCallsCount >= maxLiveCalls ? 'Limit reached — click to reset live call counter' : 'Live PayPal API calls made in this run'}
            className={`px-3 py-1.5 rounded-full border font-mono text-xs font-bold whitespace-nowrap transition-colors ${
              liveCallsCount >= maxLiveCalls
                ? 'bg-[#E8765A]/20 border-[#E8765A] text-[#B91C1C] cursor-pointer hover:bg-[#E8765A]/30'
                : 'bg-[#FFF4E0] border-[#1F2340]/15 text-[#1F2340]'
            }`}
          >
            Live calls: <span className={liveCallsCount >= maxLiveCalls ? 'text-[#B91C1C]' : 'text-[#0070E0]'}>{liveCallsCount}</span> / {maxLiveCalls}
            {liveCallsCount >= maxLiveCalls && <span className="ml-1 text-[10px] font-bold underline">(Reset)</span>}
          </button>

          <div
            role="group"
            aria-label="Simulation Mode"
            className="flex items-center bg-[#FFF4E0] p-1 rounded-full border border-[#1F2340]/12"
          >
            <button
              type="button"
              onClick={() => setMode('SIMULATED')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                mode === 'SIMULATED'
                  ? 'bg-[#0070E0] text-white shadow-xs'
                  : 'text-[#1F2340]/70 hover:text-[#1F2340]'
              }`}
            >
              <span className="w-2 h-2 rounded-full bg-[#3DDC97]" />
              Demo Mode
            </button>
            <button
              type="button"
              onClick={() => setMode('LIVE_SANDBOX')}
              className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
                mode === 'LIVE_SANDBOX'
                  ? 'bg-[#0070E0] text-white shadow-xs'
                  : 'text-[#1F2340]/70 hover:text-[#1F2340]'
              }`}
            >
              <Radio className="w-3.5 h-3.5 text-[#FFC439]" />
              Live Sandbox
            </button>
          </div>

          <button
            type="button"
            onClick={() => setSettingsOpen(!settingsOpen)}
            aria-label="Simulation Settings"
            aria-expanded={settingsOpen}
            className={`w-10 h-10 rounded-full border flex items-center justify-center transition-colors cursor-pointer ${
              settingsOpen
                ? 'bg-[#0070E0] text-white border-[#0070E0]'
                : 'bg-[#FFF4E0] hover:bg-[#F5E6C8] text-[#1F2340] border-[#1F2340]/12'
            }`}
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* SETTINGS & LIVE SANDBOX DRAWER */}
      {settingsOpen && (
        <aside
          role="dialog"
          aria-label="Settings and Live PayPal Sandbox Drawer"
          className="absolute top-[94px] right-[24px] bottom-[18px] w-[460px] warm-panel p-5 z-50 flex flex-col justify-between gap-4 border-2 border-[#0070E0]/45 overflow-y-auto shadow-2xl"
        >
          <div className="space-y-4">
            {/* Drawer Header */}
            <div className="flex items-start justify-between gap-3 pb-3 border-b border-[#1F2340]/12">
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg font-bold text-[#1F2340]">
                    PayPal Sandbox &amp; Settings
                  </h2>
                  <span className="font-mono text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#0070E0]/15 text-[#0070E0]">
                    https://api-m.sandbox.paypal.com
                  </span>
                </div>
                <p className="text-xs font-semibold text-[#1F2340]/70 mt-0.5">
                  Server-side OAuth2, idempotency headers, debug IDs, and live purchase seeding.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSettingsOpen(false)}
                aria-label="Close Settings Drawer"
                className="p-1.5 rounded-full bg-[#FFF4E0] hover:bg-[#F5E6C8] border border-[#1F2340]/15 text-[#1F2340] cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* 1. API Connection Status Chips + "Test connection" button */}
            <div className="p-3.5 rounded-2xl bg-[#FFF4E0]/90 border border-[#1F2340]/12 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-xs font-bold text-[#1F2340]">
                    API Connection Status
                  </h3>
                  <p className="text-[11px] font-semibold text-[#1F2340]/65">
                    Live calls used: {liveCallsCount} / {maxLiveCalls}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={runHealthCheck}
                  disabled={healthLoading}
                  className="px-3 py-1.5 rounded-xl bg-[#0070E0] hover:bg-[#005bb5] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${healthLoading ? 'animate-spin' : ''}`} />
                  <span>{healthLoading ? 'Testing...' : 'Test connection'}</span>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2">
                {API_SERVICES_ORDER.map((svcKey) => {
                  const info = apiHealth?.services?.[svcKey] || {
                    service: svcKey,
                    status: 'Missing credentials' as const,
                    detail: 'Click "Test connection" to verify',
                  };
                  return (
                    <div
                      key={svcKey}
                      title={`${info.service} (${info.status}): ${info.detail}${info.paypalDebugId ? ` [Debug ID: ${info.paypalDebugId}]` : ''}`}
                      className="p-2 rounded-xl bg-[#FFF8EA] border border-[#1F2340]/10 flex flex-col justify-between gap-1"
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span className="font-bold text-xs text-[#1F2340]">{svcKey}</span>
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${getStatusChipStyle(
                            info.status
                          )}`}
                        >
                          {info.status}
                        </span>
                      </div>
                      <p className="text-[10px] font-semibold text-[#1F2340]/70 line-clamp-2 leading-tight">
                        {info.detail}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 2. "Seed live purchases" Panel */}
            <div className="p-3.5 rounded-2xl bg-[#FFF4E0]/90 border border-[#1F2340]/12 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <h3 className="font-display text-xs font-bold text-[#1F2340]">
                    Seed live purchases (Orders v2 + Capture)
                  </h3>
                  <p className="text-[11px] font-semibold text-[#1F2340]/65 leading-snug">
                    Creates 4 real Orders v2 with buyer approval links; on return,{' '}
                    <code className="font-mono text-[10px]">/paypal/return</code> captures the order
                    and unlocks LIVE refunds for Gus.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={seedLivePurchases}
                  disabled={seedingLoading}
                  className="px-3 py-1.5 rounded-xl bg-[#0070E0] hover:bg-[#005bb5] disabled:opacity-60 text-white text-xs font-bold flex items-center gap-1.5 shrink-0 shadow-xs cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>{seedingLoading ? 'Seeding...' : 'Seed live purchases'}</span>
                </button>
              </div>

              {seededOrders.length > 0 && (
                <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                  {seededOrders.map((ord) => (
                    <div
                      key={ord.orderId}
                      className="p-2 rounded-xl bg-[#FFF8EA] border border-[#1F2340]/12 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 font-mono text-[10px] font-bold">
                          <span
                            className={`px-1.5 py-0.2 rounded ${
                              ord.source === 'LIVE_SANDBOX'
                                ? 'bg-[#3DDC97]/25 text-[#065F46]'
                                : 'bg-[#1F2340]/10 text-[#1F2340]'
                            }`}
                          >
                            {ord.source === 'LIVE_SANDBOX' ? 'LIVE' : 'SIMULATED'}
                          </span>
                          <span className="text-[#1F2340]">{ord.orderId}</span>
                          <span className="text-[#0070E0]">
                            ${ord.amount} {ord.currency}
                          </span>
                        </div>
                        <p className="text-[11px] font-semibold text-[#1F2340]/80 line-clamp-2">
                          {ord.citizenName}: {ord.description}
                        </p>
                      </div>
                      <a
                        href={ord.approveUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-2.5 py-1 rounded-lg bg-[#0070E0]/12 hover:bg-[#0070E0]/20 text-[#0070E0] text-[11px] font-bold flex items-center gap-1 shrink-0"
                      >
                        <span>{ord.status === 'CAPTURED' ? 'Captured' : 'Approve'}</span>
                        <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* 3. Webhook URL Copy + Webhook Idempotency Test */}
            <div className="p-3.5 rounded-2xl bg-[#FFF4E0]/90 border border-[#1F2340]/12 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-display text-xs font-bold text-[#1F2340] flex items-center gap-1.5">
                  <Webhook className="w-3.5 h-3.5 text-[#0070E0]" />
                  <span>PayPal Developer Dashboard Webhook URL</span>
                </span>
                <button
                  type="button"
                  onClick={handleCopyWebhook}
                  className="px-2.5 py-1 rounded-lg bg-[#0070E0]/12 hover:bg-[#0070E0]/20 text-[#0070E0] text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                >
                  {copiedWebhook ? (
                    <>
                      <Check className="w-3 h-3" />
                      <span>Copied</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy URL</span>
                    </>
                  )}
                </button>
              </div>
              <div className="px-2.5 py-1.5 rounded-xl bg-[#1F2340] text-[#FFF8EA] font-mono text-[11px] select-all break-all">
                {webhookUrl}
              </div>
              <div className="flex items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => triggerTestWebhook(true)}
                  className="flex-1 py-1.5 px-2.5 rounded-xl bg-[#FFF8EA] hover:bg-[#F5E6C8] border border-[#1F2340]/15 text-[11px] font-bold text-[#1F2340] cursor-pointer"
                >
                  Send Test Webhook (Test Idempotency)
                </button>
              </div>
            </div>

            {/* 4. Simulation Speed & Reset */}
            <div className="p-3.5 rounded-2xl bg-[#FFF4E0]/90 border border-[#1F2340]/12 space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1F2340]">Simulation Clock Speed</span>
                <div className="flex items-center gap-1.5">
                  {([1, 2, 4] as const).map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSpeed(s)}
                      className={`px-3 py-1 rounded-xl font-mono text-xs font-bold border transition-colors cursor-pointer ${
                        speed === s
                          ? 'bg-[#0070E0] text-white border-[#0070E0]'
                          : 'bg-[#FFF8EA] text-[#1F2340] border-[#1F2340]/12 hover:bg-[#F5E6C8]'
                      }`}
                    >
                      {s}x
                    </button>
                  ))}
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  resetSimulation();
                  setSettingsOpen(false);
                }}
                className="w-full py-2 px-3 rounded-xl bg-[#FFF8EA] hover:bg-[#F5E6C8] border border-[#1F2340]/15 text-xs font-bold text-[#1F2340] flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                <span>Reset Simulation &amp; Live Call Counter</span>
              </button>
            </div>
          </div>
        </aside>
      )}
    </>
  );
};
