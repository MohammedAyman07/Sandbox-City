import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackMayorAiReport,
  computeDisappearedPayPalErrors,
  computeMayorStatisticsFromEventLog,
  createSeedEvents,
  deriveMayorReportFromEventLog,
  deriveMetricsFromEventLog,
  evaluateCitizenBuildingAction,
  formatSimClock,
  isNightTime,
  runDeterministicScenario,
} from './simulationEngine';
import {
  clampSpeechBubbleWords,
  computeRoadPathBetweenBuildings,
  INITIAL_CITIZENS,
  INITIAL_HOTSPOT_CONFIG,
  resolveCitizenPositions,
} from './cityData';
import {
  CITIZEN_TOOL_DECLARATIONS,
  sanitizeMayorFindingsAgainstEvents,
} from '../server/geminiEngine';
import { BugFlagKey } from '../types/sandbox';

const ALL_FLAGS_OFF: Record<BugFlagKey, boolean> = {
  hiddenShippingFee: false,
  payLaterBrokenOnMobile: false,
  webhookDoubleCredit: false,
  slowDisputeResponse: false,
  couponStackingBug: false,
  currencyRoundingBug: false,
};

const ALL_FLAGS_ON: Record<BugFlagKey, boolean> = {
  hiddenShippingFee: true,
  payLaterBrokenOnMobile: true,
  webhookDoubleCredit: true,
  slowDisputeResponse: true,
  couponStackingBug: true,
  currencyRoundingBug: true,
};

test('formatSimClock and isNightTime compute accurate time & dusk/night state', () => {
  assert.equal(formatSimClock(1, 0), 'Mon 00:00');
  assert.equal(formatSimClock(5, 1140), 'Fri 19:00');
  assert.equal(isNightTime(1140), true); // 19:00 is night
  assert.equal(isNightTime(720), false); // 12:00 is day
});

test('Marge abandons at Shipping Step when hiddenShippingFee is ON, and pays when OFF', () => {
  const marge = INITIAL_CITIZENS.find((c) => c.id === 'marge')!;

  const resBugOn = evaluateCitizenBuildingAction(
    marge,
    { ...ALL_FLAGS_OFF, hiddenShippingFee: true },
    null,
    5,
    1140,
    'SIMULATED'
  );
  const abandonEvt = resBugOn.emittedEvents.find((e) => e.type === 'abandon');
  assert.ok(abandonEvt, 'Marge should emit an abandon event when hiddenShippingFee is true');
  assert.equal(abandonEvt.abandonStep, 'Shipping Step');
  assert.deepEqual(abandonEvt.flagsInvolved, ['hiddenShippingFee']);
  assert.equal(resBugOn.updatedCitizen.mood, 'furious');
  assert.equal(resBugOn.spawnedCoin?.httpStatus, 422);

  const resBugOff = evaluateCitizenBuildingAction(
    marge,
    ALL_FLAGS_OFF,
    null,
    5,
    1140,
    'SIMULATED'
  );
  const payEvt = resBugOff.emittedEvents.find((e) => e.type === 'pay');
  assert.ok(payEvt, 'Marge should emit a pay event when hiddenShippingFee is false');
  assert.equal(payEvt.httpStatus, 200);
  assert.equal(resBugOff.updatedCitizen.mood, 'delighted');
});

test('Luna abandons at Pay Later Modal when payLaterBrokenOnMobile is ON', () => {
  const luna = INITIAL_CITIZENS.find((c) => c.id === 'luna')!;
  const res = evaluateCitizenBuildingAction(
    luna,
    { ...ALL_FLAGS_OFF, payLaterBrokenOnMobile: true },
    null,
    5,
    1150,
    'SIMULATED'
  );
  const abandonEvt = res.emittedEvents.find((e) => e.type === 'abandon');
  assert.ok(abandonEvt);
  assert.equal(abandonEvt.abandonStep, 'Pay Later Modal');
  assert.deepEqual(abandonEvt.flagsInvolved, ['payLaterBrokenOnMobile']);
});

test('Omar abandons at FX Conversion when currencyRoundingBug is ON', () => {
  const omar = INITIAL_CITIZENS.find((c) => c.id === 'omar')!;
  const res = evaluateCitizenBuildingAction(
    omar,
    { ...ALL_FLAGS_OFF, currencyRoundingBug: true },
    null,
    5,
    1160,
    'SIMULATED'
  );
  const abandonEvt = res.emittedEvents.find((e) => e.type === 'abandon');
  assert.ok(abandonEvt);
  assert.equal(abandonEvt.abandonStep, 'FX Conversion');
  assert.deepEqual(abandonEvt.flagsInvolved, ['currencyRoundingBug']);
});

test('deriveMetricsFromEventLog and deriveMayorReportFromEventLog compute accurate metrics strictly from events', () => {
  const eventsWithBugs = createSeedEvents(ALL_FLAGS_ON, 'SIMULATED');
  const metrics = deriveMetricsFromEventLog(eventsWithBugs);

  assert.equal(metrics.totalEvents, eventsWithBugs.length);
  assert.ok(metrics.cartAbandonRate > 0, 'Should record cart abandon rate > 0 when bugs are active');
  assert.ok(metrics.bugsFoundCount >= 4, 'Should detect at least 4 distinct bug flags in seed events');
  assert.equal(metrics.disputesOpened, 1);
  assert.equal(metrics.refundsCount, 1);
  assert.equal(metrics.payoutsSent, 1);

  const report = deriveMayorReportFromEventLog(eventsWithBugs);
  assert.ok(report.length >= 4, 'Mayor report should surface findings for active bug flags');
  assert.ok(report.some((f) => f.flag === 'hiddenShippingFee'));
});

test('resolveCitizenPositions enforces >= 40px separation and hides Bot Ring unless Fraud Ring is active', () => {
  const stackedCitizens = INITIAL_CITIZENS.map((c) => ({
    ...c,
    x: 600,
    y: 410,
    targetBuildingId: 'flawed_shop' as const,
  }));

  const normalResolved = resolveCitizenPositions(stackedCitizens, null, null, 40);
  assert.equal(
    normalResolved.some((c) => c.isBotRing),
    false,
    'Hooded Bot Ring sprite must not appear on map when Fraud Ring is inactive'
  );

  const fraudResolved = resolveCitizenPositions(stackedCitizens, 'fraud_ring', null, 40);
  assert.equal(
    fraudResolved.some((c) => c.isBotRing),
    true,
    'Hooded Bot Ring sprite must appear during Fraud Ring scenario'
  );

  for (let i = 0; i < fraudResolved.length; i++) {
    for (let j = i + 1; j < fraudResolved.length; j++) {
      const dist = Math.hypot(
        fraudResolved[i].renderX - fraudResolved[j].renderX,
        fraudResolved[i].renderY - fraudResolved[j].renderY
      );
      assert.ok(
        dist >= 39.9,
        `Citizens ${fraudResolved[i].name} and ${fraudResolved[j].name} overlapped (${dist.toFixed(1)}px < 40px)`
      );
    }
  }
});

test('clampSpeechBubbleWords enforces max 8 words and hotspot config has all 6 buildings', () => {
  const longText = 'One two three four five six seven eight nine ten eleven';
  const clamped = clampSpeechBubbleWords(longText, 8);
  assert.equal(clamped, 'One two three four five six seven eight...');

  const keys = INITIAL_HOTSPOT_CONFIG.map((h) => h.key);
  assert.deepEqual(keys, [
    'flawedShop',
    'bankTower',
    'resolutionCenter',
    'gigHub',
    'rentOffice',
    'mayorsOffice',
  ]);

  const path = computeRoadPathBetweenBuildings('flawed_shop', 'resolution_center');
  assert.ok(path.length >= 3, 'Should route along road waypoints between buildings');
});

test('CITIZEN_TOOL_DECLARATIONS defines all 7 required PayPal & citizen tools', () => {
  const names = CITIZEN_TOOL_DECLARATIONS.map((t) => t.name);
  assert.deepEqual(names, [
    'create_order',
    'request_refund',
    'send_payout',
    'pay_invoice',
    'check_disputes',
    'abandon_cart',
    'speak',
  ]);
});

test('computeMayorStatisticsFromEventLog and sanitizeMayorFindingsAgainstEvents strictly cite real event IDs', () => {
  const events = createSeedEvents(ALL_FLAGS_ON, 'SIMULATED');
  const stats = computeMayorStatisticsFromEventLog(events);

  assert.equal(stats.totalEvents, events.length);
  assert.ok(stats.errorCountsByPayPalErrorName['ITEM_TOTAL_MISMATCH'] >= 1);
  assert.ok(stats.errorCountsByPayPalErrorName['DECIMAL_PRECISION'] >= 1);
  assert.ok(stats.abandonmentByStep['Shipping Step'] >= 1);

  const fallbackReport = buildFallbackMayorAiReport(events, stats);
  const validIds = new Set(events.map((e) => e.id));
  for (const finding of fallbackReport.findings) {
    assert.ok(finding.evidence_event_ids.length > 0);
    for (const id of finding.evidence_event_ids) {
      assert.ok(validIds.has(id), `Evidence ID ${id} must exist in event log`);
    }
  }

  // Verify sanitizer replaces hallucinated IDs with real matching event IDs
  const sanitized = sanitizeMayorFindingsAgainstEvents(
    [
      {
        severity: 'critical',
        title: 'Surprise shipping fee mismatch',
        evidence_event_ids: ['hallucinated_id_999'],
        affected_citizens: ['Marge'],
        paypal_error_name: 'ITEM_TOTAL_MISMATCH',
        suggested_fix: 'Fix shipping breakdown',
        related_bug_flag: 'hiddenShippingFee',
      },
    ],
    events
  );
  assert.ok(sanitized[0].evidence_event_ids.every((id) => validIds.has(id)));
});

test('runDeterministicScenario is reproducible for the same seed and resolves PayPal errors when flags are turned off', () => {
  const seed = 20261109;
  const runBefore1 = runDeterministicScenario({ seed, flags: ALL_FLAGS_ON });
  const runBefore2 = runDeterministicScenario({ seed, flags: ALL_FLAGS_ON });

  assert.equal(runBefore1.metrics.conversionRate, runBefore2.metrics.conversionRate);
  assert.equal(runBefore1.metrics.cartAbandonRate, runBefore2.metrics.cartAbandonRate);
  assert.deepEqual(
    runBefore1.events.map((e) => `${e.citizenId}:${e.type}:${e.httpStatus}`),
    runBefore2.events.map((e) => `${e.citizenId}:${e.type}:${e.httpStatus}`)
  );

  const runAfter = runDeterministicScenario({ seed, flags: ALL_FLAGS_OFF });
  assert.ok(
    runAfter.metrics.conversionRate > runBefore1.metrics.conversionRate,
    'Conversion rate must increase after fixing Bug Lab flags'
  );
  assert.equal(runAfter.metrics.cartAbandonRate, 0, 'Abandonment rate should drop to 0% after fixing bugs');

  const disappeared = computeDisappearedPayPalErrors(runBefore1.events, runAfter.events);
  assert.ok(disappeared.includes('ITEM_TOTAL_MISMATCH'));
  assert.ok(disappeared.includes('DECIMAL_PRECISION'));
  assert.ok(disappeared.includes('UNPROCESSABLE_ENTITY'));
});
