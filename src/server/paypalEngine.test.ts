import test from 'node:test';
import assert from 'node:assert/strict';
import {
  assertSafePayPalUrl,
  buildPayPalOrderPayload,
  evaluateWebhookDeduplication,
  generatePayPalRequestId,
  paypalSandboxManager,
  PAYPAL_SANDBOX_BASE_URL,
} from './paypalEngine';

test('assertSafePayPalUrl enforces https://api-m.sandbox.paypal.com exclusively', () => {
  const valid = assertSafePayPalUrl(`${PAYPAL_SANDBOX_BASE_URL}/v2/checkout/orders`);
  assert.equal(valid.hostname, 'api-m.sandbox.paypal.com');

  assert.throws(
    () => assertSafePayPalUrl('https://api-m.paypal.com/v2/checkout/orders'),
    /SAFETY VIOLATION/
  );
  assert.throws(
    () => assertSafePayPalUrl('http://api-m.sandbox.paypal.com/v2/checkout/orders'),
    /SAFETY VIOLATION/
  );
  assert.throws(
    () => assertSafePayPalUrl('https://evil.example.com/v2/checkout/orders'),
    /SAFETY VIOLATION/
  );
});

test('buildPayPalOrderPayload creates real 422 mismatch payload when hiddenShippingFee is ON', () => {
  const built = buildPayPalOrderPayload({
    citizenId: 'marge',
    citizenName: 'Marge',
    bugFlags: { hiddenShippingFee: true },
    returnUrl: 'http://localhost:3000/paypal/return',
    cancelUrl: 'http://localhost:3000/paypal/cancel',
    baseAmountUsd: 54.0,
  });

  assert.equal(built.triggeredBugFlag, 'hiddenShippingFee');
  const pu = (built.payload.purchase_units as Record<string, unknown>[])[0];
  const amount = pu.amount as {
    value: string;
    breakdown: { item_total: { value: string }; shipping: { value: string } };
  };
  // Shipping is 14.99 in breakdown, but amount.value is 54.00 (not 68.99), triggering PayPal 422!
  assert.equal(amount.value, '54.00');
  assert.equal(amount.breakdown.item_total.value, '54.00');
  assert.equal(amount.breakdown.shipping.value, '14.99');
});

test('buildPayPalOrderPayload sends decimals on zero-decimal JPY when currencyRoundingBug is ON', () => {
  const built = buildPayPalOrderPayload({
    citizenId: 'omar',
    citizenName: 'Omar',
    bugFlags: { currencyRoundingBug: true },
    returnUrl: 'http://localhost:3000/paypal/return',
    cancelUrl: 'http://localhost:3000/paypal/cancel',
  });

  assert.equal(built.triggeredBugFlag, 'currencyRoundingBug');
  assert.equal(built.currency, 'JPY');
  const pu = (built.payload.purchase_units as Record<string, unknown>[])[0];
  const amount = pu.amount as { currency_code: string; value: string };
  assert.equal(amount.currency_code, 'JPY');
  assert.equal(amount.value, '12800.55');
});

test('evaluateWebhookDeduplication deduplicates when webhookDoubleCredit is OFF and double-credits when ON', () => {
  const seen = new Set<string>();

  const first = evaluateWebhookDeduplication('WH-101', seen, false);
  assert.equal(first.shouldProcess, true);
  assert.equal(first.isDuplicateCredit, false);

  const duplicateIdempotent = evaluateWebhookDeduplication('WH-101', seen, false);
  assert.equal(duplicateIdempotent.shouldProcess, false);
  assert.equal(duplicateIdempotent.isDuplicateCredit, false);

  const duplicateBugOn = evaluateWebhookDeduplication('WH-101', seen, true);
  assert.equal(duplicateBugOn.shouldProcess, true);
  assert.equal(duplicateBugOn.isDuplicateCredit, true);
});

test('generatePayPalRequestId generates unique idempotency headers unless duplicateSeed is provided', () => {
  const r1 = generatePayPalRequestId('orders');
  const r2 = generatePayPalRequestId('orders');
  assert.notEqual(r1, r2);

  const d1 = generatePayPalRequestId('orders', 'burst_seed');
  const d2 = generatePayPalRequestId('orders', 'burst_seed');
  assert.equal(d1, d2);
});

test('getCredentials resolves appUrl intelligently with override, RENDER_EXTERNAL_URL, and dynamic setAppUrl', () => {
  // Test 1: Explicit override
  const credsOverride = paypalSandboxManager.getCredentials('https://sandbox-city-kn6x.onrender.com');
  assert.equal(credsOverride.appUrl, 'https://sandbox-city-kn6x.onrender.com');

  // Test 2: Dynamic setAppUrl
  paypalSandboxManager.setAppUrl('https://my-custom-domain.com');
  const credsDynamic = paypalSandboxManager.getCredentials();
  assert.equal(credsDynamic.appUrl, 'https://my-custom-domain.com');

  // Test 3: RENDER_EXTERNAL_URL env var
  const origRender = process.env.RENDER_EXTERNAL_URL;
  try {
    process.env.RENDER_EXTERNAL_URL = 'https://render-test-app.onrender.com';
    const credsRender = paypalSandboxManager.getCredentials();
    assert.equal(credsRender.appUrl, 'https://render-test-app.onrender.com');
  } finally {
    if (origRender !== undefined) {
      process.env.RENDER_EXTERNAL_URL = origRender;
    } else {
      delete process.env.RENDER_EXTERNAL_URL;
    }
  }
});
