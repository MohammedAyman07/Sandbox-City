import { create } from 'zustand';
import {
  ApiFallbackBanner,
  Building,
  BuildingConfigKey,
  BuildingId,
  BugFlagKey,
  ChaosType,
  Citizen,
  CitizenDecisionInput,
  CitizenDecisionResult,
  CoinParticle,
  DerivedMetrics,
  EventSource,
  FloatingSymbol,
  HealthCheckResponse,
  MayorAiReport,
  RoadWaypoint,
  SandboxEvent,
  SeededOrderItem,
} from '../types/sandbox';
import {
  BUILDING_MAP,
  BUG_FLAGS_INFO,
  CHAOS_BUTTONS,
  clampSpeechBubbleWords,
  computeRoadPathBetweenBuildings,
  hydrateBuildingsFromConfig,
  inferSpeechBubbleIcon,
  INITIAL_CITIZENS,
  INITIAL_HOTSPOT_CONFIG,
  INITIAL_ROAD_WAYPOINTS,
} from '../utils/cityData';
import {
  buildFallbackMayorAiReport,
  computeDisappearedPayPalErrors,
  computeMayorStatisticsFromEventLog,
  createSeedEvents,
  deriveMetricsFromEventLog,
  evaluateCitizenBuildingAction,
  formatSimClock,
  runDeterministicScenario,
} from '../utils/simulationEngine';

export type RightPanelTab = 'feed' | 'report' | 'ledger';

const DEFAULT_BUG_FLAGS: Record<BugFlagKey, boolean> = {
  hiddenShippingFee: true,
  payLaterBrokenOnMobile: true,
  webhookDoubleCredit: false,
  slowDisputeResponse: false,
  couponStackingBug: true,
  currencyRoundingBug: true,
};

export interface BeforeAfterComparison {
  open: boolean;
  seed: number;
  before: DerivedMetrics;
  after: DerivedMetrics;
  fixedFlags: BugFlagKey[];
  disappearedPayPalErrors: string[];
}

interface SandboxStoreState {
  mode: EventSource; // 'SIMULATED' (Demo Mode) | 'LIVE_SANDBOX'
  liveSandboxNoticeVisible: boolean;
  simDay: number;
  simMinuteOfDay: number; // 0..1439, starts at 1120 (Fri 18:40)
  speed: 1 | 2 | 4;
  isPaused: boolean;
  citizens: Citizen[];
  selectedCitizenId: string | null;
  selectedBuildingId: BuildingId;
  rightTab: RightPanelTab;
  bugLabOpen: boolean;
  bugFlags: Record<BugFlagKey, boolean>;
  activeChaos: ChaosType | null;
  chaosTimeRemaining: number;
  events: SandboxEvent[];
  coins: CoinParticle[];
  floatingSymbols: FloatingSymbol[];
  bankGlowIntensity: number;
  ledgerModalOpen: boolean;
  settingsOpen: boolean;
  beforeAfterModal: BeforeAfterComparison | null;

  // Live Sandbox Backend Telemetry & State
  liveCallsCount: number;
  maxLiveCalls: number;
  apiHealth: HealthCheckResponse | null;
  healthLoading: boolean;
  fallbackBanners: ApiFallbackBanner[];
  seededOrders: SeededOrderItem[];
  seedingLoading: boolean;
  inspectedEvent: SandboxEvent | null;

  // Gemini Citizen Brains & Mayor's Report State
  citizenBrainLoadingId: string | null;
  mayorReportModalOpen: boolean;
  mayorAiReport: MayorAiReport | null;
  mayorReportLoading: boolean;
  highlightedLedgerEventId: string | null;

  // Calibration Mode & Editable Configs
  calibrationMode: boolean;
  buildings: Building[];
  roadWaypoints: RoadWaypoint[];

  // Actions
  setMode: (mode: EventSource) => void;
  dismissLiveNotice: () => void;
  setSpeed: (speed: 1 | 2 | 4) => void;
  togglePause: () => void;
  selectCitizen: (id: string | null) => void;
  selectBuilding: (buildingId: BuildingId) => void;
  setRightTab: (tab: RightPanelTab) => void;
  toggleBugLab: () => void;
  toggleBugFlag: (flag: BugFlagKey) => void;
  triggerChaos: (chaos: ChaosType) => void;
  forceCitizenAction: (citizenId: string) => void;
  runCitizenGeminiBrain: (citizenId: string) => Promise<void>;
  handleBuildingClick: (buildingId: BuildingId) => void;
  runBuildingTestAgain: () => void;
  fixAndRerunAllBugs: () => void;
  closeBeforeAfterModal: () => void;
  setLedgerModalOpen: (open: boolean) => void;
  setHighlightedLedgerEventId: (eventId: string | null) => void;
  setMayorReportModalOpen: (open: boolean) => void;
  generateMayorsReport: () => Promise<void>;
  inspectEvidenceEventInLedger: (eventId: string) => void;
  setSettingsOpen: (open: boolean) => void;
  setInspectedEvent: (ev: SandboxEvent | null) => void;
  dismissFallbackBanner: (service: string) => void;
  ingestServerEvent: (
    event: SandboxEvent,
    liveCallsCount?: number,
    maxLiveCalls?: number,
    fallbackBanners?: ApiFallbackBanner[]
  ) => void;
  updateServerStatus: (payload: {
    liveCallsCount?: number;
    maxLiveCalls?: number;
    fallbackBanners?: ApiFallbackBanner[];
  }) => void;
  fetchInitialServerStatus: () => Promise<void>;
  runHealthCheck: () => Promise<void>;
  seedLivePurchases: () => Promise<void>;
  triggerCitizenLiveAction: (citizenId: string) => Promise<void>;
  triggerTestWebhook: (duplicate?: boolean) => Promise<void>;
  toggleCalibrationMode: () => void;
  updateHotspotPosition: (key: BuildingConfigKey, xPct: number, yPct: number) => void;
  updateRoadWaypointPosition: (id: string, xPct: number, yPct: number) => void;
  resetSimulation: () => void;
  tickSimulation: (dtSec: number) => void;
}

let coinIdSeq = 1;
let symIdSeq = 1;
let lastLiveAutoCallMs = 0;
let lastGeminiBatchCallMs = 0;

function spawnCoinParticle(
  fromX: number,
  fromY: number,
  toId: BuildingId,
  buildings: Building[],
  status: CoinParticle['status'],
  amount: number,
  currencySymbol: string,
  httpStatus?: number,
  isDouble?: boolean
): CoinParticle[] {
  const toB = buildings.find((b) => b.id === toId) || BUILDING_MAP[toId] || BUILDING_MAP.bank_tower;
  const baseCoin: CoinParticle = {
    id: `coin_${coinIdSeq++}`,
    fromX,
    fromY,
    toX: toB.entranceX ?? toB.x,
    toY: toB.entranceY ?? toB.y,
    progress: 0,
    speed: 0.58,
    status,
    httpStatus: httpStatus ?? (status === 'failed' ? 422 : 200),
    effectTimer: 0,
    amount,
    currencySymbol,
    isDouble,
  };
  if (isDouble) {
    return [
      baseCoin,
      {
        ...baseCoin,
        id: `coin_${coinIdSeq++}`,
        progress: -0.18,
      },
    ];
  }
  return [baseCoin];
}

export const useSandboxStore = create<SandboxStoreState>((set, get) => ({
  mode: 'SIMULATED',
  liveSandboxNoticeVisible: false,
  simDay: 5, // Friday
  simMinuteOfDay: 1120, // Fri 18:40
  speed: 1,
  isPaused: false,
  citizens: INITIAL_CITIZENS.map((c) => ({ ...c, decisionSource: 'Rule-based' })),
  selectedCitizenId: null,
  selectedBuildingId: 'flawed_shop',
  rightTab: 'feed',
  bugLabOpen: true,
  bugFlags: { ...DEFAULT_BUG_FLAGS },
  activeChaos: null,
  chaosTimeRemaining: 0,
  events: createSeedEvents(DEFAULT_BUG_FLAGS, 'SIMULATED'),
  coins: [
    {
      id: 'initial_coin_1',
      fromX: BUILDING_MAP.flawed_shop.entranceX,
      fromY: BUILDING_MAP.flawed_shop.entranceY,
      toX: BUILDING_MAP.bank_tower.entranceX,
      toY: BUILDING_MAP.bank_tower.entranceY,
      progress: 0.42,
      speed: 0.52,
      status: 'success',
      httpStatus: 200,
      effectTimer: 0,
      amount: 64.0,
      currencySymbol: '$',
    },
    {
      id: 'initial_coin_2',
      fromX: BUILDING_MAP.flawed_shop.entranceX,
      fromY: BUILDING_MAP.flawed_shop.entranceY,
      toX: BUILDING_MAP.bank_tower.entranceX,
      toY: BUILDING_MAP.bank_tower.entranceY,
      progress: 0.88,
      speed: 0.52,
      status: 'failed',
      httpStatus: 422,
      effectTimer: 0,
      amount: 68.99,
      currencySymbol: '$',
    },
  ],
  floatingSymbols: [],
  bankGlowIntensity: 0.45,
  ledgerModalOpen: false,
  settingsOpen: false,
  beforeAfterModal: null,

  // Live Sandbox Backend State
  liveCallsCount: 0,
  maxLiveCalls: 40,
  apiHealth: null,
  healthLoading: false,
  fallbackBanners: [],
  seededOrders: [],
  seedingLoading: false,
  inspectedEvent: null,

  // Gemini Citizen Brains & Mayor's Report State
  citizenBrainLoadingId: null,
  mayorReportModalOpen: false,
  mayorAiReport: null,
  mayorReportLoading: false,
  highlightedLedgerEventId: null,

  calibrationMode: false,
  buildings: hydrateBuildingsFromConfig(INITIAL_HOTSPOT_CONFIG),
  roadWaypoints: INITIAL_ROAD_WAYPOINTS,

  setMode: (mode) => {
    set({
      mode,
      liveSandboxNoticeVisible: false,
    });
    if (mode === 'LIVE_SANDBOX') {
      get().runHealthCheck();
    }
  },

  dismissLiveNotice: () => set({ liveSandboxNoticeVisible: false }),

  setSpeed: (speed) => set({ speed }),

  togglePause: () => set((s) => ({ isPaused: !s.isPaused })),

  selectCitizen: (id) => set({ selectedCitizenId: id }),

  selectBuilding: (buildingId) => {
    set({ selectedBuildingId: buildingId });
    if (buildingId === 'mayors_office') {
      get().setMayorReportModalOpen(true);
    }
  },

  setRightTab: (tab) => set({ rightTab: tab }),

  toggleBugLab: () => set((s) => ({ bugLabOpen: !s.bugLabOpen })),

  setLedgerModalOpen: (open) =>
    set((s) => ({
      ledgerModalOpen: open,
      highlightedLedgerEventId: open ? s.highlightedLedgerEventId : null,
    })),

  setHighlightedLedgerEventId: (eventId) => set({ highlightedLedgerEventId: eventId }),

  setMayorReportModalOpen: (open) => {
    set({ mayorReportModalOpen: open });
    if (open) {
      get().generateMayorsReport();
    }
  },

  generateMayorsReport: async () => {
    const currentEvents = get().events;
    const stats = computeMayorStatisticsFromEventLog(currentEvents);
    const immediateFallback = buildFallbackMayorAiReport(currentEvents, stats);

    set({
      mayorReportLoading: true,
      mayorAiReport: immediateFallback,
    });

    try {
      const res = await fetch('/api/gemini/mayor-report', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ events: currentEvents }),
      });
      if (!res.ok) {
        set({ mayorReportLoading: false });
        return;
      }
      const data = (await res.json()) as MayorAiReport;
      if (data && data.headline && Array.isArray(data.findings)) {
        set({
          mayorAiReport: data,
          mayorReportLoading: false,
        });
      } else {
        set({ mayorReportLoading: false });
      }
    } catch {
      set({ mayorReportLoading: false });
    }
  },

  inspectEvidenceEventInLedger: (eventId) => {
    const state = get();
    const matched = state.events.find((e) => e.id === eventId);
    set({
      mayorReportModalOpen: false,
      ledgerModalOpen: true,
      highlightedLedgerEventId: eventId,
      selectedBuildingId: matched?.buildingId ?? state.selectedBuildingId,
      bankGlowIntensity: 1.0,
    });
  },

  setSettingsOpen: (open) => {
    set({ settingsOpen: open });
    if (open && !get().apiHealth) {
      get().fetchInitialServerStatus();
    }
  },

  setInspectedEvent: (ev) => set({ inspectedEvent: ev }),

  dismissFallbackBanner: (service) =>
    set((s) => ({
      fallbackBanners: s.fallbackBanners.filter((b) => b.service !== service),
    })),

  closeBeforeAfterModal: () => set({ beforeAfterModal: null }),

  toggleCalibrationMode: () => set((s) => ({ calibrationMode: !s.calibrationMode })),

  updateServerStatus: (payload) =>
    set((s) => ({
      liveCallsCount: payload.liveCallsCount ?? s.liveCallsCount,
      maxLiveCalls: payload.maxLiveCalls ?? s.maxLiveCalls,
      fallbackBanners: payload.fallbackBanners ?? s.fallbackBanners,
    })),

  ingestServerEvent: (event, liveCallsCount, maxLiveCalls, fallbackBanners) =>
    set((state) => {
      if (state.events.some((e) => e.id === event.id)) {
        return {
          liveCallsCount: liveCallsCount ?? state.liveCallsCount,
          maxLiveCalls: maxLiveCalls ?? state.maxLiveCalls,
          fallbackBanners: fallbackBanners ?? state.fallbackBanners,
        };
      }

      const citizen = state.citizens.find((c) => c.id === event.citizenId);
      const isFailure = event.httpStatus >= 400 || event.type === 'abandon';
      const coinStatus = isFailure ? 'failed' : 'success';
      const currSym =
        event.currency === 'EUR' ? '€' : event.currency === 'JPY' ? '¥' : '$';

      const newCoins = spawnCoinParticle(
        citizen?.x ?? BUILDING_MAP.flawed_shop.entranceX,
        citizen?.y ?? BUILDING_MAP.flawed_shop.entranceY,
        event.buildingId === 'flawed_shop' ? 'bank_tower' : event.buildingId,
        state.buildings,
        coinStatus,
        event.amount || 54,
        currSym,
        event.httpStatus,
        event.bugFlag === 'webhookDoubleCredit'
      );

      const shortBubble = clampSpeechBubbleWords(
        event.paypalErrorName
          ? `HTTP ${event.httpStatus} ${event.paypalErrorName}!`
          : event.source === 'LIVE_SANDBOX'
            ? `LIVE ${event.type.toUpperCase()} (${event.httpStatus})`
            : event.summary,
        8
      );

      const nextCitizens = state.citizens.map((c) => {
        if (c.id !== event.citizenId) return c;
        const nextMood: Citizen['mood'] = isFailure ? 'furious' : 'delighted';
        return {
          ...c,
          mood: nextMood,
          lastThought: event.summary,
          speechBubble: shortBubble,
          speechBubbleIcon: inferSpeechBubbleIcon(shortBubble, nextMood),
          speechBubbleTimer: 3.0,
        };
      });

      return {
        events: [event, ...state.events].slice(0, 250),
        citizens: nextCitizens,
        coins: [...state.coins, ...newCoins].slice(-40),
        liveCallsCount: liveCallsCount ?? state.liveCallsCount,
        maxLiveCalls: maxLiveCalls ?? state.maxLiveCalls,
        fallbackBanners: fallbackBanners ?? state.fallbackBanners,
        bankGlowIntensity: 1.0,
      };
    }),

  fetchInitialServerStatus: async () => {
    try {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch('/api/status', {
        headers: appUrl ? { 'X-App-Url': appUrl } : undefined,
      });
      if (!res.ok) return;
      const data = await res.json();
      set({
        liveCallsCount: data.liveCallsCount ?? 0,
        maxLiveCalls: data.maxLiveCalls ?? 40,
        fallbackBanners: data.fallbackBanners ?? [],
        seededOrders: data.seededOrders ?? [],
        apiHealth: {
          ok: Boolean(data.credentialsConfigured),
          credentialsConfigured: Boolean(data.credentialsConfigured),
          buyerEmailConfigured: Boolean(data.buyerEmailConfigured),
          payoutRecipientConfigured: Boolean(data.payoutRecipientConfigured),
          webhookIdConfigured: Boolean(data.webhookIdConfigured),
          liveCallsCount: data.liveCallsCount ?? 0,
          maxLiveCalls: data.maxLiveCalls ?? 40,
          storedCapturesCount: data.storedCapturesCount ?? 0,
          webhookUrl: data.webhookUrl || `${window.location.origin}/api/webhooks/paypal`,
          services: data.services,
          fallbackBanners: data.fallbackBanners ?? [],
        },
      });
    } catch {
      // Ignore if offline
    }
  },

  runHealthCheck: async () => {
    set({ healthLoading: true });
    try {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch('/api/health', {
        headers: appUrl ? { 'X-App-Url': appUrl } : undefined,
      });
      const data = (await res.json()) as HealthCheckResponse;
      set({
        apiHealth: data,
        liveCallsCount: data.liveCallsCount ?? get().liveCallsCount,
        maxLiveCalls: data.maxLiveCalls ?? get().maxLiveCalls,
        fallbackBanners: data.fallbackBanners ?? get().fallbackBanners,
        healthLoading: false,
      });
    } catch {
      set({ healthLoading: false });
    }
  },

  seedLivePurchases: async () => {
    set({ seedingLoading: true });
    try {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch('/api/orders/seed', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(appUrl ? { 'X-App-Url': appUrl } : {}),
        },
      });
      const data = await res.json();
      if (Array.isArray(data.orders)) {
        set((s) => ({
          seededOrders: [...data.orders, ...s.seededOrders].slice(0, 12),
          liveCallsCount: data.liveCallsCount ?? s.liveCallsCount,
          fallbackBanners: data.fallbackBanners ?? s.fallbackBanners,
          seedingLoading: false,
        }));
      } else {
        set({ seedingLoading: false });
      }
    } catch {
      set({ seedingLoading: false });
    }
  },

  triggerCitizenLiveAction: async (citizenId) => {
    const state = get();
    const citizen = state.citizens.find((c) => c.id === citizenId) || state.citizens[0];
    if (!citizen) return;

    try {
      const appUrl = typeof window !== 'undefined' ? window.location.origin : '';
      const res = await fetch('/api/citizen-action', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(appUrl ? { 'X-App-Url': appUrl } : {}),
        },
        body: JSON.stringify({
          citizenId: citizen.id,
          citizenName: citizen.name,
          targetBuildingId: citizen.targetBuildingId,
          bugFlags: state.bugFlags,
        }),
      });
      const data = await res.json();
      if (Array.isArray(data.events)) {
        for (const ev of data.events) {
          get().ingestServerEvent(
            ev,
            data.liveCallsCount,
            state.maxLiveCalls,
            data.fallbackBanners
          );
        }
      }
    } catch {
      // Fallback to local evaluation if network fails
    }
  },

  triggerTestWebhook: async (duplicate = false) => {
    const state = get();
    const eventId = duplicate ? 'WH-TEST-DUPLICATE-001' : `WH-TEST-${Date.now()}`;
    try {
      const res = await fetch('/api/webhooks/paypal', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: eventId,
          event_type: 'PAYMENT.CAPTURE.COMPLETED',
          webhookDoubleCredit: state.bugFlags.webhookDoubleCredit,
          resource: {
            id: 'CAP-WH-99',
            amount: { value: '64.00', currency_code: 'USD' },
          },
        }),
      });
      const data = await res.json();
      if (data.event) {
        get().ingestServerEvent(data.event);
      }
    } catch {
      // Ignore
    }
  },

  updateHotspotPosition: (key, xPct, yPct) =>
    set((state) => {
      const clampedX = Math.round(Math.max(2, Math.min(98, xPct)) * 10) / 10;
      const clampedY = Math.round(Math.max(2, Math.min(98, yPct)) * 10) / 10;
      const nextBuildings = state.buildings.map((b) => {
        if (b.configKey !== key) return b;
        const dxPct = clampedX - b.xPct;
        const dyPct = clampedY - b.yPct;
        const nextEntranceXPct = Math.round((b.entranceXPct + dxPct) * 10) / 10;
        const nextEntranceYPct = Math.round((b.entranceYPct + dyPct) * 10) / 10;
        return {
          ...b,
          xPct: clampedX,
          yPct: clampedY,
          entranceXPct: nextEntranceXPct,
          entranceYPct: nextEntranceYPct,
          x: Math.round((clampedX / 100) * 1920),
          y: Math.round((clampedY / 100) * 1080),
          entranceX: Math.round((nextEntranceXPct / 100) * 1920),
          entranceY: Math.round((nextEntranceYPct / 100) * 1080),
        };
      });
      return { buildings: nextBuildings };
    }),

  updateRoadWaypointPosition: (id, xPct, yPct) =>
    set((state) => {
      const clampedX = Math.round(Math.max(2, Math.min(98, xPct)) * 10) / 10;
      const clampedY = Math.round(Math.max(2, Math.min(98, yPct)) * 10) / 10;
      return {
        roadWaypoints: state.roadWaypoints.map((w) =>
          w.id === id ? { ...w, xPct: clampedX, yPct: clampedY } : w
        ),
      };
    }),

  toggleBugFlag: (flag) => {
    const state = get();
    const nextValue = !state.bugFlags[flag];
    const nextFlags = { ...state.bugFlags, [flag]: nextValue };

    const flagToCitizenId: Record<BugFlagKey, string> = {
      hiddenShippingFee: 'marge',
      payLaterBrokenOnMobile: 'luna',
      webhookDoubleCredit: 'priya',
      slowDisputeResponse: 'dave',
      couponStackingBug: 'marge',
      currencyRoundingBug: 'omar',
    };
    const targetCitizenId = flagToCitizenId[flag];
    const targetCitizen = state.citizens.find((c) => c.id === targetCitizenId);

    if (!targetCitizen) {
      set({ bugFlags: nextFlags });
      return;
    }

    // In LIVE_SANDBOX mode, also dispatch the real API call so PayPal returns the real 422 error!
    if (state.mode === 'LIVE_SANDBOX') {
      set({ bugFlags: nextFlags });
      if (flag === 'webhookDoubleCredit' && nextValue) {
        get()
          .triggerTestWebhook(true)
          .then(() => get().triggerTestWebhook(true));
      } else {
        get().triggerCitizenLiveAction(targetCitizenId);
      }
      return;
    }

    const citizenReady: Citizen = {
      ...targetCitizen,
      targetBuildingId:
        flag === 'slowDisputeResponse'
          ? 'resolution_center'
          : flag === 'webhookDoubleCredit'
            ? 'gig_hub'
            : 'flawed_shop',
    };

    const stepResult = evaluateCitizenBuildingAction(
      citizenReady,
      nextFlags,
      state.activeChaos,
      state.simDay,
      state.simMinuteOfDay,
      'SIMULATED'
    );

    const newCoins = stepResult.spawnedCoin
      ? spawnCoinParticle(
          targetCitizen.x,
          targetCitizen.y,
          stepResult.spawnedCoin.toBuilding,
          state.buildings,
          stepResult.spawnedCoin.status,
          stepResult.spawnedCoin.amount,
          stepResult.spawnedCoin.currencySymbol,
          stepResult.spawnedCoin.httpStatus,
          stepResult.spawnedCoin.isDouble
        )
      : [];

    set({
      bugFlags: nextFlags,
      citizens: state.citizens.map((c) =>
        c.id === targetCitizenId ? stepResult.updatedCitizen : c
      ),
      events: [...stepResult.emittedEvents.reverse(), ...state.events].slice(0, 250),
      coins: [...state.coins, ...newCoins].slice(-36),
      bankGlowIntensity: 1.0,
    });
  },

  runBuildingTestAgain: () => {
    const state = get();
    if (state.mode === 'LIVE_SANDBOX') {
      // Trigger real backend calls for Marge & Omar against the active Bug Lab flags
      state.triggerCitizenLiveAction('marge');
      state.triggerCitizenLiveAction('omar');
      return;
    }

    const testCitizenIds = ['marge', 'luna', 'omar', 'joe'];
    let nextCitizens = [...state.citizens];
    const newEvents: SandboxEvent[] = [];
    const newCoins: CoinParticle[] = [];

    for (const cid of testCitizenIds) {
      const c = nextCitizens.find((item) => item.id === cid);
      if (!c) continue;
      const res = evaluateCitizenBuildingAction(
        { ...c, targetBuildingId: state.selectedBuildingId },
        state.bugFlags,
        state.activeChaos,
        state.simDay,
        state.simMinuteOfDay,
        'SIMULATED'
      );
      nextCitizens = nextCitizens.map((item) =>
        item.id === cid ? res.updatedCitizen : item
      );
      newEvents.push(...res.emittedEvents);
      if (res.spawnedCoin) {
        newCoins.push(
          ...spawnCoinParticle(
            c.x,
            c.y,
            res.spawnedCoin.toBuilding,
            state.buildings,
            res.spawnedCoin.status,
            res.spawnedCoin.amount,
            res.spawnedCoin.currencySymbol,
            res.spawnedCoin.httpStatus,
            res.spawnedCoin.isDouble
          )
        );
      }
    }

    set({
      citizens: nextCitizens,
      events: [...newEvents.reverse(), ...state.events].slice(0, 250),
      coins: [...state.coins, ...newCoins].slice(-36),
      bankGlowIntensity: 1.0,
    });
  },

  fixAndRerunAllBugs: () =>
    set((state) => {
      const DETERMINISTIC_SEED = 20261109;
      const fixedFlags = (Object.keys(state.bugFlags) as BugFlagKey[]).filter(
        (k) => state.bugFlags[k]
      );
      const effectiveBeforeFlags: Record<BugFlagKey, boolean> =
        fixedFlags.length > 0 ? { ...state.bugFlags } : { ...DEFAULT_BUG_FLAGS };

      // 1) Save a deterministic snapshot of the "Before" metrics & events with the active bug flags
      const beforeDeterministicRun = runDeterministicScenario({
        seed: DETERMINISTIC_SEED,
        flags: effectiveBeforeFlags,
        simDay: state.simDay,
        simMinuteOfDay: state.simMinuteOfDay,
        source: state.mode,
      });
      const beforeEventsSnapshot =
        state.events.length >= beforeDeterministicRun.events.length
          ? state.events
          : beforeDeterministicRun.events;
      const beforeMetrics = deriveMetricsFromEventLog(beforeEventsSnapshot);

      // 2) Turn off the flagged Bug Lab flags
      const cleanFlags: Record<BugFlagKey, boolean> = {
        hiddenShippingFee: false,
        payLaterBrokenOnMobile: false,
        webhookDoubleCredit: false,
        slowDisputeResponse: false,
        couponStackingBug: false,
        currencyRoundingBug: false,
      };

      // 3) Rerun the exact same scripted scenario with the exact same random seed
      const afterDeterministicRun = runDeterministicScenario({
        seed: DETERMINISTIC_SEED,
        flags: cleanFlags,
        simDay: state.simDay,
        simMinuteOfDay: state.simMinuteOfDay + 5,
        source: state.mode,
      });

      // 4) Compute disappeared PayPal error names
      const disappearedPayPalErrors = computeDisappearedPayPalErrors(
        beforeEventsSnapshot,
        afterDeterministicRun.events
      );

      return {
        bugFlags: cleanFlags,
        activeChaos: null,
        chaosTimeRemaining: 0,
        citizens: afterDeterministicRun.citizens.map((c) => ({
          ...c,
          mood: 'delighted',
          patience: Math.min(100, c.patience + 20),
          trust: Math.min(100, c.trust + 20),
        })),
        events: afterDeterministicRun.events,
        beforeAfterModal: {
          open: true,
          seed: DETERMINISTIC_SEED,
          before: beforeMetrics,
          after: afterDeterministicRun.metrics,
          fixedFlags:
            fixedFlags.length > 0
              ? fixedFlags
              : ['hiddenShippingFee', 'payLaterBrokenOnMobile', 'currencyRoundingBug'],
          disappearedPayPalErrors:
            disappearedPayPalErrors.length > 0
              ? disappearedPayPalErrors
              : ['ITEM_TOTAL_MISMATCH', 'DECIMAL_PRECISION', 'UNPROCESSABLE_ENTITY'],
        },
        bankGlowIntensity: 1.0,
      };
    }),

  triggerChaos: (chaos) => {
    const state = get();
    if (state.mode === 'LIVE_SANDBOX' && chaos === 'fraud_ring') {
      state.triggerCitizenLiveAction('bot_ring');
    }

    set((s) => {
      const chaosDef = CHAOS_BUTTONS.find((c) => c.id === chaos);
      const duration = chaosDef ? chaosDef.durationSec : 14;
      const simTimeFormatted = formatSimClock(s.simDay, s.simMinuteOfDay);
      const now = Date.now();
      const shop = s.buildings.find((b) => b.id === 'flawed_shop') || BUILDING_MAP.flawed_shop;

      const updatedCitizens = s.citizens.map((c, idx) => {
        if (chaos === 'viral_tiktok' || chaos === 'black_friday') {
          const roadPath = computeRoadPathBetweenBuildings(
            c.targetBuildingId,
            'flawed_shop',
            s.roadWaypoints
          );
          const bubbleText = clampSpeechBubbleWords(
            idx < 3
              ? chaos === 'viral_tiktok'
                ? 'Saw it on TikTok! BUY!'
                : 'Black Friday rush!'
              : null,
            8
          );
          return {
            ...c,
            targetBuildingId: 'flawed_shop' as BuildingId,
            waypoints: roadPath,
            targetX: roadPath[0]?.x ?? shop.entranceX,
            targetY: roadPath[0]?.y ?? shop.entranceY,
            state: 'walking' as const,
            mood: (chaos === 'viral_tiktok' ? 'delighted' : 'annoyed') as Citizen['mood'],
            speechBubble: bubbleText,
            speechBubbleIcon: inferSpeechBubbleIcon(
              bubbleText,
              chaos === 'viral_tiktok' ? 'delighted' : 'annoyed'
            ),
            speechBubbleTimer: bubbleText ? 3.0 : 0,
          };
        }
        if (chaos === 'fraud_ring' && c.id === 'bot_ring') {
          return {
            ...c,
            x: 840,
            y: 446,
            targetBuildingId: 'flawed_shop' as BuildingId,
            targetX: shop.entranceX,
            targetY: shop.entranceY,
            mood: 'scheming' as const,
            speechBubble: 'Fraud ring velocity burst!',
            speechBubbleIcon: 'exclamation' as const,
            speechBubbleTimer: 3.0,
            actionCooldown: 0.4,
          };
        }
        if (chaos === 'webhook_outage') {
          const bubbleText = idx < 2 ? 'Webhook 500 outage!' : null;
          return {
            ...c,
            mood: 'annoyed' as const,
            speechBubble: bubbleText,
            speechBubbleIcon: 'exclamation' as const,
            speechBubbleTimer: bubbleText ? 3.0 : 0,
          };
        }
        if (chaos === 'currency_swing' && c.id === 'omar') {
          return {
            ...c,
            mood: 'furious' as const,
            speechBubble: 'EUR/JPY swinging ±14%!',
            speechBubbleIcon: 'exclamation' as const,
            speechBubbleTimer: 3.0,
          };
        }
        return c;
      });

      const primaryCitizen =
        chaos === 'fraud_ring'
          ? updatedCitizens.find((c) => c.id === 'bot_ring')!
          : chaos === 'currency_swing'
            ? updatedCitizens.find((c) => c.id === 'omar')!
            : chaos === 'webhook_outage'
              ? updatedCitizens.find((c) => c.id === 'priya')!
              : updatedCitizens.find((c) => c.id === 'marge')!;

      const stepRes = evaluateCitizenBuildingAction(
        primaryCitizen,
        s.bugFlags,
        chaos,
        s.simDay,
        s.simMinuteOfDay,
        'SIMULATED'
      );

      const newSymbols: FloatingSymbol[] =
        chaos === 'currency_swing'
          ? ['$', '€', '£', '¥', '$', '€', '£', '¥'].map((sym, i) => ({
              id: `sym_${symIdSeq++}`,
              x: 420 + i * 145,
              y: 490 - (i % 3) * 45,
              symbol: sym,
              color: i % 2 === 0 ? '#0070E0' : '#E8765A',
              alpha: 1,
              vy: -34 - (i % 3) * 10,
            }))
          : s.floatingSymbols;

      const updatedCoins: CoinParticle[] =
        chaos === 'webhook_outage'
          ? s.coins.map((coin) => ({ ...coin, status: 'stalled' as const, httpStatus: 500 }))
          : [
              ...s.coins,
              ...spawnCoinParticle(
                primaryCitizen.x,
                primaryCitizen.y,
                'bank_tower',
                s.buildings,
                chaos === 'fraud_ring' || chaos === 'currency_swing' ? 'failed' : 'success',
                chaos === 'black_friday' ? 189.0 : 49.99,
                chaos === 'currency_swing' ? '€' : '$',
                chaos === 'fraud_ring' || chaos === 'currency_swing' ? 422 : 200,
                true
              ),
            ];

      const chaosBannerEvent: SandboxEvent = {
        id: `evt_chaos_${now}_${Math.random().toString(36).slice(2, 6)}`,
        timestamp: now,
        simMinuteOfDay: s.simMinuteOfDay,
        simDay: s.simDay,
        simTimeFormatted,
        citizenId: primaryCitizen.id,
        citizenName: primaryCitizen.name,
        buildingId: chaos === 'webhook_outage' ? 'bank_tower' : 'flawed_shop',
        buildingName: chaos === 'webhook_outage' ? 'Bank Tower' : 'The Flawed Shop',
        type:
          chaos === 'webhook_outage'
            ? 'abandon'
            : chaos === 'fraud_ring'
              ? 'checkout_step'
              : 'add_to_cart',
        paypalApi:
          chaos === 'webhook_outage'
            ? 'POST /v1/notifications/verify-webhook-signature'
            : 'POST /v2/checkout/orders',
        source: 'SIMULATED',
        httpStatus:
          chaos === 'webhook_outage'
            ? 500
            : chaos === 'fraud_ring'
              ? 422
              : chaos === 'currency_swing'
                ? 422
                : 201,
        latencyMs: chaos === 'webhook_outage' ? 5000 : chaos === 'black_friday' ? 1240 : 210,
        amount: chaos === 'black_friday' ? 189.0 : 64.0,
        currency: chaos === 'currency_swing' ? 'EUR' : 'USD',
        abandonStep: chaos === 'webhook_outage' ? 'Webhook Timeout' : undefined,
        summary: `SCENARIO [${chaosDef?.label}]: ${chaosDef?.subtitle}`,
        flagsInvolved:
          chaos === 'currency_swing'
            ? ['currencyRoundingBug']
            : chaos === 'webhook_outage'
              ? ['webhookDoubleCredit']
              : [],
        chaosActive: chaos,
        webhookAnomaly: chaos === 'webhook_outage',
      };

      return {
        activeChaos: chaos,
        chaosTimeRemaining: duration,
        citizens: updatedCitizens,
        events: [chaosBannerEvent, ...stepRes.emittedEvents.reverse(), ...s.events].slice(
          0,
          250
        ),
        coins: updatedCoins.slice(-36),
        floatingSymbols: newSymbols.slice(-20),
        bankGlowIntensity: 1.0,
      };
    });
  },

  runCitizenGeminiBrain: async (citizenId) => {
    const state = get();
    const target = state.citizens.find((c) => c.id === citizenId);
    if (!target) return;

    set({ citizenBrainLoadingId: citizenId });

    const recentCitizenEvents = state.events
      .filter((e) => e.citizenId === citizenId)
      .slice(0, 4);

    const visibleProblems: string[] = [];
    for (const flagInfo of BUG_FLAGS_INFO) {
      if (state.bugFlags[flagInfo.key]) {
        visibleProblems.push(`${flagInfo.label}: ${flagInfo.description}`);
      }
    }
    if (recentCitizenEvents[0]?.paypalErrorName) {
      visibleProblems.push(
        `Last PayPal error: ${recentCitizenEvents[0].paypalErrorName} (HTTP ${recentCitizenEvents[0].httpStatus})`
      );
    }

    const inputPayload: CitizenDecisionInput = {
      citizenId: target.id,
      name: target.name,
      persona: `${target.archetype}. Goals: ${target.goals.join('; ')}. Quirks: ${target.quirks.join('; ')}`,
      mood: target.mood,
      budget: target.budget,
      patience: target.patience,
      trust: target.trust,
      currentStep: `At ${BUILDING_MAP[target.targetBuildingId]?.name || 'The Flawed Shop'} (${target.state})`,
      targetBuildingId: target.targetBuildingId,
      preferredCurrency: target.preferredCurrency,
      visibleProblems,
      recentHistory: recentCitizenEvents.map((e) => `[${e.simTimeFormatted}] ${e.summary}`),
      bugFlags: state.bugFlags,
      mode: state.mode,
      simDay: state.simDay,
      simMinuteOfDay: state.simMinuteOfDay,
    };

    try {
      const res = await fetch('/api/gemini/citizen-decision', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(inputPayload),
      });
      if (!res.ok) throw new Error('Decision request failed');
      const data = (await res.json()) as {
        decision: CitizenDecisionResult;
        liveCallsCount?: number;
        maxLiveCalls?: number;
        fallbackBanners?: ApiFallbackBanner[];
      };

      const dec = data.decision;
      if (!dec) throw new Error('Empty decision');

      set((s) => {
        const currentTarget = s.citizens.find((c) => c.id === citizenId) || target;
        const primaryEv = dec.emittedEvents[0];
        const isFailure = primaryEv
          ? primaryEv.httpStatus >= 400 || primaryEv.type === 'abandon'
          : false;
        const currSym =
          currentTarget.preferredCurrency === 'EUR'
            ? '€'
            : currentTarget.preferredCurrency === 'JPY'
              ? '¥'
              : '$';

        const newCoins = primaryEv
          ? spawnCoinParticle(
              currentTarget.x,
              currentTarget.y,
              primaryEv.buildingId === 'flawed_shop' ? 'bank_tower' : primaryEv.buildingId,
              s.buildings,
              isFailure ? 'failed' : 'success',
              primaryEv.amount || 54,
              currSym,
              primaryEv.httpStatus,
              primaryEv.bugFlag === 'webhookDoubleCredit'
            )
          : [];

        const bubble = clampSpeechBubbleWords(dec.bubbleLine, 8);
        const dedupedNewEvents = dec.emittedEvents.filter(
          (ne) => !s.events.some((existing) => existing.id === ne.id)
        );

        return {
          citizenBrainLoadingId: null,
          citizens: s.citizens.map((c) =>
            c.id === citizenId
              ? {
                  ...c,
                  mood: dec.moodChange,
                  lastThought: dec.reason,
                  decisionSource: dec.decisionSource,
                  lastToolCalled: dec.toolCalled,
                  speechBubble: bubble,
                  speechBubbleIcon: inferSpeechBubbleIcon(bubble, dec.moodChange),
                  speechBubbleTimer: bubble ? 3.0 : 0,
                }
              : c
          ),
          events: [...dedupedNewEvents.reverse(), ...s.events].slice(0, 250),
          coins: [...s.coins, ...newCoins].slice(-36),
          liveCallsCount: data.liveCallsCount ?? s.liveCallsCount,
          maxLiveCalls: data.maxLiveCalls ?? s.maxLiveCalls,
          fallbackBanners: data.fallbackBanners ?? s.fallbackBanners,
          bankGlowIntensity: 1.0,
        };
      });
    } catch {
      set({ citizenBrainLoadingId: null });
    }
  },

  forceCitizenAction: (citizenId) => {
    const state = get();
    const target = state.citizens.find((c) => c.id === citizenId);
    if (!target) return;

    // Immediately run the server-side Gemini Citizen Brain (which executes the tool call or falls back to rule-based)
    state.runCitizenGeminiBrain(citizenId);
  },

  handleBuildingClick: (buildingId) => {
    set({
      selectedBuildingId: buildingId,
      bankGlowIntensity: buildingId === 'bank_tower' ? 1.0 : 0.4,
    });
    if (buildingId === 'mayors_office') {
      get().setMayorReportModalOpen(true);
    }
  },

  resetSimulation: () => {
    fetch('/api/reset-counter', { method: 'POST' }).catch(() => {});
    set((state) => ({
      simDay: 5,
      simMinuteOfDay: 1120,
      citizens: INITIAL_CITIZENS,
      activeChaos: null,
      chaosTimeRemaining: 0,
      events: createSeedEvents(state.bugFlags, 'SIMULATED'),
      coins: [],
      floatingSymbols: [],
      bankGlowIntensity: 0.3,
      liveCallsCount: 0,
      fallbackBanners: [],
    }));
  },

  tickSimulation: (dtSec) => {
    const state = get();
    if (state.isPaused) return;

    const effectiveDt = Math.min(dtSec, 0.1) * state.speed;
    const chaosMultiplier =
      state.activeChaos === 'black_friday' || state.activeChaos === 'viral_tiktok' ? 1.75 : 1;

    let nextMinute = state.simMinuteOfDay + effectiveDt * 4.5;
    let nextDay = state.simDay;
    if (nextMinute >= 1440) {
      nextMinute -= 1440;
      nextDay = (nextDay % 7) + 1;
    }

    let nextChaos = state.activeChaos;
    let nextChaosTimer = Math.max(0, state.chaosTimeRemaining - effectiveDt);
    if (nextChaos && nextChaosTimer <= 0) {
      nextChaos = null;
    }

    const newlyEmittedEvents: SandboxEvent[] = [];
    const newlySpawnedCoins: CoinParticle[] = [];
    let nextBankGlow = Math.max(0.2, state.bankGlowIntensity - effectiveDt * 0.45);

    const nextCitizens = state.citizens.map((citizen) => {
      if (citizen.isBotRing && nextChaos !== 'fraud_ring') {
        return {
          ...citizen,
          speechBubble: null,
          speechBubbleTimer: 0,
        };
      }

      const dx = citizen.targetX - citizen.x;
      const dy = citizen.targetY - citizen.y;
      const dist = Math.hypot(dx, dy);
      const moveSpeed = (citizen.isBotRing ? 145 : 95) * chaosMultiplier;

      let nextSpeechTimer = Math.max(0, citizen.speechBubbleTimer - effectiveDt);
      let nextBubble = nextSpeechTimer > 0 ? citizen.speechBubble : null;
      let nextBubbleIcon = citizen.speechBubbleIcon;
      let nextQueuedBubble = citizen.queuedBubble || null;
      const nextQueuedIcon = citizen.queuedBubbleIcon;

      if (!nextBubble && nextQueuedBubble) {
        nextBubble = nextQueuedBubble;
        nextBubbleIcon = nextQueuedIcon || 'coin';
        nextSpeechTimer = 3.0;
        nextQueuedBubble = null;
      }

      if (dist > 8) {
        const stepDist = Math.min(dist, moveSpeed * effectiveDt);
        return {
          ...citizen,
          x: citizen.x + (dx / dist) * stepDist,
          y: citizen.y + (dy / dist) * stepDist,
          state: 'walking' as const,
          speechBubbleTimer: nextSpeechTimer,
          speechBubble: nextBubble,
          speechBubbleIcon: nextBubbleIcon,
          queuedBubble: nextQueuedBubble,
        };
      }

      if (citizen.waypoints && citizen.waypoints.length > 0) {
        const [nextWp, ...restWps] = citizen.waypoints;
        return {
          ...citizen,
          x: citizen.targetX,
          y: citizen.targetY,
          targetX: nextWp.x,
          targetY: nextWp.y,
          waypoints: restWps,
          state: 'walking' as const,
          speechBubbleTimer: nextSpeechTimer,
          speechBubble: nextBubble,
          speechBubbleIcon: nextBubbleIcon,
          queuedBubble: nextQueuedBubble,
        };
      }

      const nextCooldown = citizen.actionCooldown - effectiveDt * chaosMultiplier;
      if (nextCooldown > 0) {
        return {
          ...citizen,
          x: citizen.targetX,
          y: citizen.targetY,
          state: 'acting' as const,
          actionCooldown: nextCooldown,
          speechBubbleTimer: nextSpeechTimer,
          speechBubble: nextBubble,
          speechBubbleIcon: nextBubbleIcon,
          queuedBubble: nextQueuedBubble,
        };
      }

      // Periodically invoke the server-side Gemini Citizen Brain (cached + rate-limited)
      const nowMs = Date.now();
      if (nowMs - lastGeminiBatchCallMs > 5500 && !state.citizenBrainLoadingId) {
        lastGeminiBatchCallMs = nowMs;
        get().runCitizenGeminiBrain(citizen.id);
      } else if (
        state.mode === 'LIVE_SANDBOX' &&
        state.liveCallsCount < state.maxLiveCalls &&
        nowMs - lastLiveAutoCallMs > 3600
      ) {
        lastLiveAutoCallMs = nowMs;
        get().triggerCitizenLiveAction(citizen.id);
      }

      const result = evaluateCitizenBuildingAction(
        citizen,
        state.bugFlags,
        nextChaos,
        nextDay,
        nextMinute,
        'SIMULATED'
      );

      // In SIMULATED mode, push local events; in LIVE_SANDBOX mode, server SSE emits events
      if (state.mode === 'SIMULATED') {
        for (const ev of result.emittedEvents) {
          newlyEmittedEvents.push(ev);
        }
      }

      if (result.spawnedCoin) {
        nextBankGlow = 1.0;
        const coins = spawnCoinParticle(
          citizen.x,
          citizen.y,
          result.spawnedCoin.toBuilding,
          state.buildings,
          result.spawnedCoin.status,
          result.spawnedCoin.amount,
          result.spawnedCoin.currencySymbol,
          result.spawnedCoin.httpStatus,
          result.spawnedCoin.isDouble
        );
        newlySpawnedCoins.push(...coins);
      }

      return result.updatedCitizen;
    });

    const nextCoins: CoinParticle[] = [];
    for (const coin of [...state.coins, ...newlySpawnedCoins]) {
      if (nextChaos === 'webhook_outage') {
        const stalledProgress =
          coin.progress < 0.5 ? Math.min(0.5, coin.progress + effectiveDt * 0.15) : coin.progress;
        nextCoins.push({
          ...coin,
          progress: stalledProgress,
          status: 'stalled',
          httpStatus: 500,
        });
        continue;
      }

      const restoredStatus = coin.status === 'stalled' ? ('success' as const) : coin.status;

      if (coin.progress < 1) {
        const nextProg = coin.progress + effectiveDt * coin.speed;
        if (nextProg >= 1) {
          nextBankGlow = 1.0;
          nextCoins.push({
            ...coin,
            status: restoredStatus,
            progress: 1,
            effectTimer: 2.0,
          });
        } else {
          nextCoins.push({
            ...coin,
            status: restoredStatus,
            progress: nextProg,
          });
        }
      } else if (coin.effectTimer > 0) {
        const nextEffect = coin.effectTimer - effectiveDt;
        if (nextEffect > 0) {
          nextCoins.push({
            ...coin,
            effectTimer: nextEffect,
          });
        }
      }
    }

    let nextSymbols = state.floatingSymbols
      .map((s) => ({
        ...s,
        y: s.y + s.vy * effectiveDt,
        alpha: s.alpha - effectiveDt * 0.22,
      }))
      .filter((s) => s.alpha > 0.05);

    if (nextChaos === 'currency_swing' && nextSymbols.length < 12) {
      const syms = ['$', '€', '£', '¥'];
      nextSymbols.push({
        id: `sym_${symIdSeq++}`,
        x: 380 + ((symIdSeq * 157) % 1060),
        y: 520,
        symbol: syms[symIdSeq % syms.length],
        color: symIdSeq % 2 === 0 ? '#0070E0' : '#E8765A',
        alpha: 0.95,
        vy: -42,
      });
    }

    const maxCoins = Math.max(10, 60 - nextSymbols.length);

    set({
      simDay: nextDay,
      simMinuteOfDay: nextMinute,
      activeChaos: nextChaos,
      chaosTimeRemaining: nextChaosTimer,
      citizens: nextCitizens,
      events:
        newlyEmittedEvents.length > 0
          ? [...newlyEmittedEvents.reverse(), ...state.events].slice(0, 250)
          : state.events,
      coins: nextCoins.slice(-maxCoins),
      floatingSymbols: nextSymbols.slice(0, 20),
      bankGlowIntensity: nextBankGlow,
    });
  },
}));
