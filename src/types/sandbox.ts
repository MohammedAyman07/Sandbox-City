export type EventType =
  | 'browse'
  | 'add_to_cart'
  | 'checkout_step'
  | 'pay'
  | 'abandon'
  | 'refund_request'
  | 'dispute'
  | 'invoice_paid'
  | 'payout'
  | 'webhook_received'
  | 'webhook_rejected';

export type EventSource = 'LIVE_SANDBOX' | 'SIMULATED';

export type BugFlagKey =
  | 'hiddenShippingFee'
  | 'payLaterBrokenOnMobile'
  | 'webhookDoubleCredit'
  | 'slowDisputeResponse'
  | 'couponStackingBug'
  | 'currencyRoundingBug';

export type ChaosType =
  | 'black_friday'
  | 'viral_tiktok'
  | 'fraud_ring'
  | 'webhook_outage'
  | 'currency_swing';

export type BuildingId =
  | 'flawed_shop'
  | 'resolution_center'
  | 'gig_hub'
  | 'rent_office'
  | 'bank_tower'
  | 'mayors_office';

export type BuildingConfigKey =
  | 'flawedShop'
  | 'bankTower'
  | 'resolutionCenter'
  | 'gigHub'
  | 'rentOffice'
  | 'mayorsOffice';

export type CitizenMood = 'delighted' | 'calm' | 'annoyed' | 'furious' | 'scheming';

export type SpeechBubbleIconType = 'coin' | 'exclamation' | 'question';

export type CheckoutAbandonStep =
  | 'Shipping Step'
  | 'Pay Later Modal'
  | 'FX Conversion'
  | 'Payment Submit'
  | 'Webhook Timeout';

export type DecisionSource = 'Gemini' | 'Rule-based';

export type CitizenToolName =
  | 'create_order'
  | 'request_refund'
  | 'send_payout'
  | 'pay_invoice'
  | 'check_disputes'
  | 'abandon_cart'
  | 'speak';

export interface SandboxEvent {
  id: string;
  timestamp: number; // epoch ms
  simMinuteOfDay: number; // 0..1439 (for day/night clock)
  simDay: number;
  simTimeFormatted: string; // e.g. "Fri 19:45"
  citizenId: string;
  citizenName: string;
  buildingId: BuildingId;
  buildingName: string;
  type: EventType;
  paypalApi: string;
  source: EventSource;
  decisionSource?: DecisionSource;
  toolCalled?: CitizenToolName;
  httpStatus: number;
  latencyMs: number;
  amount: number;
  currency: string;
  paypalDebugId?: string;
  paypalErrorName?: string;
  bugFlag?: BugFlagKey | null;
  rawResponseStatus?: string;
  approveUrl?: string;
  orderId?: string;
  captureId?: string;
  abandonStep?: CheckoutAbandonStep;
  checkoutDurationSec?: number;
  summary: string;
  flagsInvolved: BugFlagKey[];
  chaosActive?: ChaosType | null;
  webhookAnomaly?: boolean;
}

export type PayPalApiServiceKey =
  | 'OAuth'
  | 'Orders'
  | 'Invoicing'
  | 'Payouts'
  | 'Disputes'
  | 'Webhooks';

export type PayPalApiConnectionState = 'Connected' | 'Missing credentials' | 'Error';

export interface ApiServiceHealth {
  service: PayPalApiServiceKey;
  status: PayPalApiConnectionState;
  detail: string;
  paypalDebugId?: string;
}

export interface ApiFallbackBanner {
  service: PayPalApiServiceKey;
  reason: string;
  timestamp: number;
}

export interface SeededOrderItem {
  orderId: string;
  citizenName: string;
  description: string;
  amount: string;
  currency: string;
  approveUrl: string;
  source: EventSource;
  paypalDebugId?: string;
  status: 'CREATED' | 'CAPTURED' | 'SIMULATED';
  captureId?: string;
}

export interface HealthCheckResponse {
  ok: boolean;
  credentialsConfigured: boolean;
  buyerEmailConfigured: boolean;
  payoutRecipientConfigured: boolean;
  webhookIdConfigured: boolean;
  liveCallsCount: number;
  maxLiveCalls: number;
  storedCapturesCount: number;
  webhookUrl: string;
  services: Record<PayPalApiServiceKey, ApiServiceHealth>;
  fallbackBanners: ApiFallbackBanner[];
}

export interface Citizen {
  id: string;
  name: string;
  archetype: string;
  avatarColor: string;
  secondaryColor: string;
  budget: number;
  initialBudget: number;
  patience: number; // 0-100
  trust: number; // 0-100
  mood: CitizenMood;
  goals: string[];
  quirks: string[];
  lastThought: string;
  decisionSource?: DecisionSource;
  lastToolCalled?: CitizenToolName;
  speechBubble: string | null;
  speechBubbleIcon?: SpeechBubbleIconType;
  speechBubbleTimer: number; // seconds remaining (auto-dismiss after 3s)
  queuedBubble?: string | null;
  queuedBubbleIcon?: SpeechBubbleIconType;
  // Spatial coordinates in 1920x1080 stage space
  x: number;
  y: number;
  targetX: number;
  targetY: number;
  waypoints?: { x: number; y: number }[];
  currentBuildingId: BuildingId;
  targetBuildingId: BuildingId;
  state: 'walking' | 'acting' | 'idle';
  actionCooldown: number;
  isBotRing?: boolean;
  preferredCurrency: string;
}

export interface CitizenDecisionInput {
  citizenId: string;
  name: string;
  persona: string;
  mood: CitizenMood;
  budget: number;
  patience: number;
  trust: number;
  currentStep: string;
  targetBuildingId: BuildingId;
  preferredCurrency: string;
  visibleProblems: string[];
  recentHistory: string[];
  bugFlags: Record<BugFlagKey, boolean>;
  mode: EventSource;
  simDay?: number;
  simMinuteOfDay?: number;
}

export interface CitizenDecisionResult {
  citizenId: string;
  decisionSource: DecisionSource;
  toolCalled: CitizenToolName;
  toolArgs: Record<string, unknown>;
  reason: string;
  moodChange: CitizenMood;
  bubbleLine: string;
  emittedEvents: SandboxEvent[];
  cached?: boolean;
}

export interface Building {
  id: BuildingId;
  configKey: BuildingConfigKey;
  name: string;
  subtitle: string;
  xPct: number; // 0..100 percentage of 1920
  yPct: number; // 0..100 percentage of 1080
  entranceXPct: number;
  entranceYPct: number;
  x: number; // pixel in 1920
  y: number; // pixel in 1080
  entranceX: number;
  entranceY: number;
  width: number;
  height: number;
  accentColor: string;
  roofColor: string;
  thumbPosition: string;
  description: string;
  relatedFlags: BugFlagKey[];
}

export interface RoadWaypoint {
  id: string;
  label: string;
  xPct: number; // 0..100
  yPct: number; // 0..100
}

export interface RoadSegmentConfig {
  id: string;
  name: string;
  fromWaypointId: string;
  toWaypointId: string;
  buildingId?: BuildingId;
}

export interface CoinParticle {
  id: string;
  fromX: number;
  fromY: number;
  viaX?: number;
  viaY?: number;
  toX: number;
  toY: number;
  progress: number; // 0..1
  speed: number;
  status: 'moving' | 'success' | 'failed' | 'stalled';
  httpStatus?: number; // e.g. 422, 500, 504
  effectTimer: number; // seconds remaining for mint sparkle or coral shards + status tag (2s)
  amount: number;
  currencySymbol: string;
  isDouble?: boolean;
}

export interface FloatingSymbol {
  id: string;
  x: number;
  y: number;
  symbol: string;
  color: string;
  alpha: number;
  vy: number;
}

export interface BugFlagInfo {
  key: BugFlagKey;
  label: string;
  shortTag: string;
  description: string;
  affectedPersona: string;
  paypalImpact: string;
}

export interface DerivedMetrics {
  totalEvents: number;
  conversionRate: number; // percentage 0..100
  cartAbandonRate: number; // percentage 0..100
  topAbandonStep: string;
  avgCheckoutTimeSec: number;
  disputesOpened: number;
  disputedVolume: number;
  refundsCount: number;
  refundedVolume: number;
  webhookFailures: number;
  payoutsSent: number;
  payoutsVolume: number;
  grossRevenue: number;
  netRevenue: number;
  bugsFoundCount: number;
  bugImpactedEventsCount: number;
  uniqueBugsTriggered: BugFlagKey[];
  livePayPalErrorsCount?: number;
  totalFailuresCount?: number;
  errorCountsByPayPalErrorName?: Record<string, number>;
}

export interface MayorComputedStats {
  totalEvents: number;
  conversionRate: number;
  cartAbandonRate: number;
  abandonmentByStep: Record<string, number>;
  errorCountsByPayPalErrorName: Record<string, number>;
  livePayPalErrorCount: number;
  totalFailuresCount: number;
  disputesCount: number;
  disputedVolume: number;
  refundsCount: number;
  refundedVolume: number;
  webhookIssuesCount: number;
  payoutsSent: number;
  grossRevenue: number;
  netRevenue: number;
}

export interface MayorAiFinding {
  severity: 'critical' | 'warning' | 'info';
  title: string;
  evidence_event_ids: string[];
  affected_citizens: string[];
  paypal_error_name: string;
  suggested_fix: string;
  related_bug_flag: string;
}

export interface MayorAiReport {
  headline: string;
  source: DecisionSource;
  generatedAt: number;
  stats: MayorComputedStats;
  findings: MayorAiFinding[];
}

export interface MayorFinding {
  id: string;
  severity: 'critical' | 'warning' | 'healthy';
  flag?: BugFlagKey;
  title: string;
  evidence: string;
  recommendation: string;
  occurrenceCount: number;
  lostRevenue: number;
}
