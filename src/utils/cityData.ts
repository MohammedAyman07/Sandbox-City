import {
  Building,
  BuildingConfigKey,
  BuildingId,
  BugFlagInfo,
  ChaosType,
  Citizen,
  RoadSegmentConfig,
  RoadWaypoint,
  SpeechBubbleIconType,
} from '../types/sandbox';

export const STAGE_WIDTH = 1920;
export const STAGE_HEIGHT = 1080;

/**
 * Editable Hotspot Config Array for the six buildings using percentage coordinates (0..100).
 * Keys match the required names: flawedShop, bankTower, resolutionCenter, gigHub, rentOffice, mayorsOffice.
 */
export const INITIAL_HOTSPOT_CONFIG: {
  key: BuildingConfigKey;
  id: BuildingId;
  name: string;
  subtitle: string;
  xPct: number;
  yPct: number;
  entranceXPct: number;
  entranceYPct: number;
  width: number;
  height: number;
  accentColor: string;
  roofColor: string;
  thumbPosition: string;
  description: string;
  relatedFlags: Building['relatedFlags'];
}[] = [
  {
    key: 'flawedShop',
    id: 'flawed_shop',
    name: 'The Flawed Shop',
    subtitle: 'Demo Store Under Test',
    xPct: 31.2,
    yPct: 26.4,
    entranceXPct: 31.0,
    entranceYPct: 38.2,
    width: 195,
    height: 175,
    accentColor: '#E8765A',
    roofColor: '#D95D39',
    thumbPosition: '29% 25%',
    description: 'Deliberately buggy e-commerce checkout with toggleable edge cases.',
    relatedFlags: [
      'hiddenShippingFee',
      'payLaterBrokenOnMobile',
      'currencyRoundingBug',
      'couponStackingBug',
    ],
  },
  {
    key: 'bankTower',
    id: 'bank_tower',
    name: 'Bank Tower',
    subtitle: 'Sandbox Payment Rail',
    xPct: 50.0,
    yPct: 22.7,
    entranceXPct: 50.0,
    entranceYPct: 38.8,
    width: 225,
    height: 195,
    accentColor: '#0070E0',
    roofColor: '#5B7DB1',
    thumbPosition: '50% 21%',
    description: 'Central clearing rail for orders, captures, FX quotes, and webhooks.',
    relatedFlags: ['webhookDoubleCredit', 'currencyRoundingBug'],
  },
  {
    key: 'resolutionCenter',
    id: 'resolution_center',
    name: 'Resolution Center',
    subtitle: 'Disputes & Chargebacks',
    xPct: 71.1,
    yPct: 25.0,
    entranceXPct: 69.5,
    entranceYPct: 39.8,
    width: 215,
    height: 185,
    accentColor: '#FFC439',
    roofColor: '#4A90E2',
    thumbPosition: '73% 23%',
    description: 'Tribunal where frustrated citizens file item-not-as-described and billing disputes.',
    relatedFlags: ['slowDisputeResponse'],
  },
  {
    key: 'gigHub',
    id: 'gig_hub',
    name: 'Gig Hub',
    subtitle: 'Worker Payouts',
    xPct: 26.0,
    yPct: 58.8,
    entranceXPct: 30.8,
    entranceYPct: 48.0,
    width: 205,
    height: 175,
    accentColor: '#7FB69E',
    roofColor: '#6EA48C',
    thumbPosition: '23% 63%',
    description: 'Instant and batch payouts hub for couriers, creators, and contractors.',
    relatedFlags: ['webhookDoubleCredit'],
  },
  {
    key: 'rentOffice',
    id: 'rent_office',
    name: 'Rent Office',
    subtitle: 'Recurring Invoices',
    xPct: 49.5,
    yPct: 60.6,
    entranceXPct: 49.5,
    entranceYPct: 49.2,
    width: 205,
    height: 175,
    accentColor: '#E8765A',
    roofColor: '#4B5267',
    thumbPosition: '50% 65%',
    description: 'Issues monthly rent and utility invoices via PayPal Invoicing API.',
    relatedFlags: [],
  },
  {
    key: 'mayorsOffice',
    id: 'mayors_office',
    name: "Mayor's Office",
    subtitle: 'Civic Audit & Report',
    xPct: 72.1,
    yPct: 60.6,
    entranceXPct: 68.5,
    entranceYPct: 49.8,
    width: 215,
    height: 185,
    accentColor: '#0070E0',
    roofColor: '#E0633C',
    thumbPosition: '75% 65%',
    description: 'Aggregates civic payment telemetry into actionable integration diagnostics.',
    relatedFlags: [],
  },
];

export function hydrateBuildingsFromConfig(
  configs = INITIAL_HOTSPOT_CONFIG
): Building[] {
  return configs.map((c) => ({
    ...c,
    configKey: c.key,
    x: Math.round((c.xPct / 100) * STAGE_WIDTH),
    y: Math.round((c.yPct / 100) * STAGE_HEIGHT),
    entranceX: Math.round((c.entranceXPct / 100) * STAGE_WIDTH),
    entranceY: Math.round((c.entranceYPct / 100) * STAGE_HEIGHT),
  }));
}

export const BUILDINGS: Building[] = hydrateBuildingsFromConfig(INITIAL_HOTSPOT_CONFIG);

export const BUILDING_MAP: Record<BuildingId, Building> = Object.fromEntries(
  BUILDINGS.map((b) => [b.id, b])
) as Record<BuildingId, Building>;

/**
 * Editable Road Waypoints (percentage coordinates 0..100) aligned to the central avenue
 * and crosswalks in city.png.
 */
export const INITIAL_ROAD_WAYPOINTS: RoadWaypoint[] = [
  { id: 'road_west', label: 'West Road Edge', xPct: 18.8, yPct: 41.2 },
  { id: 'road_shop', label: 'Shop Crosswalk', xPct: 31.0, yPct: 42.4 },
  { id: 'road_gig', label: 'Gig Alley Junction', xPct: 36.8, yPct: 43.0 },
  { id: 'road_bank', label: 'Bank Plaza Center', xPct: 50.0, yPct: 44.2 },
  { id: 'road_mayor', label: 'Mayor Alley Junction', xPct: 62.2, yPct: 45.2 },
  { id: 'road_resolution', label: 'Resolution Crosswalk', xPct: 69.5, yPct: 45.8 },
  { id: 'road_east', label: 'East Road Edge', xPct: 78.2, yPct: 46.6 },
  // Building approach spurs
  { id: 'spur_shop', label: 'Flawed Shop Door', xPct: 31.0, yPct: 37.8 },
  { id: 'spur_bank', label: 'Bank Tower Steps', xPct: 50.0, yPct: 38.4 },
  { id: 'spur_resolution', label: 'Resolution Steps', xPct: 69.5, yPct: 39.2 },
  { id: 'spur_gig', label: 'Gig Hub Sidewalk', xPct: 35.4, yPct: 55.5 },
  { id: 'spur_rent', label: 'Rent Office Walk', xPct: 49.5, yPct: 51.5 },
  { id: 'spur_mayor', label: 'Mayor Office Walk', xPct: 61.5, yPct: 56.5 },
];

export const ROAD_SEGMENTS: RoadSegmentConfig[] = [
  { id: 'seg_1', name: 'West Entry to Shop', fromWaypointId: 'road_west', toWaypointId: 'road_shop' },
  { id: 'seg_2', name: 'Shop to Gig Junction', fromWaypointId: 'road_shop', toWaypointId: 'road_gig' },
  { id: 'seg_3', name: 'Gig Junction to Bank', fromWaypointId: 'road_gig', toWaypointId: 'road_bank' },
  { id: 'seg_4', name: 'Bank to Mayor Junction', fromWaypointId: 'road_bank', toWaypointId: 'road_mayor' },
  { id: 'seg_5', name: 'Mayor Junction to Resolution', fromWaypointId: 'road_mayor', toWaypointId: 'road_resolution' },
  { id: 'seg_6', name: 'Resolution to East Exit', fromWaypointId: 'road_resolution', toWaypointId: 'road_east' },
  // Building Spurs
  { id: 'spur_seg_shop', name: 'Shop Spur', fromWaypointId: 'road_shop', toWaypointId: 'spur_shop', buildingId: 'flawed_shop' },
  { id: 'spur_seg_bank', name: 'Bank Spur', fromWaypointId: 'road_bank', toWaypointId: 'spur_bank', buildingId: 'bank_tower' },
  { id: 'spur_seg_res', name: 'Resolution Spur', fromWaypointId: 'road_resolution', toWaypointId: 'spur_resolution', buildingId: 'resolution_center' },
  { id: 'spur_seg_gig', name: 'Gig Spur', fromWaypointId: 'road_gig', toWaypointId: 'spur_gig', buildingId: 'gig_hub' },
  { id: 'spur_seg_rent', name: 'Rent Spur', fromWaypointId: 'road_bank', toWaypointId: 'spur_rent', buildingId: 'rent_office' },
  { id: 'spur_seg_mayor', name: 'Mayor Spur', fromWaypointId: 'road_mayor', toWaypointId: 'spur_mayor', buildingId: 'mayors_office' },
];

const BUILDING_TO_ROAD_JUNCTION: Record<BuildingId, string> = {
  flawed_shop: 'road_shop',
  gig_hub: 'road_gig',
  bank_tower: 'road_bank',
  rent_office: 'road_bank',
  mayors_office: 'road_mayor',
  resolution_center: 'road_resolution',
};

const BUILDING_TO_SPUR: Record<BuildingId, string> = {
  flawed_shop: 'spur_shop',
  gig_hub: 'spur_gig',
  bank_tower: 'spur_bank',
  rent_office: 'spur_rent',
  mayors_office: 'spur_mayor',
  resolution_center: 'spur_resolution',
};

const MAIN_AVENUE_ORDER = [
  'road_west',
  'road_shop',
  'road_gig',
  'road_bank',
  'road_mayor',
  'road_resolution',
  'road_east',
];

/**
 * Computes pixel waypoints along the road network between two buildings so citizens
 * and coins follow the illustrated streets instead of cutting across roofs.
 */
export function computeRoadPathBetweenBuildings(
  fromId: BuildingId,
  toId: BuildingId,
  waypoints: RoadWaypoint[] = INITIAL_ROAD_WAYPOINTS
): { x: number; y: number }[] {
  const wpMap = Object.fromEntries(
    waypoints.map((w) => [
      w.id,
      {
        x: Math.round((w.xPct / 100) * STAGE_WIDTH),
        y: Math.round((w.yPct / 100) * STAGE_HEIGHT),
      },
    ])
  );

  const startJunction = BUILDING_TO_ROAD_JUNCTION[fromId] || 'road_shop';
  const endJunction = BUILDING_TO_ROAD_JUNCTION[toId] || 'road_bank';
  const endSpur = BUILDING_TO_SPUR[toId] || 'spur_bank';

  const startIdx = MAIN_AVENUE_ORDER.indexOf(startJunction);
  const endIdx = MAIN_AVENUE_ORDER.indexOf(endJunction);

  const routeIds: string[] = [];
  if (startIdx !== -1 && endIdx !== -1) {
    if (startIdx <= endIdx) {
      for (let i = startIdx; i <= endIdx; i++) routeIds.push(MAIN_AVENUE_ORDER[i]);
    } else {
      for (let i = startIdx; i >= endIdx; i--) routeIds.push(MAIN_AVENUE_ORDER[i]);
    }
  } else {
    routeIds.push(startJunction, endJunction);
  }
  routeIds.push(endSpur);

  return routeIds.map((id) => wpMap[id]).filter(Boolean);
}

/**
 * Enforces max 8 words on any speech bubble text.
 */
export function clampSpeechBubbleWords(
  text: string | null | undefined,
  maxWords = 8
): string | null {
  if (!text) return null;
  const words = text.trim().split(/\s+/);
  if (words.length <= maxWords) return words.join(' ');
  return `${words.slice(0, maxWords).join(' ')}...`;
}

/**
 * Selects a contextual small icon (coin, exclamation, question) for a speech bubble.
 */
export function inferSpeechBubbleIcon(
  text: string | null | undefined,
  mood: Citizen['mood']
): SpeechBubbleIconType {
  if (!text) return 'coin';
  const lower = text.toLowerCase();
  if (
    lower.includes('?') ||
    lower.includes('wait') ||
    lower.includes('confus') ||
    lower.includes('thinking')
  ) {
    return 'question';
  }
  if (
    mood === 'furious' ||
    mood === 'annoyed' ||
    mood === 'scheming' ||
    lower.includes('!') ||
    lower.includes('422') ||
    lower.includes('504') ||
    lower.includes('429') ||
    lower.includes('abandon') ||
    lower.includes('dispute') ||
    lower.includes('crash') ||
    lower.includes('fraud')
  ) {
    return 'exclamation';
  }
  return 'coin';
}

/**
 * Resolves citizen visual positions on the 1920x1080 stage:
 * 1. Filters out the hooded Bot Ring unless Fraud Ring scenario is active (or explicitly selected).
 * 2. Offsets citizens sharing the same target building so they form a neat arc instead of stacking.
 * 3. Applies iterative repulsion so no two visible citizens are ever closer than minSeparation (40px).
 */
export function resolveCitizenPositions(
  citizens: Citizen[],
  activeChaos: ChaosType | null,
  selectedCitizenId: string | null = null,
  minSeparation = 40
): (Citizen & { renderX: number; renderY: number })[] {
  const visible = citizens.filter(
    (c) => !c.isBotRing || activeChaos === 'fraud_ring' || c.id === selectedCitizenId
  );

  // Group by targetBuildingId when close to arrival to offset citizens sharing a building
  const buildingGroups = new Map<BuildingId, string[]>();
  for (const c of visible) {
    const list = buildingGroups.get(c.targetBuildingId) || [];
    list.push(c.id);
    buildingGroups.set(c.targetBuildingId, list);
  }

  const pos = visible.map((c) => {
    const group = buildingGroups.get(c.targetBuildingId) || [c.id];
    const idxInGroup = group.indexOf(c.id);
    const count = group.length;
    let offsetX = 0;
    let offsetY = 0;
    if (count > 1) {
      const spreadIndex = idxInGroup - (count - 1) / 2;
      offsetX = spreadIndex * 44;
      offsetY = (idxInGroup % 2 === 0 ? -1 : 1) * 12;
    }
    return {
      ...c,
      renderX: c.x + offsetX,
      renderY: c.y + offsetY,
    };
  });

  // Iterative pairwise repulsion to guarantee >= minSeparation (40px)
  const iterations = 10;
  for (let iter = 0; iter < iterations; iter++) {
    for (let i = 0; i < pos.length; i++) {
      for (let j = i + 1; j < pos.length; j++) {
        const a = pos[i];
        const b = pos[j];
        let dx = b.renderX - a.renderX;
        let dy = b.renderY - a.renderY;
        let dist = Math.hypot(dx, dy);
        if (dist < minSeparation) {
          if (dist < 0.01) {
            const angle = ((i + 1) * 1.3 + j * 0.7) % (Math.PI * 2);
            dx = Math.cos(angle);
            dy = Math.sin(angle);
            dist = 1;
          }
          const overlap = minSeparation - dist + 0.5;
          const ux = dx / dist;
          const uy = dy / dist;
          a.renderX -= ux * (overlap * 0.5);
          a.renderY -= uy * (overlap * 0.5);
          b.renderX += ux * (overlap * 0.5);
          b.renderY += uy * (overlap * 0.5);
        }
      }
    }
  }

  return pos;
}

export const BUG_FLAGS_INFO: BugFlagInfo[] = [
  {
    key: 'hiddenShippingFee',
    label: 'Remove surprise shipping fee',
    shortTag: '+$14.99 SURPRISE FEE',
    description: 'Injects an unannounced $14.99 handling surcharge on the final review step.',
    affectedPersona: 'Marge (Bargain Hunter)',
    paypalImpact: 'PATCH /v2/checkout/orders/{id} amount mismatch & cart abandonment',
  },
  {
    key: 'payLaterBrokenOnMobile',
    label: 'Fix mobile Pay Later callback',
    shortTag: 'PAY LATER 422',
    description: 'Mobile SDK callback drops payer funding source token on installment plans.',
    affectedPersona: 'Luna (Student)',
    paypalImpact: 'POST /v2/checkout/orders/{id}/capture returns 422 INSTRUMENT_DECLINED',
  },
  {
    key: 'currencyRoundingBug',
    label: 'Enforce minor-unit FX rounding',
    shortTag: 'FX FLOAT DRIFT',
    description: 'Uses JS float multiplication for EUR/JPY conversions instead of minor units.',
    affectedPersona: 'Omar (Cross-Border Buyer)',
    paypalImpact: 'POST /v2/checkout/orders fails with 422 DECIMAL_PRECISION',
  },
  {
    key: 'couponStackingBug',
    label: 'Block recursive coupon stacking',
    shortTag: 'RECURSIVE DISCOUNT',
    description: 'Allows stacking WELCOME20 + VIP50 + FREESHIP down to a $1.00 capture.',
    affectedPersona: 'Marge & The Bot Ring',
    paypalImpact: 'Net revenue leakage on POST /v2/checkout/orders with negative discount clamp',
  },
  {
    key: 'webhookDoubleCredit',
    label: 'Enforce webhook idempotency',
    shortTag: 'IDEMPOTENCY OFF',
    description: 'Skips webhook event_id deduplication, crediting payouts & captures twice.',
    affectedPersona: 'Priya & Grandpa Joe',
    paypalImpact: 'Duplicate PAYMENT.CAPTURE.COMPLETED & PAYOUTS-ITEM ledger drift',
  },
  {
    key: 'slowDisputeResponse',
    label: 'Optimize dispute SLA timeout',
    shortTag: '504 DISPUTE TIMEOUT',
    description: 'Evidence upload endpoint stalls >4800ms, auto-escalating claims.',
    affectedPersona: 'Dave (Serial Disputer)',
    paypalImpact: 'POST /v1/customer/disputes/{id}/provide-evidence returns 504',
  },
];

export const CITIZEN_LIVE_STATUSES: Record<string, string> = {
  marge: 'Shopping...',
  dave: 'Thinking...',
  priya: 'Delivering...',
  gus: 'Checking out...',
  luna: 'Browsing...',
  omar: 'On the way...',
  joe: 'Need help...',
  bot_ring: 'Suspicious...',
};

export const INITIAL_CITIZENS: Citizen[] = [
  {
    id: 'marge',
    name: 'Marge',
    archetype: 'Bargain Hunter',
    avatarColor: '#E8765A',
    secondaryColor: '#FDE2DB',
    budget: 240,
    initialBudget: 240,
    patience: 62,
    trust: 74,
    mood: 'calm',
    goals: ['Snag clearance espresso maker', 'Never pay a cent for shipping', 'Stack promo codes'],
    quirks: ['Abandons immediately on surprise fees', 'Tests every promo code combination'],
    lastThought: 'If shipping is not $0.00 at checkout, I am closing this tab immediately.',
    speechBubble: 'Free shipping or bust!',
    speechBubbleIcon: 'coin',
    speechBubbleTimer: 3.0,
    x: 560,
    y: 410,
    targetX: 595,
    targetY: 408,
    currentBuildingId: 'flawed_shop',
    targetBuildingId: 'flawed_shop',
    state: 'acting',
    actionCooldown: 2.2,
    preferredCurrency: 'USD',
  },
  {
    id: 'dave',
    name: 'Dave',
    archetype: 'Dramatic Disputer',
    avatarColor: '#F59E0B',
    secondaryColor: '#FEF3C7',
    budget: 410,
    initialBudget: 410,
    patience: 38,
    trust: 45,
    mood: 'annoyed',
    goals: ['Buy premium gadgets over $30', 'File theatrical dispute if box has a dent'],
    quirks: ['Disputes anything over $30', 'Writes 400-word operatic complaints'],
    lastThought: 'This $68 toaster arrived lukewarm in spirit! To the Resolution Center!',
    speechBubble: 'Filing a dramatic dispute!',
    speechBubbleIcon: 'exclamation',
    speechBubbleTimer: 2.8,
    x: 1260,
    y: 455,
    targetX: 1335,
    targetY: 422,
    currentBuildingId: 'flawed_shop',
    targetBuildingId: 'resolution_center',
    state: 'walking',
    actionCooldown: 2.5,
    preferredCurrency: 'USD',
  },
  {
    id: 'priya',
    name: 'Priya',
    archetype: 'Gig Courier',
    avatarColor: '#3DDC97',
    secondaryColor: '#D1FAE5',
    budget: 185,
    initialBudget: 185,
    patience: 82,
    trust: 88,
    mood: 'delighted',
    goals: ['Collect weekly delivery payout at Gig Hub', 'Pay Friday rent invoice on time'],
    quirks: ['Checks payout webhook latency', 'Pays invoices within 30 seconds of receipt'],
    lastThought: 'Completed 18 courier drops! Heading to Gig Hub for my weekly payout.',
    speechBubble: 'Weekly gig payout ready!',
    speechBubbleIcon: 'coin',
    speechBubbleTimer: 2.6,
    x: 680,
    y: 560,
    targetX: 591,
    targetY: 518,
    currentBuildingId: 'gig_hub',
    targetBuildingId: 'gig_hub',
    state: 'walking',
    actionCooldown: 2.0,
    preferredCurrency: 'USD',
  },
  {
    id: 'gus',
    name: 'Gus',
    archetype: 'Serial Refunder',
    avatarColor: '#7FB69E',
    secondaryColor: '#E2F2EB',
    budget: 155,
    initialBudget: 155,
    patience: 54,
    trust: 60,
    mood: 'calm',
    goals: ['Buy weekend party projector', 'Request full refund on Monday morning'],
    quirks: ['Tries to refund items he already used', 'Claims "just testing the pixels"'],
    lastThought: 'Sure I wore the tuxedo to three weddings, but the lapel felt slightly judgmental.',
    speechBubble: null,
    speechBubbleIcon: 'question',
    speechBubbleTimer: 0,
    x: 785,
    y: 468,
    targetX: 595,
    targetY: 408,
    currentBuildingId: 'bank_tower',
    targetBuildingId: 'flawed_shop',
    state: 'walking',
    actionCooldown: 3.2,
    preferredCurrency: 'USD',
  },
  {
    id: 'luna',
    name: 'Luna',
    archetype: 'Pay-Later Student',
    avatarColor: '#8EC5FF',
    secondaryColor: '#E0F2FE',
    budget: 120,
    initialBudget: 120,
    patience: 65,
    trust: 72,
    mood: 'calm',
    goals: ['Buy studio headphones in 4 interest-free installments', 'Shop exclusively on mobile'],
    quirks: ['Uses Pay in 4 for everything', 'Bounces if mobile Pay Later modal freezes'],
    lastThought: 'Splitting $88 into 4 payments of $22 fits my semester coffee budget!',
    speechBubble: null,
    speechBubbleIcon: 'coin',
    speechBubbleTimer: 0,
    x: 470,
    y: 448,
    targetX: 595,
    targetY: 408,
    currentBuildingId: 'gig_hub',
    targetBuildingId: 'flawed_shop',
    state: 'walking',
    actionCooldown: 2.8,
    preferredCurrency: 'USD',
  },
  {
    id: 'omar',
    name: 'Omar',
    archetype: 'Global Collector',
    avatarColor: '#0070E0',
    secondaryColor: '#DBEAFE',
    budget: 520,
    initialBudget: 520,
    patience: 58,
    trust: 68,
    mood: 'calm',
    goals: ['Order limited sneakers in EUR and JPY', 'Verify exact FX settlement breakdown'],
    quirks: ['Buys in foreign currencies (EUR, JPY, GBP)', 'Spots 1-cent rounding errors instantly'],
    lastThought: 'Why does €49.99 * 1.087 equal €54.33913 in their payload? Fix your decimals!',
    speechBubble: null,
    speechBubbleIcon: 'exclamation',
    speechBubbleTimer: 0,
    x: 1030,
    y: 438,
    targetX: 960,
    targetY: 414,
    currentBuildingId: 'bank_tower',
    targetBuildingId: 'bank_tower',
    state: 'acting',
    actionCooldown: 2.4,
    preferredCurrency: 'EUR',
  },
  {
    id: 'joe',
    name: 'Grandpa Joe',
    archetype: 'Double-Click Veteran',
    avatarColor: '#94A3B8',
    secondaryColor: '#F1F5F9',
    budget: 310,
    initialBudget: 310,
    patience: 42,
    trust: 64,
    mood: 'annoyed',
    goals: ['Buy orthopedic slippers', 'Pay monthly utility invoice without getting confused'],
    quirks: ['Double-clicks every Pay button', 'Abandons if spinner takes over 3 seconds'],
    lastThought: 'Did the button click? Let me click Pay Now three more times just to be sure.',
    speechBubble: null,
    speechBubbleIcon: 'question',
    speechBubbleTimer: 0,
    x: 950,
    y: 556,
    targetX: 950,
    targetY: 530,
    currentBuildingId: 'rent_office',
    targetBuildingId: 'rent_office',
    state: 'acting',
    actionCooldown: 3.1,
    preferredCurrency: 'USD',
  },
  {
    id: 'bot_ring',
    name: 'The Bot Ring',
    archetype: '3 Hooded Velocity Bots',
    avatarColor: '#FF5D73',
    secondaryColor: '#FFE4E6',
    budget: 999,
    initialBudget: 999,
    patience: 100,
    trust: 20,
    mood: 'scheming',
    goals: ['Fire rapid $1.00 card-testing orders', 'Exploit unthrottled checkout & coupon stacking'],
    quirks: ['Moves as 3 synchronized hooded sprites', 'Spams POST /v2/checkout/orders in bursts'],
    lastThought: 'Executing batch velocity probe: 3x concurrent orders against /v2/checkout/orders.',
    speechBubble: null,
    speechBubbleIcon: 'exclamation',
    speechBubbleTimer: 0,
    x: 1140,
    y: 472,
    targetX: 595,
    targetY: 408,
    currentBuildingId: 'bank_tower',
    targetBuildingId: 'flawed_shop',
    state: 'walking',
    actionCooldown: 1.8,
    isBotRing: true,
    preferredCurrency: 'USD',
  },
];

export const CHAOS_BUTTONS: {
  id: ChaosType;
  label: string;
  subtitle: string;
  color: string;
  durationSec: number;
}[] = [
  {
    id: 'black_friday',
    label: 'Black Friday',
    subtitle: 'High traffic',
    color: '#E8765A',
    durationSec: 14,
  },
  {
    id: 'viral_tiktok',
    label: 'Viral Post',
    subtitle: '3x visitors',
    color: '#0070E0',
    durationSec: 14,
  },
  {
    id: 'fraud_ring',
    label: 'Fraud Ring',
    subtitle: 'Risky users',
    color: '#FF5D73',
    durationSec: 14,
  },
  {
    id: 'webhook_outage',
    label: 'Outage',
    subtitle: '50% failures',
    color: '#FFC439',
    durationSec: 14,
  },
  {
    id: 'currency_swing',
    label: 'FX Swing',
    subtitle: 'Multi-currency',
    color: '#7FB69E',
    durationSec: 14,
  },
];

export const DAVE_DRAMATIC_COMPLAINTS = [
  'Disputed $64.00 artisanal kettle: "Whistle sounded passive-aggressive in B-flat!"',
  'Disputed $48.50 mechanical keyboard: "Spacebar lacked emotional gravitas!"',
  'Disputed $89.00 smart lamp: "Cast a judgmental shadow across my foyer!"',
  'Disputed $39.99 velvet throw pillow: "Significantly less majestic than pictured!"',
  'Disputed $74.20 espresso tamper: "Weighted like a betrayal of Italian heritage!"',
];
