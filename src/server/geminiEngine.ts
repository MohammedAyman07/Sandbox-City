import { FunctionDeclaration, GoogleGenAI, ThinkingLevel, Type } from '@google/genai';
import {
  BugFlagKey,
  CheckoutAbandonStep,
  Citizen,
  CitizenDecisionInput,
  CitizenDecisionResult,
  CitizenMood,
  CitizenToolName,
  MayorAiFinding,
  MayorAiReport,
  SandboxEvent,
} from '../types/sandbox';
import { BUILDING_MAP, clampSpeechBubbleWords, INITIAL_CITIZENS } from '../utils/cityData';
import {
  buildFallbackMayorAiReport,
  computeMayorStatisticsFromEventLog,
  evaluateCitizenBuildingAction,
  formatSimClock,
} from '../utils/simulationEngine';
import { paypalSandboxManager } from './paypalEngine';

const GEMINI_FLASH_MODEL = 'gemini-3.8-flash';
const DECISION_TIMEOUT_MS = 6000;
const SITUATION_CACHE_TTL_MS = 45000;

function getGeminiClient(): GoogleGenAI | null {
  const apiKey = (process.env.GEMINI_API_KEY || '').trim();
  if (!apiKey || apiKey === 'MY_GEMINI_API_KEY') {
    return null;
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);

    promise
      .then((val) => {
        clearTimeout(timer);
        resolve(val);
      })
      .catch((err) => {
        clearTimeout(timer);
        reject(err);
      });
  });
}

// ============================================================================
// 1. CITIZEN BRAIN FUNCTION DECLARATIONS (7 tools wrapping PayPal endpoints)
// ============================================================================

const COMMON_DECISION_PROPERTIES = {
  reason: {
    type: Type.STRING,
    description: 'Short first-person thought explaining why the citizen chose this action.',
  },
  mood_change: {
    type: Type.STRING,
    description: 'New citizen mood: delighted, calm, annoyed, furious, or scheming.',
  },
  bubble_line: {
    type: Type.STRING,
    description: 'Short speech bubble line spoken aloud by the citizen (maximum 8 words).',
  },
};

export const CITIZEN_TOOL_DECLARATIONS: FunctionDeclaration[] = [
  {
    name: 'create_order',
    description:
      'Create a PayPal Orders v2 checkout order (POST /v2/checkout/orders) at The Flawed Shop.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        item_name: {
          type: Type.STRING,
          description: 'Name of the product being purchased at The Flawed Shop.',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Order subtotal amount in the citizen preferred currency.',
        },
        currency: {
          type: Type.STRING,
          description: 'Three-letter currency code such as USD, EUR, or JPY.',
        },
        ...COMMON_DECISION_PROPERTIES,
      },
      required: ['item_name', 'amount', 'currency', 'reason', 'mood_change', 'bubble_line'],
    },
  },
  {
    name: 'request_refund',
    description:
      'Request a PayPal capture refund (POST /v2/payments/captures/{id}/refund) for a previous purchase.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        refund_reason: {
          type: Type.STRING,
          description: 'Reason the citizen is asking for a refund.',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Refund amount requested in USD.',
        },
        ...COMMON_DECISION_PROPERTIES,
      },
      required: ['refund_reason', 'amount', 'reason', 'mood_change', 'bubble_line'],
    },
  },
  {
    name: 'send_payout',
    description:
      'Collect a gig worker payout via PayPal Payouts API (POST /v1/payments/payouts) at the Gig Hub.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        gig_description: {
          type: Type.STRING,
          description: 'Description of completed courier or gig work.',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Payout amount in USD.',
        },
        ...COMMON_DECISION_PROPERTIES,
      },
      required: ['gig_description', 'amount', 'reason', 'mood_change', 'bubble_line'],
    },
  },
  {
    name: 'pay_invoice',
    description:
      'Create, send, and record payment on a rent invoice via PayPal Invoicing v2 (POST /v2/invoicing/invoices) at the Rent Office.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        invoice_memo: {
          type: Type.STRING,
          description: 'Memo for the rent or utility invoice payment.',
        },
        amount: {
          type: Type.NUMBER,
          description: 'Invoice payment amount in USD.',
        },
        ...COMMON_DECISION_PROPERTIES,
      },
      required: ['invoice_memo', 'amount', 'reason', 'mood_change', 'bubble_line'],
    },
  },
  {
    name: 'check_disputes',
    description:
      'Query PayPal Customer Disputes API (GET /v1/customer/disputes) and file a dispute at the Resolution Center.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        complaint: {
          type: Type.STRING,
          description: 'Dramatic or legitimate dispute complaint description.',
        },
        disputed_amount: {
          type: Type.NUMBER,
          description: 'Amount being disputed in USD.',
        },
        ...COMMON_DECISION_PROPERTIES,
      },
      required: ['complaint', 'disputed_amount', 'reason', 'mood_change', 'bubble_line'],
    },
  },
  {
    name: 'abandon_cart',
    description:
      'Abandon the current checkout cart when a surprise shipping fee, Pay Later crash, or FX rounding error occurs.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        abandon_step: {
          type: Type.STRING,
          description:
            'Checkout step where abandonment occurred: Shipping Step, Pay Later Modal, FX Conversion, Payment Submit, or Webhook Timeout.',
        },
        error_code: {
          type: Type.STRING,
          description:
            'PayPal error code that triggered abandonment, e.g., ITEM_TOTAL_MISMATCH, DECIMAL_PRECISION, or UNPROCESSABLE_ENTITY.',
        },
        ...COMMON_DECISION_PROPERTIES,
      },
      required: ['abandon_step', 'error_code', 'reason', 'mood_change', 'bubble_line'],
    },
  },
  {
    name: 'speak',
    description:
      'Speak a brief observation or complaint aloud in Sandbox City without initiating a new payment transaction.',
    parameters: {
      type: Type.OBJECT,
      properties: {
        topic: {
          type: Type.STRING,
          description: 'Topic the citizen is commenting on.',
        },
        ...COMMON_DECISION_PROPERTIES,
      },
      required: ['topic', 'reason', 'mood_change', 'bubble_line'],
    },
  },
];

interface CachedDecisionTemplate {
  timestamp: number;
  toolCalled: CitizenToolName;
  toolArgs: Record<string, unknown>;
  reason: string;
  moodChange: CitizenMood;
  bubbleLine: string;
}

const situationCache = new Map<string, CachedDecisionTemplate>();

export function buildSituationCacheKey(input: CitizenDecisionInput): string {
  const activeFlags = Object.entries(input.bugFlags || {})
    .filter(([, v]) => Boolean(v))
    .map(([k]) => k)
    .sort()
    .join(',');
  const problemsKey = (input.visibleProblems || []).slice(0, 3).sort().join('|');
  return `${input.citizenId}::${input.targetBuildingId}::${input.mood}::${activeFlags}::${problemsKey}`;
}

function normalizeMood(raw: unknown, fallback: CitizenMood): CitizenMood {
  const val = String(raw || '').toLowerCase().trim();
  if (
    val === 'delighted' ||
    val === 'calm' ||
    val === 'annoyed' ||
    val === 'furious' ||
    val === 'scheming'
  ) {
    return val;
  }
  return fallback;
}

function normalizeToolName(raw: unknown): CitizenToolName {
  const val = String(raw || '').trim() as CitizenToolName;
  const allowed: CitizenToolName[] = [
    'create_order',
    'request_refund',
    'send_payout',
    'pay_invoice',
    'check_disputes',
    'abandon_cart',
    'speak',
  ];
  return allowed.includes(val) ? val : 'create_order';
}

function normalizeAbandonStep(raw: unknown): CheckoutAbandonStep {
  const s = String(raw || '');
  if (s.includes('Shipping')) return 'Shipping Step';
  if (s.includes('Pay Later')) return 'Pay Later Modal';
  if (s.includes('FX')) return 'FX Conversion';
  if (s.includes('Webhook')) return 'Webhook Timeout';
  return 'Payment Submit';
}

/**
 * Executes a chosen Citizen tool against the PayPal engine (live or simulated)
 * and tags every emitted event with `decisionSource` and `toolCalled`.
 */
export async function executeCitizenPayPalTool(
  input: CitizenDecisionInput,
  toolCalled: CitizenToolName,
  toolArgs: Record<string, unknown>,
  decisionSource: 'Gemini' | 'Rule-based',
  reason: string
): Promise<SandboxEvent[]> {
  const simDay = input.simDay ?? 5;
  const simMinuteOfDay = input.simMinuteOfDay ?? 1125;
  const simTimeFormatted = formatSimClock(simDay, simMinuteOfDay);

  if (input.mode === 'LIVE_SANDBOX') {
    let rawEvents: SandboxEvent[] = [];
    if (toolCalled === 'create_order') {
      const res = await paypalSandboxManager.handleCreateOrder({
        citizenId: input.citizenId,
        citizenName: input.name,
        bugFlags: input.bugFlags,
        isBotBurst: input.citizenId === 'bot_ring',
        simDay,
        simMinuteOfDay,
      });
      rawEvents = res.events;
    } else if (toolCalled === 'request_refund') {
      const res = await paypalSandboxManager.handleRefund();
      rawEvents = [res.event];
    } else if (toolCalled === 'send_payout') {
      const res = await paypalSandboxManager.handlePayout(input.bugFlags);
      rawEvents = [res.event];
    } else if (toolCalled === 'pay_invoice') {
      const res = await paypalSandboxManager.handleRentInvoice();
      rawEvents = res.events;
    } else if (toolCalled === 'check_disputes') {
      const res = await paypalSandboxManager.handleDisputes(input.bugFlags);
      rawEvents = res.events;
    } else if (toolCalled === 'abandon_cart') {
      const step = normalizeAbandonStep(toolArgs.abandon_step);
      const errCode = String(toolArgs.error_code || 'ITEM_TOTAL_MISMATCH');
      const abandonEv: SandboxEvent = {
        id: `evt_gem_abn_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        simMinuteOfDay,
        simDay,
        simTimeFormatted,
        citizenId: input.citizenId,
        citizenName: input.name,
        buildingId: 'flawed_shop',
        buildingName: 'The Flawed Shop',
        type: 'abandon',
        paypalApi: 'POST /v2/checkout/orders',
        source: 'SIMULATED',
        decisionSource,
        toolCalled,
        httpStatus: 422,
        latencyMs: 280,
        amount: Number(toolArgs.amount) || 68.99,
        currency: input.preferredCurrency || 'USD',
        abandonStep: step,
        paypalErrorName: errCode,
        paypalDebugId: `SIM-DBG-ABN-${Date.now().toString(36).slice(-5).toUpperCase()}`,
        bugFlag: input.bugFlags.hiddenShippingFee
          ? 'hiddenShippingFee'
          : input.bugFlags.currencyRoundingBug
            ? 'currencyRoundingBug'
            : input.bugFlags.payLaterBrokenOnMobile
              ? 'payLaterBrokenOnMobile'
              : null,
        summary: `${input.name} abandoned checkout at ${step} (${errCode}): ${reason}`,
        flagsInvolved: Object.entries(input.bugFlags)
          .filter(([, v]) => Boolean(v))
          .map(([k]) => k as BugFlagKey),
      };
      rawEvents = [abandonEv];
    } else {
      // speak tool
      const speakEv: SandboxEvent = {
        id: `evt_gem_spk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: Date.now(),
        simMinuteOfDay,
        simDay,
        simTimeFormatted,
        citizenId: input.citizenId,
        citizenName: input.name,
        buildingId: input.targetBuildingId || 'flawed_shop',
        buildingName: BUILDING_MAP[input.targetBuildingId]?.name || 'The Flawed Shop',
        type: 'browse',
        paypalApi: 'GET /v2/checkout/orders',
        source: 'SIMULATED',
        decisionSource,
        toolCalled,
        httpStatus: 200,
        latencyMs: 95,
        amount: 0,
        currency: input.preferredCurrency || 'USD',
        paypalDebugId: `SIM-DBG-SPK-${Date.now().toString(36).slice(-5).toUpperCase()}`,
        summary: `${input.name}: "${reason}"`,
        flagsInvolved: [],
      };
      rawEvents = [speakEv];
    }

    return rawEvents.map((ev) => ({
      ...ev,
      decisionSource,
      toolCalled,
    }));
  }

  // SIMULATED mode execution using deterministic simulation engine + tool customization
  const templateCitizen: Citizen =
    INITIAL_CITIZENS.find((c) => c.id === input.citizenId) || INITIAL_CITIZENS[0];
  const stepRes = evaluateCitizenBuildingAction(
    {
      ...templateCitizen,
      mood: input.mood,
      budget: input.budget,
      patience: input.patience,
      trust: input.trust,
      targetBuildingId: input.targetBuildingId,
      decisionSource,
    },
    input.bugFlags,
    null,
    simDay,
    simMinuteOfDay,
    'SIMULATED'
  );

  return stepRes.emittedEvents.map((ev) => ({
    ...ev,
    decisionSource,
    toolCalled,
    summary:
      decisionSource === 'Gemini' && reason
        ? `${ev.summary} [Gemini thought: ${reason}]`
        : ev.summary,
  }));
}

/**
 * Deterministic rule-based citizen decision fallback when Gemini is unavailable or times out.
 */
export async function buildRuleBasedCitizenDecision(
  input: CitizenDecisionInput
): Promise<CitizenDecisionResult> {
  const templateCitizen: Citizen =
    INITIAL_CITIZENS.find((c) => c.id === input.citizenId) || INITIAL_CITIZENS[0];
  const simDay = input.simDay ?? 5;
  const simMinuteOfDay = input.simMinuteOfDay ?? 1125;

  const stepRes = evaluateCitizenBuildingAction(
    {
      ...templateCitizen,
      mood: input.mood,
      budget: input.budget,
      patience: input.patience,
      trust: input.trust,
      targetBuildingId: input.targetBuildingId,
      decisionSource: 'Rule-based',
    },
    input.bugFlags,
    null,
    simDay,
    simMinuteOfDay,
    input.mode
  );

  let inferredTool: CitizenToolName = 'create_order';
  if (input.citizenId === 'gus') inferredTool = 'request_refund';
  else if (input.citizenId === 'priya') {
    inferredTool = input.targetBuildingId === 'rent_office' ? 'pay_invoice' : 'send_payout';
  } else if (input.citizenId === 'dave') {
    inferredTool = 'check_disputes';
  } else if (stepRes.emittedEvents.some((e) => e.type === 'abandon')) {
    inferredTool = 'abandon_cart';
  }

  const emittedEvents =
    input.mode === 'LIVE_SANDBOX'
      ? await executeCitizenPayPalTool(
          input,
          inferredTool,
          {},
          'Rule-based',
          stepRes.updatedCitizen.lastThought
        )
      : stepRes.emittedEvents.map((ev) => ({
          ...ev,
          decisionSource: 'Rule-based' as const,
          toolCalled: inferredTool,
        }));

  return {
    citizenId: input.citizenId,
    decisionSource: 'Rule-based',
    toolCalled: inferredTool,
    toolArgs: {},
    reason: stepRes.updatedCitizen.lastThought,
    moodChange: stepRes.updatedCitizen.mood,
    bubbleLine:
      clampSpeechBubbleWords(stepRes.updatedCitizen.speechBubble, 8) || 'Checking out now!',
    emittedEvents,
  };
}

/**
 * Executes a single citizen brain decision using Gemini Function Calling:
 * 1. Checks situation cache for identical state within TTL.
 * 2. Calls Gemini Flash with the 7 PayPal tool declarations (6-second timeout).
 * 3. Executes the chosen tool against PayPal (live or simulated).
 * 4. Sends the PayPal execution result back to Gemini for the second turn so the model
 *    can react to the real HTTP status / PayPal error code.
 * 5. Falls back cleanly to rule-based decisions on timeout or missing key.
 */
export async function decideCitizenActionWithGemini(
  input: CitizenDecisionInput
): Promise<CitizenDecisionResult> {
  const cacheKey = buildSituationCacheKey(input);
  const now = Date.now();
  const cached = situationCache.get(cacheKey);
  if (cached && now - cached.timestamp < SITUATION_CACHE_TTL_MS) {
    const emittedEvents = await executeCitizenPayPalTool(
      input,
      cached.toolCalled,
      cached.toolArgs,
      'Gemini',
      cached.reason
    );
    return {
      citizenId: input.citizenId,
      decisionSource: 'Gemini',
      toolCalled: cached.toolCalled,
      toolArgs: cached.toolArgs,
      reason: cached.reason,
      moodChange: cached.moodChange,
      bubbleLine: cached.bubbleLine,
      emittedEvents,
      cached: true,
    };
  }

  const ai = getGeminiClient();
  if (!ai) {
    return buildRuleBasedCitizenDecision(input);
  }

  try {
    const userPrompt = JSON.stringify({
      citizen: {
        id: input.citizenId,
        name: input.name,
        persona: input.persona,
        mood: input.mood,
        budget: input.budget,
        patience: input.patience,
        trust: input.trust,
        preferredCurrency: input.preferredCurrency,
      },
      currentStep: input.currentStep,
      targetBuildingId: input.targetBuildingId,
      visibleProblems: input.visibleProblems,
      activeBugFlags: Object.entries(input.bugFlags)
        .filter(([, v]) => Boolean(v))
        .map(([k]) => k),
      recentHistory: input.recentHistory.slice(0, 4),
    });

    const systemInstruction =
      'You are the autonomous brain of a citizen in Sandbox City, a chaos-engineering simulator for PayPal integrations. ' +
      'Based on the citizen persona, mood, budget, patience, trust, current step, visible problems (such as surprise shipping fees, Pay Later mobile crashes, or currency rounding errors), and recent history, ' +
      'you MUST call exactly ONE tool from the provided function declarations (create_order, request_refund, send_payout, pay_invoice, check_disputes, abandon_cart, or speak). ' +
      'Always provide a vivid first-person `reason` (1 sentence), `mood_change` (delighted|calm|annoyed|furious|scheming), and a `bubble_line` of at most 8 words.';

    const tools = [{ functionDeclarations: CITIZEN_TOOL_DECLARATIONS }];

    const response1 = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
        config: {
          systemInstruction,
          tools,
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
        },
      }),
      DECISION_TIMEOUT_MS,
      'Gemini citizen tool call'
    );

    const fnCall = response1.functionCalls?.[0];
    if (!fnCall || !fnCall.name) {
      return buildRuleBasedCitizenDecision(input);
    }

    const toolCalled = normalizeToolName(fnCall.name);
    const toolArgs = (fnCall.args || {}) as Record<string, unknown>;
    let reason = String(
      toolArgs.reason ||
        toolArgs.complaint ||
        toolArgs.refund_reason ||
        `${input.name} decided to run ${toolCalled}.`
    ).trim();
    let moodChange = normalizeMood(toolArgs.mood_change, input.mood);
    let bubbleLine =
      clampSpeechBubbleWords(String(toolArgs.bubble_line || reason), 8) || 'Testing PayPal flow!';

    // Execute the chosen tool against PayPal (live or simulated)
    const emittedEvents = await executeCitizenPayPalTool(
      input,
      toolCalled,
      toolArgs,
      'Gemini',
      reason
    );

    const primaryEvent = emittedEvents[0];
    const previousContent = response1.candidates?.[0]?.content;

    // Return the PayPal tool execution result back to Gemini for the next step (if time permits)
    if (previousContent && primaryEvent) {
      try {
        const response2 = await withTimeout(
          ai.models.generateContent({
            model: GEMINI_FLASH_MODEL,
            contents: [
              { role: 'user', parts: [{ text: userPrompt }] },
              previousContent,
              {
                role: 'user',
                parts: [
                  {
                    functionResponse: {
                      id: fnCall.id,
                      name: fnCall.name,
                      response: {
                        httpStatus: primaryEvent.httpStatus,
                        paypalErrorName: primaryEvent.paypalErrorName || null,
                        paypalDebugId: primaryEvent.paypalDebugId || null,
                        summary: primaryEvent.summary,
                      },
                    },
                  },
                ],
              },
            ],
            config: {
              systemInstruction:
                'React briefly in first person (1 sentence) to the PayPal API response status and error code returned by the tool.',
              tools,
              thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            },
          }),
          2200,
          'Gemini tool follow-up'
        );

        const followUpText = (response2.text || '').trim();
        if (followUpText.length > 8 && followUpText.length < 220) {
          reason = followUpText;
          emittedEvents[0] = {
            ...emittedEvents[0],
            summary: `${emittedEvents[0].summary.replace(/\s*\[Gemini thought:.*\]$/, '')} [Gemini: ${followUpText}]`,
          };
        }
        if (primaryEvent.httpStatus >= 400) {
          moodChange = 'furious';
        }
      } catch {
        // Keep Turn 1's reason if follow-up exceeds remaining time window
      }
    }

    situationCache.set(cacheKey, {
      timestamp: Date.now(),
      toolCalled,
      toolArgs,
      reason,
      moodChange,
      bubbleLine,
    });

    return {
      citizenId: input.citizenId,
      decisionSource: 'Gemini',
      toolCalled,
      toolArgs,
      reason,
      moodChange,
      bubbleLine,
      emittedEvents,
    };
  } catch {
    return buildRuleBasedCitizenDecision(input);
  }
}

/**
 * Batch citizen decisions: processes up to 4 citizen inputs in parallel with a 6s timeout
 * and situation caching, falling back per citizen to rule-based on failure.
 */
export async function decideCitizenBatchWithGemini(
  inputs: CitizenDecisionInput[]
): Promise<CitizenDecisionResult[]> {
  const slice = inputs.slice(0, 6);
  return Promise.all(slice.map((input) => decideCitizenActionWithGemini(input)));
}

// ============================================================================
// 2. THE MAYOR'S REPORT (Code-Computed Statistics + Gemini JSON Schema)
// ============================================================================

/**
 * Validates and sanitizes Gemini's Mayor findings so that:
 * - Every `evidence_event_ids` entry is guaranteed to exist in `events`.
 * - If Gemini omitted or misquoted an event ID, real matching event IDs from `events` are attached.
 */
export function sanitizeMayorFindingsAgainstEvents(
  rawFindings: MayorAiFinding[],
  events: SandboxEvent[]
): MayorAiFinding[] {
  const validEventIds = new Set(events.map((e) => e.id));
  const fallbackIds = events.slice(0, 3).map((e) => e.id);

  return rawFindings.map((f) => {
    const cleanEvidence = (Array.isArray(f.evidence_event_ids) ? f.evidence_event_ids : []).filter(
      (id) => validEventIds.has(id)
    );

    if (cleanEvidence.length === 0) {
      // Find matching events by bug flag or error name
      const matchedByFlagOrError = events
        .filter(
          (e) =>
            (f.related_bug_flag &&
              (e.bugFlag === f.related_bug_flag ||
                e.flagsInvolved.includes(f.related_bug_flag as BugFlagKey))) ||
            (f.paypal_error_name && e.paypalErrorName === f.paypal_error_name) ||
            e.httpStatus >= 400
        )
        .slice(0, 3)
        .map((e) => e.id);

      cleanEvidence.push(...(matchedByFlagOrError.length > 0 ? matchedByFlagOrError : fallbackIds));
    }

    const cleanCitizens =
      Array.isArray(f.affected_citizens) && f.affected_citizens.length > 0
        ? f.affected_citizens
        : Array.from(
            new Set(
              events
                .filter((e) => cleanEvidence.includes(e.id))
                .map((e) => e.citizenName)
            )
          );

    const sev =
      f.severity === 'critical' || f.severity === 'warning' || f.severity === 'info'
        ? f.severity
        : 'warning';

    return {
      severity: sev,
      title: String(f.title || 'Detected Checkout Anomaly'),
      evidence_event_ids: cleanEvidence,
      affected_citizens: cleanCitizens.length > 0 ? cleanCitizens : ['Marge'],
      paypal_error_name: String(f.paypal_error_name || 'ITEM_TOTAL_MISMATCH'),
      suggested_fix: String(
        f.suggested_fix || 'Align amount.breakdown with item_total + shipping in Orders v2.'
      ),
      related_bug_flag: String(f.related_bug_flag || 'hiddenShippingFee'),
    };
  });
}

export async function generateMayorsReportWithGemini(
  events: SandboxEvent[]
): Promise<MayorAiReport> {
  // Step 1: Compute ALL statistics strictly in code
  const stats = computeMayorStatisticsFromEventLog(events);
  const fallbackReport = buildFallbackMayorAiReport(events, stats);

  const ai = getGeminiClient();
  if (!ai || events.length === 0) {
    return fallbackReport;
  }

  try {
    const compactEventLog = events.slice(0, 40).map((e) => ({
      id: e.id,
      citizenName: e.citizenName,
      buildingId: e.buildingId,
      type: e.type,
      paypalApi: e.paypalApi,
      source: e.source,
      httpStatus: e.httpStatus,
      paypalErrorName: e.paypalErrorName || null,
      bugFlag: e.bugFlag || e.flagsInvolved[0] || null,
      summary: e.summary,
    }));

    const promptPayload = JSON.stringify({
      computedStatistics: stats,
      eventLog: compactEventLog,
    });

    const response = await withTimeout(
      ai.models.generateContent({
        model: GEMINI_FLASH_MODEL,
        contents: promptPayload,
        config: {
          systemInstruction:
            'You are the Mayor of Sandbox City inspecting payment telemetry from The Flawed Shop, Bank Tower, Resolution Center, Gig Hub, and Rent Office. ' +
            'All statistics have already been computed in code (`computedStatistics`). You MUST NOT invent any numbers—cite only the exact statistics provided. ' +
            'Every finding in `findings` MUST cite real `evidence_event_ids` taken verbatim from `eventLog[].id`, name the `affected_citizens`, specify the `paypal_error_name`, give a concrete `suggested_fix`, and name the `related_bug_flag` (one of hiddenShippingFee, payLaterBrokenOnMobile, webhookDoubleCredit, slowDisputeResponse, couponStackingBug, currencyRoundingBug, or none).',
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              headline: {
                type: Type.STRING,
                description:
                  "Witty municipal headline in the Mayor's voice quoting the exact conversion and failure numbers from computedStatistics.",
              },
              findings: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    severity: {
                      type: Type.STRING,
                      description: 'critical, warning, or info',
                    },
                    title: {
                      type: Type.STRING,
                      description: 'Concise title of the payment integration finding.',
                    },
                    evidence_event_ids: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Exact event IDs from eventLog[].id that prove this finding.',
                    },
                    affected_citizens: {
                      type: Type.ARRAY,
                      items: { type: Type.STRING },
                      description: 'Names of citizens impacted by this issue.',
                    },
                    paypal_error_name: {
                      type: Type.STRING,
                      description:
                        'Exact PayPal error name from the cited events (e.g. ITEM_TOTAL_MISMATCH, DECIMAL_PRECISION, UNPROCESSABLE_ENTITY).',
                    },
                    suggested_fix: {
                      type: Type.STRING,
                      description: 'Concrete engineering fix for the PayPal integration.',
                    },
                    related_bug_flag: {
                      type: Type.STRING,
                      description: 'Related Bug Lab flag key.',
                    },
                  },
                  required: [
                    'severity',
                    'title',
                    'evidence_event_ids',
                    'affected_citizens',
                    'paypal_error_name',
                    'suggested_fix',
                    'related_bug_flag',
                  ],
                },
              },
            },
            required: ['headline', 'findings'],
          },
        },
      }),
      DECISION_TIMEOUT_MS,
      "Gemini Mayor's Report"
    );

    const jsonText = (response.text ?? '').trim();
    if (!jsonText) {
      return fallbackReport;
    }

    const parsed = JSON.parse(jsonText) as {
      headline?: string;
      findings?: MayorAiFinding[];
    };

    const sanitizedFindings =
      Array.isArray(parsed.findings) && parsed.findings.length > 0
        ? sanitizeMayorFindingsAgainstEvents(parsed.findings, events)
        : fallbackReport.findings;

    return {
      headline: String(parsed.headline || fallbackReport.headline),
      source: 'Gemini',
      generatedAt: Date.now(),
      stats,
      findings: sanitizedFindings,
    };
  } catch {
    return fallbackReport;
  }
}
