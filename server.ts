import 'dotenv/config';
import express from 'express';
import path from 'node:path';
import { createServer as createViteServer } from 'vite';
import { paypalSandboxManager } from './src/server/paypalEngine';
import {
  decideCitizenActionWithGemini,
  decideCitizenBatchWithGemini,
  generateMayorsReportWithGemini,
} from './src/server/geminiEngine';
import { BugFlagKey, CitizenDecisionInput, SandboxEvent } from './src/types/sandbox';

function extractBaseUrl(req: express.Request): string {
  const customHeader = req.headers['x-app-url'];
  if (typeof customHeader === 'string' && customHeader.trim()) {
    return customHeader.trim().replace(/\/+$/, '');
  }
  const proto = (req.headers['x-forwarded-proto'] as string) || req.protocol || 'http';
  const host = (req.headers['x-forwarded-host'] as string) || req.get('host');
  if (host) {
    return `${proto}://${host}`.replace(/\/+$/, '');
  }
  return '';
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3000;

  // Support reverse proxies (e.g. Render, Railway, ngrok)
  app.set('trust proxy', 1);

  app.use(express.json({ limit: '1mb' }));

  // Dynamically register the public application URL from incoming requests
  app.use((req, _res, next) => {
    const baseUrl = extractBaseUrl(req);
    if (baseUrl && !baseUrl.includes('localhost') && !baseUrl.includes('127.0.0.1')) {
      paypalSandboxManager.setAppUrl(baseUrl);
    }
    next();
  });

  // ==========================================================================
  // Server-Sent Events (SSE) stream for live + simulated backend events
  // ==========================================================================
  app.get('/api/events/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    // Send initial connection status packet
    res.write(
      `data: ${JSON.stringify({
        type: 'status',
        liveCallsCount: paypalSandboxManager.liveCallsCount,
        maxLiveCalls: paypalSandboxManager.maxLiveCalls,
        fallbackBanners: Array.from(paypalSandboxManager.fallbackBanners.values()),
      })}\n\n`
    );

    const unsubscribe = paypalSandboxManager.subscribeSSE((event) => {
      res.write(
        `data: ${JSON.stringify({
          type: 'event',
          event,
          liveCallsCount: paypalSandboxManager.liveCallsCount,
          maxLiveCalls: paypalSandboxManager.maxLiveCalls,
          fallbackBanners: Array.from(paypalSandboxManager.fallbackBanners.values()),
        })}\n\n`
      );
    });

    req.on('close', () => {
      unsubscribe();
    });
  });

  // ==========================================================================
  // 1. GET /api/health: tests OAuth and each API (Orders, Invoicing, Payouts, Disputes, Webhooks)
  // ==========================================================================
  app.get('/api/health', async (_req, res) => {
    try {
      const health = await paypalSandboxManager.runHealthCheck();
      res.json(health);
    } catch (err) {
      res.status(500).json({
        ok: false,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Lightweight status snapshot without consuming live calls
  app.get('/api/status', (req, res) => {
    const baseUrl = extractBaseUrl(req);
    const creds = paypalSandboxManager.getCredentials(baseUrl);
    res.json({
      credentialsConfigured: creds.hasClientCreds,
      buyerEmailConfigured: Boolean(creds.buyerEmail),
      payoutRecipientConfigured: Boolean(creds.payoutRecipientEmail),
      webhookIdConfigured: Boolean(creds.webhookId),
      liveCallsCount: paypalSandboxManager.liveCallsCount,
      maxLiveCalls: paypalSandboxManager.maxLiveCalls,
      storedCapturesCount: paypalSandboxManager.storedCaptures.filter((c) => !c.refunded).length,
      webhookUrl: `${creds.appUrl}/api/webhooks/paypal`,
      services: paypalSandboxManager.lastServiceHealth,
      fallbackBanners: Array.from(paypalSandboxManager.fallbackBanners.values()),
      seededOrders: paypalSandboxManager.seededOrders,
    });
  });

  app.post('/api/reset-counter', (_req, res) => {
    paypalSandboxManager.clearFallbacksAndResetCounter();
    res.json({
      ok: true,
      liveCallsCount: paypalSandboxManager.liveCallsCount,
      maxLiveCalls: paypalSandboxManager.maxLiveCalls,
      fallbackBanners: [],
    });
  });

  // ==========================================================================
  // 2. ORDERS: POST /api/orders & POST /api/orders/seed & GET /paypal/return
  // ==========================================================================
  app.post('/api/orders', async (req, res) => {
    try {
      const baseUrl = extractBaseUrl(req);
      const {
        citizenId = 'marge',
        citizenName = 'Marge',
        bugFlags = {},
        isBotBurst = false,
        simDay,
        simMinuteOfDay,
      } = req.body || {};

      const result = await paypalSandboxManager.handleCreateOrder({
        citizenId: String(citizenId),
        citizenName: String(citizenName),
        bugFlags: bugFlags as Partial<Record<BugFlagKey, boolean>>,
        isBotBurst: Boolean(isBotBurst),
        simDay: typeof simDay === 'number' ? simDay : undefined,
        simMinuteOfDay: typeof simMinuteOfDay === 'number' ? simMinuteOfDay : undefined,
        appUrl: baseUrl,
      });

      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  app.post('/api/orders/seed', async (req, res) => {
    try {
      const baseUrl = extractBaseUrl(req);
      const result = await paypalSandboxManager.seedLivePurchases(baseUrl);
      res.json(result);
    } catch (err) {
      res.status(500).json({
        error: err instanceof Error ? err.message : String(err),
      });
    }
  });

  // Buyer return route: captures the order (POST /v2/checkout/orders/{id}/capture), stores capture ID, emits LIVE event
  app.get('/paypal/return', async (req, res) => {
    const token = String(req.query.token || req.query.orderId || '').trim();
    const isSimulated = req.query.simulated === '1';

    if (!token) {
      res.redirect('/?paypal_return=missing_token');
      return;
    }

    try {
      const result = await paypalSandboxManager.captureApprovedOrder(token, isSimulated);
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      const isSuccess = result.ok;
      const borderColor = isSuccess ? '#3DDC97' : '#E8765A';
      const badgeBg = isSuccess
        ? (result.source === 'LIVE_SANDBOX' ? '#3DDC97' : '#FFC439')
        : '#E8765A';
      const badgeColor = isSuccess ? '#1F2340' : '#FFFFFF';
      const title = isSuccess ? `Order ${token} Captured!` : `Order ${token}`;
      const redirectTime = isSuccess ? 1800 : 3500;

      res.send(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Sandbox City — ${isSuccess ? 'Order Captured' : 'Capture Notice'}</title>
    <style>
      body {
        font-family: system-ui, -apple-system, sans-serif;
        background: #FFF4E0;
        color: #1F2340;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        margin: 0;
      }
      .card {
        background: #FFF8EA;
        border: 2px solid ${borderColor};
        border-radius: 20px;
        padding: 28px 32px;
        max-width: 480px;
        box-shadow: 0 12px 32px rgba(31,35,64,0.12);
        text-align: center;
      }
      .badge {
        display: inline-block;
        padding: 4px 12px;
        border-radius: 999px;
        background: ${badgeBg};
        color: ${badgeColor};
        font-weight: 800;
        font-size: 12px;
        margin-bottom: 12px;
      }
      a {
        display: inline-block;
        margin-top: 16px;
        padding: 10px 20px;
        background: #0070E0;
        color: #fff;
        border-radius: 12px;
        text-decoration: none;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <div class="badge">${result.source} ${isSuccess ? 'CAPTURE' : 'NOTICE'}</div>
      <h2>${title}</h2>
      <p>${result.event.summary}</p>
      <p style="font-family: monospace; font-size: 12px;">
        ${result.captureId ? `Capture ID: ${result.captureId} | ` : ''}Debug ID: ${result.paypalDebugId || 'n/a'}
      </p>
      <a href="/">Return to Sandbox City</a>
      <script>
        setTimeout(() => { window.location.href = '/'; }, ${redirectTime});
      </script>
    </div>
  </body>
</html>`);
    } catch (err) {
      res.redirect(`/?paypal_error=${encodeURIComponent(String(err))}`);
    }
  });

  app.get('/paypal/cancel', (_req, res) => {
    res.redirect('/?paypal_cancel=1');
  });

  // ==========================================================================
  // 3. REFUNDS: POST /api/refunds (Gus)
  // ==========================================================================
  app.post('/api/refunds', async (_req, res) => {
    try {
      const result = await paypalSandboxManager.handleRefund();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==========================================================================
  // 4. INVOICING (Rent Office / Priya): POST /api/invoicing
  // ==========================================================================
  app.post('/api/invoicing', async (_req, res) => {
    try {
      const result = await paypalSandboxManager.handleRentInvoice();
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==========================================================================
  // 5. PAYOUTS (Gig Hub / Priya): POST /api/payouts
  // ==========================================================================
  app.post('/api/payouts', async (req, res) => {
    try {
      const { bugFlags = {} } = req.body || {};
      const result = await paypalSandboxManager.handlePayout(
        bugFlags as Partial<Record<BugFlagKey, boolean>>
      );
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==========================================================================
  // 6. DISPUTES (Resolution Center / Dave): GET /api/disputes
  // ==========================================================================
  app.get('/api/disputes', async (req, res) => {
    try {
      const slowFlag = req.query.slowDisputeResponse === 'true';
      const result = await paypalSandboxManager.handleDisputes({
        slowDisputeResponse: slowFlag,
      });
      res.json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==========================================================================
  // 7. WEBHOOKS: POST /api/webhooks/paypal
  // ==========================================================================
  app.post('/api/webhooks/paypal', async (req, res) => {
    try {
      const webhookDoubleCredit =
        req.query.webhookDoubleCredit === 'true' ||
        Boolean(req.body?.webhookDoubleCredit);

      const result = await paypalSandboxManager.handleWebhook({
        headers: req.headers,
        body: (req.body || {}) as Record<string, unknown>,
        webhookDoubleCredit,
      });

      res.status(result.accepted ? 200 : 400).json(result);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==========================================================================
  // CITIZEN TO API DISPATCHER: POST /api/citizen-action
  // Maps each citizen directly to their required PayPal API:
  // - Marge, Luna, Omar, Grandpa Joe -> Orders
  // - Gus -> Refunds
  // - Priya -> Payouts (at Gig Hub) or Rent Invoice (at Rent Office)
  // - Dave -> Disputes (read + simulated)
  // - Bot Ring -> 5x rapid duplicate-detection order burst
  // ==========================================================================
  app.post('/api/citizen-action', async (req, res) => {
    try {
      const baseUrl = extractBaseUrl(req);
      const {
        citizenId = 'marge',
        citizenName = 'Marge',
        targetBuildingId = 'flawed_shop',
        bugFlags = {},
      } = req.body || {};

      if (citizenId === 'gus') {
        const out = await paypalSandboxManager.handleRefund();
        res.json({
          events: [out.event],
          liveCallsCount: out.liveCallsCount,
          fallbackBanners: out.fallbackBanners,
        });
        return;
      }

      if (citizenId === 'priya') {
        if (targetBuildingId === 'rent_office') {
          const out = await paypalSandboxManager.handleRentInvoice();
          res.json(out);
          return;
        }
        const out = await paypalSandboxManager.handlePayout(bugFlags);
        res.json({
          events: [out.event],
          liveCallsCount: out.liveCallsCount,
          fallbackBanners: out.fallbackBanners,
        });
        return;
      }

      if (citizenId === 'dave') {
        const out = await paypalSandboxManager.handleDisputes(bugFlags);
        res.json(out);
        return;
      }

      if (citizenId === 'bot_ring') {
        const out = await paypalSandboxManager.handleCreateOrder({
          citizenId: 'bot_ring',
          citizenName: 'The Bot Ring',
          bugFlags,
          isBotBurst: true,
          appUrl: baseUrl,
        });
        res.json(out);
        return;
      }

      // Marge, Luna, Omar, Grandpa Joe -> Create Orders
      const out = await paypalSandboxManager.handleCreateOrder({
        citizenId: String(citizenId),
        citizenName: String(citizenName),
        bugFlags,
        appUrl: baseUrl,
      });
      res.json(out);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==========================================================================
  // 8. GEMINI CITIZEN BRAINS (Function Calling + 6s Timeout + Situation Cache)
  // ==========================================================================
  app.post('/api/gemini/citizen-decision', async (req, res) => {
    try {
      const input = (req.body || {}) as CitizenDecisionInput;
      const decision = await decideCitizenActionWithGemini(input);
      res.json({
        decision,
        liveCallsCount: paypalSandboxManager.liveCallsCount,
        maxLiveCalls: paypalSandboxManager.maxLiveCalls,
        fallbackBanners: Array.from(paypalSandboxManager.fallbackBanners.values()),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  app.post('/api/gemini/citizen-batch', async (req, res) => {
    try {
      const inputs = Array.isArray(req.body?.inputs)
        ? (req.body.inputs as CitizenDecisionInput[])
        : [];
      const decisions = await decideCitizenBatchWithGemini(inputs);
      res.json({
        decisions,
        liveCallsCount: paypalSandboxManager.liveCallsCount,
        maxLiveCalls: paypalSandboxManager.maxLiveCalls,
        fallbackBanners: Array.from(paypalSandboxManager.fallbackBanners.values()),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==========================================================================
  // 9. GEMINI MAYOR'S REPORT (Code-Computed Stats + Structured JSON Schema)
  // ==========================================================================
  app.post('/api/gemini/mayor-report', async (req, res) => {
    try {
      const events = Array.isArray(req.body?.events)
        ? (req.body.events as SandboxEvent[])
        : [];
      const report = await generateMayorsReportWithGemini(events);
      res.json(report);
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // ==========================================================================
  // Mount Vite Dev Server or Static Production Bundle
  // ==========================================================================
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*all', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Sandbox City full-stack server running on http://localhost:${PORT}`);
  });
}

startServer();
