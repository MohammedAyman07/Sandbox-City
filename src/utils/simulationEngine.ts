import {
  BuildingId,
  BugFlagKey,
  ChaosType,
  CheckoutAbandonStep,
  Citizen,
  CitizenMood,
  DerivedMetrics,
  EventSource,
  MayorAiFinding,
  MayorAiReport,
  MayorComputedStats,
  MayorFinding,
  SandboxEvent,
} from '../types/sandbox';
import {
  BUILDING_MAP,
  BUG_FLAGS_INFO,
  clampSpeechBubbleWords,
  computeRoadPathBetweenBuildings,
  DAVE_DRAMATIC_COMPLAINTS,
  inferSpeechBubbleIcon,
  INITIAL_CITIZENS,
} from './cityData';

const DAYS_OF_WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export function formatSimClock(simDay: number, simMinuteOfDay: number): string {
  const dayName = DAYS_OF_WEEK[(simDay - 1) % DAYS_OF_WEEK.length];
  const hours = Math.floor(simMinuteOfDay / 60) % 24;
  const mins = Math.floor(simMinuteOfDay % 60);
  const hh = String(hours).padStart(2, '0');
  const mm = String(mins).padStart(2, '0');
  return `${dayName} ${hh}:${mm}`;
}

export function isNightTime(simMinuteOfDay: number): boolean {
  const hour = (simMinuteOfDay / 60) % 24;
  return hour >= 19 || hour < 6.5;
}

/**
 * Pure derivation function: computes all 9 metrics strip KPIs strictly from the Event Log.
 */
export function deriveMetricsFromEventLog(events: SandboxEvent[]): DerivedMetrics {
  const totalEvents = events.length;

  let cartSessions = 0;
  let successfulPays = 0;
  let abandons = 0;
  const abandonStepCounts: Record<string, number> = {};

  let checkoutDurationSum = 0;
  let checkoutDurationCount = 0;

  let disputesOpened = 0;
  let disputedVolume = 0;

  let refundsCount = 0;
  let refundedVolume = 0;

  let webhookFailures = 0;

  let payoutsSent = 0;
  let payoutsVolume = 0;

  let grossRevenue = 0;
  let bugImpactedEventsCount = 0;
  const bugSet = new Set<BugFlagKey>();

  for (const ev of events) {
    if (ev.flagsInvolved && ev.flagsInvolved.length > 0) {
      bugImpactedEventsCount++;
      for (const f of ev.flagsInvolved) {
        bugSet.add(f);
      }
    }

    if (ev.webhookAnomaly || ev.httpStatus === 502 || ev.httpStatus === 504) {
      webhookFailures++;
    }

    if (typeof ev.checkoutDurationSec === 'number' && ev.checkoutDurationSec > 0) {
      checkoutDurationSum += ev.checkoutDurationSec;
      checkoutDurationCount++;
    }

    switch (ev.type) {
      case 'add_to_cart':
        cartSessions++;
        break;
      case 'pay':
        if (ev.httpStatus >= 200 && ev.httpStatus < 300) {
          successfulPays++;
          grossRevenue += ev.amount;
        }
        break;
      case 'invoice_paid':
        if (ev.httpStatus >= 200 && ev.httpStatus < 300) {
          grossRevenue += ev.amount;
        }
        break;
      case 'abandon':
        abandons++;
        if (ev.abandonStep) {
          abandonStepCounts[ev.abandonStep] = (abandonStepCounts[ev.abandonStep] || 0) + 1;
        }
        break;
      case 'dispute':
        disputesOpened++;
        disputedVolume += ev.amount;
        break;
      case 'refund_request':
        refundsCount++;
        refundedVolume += ev.amount;
        break;
      case 'payout':
        if (ev.httpStatus >= 200 && ev.httpStatus < 300) {
          payoutsSent++;
          payoutsVolume += ev.amount;
        }
        break;
      default:
        break;
    }
  }

  const totalCheckoutOutcomes = Math.max(1, successfulPays + abandons);
  const effectiveSessions = Math.max(cartSessions, totalCheckoutOutcomes);

  const conversionRate =
    totalEvents === 0 ? 0 : Math.round((successfulPays / effectiveSessions) * 1000) / 10;
  const cartAbandonRate =
    totalEvents === 0 ? 0 : Math.round((abandons / effectiveSessions) * 1000) / 10;

  let topAbandonStep = 'None';
  let maxAbandonCount = 0;
  for (const [step, count] of Object.entries(abandonStepCounts)) {
    if (count > maxAbandonCount) {
      maxAbandonCount = count;
      topAbandonStep = step;
    }
  }

  const avgCheckoutTimeSec =
    checkoutDurationCount === 0
      ? 0
      : Math.round((checkoutDurationSum / checkoutDurationCount) * 10) / 10;

  const netRevenue = Math.round((grossRevenue - refundedVolume - disputedVolume) * 100) / 100;

  let livePayPalErrorsCount = 0;
  let totalFailuresCount = 0;
  const errorCountsByPayPalErrorName: Record<string, number> = {};

  for (const ev of events) {
    if (ev.paypalErrorName) {
      errorCountsByPayPalErrorName[ev.paypalErrorName] =
        (errorCountsByPayPalErrorName[ev.paypalErrorName] || 0) + 1;
    }
    if (ev.httpStatus >= 400 || ev.type === 'abandon' || ev.type === 'webhook_rejected') {
      totalFailuresCount++;
      if (ev.source === 'LIVE_SANDBOX' || Boolean(ev.paypalErrorName)) {
        livePayPalErrorsCount++;
      }
    }
  }

  return {
    totalEvents,
    conversionRate,
    cartAbandonRate,
    topAbandonStep,
    avgCheckoutTimeSec,
    disputesOpened,
    disputedVolume: Math.round(disputedVolume * 100) / 100,
    refundsCount,
    refundedVolume: Math.round(refundedVolume * 100) / 100,
    webhookFailures,
    payoutsSent,
    payoutsVolume: Math.round(payoutsVolume * 100) / 100,
    grossRevenue: Math.round(grossRevenue * 100) / 100,
    netRevenue,
    bugsFoundCount: bugSet.size,
    bugImpactedEventsCount,
    uniqueBugsTriggered: Array.from(bugSet),
    livePayPalErrorsCount,
    totalFailuresCount,
    errorCountsByPayPalErrorName,
  };
}

/**
 * Computes ALL statistics in code for The Mayor's Report:
 * conversion, abandonment by step, error counts by PayPal error name,
 * disputes, refunds, and webhook issues.
 */
export function computeMayorStatisticsFromEventLog(events: SandboxEvent[]): MayorComputedStats {
  const base = deriveMetricsFromEventLog(events);
  const abandonmentByStep: Record<string, number> = {};
  const errorCountsByPayPalErrorName: Record<string, number> = {};
  let livePayPalErrorCount = 0;
  let totalFailuresCount = 0;
  let webhookIssuesCount = 0;

  for (const ev of events) {
    if (ev.type === 'abandon') {
      const step = ev.abandonStep || 'Checkout Step';
      abandonmentByStep[step] = (abandonmentByStep[step] || 0) + 1;
    }
    if (ev.paypalErrorName) {
      errorCountsByPayPalErrorName[ev.paypalErrorName] =
        (errorCountsByPayPalErrorName[ev.paypalErrorName] || 0) + 1;
    }
    if (ev.httpStatus >= 400 || ev.type === 'abandon' || ev.type === 'webhook_rejected') {
      totalFailuresCount++;
      if (ev.source === 'LIVE_SANDBOX' || Boolean(ev.paypalErrorName)) {
        livePayPalErrorCount++;
      }
    }
    if (
      ev.webhookAnomaly ||
      ev.type === 'webhook_rejected' ||
      ev.httpStatus === 502 ||
      ev.httpStatus === 504 ||
      ev.flagsInvolved.includes('webhookDoubleCredit')
    ) {
      webhookIssuesCount++;
    }
  }

  return {
    totalEvents: base.totalEvents,
    conversionRate: base.conversionRate,
    cartAbandonRate: base.cartAbandonRate,
    abandonmentByStep,
    errorCountsByPayPalErrorName,
    livePayPalErrorCount,
    totalFailuresCount,
    disputesCount: base.disputesOpened,
    disputedVolume: base.disputedVolume,
    refundsCount: base.refundsCount,
    refundedVolume: base.refundedVolume,
    webhookIssuesCount,
    payoutsSent: base.payoutsSent,
    grossRevenue: base.grossRevenue,
    netRevenue: base.netRevenue,
  };
}

/**
 * Deterministic rule-based Mayor's Report fallback when Gemini is unavailable or times out.
 * Strictly uses code-computed statistics and cites real event IDs from the event log.
 */
export function buildFallbackMayorAiReport(
  events: SandboxEvent[],
  stats: MayorComputedStats
): MayorAiReport {
  const findings: MayorAiFinding[] = [];

  for (const bugInfo of BUG_FLAGS_INFO) {
    const matching = events.filter(
      (e) => e.flagsInvolved.includes(bugInfo.key) || e.bugFlag === bugInfo.key
    );
    if (matching.length === 0) continue;

    const evidenceIds = matching.slice(0, 4).map((e) => e.id);
    const citizensSet = Array.from(new Set(matching.map((e) => e.citizenName)));
    const firstErrorName =
      matching.find((e) => e.paypalErrorName)?.paypalErrorName ||
      (bugInfo.key === 'hiddenShippingFee'
        ? 'ITEM_TOTAL_MISMATCH'
        : bugInfo.key === 'currencyRoundingBug'
          ? 'DECIMAL_PRECISION'
          : bugInfo.key === 'payLaterBrokenOnMobile'
            ? 'UNPROCESSABLE_ENTITY'
            : bugInfo.key === 'slowDisputeResponse'
              ? 'GATEWAY_TIMEOUT'
              : 'WEBHOOK_DUPLICATE_EVENT');

    findings.push({
      severity: matching.length >= 2 ? 'critical' : 'warning',
      title: `${bugInfo.label} (${matching.length} event${matching.length === 1 ? '' : 's'})`,
      evidence_event_ids: evidenceIds,
      affected_citizens: citizensSet,
      paypal_error_name: firstErrorName,
      suggested_fix: bugInfo.paypalImpact,
      related_bug_flag: bugInfo.key,
    });
  }

  // Also include any PayPal error events not yet covered by a bug flag
  if (findings.length === 0) {
    const errorEvents = events.filter((e) => e.httpStatus >= 400 || e.type === 'dispute');
    if (errorEvents.length > 0) {
      findings.push({
        severity: 'warning',
        title: `Checkout & Dispute Friction (${errorEvents.length} recorded events)`,
        evidence_event_ids: errorEvents.slice(0, 4).map((e) => e.id),
        affected_citizens: Array.from(new Set(errorEvents.map((e) => e.citizenName))),
        paypal_error_name: errorEvents[0].paypalErrorName || `HTTP_${errorEvents[0].httpStatus}`,
        suggested_fix:
          'Inspect the cited event IDs in the Central Ledger and resolve amount breakdown or dispute SLA issues.',
        related_bug_flag: errorEvents[0].bugFlag || 'hiddenShippingFee',
      });
    } else if (events.length > 0) {
      findings.push({
        severity: 'info',
        title: 'All Sandbox Payment Rails Operating Cleanly',
        evidence_event_ids: events.slice(0, 2).map((e) => e.id),
        affected_citizens: Array.from(new Set(events.slice(0, 3).map((e) => e.citizenName))),
        paypal_error_name: 'NONE',
        suggested_fix: 'Keep idempotency headers and minor-unit currency rounding active.',
        related_bug_flag: 'none',
      });
    }
  }

  const headline =
    stats.totalFailuresCount > 0
      ? `Fellow citizens! With conversion at ${stats.conversionRate}% and abandonment at ${stats.cartAbandonRate}%, ${stats.totalFailuresCount} payment hiccups demand immediate municipal reform at The Flawed Shop!`
      : `Hear ye, Sandbox City! Conversion stands proud at ${stats.conversionRate}% with $0 in unpatched checkout chaos!`;

  return {
    headline,
    source: 'Rule-based',
    generatedAt: Date.now(),
    stats,
    findings,
  };
}

/**
 * Pure derivation function: builds the Mayor's Report strictly from the Event Log.
 */
export function deriveMayorReportFromEventLog(events: SandboxEvent[]): MayorFinding[] {
  const findings: MayorFinding[] = [];

  for (const bugInfo of BUG_FLAGS_INFO) {
    const matching = events.filter((e) => e.flagsInvolved.includes(bugInfo.key));
    if (matching.length > 0) {
      const lostRevenue = matching.reduce((sum, e) => {
        if (e.type === 'abandon' || e.type === 'dispute' || e.type === 'refund_request') {
          return sum + e.amount;
        }
        if (bugInfo.key === 'couponStackingBug' && e.type === 'pay') {
          return sum + 68; // typical discount leakage per stacked order
        }
        if (bugInfo.key === 'webhookDoubleCredit') {
          return sum + e.amount;
        }
        return sum;
      }, 0);

      const latest = matching[0];
      findings.push({
        id: `finding-${bugInfo.key}`,
        severity: matching.length >= 2 ? 'critical' : 'warning',
        flag: bugInfo.key,
        title: `${bugInfo.label} (${matching.length} incident${matching.length === 1 ? '' : 's'})`,
        evidence: `Latest: [${latest.simTimeFormatted}] ${latest.citizenName} — ${latest.summary} (${latest.paypalApi} → HTTP ${latest.httpStatus})`,
        recommendation: bugInfo.paypalImpact,
        occurrenceCount: matching.length,
        lostRevenue: Math.round(lostRevenue * 100) / 100,
      });
    }
  }

  // Also check for velocity fraud / Bot Ring activity in log
  const botEvents = events.filter((e) => e.citizenId === 'bot_ring');
  if (botEvents.length > 0) {
    findings.push({
      id: 'finding-bot-velocity',
      severity: botEvents.length >= 3 ? 'critical' : 'warning',
      title: `Card-Testing Velocity Pattern (${botEvents.length} bot events)`,
      evidence: `The Bot Ring triggered ${botEvents.length} rapid requests against POST /v2/checkout/orders.`,
      recommendation:
        'Enable PayPal Fraud Protection & rate-limit unauthenticated order creation per device fingerprint.',
      occurrenceCount: botEvents.length,
      lostRevenue: Math.round(botEvents.reduce((s, e) => s + e.amount, 0) * 100) / 100,
    });
  }

  if (findings.length === 0) {
    findings.push({
      id: 'finding-all-clear',
      severity: 'healthy',
      title: 'All Payment Rails Operating Nominally',
      evidence: 'Zero bug-flag anomalies recorded in the current event window.',
      recommendation: 'Toggle bugs in the Flawed Shop Bug Lab or trigger a Chaos scenario below.',
      occurrenceCount: 0,
      lostRevenue: 0,
    });
  }

  return findings.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
}

let eventCounter = 1000;
function nextEventId(): string {
  eventCounter += 1;
  return `evt_${eventCounter}`;
}

/**
 * Generates deterministic initial seed events so metrics, ledger, and Mayor's Report
 * are immediately rich and accurate on initial render, and strictly derived from the log.
 */
export function createSeedEvents(
  activeFlags: Record<BugFlagKey, boolean>,
  source: EventSource = 'SIMULATED'
): SandboxEvent[] {
  const now = Date.now() - 48000;
  const events: SandboxEvent[] = [
    {
      id: nextEventId(),
      timestamp: now + 4000,
      simMinuteOfDay: 1095, // 18:15
      simDay: 5,
      simTimeFormatted: 'Fri 18:15',
      citizenId: 'marge',
      citizenName: 'Marge',
      buildingId: 'flawed_shop',
      buildingName: 'The Flawed Shop',
      type: 'add_to_cart',
      paypalApi: 'POST /v2/checkout/orders',
      source,
      httpStatus: 201,
      latencyMs: 142,
      amount: 54.0,
      currency: 'USD',
      summary: 'Marge added "Retro Espresso Maker" ($54.00) to cart.',
      flagsInvolved: [],
    },
    activeFlags.hiddenShippingFee
      ? {
          id: nextEventId(),
          timestamp: now + 9000,
          simMinuteOfDay: 1100,
          simDay: 5,
          simTimeFormatted: 'Fri 18:20',
          citizenId: 'marge',
          citizenName: 'Marge',
          buildingId: 'flawed_shop',
          buildingName: 'The Flawed Shop',
          type: 'abandon',
          paypalApi: 'PATCH /v2/checkout/orders/8HK99102',
          source,
          httpStatus: 422,
          latencyMs: 310,
          amount: 68.99,
          currency: 'USD',
          abandonStep: 'Shipping Step',
          checkoutDurationSec: 6.4,
          summary: 'Marge abandoned $68.99 cart at Shipping Step due to unannounced +$14.99 fee!',
          flagsInvolved: ['hiddenShippingFee'],
        }
      : {
          id: nextEventId(),
          timestamp: now + 9000,
          simMinuteOfDay: 1100,
          simDay: 5,
          simTimeFormatted: 'Fri 18:20',
          citizenId: 'marge',
          citizenName: 'Marge',
          buildingId: 'flawed_shop',
          buildingName: 'The Flawed Shop',
          type: 'pay',
          paypalApi: 'POST /v2/checkout/orders/8HK99102/capture',
          source,
          httpStatus: 200,
          latencyMs: 195,
          amount: 54.0,
          currency: 'USD',
          checkoutDurationSec: 3.1,
          summary: 'Marge completed free-shipping checkout ($54.00).',
          flagsInvolved: [],
        },
    {
      id: nextEventId(),
      timestamp: now + 15000,
      simMinuteOfDay: 1105,
      simDay: 5,
      simTimeFormatted: 'Fri 18:25',
      citizenId: 'priya',
      citizenName: 'Priya',
      buildingId: 'gig_hub',
      buildingName: 'Gig Hub',
      type: 'payout',
      paypalApi: 'POST /v1/payments/payouts',
      source,
      httpStatus: 201,
      latencyMs: 215,
      amount: 145.0,
      currency: 'USD',
      summary: 'Priya received weekly courier payout ($145.00) at Gig Hub.',
      flagsInvolved: activeFlags.webhookDoubleCredit ? ['webhookDoubleCredit'] : [],
      webhookAnomaly: activeFlags.webhookDoubleCredit,
    },
    {
      id: nextEventId(),
      timestamp: now + 21000,
      simMinuteOfDay: 1110,
      simDay: 5,
      simTimeFormatted: 'Fri 18:30',
      citizenId: 'dave',
      citizenName: 'Dave',
      buildingId: 'flawed_shop',
      buildingName: 'The Flawed Shop',
      type: 'add_to_cart',
      paypalApi: 'POST /v2/checkout/orders',
      source,
      httpStatus: 201,
      latencyMs: 155,
      amount: 64.0,
      currency: 'USD',
      summary: 'Dave added "Artisanal Gooseneck Kettle" ($64.00) to cart.',
      flagsInvolved: [],
    },
    {
      id: nextEventId(),
      timestamp: now + 25000,
      simMinuteOfDay: 1114,
      simDay: 5,
      simTimeFormatted: 'Fri 18:34',
      citizenId: 'dave',
      citizenName: 'Dave',
      buildingId: 'flawed_shop',
      buildingName: 'The Flawed Shop',
      type: 'pay',
      paypalApi: 'POST /v2/checkout/orders/9DL44210/capture',
      source,
      httpStatus: 200,
      latencyMs: 210,
      amount: 64.0,
      currency: 'USD',
      checkoutDurationSec: 3.8,
      summary: 'Dave paid $64.00 for Artisanal Kettle (exceeds $30 dispute threshold).',
      flagsInvolved: [],
    },
    {
      id: nextEventId(),
      timestamp: now + 31000,
      simMinuteOfDay: 1120,
      simDay: 5,
      simTimeFormatted: 'Fri 18:40',
      citizenId: 'dave',
      citizenName: 'Dave',
      buildingId: 'resolution_center',
      buildingName: 'Resolution Center',
      type: 'dispute',
      paypalApi: 'POST /v1/customer/disputes',
      source,
      httpStatus: activeFlags.slowDisputeResponse ? 504 : 201,
      latencyMs: activeFlags.slowDisputeResponse ? 4950 : 280,
      amount: 64.0,
      currency: 'USD',
      summary: DAVE_DRAMATIC_COMPLAINTS[0],
      flagsInvolved: activeFlags.slowDisputeResponse ? ['slowDisputeResponse'] : [],
      webhookAnomaly: activeFlags.slowDisputeResponse,
    },
    activeFlags.payLaterBrokenOnMobile
      ? {
          id: nextEventId(),
          timestamp: now + 36000,
          simMinuteOfDay: 1125,
          simDay: 5,
          simTimeFormatted: 'Fri 18:45',
          citizenId: 'luna',
          citizenName: 'Luna',
          buildingId: 'flawed_shop',
          buildingName: 'The Flawed Shop',
          type: 'abandon',
          paypalApi: 'POST /v2/checkout/orders/3PL88321/capture',
          source,
          httpStatus: 422,
          latencyMs: 640,
          amount: 88.0,
          currency: 'USD',
          abandonStep: 'Pay Later Modal',
          checkoutDurationSec: 7.9,
          summary: 'Luna abandoned $88.00 Pay-in-4 checkout: Mobile Pay Later iframe callback crashed!',
          flagsInvolved: ['payLaterBrokenOnMobile'],
        }
      : {
          id: nextEventId(),
          timestamp: now + 36000,
          simMinuteOfDay: 1125,
          simDay: 5,
          simTimeFormatted: 'Fri 18:45',
          citizenId: 'luna',
          citizenName: 'Luna',
          buildingId: 'flawed_shop',
          buildingName: 'The Flawed Shop',
          type: 'pay',
          paypalApi: 'POST /v2/checkout/orders/3PL88321/capture',
          source,
          httpStatus: 200,
          latencyMs: 230,
          amount: 88.0,
          currency: 'USD',
          checkoutDurationSec: 3.4,
          summary: 'Luna completed Pay-in-4 installment capture ($88.00 / 4x $22.00).',
          flagsInvolved: [],
        },
    activeFlags.currencyRoundingBug
      ? {
          id: nextEventId(),
          timestamp: now + 41000,
          simMinuteOfDay: 1130,
          simDay: 5,
          simTimeFormatted: 'Fri 18:50',
          citizenId: 'omar',
          citizenName: 'Omar',
          buildingId: 'flawed_shop',
          buildingName: 'The Flawed Shop',
          type: 'abandon',
          paypalApi: 'POST /v2/checkout/orders',
          source,
          httpStatus: 422,
          latencyMs: 390,
          amount: 112.45,
          currency: 'EUR',
          abandonStep: 'FX Conversion',
          checkoutDurationSec: 5.5,
          summary:
            'Omar abandoned €112.45 order: 422 DECIMAL_PRECISION float rounding mismatch (112.4500000001)!',
          flagsInvolved: ['currencyRoundingBug'],
        }
      : {
          id: nextEventId(),
          timestamp: now + 41000,
          simMinuteOfDay: 1130,
          simDay: 5,
          simTimeFormatted: 'Fri 18:50',
          citizenId: 'omar',
          citizenName: 'Omar',
          buildingId: 'flawed_shop',
          buildingName: 'The Flawed Shop',
          type: 'pay',
          paypalApi: 'POST /v2/checkout/orders/7FX10294/capture',
          source,
          httpStatus: 200,
          latencyMs: 245,
          amount: 112.45,
          currency: 'EUR',
          checkoutDurationSec: 3.6,
          summary: 'Omar captured cross-border EUR checkout (€112.45 settled cleanly).',
          flagsInvolved: [],
        },
    {
      id: nextEventId(),
      timestamp: now + 44000,
      simMinuteOfDay: 1135,
      simDay: 5,
      simTimeFormatted: 'Fri 18:55',
      citizenId: 'gus',
      citizenName: 'Gus',
      buildingId: 'flawed_shop',
      buildingName: 'The Flawed Shop',
      type: 'refund_request',
      paypalApi: 'POST /v2/payments/captures/5RF99201/refund',
      source,
      httpStatus: 201,
      latencyMs: 260,
      amount: 42.5,
      currency: 'USD',
      summary: 'Gus requested full $42.50 refund after using blender all weekend ("ice was too loud").',
      flagsInvolved: [],
    },
    {
      id: nextEventId(),
      timestamp: now + 47000,
      simMinuteOfDay: 1140,
      simDay: 5,
      simTimeFormatted: 'Fri 19:00',
      citizenId: 'priya',
      citizenName: 'Priya',
      buildingId: 'rent_office',
      buildingName: 'Rent Office',
      type: 'invoice_paid',
      paypalApi: 'POST /v2/invoicing/invoices/INV-2026-09/record-payment',
      source,
      httpStatus: 200,
      latencyMs: 188,
      amount: 95.0,
      currency: 'USD',
      checkoutDurationSec: 2.4,
      summary: 'Priya paid Friday rent invoice INV-2026-09 ($95.00) at Rent Office.',
      flagsInvolved: [],
    },
  ];

  // Enrich seed events with normalized telemetry fields (paypalDebugId, paypalErrorName, bugFlag, rawResponseStatus)
  const enriched = events.reverse().map((ev, idx) => {
    const bugFlag = ev.flagsInvolved[0] || null;
    const errorName =
      ev.httpStatus === 422
        ? bugFlag === 'hiddenShippingFee'
          ? 'ITEM_TOTAL_MISMATCH'
          : bugFlag === 'currencyRoundingBug'
          ? 'DECIMAL_PRECISION'
          : 'UNPROCESSABLE_ENTITY'
        : ev.httpStatus >= 500
        ? 'INTERNAL_SERVER_ERROR'
        : undefined;
    const debugId = `SIM-DBG-SEED0${idx + 1}`;
    return {
      ...ev,
      decisionSource: ev.decisionSource ?? 'Rule-based',
      bugFlag,
      paypalDebugId: debugId,
      paypalErrorName: errorName,
      rawResponseStatus: `HTTP ${ev.httpStatus} (${ev.source}) — ${errorName || 'OK'} [PayPal-Debug-Id: ${debugId}]`,
    };
  });

  return enriched;
}

export interface CitizenStepResult {
  updatedCitizen: Citizen;
  emittedEvents: SandboxEvent[];
  spawnedCoin?: {
    fromBuilding: BuildingId;
    toBuilding: BuildingId;
    status: 'moving' | 'success' | 'failed' | 'stalled';
    httpStatus?: number;
    amount: number;
    currencySymbol: string;
    isDouble?: boolean;
  };
}

let daveComplaintIdx = 1;

/**
 * Pure rule-based citizen outcome evaluation when a citizen reaches their target building.
 * Outcomes genuinely depend on the active Bug Lab flags and active Chaos scenario.
 */
export function evaluateCitizenBuildingAction(
  citizen: Citizen,
  flags: Record<BugFlagKey, boolean>,
  activeChaos: ChaosType | null,
  simDay: number,
  simMinuteOfDay: number,
  source: EventSource
): CitizenStepResult {
  const simTimeFormatted = formatSimClock(simDay, simMinuteOfDay);
  const now = Date.now();
  const emittedEvents: SandboxEvent[] = [];
  let nextMood: CitizenMood = citizen.mood;
  let nextPatience = citizen.patience;
  let nextTrust = citizen.trust;
  let nextBudget = citizen.budget;
  let nextThought = citizen.lastThought;
  let nextBubble = citizen.speechBubble;
  let nextTargetBuilding: BuildingId = 'flawed_shop';
  let spawnedCoin: CitizenStepResult['spawnedCoin'] = undefined;

  const isWebhookOutage = activeChaos === 'webhook_outage';
  const isBlackFriday = activeChaos === 'black_friday';
  const isCurrencySwing = activeChaos === 'currency_swing';
  const baseLatency = isBlackFriday ? 690 : isWebhookOutage ? 3400 : 185;

  const makeEvent = (
    partial: Omit<
      SandboxEvent,
      | 'id'
      | 'timestamp'
      | 'simMinuteOfDay'
      | 'simDay'
      | 'simTimeFormatted'
      | 'citizenId'
      | 'citizenName'
      | 'buildingName'
      | 'source'
      | 'chaosActive'
    >
  ): SandboxEvent => {
    const id = nextEventId();
    const bugFlag = partial.bugFlag ?? (partial.flagsInvolved[0] || null);
    const errorName =
      partial.paypalErrorName ??
      (partial.httpStatus === 422
        ? bugFlag === 'hiddenShippingFee'
          ? 'ITEM_TOTAL_MISMATCH'
          : bugFlag === 'currencyRoundingBug'
          ? 'DECIMAL_PRECISION'
          : 'UNPROCESSABLE_ENTITY'
        : partial.httpStatus >= 500
        ? 'GATEWAY_TIMEOUT'
        : undefined);
    const debugId = partial.paypalDebugId ?? `SIM-DBG-${id.toUpperCase()}`;
    return {
      id,
      timestamp: now,
      simMinuteOfDay,
      simDay,
      simTimeFormatted,
      citizenId: citizen.id,
      citizenName: citizen.name,
      buildingName: BUILDING_MAP[partial.buildingId]?.name || 'The Flawed Shop',
      source,
      decisionSource: partial.decisionSource ?? 'Rule-based',
      chaosActive: activeChaos,
      bugFlag,
      paypalDebugId: debugId,
      paypalErrorName: errorName,
      rawResponseStatus:
        partial.rawResponseStatus ??
        `HTTP ${partial.httpStatus} (${source}) — ${errorName || 'OK'} [PayPal-Debug-Id: ${debugId}]`,
      ...partial,
    };
  };

  switch (citizen.id) {
    case 'marge': {
      // Marge: bargain hunter. Abandons if hiddenShippingFee is on; exploits couponStackingBug if on.
      emittedEvents.push(
        makeEvent({
          buildingId: 'flawed_shop',
          type: 'add_to_cart',
          paypalApi: 'POST /v2/checkout/orders',
          httpStatus: 201,
          latencyMs: baseLatency,
          amount: 62.0,
          currency: 'USD',
          summary: 'Marge added $62.00 Air Fryer to cart and checked shipping rules.',
          flagsInvolved: [],
        })
      );

      if (flags.hiddenShippingFee) {
        nextMood = 'furious';
        nextPatience = Math.max(10, citizen.patience - 18);
        nextTrust = Math.max(15, citizen.trust - 14);
        nextThought = 'A hidden $14.99 shipping surcharge at the final step?! Abandoning cart!';
        nextBubble = '+$14.99 fee?! ABANDON!';
        nextTargetBuilding = 'mayors_office';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'abandon',
            paypalApi: 'PATCH /v2/checkout/orders/MRG-402',
            httpStatus: 422,
            latencyMs: baseLatency + 140,
            amount: 76.99,
            currency: 'USD',
            abandonStep: 'Shipping Step',
            checkoutDurationSec: 6.8,
            summary:
              'Marge abandoned $76.99 cart at Shipping Step: hidden $14.99 fee triggered amount breakdown mismatch!',
            flagsInvolved: ['hiddenShippingFee'],
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: 'failed',
          httpStatus: 422,
          amount: 76.99,
          currencySymbol: '$',
        };
      } else if (flags.couponStackingBug) {
        nextMood = 'delighted';
        nextPatience = Math.min(100, citizen.patience + 10);
        nextBudget = Math.max(10, citizen.budget - 1);
        nextThought = 'Stacked WELCOME20 + VIP50 + CLEARANCE30! Got a $62 Air Fryer for $1.00!';
        nextBubble = 'Stacked 3 coupons! $1.00!';
        nextTargetBuilding = 'bank_tower';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'pay',
            paypalApi: 'POST /v2/checkout/orders/MRG-STACK/capture',
            httpStatus: isWebhookOutage ? 504 : 200,
            latencyMs: baseLatency,
            amount: 1.0,
            currency: 'USD',
            checkoutDurationSec: 2.9,
            summary:
              'Marge stacked 3 promo codes via couponStackingBug — paid $1.00 for a $62.00 Air Fryer!',
            flagsInvolved: ['couponStackingBug'],
            webhookAnomaly: isWebhookOutage,
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: isWebhookOutage ? 'stalled' : 'success',
          amount: 1.0,
          currencySymbol: '$',
        };
      } else {
        nextMood = 'delighted';
        nextPatience = Math.min(100, citizen.patience + 6);
        nextTrust = Math.min(100, citizen.trust + 5);
        nextBudget = Math.max(20, citizen.budget - 62);
        nextThought = 'Free shipping verified! Paid $62.00 cleanly.';
        nextBubble = 'Free shipping! Paid $62!';
        nextTargetBuilding = 'bank_tower';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'pay',
            paypalApi: 'POST /v2/checkout/orders/MRG-OK/capture',
            httpStatus: isWebhookOutage ? 504 : 200,
            latencyMs: baseLatency,
            amount: 62.0,
            currency: 'USD',
            checkoutDurationSec: 2.8,
            summary: 'Marge completed checkout ($62.00) with transparent free shipping.',
            flagsInvolved: [],
            webhookAnomaly: isWebhookOutage,
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: isWebhookOutage ? 'stalled' : 'success',
          amount: 62.0,
          currencySymbol: '$',
        };
      }
      break;
    }

    case 'dave': {
      // Dave disputes anything over $30 with a different dramatic complaint each time
      if (citizen.targetBuildingId === 'flawed_shop') {
        const price = 58.0;
        nextBudget = Math.max(30, citizen.budget - price);
        nextMood = 'annoyed';
        nextThought = `Just paid $${price.toFixed(2)}. Wait... is the packaging slightly asymmetrical?! To the Resolution Center!`;
        nextBubble = 'Wait... is that a smudge?!';
        nextTargetBuilding = 'resolution_center';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'add_to_cart',
            paypalApi: 'POST /v2/checkout/orders',
            httpStatus: 201,
            latencyMs: baseLatency,
            amount: price,
            currency: 'USD',
            summary: `Dave added $58.00 Pour-Over Decanter to cart.`,
            flagsInvolved: [],
          }),
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'pay',
            paypalApi: 'POST /v2/checkout/orders/DAV-58/capture',
            httpStatus: 200,
            latencyMs: baseLatency + 30,
            amount: price,
            currency: 'USD',
            checkoutDurationSec: 3.5,
            summary: `Dave paid $58.00 (over his $30 dispute trigger threshold).`,
            flagsInvolved: [],
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: 'success',
          amount: price,
          currencySymbol: '$',
        };
      } else {
        const complaint =
          DAVE_DRAMATIC_COMPLAINTS[daveComplaintIdx % DAVE_DRAMATIC_COMPLAINTS.length];
        daveComplaintIdx++;
        const slowBug = flags.slowDisputeResponse;
        nextMood = slowBug ? 'furious' : 'annoyed';
        nextPatience = slowBug
          ? Math.max(5, citizen.patience - 22)
          : Math.max(25, citizen.patience - 6);
        nextTrust = slowBug ? Math.max(10, citizen.trust - 20) : citizen.trust;
        nextThought = slowBug
          ? 'Dispute endpoint timed out at 4,900ms! Escalating straight to bank chargeback!'
          : complaint;
        nextBubble = slowBug ? '504 TIMEOUT! Chargeback!' : 'Filing dramatic dispute!';
        nextTargetBuilding = 'flawed_shop';

        emittedEvents.push(
          makeEvent({
            buildingId: 'resolution_center',
            type: 'dispute',
            paypalApi: 'POST /v1/customer/disputes',
            httpStatus: slowBug ? 504 : 201,
            latencyMs: slowBug ? 4910 : 275,
            amount: 58.0,
            currency: 'USD',
            summary: slowBug ? `${complaint} [504 SLA TIMEOUT — AUTO-ESCALATED]` : complaint,
            flagsInvolved: slowBug ? ['slowDisputeResponse'] : [],
            webhookAnomaly: slowBug,
          })
        );
        spawnedCoin = {
          fromBuilding: 'bank_tower',
          toBuilding: 'resolution_center',
          status: slowBug ? 'failed' : 'moving',
          httpStatus: slowBug ? 500 : 201,
          amount: 58.0,
          currencySymbol: '$',
        };
      }
      break;
    }

    case 'priya': {
      // Priya: gig worker paid weekly by payout at Gig Hub; pays rent invoice at Rent Office
      if (citizen.targetBuildingId === 'gig_hub') {
        const payoutAmt = 140.0;
        const doubleBug = flags.webhookDoubleCredit;
        nextBudget = citizen.budget + (doubleBug ? payoutAmt * 2 : payoutAmt);
        nextMood = 'delighted';
        nextThought = doubleBug
          ? 'Whoa, Gig Hub webhook fired twice without idempotency! I got credited $280 instead of $140!'
          : 'Collected $140 weekly courier payout! Heading to Rent Office to pay Friday invoice.';
        nextBubble = doubleBug ? 'Double payout webhook?!' : '+$140 Gig Payout!';
        nextTargetBuilding = 'rent_office';

        emittedEvents.push(
          makeEvent({
            buildingId: 'gig_hub',
            type: 'payout',
            paypalApi: 'POST /v1/payments/payouts',
            httpStatus: isWebhookOutage ? 502 : 201,
            latencyMs: baseLatency + 40,
            amount: doubleBug ? payoutAmt * 2 : payoutAmt,
            currency: 'USD',
            summary: doubleBug
              ? 'Priya received DUPLICATE payout ($280.00 instead of $140.00) due to missing webhook idempotency!'
              : 'Priya collected weekly courier payout ($140.00) via PayPal Payouts.',
            flagsInvolved: doubleBug ? ['webhookDoubleCredit'] : [],
            webhookAnomaly: doubleBug || isWebhookOutage,
          })
        );
        spawnedCoin = {
          fromBuilding: 'bank_tower',
          toBuilding: 'gig_hub',
          status: isWebhookOutage ? 'stalled' : 'success',
          amount: payoutAmt,
          currencySymbol: '$',
          isDouble: doubleBug,
        };
      } else {
        const rentAmt = 95.0;
        nextBudget = Math.max(40, citizen.budget - rentAmt);
        nextMood = 'calm';
        nextThought = 'Friday rent invoice paid cleanly! Back to Gig Hub for my next shift.';
        nextBubble = 'Rent invoice paid ($95)!';
        nextTargetBuilding = 'gig_hub';

        emittedEvents.push(
          makeEvent({
            buildingId: 'rent_office',
            type: 'invoice_paid',
            paypalApi: 'POST /v2/invoicing/invoices/INV-FRI-95/record-payment',
            httpStatus: isWebhookOutage ? 504 : 200,
            latencyMs: baseLatency,
            amount: rentAmt,
            currency: 'USD',
            checkoutDurationSec: 2.2,
            summary: 'Priya paid Friday rent invoice ($95.00) at Rent Office.',
            flagsInvolved: [],
            webhookAnomaly: isWebhookOutage,
          })
        );
        spawnedCoin = {
          fromBuilding: 'rent_office',
          toBuilding: 'bank_tower',
          status: isWebhookOutage ? 'stalled' : 'success',
          amount: rentAmt,
          currencySymbol: '$',
        };
      }
      break;
    }

    case 'gus': {
      // Gus: tries to refund items he has already used
      const refundAmt = 46.0;
      nextBudget = citizen.budget + refundAmt;
      nextMood = 'delighted';
      nextThought =
        'Used the camping waffle iron 6 times in the woods, now requesting a full $46 refund.';
      nextBubble = 'Refund please! Barely used!';
      nextTargetBuilding = citizen.targetBuildingId === 'flawed_shop' ? 'bank_tower' : 'flawed_shop';

      emittedEvents.push(
        makeEvent({
          buildingId: 'flawed_shop',
          type: 'refund_request',
          paypalApi: 'POST /v2/payments/captures/GUS-882/refund',
          httpStatus: 201,
          latencyMs: baseLatency + 55,
          amount: refundAmt,
          currency: 'USD',
          summary:
            'Gus requested $46.00 refund on heavily used waffle iron ("waffles were too octagonal").',
          flagsInvolved: [],
        })
      );
      spawnedCoin = {
        fromBuilding: 'bank_tower',
        toBuilding: 'flawed_shop',
        status: 'moving',
        amount: refundAmt,
        currencySymbol: '$',
      };
      break;
    }

    case 'luna': {
      // Luna: student who loves Pay Later and installments
      const orderAmt = 84.0;
      emittedEvents.push(
        makeEvent({
          buildingId: 'flawed_shop',
          type: 'add_to_cart',
          paypalApi: 'POST /v2/checkout/orders',
          httpStatus: 201,
          latencyMs: baseLatency,
          amount: orderAmt,
          currency: 'USD',
          summary: 'Luna selected Pay-in-4 ($21.00 x 4) on mobile for $84.00 Studio Mic.',
          flagsInvolved: [],
        })
      );

      if (flags.payLaterBrokenOnMobile) {
        nextMood = 'furious';
        nextPatience = Math.max(12, citizen.patience - 20);
        nextTrust = Math.max(20, citizen.trust - 16);
        nextThought = 'Pay Later modal froze on mobile viewport! Uncaught 422 on capture!';
        nextBubble = 'Pay in 4 crashed on mobile!';
        nextTargetBuilding = 'mayors_office';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'abandon',
            paypalApi: 'POST /v2/checkout/orders/LUN-PL4/capture',
            httpStatus: 422,
            latencyMs: baseLatency + 380,
            amount: orderAmt,
            currency: 'USD',
            abandonStep: 'Pay Later Modal',
            checkoutDurationSec: 8.2,
            summary:
              'Luna abandoned $84.00 cart at Pay Later Modal: mobile SDK dropped pay_later token (HTTP 422)!',
            flagsInvolved: ['payLaterBrokenOnMobile'],
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: 'failed',
          httpStatus: 422,
          amount: orderAmt,
          currencySymbol: '$',
        };
      } else {
        nextMood = 'delighted';
        nextPatience = Math.min(100, citizen.patience + 8);
        nextBudget = Math.max(25, citizen.budget - 21);
        nextThought = 'Pay-in-4 approved in 2.6s! First $21 installment captured.';
        nextBubble = 'Pay-in-4 approved ($21x4)!';
        nextTargetBuilding = 'bank_tower';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'pay',
            paypalApi: 'POST /v2/checkout/orders/LUN-PL4/capture',
            httpStatus: 200,
            latencyMs: baseLatency,
            amount: orderAmt,
            currency: 'USD',
            checkoutDurationSec: 2.6,
            summary: 'Luna completed $84.00 Pay-in-4 mobile checkout (4x $21.00 installments).',
            flagsInvolved: [],
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: 'success',
          amount: orderAmt,
          currencySymbol: '$',
        };
      }
      break;
    }

    case 'omar': {
      // Omar: buys in a foreign currency; sensitive to rounding and conversion errors
      const currencies = ['EUR', 'GBP', 'JPY'];
      const symbols: Record<string, string> = { EUR: '€', GBP: '£', JPY: '¥' };
      const curr = currencies[(simDay + Math.floor(simMinuteOfDay / 15)) % currencies.length];
      const sym = symbols[curr] || '€';
      const amt = curr === 'JPY' ? 12800 : 94.5;

      emittedEvents.push(
        makeEvent({
          buildingId: 'flawed_shop',
          type: 'add_to_cart',
          paypalApi: 'POST /v2/checkout/orders',
          httpStatus: 201,
          latencyMs: baseLatency,
          amount: amt,
          currency: curr,
          summary: `Omar initiated cross-border checkout in ${curr} (${sym}${amt}).`,
          flagsInvolved: [],
        })
      );

      if (flags.currencyRoundingBug || isCurrencySwing) {
        nextMood = 'furious';
        nextPatience = Math.max(15, citizen.patience - 18);
        nextTrust = Math.max(20, citizen.trust - 15);
        nextThought =
          curr === 'JPY'
            ? 'Sent decimals on zero-decimal JPY currency! PayPal returned 422 DECIMAL_PRECISION!'
            : `Float rounding error on ${curr} breakdown! Item total + tax != amount.value by €0.01!`;
        nextBubble = `422 FX Rounding Bug (${curr})!`;
        nextTargetBuilding = 'bank_tower';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'abandon',
            paypalApi: 'POST /v2/checkout/orders',
            httpStatus: 422,
            latencyMs: baseLatency + 210,
            amount: amt === 12800 ? 115.0 : amt,
            currency: curr,
            abandonStep: 'FX Conversion',
            checkoutDurationSec: 5.9,
            summary: `Omar abandoned ${sym}${amt} (${curr}) checkout: 422 DECIMAL_PRECISION / float breakdown drift!`,
            flagsInvolved: ['currencyRoundingBug'],
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: 'failed',
          httpStatus: 422,
          amount: 94.5,
          currencySymbol: sym,
        };
      } else {
        nextMood = 'delighted';
        nextTrust = Math.min(100, citizen.trust + 6);
        nextThought = `Multi-currency ${curr} settlement matched minor units to the exact cent!`;
        nextBubble = `${sym}${amt} ${curr} settled!`;
        nextTargetBuilding = 'bank_tower';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'pay',
            paypalApi: 'POST /v2/checkout/orders/OMR-FX/capture',
            httpStatus: 200,
            latencyMs: baseLatency + 35,
            amount: 94.5,
            currency: curr,
            checkoutDurationSec: 3.2,
            summary: `Omar completed cross-border ${curr} checkout (${sym}${amt}) with exact FX breakdown.`,
            flagsInvolved: [],
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: 'success',
          amount: 94.5,
          currencySymbol: sym,
        };
      }
      break;
    }

    case 'joe': {
      // Grandpa Joe: easily confused; double-clicks buttons; abandons if UI is unclear
      const amt = 38.0;
      emittedEvents.push(
        makeEvent({
          buildingId: 'flawed_shop',
          type: 'add_to_cart',
          paypalApi: 'POST /v2/checkout/orders',
          httpStatus: 201,
          latencyMs: baseLatency,
          amount: amt,
          currency: 'USD',
          summary: 'Grandpa Joe added Orthopedic Slippers ($38.00) and double-clicked Pay Now.',
          flagsInvolved: [],
        })
      );

      if (flags.webhookDoubleCredit) {
        nextMood = 'furious';
        nextPatience = Math.max(10, citizen.patience - 22);
        nextTrust = Math.max(15, citizen.trust - 22);
        nextThought =
          'I double-clicked the Pay button and got charged TWICE ($76.00) because PayPal-Request-Id was missing!';
        nextBubble = 'Charged twice on double-click!';
        nextTargetBuilding = 'resolution_center';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'pay',
            paypalApi: 'POST /v2/checkout/orders/JOE-DBL/capture',
            httpStatus: 200,
            latencyMs: baseLatency + 90,
            amount: amt * 2,
            currency: 'USD',
            checkoutDurationSec: 5.4,
            summary:
              'Grandpa Joe double-clicked Pay Now: missing PayPal-Request-Id caused duplicate $38.00 capture ($76.00)!',
            flagsInvolved: ['webhookDoubleCredit'],
            webhookAnomaly: true,
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: 'failed',
          httpStatus: 500,
          amount: amt * 2,
          currencySymbol: '$',
          isDouble: true,
        };
      } else if (isWebhookOutage || isBlackFriday) {
        nextMood = 'annoyed';
        nextPatience = Math.max(15, citizen.patience - 15);
        nextThought = 'The loading spinner spun for 5 seconds with no label! Closing window!';
        nextBubble = 'Too confusing! Leaving!';
        nextTargetBuilding = 'rent_office';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'abandon',
            paypalApi: 'POST /v2/checkout/orders/JOE-SPIN/capture',
            httpStatus: 408,
            latencyMs: 3900,
            amount: amt,
            currency: 'USD',
            abandonStep: 'Payment Submit',
            checkoutDurationSec: 9.1,
            summary:
              'Grandpa Joe double-clicked during spinner freeze and abandoned at Payment Submit.',
            flagsInvolved: [],
          })
        );
      } else {
        nextMood = 'calm';
        nextThought = 'Button disabled after my first click so I did not get double-charged!';
        nextBubble = 'One click worked!';
        nextTargetBuilding = 'rent_office';

        emittedEvents.push(
          makeEvent({
            buildingId: 'flawed_shop',
            type: 'pay',
            paypalApi: 'POST /v2/checkout/orders/JOE-OK/capture',
            httpStatus: 200,
            latencyMs: baseLatency,
            amount: amt,
            currency: 'USD',
            checkoutDurationSec: 4.1,
            summary: 'Grandpa Joe double-clicked Pay Now; idempotency header prevented duplicate charge ($38.00).',
            flagsInvolved: [],
          })
        );
        spawnedCoin = {
          fromBuilding: 'flawed_shop',
          toBuilding: 'bank_tower',
          status: 'success',
          amount: amt,
          currencySymbol: '$',
        };
      }
      break;
    }

    case 'bot_ring':
    default: {
      // The Bot Ring: 3 hooded citizens that try rapid repeated purchases (fraud pattern)
      const isStackBug = flags.couponStackingBug;
      const isFraudChaos = activeChaos === 'fraud_ring';
      nextMood = 'scheming';
      nextThought = isStackBug
        ? 'Bot Ring exploiting couponStackingBug with 3 rapid $1.00 card-testing captures!'
        : 'Bot Ring probing /v2/checkout/orders with stolen card bin velocity burst.';
      nextBubble = isStackBug ? '[EXPLOIT: 3x $1 ORDERS]' : '[VELOCITY PROBE: 429]';
      nextTargetBuilding =
        citizen.targetBuildingId === 'flawed_shop' ? 'bank_tower' : 'flawed_shop';

      emittedEvents.push(
        makeEvent({
          buildingId: 'flawed_shop',
          type: 'add_to_cart',
          paypalApi: 'POST /v2/checkout/orders',
          httpStatus: 201,
          latencyMs: 65,
          amount: isStackBug ? 3.0 : 15.0,
          currency: 'USD',
          summary: 'The Bot Ring (3 hooded sprites) injected rapid batch cart session.',
          flagsInvolved: isStackBug ? ['couponStackingBug'] : [],
        }),
        makeEvent({
          buildingId: 'flawed_shop',
          type: isStackBug ? 'pay' : 'abandon',
          paypalApi: 'POST /v2/checkout/orders/BOT-BURST/capture',
          httpStatus: isStackBug ? 200 : 429,
          latencyMs: isFraudChaos ? 55 : 110,
          amount: isStackBug ? 3.0 : 15.0,
          currency: 'USD',
          abandonStep: isStackBug ? undefined : 'Payment Submit',
          checkoutDurationSec: 0.9,
          summary: isStackBug
            ? 'The Bot Ring exploited couponStackingBug to clear 3 rapid $1.00 orders undetected!'
            : 'The Bot Ring velocity attack throttled at Payment Submit (HTTP 429 / Fraud Filter).',
          flagsInvolved: isStackBug ? ['couponStackingBug'] : [],
        })
      );
      spawnedCoin = {
        fromBuilding: 'flawed_shop',
        toBuilding: 'bank_tower',
        status: isStackBug ? 'success' : 'failed',
        httpStatus: isStackBug ? 200 : 422,
        amount: isStackBug ? 3.0 : 15.0,
        currencySymbol: '$',
        isDouble: true,
      };
      break;
    }
  }

  const nextBuilding = BUILDING_MAP[nextTargetBuilding] || BUILDING_MAP.flawed_shop;
  const hashOffset = ((citizen.id.charCodeAt(0) * 19) % 46) - 23;
  const roadWaypoints = computeRoadPathBetweenBuildings(
    citizen.targetBuildingId,
    nextTargetBuilding
  );
  const finalDest = {
    x: (nextBuilding.entranceX ?? nextBuilding.x) + hashOffset,
    y: (nextBuilding.entranceY ?? nextBuilding.y) + (hashOffset % 14),
  };
  const fullWaypoints = [...roadWaypoints, finalDest];
  const firstWp = fullWaypoints[0] || finalDest;
  const clampedBubble = clampSpeechBubbleWords(nextBubble, 8);

  const updatedCitizen: Citizen = {
    ...citizen,
    budget: Math.round(nextBudget * 100) / 100,
    patience: nextPatience,
    trust: nextTrust,
    mood: nextMood,
    lastThought: nextThought,
    decisionSource: citizen.decisionSource ?? 'Rule-based',
    speechBubble: clampedBubble,
    speechBubbleIcon: inferSpeechBubbleIcon(clampedBubble, nextMood),
    speechBubbleTimer: clampedBubble ? 3.0 : 0,
    currentBuildingId: citizen.targetBuildingId,
    targetBuildingId: nextTargetBuilding,
    waypoints: fullWaypoints.slice(1),
    targetX: firstWp.x,
    targetY: firstWp.y,
    state: 'walking',
    actionCooldown: activeChaos === 'black_friday' || activeChaos === 'viral_tiktok' ? 1.2 : 2.6,
  };

  return {
    updatedCitizen,
    emittedEvents,
    spawnedCoin,
  };
}

export interface PerformancePoint {
  time: string;
  conversion: number;
  abandon: number;
}

/**
 * Pure derivation function: computes time-bucketed Conversion % and Abandon %
 * for the City Performance mini line chart strictly from the Event Log.
 */
export function derivePerformanceSeriesFromEventLog(
  events: SandboxEvent[]
): PerformancePoint[] {
  const chronological = [...events].reverse();
  if (chronological.length === 0) {
    return [{ time: '18:15', conversion: 0, abandon: 0 }];
  }

  const points: PerformancePoint[] = [];
  let runningPays = 0;
  let runningAbandons = 0;

  for (let i = 0; i < chronological.length; i++) {
    const ev = chronological[i];
    if (ev.type === 'pay' && ev.httpStatus >= 200 && ev.httpStatus < 300) {
      runningPays++;
    } else if (ev.type === 'abandon') {
      runningAbandons++;
    }

    const total = runningPays + runningAbandons;
    if (total > 0 && (i % 2 === 1 || i === chronological.length - 1)) {
      const shortTime = ev.simTimeFormatted.replace(/^[A-Za-z]+\s+/, '');
      points.push({
        time: shortTime,
        conversion: Math.round((runningPays / total) * 100),
        abandon: Math.round((runningAbandons / total) * 100),
      });
    }
  }

  return points.slice(-8);
}

/**
 * Deterministic PRNG (Mulberry32) so "Fix and rerun" runs the exact same scripted
 * citizen sequence with the exact same random seed for a fair Before/After comparison.
 */
export function createDeterministicPrng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface DeterministicRerunOutput {
  seed: number;
  events: SandboxEvent[];
  citizens: Citizen[];
  metrics: DerivedMetrics;
}

/**
 * Runs a deterministic scripted scenario with a fixed random seed across the city population.
 * Given the same `seed` and `flags`, this function always produces the exact same sequence
 * of citizen actions, event types, amounts, and metrics.
 */
export function runDeterministicScenario(params: {
  seed: number;
  flags: Record<BugFlagKey, boolean>;
  simDay?: number;
  simMinuteOfDay?: number;
  source?: EventSource;
}): DeterministicRerunOutput {
  const {
    seed,
    flags,
    simDay = 5,
    simMinuteOfDay = 1120,
    source = 'SIMULATED',
  } = params;

  const rand = createDeterministicPrng(seed);
  // Deterministic citizen order shuffled or selected via `rand()`
  const baseOrder = ['marge', 'luna', 'omar', 'priya', 'dave', 'gus', 'joe'];
  const scriptedOrder = [...baseOrder];
  for (let i = scriptedOrder.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    const tmp = scriptedOrder[i];
    scriptedOrder[i] = scriptedOrder[j];
    scriptedOrder[j] = tmp;
  }

  const seedEvents = createSeedEvents(flags, source);
  const scenarioEvents: SandboxEvent[] = [];
  let nextCitizens: Citizen[] = INITIAL_CITIZENS.map((c) => ({
    ...c,
    decisionSource: 'Rule-based',
  }));

  let minuteCursor = simMinuteOfDay;
  for (const cid of scriptedOrder) {
    minuteCursor += 3;
    const c = nextCitizens.find((item) => item.id === cid);
    if (!c) continue;
    // Set deterministic patience so Grandpa Joe's outcome is also deterministic per seed
    const deterministicPatience = Math.round(45 + rand() * 45);
    const citizenWithSeededState: Citizen = {
      ...c,
      patience: flags.hiddenShippingFee || flags.payLaterBrokenOnMobile ? 25 : Math.max(55, deterministicPatience),
    };
    const step = evaluateCitizenBuildingAction(
      citizenWithSeededState,
      flags,
      null,
      simDay,
      minuteCursor,
      source
    );
    nextCitizens = nextCitizens.map((item) =>
      item.id === cid ? step.updatedCitizen : item
    );
    scenarioEvents.push(...step.emittedEvents);
  }

  const allEvents = [...scenarioEvents.reverse(), ...seedEvents].map((ev, index) => ({
    ...ev,
    id: `evt_seed_${seed}_${index + 1}`,
  }));

  return {
    seed,
    events: allEvents,
    citizens: nextCitizens,
    metrics: deriveMetricsFromEventLog(allEvents),
  };
}

/**
 * Computes the list of PayPal error names that existed in the "Before" run and disappeared in the "After" rerun.
 */
export function computeDisappearedPayPalErrors(
  beforeEvents: SandboxEvent[],
  afterEvents: SandboxEvent[]
): string[] {
  const beforeErrors = new Set<string>();
  const afterErrors = new Set<string>();

  for (const ev of beforeEvents) {
    if (ev.paypalErrorName) {
      beforeErrors.add(ev.paypalErrorName);
    } else if (ev.httpStatus >= 400) {
      beforeErrors.add(`HTTP_${ev.httpStatus}`);
    }
  }

  for (const ev of afterEvents) {
    if (ev.paypalErrorName) {
      afterErrors.add(ev.paypalErrorName);
    } else if (ev.httpStatus >= 400) {
      afterErrors.add(`HTTP_${ev.httpStatus}`);
    }
  }

  return Array.from(beforeErrors).filter((err) => !afterErrors.has(err));
}

