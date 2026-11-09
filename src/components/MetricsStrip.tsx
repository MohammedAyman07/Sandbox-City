import React, { useMemo } from 'react';
import { useSandboxStore } from '../store/useSandboxStore';
import { deriveMetricsFromEventLog } from '../utils/simulationEngine';

export const MetricsStrip: React.FC = () => {
  const events = useSandboxStore((s) => s.events);
  const metrics = useMemo(() => deriveMetricsFromEventLog(events), [events]);

  const items = [
    {
      label: 'Conversion Rate',
      value: `${metrics.conversionRate.toFixed(1)}%`,
      sub: `${metrics.totalEvents} total events`,
      accent: metrics.conversionRate >= 50 ? 'text-[#3DDC97]' : 'text-[#FFC439]',
    },
    {
      label: 'Cart Abandon & Step',
      value: `${metrics.cartAbandonRate.toFixed(1)}%`,
      sub: `Top: ${metrics.topAbandonStep}`,
      accent: metrics.cartAbandonRate > 30 ? 'text-[#FF5D73]' : 'text-slate-200',
    },
    {
      label: 'Avg Checkout Time',
      value: `${metrics.avgCheckoutTimeSec.toFixed(1)}s`,
      sub: 'Order -> Capture',
      accent: metrics.avgCheckoutTimeSec > 5 ? 'text-[#FFC439]' : 'text-[#3DDC97]',
    },
    {
      label: 'Disputes Opened',
      value: `${metrics.disputesOpened}`,
      sub: `$${metrics.disputedVolume.toFixed(2)} disputed`,
      accent: metrics.disputesOpened > 0 ? 'text-[#FF5D73]' : 'text-slate-200',
    },
    {
      label: 'Refunds Requested',
      value: `${metrics.refundsCount}`,
      sub: `$${metrics.refundedVolume.toFixed(2)} refunded`,
      accent: 'text-[#FFC439]',
    },
    {
      label: 'Webhook Failures',
      value: `${metrics.webhookFailures}`,
      sub: '502/504 & Double-Credits',
      accent: metrics.webhookFailures > 0 ? 'text-[#FF5D73]' : 'text-[#3DDC97]',
    },
    {
      label: 'Payouts Sent',
      value: `${metrics.payoutsSent}`,
      sub: `$${metrics.payoutsVolume.toFixed(2)} disbursed`,
      accent: 'text-[#0070E0]',
    },
    {
      label: 'Net Revenue',
      value: `$${metrics.netRevenue.toFixed(2)}`,
      sub: `Gross $${metrics.grossRevenue.toFixed(2)}`,
      accent: metrics.netRevenue >= 0 ? 'text-[#3DDC97]' : 'text-[#FF5D73]',
    },
    {
      label: 'Bugs Found',
      value: `${metrics.bugsFoundCount} / 6`,
      sub: `${metrics.bugImpactedEventsCount} events hit`,
      accent: metrics.bugsFoundCount > 0 ? 'text-[#9B6BFF]' : 'text-[#3DDC97]',
    },
  ];

  return (
    <section
      aria-label="Live Derived Telemetry Metrics"
      className="bg-[#141B34]/90 border-b border-white/10 px-4 py-2 shrink-0 z-10"
    >
      <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-9 gap-2">
        {items.map((item) => (
          <div
            key={item.label}
            className="px-2.5 py-1.5 rounded-lg bg-[#0B1020]/70 border border-white/5 flex flex-col justify-between min-w-0"
          >
            <span className="text-[11px] text-slate-400 truncate">{item.label}</span>
            <div className="flex items-baseline justify-between gap-1 mt-0.5">
              <span className={`font-mono text-sm font-bold tabular-nums ${item.accent}`}>
                {item.value}
              </span>
            </div>
            <span className="text-[10px] font-mono text-slate-400 truncate mt-0.5">
              {item.sub}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
};
