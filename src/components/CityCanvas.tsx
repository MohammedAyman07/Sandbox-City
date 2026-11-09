import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  Bug,
  Check,
  Coins,
  Copy,
  HelpCircle,
  Move,
  Sparkles,
  WifiOff,
  Zap,
} from 'lucide-react';
import { useSandboxStore } from '../store/useSandboxStore';
import {
  clampSpeechBubbleWords,
  ROAD_SEGMENTS,
  resolveCitizenPositions,
  STAGE_HEIGHT,
  STAGE_WIDTH,
} from '../utils/cityData';
import { deriveMetricsFromEventLog, isNightTime } from '../utils/simulationEngine';
import { Building, BuildingConfigKey } from '../types/sandbox';
import { CitizenSprite } from './CitizenSprite';

export const CityCanvas: React.FC = () => {
  const {
    citizens,
    selectedCitizenId,
    selectCitizen,
    selectedBuildingId,
    selectBuilding,
    coins,
    floatingSymbols,
    events,
    bugFlags,
    fixAndRerunAllBugs,
    activeChaos,
    simMinuteOfDay,
    calibrationMode,
    toggleCalibrationMode,
    buildings,
    roadWaypoints,
    updateHotspotPosition,
    updateRoadWaypointPosition,
    setMayorReportModalOpen,
  } = useSandboxStore();

  const stageRef = useRef<HTMLDivElement | null>(null);
  const [imgError, setImgError] = useState(false);
  const [hoveredBuildingId, setHoveredBuildingId] = useState<string | null>(null);
  const [hoveredCitizenId, setHoveredCitizenId] = useState<string | null>(null);
  const [animPhase, setAnimPhase] = useState(0);
  const [reducedMotion, setReducedMotion] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);

  // Dragging state for Calibration Mode (Press D)
  const [draggingItem, setDraggingItem] = useState<
    | { type: 'hotspot'; key: BuildingConfigKey }
    | { type: 'waypoint'; id: string }
    | null
  >(null);

  // Respect prefers-reduced-motion
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReducedMotion(mq.matches);
    const onChange = (e: MediaQueryListEvent) => setReducedMotion(e.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  // Keyboard shortcut: Press D to toggle Calibration Mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement | null)?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select') return;
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        toggleCalibrationMode();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [toggleCalibrationMode]);

  // Performance: requestAnimationFrame loop that pauses when the tab is hidden
  useEffect(() => {
    let rafId = 0;
    let lastTime = performance.now();
    let uiSyncAccum = 0;

    const loop = (now: number) => {
      const dtSec = Math.min(0.1, Math.max(0.001, (now - lastTime) / 1000));
      lastTime = now;

      if (!document.hidden) {
        useSandboxStore.getState().tickSimulation(dtSec);
        uiSyncAccum += dtSec;
        if (!reducedMotion && uiSyncAccum >= 0.04) {
          setAnimPhase((prev) => (prev + uiSyncAccum) % 1000);
          uiSyncAccum = 0;
        }
      }
      rafId = window.requestAnimationFrame(loop);
    };

    rafId = window.requestAnimationFrame(loop);
    return () => window.cancelAnimationFrame(rafId);
  }, [reducedMotion]);

  // Calibration pointer drag handlers
  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingItem || !stageRef.current) return;
    const rect = stageRef.current.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    const xPct = ((e.clientX - rect.left) / rect.width) * 100;
    const yPct = ((e.clientY - rect.top) / rect.height) * 100;

    if (draggingItem.type === 'hotspot') {
      updateHotspotPosition(draggingItem.key, xPct, yPct);
    } else {
      updateRoadWaypointPosition(draggingItem.id, xPct, yPct);
    }
  };

  const handleStagePointerUp = () => {
    if (draggingItem) setDraggingItem(null);
  };

  const metrics = useMemo(() => deriveMetricsFromEventLog(events), [events]);

  // Resolve citizen positions with 40px minimum separation repulsion + Bot Ring visibility rule
  const positionedCitizens = useMemo(
    () => resolveCitizenPositions(citizens, activeChaos, selectedCitizenId, 40),
    [citizens, activeChaos, selectedCitizenId]
  );

  // Enforce Speech Bubble rules: max 3 at once, collision-avoiding (>= 130px)
  const citizenIdsWithBubble = useMemo(() => {
    const candidates = positionedCitizens
      .filter((c) => Boolean(c.speechBubble) && c.speechBubbleTimer > 0)
      .sort((a, b) => b.speechBubbleTimer - a.speechBubbleTimer);

    const chosen: typeof candidates = [];
    for (const cand of candidates) {
      if (chosen.length >= 3) break;
      const tooClose = chosen.some(
        (other) =>
          Math.hypot(cand.renderX - other.renderX, cand.renderY - other.renderY) < 130
      );
      if (!tooClose) {
        chosen.push(cand);
      }
    }
    return new Set(chosen.map((c) => c.id));
  }, [positionedCitizens]);

  // Convert roadWaypoints percentages to pixel map for SVG road paths
  const waypointPixels = useMemo(() => {
    const map: Record<string, { x: number; y: number; xPct: number; yPct: number; label: string }> =
      {};
    for (const w of roadWaypoints) {
      map[w.id] = {
        x: Math.round((w.xPct / 100) * STAGE_WIDTH),
        y: Math.round((w.yPct / 100) * STAGE_HEIGHT),
        xPct: w.xPct,
        yPct: w.yPct,
        label: w.label,
      };
    }
    return map;
  }, [roadWaypoints]);

  // Day/Night cycle tied to simulation clock
  const nightActive = isNightTime(simMinuteOfDay);
  const hourOfDay = (simMinuteOfDay / 60) % 24;
  const isGoldenHour =
    !nightActive && ((hourOfDay >= 16.5 && hourOfDay < 19) || (hourOfDay >= 6.5 && hourOfDay <= 8));

  // Derive building status dot (green / amber / coral) from recent events
  const buildingStatuses = useMemo(() => {
    const statusMap: Record<
      string,
      { dotColor: string; statusLabel: string; hasActiveBug: boolean }
    > = {};

    for (const b of buildings) {
      const recentForBuilding = events.filter((e) => e.buildingId === b.id).slice(0, 8);
      const hasActiveBug = b.relatedFlags.some((flagKey) => bugFlags[flagKey]);
      const hasErrorEvent = recentForBuilding.some(
        (e) => e.httpStatus >= 400 || e.type === 'abandon' || e.type === 'dispute'
      );
      const hasWarningEvent = recentForBuilding.some(
        (e) => e.type === 'refund_request' || e.latencyMs > 1000
      );

      let dotColor = '#3DDC97'; // green healthy
      let statusLabel = 'Healthy';
      if (hasErrorEvent || hasActiveBug) {
        dotColor = '#FF5D73'; // coral issue
        statusLabel = 'Issues detected';
      } else if (hasWarningEvent) {
        dotColor = '#FFC439'; // amber warning
        statusLabel = 'Elevated latency';
      }

      statusMap[b.id] = { dotColor, statusLabel, hasActiveBug };
    }
    return statusMap;
  }, [buildings, events, bugFlags]);

  // Calibration JSON string for copy-paste
  const calibrationJson = useMemo(() => {
    if (!calibrationMode) return '';
    return JSON.stringify(
      {
        hotspots: buildings.map((b) => ({
          key: b.configKey,
          id: b.id,
          name: b.name,
          xPct: b.xPct,
          yPct: b.yPct,
          entranceXPct: b.entranceXPct,
          entranceYPct: b.entranceYPct,
        })),
        roadWaypoints: roadWaypoints.map((w) => ({
          id: w.id,
          label: w.label,
          xPct: w.xPct,
          yPct: w.yPct,
        })),
      },
      null,
      2
    );
  }, [calibrationMode, buildings, roadWaypoints]);

  const handleCopyCalibrationJson = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(calibrationJson);
      setCopiedJson(true);
      window.setTimeout(() => setCopiedJson(false), 1800);
    }
  };

  const shopBuilding: Building =
    buildings.find((b) => b.id === 'flawed_shop') || buildings[0];

  const roadAvenueY = waypointPixels.road_bank?.y ?? 477;

  return (
    <div
      ref={stageRef}
      data-testid="sandbox-city-stage"
      onPointerMove={handleStagePointerMove}
      onPointerUp={handleStagePointerUp}
      className="relative w-[1920px] h-[1080px] overflow-hidden select-none"
    >
      {/* 1. Full-stage Background Artwork (city.png) with Outage grayscale filter & Fallback */}
      <div
        className="absolute inset-0 transition-all duration-500"
        style={{
          filter:
            activeChaos === 'webhook_outage'
              ? 'grayscale(0.7) contrast(0.95)'
              : nightActive
                ? 'brightness(0.82) saturate(0.92)'
                : 'none',
        }}
      >
        {!imgError ? (
          <img
            src="/assets/aistudio/CITY_a9a783b3.jpg"
            alt="Sandbox City Miniature Isometric Island"
            referrerPolicy="no-referrer"
            onError={() => setImgError(true)}
            className="w-full h-full object-cover pointer-events-none"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-[#FFF4E0] via-[#F2E9D4] to-[#7FB69E] flex items-center justify-center">
            <div className="warm-panel px-6 py-4 text-center">
              <p className="font-display text-lg font-bold text-[#1F2340]">
                Sandbox City Artwork Stage
              </p>
              <p className="text-xs font-semibold text-[#1F2340]/70">
                Warm cream-to-sage fallback stage active (city.png unavailable).
              </p>
            </div>
          </div>
        )}
      </div>

      {/* 2. Day/Night Cycle & Scenario Mood Overlays (CSS filters and blend modes) */}
      {/* Normal / Golden Hour Warmth */}
      {isGoldenHour && !activeChaos && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none transition-opacity duration-700"
          style={{
            background:
              'radial-gradient(circle at 45% 35%, rgba(255, 196, 57, 0.16), rgba(232, 118, 90, 0.12) 65%, transparent 100%)',
            mixBlendMode: 'multiply',
          }}
        />
      )}

      {/* Night Overlay + Lit Building Windows */}
      {nightActive && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none transition-opacity duration-700 z-10"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(20, 27, 52, 0.25), rgba(11, 16, 32, 0.52) 85%)',
          }}
        >
          {buildings.map((b) => (
            <div
              key={`night_glow_${b.id}`}
              style={{
                left: `${b.xPct}%`,
                top: `${b.yPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute w-32 h-24 rounded-full bg-[#FFC439]/30 blur-xl"
            />
          ))}
        </div>
      )}

      {/* Scenario Mood: Black Friday (Crimson overlay + Siren light sweep) */}
      {activeChaos === 'black_friday' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none z-10 overflow-hidden"
        >
          <div
            className="absolute inset-0"
            style={{
              background:
                'radial-gradient(circle at 40% 40%, rgba(255, 93, 115, 0.22), rgba(232, 118, 90, 0.28) 70%)',
              mixBlendMode: 'multiply',
            }}
          />
          {/* Siren Light Sweep */}
          <div
            style={{
              transform: `translateX(${Math.sin(animPhase * 3.2) * 550}px) rotate(18deg)`,
            }}
            className="absolute -top-32 left-1/2 w-56 h-[1400px] bg-gradient-to-r from-transparent via-[#FF5D73]/30 to-transparent blur-xl"
          />
        </div>
      )}

      {/* Scenario Mood: Fraud Ring (Darker vignette + Spotlights on hooded sprites) */}
      {activeChaos === 'fraud_ring' && (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none z-10"
          style={{
            background:
              'radial-gradient(circle at 50% 45%, rgba(15, 18, 38, 0.15) 25%, rgba(11, 16, 32, 0.68) 85%)',
          }}
        />
      )}

      {/* Scenario Mood: Webhook Outage Banner */}
      {activeChaos === 'webhook_outage' && (
        <div
          role="status"
          aria-label="Webhook Outage Active Banner"
          className="absolute top-[102px] left-1/2 -translate-x-1/2 z-30 px-5 py-2 rounded-full bg-[#1F2340]/95 text-[#FFC439] border-2 border-[#FFC439] shadow-lg flex items-center gap-2.5"
        >
          <WifiOff className="w-4 h-4 text-[#FF5D73] animate-pulse" />
          <span className="font-mono text-xs font-bold tracking-wide">
            OUTAGE ACTIVE: 50% FAILURES · ROAD FLICKER &amp; FROZEN COINS
          </span>
        </div>
      )}

      {/* 3. SVG Layer for Road Paths, Animated Money Flow, Coins, Sparkle Bursts, Coral Shards & Scenario Particles */}
      <svg
        viewBox="0 0 1920 1080"
        className="absolute inset-0 w-full h-full pointer-events-none z-15"
      >
        <defs>
          <filter id="coinGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feDropShadow dx="0" dy="2" stdDeviation="4" floodColor="#0070E0" floodOpacity="0.45" />
          </filter>
          <filter id="roadFlowGlow" x="-20%" y="-20%" width="140%" height="140%">
            <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#0070E0" floodOpacity="0.55" />
          </filter>
        </defs>

        {/* Road Network Base & Animated Dashed Blue Money-Flow Line (dashoffset) */}
        {ROAD_SEGMENTS.map((seg) => {
          const from = waypointPixels[seg.fromWaypointId];
          const to = waypointPixels[seg.toWaypointId];
          if (!from || !to) return null;
          const d = `M ${from.x} ${from.y} L ${to.x} ${to.y}`;
          const isOutage = activeChaos === 'webhook_outage';
          const flickerOpacity = isOutage
            ? 0.25 + Math.abs(Math.sin(animPhase * 14)) * 0.65
            : 0.78;
          const dashOffset = reducedMotion || isOutage ? 0 : -(animPhase * 48) % 44;

          return (
            <g key={seg.id}>
              {/* Subtle Road Track Guide */}
              <path
                d={d}
                fill="none"
                stroke="rgba(255, 248, 234, 0.28)"
                strokeWidth="7"
                strokeLinecap="round"
              />
              {/* Animated Dashed Blue Money Flow */}
              <path
                d={d}
                fill="none"
                stroke={isOutage ? '#FF5D73' : '#0070E0'}
                strokeWidth="3.5"
                strokeLinecap="round"
                strokeDasharray="10 12"
                strokeDashoffset={dashOffset}
                opacity={flickerOpacity}
                filter="url(#roadFlowGlow)"
              />
            </g>
          );
        })}

        {/* Viral Post & Black Friday Extra Streaming Visitor Sprites on Road Edges */}
        {(activeChaos === 'viral_tiktok' || activeChaos === 'black_friday') &&
          [0, 1, 2, 3].map((idx) => {
            const fromLeft = idx % 2 === 0;
            const startX = fromLeft ? 230 : 1680;
            const startY = fromLeft ? 438 : 508;
            const t = reducedMotion ? 0.5 : (animPhase * 0.45 + idx * 0.25) % 1;
            const vx = startX + (shopBuilding.entranceX - startX) * t;
            const vy = startY + (shopBuilding.entranceY - startY) * t;
            return (
              <g
                key={`surge_visitor_${idx}`}
                transform={`translate(${vx}, ${vy - Math.abs(Math.sin(animPhase * 10 + idx)) * 4})`}
              >
                <ellipse cx="0" cy="14" rx="9" ry="3.5" fill="rgba(31,35,64,0.25)" />
                <rect
                  x="-6"
                  y="-2"
                  width="12"
                  height="13"
                  rx="6"
                  fill={activeChaos === 'viral_tiktok' ? '#0070E0' : '#E8765A'}
                  stroke="#FFF8EA"
                  strokeWidth="1.5"
                />
                <circle
                  cx="0"
                  cy="-7"
                  r="5.5"
                  fill="#FFE5C8"
                  stroke="#1F2340"
                  strokeWidth="1.4"
                />
                {activeChaos === 'viral_tiktok' && (
                  <circle cx="8" cy="-12" r="3" fill="#FFC439" />
                )}
              </g>
            );
          })}

        {/* Fraud Ring Spotlight Cones on the Hooded Bot Ring Sprites */}
        {activeChaos === 'fraud_ring' &&
          positionedCitizens
            .filter((c) => c.isBotRing)
            .map((bot) => (
              <g key={`spotlight_${bot.id}`}>
                <polygon
                  points={`${bot.renderX - 90},0 ${bot.renderX + 90},0 ${bot.renderX + 48},${bot.renderY + 18} ${bot.renderX - 48},${bot.renderY + 18}`}
                  fill="rgba(255, 93, 115, 0.16)"
                />
                <ellipse
                  cx={bot.renderX}
                  cy={bot.renderY + 14}
                  rx="48"
                  ry="18"
                  fill="rgba(255, 93, 115, 0.26)"
                  stroke="#FF5D73"
                  strokeWidth="2"
                  strokeDasharray="6 4"
                />
              </g>
            ))}

        {/* Viral Post Floating Sparkles */}
        {activeChaos === 'viral_tiktok' &&
          [0, 1, 2, 3, 4, 5].map((i) => {
            const sx = shopBuilding.x - 110 + ((i * 67) % 240);
            const sy =
              shopBuilding.y -
              70 +
              ((i * 43) % 160) -
              ((animPhase * 28 + i * 15) % 45);
            return (
              <g key={`viral_sparkle_${i}`} transform={`translate(${sx}, ${sy})`}>
                <path
                  d="M 0 -8 L 2 -2 L 8 0 L 2 2 L 0 8 L -2 2 L -8 0 L -2 -2 Z"
                  fill={i % 2 === 0 ? '#FFC439' : '#3DDC97'}
                  stroke="#FFF8EA"
                  strokeWidth="1"
                />
              </g>
            );
          })}

        {/* Active Coins, Success Mint Sparkle Bursts, and Failed Coral Shards + HTTP Status Tags */}
        {coins.map((coin) => {
          if (coin.progress < 0) return null;
          const p = Math.max(0, Math.min(1, coin.progress));

          // Route coin along the central road avenue
          let cx = coin.fromX + (coin.toX - coin.fromX) * p;
          let cy = coin.fromY + (coin.toY - coin.fromY) * p;
          if (Math.abs(coin.fromY - coin.toY) > 45 || Math.abs(coin.fromX - coin.toX) > 120) {
            if (p < 0.25) {
              const t = p / 0.25;
              cx = coin.fromX;
              cy = coin.fromY + (roadAvenueY - coin.fromY) * t;
            } else if (p < 0.75) {
              const t = (p - 0.25) / 0.5;
              cx = coin.fromX + (coin.toX - coin.fromX) * t;
              cy = roadAvenueY;
            } else {
              const t = (p - 0.75) / 0.25;
              cx = coin.toX;
              cy = roadAvenueY + (coin.toY - roadAvenueY) * t;
            }
          }

          // Arrival effect state (progress >= 1 and effectTimer > 0)
          if (coin.progress >= 1 && coin.effectTimer > 0) {
            const burstProgress = 1 - coin.effectTimer / 2.0; // 0..1 over 2 seconds
            if (coin.status === 'failed') {
              // Failure: Coin cracks into coral shards + HTTP status tag (422, 500) for 2 seconds
              const statusCode = coin.httpStatus || 422;
              const shardSpread = 12 + burstProgress * 28;
              return (
                <g key={coin.id} transform={`translate(${coin.toX}, ${coin.toY})`}>
                  {/* 4 jagged coral shards */}
                  {[
                    { dx: -1, dy: -0.8, rot: -25 },
                    { dx: 1, dy: -0.7, rot: 30 },
                    { dx: -0.9, dy: 0.8, rot: -40 },
                    { dx: 0.9, dy: 0.9, rot: 22 },
                  ].map((sh, idx) => (
                    <polygon
                      key={idx}
                      points="-6,-5 5,-2 2,6 -5,4"
                      fill="#FF5D73"
                      stroke="#FFF8EA"
                      strokeWidth="1.2"
                      opacity={Math.max(0.15, coin.effectTimer / 2)}
                      transform={`translate(${sh.dx * shardSpread}, ${sh.dy * shardSpread}) rotate(${sh.rot})`}
                    />
                  ))}
                  {/* HTTP Status Tag (422, 500) visible for 2 seconds */}
                  <g transform={`translate(0, ${-24 - burstProgress * 16})`}>
                    <rect
                      x="-36"
                      y="-12"
                      width="72"
                      height="22"
                      rx="8"
                      fill="#FF5D73"
                      stroke="#FFF8EA"
                      strokeWidth="2"
                    />
                    <text
                      y="3"
                      textAnchor="middle"
                      fill="#FFFFFF"
                      fontSize="11"
                      fontWeight="800"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      HTTP {statusCode}
                    </text>
                  </g>
                </g>
              );
            }

            // Success: Mint sparkle burst at the bank / target building
            const ringRadius = 14 + burstProgress * 30;
            return (
              <g key={coin.id} transform={`translate(${coin.toX}, ${coin.toY})`}>
                <circle
                  r={ringRadius}
                  fill="none"
                  stroke="#3DDC97"
                  strokeWidth="3"
                  opacity={Math.max(0.1, coin.effectTimer / 2)}
                />
                {[0, 60, 120, 180, 240, 300].map((deg) => {
                  const rad = (deg * Math.PI) / 180;
                  const sx = Math.cos(rad) * (10 + burstProgress * 26);
                  const sy = Math.sin(rad) * (10 + burstProgress * 26);
                  return (
                    <circle
                      key={deg}
                      cx={sx}
                      cy={sy}
                      r="3.5"
                      fill="#3DDC97"
                      stroke="#FFF8EA"
                      strokeWidth="1"
                      opacity={Math.max(0.15, coin.effectTimer / 2)}
                    />
                  );
                })}
              </g>
            );
          }

          // Travelling Gold Coin along the road
          const outerStroke =
            coin.status === 'failed'
              ? '#FF5D73'
              : coin.status === 'stalled'
                ? '#FFC439'
                : '#0070E0';

          return (
            <g key={coin.id} transform={`translate(${cx}, ${cy})`} filter="url(#coinGlow)">
              <circle r="13.5" fill={outerStroke} stroke="#FFF8EA" strokeWidth="2" />
              <circle r="10" fill="#FFC439" />
              <text
                y="3.5"
                textAnchor="middle"
                fill="#1F2340"
                fontSize="10.5"
                fontWeight="800"
                fontFamily="JetBrains Mono, monospace"
              >
                {coin.currencySymbol}
              </text>
            </g>
          );
        })}

        {/* Floating Currency Symbols ($ € £ ¥) during FX Swing */}
        {floatingSymbols.map((sym) => (
          <text
            key={sym.id}
            x={sym.x}
            y={sym.y}
            fill={sym.color}
            opacity={sym.alpha}
            fontSize="26"
            fontWeight="800"
            fontFamily="Fraunces, serif"
          >
            {sym.symbol}
          </text>
        ))}
      </svg>

      {/* 4. MAYOR'S REPORT BUBBLE (Anchored near The Flawed Shop) */}
      <div
        aria-label="Mayor's Report Floating Bubble"
        className="absolute left-[335px] top-[98px] warm-panel px-4 py-2.5 flex items-center gap-3 z-25 border-2 border-[#E8765A]/45"
      >
        <button
          type="button"
          onClick={() => setMayorReportModalOpen(true)}
          aria-label="Open Mayor's Report"
          className="flex items-center gap-3 text-left hover:opacity-85 transition-opacity cursor-pointer"
        >
          <div className="w-9 h-9 rounded-2xl bg-[#FF5D73]/18 border border-[#FF5D73]/40 flex items-center justify-center shrink-0">
            <Bug className="w-5 h-5 text-[#FF5D73]" />
          </div>
          <div>
            <div className="font-display text-sm font-bold text-[#1F2340] leading-tight underline decoration-[#E8765A]/50 underline-offset-2">
              Mayor&apos;s report: {metrics.bugsFoundCount} bugs found
            </div>
            <div className="text-[11px] font-semibold text-[#1F2340]/70">
              {metrics.bugImpactedEventsCount} citizen checkouts impacted · View report
            </div>
          </div>
        </button>
        <button
          type="button"
          onClick={fixAndRerunAllBugs}
          className="ml-1 px-3.5 py-2 rounded-xl bg-[#0070E0] hover:bg-[#005bb5] text-white text-xs font-bold flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer whitespace-nowrap"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>Fix and rerun</span>
        </button>
        <div
          aria-hidden="true"
          className="w-3.5 h-3.5 bg-[#FFF8EA] border-r border-b border-[#E8765A]/45 rotate-45 absolute -bottom-2 left-28"
        />
      </div>

      {/* 5. Six Building Hotspots (Percentage Coordinates, Status Dot, Warning Spark, Hover Glow + Name Tag) */}
      {buildings.map((b) => {
        const isSelected = selectedBuildingId === b.id;
        const isHovered = hoveredBuildingId === b.id;
        const statusInfo = buildingStatuses[b.id] || {
          dotColor: '#3DDC97',
          statusLabel: 'Healthy',
          hasActiveBug: false,
        };

        return (
          <div
            key={b.id}
            style={{
              left: `${b.xPct}%`,
              top: `${b.yPct}%`,
              width: `${b.width}px`,
              height: `${b.height}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className="absolute z-20 pointer-events-none"
          >
            {/* Interactive Building Footprint Button */}
            <button
              type="button"
              onClick={() => selectBuilding(b.id)}
              onMouseEnter={() => setHoveredBuildingId(b.id)}
              onMouseLeave={() => setHoveredBuildingId(null)}
              onFocus={() => setHoveredBuildingId(b.id)}
              onBlur={() => setHoveredBuildingId(null)}
              aria-label={`Select building ${b.name} (${statusInfo.statusLabel})`}
              title={`${b.name} — ${b.subtitle} (${statusInfo.statusLabel})`}
              className={`pointer-events-auto w-full h-full rounded-3xl transition-all duration-200 cursor-pointer relative ${
                isSelected
                  ? 'ring-2 ring-[#0070E0]/75 bg-[#0070E0]/8 shadow-[0_0_32px_rgba(0,112,224,0.32)]'
                  : isHovered
                    ? 'ring-2 ring-[#FFF8EA]/90 bg-[#FFF8EA]/18 shadow-[0_0_28px_rgba(255,196,57,0.5)]'
                    : 'bg-transparent hover:bg-[#FFF8EA]/10'
              }`}
            >
              {/* Status Dot + Flickering Bug Warning Spark + Name Tag above the building */}
              <div
                className={`absolute -top-4 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-2.5 py-0.5 rounded-full border shadow-md transition-all ${
                  isSelected
                    ? 'bg-[#0070E0] text-white border-white/80 scale-105'
                    : isHovered
                      ? 'bg-[#FFF8EA] text-[#1F2340] border-[#0070E0]/40 scale-105'
                      : 'bg-[#FFF8EA]/92 text-[#1F2340] border-[#1F2340]/20'
                }`}
              >
                <span
                  aria-label={`${b.name} status: ${statusInfo.statusLabel}`}
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{
                    backgroundColor: statusInfo.dotColor,
                    boxShadow: `0 0 8px ${statusInfo.dotColor}`,
                  }}
                />
                {statusInfo.hasActiveBug && (
                  <span
                    title="Active Bug Flag affecting this building"
                    className="flex items-center text-[#E8765A] animate-pulse"
                  >
                    <Zap className="w-3.5 h-3.5 fill-[#FFC439] text-[#E8765A]" />
                  </span>
                )}
                {(isHovered || isSelected || true) && (
                  <span className="font-display text-[11px] font-bold whitespace-nowrap">
                    {b.name}
                  </span>
                )}
              </div>
            </button>
          </div>
        );
      })}

      {/* 6. Animated SVG Character Sprites (Min 40px Separation, Conditional Name Tag, Queued 8-Word Speech Bubbles) */}
      {positionedCitizens.map((c) => {
        const isSelected = selectedCitizenId === c.id;
        const isHovered = hoveredCitizenId === c.id;
        const showBubble = Boolean(c.speechBubble && citizenIdsWithBubble.has(c.id));
        const showNameTag = isHovered || isSelected || showBubble;
        const bubbleText = clampSpeechBubbleWords(c.speechBubble, 8);

        return (
          <div
            key={c.id}
            style={{
              left: `${c.renderX}px`,
              top: `${c.renderY}px`,
              transform: 'translate(-50%, -50%)',
            }}
            className={`absolute transition-all duration-150 ease-linear ${
              isSelected || isHovered || showBubble ? 'z-30' : 'z-22'
            }`}
          >
            {/* Speech Bubble: max 3 at once, max 8 words, auto-dismiss after 3s, collision-avoiding, with small icon */}
            {showBubble && bubbleText && (
              <div
                role="status"
                className="pointer-events-none absolute bottom-[58px] left-1/2 -translate-x-1/2 px-2.5 py-1 rounded-xl bg-[#FFF8EA] border border-[#1F2340]/25 shadow-lg flex items-center gap-1.5 whitespace-nowrap z-30"
              >
                {c.speechBubbleIcon === 'exclamation' ? (
                  <AlertCircle className="w-3.5 h-3.5 text-[#FF5D73] shrink-0" />
                ) : c.speechBubbleIcon === 'question' ? (
                  <HelpCircle className="w-3.5 h-3.5 text-[#0070E0] shrink-0" />
                ) : (
                  <Coins className="w-3.5 h-3.5 text-[#E8765A] shrink-0" />
                )}
                <span className="text-[11px] font-bold text-[#1F2340]">{bubbleText}</span>
              </div>
            )}

            <button
              type="button"
              onClick={() => selectCitizen(isSelected ? null : c.id)}
              onMouseEnter={() => setHoveredCitizenId(c.id)}
              onMouseLeave={() => setHoveredCitizenId(null)}
              onFocus={() => setHoveredCitizenId(c.id)}
              onBlur={() => setHoveredCitizenId(null)}
              aria-label={`Map citizen ${c.name}`}
              title={`${c.name} (${c.archetype}) — ${c.lastThought}`}
              className={`group relative flex flex-col items-center cursor-pointer transition-transform ${
                isSelected ? 'scale-115' : 'hover:scale-110'
              }`}
            >
              <CitizenSprite
                id={c.id}
                avatarColor={c.avatarColor}
                secondaryColor={c.secondaryColor}
                mood={c.mood}
                isWalking={c.state === 'walking'}
                isSelected={isSelected}
                isBotRing={c.isBotRing}
                animPhase={animPhase}
                reducedMotion={reducedMotion}
              />

              {/* Name Tag: shown ONLY on hover, on click, or while the citizen is speaking */}
              {showNameTag && (
                <span
                  className={`-mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold leading-none whitespace-nowrap shadow-sm ${
                    isSelected
                      ? 'bg-[#0070E0] text-white'
                      : 'bg-[#FFF8EA]/95 text-[#1F2340] border border-[#1F2340]/20'
                  }`}
                >
                  {c.name}
                </span>
              )}
            </button>
          </div>
        );
      })}

      {/* 7. CALIBRATION MODE OVERLAY (Press D to toggle draggable markers & live JSON config) */}
      {calibrationMode && (
        <>
          {/* Draggable Building Hotspot Markers */}
          {buildings.map((b) => (
            <button
              key={`cal_hotspot_${b.configKey}`}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingItem({ type: 'hotspot', key: b.configKey });
              }}
              style={{
                left: `${b.xPct}%`,
                top: `${b.yPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute z-50 px-2.5 py-1 rounded-lg bg-[#E8765A] text-white font-mono text-[11px] font-bold shadow-lg border-2 border-white flex items-center gap-1 cursor-grab active:cursor-grabbing"
            >
              <Move className="w-3 h-3" />
              <span>
                {b.configKey} ({b.xPct.toFixed(1)}%, {b.yPct.toFixed(1)}%)
              </span>
            </button>
          ))}

          {/* Draggable Road Waypoint Markers */}
          {roadWaypoints.map((w) => (
            <button
              key={`cal_wp_${w.id}`}
              type="button"
              onPointerDown={(e) => {
                e.stopPropagation();
                setDraggingItem({ type: 'waypoint', id: w.id });
              }}
              style={{
                left: `${w.xPct}%`,
                top: `${w.yPct}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute z-50 px-2 py-0.5 rounded-full bg-[#0070E0] text-white font-mono text-[10px] font-bold shadow-md border-2 border-[#FFC439] flex items-center gap-1 cursor-grab active:cursor-grabbing"
            >
              <span className="w-2 h-2 rounded-full bg-[#FFC439]" />
              <span>
                {w.id} ({w.xPct.toFixed(1)}%, {w.yPct.toFixed(1)}%)
              </span>
            </button>
          ))}

          {/* Live Copyable JSON Config Panel */}
          <div
            role="dialog"
            aria-label="Calibration Mode JSON Config"
            className="absolute left-[335px] top-[175px] w-[440px] warm-panel p-4 z-50 border-2 border-[#0070E0] shadow-2xl"
          >
            <div className="flex items-center justify-between gap-2 mb-2">
              <div>
                <h3 className="font-display text-sm font-bold text-[#1F2340]">
                  Calibration Mode (Press D to close)
                </h3>
                <p className="text-[11px] font-semibold text-[#1F2340]/70">
                  Drag building hotspots or road waypoints on the stage to update JSON.
                </p>
              </div>
              <button
                type="button"
                onClick={handleCopyCalibrationJson}
                className="px-3 py-1.5 rounded-xl bg-[#0070E0] hover:bg-[#005bb5] text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer shrink-0"
              >
                {copiedJson ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy JSON</span>
                  </>
                )}
              </button>
            </div>
            <textarea
              readOnly
              aria-label="Calibration Config JSON Output"
              value={calibrationJson}
              className="w-full h-[210px] p-2.5 rounded-xl bg-[#1F2340] text-[#FFF4E0] font-mono text-[11px] leading-relaxed resize-none focus:outline-none"
            />
          </div>
        </>
      )}
    </div>
  );
};
