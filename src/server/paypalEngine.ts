import crypto from 'node:crypto';
import {
  ApiFallbackBanner,
  ApiServiceHealth,
  BuildingId,
  BugFlagKey,
  EventSource,
  EventType,
  HealthCheckResponse,
  PayPalApiServiceKey,
  SandboxEvent,
  SeededOrderItem,
} from '../types/sandbox';
import { formatSimClock } from '../utils/simulationEngine';
import { BUILDING_MAP, DAVE_DRAMATIC_COMPLAINTS } from '../utils/cityData';

/**
 * SAFETY RULE 1: Hard-code the base URL https://api-m.sandbox.paypal.com.
 * Refuse to start any call if the host is anything else.
 */
export const PAYPAL_SANDBOX_BASE_URL = 'https://api-m.sandbox.paypal.com';
export const DEFAULT_MAX_LIVE_CALLS = Number(process.env.MAX_LIVE_CALLS) || 100;

export function assertSafePayPalUrl(urlStr: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(urlStr);
  } catch {
    throw new Error(`Invalid PayPal URL: ${urlStr}`);
  }
  if (
    parsed.protocol !== 'https:' ||
    parsed.hostname !== 'api-m.sandbox.paypal.com' ||
    parsed.port !== ''
  ) {
    throw new Error(
      `SAFETY VIOLATION: Refusing to call non-sandbox host "${parsed.hostname}". Only https://api-m.sandbox.paypal.com is permitted.`
    );
  }
  return parsed;
}

export function generatePayPalRequestId(prefix = 'req', duplicateSeed?: string): string {
  if (duplicateSeed) {
    return `${prefix}_${duplicateSeed}`;
  }
  return `${prefix}_${Date.now()}_${crypto.randomBytes(6).toString('hex')}`;
}

/**
 * Pure builder for PayPal Orders v2 (`POST /v2/checkout/orders`) payload.
 * Intentionally alters the request body when Bug Lab flags are ON so PayPal's live
 * sandbox returns genuine 422 errors (`ITEM_TOTAL_MISMATCH` / `DECIMAL_PRECISION`).
 */
export function buildPayPalOrderPayload(options: {
  citizenId: string;
  citizenName: string;
  bugFlags: Partial<Record<BugFlagKey, boolean>>;
  returnUrl: string;
  cancelUrl: string;
  itemName?: string;
  baseAmountUsd?: number;
}): {
  payload: Record<string, unknown>;
  expectedAmount: number;
  currency: string;
  triggeredBugFlag?: BugFlagKey;
} {
  const {
    citizenId,
    bugFlags,
    returnUrl,
    cancelUrl,
    itemName = 'Retro Espresso Maker',
    baseAmountUsd = 54.0,
  } = options;

  // BUG LAB 2: currencyRoundingBug -> send decimals for zero-decimal currency JPY
  if (bugFlags.currencyRoundingBug && (citizenId === 'omar' || citizenId === 'bug_test_fx')) {
    return {
      currency: 'JPY',
      expectedAmount: 12800.55,
      triggeredBugFlag: 'currencyRoundingBug',
      payload: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: `PU_${citizenId.toUpperCase()}_JPY`,
            description: `${itemName} (Cross-Border JPY)`,
            items: [
              {
                name: itemName,
                quantity: '1',
                unit_amount: {
                  currency_code: 'JPY',
                  value: '12800.55', // Invalid decimal precision on zero-decimal JPY!
                },
              },
            ],
            amount: {
              currency_code: 'JPY',
              value: '12800.55',
              breakdown: {
                item_total: {
                  currency_code: 'JPY',
                  value: '12800.55',
                },
                shipping: {
                  currency_code: 'JPY',
                  value: '0',
                },
              },
            },
          },
        ],
        application_context: {
          brand_name: 'Sandbox City Flawed Shop',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      },
    };
  }

  // BUG LAB 1: hiddenShippingFee -> send shipping amount ("14.99") in breakdown that is NOT included in amount.value ("54.00")
  if (bugFlags.hiddenShippingFee && (citizenId === 'marge' || citizenId === 'bug_test_shipping')) {
    const itemVal = baseAmountUsd.toFixed(2);
    const shippingVal = '14.99';
    return {
      currency: 'USD',
      expectedAmount: Number((baseAmountUsd + 14.99).toFixed(2)),
      triggeredBugFlag: 'hiddenShippingFee',
      payload: {
        intent: 'CAPTURE',
        purchase_units: [
          {
            reference_id: `PU_${citizenId.toUpperCase()}_SHIP`,
            description: `${itemName} (+Unannounced $14.99 Shipping Fee)`,
            items: [
              {
                name: itemName,
                quantity: '1',
                unit_amount: {
                  currency_code: 'USD',
                  value: itemVal,
                },
              },
            ],
            amount: {
              currency_code: 'USD',
              value: itemVal, // Mismatch! Does not include the $14.99 shipping in breakdown!
              breakdown: {
                item_total: {
                  currency_code: 'USD',
                  value: itemVal,
                },
                shipping: {
                  currency_code: 'USD',
                  value: shippingVal,
                },
              },
            },
          },
        ],
        application_context: {
          brand_name: 'Sandbox City Flawed Shop',
          user_action: 'PAY_NOW',
          return_url: returnUrl,
          cancel_url: cancelUrl,
        },
      },
    };
  }

  // Standard valid Orders v2 payload with item_total, shipping, and matching breakdown
  const itemVal = baseAmountUsd.toFixed(2);
  const shippingVal = '0.00';
  const totalVal = baseAmountUsd.toFixed(2);

  return {
    currency: 'USD',
    expectedAmount: baseAmountUsd,
    triggeredBugFlag: undefined,
    payload: {
      intent: 'CAPTURE',
      purchase_units: [
        {
          reference_id: `PU_${citizenId.toUpperCase()}_OK`,
          description: `${itemName} — Sandbox City Order`,
          items: [
            {
              name: itemName,
              quantity: '1',
              unit_amount: {
                currency_code: 'USD',
                value: itemVal,
              },
            },
          ],
          amount: {
            currency_code: 'USD',
            value: totalVal,
            breakdown: {
              item_total: {
                currency_code: 'USD',
                value: itemVal,
              },
              shipping: {
                currency_code: 'USD',
                value: shippingVal,
              },
            },
          },
        },
      ],
      application_context: {
        brand_name: 'Sandbox City Flawed Shop',
        user_action: 'PAY_NOW',
        return_url: returnUrl,
        cancel_url: cancelUrl,
      },
    },
  };
}

/**
 * Pure webhook deduplication evaluator for BUG LAB 3 (`webhookDoubleCredit`).
 * When `webhookDoubleCredit` is false, duplicate event IDs are ignored (idempotent).
 * When `webhookDoubleCredit` is true, deduplication is bypassed so re-delivered webhooks credit twice.
 */
export function evaluateWebhookDeduplication(
  eventId: string,
  processedSet: Set<string>,
  webhookDoubleCredit: boolean
): { shouldProcess: boolean; isDuplicateCredit: boolean } {
  const alreadySeen = processedSet.has(eventId);
  if (alreadySeen && !webhookDoubleCredit) {
    return { shouldProcess: false, isDuplicateCredit: false };
  }
  processedSet.add(eventId);
  return {
    shouldProcess: true,
    isDuplicateCredit: alreadySeen && webhookDoubleCredit,
  };
}

// ============================================================================
// Server Runtime State (OAuth Cache, Rate Limiter, Captures, SSE Subscribers)
// ============================================================================

interface CachedOAuthToken {
  accessToken: string;
  expiresAtMs: number;
  debugId?: string;
}

class PayPalSandboxManager {
  private tokenCache: CachedOAuthToken | null = null;
  public liveCallsCount = 0;
  public maxLiveCalls = DEFAULT_MAX_LIVE_CALLS;
  public storedCaptures: {
    captureId: string;
    orderId: string;
    amount: string;
    currency: string;
    citizenName: string;
    refunded: boolean;
  }[] = [];
  public seededOrders: SeededOrderItem[] = [];
  public processedWebhookIds = new Set<string>();
  public fallbackBanners = new Map<PayPalApiServiceKey, ApiFallbackBanner>();
  public lastServiceHealth: Record<PayPalApiServiceKey, ApiServiceHealth> = {
    OAuth: { service: 'OAuth', status: 'Missing credentials', detail: 'Not tested yet' },
    Orders: { service: 'Orders', status: 'Missing credentials', detail: 'Not tested yet' },
    Invoicing: { service: 'Invoicing', status: 'Missing credentials', detail: 'Not tested yet' },
    Payouts: { service: 'Payouts', status: 'Missing credentials', detail: 'Not tested yet' },
    Disputes: { service: 'Disputes', status: 'Missing credentials', detail: 'Not tested yet' },
    Webhooks: { service: 'Webhooks', status: 'Missing credentials', detail: 'Not tested yet' },
  };
  private sseClients = new Set<(event: SandboxEvent) => void>();
  private eventSeq = 5000;
  private daveIdx = 0;
  private cachedAppUrl?: string;

  public setAppUrl(url: string): void {
    const cleaned = (url || '').trim().replace(/\/+$/, '');
    if (cleaned && !cleaned.includes('localhost') && !cleaned.includes('127.0.0.1')) {
      this.cachedAppUrl = cleaned;
    }
  }

  public getCredentials(customAppUrl?: string) {
    const clientId = (process.env.PAYPAL_CLIENT_ID || '').trim();
    const clientSecret = (process.env.PAYPAL_CLIENT_SECRET || '').trim();
    const webhookId = (process.env.PAYPAL_WEBHOOK_ID || '').trim();
    const payoutRecipientEmail = (process.env.PAYPAL_PAYOUT_RECIPIENT_EMAIL || '').trim();
    const buyerEmail = (process.env.PAYPAL_BUYER_EMAIL || '').trim();

    let configuredUrl = (process.env.APP_URL || '').trim();
    if (configuredUrl === 'MY_APP_URL') {
      configuredUrl = '';
    }

    const renderExternalUrl = (process.env.RENDER_EXTERNAL_URL || '').trim();
    const isProduction = process.env.NODE_ENV === 'production' || Boolean(process.env.RENDER);

    let appUrl = (
      customAppUrl ||
      configuredUrl ||
      renderExternalUrl ||
      this.cachedAppUrl ||
      (isProduction ? 'https://sandbox-city-kn6x.onrender.com' : '') ||
      `http://localhost:${process.env.PORT || 3000}`
    ).replace(/\/+$/, '');

    // In production or Render environments, never redirect PayPal to localhost
    if (isProduction && (appUrl.includes('localhost') || appUrl.includes('127.0.0.1'))) {
      appUrl = renderExternalUrl || 'https://sandbox-city-kn6x.onrender.com';
    }

    const hasClientCreds =
      Boolean(clientId) &&
      Boolean(clientSecret) &&
      clientId !== 'MY_PAYPAL_CLIENT_ID' &&
      clientSecret !== 'MY_PAYPAL_CLIENT_SECRET';

    return {
      clientId,
      clientSecret,
      webhookId,
      payoutRecipientEmail,
      buyerEmail,
      appUrl,
      hasClientCreds,
    };
  }

  public subscribeSSE(listener: (event: SandboxEvent) => void): () => void {
    this.sseClients.add(listener);
    return () => {
      this.sseClients.delete(listener);
    };
  }

  public emitEvent(
    partial: Omit<
      SandboxEvent,
      'id' | 'timestamp' | 'simDay' | 'simMinuteOfDay' | 'simTimeFormatted' | 'buildingName'
    > & {
      simDay?: number;
      simMinuteOfDay?: number;
    }
  ): SandboxEvent {
    this.eventSeq += 1;
    const simDay = partial.simDay ?? 5;
    const simMinuteOfDay = partial.simMinuteOfDay ?? 1125;
    const event: SandboxEvent = {
      id: `evt_srv_${this.eventSeq}`,
      timestamp: Date.now(),
      simDay,
      simMinuteOfDay,
      simTimeFormatted: formatSimClock(simDay, simMinuteOfDay),
      buildingName: BUILDING_MAP[partial.buildingId]?.name || 'The Flawed Shop',
      ...partial,
    };

    for (const listener of this.sseClients) {
      try {
        listener(event);
      } catch {
        // Ignore broken stream listener
      }
    }
    return event;
  }

  public recordFallback(service: PayPalApiServiceKey, reason: string) {
    this.fallbackBanners.set(service, {
      service,
      reason,
      timestamp: Date.now(),
    });
    this.lastServiceHealth[service] = {
      service,
      status: this.getCredentials().hasClientCreds ? 'Error' : 'Missing credentials',
      detail: reason,
    };
  }

  public clearFallbacksAndResetCounter() {
    this.liveCallsCount = 0;
    this.fallbackBanners.clear();
  }

  /**
   * Obtains and caches OAuth2 bearer token until expiry from https://api-m.sandbox.paypal.com/v1/oauth2/token
   */
  public async getAccessToken(forceRefresh = false): Promise<{
    ok: boolean;
    token?: string;
    debugId?: string;
    errorReason?: string;
    httpStatus: number;
    latencyMs: number;
  }> {
    const creds = this.getCredentials();
    if (!creds.hasClientCreds) {
      const reason =
        'PAYPAL_CLIENT_ID / PAYPAL_CLIENT_SECRET missing — falling back to SIMULATED mode.';
      this.recordFallback('OAuth', reason);
      return { ok: false, errorReason: reason, httpStatus: 401, latencyMs: 5 };
    }

    const now = Date.now();
    if (!forceRefresh && this.tokenCache && this.tokenCache.expiresAtMs > now + 30_000) {
      return {
        ok: true,
        token: this.tokenCache.accessToken,
        debugId: this.tokenCache.debugId,
        httpStatus: 200,
        latencyMs: 1,
      };
    }

    if (this.liveCallsCount >= this.maxLiveCalls) {
      const reason = `Live call cap reached (${this.liveCallsCount}/${this.maxLiveCalls}) — falling back to SIMULATED.`;
      this.recordFallback('OAuth', reason);
      return { ok: false, errorReason: reason, httpStatus: 429, latencyMs: 2 };
    }

    const url = `${PAYPAL_SANDBOX_BASE_URL}/v1/oauth2/token`;
    assertSafePayPalUrl(url);

    const startMs = Date.now();
    this.liveCallsCount += 1;

    try {
      const basicAuth = Buffer.from(`${creds.clientId}:${creds.clientSecret}`).toString('base64');
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${basicAuth}`,
          'Content-Type': 'application/x-www-form-urlencoded',
          'PayPal-Request-Id': generatePayPalRequestId('oauth'),
        },
        body: 'grant_type=client_credentials',
      });

      const latencyMs = Date.now() - startMs;
      const debugId = res.headers.get('paypal-debug-id') || undefined;
      const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;

      if (!res.ok || typeof data.access_token !== 'string') {
        const errName = String(data.error || data.name || `HTTP_${res.status}`);
        const errDesc = String(data.error_description || data.message || 'OAuth token failure');
        const reason = `OAuth failed (${errName}: ${errDesc})`;
        this.recordFallback('OAuth', reason);
        return {
          ok: false,
          debugId,
          errorReason: reason,
          httpStatus: res.status,
          latencyMs,
        };
      }

      const expiresInSec = Number(data.expires_in) || 3200;
      this.tokenCache = {
        accessToken: data.access_token,
        expiresAtMs: Date.now() + expiresInSec * 1000,
        debugId,
      };
      this.lastServiceHealth.OAuth = {
        service: 'OAuth',
        status: 'Connected',
        detail: `OAuth2 token cached (expires in ${Math.round(expiresInSec / 60)}m)`,
        paypalDebugId: debugId,
      };
      this.fallbackBanners.delete('OAuth');

      return {
        ok: true,
        token: data.access_token,
        debugId,
        httpStatus: res.status,
        latencyMs,
      };
    } catch (err) {
      const latencyMs = Date.now() - startMs;
      const reason = `OAuth network error: ${err instanceof Error ? err.message : String(err)}`;
      this.recordFallback('OAuth', reason);
      return { ok: false, errorReason: reason, httpStatus: 503, latencyMs };
    }
  }

  /**
   * Executes a live call against https://api-m.sandbox.paypal.com with safety host validation,
   * OAuth bearer token, unique PayPal-Request-Id on every POST, and PayPal-Debug-Id extraction.
   */
  public async callPayPalApi(options: {
    service: PayPalApiServiceKey;
    method: 'GET' | 'POST';
    path: string;
    body?: Record<string, unknown>;
    requestIdSeed?: string;
  }): Promise<{
    liveExecuted: boolean;
    ok: boolean;
    httpStatus: number;
    latencyMs: number;
    paypalDebugId?: string;
    paypalErrorName?: string;
    paypalErrorDetail?: string;
    data: Record<string, unknown>;
    fallbackReason?: string;
  }> {
    if (this.liveCallsCount >= this.maxLiveCalls) {
      const reason = `Live call cap (${this.maxLiveCalls}) reached for this run — falling back to SIMULATED.`;
      this.recordFallback(options.service, reason);
      return {
        liveExecuted: false,
        ok: false,
        httpStatus: 429,
        latencyMs: 4,
        data: {},
        fallbackReason: reason,
      };
    }

    const auth = await this.getAccessToken();
    if (!auth.ok || !auth.token) {
      this.recordFallback(options.service, auth.errorReason || 'OAuth unavailable');
      return {
        liveExecuted: false,
        ok: false,
        httpStatus: auth.httpStatus,
        latencyMs: auth.latencyMs,
        paypalDebugId: auth.debugId,
        data: {},
        fallbackReason: auth.errorReason,
      };
    }

    const fullUrl = `${PAYPAL_SANDBOX_BASE_URL}${options.path}`;
    assertSafePayPalUrl(fullUrl);

    const headers: Record<string, string> = {
      Authorization: `Bearer ${auth.token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    };
    if (options.method === 'POST') {
      headers['PayPal-Request-Id'] = generatePayPalRequestId(
        options.service.toLowerCase(),
        options.requestIdSeed
      );
    }

    const startMs = Date.now();
    this.liveCallsCount += 1;

    try {
      const res = await fetch(fullUrl, {
        method: options.method,
        headers,
        body: options.body ? JSON.stringify(options.body) : undefined,
      });

      const latencyMs = Date.now() - startMs;
      const paypalDebugId = res.headers.get('paypal-debug-id') || undefined;
      const text = await res.text();
      let data: Record<string, unknown> = {};
      if (text) {
        try {
          data = JSON.parse(text) as Record<string, unknown>;
        } catch {
          data = { raw: text };
        }
      }

      // Extract detailed PayPal error name/issue (e.g. ITEM_TOTAL_MISMATCH, DECIMAL_PRECISION)
      let paypalErrorName: string | undefined;
      let paypalErrorDetail: string | undefined;
      if (!res.ok) {
        const detailsArr = Array.isArray(data.details)
          ? (data.details as Record<string, unknown>[])
          : [];
        const firstIssue = detailsArr[0]?.issue ? String(detailsArr[0].issue) : undefined;
        const firstDesc = detailsArr[0]?.description
          ? String(detailsArr[0].description)
          : undefined;
        paypalErrorName = firstIssue || (data.name ? String(data.name) : `HTTP_${res.status}`);
        paypalErrorDetail =
          firstDesc || (data.message ? String(data.message) : `HTTP ${res.status}`);

        // On 401 or 403 auth/permission error, record fallback banner for that API
        if (res.status === 401 || res.status === 403) {
          const reason = `${options.service} API returned HTTP ${res.status} (${paypalErrorName}: ${paypalErrorDetail}). Falling back to SIMULATED.`;
          this.recordFallback(options.service, reason);
          return {
            liveExecuted: false,
            ok: false,
            httpStatus: res.status,
            latencyMs,
            paypalDebugId,
            paypalErrorName,
            paypalErrorDetail,
            data,
            fallbackReason: reason,
          };
        }
      } else {
        this.lastServiceHealth[options.service] = {
          service: options.service,
          status: 'Connected',
          detail: `Last live call HTTP ${res.status} (${latencyMs}ms)`,
          paypalDebugId,
        };
        this.fallbackBanners.delete(options.service);
      }

      return {
        liveExecuted: true,
        ok: res.ok,
        httpStatus: res.status,
        latencyMs,
        paypalDebugId,
        paypalErrorName,
        paypalErrorDetail,
        data,
      };
    } catch (err) {
      const latencyMs = Date.now() - startMs;
      const reason = `${options.service} network failure: ${err instanceof Error ? err.message : String(err)}`;
      this.recordFallback(options.service, reason);
      return {
        liveExecuted: false,
        ok: false,
        httpStatus: 503,
        latencyMs,
        data: {},
        fallbackReason: reason,
      };
    }
  }

  /**
   * 1. GET /api/health: tests OAuth and each API (Orders, Invoicing, Payouts, Disputes, Webhooks)
   */
  public async runHealthCheck(): Promise<HealthCheckResponse> {
    const creds = this.getCredentials();
    const webhookUrl = `${creds.appUrl}/api/webhooks/paypal`;

    if (!creds.hasClientCreds) {
      const missingServices: Record<PayPalApiServiceKey, ApiServiceHealth> = {
        OAuth: {
          service: 'OAuth',
          status: 'Missing credentials',
          detail: 'Set PAYPAL_CLIENT_ID and PAYPAL_CLIENT_SECRET in environment secrets.',
        },
        Orders: {
          service: 'Orders',
          status: 'Missing credentials',
          detail: 'Requires OAuth credentials (Demo Mode active).',
        },
        Invoicing: {
          service: 'Invoicing',
          status: 'Missing credentials',
          detail: 'Requires OAuth credentials (Demo Mode active).',
        },
        Payouts: {
          service: 'Payouts',
          status: 'Missing credentials',
          detail: creds.payoutRecipientEmail
            ? 'Requires OAuth credentials.'
            : 'Set PAYPAL_PAYOUT_RECIPIENT_EMAIL and OAuth credentials.',
        },
        Disputes: {
          service: 'Disputes',
          status: 'Missing credentials',
          detail: 'Requires OAuth credentials (Demo Mode active).',
        },
        Webhooks: {
          service: 'Webhooks',
          status: creds.webhookId ? 'Missing credentials' : 'Missing credentials',
          detail: creds.webhookId
            ? 'PAYPAL_WEBHOOK_ID configured; awaiting OAuth credentials.'
            : 'Set PAYPAL_WEBHOOK_ID to verify live webhook signatures.',
        },
      };
      this.lastServiceHealth = missingServices;
      return {
        ok: false,
        credentialsConfigured: false,
        buyerEmailConfigured: Boolean(creds.buyerEmail),
        payoutRecipientConfigured: Boolean(creds.payoutRecipientEmail),
        webhookIdConfigured: Boolean(creds.webhookId),
        liveCallsCount: this.liveCallsCount,
        maxLiveCalls: this.maxLiveCalls,
        storedCapturesCount: this.storedCaptures.filter((c) => !c.refunded).length,
        webhookUrl,
        services: missingServices,
        fallbackBanners: Array.from(this.fallbackBanners.values()),
      };
    }

    // Test OAuth first
    const oauthRes = await this.getAccessToken(true);
    if (!oauthRes.ok) {
      return {
        ok: false,
        credentialsConfigured: true,
        buyerEmailConfigured: Boolean(creds.buyerEmail),
        payoutRecipientConfigured: Boolean(creds.payoutRecipientEmail),
        webhookIdConfigured: Boolean(creds.webhookId),
        liveCallsCount: this.liveCallsCount,
        maxLiveCalls: this.maxLiveCalls,
        storedCapturesCount: this.storedCaptures.filter((c) => !c.refunded).length,
        webhookUrl,
        services: this.lastServiceHealth,
        fallbackBanners: Array.from(this.fallbackBanners.values()),
      };
    }

    // Probe Invoicing (next invoice number), Disputes (list), and Webhooks
    const invProbe = await this.callPayPalApi({
      service: 'Invoicing',
      method: 'POST',
      path: '/v2/invoicing/generate-next-invoice-number',
    });
    if (invProbe.liveExecuted && invProbe.ok) {
      this.lastServiceHealth.Invoicing = {
        service: 'Invoicing',
        status: 'Connected',
        detail: `Ready (next invoice #${String(invProbe.data.invoice_number || 'INV-001')})`,
        paypalDebugId: invProbe.paypalDebugId,
      };
    }

    const dispProbe = await this.callPayPalApi({
      service: 'Disputes',
      method: 'GET',
      path: '/v1/customer/disputes?page_size=1',
    });
    if (dispProbe.liveExecuted && dispProbe.ok) {
      const items = Array.isArray(dispProbe.data.items) ? dispProbe.data.items : [];
      this.lastServiceHealth.Disputes = {
        service: 'Disputes',
        status: 'Connected',
        detail: `Read-only active (${items.length} sandbox disputes found)`,
        paypalDebugId: dispProbe.paypalDebugId,
      };
    }

    this.lastServiceHealth.Orders = {
      service: 'Orders',
      status: 'Connected',
      detail: 'Orders v2 (/v2/checkout/orders) ready',
      paypalDebugId: oauthRes.debugId,
    };

    this.lastServiceHealth.Payouts = {
      service: 'Payouts',
      status: creds.payoutRecipientEmail ? 'Connected' : 'Missing credentials',
      detail: creds.payoutRecipientEmail
        ? `Ready for recipient ${creds.payoutRecipientEmail}`
        : 'PAYPAL_PAYOUT_RECIPIENT_EMAIL not set; will use sandbox fallback or SIMULATED.',
    };

    this.lastServiceHealth.Webhooks = {
      service: 'Webhooks',
      status: creds.webhookId ? 'Connected' : 'Missing credentials',
      detail: creds.webhookId
        ? `Webhook verification ready (${creds.webhookId})`
        : 'PAYPAL_WEBHOOK_ID not set; signature verification will log warning.',
    };

    return {
      ok: true,
      credentialsConfigured: true,
      buyerEmailConfigured: Boolean(creds.buyerEmail),
      payoutRecipientConfigured: Boolean(creds.payoutRecipientEmail),
      webhookIdConfigured: Boolean(creds.webhookId),
      liveCallsCount: this.liveCallsCount,
      maxLiveCalls: this.maxLiveCalls,
      storedCapturesCount: this.storedCaptures.filter((c) => !c.refunded).length,
      webhookUrl,
      services: this.lastServiceHealth,
      fallbackBanners: Array.from(this.fallbackBanners.values()),
    };
  }

  /**
   * 2. ORDERS: POST /api/orders
   * Creates a real order (Orders v2, intent CAPTURE, item_total, shipping, breakdown).
   * Handles Bug Lab real failures (`hiddenShippingFee`, `currencyRoundingBug`) and Bot Ring 5x burst.
   */
  public async handleCreateOrder(params: {
    citizenId: string;
    citizenName: string;
    bugFlags: Partial<Record<BugFlagKey, boolean>>;
    isBotBurst?: boolean;
    simDay?: number;
    simMinuteOfDay?: number;
    appUrl?: string;
  }): Promise<{
    events: SandboxEvent[];
    approveUrl?: string;
    orderId?: string;
    liveCallsCount: number;
    fallbackBanners: ApiFallbackBanner[];
  }> {
    const creds = this.getCredentials(params.appUrl);
    const { citizenId, citizenName, bugFlags, isBotBurst } = params;
    const emitted: SandboxEvent[] = [];

    // Bot Ring: capped burst of 5 rapid order creations with the same payload to trigger duplicate-detection logic
    if (citizenId === 'bot_ring' || isBotBurst) {
      const sharedSeed = `bot_burst_${Math.floor(Date.now() / 10000)}`;
      const { payload } = buildPayPalOrderPayload({
        citizenId: 'bot_ring',
        citizenName: 'The Bot Ring',
        bugFlags: {},
        returnUrl: `${creds.appUrl}/paypal/return`,
        cancelUrl: `${creds.appUrl}/paypal/cancel`,
        itemName: 'Card-Testing $1.00 Probe Item',
        baseAmountUsd: 1.0,
      });

      for (let i = 0; i < 5; i++) {
        const apiRes = await this.callPayPalApi({
          service: 'Orders',
          method: 'POST',
          path: '/v2/checkout/orders',
          body: payload,
          requestIdSeed: i > 0 ? sharedSeed : `${sharedSeed}_0`,
        });

        const source: EventSource = apiRes.liveExecuted ? 'LIVE_SANDBOX' : 'SIMULATED';
        const status = apiRes.liveExecuted ? apiRes.httpStatus : i >= 2 ? 429 : 201;
        emitted.push(
          this.emitEvent({
            citizenId: 'bot_ring',
            citizenName: 'The Bot Ring',
            buildingId: 'flawed_shop',
            type: status >= 400 ? 'abandon' : 'add_to_cart',
            paypalApi: 'POST /v2/checkout/orders',
            source,
            httpStatus: status,
            latencyMs: apiRes.latencyMs,
            amount: 1.0,
            currency: 'USD',
            paypalDebugId: apiRes.paypalDebugId,
            paypalErrorName:
              apiRes.paypalErrorName || (status === 429 ? 'DUPLICATE_REQUEST_ID' : undefined),
            bugFlag: bugFlags.couponStackingBug ? 'couponStackingBug' : undefined,
            flagsInvolved: bugFlags.couponStackingBug ? ['couponStackingBug'] : [],
            rawResponseStatus: `${status} (Burst #${i + 1}/5)`,
            summary:
              source === 'LIVE_SANDBOX'
                ? `Bot Ring rapid order burst #${i + 1}/5: HTTP ${status}${apiRes.paypalDebugId ? ` (debug ID ${apiRes.paypalDebugId})` : ''}`
                : `[SIMULATED] Bot Ring velocity probe #${i + 1}/5 (${apiRes.fallbackReason || 'duplicate payload throttle'})`,
            simDay: params.simDay,
            simMinuteOfDay: params.simMinuteOfDay,
          })
        );
      }

      return {
        events: emitted,
        liveCallsCount: this.liveCallsCount,
        fallbackBanners: Array.from(this.fallbackBanners.values()),
      };
    }

    // Standard Citizen Order (Marge, Luna, Omar, Grandpa Joe)
    const itemByCitizen: Record<string, { name: string; price: number }> = {
      marge: { name: 'Retro Espresso Maker', price: 54.0 },
      luna: { name: 'Studio USB-C Microphone', price: 84.0 },
      omar: { name: 'Limited Edition Sneakers', price: 94.5 },
      joe: { name: 'Orthopedic Wool Slippers', price: 38.0 },
    };
    const itemSpec = itemByCitizen[citizenId] || { name: 'Sandbox City Gadget', price: 49.0 };

    const built = buildPayPalOrderPayload({
      citizenId,
      citizenName,
      bugFlags,
      returnUrl: `${creds.appUrl}/paypal/return`,
      cancelUrl: `${creds.appUrl}/paypal/cancel`,
      itemName: itemSpec.name,
      baseAmountUsd: itemSpec.price,
    });

    const apiRes = await this.callPayPalApi({
      service: 'Orders',
      method: 'POST',
      path: '/v2/checkout/orders',
      body: built.payload,
    });

    if (apiRes.liveExecuted) {
      const orderId = typeof apiRes.data.id === 'string' ? apiRes.data.id : undefined;
      const links = Array.isArray(apiRes.data.links)
        ? (apiRes.data.links as Record<string, unknown>[])
        : [];
      const approveLinkObj = links.find(
        (l) => l.rel === 'approve' || l.rel === 'payer-action'
      );
      const approveUrl =
        typeof approveLinkObj?.href === 'string' ? approveLinkObj.href : undefined;

      if (!apiRes.ok) {
        // Real PayPal 422 failure (e.g. ITEM_TOTAL_MISMATCH or DECIMAL_PRECISION)!
        const errName = apiRes.paypalErrorName || 'UNPROCESSABLE_ENTITY';
        const ev = this.emitEvent({
          citizenId,
          citizenName,
          buildingId: 'flawed_shop',
          type: 'abandon',
          paypalApi: 'POST /v2/checkout/orders',
          source: 'LIVE_SANDBOX',
          httpStatus: apiRes.httpStatus,
          latencyMs: apiRes.latencyMs,
          amount: built.expectedAmount,
          currency: built.currency,
          paypalDebugId: apiRes.paypalDebugId,
          paypalErrorName: errName,
          bugFlag: built.triggeredBugFlag,
          flagsInvolved: built.triggeredBugFlag ? [built.triggeredBugFlag] : [],
          rawResponseStatus: `HTTP ${apiRes.httpStatus} ${errName}`,
          abandonStep:
            built.triggeredBugFlag === 'currencyRoundingBug'
              ? 'FX Conversion'
              : 'Shipping Step',
          summary: `Real PayPal error: ${errName}, debug ID ${apiRes.paypalDebugId || 'n/a'} — ${apiRes.paypalErrorDetail || 'Order rejected by PayPal'}`,
          simDay: params.simDay,
          simMinuteOfDay: params.simMinuteOfDay,
        });
        emitted.push(ev);
      } else {
        // Live ORDER_CREATED succeeded!
        const createdEv = this.emitEvent({
          citizenId,
          citizenName,
          buildingId: 'flawed_shop',
          type: 'add_to_cart',
          paypalApi: 'POST /v2/checkout/orders',
          source: 'LIVE_SANDBOX',
          httpStatus: apiRes.httpStatus,
          latencyMs: apiRes.latencyMs,
          amount: built.expectedAmount,
          currency: built.currency,
          paypalDebugId: apiRes.paypalDebugId,
          orderId,
          approveUrl,
          rawResponseStatus: `HTTP ${apiRes.httpStatus} ORDER_CREATED (${orderId})`,
          summary: `${citizenName} created LIVE PayPal order ${orderId} ($${built.expectedAmount.toFixed(2)}) — debug ID ${apiRes.paypalDebugId || 'n/a'}.`,
          flagsInvolved: [],
          simDay: params.simDay,
          simMinuteOfDay: params.simMinuteOfDay,
        });
        emitted.push(createdEv);

        if (orderId && approveUrl) {
          this.seededOrders.unshift({
            orderId,
            citizenName,
            description: itemSpec.name,
            amount: built.expectedAmount.toFixed(2),
            currency: built.currency,
            approveUrl,
            source: 'LIVE_SANDBOX',
            paypalDebugId: apiRes.paypalDebugId,
            status: 'CREATED',
          });
          this.seededOrders = this.seededOrders.slice(0, 12);
        }

        // Citizen buyer-approval step cannot be automated without buyer login -> emit SIMULATED approval step
        const isPayLaterSimFail =
          citizenId === 'luna' && Boolean(bugFlags.payLaterBrokenOnMobile);
        const simFollowUp = this.emitEvent({
          citizenId,
          citizenName,
          buildingId: 'flawed_shop',
          type: isPayLaterSimFail ? 'abandon' : 'pay',
          paypalApi: `POST /v2/checkout/orders/${orderId || 'ORD'}/capture`,
          source: 'SIMULATED',
          httpStatus: isPayLaterSimFail ? 422 : 200,
          latencyMs: 180,
          amount: built.expectedAmount,
          currency: built.currency,
          bugFlag: isPayLaterSimFail ? 'payLaterBrokenOnMobile' : undefined,
          flagsInvolved: isPayLaterSimFail ? ['payLaterBrokenOnMobile'] : [],
          abandonStep: isPayLaterSimFail ? 'Pay Later Modal' : undefined,
          summary: isPayLaterSimFail
            ? `[SIMULATED Approval Step] Luna abandoned order ${orderId}: Mobile Pay Later callback crashed!`
            : `[SIMULATED Approval Step] ${citizenName} simulated buyer approval for order ${orderId} (use "Seed live purchases" to approve & capture as a real buyer).`,
          simDay: params.simDay,
          simMinuteOfDay: params.simMinuteOfDay,
        });
        emitted.push(simFollowUp);
      }

      return {
        events: emitted,
        approveUrl,
        orderId,
        liveCallsCount: this.liveCallsCount,
        fallbackBanners: Array.from(this.fallbackBanners.values()),
      };
    }

    // Fallback: SIMULATED order creation (when credentials missing or rate-limited)
    const isFail = Boolean(built.triggeredBugFlag);
    const simErrorName =
      built.triggeredBugFlag === 'hiddenShippingFee'
        ? 'ITEM_TOTAL_MISMATCH'
        : built.triggeredBugFlag === 'currencyRoundingBug'
          ? 'DECIMAL_PRECISION'
          : undefined;

    const simEv = this.emitEvent({
      citizenId,
      citizenName,
      buildingId: 'flawed_shop',
      type: isFail ? 'abandon' : 'pay',
      paypalApi: 'POST /v2/checkout/orders',
      source: 'SIMULATED',
      httpStatus: isFail ? 422 : 201,
      latencyMs: 145,
      amount: built.expectedAmount,
      currency: built.currency,
      paypalErrorName: simErrorName,
      bugFlag: built.triggeredBugFlag,
      flagsInvolved: built.triggeredBugFlag ? [built.triggeredBugFlag] : [],
      abandonStep:
        built.triggeredBugFlag === 'currencyRoundingBug'
          ? 'FX Conversion'
          : built.triggeredBugFlag === 'hiddenShippingFee'
            ? 'Shipping Step'
            : undefined,
      summary: isFail
        ? `[SIMULATED] ${citizenName} order rejected with 422 ${simErrorName} (${built.triggeredBugFlag} active)`
        : `[SIMULATED] ${citizenName} created & paid order ($${built.expectedAmount.toFixed(2)} ${built.currency})`,
      simDay: params.simDay,
      simMinuteOfDay: params.simMinuteOfDay,
    });
    emitted.push(simEv);

    return {
      events: emitted,
      liveCallsCount: this.liveCallsCount,
      fallbackBanners: Array.from(this.fallbackBanners.values()),
    };
  }

  /**
   * "Seed live purchases" panel: creates 4 real orders and returns approval links
   * so the user can open them as the sandbox buyer and trigger /paypal/return capture.
   */
  public async seedLivePurchases(customAppUrl?: string): Promise<{
    orders: SeededOrderItem[];
    events: SandboxEvent[];
    liveCallsCount: number;
    fallbackBanners: ApiFallbackBanner[];
  }> {
    const creds = this.getCredentials(customAppUrl);
    const specs = [
      { citizenId: 'marge', citizenName: 'Marge', item: 'Retro Espresso Maker', amount: 54.0 },
      { citizenId: 'luna', citizenName: 'Luna', item: 'Studio USB-C Microphone', amount: 84.0 },
      { citizenId: 'omar', citizenName: 'Omar', item: 'Global Collector Sneakers', amount: 94.5 },
      { citizenId: 'joe', citizenName: 'Grandpa Joe', item: 'Orthopedic Wool Slippers', amount: 38.0 },
    ];

    const createdItems: SeededOrderItem[] = [];
    const emitted: SandboxEvent[] = [];

    for (const spec of specs) {
      const built = buildPayPalOrderPayload({
        citizenId: spec.citizenId,
        citizenName: spec.citizenName,
        bugFlags: {},
        returnUrl: `${creds.appUrl}/paypal/return`,
        cancelUrl: `${creds.appUrl}/paypal/cancel`,
        itemName: spec.item,
        baseAmountUsd: spec.amount,
      });

      const apiRes = await this.callPayPalApi({
        service: 'Orders',
        method: 'POST',
        path: '/v2/checkout/orders',
        body: built.payload,
      });

      if (apiRes.liveExecuted && apiRes.ok && typeof apiRes.data.id === 'string') {
        const orderId = apiRes.data.id;
        const links = Array.isArray(apiRes.data.links)
          ? (apiRes.data.links as Record<string, unknown>[])
          : [];
        const approveObj = links.find((l) => l.rel === 'approve' || l.rel === 'payer-action');
        const approveUrl =
          typeof approveObj?.href === 'string'
            ? approveObj.href
            : `https://www.sandbox.paypal.com/checkoutnow?token=${orderId}`;

        const item: SeededOrderItem = {
          orderId,
          citizenName: spec.citizenName,
          description: spec.item,
          amount: spec.amount.toFixed(2),
          currency: 'USD',
          approveUrl,
          source: 'LIVE_SANDBOX',
          paypalDebugId: apiRes.paypalDebugId,
          status: 'CREATED',
        };
        createdItems.push(item);
        this.seededOrders.unshift(item);

        emitted.push(
          this.emitEvent({
            citizenId: spec.citizenId,
            citizenName: spec.citizenName,
            buildingId: 'flawed_shop',
            type: 'add_to_cart',
            paypalApi: 'POST /v2/checkout/orders',
            source: 'LIVE_SANDBOX',
            httpStatus: apiRes.httpStatus,
            latencyMs: apiRes.latencyMs,
            amount: spec.amount,
            currency: 'USD',
            paypalDebugId: apiRes.paypalDebugId,
            orderId,
            approveUrl,
            rawResponseStatus: `HTTP ${apiRes.httpStatus} ORDER_CREATED`,
            summary: `Seeded LIVE purchase ${orderId} for ${spec.citizenName} ($${spec.amount.toFixed(2)}) — ready for buyer approval.`,
            flagsInvolved: [],
          })
        );
      } else {
        const mockOrderId = `SIM-ORD-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
        const item: SeededOrderItem = {
          orderId: mockOrderId,
          citizenName: spec.citizenName,
          description: `${spec.item} (Simulated Seed)`,
          amount: spec.amount.toFixed(2),
          currency: 'USD',
          approveUrl: `${creds.appUrl}/paypal/return?token=${mockOrderId}&simulated=1`,
          source: 'SIMULATED',
          paypalDebugId: apiRes.paypalDebugId,
          status: 'SIMULATED',
        };
        createdItems.push(item);
        this.seededOrders.unshift(item);

        emitted.push(
          this.emitEvent({
            citizenId: spec.citizenId,
            citizenName: spec.citizenName,
            buildingId: 'flawed_shop',
            type: 'add_to_cart',
            paypalApi: 'POST /v2/checkout/orders',
            source: 'SIMULATED',
            httpStatus: 201,
            latencyMs: apiRes.latencyMs || 120,
            amount: spec.amount,
            currency: 'USD',
            orderId: mockOrderId,
            summary: `[SIMULATED] Seeded order ${mockOrderId} for ${spec.citizenName} ($${spec.amount.toFixed(2)}) — ${apiRes.fallbackReason || 'OAuth credentials not configured'}.`,
            flagsInvolved: [],
          })
        );
      }
    }

    this.seededOrders = this.seededOrders.slice(0, 12);
    return {
      orders: createdItems,
      events: emitted,
      liveCallsCount: this.liveCallsCount,
      fallbackBanners: Array.from(this.fallbackBanners.values()),
    };
  }

  /**
   * Captures an approved order on return from `/paypal/return?token={orderId}`
   * (`POST /v2/checkout/orders/{id}/capture`), stores the capture ID, and emits a LIVE capture event.
   */
  public async captureApprovedOrder(
    orderId: string,
    isSimulatedQuery = false
  ): Promise<{
    ok: boolean;
    source: EventSource;
    captureId?: string;
    paypalDebugId?: string;
    event: SandboxEvent;
  }> {
    const matchingSeed = this.seededOrders.find((o) => o.orderId === orderId);
    const citizenName = matchingSeed?.citizenName || 'Marge';
    const citizenId = citizenName.toLowerCase().includes('luna')
      ? 'luna'
      : citizenName.toLowerCase().includes('omar')
        ? 'omar'
        : citizenName.toLowerCase().includes('joe')
          ? 'joe'
          : 'marge';
    const amountNum = Number(matchingSeed?.amount || 54.0);

    if (!isSimulatedQuery && !orderId.startsWith('SIM-')) {
      const apiRes = await this.callPayPalApi({
        service: 'Orders',
        method: 'POST',
        path: `/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`,
        body: {},
      });

      if (apiRes.liveExecuted) {
        // Extract capture ID and amount from purchase_units[0].payments.captures[0]
        const pus = Array.isArray(apiRes.data.purchase_units)
          ? (apiRes.data.purchase_units as Record<string, unknown>[])
          : [];
        const payments = (pus[0]?.payments || {}) as Record<string, unknown>;
        const captures = Array.isArray(payments.captures)
          ? (payments.captures as Record<string, unknown>[])
          : [];
        const captureObj = (captures[0] || {}) as Record<string, unknown>;
        const captureId =
          typeof captureObj.id === 'string' ? captureObj.id : `CAP_${orderId}`;
        const captureAmountObj = captureObj.amount as Record<string, string> | undefined;
        const capturedAmountNum = captureAmountObj?.value ? Number(captureAmountObj.value) : amountNum;
        const capturedCurrency = captureAmountObj?.currency_code || 'USD';

        const isAlreadyCaptured = apiRes.paypalErrorName === 'ORDER_ALREADY_CAPTURED';
        const captureSuccess = apiRes.ok || isAlreadyCaptured;

        if (captureSuccess) {
          this.storedCaptures.unshift({
            captureId,
            orderId,
            amount: capturedAmountNum.toFixed(2),
            currency: capturedCurrency,
            citizenName,
            refunded: false,
          });
          if (matchingSeed) {
            matchingSeed.status = 'CAPTURED';
            matchingSeed.captureId = captureId;
          }
        }

        const ev = this.emitEvent({
          citizenId,
          citizenName,
          buildingId: 'bank_tower',
          type: captureSuccess ? 'pay' : 'abandon',
          paypalApi: `POST /v2/checkout/orders/${orderId}/capture`,
          source: 'LIVE_SANDBOX',
          httpStatus: apiRes.httpStatus,
          latencyMs: apiRes.latencyMs,
          amount: capturedAmountNum,
          currency: capturedCurrency,
          paypalDebugId: apiRes.paypalDebugId,
          paypalErrorName: apiRes.paypalErrorName,
          orderId,
          captureId: captureSuccess ? captureId : undefined,
          rawResponseStatus: `HTTP ${apiRes.httpStatus} ${captureSuccess ? 'COMPLETED' : apiRes.paypalErrorName || 'FAILED'}`,
          summary: apiRes.ok
            ? `LIVE order ${orderId} captured (Capture ID ${captureId}, $${capturedAmountNum.toFixed(2)} ${capturedCurrency}) — debug ID ${apiRes.paypalDebugId || 'n/a'}.`
            : isAlreadyCaptured
              ? `LIVE order ${orderId} has already been captured and processed.`
              : `Real PayPal capture error on ${orderId}: ${apiRes.paypalErrorName || apiRes.httpStatus} (debug ID ${apiRes.paypalDebugId || 'n/a'}).`,
          flagsInvolved: [],
        });

        return {
          ok: captureSuccess,
          source: 'LIVE_SANDBOX',
          captureId,
          paypalDebugId: apiRes.paypalDebugId,
          event: ev,
        };
      }
    }

    // Simulated return capture
    const simEv = this.emitEvent({
      citizenId,
      citizenName,
      buildingId: 'bank_tower',
      type: 'pay',
      paypalApi: `POST /v2/checkout/orders/${orderId}/capture`,
      source: 'SIMULATED',
      httpStatus: 200,
      latencyMs: 165,
      amount: amountNum,
      currency: 'USD',
      orderId,
      summary: `[SIMULATED] Captured order ${orderId} ($${amountNum.toFixed(2)}) in Demo Mode.`,
      flagsInvolved: [],
    });

    return {
      ok: true,
      source: 'SIMULATED',
      event: simEv,
    };
  }

  /**
   * 3. REFUNDS: POST /api/refunds (Gus)
   * Refunds a stored real capture (`POST /v2/payments/captures/{id}/refund`).
   * If no real capture exists, emits SIMULATED.
   */
  public async handleRefund(): Promise<{
    event: SandboxEvent;
    liveCallsCount: number;
    fallbackBanners: ApiFallbackBanner[];
  }> {
    const targetCapture = this.storedCaptures.find((c) => !c.refunded);

    if (targetCapture) {
      const apiRes = await this.callPayPalApi({
        service: 'Orders',
        method: 'POST',
        path: `/v2/payments/captures/${encodeURIComponent(targetCapture.captureId)}/refund`,
        body: {
          amount: {
            value: targetCapture.amount,
            currency_code: targetCapture.currency,
          },
          note_to_payer: 'Gus requested refund after weekend testing in Sandbox City',
        },
      });

      if (apiRes.liveExecuted) {
        if (apiRes.ok) {
          targetCapture.refunded = true;
        }
        const ev = this.emitEvent({
          citizenId: 'gus',
          citizenName: 'Gus',
          buildingId: 'flawed_shop',
          type: 'refund_request',
          paypalApi: `POST /v2/payments/captures/${targetCapture.captureId}/refund`,
          source: 'LIVE_SANDBOX',
          httpStatus: apiRes.httpStatus,
          latencyMs: apiRes.latencyMs,
          amount: Number(targetCapture.amount),
          currency: targetCapture.currency,
          paypalDebugId: apiRes.paypalDebugId,
          paypalErrorName: apiRes.paypalErrorName,
          captureId: targetCapture.captureId,
          rawResponseStatus: `HTTP ${apiRes.httpStatus}`,
          summary: apiRes.ok
            ? `Gus refunded LIVE capture ${targetCapture.captureId} ($${targetCapture.amount}) — debug ID ${apiRes.paypalDebugId || 'n/a'}.`
            : `Real PayPal refund error on ${targetCapture.captureId}: ${apiRes.paypalErrorName} (debug ID ${apiRes.paypalDebugId || 'n/a'}).`,
          flagsInvolved: [],
        });

        return {
          event: ev,
          liveCallsCount: this.liveCallsCount,
          fallbackBanners: Array.from(this.fallbackBanners.values()),
        };
      }
    }

    // No stored live capture available -> emit SIMULATED as required
    const simEv = this.emitEvent({
      citizenId: 'gus',
      citizenName: 'Gus',
      buildingId: 'flawed_shop',
      type: 'refund_request',
      paypalApi: 'POST /v2/payments/captures/SIM-CAP-882/refund',
      source: 'SIMULATED',
      httpStatus: 201,
      latencyMs: 210,
      amount: 46.0,
      currency: 'USD',
      summary:
        '[SIMULATED] Gus requested $46.00 refund (no real captured order stored yet — approve a Seeded Live Purchase first for a LIVE refund).',
      flagsInvolved: [],
    });

    return {
      event: simEv,
      liveCallsCount: this.liveCallsCount,
      fallbackBanners: Array.from(this.fallbackBanners.values()),
    };
  }

  /**
   * 4. INVOICING (Rent Office / Priya):
   * Generates next invoice number -> creates draft invoice -> sends it -> records a payment
   * (`POST /v2/invoicing/invoices/{id}/payments`) so the invoice becomes PAID without a buyer. All LIVE.
   */
  public async handleRentInvoice(): Promise<{
    events: SandboxEvent[];
    liveCallsCount: number;
    fallbackBanners: ApiFallbackBanner[];
  }> {
    const creds = this.getCredentials();
    const emitted: SandboxEvent[] = [];

    // Step 1: Generate next invoice number
    const numRes = await this.callPayPalApi({
      service: 'Invoicing',
      method: 'POST',
      path: '/v2/invoicing/generate-next-invoice-number',
    });

    if (!numRes.liveExecuted || !numRes.ok) {
      const simEv = this.emitEvent({
        citizenId: 'priya',
        citizenName: 'Priya',
        buildingId: 'rent_office',
        type: 'invoice_paid',
        paypalApi: 'POST /v2/invoicing/invoices/{id}/payments',
        source: 'SIMULATED',
        httpStatus: 200,
        latencyMs: 185,
        amount: 95.0,
        currency: 'USD',
        summary: `[SIMULATED] Priya paid Friday rent invoice ($95.00) at Rent Office (${numRes.fallbackReason || 'Invoicing fallback'}).`,
        flagsInvolved: [],
      });
      return {
        events: [simEv],
        liveCallsCount: this.liveCallsCount,
        fallbackBanners: Array.from(this.fallbackBanners.values()),
      };
    }

    const invoiceNumber =
      typeof numRes.data.invoice_number === 'string'
        ? numRes.data.invoice_number
        : `INV-${Date.now().toString().slice(-5)}`;

    // Step 2: Create draft invoice (Invoicing v2)
    const createRes = await this.callPayPalApi({
      service: 'Invoicing',
      method: 'POST',
      path: '/v2/invoicing/invoices',
      body: {
        detail: {
          invoice_number: invoiceNumber,
          currency_code: 'USD',
          note: 'Sandbox City Friday Rent Invoice for Priya',
        },
        primary_recipients: [
          {
            billing_info: {
              email_address: creds.buyerEmail || 'priya.buyer@sandbox.example.com',
            },
          },
        ],
        items: [
          {
            name: 'Sandbox City Studio Apartment Weekly Rent',
            quantity: '1',
            unit_amount: {
              currency_code: 'USD',
              value: '95.00',
            },
          },
        ],
      },
    });

    // Extract invoice ID from response id or href
    let invoiceId = typeof createRes.data.id === 'string' ? createRes.data.id : undefined;
    if (!invoiceId && typeof createRes.data.href === 'string') {
      const parts = createRes.data.href.split('/');
      invoiceId = parts[parts.length - 1];
    }

    if (!createRes.liveExecuted || !createRes.ok || !invoiceId) {
      emitted.push(
        this.emitEvent({
          citizenId: 'priya',
          citizenName: 'Priya',
          buildingId: 'rent_office',
          type: 'invoice_paid',
          paypalApi: 'POST /v2/invoicing/invoices',
          source: createRes.liveExecuted ? 'LIVE_SANDBOX' : 'SIMULATED',
          httpStatus: createRes.httpStatus,
          latencyMs: createRes.latencyMs,
          amount: 95.0,
          currency: 'USD',
          paypalDebugId: createRes.paypalDebugId,
          paypalErrorName: createRes.paypalErrorName,
          summary: createRes.liveExecuted
            ? `Real PayPal Invoicing error: ${createRes.paypalErrorName || createRes.httpStatus} (debug ID ${createRes.paypalDebugId || 'n/a'})`
            : `[SIMULATED] Priya paid Friday rent invoice ($95.00)`,
          flagsInvolved: [],
        })
      );
      return {
        events: emitted,
        liveCallsCount: this.liveCallsCount,
        fallbackBanners: Array.from(this.fallbackBanners.values()),
      };
    }

    // Step 3: Send the invoice
    await this.callPayPalApi({
      service: 'Invoicing',
      method: 'POST',
      path: `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/send`,
      body: { send_to_recipient: false, send_to_invoicer: false },
    });

    // Step 4: Record payment so the invoice becomes PAID without a buyer
    const todayIso = new Date().toISOString().slice(0, 10);
    const payRes = await this.callPayPalApi({
      service: 'Invoicing',
      method: 'POST',
      path: `/v2/invoicing/invoices/${encodeURIComponent(invoiceId)}/payments`,
      body: {
        method: 'CASH',
        payment_date: todayIso,
        amount: {
          currency_code: 'USD',
          value: '95.00',
        },
        note: 'Priya paid Friday rent invoice at Rent Office',
      },
    });

    emitted.push(
      this.emitEvent({
        citizenId: 'priya',
        citizenName: 'Priya',
        buildingId: 'rent_office',
        type: 'invoice_paid',
        paypalApi: `POST /v2/invoicing/invoices/${invoiceId}/payments`,
        source: payRes.liveExecuted ? 'LIVE_SANDBOX' : 'SIMULATED',
        httpStatus: payRes.httpStatus,
        latencyMs: numRes.latencyMs + createRes.latencyMs + payRes.latencyMs,
        amount: 95.0,
        currency: 'USD',
        paypalDebugId: payRes.paypalDebugId || createRes.paypalDebugId,
        paypalErrorName: payRes.paypalErrorName,
        rawResponseStatus: `HTTP ${payRes.httpStatus} INVOICE_PAID (${invoiceNumber})`,
        summary: `Priya paid LIVE invoice ${invoiceNumber} (${invoiceId}, $95.00) -> status PAID (debug ID ${payRes.paypalDebugId || createRes.paypalDebugId || 'n/a'}).`,
        flagsInvolved: [],
      })
    );

    return {
      events: emitted,
      liveCallsCount: this.liveCallsCount,
      fallbackBanners: Array.from(this.fallbackBanners.values()),
    };
  }

  /**
   * 5. PAYOUTS (Gig Hub / Priya):
   * POST /v1/payments/payouts to PAYPAL_PAYOUT_RECIPIENT_EMAIL with sender_batch_header,
   * then polls GET /v1/payments/payouts/{batch_id}. Falls back to SIMULATED if account lacks Payouts access.
   */
  public async handlePayout(bugFlags: Partial<Record<BugFlagKey, boolean>>): Promise<{
    event: SandboxEvent;
    liveCallsCount: number;
    fallbackBanners: ApiFallbackBanner[];
  }> {
    const creds = this.getCredentials();
    const recipient = creds.payoutRecipientEmail || 'courier-payout@sandbox.paypal.com';
    const batchIdSeed = `batch_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    const createRes = await this.callPayPalApi({
      service: 'Payouts',
      method: 'POST',
      path: '/v1/payments/payouts',
      body: {
        sender_batch_header: {
          sender_batch_id: batchIdSeed,
          email_subject: 'Sandbox City Gig Hub Weekly Courier Payout',
          email_message: 'Thanks for completing 18 deliveries in Sandbox City!',
        },
        items: [
          {
            recipient_type: 'EMAIL',
            amount: {
              value: '140.00',
              currency: 'USD',
            },
            note: 'Priya weekly courier payout',
            sender_item_id: `item_${batchIdSeed}`,
            receiver: recipient,
          },
        ],
      },
    });

    if (createRes.liveExecuted && createRes.ok) {
      const batchHeader = (createRes.data.batch_header || {}) as Record<string, unknown>;
      const payoutBatchId =
        typeof batchHeader.payout_batch_id === 'string'
          ? batchHeader.payout_batch_id
          : batchIdSeed;

      // Poll batch status
      const pollRes = await this.callPayPalApi({
        service: 'Payouts',
        method: 'GET',
        path: `/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}`,
      });
      const polledHeader = (pollRes.data.batch_header || {}) as Record<string, unknown>;
      const batchStatus = String(
        polledHeader.batch_status || batchHeader.batch_status || 'PENDING'
      );

      const ev = this.emitEvent({
        citizenId: 'priya',
        citizenName: 'Priya',
        buildingId: 'gig_hub',
        type: 'payout',
        paypalApi: 'POST /v1/payments/payouts',
        source: 'LIVE_SANDBOX',
        httpStatus: createRes.httpStatus,
        latencyMs: createRes.latencyMs + pollRes.latencyMs,
        amount: 140.0,
        currency: 'USD',
        paypalDebugId: pollRes.paypalDebugId || createRes.paypalDebugId,
        rawResponseStatus: `HTTP ${createRes.httpStatus} BATCH_${batchStatus} (${payoutBatchId})`,
        summary: `Priya LIVE payout batch ${payoutBatchId} (${batchStatus}, $140.00 to ${recipient}) — debug ID ${createRes.paypalDebugId || 'n/a'}.`,
        flagsInvolved: bugFlags.webhookDoubleCredit ? ['webhookDoubleCredit'] : [],
      });

      return {
        event: ev,
        liveCallsCount: this.liveCallsCount,
        fallbackBanners: Array.from(this.fallbackBanners.values()),
      };
    }

    // If account lacks Payouts access or credentials missing, fall back to SIMULATED and record banner
    if (!this.fallbackBanners.has('Payouts')) {
      this.recordFallback(
        'Payouts',
        createRes.fallbackReason ||
          `Payouts API unavailable (${createRes.paypalErrorName || 'Account lacks Payouts access'}) — falling back to SIMULATED.`
      );
    }

    const doubleBug = Boolean(bugFlags.webhookDoubleCredit);
    const simEv = this.emitEvent({
      citizenId: 'priya',
      citizenName: 'Priya',
      buildingId: 'gig_hub',
      type: 'payout',
      paypalApi: 'POST /v1/payments/payouts',
      source: 'SIMULATED',
      httpStatus: 201,
      latencyMs: 195,
      amount: doubleBug ? 280.0 : 140.0,
      currency: 'USD',
      paypalDebugId: createRes.paypalDebugId,
      paypalErrorName: createRes.paypalErrorName,
      bugFlag: doubleBug ? 'webhookDoubleCredit' : undefined,
      flagsInvolved: doubleBug ? ['webhookDoubleCredit'] : [],
      summary: `[SIMULATED Fallback] Priya courier payout ($${doubleBug ? '280.00 duplicate' : '140.00'}) — ${this.fallbackBanners.get('Payouts')?.reason || 'Simulated payout'}`,
    });

    return {
      event: simEv,
      liveCallsCount: this.liveCallsCount,
      fallbackBanners: Array.from(this.fallbackBanners.values()),
    };
  }

  /**
   * 6. DISPUTES (Resolution Center / Dave):
   * Calls GET /v1/customer/disputes (read-only). Shows real ones if they exist;
   * Dave's created disputes are SIMULATED and clearly badged.
   */
  public async handleDisputes(bugFlags: Partial<Record<BugFlagKey, boolean>>): Promise<{
    events: SandboxEvent[];
    liveCallsCount: number;
    fallbackBanners: ApiFallbackBanner[];
  }> {
    const emitted: SandboxEvent[] = [];
    const listRes = await this.callPayPalApi({
      service: 'Disputes',
      method: 'GET',
      path: '/v1/customer/disputes?page_size=5',
    });

    if (listRes.liveExecuted && listRes.ok) {
      const items = Array.isArray(listRes.data.items)
        ? (listRes.data.items as Record<string, unknown>[])
        : [];
      emitted.push(
        this.emitEvent({
          citizenId: 'dave',
          citizenName: 'Dave',
          buildingId: 'resolution_center',
          type: 'dispute',
          paypalApi: 'GET /v1/customer/disputes',
          source: 'LIVE_SANDBOX',
          httpStatus: listRes.httpStatus,
          latencyMs: listRes.latencyMs,
          amount: 64.0,
          currency: 'USD',
          paypalDebugId: listRes.paypalDebugId,
          rawResponseStatus: `HTTP ${listRes.httpStatus} (${items.length} real disputes returned)`,
          summary:
            items.length > 0
              ? `Fetched ${items.length} real PayPal dispute(s) from Resolution Center — debug ID ${listRes.paypalDebugId || 'n/a'}.`
              : `Queried LIVE GET /v1/customer/disputes (0 open sandbox disputes found) — debug ID ${listRes.paypalDebugId || 'n/a'}.`,
          flagsInvolved: [],
        })
      );
    }

    // Disputes cannot be created via merchant API -> Dave's dramatic complaint is SIMULATED and clearly badged
    const complaint =
      DAVE_DRAMATIC_COMPLAINTS[this.daveIdx % DAVE_DRAMATIC_COMPLAINTS.length];
    this.daveIdx += 1;
    const slowBug = Boolean(bugFlags.slowDisputeResponse);

    emitted.push(
      this.emitEvent({
        citizenId: 'dave',
        citizenName: 'Dave',
        buildingId: 'resolution_center',
        type: 'dispute',
        paypalApi: 'POST /v1/customer/disputes (Simulated Buyer Claim)',
        source: 'SIMULATED',
        httpStatus: slowBug ? 504 : 201,
        latencyMs: slowBug ? 4920 : 260,
        amount: 64.0,
        currency: 'USD',
        bugFlag: slowBug ? 'slowDisputeResponse' : undefined,
        flagsInvolved: slowBug ? ['slowDisputeResponse'] : [],
        webhookAnomaly: slowBug,
        summary: `[SIMULATED Buyer Dispute] ${complaint}${slowBug ? ' [504 SLA TIMEOUT]' : ''}`,
      })
    );

    return {
      events: emitted,
      liveCallsCount: this.liveCallsCount,
      fallbackBanners: Array.from(this.fallbackBanners.values()),
    };
  }

  /**
   * 7. WEBHOOKS: POST /api/webhooks/paypal
   * Verifies signature with POST /v1/notifications/verify-webhook-signature using PAYPAL_WEBHOOK_ID,
   * deduplicates by event id (unless `webhookDoubleCredit` bug flag is ON!), and handles:
   * PAYMENT.CAPTURE.COMPLETED, PAYMENT.CAPTURE.REFUNDED, INVOICING.INVOICE.PAID,
   * PAYMENT.PAYOUTSBATCH.SUCCESS, CUSTOMER.DISPUTE.CREATED.
   */
  public async handleWebhook(params: {
    headers: Record<string, string | string[] | undefined>;
    body: Record<string, unknown>;
    webhookDoubleCredit: boolean;
  }): Promise<{
    accepted: boolean;
    duplicateCredited: boolean;
    event?: SandboxEvent;
  }> {
    const creds = this.getCredentials();
    const { headers, body, webhookDoubleCredit } = params;
    const eventId = typeof body.id === 'string' ? body.id : `WH-${Date.now()}`;
    const eventType = typeof body.event_type === 'string' ? body.event_type : 'UNKNOWN';

    const transmissionId = String(headers['paypal-transmission-id'] || '');
    const transmissionTime = String(headers['paypal-transmission-time'] || '');
    const certUrl = String(headers['paypal-cert-url'] || '');
    const authAlgo = String(headers['paypal-auth-algo'] || '');
    const transmissionSig = String(headers['paypal-transmission-sig'] || '');

    let verifiedLive = false;
    let verifyDebugId: string | undefined;

    if (creds.hasClientCreds && creds.webhookId && transmissionId && transmissionSig) {
      const verifyRes = await this.callPayPalApi({
        service: 'Webhooks',
        method: 'POST',
        path: '/v1/notifications/verify-webhook-signature',
        body: {
          auth_algo: authAlgo,
          cert_url: certUrl,
          transmission_id: transmissionId,
          transmission_sig: transmissionSig,
          transmission_time: transmissionTime,
          webhook_id: creds.webhookId,
          webhook_event: body,
        },
      });

      verifyDebugId = verifyRes.paypalDebugId;
      const verificationStatus = String(verifyRes.data.verification_status || '');

      if (verifyRes.liveExecuted && (!verifyRes.ok || verificationStatus !== 'SUCCESS')) {
        const rejectedEv = this.emitEvent({
          citizenId: 'bot_ring',
          citizenName: 'Webhook Verifier',
          buildingId: 'bank_tower',
          type: 'webhook_rejected',
          paypalApi: 'POST /v1/notifications/verify-webhook-signature',
          source: 'LIVE_SANDBOX',
          httpStatus: 400,
          latencyMs: verifyRes.latencyMs,
          amount: 0,
          currency: 'USD',
          paypalDebugId: verifyDebugId,
          paypalErrorName: 'WEBHOOK_REJECTED',
          rawResponseStatus: `WEBHOOK_REJECTED (${verificationStatus || verifyRes.httpStatus})`,
          summary: `WEBHOOK_REJECTED: Signature verification failed for ${eventId} (${eventType}) — debug ID ${verifyDebugId || 'n/a'}.`,
          flagsInvolved: [],
          webhookAnomaly: true,
        });
        return { accepted: false, duplicateCredited: false, event: rejectedEv };
      }

      if (verifyRes.liveExecuted && verificationStatus === 'SUCCESS') {
        verifiedLive = true;
      }
    } else if (headers['x-force-invalid-signature'] === 'true') {
      const rejectedEv = this.emitEvent({
        citizenId: 'bot_ring',
        citizenName: 'Webhook Verifier',
        buildingId: 'bank_tower',
        type: 'webhook_rejected',
        paypalApi: 'POST /v1/notifications/verify-webhook-signature',
        source: 'SIMULATED',
        httpStatus: 400,
        latencyMs: 42,
        amount: 0,
        currency: 'USD',
        paypalErrorName: 'WEBHOOK_REJECTED',
        rawResponseStatus: '400 WEBHOOK_REJECTED (Invalid Signature)',
        summary: `WEBHOOK_REJECTED: Invalid signature on webhook ${eventId} (${eventType}).`,
        flagsInvolved: [],
        webhookAnomaly: true,
      });
      return { accepted: false, duplicateCredited: false, event: rejectedEv };
    }

    // Deduplicate by event ID (affected by BUG LAB `webhookDoubleCredit`)
    const dedup = evaluateWebhookDeduplication(
      eventId,
      this.processedWebhookIds,
      webhookDoubleCredit
    );

    if (!dedup.shouldProcess) {
      const ignoredEv = this.emitEvent({
        citizenId: 'priya',
        citizenName: 'Webhook Relay',
        buildingId: 'bank_tower',
        type: 'webhook_received',
        paypalApi: `WEBHOOK ${eventType}`,
        source: verifiedLive ? 'LIVE_SANDBOX' : 'SIMULATED',
        httpStatus: 200,
        latencyMs: 18,
        amount: 0,
        currency: 'USD',
        paypalDebugId: verifyDebugId,
        rawResponseStatus: `200 IDEMPOTENT_SKIP (${eventId})`,
        summary: `Idempotent webhook handler ignored duplicate delivery of ${eventId} (${eventType}).`,
        flagsInvolved: [],
      });
      return { accepted: true, duplicateCredited: false, event: ignoredEv };
    }

    // Map supported PayPal webhook event types
    const resource = (body.resource || {}) as Record<string, unknown>;
    const amountObj = (resource.amount || {}) as Record<string, unknown>;
    const amt = Number(amountObj.value || 95.0);
    const curr = String(amountObj.currency_code || amountObj.currency || 'USD');

    let mappedType: EventType = 'webhook_received';
    let buildingId: BuildingId = 'bank_tower';
    let citizenId = 'priya';
    let citizenName = 'Priya';

    switch (eventType) {
      case 'PAYMENT.CAPTURE.COMPLETED':
        mappedType = 'pay';
        buildingId = 'bank_tower';
        citizenId = 'marge';
        citizenName = 'Marge';
        break;
      case 'PAYMENT.CAPTURE.REFUNDED':
        mappedType = 'refund_request';
        buildingId = 'flawed_shop';
        citizenId = 'gus';
        citizenName = 'Gus';
        break;
      case 'INVOICING.INVOICE.PAID':
        mappedType = 'invoice_paid';
        buildingId = 'rent_office';
        citizenId = 'priya';
        citizenName = 'Priya';
        break;
      case 'PAYMENT.PAYOUTSBATCH.SUCCESS':
        mappedType = 'payout';
        buildingId = 'gig_hub';
        citizenId = 'priya';
        citizenName = 'Priya';
        break;
      case 'CUSTOMER.DISPUTE.CREATED':
        mappedType = 'dispute';
        buildingId = 'resolution_center';
        citizenId = 'dave';
        citizenName = 'Dave';
        break;
      default:
        break;
    }

    const ev = this.emitEvent({
      citizenId,
      citizenName,
      buildingId,
      type: mappedType,
      paypalApi: `WEBHOOK ${eventType}`,
      source: verifiedLive ? 'LIVE_SANDBOX' : 'SIMULATED',
      httpStatus: 200,
      latencyMs: 65,
      amount: amt,
      currency: curr,
      paypalDebugId: verifyDebugId,
      bugFlag: dedup.isDuplicateCredit ? 'webhookDoubleCredit' : undefined,
      flagsInvolved: dedup.isDuplicateCredit ? ['webhookDoubleCredit'] : [],
      webhookAnomaly: dedup.isDuplicateCredit,
      rawResponseStatus: dedup.isDuplicateCredit
        ? `200 DUPLICATE_CREDITED (${eventId})`
        : `200 VERIFIED (${eventId})`,
      summary: dedup.isDuplicateCredit
        ? `DOUBLE CREDIT BUG: Re-delivered webhook ${eventId} (${eventType}) credited TWICE ($${amt.toFixed(2)}) because webhookDoubleCredit is ON!`
        : `Processed ${verifiedLive ? 'LIVE' : 'SIMULATED'} webhook ${eventId} (${eventType}, $${amt.toFixed(2)}).`,
    });

    return {
      accepted: true,
      duplicateCredited: dedup.isDuplicateCredit,
      event: ev,
    };
  }
}

export const paypalSandboxManager = new PayPalSandboxManager();
