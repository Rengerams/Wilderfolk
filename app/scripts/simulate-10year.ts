/**
 * Headless 10 in-game year balance pass — exercises buildings, research, forge,
 * diplomacy, raids, visitors, and rival actions with extensive logging.
 *
 * Run: npm run simulate:10year  (or simulate:20year for v0.5 ship gate)
 * Env:
 *   SIM_YEARS          — in-game years for official balance test (default 10; v0.5 gate = 20)
 *   SIM_PROFILE        — village | town (default) | eco — growth pacing (pop range is INFO only)
 *                      (town @10y: ~160–230; mid-Y0 often 170+ once housing + rep stack)
 *   SIM_LOG_FILE       — write full log to path (default: scripts/logs/sim-<years>year-<profile>-<timestamp>.txt)
 *   SIM_CHRONICLE_FILE — flat chronicle export path (default: scripts/logs/sim-<years>year-<profile>-chronicle-<timestamp>.txt)
 *   SIM_LOG_EVENTS     — 1 = include full grouped chronicle in main log (default 1); 0 = summary counts only
 *   SIM_LOG_LIFE       — 1 = stream pregnancies/births/deaths/marriages live (default 1); 0 = off
 *   SIM_STAFF_EVERY    — auto-staff interval in ticks (default 120); also staffs after placements
 *   SIM_INSTANT_BUILD  — 1 = skip construction time (old cheat mode); default off
 *   SIM_BUILD_EVERY    — auto_build interval in ticks (default ~3 game days; also tries day 1)
 *   SIM_MAX_HOUSES_YEAR — max House placements per game year (default 5)
 *   SIM_GROWTH_EVERY   — recruit attempt interval (default ~30 game days)
 *   SIM_EVENT_LOG_MAX  — cap in-memory chronicle entries (default 5000; newest kept)
 *   SIM_LIFE_LOG_FILE  — dedicated life-events path (default: <main-log>-life.txt)
 *   SIM_VERBOSE        — 1 = log every player action to console (default 0)
 *   SIM_STRICT_COVERAGE — 1 = exit 1 if any option category untested
 *   PROGRESS_EVERY     — live heartbeat interval in ticks (default 360 = 15 game days)
 *   PERF_SAMPLE_EVERY  — perf sample interval in ticks (default 8640 = 1 game year)
 *   SIM_MAX_TICKS      — dev smoke only (shorter run). Unset for the official 10-year balance test.
 *   SIM_FULL_SIM       — 1 = no viewport throttle (slowest; old behavior)
 *   SIM_ZOOM           — viewport zoom for focus box (default 0.45, matches typical play)
 *   SIM_USE_WORKER     — 1 = worker_threads (slower; use npm run simulate:10year:worker); default via run-sim = 0 (fast main-thread)
 *   SIM_HEADLESS       — 1 = compact syncSimPrep + no render SoA (default for worker sims); 0 = full importSave + render pack
 *   SIM_BUILD_DENY     — comma list or presets: defense, security, economy, housing, civic, infra (e.g. defense)
 *   SIM_BUILD_ALLOW    — whitelist only these types/presets (overrides deny)
 *   SIM_BUILD_DEFENSE  — 0 = skip walls, barracks, watchtowers (same as SIM_BUILD_DENY=defense)
 *
 * Plays by the same rules as a human: initGame defaults (resources, map, storage, pop cap from housing),
 * real construction times, no resource grants, no injected rivals/visitors/raids, no coverage sweeps.
 * autoBuildFree picks types from village needs when the player could afford them.
 */
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  initGame,
  recruitSettler,
  startBuilding,
  getSeason,
  assignAllWorkers,
  assignIdleWorkerToBuilding,
  getOccupationForBuilding,
  BuildingType,
  BUILDING_CONFIGS,
  Season,
  computePopulationCounts,
  formatPopulationBrief,
} from '../src/game/gameEngine';
import { canAffordResourceCost } from '../src/game/resourceCost';
import { findBuildSpot, tryPlaceBuilding, tryPlaceWallChain } from './simBuildUtils';
import {
  describeSimBuildPolicy,
  isSimBuildAllowed,
  parseSimBuildPolicy,
} from './simBuildPolicy';
import {
  buildChronicleMeta,
  formatEventSummaryLines,
  formatGroupedChronicleLines,
  formatCombatReportLines,
  writeChronicleFile,
} from './simEventLog';
import type { WorldState, BuildingType as BuildingTypeName } from '../src/game/gameTypes';
import { EntityType, JobType } from '../src/game/gameTypes';
import { createInitialResearchNodes } from '../src/game/gameTypes';
import {
  isPlayerHuman,
  respondToDiplomacyEvent,
  getDiplomacyChoiceEligibility,
  sendRivalGift,
  establishRivalTradePact,
  showStrengthToRival,
  signPeaceTreaty,
  talkToVisitorLeader,
  tradeWithVisitors,
  negotiateRefugees,
  spawnRivalSettlement,
  spawnVisitorGroup,
  isRivalAtPeace,
  type VisitorTradeAction,
  type RefugeeChoice,
} from '../src/game/groupEvents';
import type { DiplomacyEvent, DiplomacyEventKind, VisitorKind } from '../src/game/gameTypes';
import type { RaidEvent } from '../src/game/frontierCombat';
import {
  respondToRaidEvent,
  launchRaidOnRival,
  canLaunchRaidOnRival,
  getMilitiaStrength,
  getBarricadeStrength,
  resolveDefenseRatio,
  type RaidOutcomeTier,
} from '../src/game/frontierCombat';
import { computeMilitiaBreakdown } from '../src/game/militiaBalance';
import { countCompletedDefenseBuildings, getWallSegmentBonus } from '../src/game/defenseStructures';
import { startResearch, syncResearchUnlocks } from '../src/game/research';
import {
  FORGE_ORDERS,
  getForgeBlockReason,
  isForgeOrderComplete,
  queueForgeOrder,
  type ForgeOrderId,
} from '../src/game/forge';
import {
  TICKS_PER_DAY,
  DAYS_PER_YEAR,
  getResidenceCapacity,
  isResidenceBuildingType,
  isImprisoned,
} from '../src/game/dayCycle';
import { getGrazingPressureReport } from '../src/game/ecosystemPressure';
import { hasStoneSpears, hasIronSpears } from '../src/game/combat';
import { getSimFocus } from './simFocus';
import {
  advanceSimTick,
  disposeSimWorkerHost,
  initSimWorkerHost,
  simUsesWorker,
  simHeadless,
} from './simWorkerRuntime';
import { saveJuiceEffectsEnabled } from '../src/game/preferences';
import { formatCitizenName } from '../src/game/citizenId';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { getNamePoolInfo, loadNames } from '../src/game/nameLoader';

const TICKS_PER_YEAR = TICKS_PER_DAY * DAYS_PER_YEAR;
const SIM_YEARS = Math.max(1, parseInt(process.env.SIM_YEARS ?? '10', 10) || 10);
/** Official balance test length: SIM_YEARS in-game years (winters + Y<n> gates). */
const FULL_BALANCE_TICKS = (TICKS_PER_YEAR * 1.2) * SIM_YEARS;
const WINTER_ENTER_TICK = 270 * TICKS_PER_DAY;
const TOTAL_TICKS = process.env.SIM_MAX_TICKS
  ? Math.max(1, parseInt(process.env.SIM_MAX_TICKS, 10) || FULL_BALANCE_TICKS)
  : FULL_BALANCE_TICKS;
const IS_SMOKE_RUN = Boolean(process.env.SIM_MAX_TICKS) && TOTAL_TICKS < FULL_BALANCE_TICKS;
const IS_FULL_BALANCE_RUN = !IS_SMOKE_RUN && TOTAL_TICKS >= FULL_BALANCE_TICKS;

type SimProfile = 'village' | 'town' | 'eco';

const RAW_PROFILE = (process.env.SIM_PROFILE ?? 'town').toLowerCase();
const SIM_PROFILE: SimProfile = RAW_PROFILE === 'village' || RAW_PROFILE === 'eco' ? RAW_PROFILE : 'town';

type ProfileConfig = {
  label: string;
  popMin: number;
  popMax: number;
  ecoMin: number;
  ecoMax: number;
  grantMultiplier: number;
  autoRecruit: boolean;
  autoHouses: boolean;
  housesPerYear: number;
  maxRecruitsPerYear: number;
  preferEcoBuildings: boolean;
  skipRoadCoverage: boolean;
};

/** Reference span for pop gates — scaled when SIM_YEARS ≠ 10 (e.g. 20-year ship gate). */
const POP_GATE_YEARS_REF = 10;

const PROFILE_CONFIG: Record<SimProfile, ProfileConfig> = {
  village: {
    label: 'Village (minimum viable)',
    popMin: 95,
    popMax: 540,
    ecoMin: 30,
    ecoMax: 100,
    grantMultiplier: 0.65,
    autoRecruit: true,
    autoHouses: true,
    housesPerYear: 5,
    maxRecruitsPerYear: 5,
    preferEcoBuildings: false,
    skipRoadCoverage: false,
  },
  town: {
    label: 'Town (default balance pass)',
    popMin: 160,
    popMax: 530,
    ecoMin: 35,
    ecoMax: 60,
    grantMultiplier: 1,
    autoRecruit: true,
    autoHouses: true,
    housesPerYear: 5,
    maxRecruitsPerYear: 3,
    preferEcoBuildings: false,
    skipRoadCoverage: true,
  },
  eco: {
    label: 'Eco path',
    popMin: 100,
    popMax: 845,
    ecoMin: 65,
    ecoMax: 100,
    grantMultiplier: 0.7,
    autoRecruit: true,
    autoHouses: true,
    housesPerYear: 5,
    maxRecruitsPerYear: 4,
    preferEcoBuildings: true,
    skipRoadCoverage: true,
  },
};

function scaledPopGateMin(): number {
  return Math.round(profileCfg.popMin * Math.pow(SIM_YEARS / POP_GATE_YEARS_REF, 0.7));
}

function scaledPopGateMax(): number {
  return Math.round(profileCfg.popMax * Math.pow(SIM_YEARS / POP_GATE_YEARS_REF, 0.7));
}

const WINTER_START_DAY = 270;
const WINTER_DAYS = DAYS_PER_YEAR - WINTER_START_DAY;
const PRE_WINTER_BUFFER_DAYS = 20;
const PRE_WINTER_DAY = WINTER_START_DAY - PRE_WINTER_BUFFER_DAYS;
const FIRST_WINTER_TICK = WINTER_ENTER_TICK;
const DIPLOMACY_STALE_TICKS = 30 * TICKS_PER_DAY;
const RAID_STALE_TICKS = 12 * TICKS_PER_DAY;

const SIM_USE_WORKER = simUsesWorker();
const SIM_VERBOSE = process.env.SIM_VERBOSE === '1';
const SIM_LOG_EVENTS = process.env.SIM_LOG_EVENTS !== '1';
const SIM_LOG_LIFE = process.env.SIM_LOG_LIFE !== '1';
/** Balance harness — assignAllWorkers is expensive; skip ticks unless buildings/staff changed. */
const SIM_STAFF_EVERY = Math.max(1, Number(process.env.SIM_STAFF_EVERY ?? 120));
const SIM_STRICT_COVERAGE = process.env.SIM_STRICT_COVERAGE === '1';
/** Off by default — realistic pacing matches player build times and real resource costs. */
const SIM_INSTANT_BUILD = process.env.SIM_INSTANT_BUILD === '1';

const AUTO_BUILD_EVERY = Math.max(TICKS_PER_DAY, Number(process.env.SIM_BUILD_EVERY ?? TICKS_PER_DAY * 3));
const GROWTH_EVERY = Math.max(TICKS_PER_DAY, Number(process.env.SIM_GROWTH_EVERY ?? TICKS_PER_DAY * 30));
const MAX_HOUSES_PER_YEAR = Math.max(0, Number(process.env.SIM_MAX_HOUSES_YEAR ?? 5) || 5);
const PROGRESS_EVERY = Number(process.env.PROGRESS_EVERY ?? TICKS_PER_DAY * 26);
const PERF_SAMPLE_EVERY = Number(process.env.PERF_SAMPLE_EVERY ?? TICKS_PER_YEAR);
/** Keep newest entries only — eventLog grows via unshift (index 0 = newest). */
const EVENT_LOG_MAX = Number(process.env.SIM_EVENT_LOG_MAX ?? 2000);

const here = dirname(fileURLToPath(import.meta.url));
const defaultLogDir = join(here, 'logs');
const profileCfg = PROFILE_CONFIG[SIM_PROFILE];
const simBuildPolicy = parseSimBuildPolicy();

/** String building types only — safe if BuildingType ever becomes a numeric enum. */
const ALL_BUILDING_TYPES = Object.values(BuildingType).filter(
  (v): v is BuildingTypeName => typeof v === 'string',
);

function simAutoBuildAllowed(type: BuildingTypeName): boolean {
  if (profileCfg.skipRoadCoverage && type === BuildingType.Road) return false;
  return isSimBuildAllowed(type, simBuildPolicy);
}

/** Building types the harness may place or require for coverage gates. */
function simCoverageBuildingTypes(): BuildingTypeName[] {
  return ALL_BUILDING_TYPES.filter((type) => simAutoBuildAllowed(type));
}

// ─── Logging ───────────────────────────────────────────────────────────────

class SimLogger {
  private lines: string[] = [];
  private lifeLines: string[] = [];
  private startMs = performance.now();
  private readonly logPath: string;
  private readonly lifeLogPath: string;
  private announcedLogPath = false;
  private mainDirty = false;
  private lifeDirty = false;

  constructor(profile: SimProfile) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const engineTag = SIM_USE_WORKER ? '' : '-mainthread';
    this.logPath = process.env.SIM_LOG_FILE ?? join(defaultLogDir, `sim-${SIM_YEARS}year-${profile}${engineTag}-${stamp}.txt`);
    this.lifeLogPath = process.env.SIM_LIFE_LOG_FILE ?? this.logPath.replace(/\.txt$/i, '-life.txt');
  }

  getLogPath(): string {
    return this.logPath;
  }

  getLifeLogPath(): string {
    return this.lifeLogPath;
  }

  getLifeEventCount(): number {
    return this.lifeLines.length;
  }

  private persist(): void {
    try {
      mkdirSync(dirname(this.logPath), { recursive: true });
      writeFileSync(this.logPath, this.lines.join('\n'), 'utf8');
      if (!this.announcedLogPath) {
        this.announcedLogPath = true;
        console.log(`[simulate-10year] Live log: ${this.logPath}`);
        if (SIM_LOG_LIFE) {
          console.log(`[simulate-10year] Life events: ${this.lifeLogPath}`);
        }
      }
    } catch {
      /* console-only fallback */
    }
  }

  private persistLife(): void {
    if (!SIM_LOG_LIFE || this.lifeLines.length === 0) return;
    try {
      mkdirSync(dirname(this.lifeLogPath), { recursive: true });
      writeFileSync(this.lifeLogPath, `${this.lifeLines.join('\n')}\n`, 'utf8');
    } catch {
      /* ignore */
    }
  }

  /** Pregnancies, births, deaths, marriages — batched to disk once per tick via flushLifeBuffers(). */
  life(msg: string): void {
    if (!SIM_LOG_LIFE) return;
    const line = `  🧬 ${msg}`;
    this.lifeLines.push(msg);
    this.lines.push(line);
    console.log(line);
    this.mainDirty = true;
    this.lifeDirty = true;
  }

  /** Write buffered life lines — call once per tick after drainLifeEvents, not per event. */
  flushLifeBuffers(): void {
    if (!SIM_LOG_LIFE || !this.lifeDirty) return;
    if (this.mainDirty) {
      this.persist();
      this.mainDirty = false;
    }
    this.persistLife();
    this.lifeDirty = false;
  }

  section(title: string): void {
    this.lines.push('');
    this.lines.push(`--- ${title} ---`);
  }

  /** Buffered only — printed in final report. */
  log(msg: string): void {
    this.lines.push(msg);
    if (SIM_VERBOSE) console.log(msg);
  }

  /** Immediate console + buffer (milestones, injections, errors). */
  live(msg: string): void {
    this.lines.push(msg);
    console.log(msg);
    this.persist();
  }

  /** Progress heartbeat with % complete and ETA. */
  progress(tick: number, year: number, dayInYear: number, msg: string): void {
    const pct = ((tick / TOTAL_TICKS) * 100).toFixed(1);
    const elapsed = (performance.now() - this.startMs) / 1000;
    const rate = tick / Math.max(elapsed, 0.001);
    const eta = rate > 0 ? Math.round((TOTAL_TICKS - tick) / rate) : 0;
    const line = `[${pct}%] Y${year} day ${dayInYear} tick ${tick} | +${elapsed.toFixed(0)}s ETA ~${eta}s | ${msg}`;
    this.lines.push(line);
    console.log(line);
    this.persist();
  }

  progressYear(tick: number, year: number, msg: string): void {
    const pct = ((tick / TOTAL_TICKS) * 100).toFixed(1);
    const elapsed = (performance.now() - this.startMs) / 1000;
    const rate = tick / Math.max(elapsed, 0.001);
    const eta = rate > 0 ? Math.round((TOTAL_TICKS - tick) / rate) : 0;
    const line = `[${pct}%] Year ${year} tick ${tick} | +${elapsed.toFixed(0)}s ETA ~${eta}s | ${msg}`;
    this.lines.push(line);
    console.log(line);
    this.persist();
  }

  flush(_profile: SimProfile): string | null {
    this.flushLifeBuffers();
    const text = this.lines.join('\n');
    try {
      mkdirSync(dirname(this.logPath), { recursive: true });
      writeFileSync(this.logPath, text, 'utf8');
      console.log('\n=== Final report ===');
      console.log(text);
      console.log(`\n[simulate-10year] Log written to ${this.logPath}`);
      return this.logPath;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[simulate-10year] Failed to write log to ${this.logPath}: ${msg}`);
      console.log('\n=== Final report (console only) ===');
      console.log(text);
      return null;
    }
  }
}

// ─── Option coverage ───────────────────────────────────────────────────────

type CoverageMap = Record<string, Set<string>>;

function cov(map: CoverageMap, category: string, id: string): void {
  if (!map[category]) map[category] = new Set();
  map[category].add(id);
}

function covReport(map: CoverageMap, expected: Record<string, string[]>): string[] {
  const out: string[] = [];
  for (const [cat, ids] of Object.entries(expected)) {
    const tested = map[cat] ?? new Set();
    const missing = ids.filter((id) => !tested.has(id));
    out.push(
      `${cat}: ${tested.size}/${ids.length} tested`
      + (missing.length ? ` — missing: ${missing.join(', ')}` : ' ✓'),
    );
  }
  return out;
}

const EXPECTED_OPTIONS: Record<string, string[]> = {
  buildings: [...ALL_BUILDING_TYPES],
  diplomacy_tribute: ['pay', 'negotiate', 'refuse'],
  diplomacy_border_dispute: ['concede', 'stand_firm', 'militia'],
  diplomacy_alliance: ['accept', 'decline', 'counter'],
  diplomacy_peace_treaty: ['sign', 'decline', 'tribute'],
  raid_response: ['defend', 'barricade', 'payoff'],
  rival_action: ['gift', 'trade_pact', 'show_strength', 'peace_treaty', 'counter_raid'],
  visitor_trade: ['buy_food', 'buy_wood', 'sell_food'],
  refugee: ['welcome', 'screen', 'turn_away'],
  visitor_talk: ['traders', 'pilgrims', 'scholars', 'hunters', 'nomads', 'performers', 'refugees'],
  forge: ['iron_spears', 'iron_shields', 'guard_halberds', 'wall_plates', 'iron_pickaxes'],
  research: createInitialResearchNodes().map((n) => n.id),
};

const DIPLOMACY_CHOICE_IDS: Record<DiplomacyEventKind, string[]> = {
  tribute: ['pay', 'negotiate', 'refuse'],
  border_dispute: ['concede', 'stand_firm', 'militia'],
  alliance: ['accept', 'decline', 'counter'],
  peace_treaty: ['sign', 'decline', 'tribute'],
};

const DIPLOMACY_META: Record<DiplomacyEventKind, { emoji: string; title: (n: string) => string; description: (n: string) => string }> = {
  tribute: {
    emoji: '🪙',
    title: (n) => `${n} demands tribute`,
    description: (n) => `Envoys from ${n} expect food for safe passage.`,
  },
  border_dispute: {
    emoji: '⚔️',
    title: (n) => `Border dispute with ${n}`,
    description: (n) => `${n} claims your hunters crossed their territory.`,
  },
  alliance: {
    emoji: '🤝',
    title: (n) => `${n} proposes an alliance`,
    description: (n) => `${n}'s leader offers a formal pact.`,
  },
  peace_treaty: {
    emoji: '🕊️',
    title: (n) => `${n} offers a peace treaty`,
    description: (n) => `Envoys from ${n} ask for a formal truce.`,
  },
};

const RAID_RESPONSES = ['defend', 'barricade', 'payoff'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function summarizeTickMs(samples: number[]) {
  if (samples.length === 0) return { avg: 0, p50: 0, p95: 0, max: 0 };
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    avg: sum / sorted.length,
    p50: percentile(sorted, 0.5),
    p95: percentile(sorted, 0.95),
    max: sorted[sorted.length - 1],
  };
}

function getSimBuildAnchors(state: WorldState): { cx: number; cy: number }[] {
  const anchors: { cx: number; cy: number }[] = [];
  const seen = new Set<string>();
  const add = (cx: number, cy: number) => {
    const key = `${Math.round(cx / 20)}:${Math.round(cy / 20)}`;
    if (seen.has(key)) return;
    seen.add(key);
    anchors.push({ cx, cy });
  };

  const center = getSimBuildCenter(state);
  add(center.cx, center.cy);

  for (const b of state.buildings) {
    if (b.faction === 'rival') continue;
    const bx = b.x + b.width / 2;
    const by = b.y + b.height / 2;
    const pad = Math.max(b.width, b.height) * 0.85;
    add(bx + pad, by);
    add(bx - pad, by);
    add(bx, by + pad);
    add(bx, by - pad);
    add(bx + pad * 0.7, by + pad * 0.7);
    add(bx - pad * 0.7, by - pad * 0.7);
  }

  add(state.width / 2, state.height / 2);
  return anchors;
}

function tryPlaceAtAnchor(
  state: WorldState,
  type: BuildingTypeName,
  cx: number,
  cy: number,
): { state: WorldState; ok: boolean; detail?: string } {
  if (type === BuildingType.Wall) {
    const chain = tryPlaceWallChain(state, cx, cy);
    if (chain.ok) return chain;
    return tryPlaceBuilding(state, type, cx, cy);
  }
  const spot = findBuildSpot(state, type, cx, cy);
  if (!spot) return { state, ok: false, detail: 'no valid spot' };
  return { state: startBuilding(state, type, spot[0], spot[1]), ok: true };
}

function tryPlace(
  state: WorldState,
  type: BuildingTypeName,
  _cx: number,
  _cy: number,
): { state: WorldState; ok: boolean; detail?: string } {
  if (!canUnlockBuilding(state, type)) {
    return { state, ok: false, detail: `locked (${BUILDING_CONFIGS[type].unlockRequirement ?? 'unknown'})` };
  }
  let lastDetail = 'no valid spot';
  for (const anchor of getSimBuildAnchors(state)) {
    const result = tryPlaceAtAnchor(state, type, anchor.cx, anchor.cy);
    if (result.ok) return result;
    if (result.detail) lastDetail = result.detail;
  }
  return { state, ok: false, detail: lastDetail };
}

type BuildState = {
  housesThisYear: number;
  lastHouseYear: number;
};

function createBuildState(): BuildState {
  return { housesThisYear: 0, lastHouseYear: -1 };
}

function resetBuildYear(build: BuildState, year: number): void {
  if (year !== build.lastHouseYear) {
    build.housesThisYear = 0;
    build.lastHouseYear = year;
  }
}

function maxHousesPerYear(): number {
  if (!profileCfg.autoHouses) return 0;
  return Math.min(MAX_HOUSES_PER_YEAR, profileCfg.housesPerYear);
}

function isHousePlacement(type: BuildingTypeName): boolean {
  return type === BuildingType.House;
}

function canPlaceMoreHousesThisYear(build: BuildState, year: number): boolean {
  const cap = maxHousesPerYear();
  if (cap <= 0) return false;
  resetBuildYear(build, year);
  return build.housesThisYear < cap;
}

function recordHousePlacement(build: BuildState, year: number, type: BuildingTypeName): void {
  if (!isHousePlacement(type)) return;
  resetBuildYear(build, year);
  build.housesThisYear++;
}

function houseCapDetail(build: BuildState, year: number): string {
  resetBuildYear(build, year);
  return `house cap ${build.housesThisYear}/${maxHousesPerYear()} this year`;
}

function tryPlaceWithLimits(
  state: WorldState,
  type: BuildingTypeName,
  cx: number,
  cy: number,
  build: BuildState,
): { state: WorldState; ok: boolean; detail?: string } {
  if (isHousePlacement(type) && !canPlaceMoreHousesThisYear(build, state.year)) {
    return { state, ok: false, detail: houseCapDetail(build, state.year) };
  }
  const result = tryPlace(state, type, cx, cy);
  if (result.ok) recordHousePlacement(build, state.year, type);
  return result;
}

function getCompletedBuildingTypes(state: WorldState): Set<BuildingTypeName> {
  return new Set(
    state.buildings
      .filter((b) => b.completed && b.faction !== 'rival')
      .map((b) => b.type),
  );
}

type BuildingCount = { completed: number; inProgress: number };

function countBuildingsByType(state: WorldState): Map<BuildingTypeName, BuildingCount> {
  const counts = new Map<BuildingTypeName, BuildingCount>();
  for (const b of state.buildings) {
    if (b.faction === 'rival') continue;
    const cur = counts.get(b.type) ?? { completed: 0, inProgress: 0 };
    if (b.completed) cur.completed++;
    else cur.inProgress++;
    counts.set(b.type, cur);
  }
  return counts;
}

function formatBuildingTypesLine(state: WorldState): string {
  const counts = countBuildingsByType(state);
  const parts = [...counts.entries()]
    .filter(([, c]) => c.completed > 0)
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([type, c]) => `${type}×${c.completed}`);
  return parts.length > 0 ? parts.join(', ') : '(none)';
}

function expectedBuildingTypeCount(): number {
  return simCoverageBuildingTypes().length;
}

/** Compact building line for live progress heartbeats. */
function formatBuildingLiveSummary(state: WorldState, coverage: CoverageMap): string {
  syncBuildingCoverage(state, coverage);
  const typesDone = getCompletedBuildingTypes(state).size;
  const typesExpected = expectedBuildingTypeCount();
  const completed = state.buildings.filter((b) => b.completed && b.faction !== 'rival').length;
  const inProgress = state.buildings.filter((b) => !b.completed && b.faction !== 'rival').length;
  const prog = inProgress > 0 ? ` (+${inProgress} in progress)` : '';
  return `buildings=${completed}${prog} types=${typesDone}/${typesExpected} [${formatBuildingTypesLine(state)}]`;
}

function calendarAtTick(tick: number): { year: number; day: number } {
  const days = Math.floor(tick / TICKS_PER_DAY);
  return { year: Math.floor(days / DAYS_PER_YEAR), day: days % DAYS_PER_YEAR };
}

/** Stream successful placements to console (auto_build / buildings / coverage_sweep). */
function drainBuildActions(
  logger: SimLogger,
  actionLog: ActionLog[],
  fromIndex: number,
): void {
  for (let i = fromIndex; i < actionLog.length; i++) {
    const entry = actionLog[i];
    if (!entry.ok) continue;
    if (entry.category !== 'auto_build' && entry.category !== 'buildings' && entry.category !== 'coverage_sweep') {
      continue;
    }
    const type = entry.action.replace('place:', '');
    const cal = calendarAtTick(entry.tick);
    logger.live(
      `  🏗️ Y${cal.year} D${cal.day} tick ${entry.tick} | placed ${type} (${entry.category})`
      + (entry.detail ? ` — ${entry.detail}` : ''),
    );
  }
}

function formatBuildingInventoryReport(state: WorldState, coverage: CoverageMap): string[] {
  const counts = countBuildingsByType(state);
  const lines: string[] = [];

  const completed = [...counts.entries()]
    .filter(([, c]) => c.completed > 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  lines.push(`Completed types: ${completed.length}/${ALL_BUILDING_TYPES.length}`);
  for (const [type, c] of completed) {
    const prog = c.inProgress > 0 ? ` (+${c.inProgress} in progress)` : '';
    lines.push(`  ${type}: ${c.completed} completed${prog}`);
  }

  const inProgressOnly = [...counts.entries()]
    .filter(([, c]) => c.inProgress > 0 && c.completed === 0)
    .sort((a, b) => a[0].localeCompare(b[0]));
  if (inProgressOnly.length > 0) {
    lines.push('In progress (not yet completed):');
    for (const [type, c] of inProgressOnly) {
      lines.push(`  ${type}: ${c.inProgress}`);
    }
  }

  syncBuildingCoverage(state, coverage);
  const tested = coverage.buildings ?? new Set<BuildingTypeName>();
  const missing = simCoverageBuildingTypes().filter((type) => !tested.has(type));
  if (missing.length > 0) {
    lines.push(`Never completed (${missing.length}):`);
    for (const type of missing) {
      const unlock = canUnlockBuilding(state, type)
        ? 'unlocked'
        : `locked (${BUILDING_CONFIGS[type].unlockRequirement ?? 'prereq'})`;
      const afford = canAffordBuilding(state, type) ? 'affordable now' : 'cannot afford now';
      lines.push(`  ${type} — ${unlock}, ${afford}`);
    }
  } else {
    lines.push('All building types completed at least once ✓');
  }

  return lines;
}

function formatBuildChronicle(actionLog: ActionLog[]): string[] {
  const builds = actionLog.filter(
    (a) => (a.category === 'auto_build' || a.category === 'buildings' || a.category === 'coverage_sweep') && a.ok,
  );
  if (builds.length === 0) return ['(no automated placements logged)'];

  const byType = new Map<string, number[]>();
  for (const entry of builds) {
    const type = entry.action.replace('place:', '');
    const ticks = byType.get(type) ?? [];
    ticks.push(entry.tick);
    byType.set(type, ticks);
  }

  const lines = [`Total placements: ${builds.length}`];
  for (const [type, ticks] of [...byType.entries()].sort((a, b) => a[0].localeCompare(b[0]))) {
    lines.push(`  ${type}: ${ticks.length}× (ticks ${Math.min(...ticks)}–${Math.max(...ticks)})`);
  }
  return lines;
}

function syncBuildingCoverage(state: WorldState, coverage: CoverageMap): void {
  for (const type of getCompletedBuildingTypes(state)) {
    cov(coverage, 'buildings', type);
  }
}

function syncResearchCoverage(state: WorldState, coverage: CoverageMap): void {
  for (const node of state.researchNodes) {
    if (node.researched) cov(coverage, 'research', node.id);
  }
}

function syncForgeCoverage(state: WorldState, coverage: CoverageMap): void {
  for (const orderId of EXPECTED_OPTIONS.forge) {
    if (
      isForgeOrderComplete(state.villageForge, orderId as ForgeOrderId)
      || state.villageForge.activeOrder === orderId
    ) {
      cov(coverage, 'forge', orderId);
    }
  }
}

function canUnlockBuilding(state: WorldState, type: BuildingTypeName): boolean {
  const req = BUILDING_CONFIGS[type].unlockRequirement;
  if (!req) return true;
  return state.unlockedTechs.includes(req);
}

function resourceSnapshot(state: WorldState): string {
  const r = state.resources;
  return `food=${Math.floor(r.food)} wood=${Math.floor(r.wood)} stone=${Math.floor(r.stone)} gold=${Math.floor(r.gold)}`;
}

function militiaSnapshot(state: WorldState): string {
  const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const b = computeMilitiaBreakdown(state, humans);
  return `militia=${b.militiaStrength} barricade=${b.barricadeStrength} (${b.spearTier}/${b.shieldTier}) guards=${b.guardCount}`;
}

/** Build near settlers — map center drifts from the camp after founders wander. */
function getSimBuildCenter(state: WorldState): { cx: number; cy: number } {
  const settlers = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  if (settlers.length > 0) {
    return {
      cx: settlers.reduce((sum, e) => sum + e.x, 0) / settlers.length,
      cy: settlers.reduce((sum, e) => sum + e.y, 0) / settlers.length,
    };
  }
  const camps = state.buildings.filter((b) => b.faction !== 'rival');
  if (camps.length > 0) {
    return {
      cx: camps.reduce((sum, b) => sum + b.x + b.width / 2, 0) / camps.length,
      cy: camps.reduce((sum, b) => sum + b.y + b.height / 2, 0) / camps.length,
    };
  }
  return { cx: state.width / 2, cy: state.height / 2 };
}

function shouldAttemptAutoBuild(t: number): boolean {
  return t === TICKS_PER_DAY || t % AUTO_BUILD_EVERY === 0;
}

function getTotalBeds(state: WorldState): number {
  return state.buildings
    .filter((b) => b.completed && b.faction !== 'rival' && isResidenceBuildingType(b.type))
    .reduce((sum, b) => sum + getResidenceCapacity(b), 0);
}

function popCounts(state: WorldState) {
  return computePopulationCounts(state.entities);
}

// FIX: Removed broken getTotalBedsCached / bedsCache. The cache key only counted
// the number of residence buildings, not their types/capacities. After upgrading
// a House to a Mansion the capacity changed but the cache hit returned the old
// (lower) value. All callers now use getTotalBeds() directly — the function is
// O(n) over buildings but only called ~200× in a 10-year run, negligible.

function getWoodNeedPerDay(pop: number): number {
  return pop > 100 ? Math.ceil(pop / 5) : 0;
}

function getWinterWoodNeed(pop: number): number {
  return getWoodNeedPerDay(pop) * WINTER_DAYS;
}

/**
 * Shallow clone — new top-level arrays, but entity/building objects are shared.
 * Safe for push-only mutations (spawnRivalSettlement, spawnVisitorGroup), but
 * mutating nested objects mutates the original. Use structuredClone if you need
 * deep isolation.
 */
function shallowCloneWorld(state: WorldState): WorldState {
  return {
    ...state,
    entities: [...state.entities],
    buildings: [...state.buildings],
    rivalSettlements: [...state.rivalSettlements],
    visitorGroups: [...state.visitorGroups],
    pendingDiplomacyEvents: [...(state.pendingDiplomacyEvents ?? [])],
    pendingRaidEvents: [...(state.pendingRaidEvents ?? [])],
    entityByType: undefined,
    grassGrid: undefined,
    mobileGrid: undefined,
    scentGrid: undefined,
  };
}

function pruneEventLog(state: WorldState): void {
  if (state.eventLog.length <= EVENT_LOG_MAX) return;
  state.eventLog.length = EVENT_LOG_MAX;
}

/** eventLog uses unshift — new entries are always at indices [0 .. added-1]. */
function newEventLogCount(beforeLen: number, state: WorldState): number {
  return Math.max(0, state.eventLog.length - beforeLen);
}

function forEachNewEventLogEntry(
  beforeLen: number,
  state: WorldState,
  fn: (entry: WorldState['eventLog'][number]) => void,
): void {
  const added = newEventLogCount(beforeLen, state);
  for (let i = 0; i < added; i++) {
    const entry = state.eventLog[i];
    if (entry) fn(entry);
  }
}

function countNewEventLogType(beforeLen: number, state: WorldState, type: string): number {
  let n = 0;
  forEachNewEventLogEntry(beforeLen, state, (e) => {
    if (e.type === type) n++;
  });
  return n;
}

/** Player deaths only — uses new chronicle slice (O(new) not O(entities)). */
function countNewPlayerDeaths(beforeLen: number, state: WorldState): number {
  let n = 0;
  forEachNewEventLogEntry(beforeLen, state, (e) => {
    if (e.type !== 'death' || !e.entityName) return;
    if (e.message.includes('Wildkin')) return;
    n++;
  });
  return n;
}

function hasNewEventLogType(beforeLen: number, state: WorldState, type: string, tick?: number): boolean {
  let found = false;
  forEachNewEventLogEntry(beforeLen, state, (e) => {
    if (e.type === type && (tick === undefined || e.tick === tick)) found = true;
  });
  return found;
}

type PregnancySnap = Map<number, { pregnantById?: number; partnerId?: number }>;

function forEachPlayerHumanFemale(
  state: WorldState,
  fn: (e: WorldState['entities'][number]) => void,
): void {
  const humans = state.entityByType?.[EntityType.Human];
  if (humans) {
    for (const e of humans) {
      if (e.alive && isPlayerHuman(e) && e.gender === 'female') fn(e);
    }
    return;
  }
  for (const e of state.entities) {
    if (e.alive && isPlayerHuman(e) && e.gender === 'female') fn(e);
  }
}

function formatLifeTick(state: WorldState): string {
  return `Y${state.year} D${state.dayInYear} tick ${state.tick}`;
}

function resolveFatherName(state: WorldState, mother: WorldState['entities'][number]): string {
  const fatherId = mother.pregnantById ?? mother.partnerId;
  if (fatherId == null) return 'unknown';
  const father = state.entities.find((e) => e.id === fatherId);
  return father ? formatCitizenName(father) : `#${fatherId}`;
}

const LIVE_LIFE_EVENT_TYPES = new Set(['birth', 'death', 'marriage', 'scandal']);

function liveLifeEventKind(entry: WorldState['eventLog'][number]): string | null {
  if (LIVE_LIFE_EVENT_TYPES.has(entry.type)) return entry.type;
  if (entry.type !== 'event') return null;
  if (entry.message.includes('imprisoned for scandal')) return 'imprison';
  if (entry.message.includes('released from prison')) return 'release';
  return null;
}

/** Stream pregnancies (entity state) and chronicle life events after each gameTick. */
function drainLifeEvents(
  logger: SimLogger,
  pregnancySnap: PregnancySnap,
  eventLogLenBefore: number,
  state: WorldState,
): void {
  if (!SIM_LOG_LIFE) return;

  // Single pass: log new pregnancies and incrementally maintain snap (no pre-tick rescan).
  forEachPlayerHumanFemale(state, (e) => {
    if (e.pregnant) {
      if (!pregnancySnap.has(e.id)) {
        const mother = formatCitizenName(e);
        const father = resolveFatherName(state, e);
        const kind = e.pregnantById != null ? 'pregnancy (affair)' : 'pregnancy';
        logger.life(`${formatLifeTick(state)} | ${kind} | ${mother} expecting (father: ${father})`);
      }
      pregnancySnap.set(e.id, { pregnantById: e.pregnantById, partnerId: e.partnerId });
    } else if (pregnancySnap.has(e.id)) {
      pregnancySnap.delete(e.id);
    }
  });

  forEachNewEventLogEntry(eventLogLenBefore, state, (entry) => {
    const kind = liveLifeEventKind(entry);
    if (!kind) return;
    const who = entry.entityName ? ` (${entry.entityName})` : '';
    logger.life(`${formatLifeTick(state)} | ${kind} | ${entry.message}${who}`);
  });
}

function countCompletedBuildings(state: WorldState, type: BuildingTypeName): number {
  return state.buildings.filter((b) => b.completed && b.faction !== 'rival' && b.type === type).length;
}

function hasCompletedBuilding(state: WorldState, type: BuildingTypeName): boolean {
  return countCompletedBuildings(state, type) > 0;
}

/** Includes in-progress — one church/prison/well/etc. at a time. */
function hasPlayerBuilding(state: WorldState, type: BuildingTypeName): boolean {
  return state.buildings.some((b) => b.faction !== 'rival' && b.type === type);
}

function countPlayerBuildings(state: WorldState, type: BuildingTypeName): number {
  return state.buildings.filter((b) => b.faction !== 'rival' && b.type === type).length;
}

function canAffordBuilding(state: WorldState, type: BuildingTypeName): boolean {
  if (!canUnlockBuilding(state, type)) return false;
  return canAffordResourceCost(state.resources, BUILDING_CONFIGS[type].cost);
}

/** Cheat mode only — skip construction time when SIM_INSTANT_BUILD=1. */
function simInstantCompleteInProgress(state: WorldState): WorldState {
  let changed = false;
  const buildings = state.buildings.map((b) => {
    if (b.faction === 'rival' || b.completed) return b;
    changed = true;
    return {
      ...b,
      completed: true,
      constructionProgress: 100,
      occupants: [],
      spriteScale: 1,
    };
  });
  if (!changed) return state;
  let totalCompleted = 0;
  for (const b of buildings) {
    if (b.completed && b.faction !== 'rival') totalCompleted++;
  }
  return { ...state, buildings, totalBuildingsCompleted: totalCompleted };
}

function maybeCompleteBuild(state: WorldState): WorldState {
  return SIM_INSTANT_BUILD ? simInstantCompleteInProgress(state) : state;
}

function isPreWinterRecruitPause(state: WorldState): boolean {
  return state.dayInYear >= PRE_WINTER_DAY - 30 && state.dayInYear < WINTER_START_DAY;
}

// ─── Winter tracking (per-winter pass/fail for 10-year test) ─────────────────

type WinterSnapshot = {
  day: number;
  tick: number;
  /** Village settlers (excludes visitor/rival humans on the map). */
  pop: number;
  visitors: number;
  maxPop: number;
  beds: number;
  food: number;
  wood: number;
  eco: number;
  woodNeedDay: number;
  woodNeedWinter: number;
  woodBufferDays: number;
  foodPerCapita: number;
};

type WinterRecord = {
  year: number;
  preWinter?: WinterSnapshot;
  entry: WinterSnapshot;
  exit?: WinterSnapshot;
  minFood: number;
  minWood: number;
  minPop: number;
  playerDeathsInWinter: number;
  netPopLoss: number;
  heatingFailDays: number;
  passed: boolean;
  failReasons: string[];
  /** Sim ended before spring — excluded from winter balance gates. */
  incomplete?: boolean;
};

class WinterTracker {
  private records: WinterRecord[] = [];
  private current: WinterRecord | null = null;
  private preWinterByYear = new Map<number, WinterSnapshot>();
  private preWinterYears = new Set<number>();
  private winterStartPlayerDeaths = 0;

  private makeSnapshot(state: WorldState): WinterSnapshot {
    const { humans: pop, visitorHumans: visitors } = popCounts(state);
    const woodNeedDay = getWoodNeedPerDay(pop);
    return {
      day: state.dayInYear,
      tick: state.tick,
      pop,
      visitors,
      maxPop: state.maxHumanPopulation,
      beds: getTotalBeds(state),
      food: Math.floor(state.resources.food),
      wood: Math.floor(state.resources.wood),
      eco: state.ecosystemHealth,
      woodNeedDay,
      woodNeedWinter: getWinterWoodNeed(pop),
      woodBufferDays: woodNeedDay > 0 ? Math.floor(state.resources.wood / woodNeedDay) : 999,
      foodPerCapita: pop > 0 ? state.resources.food / pop : 0,
    };
  }

  capturePreWinter(state: WorldState): void {
    if (this.preWinterYears.has(state.year)) return;
    this.preWinterYears.add(state.year);
    this.preWinterByYear.set(state.year, this.makeSnapshot(state));
    if (this.current?.year === state.year) {
      this.current.preWinter = this.preWinterByYear.get(state.year);
    }
  }

  onWinterEnter(state: WorldState, playerDeathsCumulative: number): WinterSnapshot {
    const { humans: pop, visitorHumans: visitors } = popCounts(state);
    const woodNeedDay = getWoodNeedPerDay(pop);
    this.winterStartPlayerDeaths = playerDeathsCumulative;
    this.current = {
      year: state.year,
      preWinter: this.preWinterByYear.get(state.year),
      entry: {
        day: state.dayInYear,
        tick: state.tick,
        pop,
        visitors,
        maxPop: state.maxHumanPopulation,
        beds: getTotalBeds(state),
        food: Math.floor(state.resources.food),
        wood: Math.floor(state.resources.wood),
        eco: state.ecosystemHealth,
        woodNeedDay,
        woodNeedWinter: getWinterWoodNeed(pop),
        woodBufferDays: woodNeedDay > 0 ? Math.floor(state.resources.wood / woodNeedDay) : 999,
        foodPerCapita: pop > 0 ? state.resources.food / pop : 0,
      },
      minFood: Math.floor(state.resources.food),
      minWood: Math.floor(state.resources.wood),
      minPop: pop,
      playerDeathsInWinter: 0,
      netPopLoss: 0,
      heatingFailDays: 0,
      passed: true,
      failReasons: [],
    };
    return this.current.entry;
  }

  /** Update running minima every winter tick. */
  onWinterIntraDay(state: WorldState): void {
    if (!this.current) return;
    const food = Math.floor(state.resources.food);
    const wood = Math.floor(state.resources.wood);
    const pop = popCounts(state).humans;
    this.current.minFood = Math.min(this.current.minFood, food);
    this.current.minWood = Math.min(this.current.minWood, wood);
    this.current.minPop = Math.min(this.current.minPop, pop);
  }

  /** Track player-human deaths every winter tick (entity IDs — not heating-heuristic). */
  recordWinterDeaths(n: number): void {
    if (!this.current || n <= 0) return;
    this.current.playerDeathsInWinter += n;
  }

  /**
   * Called once per calendar day at tick end (after gameTick heating).
   * heatingFailed mirrors gameEngine: wood < ceil(pop/5) at daily consumption time.
   */
  onWinterCalendarDayEnd(
    state: WorldState,
    woodAtDayStart: number,
    popAtDayStart: number,
  ): void {
    if (!this.current) return;
    this.onWinterIntraDay(state);
    const woodNeed = getWoodNeedPerDay(popAtDayStart);
    const heatingFailed = popAtDayStart > 0 && woodAtDayStart < woodNeed;
    if (heatingFailed) this.current.heatingFailDays++;
  }

  onWinterExit(
    state: WorldState,
    playerDeathsCumulative: number,
    opts?: { incomplete?: boolean },
  ): WinterRecord | null {
    if (!this.current) return null;
    const { humans: pop, visitorHumans: visitors } = popCounts(state);
    const woodNeedDay = getWoodNeedPerDay(pop);
    this.current.netPopLoss = Math.max(0, this.current.entry.pop - pop);
    const entityDeaths = playerDeathsCumulative - this.winterStartPlayerDeaths;
    // Prefer entity-tracked tally (covers raids/combat on any winter day).
    this.current.playerDeathsInWinter = Math.max(this.current.playerDeathsInWinter, entityDeaths);
    this.current.exit = {
      day: state.dayInYear,
      tick: state.tick,
      pop,
      visitors,
      maxPop: state.maxHumanPopulation,
      beds: getTotalBeds(state),
      food: Math.floor(state.resources.food),
      wood: Math.floor(state.resources.wood),
      eco: state.ecosystemHealth,
      woodNeedDay,
      woodNeedWinter: getWinterWoodNeed(pop),
      woodBufferDays: woodNeedDay > 0 ? Math.floor(state.resources.wood / woodNeedDay) : 999,
      foodPerCapita: pop > 0 ? state.resources.food / pop : 0,
    };
    if (opts?.incomplete) {
      this.current.incomplete = true;
      this.current.passed = true;
      this.current.failReasons = [];
    } else {
      this.judgeWinter(this.current);
    }
    const closed = this.current;
    this.records.push(closed);
    this.current = null;
    return closed;
  }

  private judgeWinter(w: WinterRecord): void {
    const reasons: string[] = [];
    if (w.minFood <= 0) reasons.push(`starvation (min food=${w.minFood})`);
    const popDrop = w.entry.pop - w.minPop;
    const resourceStress = w.minFood < Math.min(400, w.entry.pop * 8) || w.heatingFailDays > 7;
    if (resourceStress && w.entry.pop > 0 && popDrop > Math.max(3, Math.ceil(w.entry.pop * 0.12))) {
      reasons.push(`pop trough ${w.minPop} during resource stress (entered ${w.entry.pop}, lost ${popDrop})`);
    }
    if (resourceStress && w.entry.pop > 0 && w.netPopLoss > Math.max(3, Math.ceil(w.entry.pop * 0.12))) {
      reasons.push(`net pop loss ${w.netPopLoss} with winter stress (entered ${w.entry.pop}, spring ${w.exit?.pop ?? '?'})`);
    }
    if (w.heatingFailDays > 14) {
      reasons.push(`heating stress (${w.heatingFailDays}/90 days short on wood)`);
    }
    if (w.minWood <= 0 && w.entry.pop >= 15) {
      reasons.push('wood stockpile depleted during winter');
    }
    const pre = w.preWinter ?? w.entry;
    if (pre.wood < pre.woodNeedWinter * 0.35 && pre.pop >= 20) {
      reasons.push(`low pre-winter wood buffer (${pre.wood} < 35% of need ${pre.woodNeedWinter})`);
    }
    if (pre.foodPerCapita < 8 && pre.pop >= 20) {
      reasons.push(`thin food buffer (${pre.foodPerCapita.toFixed(1)} food/cap at day ${pre.day})`);
    }
    w.failReasons = reasons;
    w.passed = reasons.length === 0;
  }

  /** Close an in-progress winter at run end — marked incomplete, not balance-judged. */
  forceCloseOpenWinter(state: WorldState, playerDeathsCumulative: number): WinterRecord | null {
    if (!this.current) return null;
    return this.onWinterExit(state, playerDeathsCumulative, { incomplete: true });
  }

  /** Closed winters only — never judge an in-progress winter. */
  getRecords(): WinterRecord[] {
    return this.records;
  }

  formatReport(): string[] {
    const lines: string[] = [];
    for (const w of this.records) {
      const e = w.entry;
      const pre = w.preWinter;
      const verdict = w.incomplete ? 'INCOMPLETE' : w.passed ? 'PASS' : 'FAIL';
      lines.push(
        `Winter Y${w.year} | ${verdict}`
        + (w.failReasons.length ? ` — ${w.failReasons.join('; ')}` : '')
        + (w.incomplete ? ' (sim ended mid-winter — not gated)' : ''),
      );
      if (pre && pre.day !== e.day) {
        lines.push(
          `  pre-winter day ${pre.day}: ${formatPopulationBrief({ humans: pre.pop, visitorHumans: pre.visitors, rivalHumans: 0 }, pre.maxPop)} beds=${pre.beds}`
          + ` food=${pre.food} (${pre.foodPerCapita.toFixed(1)}/cap) wood=${pre.wood}`
          + ` buffer=${pre.woodBufferDays}d need=${pre.woodNeedWinter} eco=${pre.eco}%`,
        );
      }
      lines.push(
        `  entry day ${e.day}: ${formatPopulationBrief({ humans: e.pop, visitorHumans: e.visitors, rivalHumans: 0 }, e.maxPop)} beds=${e.beds}`
        + ` food=${e.food} wood=${e.wood} need=${e.woodNeedDay}/day (${e.woodNeedWinter} winter)`
        + ` buffer=${e.woodBufferDays}d eco=${e.eco}%`,
      );
      lines.push(
        `  during: minFood=${w.minFood} minWood=${w.minWood} minPop=${w.minPop}`
        + ` playerDeaths=${w.playerDeathsInWinter} netPopLoss=${w.netPopLoss}`
        + ` heatingFailDays=${w.heatingFailDays}/90`,
      );
      if (w.exit) {
        const x = w.exit;
        lines.push(
          `  exit day ${x.day}: ${formatPopulationBrief({ humans: x.pop, visitorHumans: x.visitors, rivalHumans: 0 })} food=${x.food} wood=${x.wood} eco=${x.eco}%`,
        );
      }
    }
    const complete = this.records.filter((r) => !r.incomplete);
    const passed = complete.filter((r) => r.passed).length;
    const total = complete.length;
    const incomplete = this.records.length - total;
    lines.push(
      `Winter summary: ${passed}/${total} winters passed`
      + (incomplete > 0 ? ` (${incomplete} incomplete, excluded from gates)` : ''),
    );
    return lines;
  }
}

/** Cumulative frontier activity (incoming vs player-initiated), not pending queue depth. */
class FrontierTracker {
  private seenRaidIds = new Set<string>();
  private seenDiplomacyIds = new Set<string>();

  incomingRaids = 0;
  incomingDiplomacy = 0;
  outgoingRaids = 0;
  outgoingDiplomacy = 0;

  scanIncoming(state: WorldState): void {
    for (const evt of state.pendingRaidEvents ?? []) {
      if (this.seenRaidIds.has(evt.id)) continue;
      this.seenRaidIds.add(evt.id);
      this.incomingRaids++;
    }
    for (const evt of state.pendingDiplomacyEvents ?? []) {
      if (this.seenDiplomacyIds.has(evt.id)) continue;
      this.seenDiplomacyIds.add(evt.id);
      this.incomingDiplomacy++;
    }
  }

  recordOutgoingRaid(): void {
    this.outgoingRaids++;
  }

  recordOutgoingDiplomacy(): void {
    this.outgoingDiplomacy++;
  }

  formatProgress(): string {
    return `raids_on=${this.incomingRaids} raids_out=${this.outgoingRaids}`
      + ` dip_on=${this.incomingDiplomacy} dip_out=${this.outgoingDiplomacy}`;
  }
}

type YearSnapshot = {
  year: number;
  tick: number;
  /** Village settlers (not visitor NPCs). */
  pop: number;
  visitorHumans: number;
  resources: string;
  eco: number;
  ecoYears80: number;
  rep: number;
  militia: string;
  grazing: string;
  buildings: number;
  buildingTypes: string;
  raidsOnVillage: number;
  raidsInitiated: number;
  diplomacyOnVillage: number;
  diplomacyInitiated: number;
  visitors: number;
  rivals: number;
  playerDeaths: number;
};

function captureYearSnapshot(state: WorldState, playerDeaths: number, frontier: FrontierTracker): YearSnapshot {
  const grazing = getGrazingPressureReport(state);
  const counts = popCounts(state);
  return {
    year: state.year,
    tick: state.tick,
    pop: counts.humans,
    visitorHumans: counts.visitorHumans,
    resources: resourceSnapshot(state),
    eco: state.ecosystemHealth,
    ecoYears80: state.ecoHealthYearsAbove80,
    rep: state.villageReputation,
    militia: militiaSnapshot(state),
    grazing: `${grazing.level} (${(grazing.pressureRatio * 100).toFixed(0)}% pressure)`,
    buildings: state.buildings.filter((b) => b.completed && b.faction !== 'rival').length,
    buildingTypes: formatBuildingTypesLine(state),
    raidsOnVillage: frontier.incomingRaids,
    raidsInitiated: frontier.outgoingRaids,
    diplomacyOnVillage: frontier.incomingDiplomacy,
    diplomacyInitiated: frontier.outgoingDiplomacy,
    visitors: state.visitorGroups.length,
    rivals: state.rivalSettlements.length,
    playerDeaths,
  };
}

// ─── Scheduled growth scenario (10 years, profile-aware) ─────────────────────

type ScheduledResult = { state: WorldState; ok: boolean; detail?: string };
type ScheduledAction = { at: number; fn: (s: WorldState) => ScheduledResult; label: string };

/** No scheduled cheats — player rules use initGame resources and gameTick pop cap only. */
function buildScheduledSupports(_profile: SimProfile): ScheduledAction[] {
  return [];
}

const ECO_BUILDING_PRIORITY: BuildingTypeName[] = [
  BuildingType.Farm, BuildingType.Silo, BuildingType.Barn, BuildingType.Greenhouse,
  BuildingType.Well, BuildingType.LumberMill,
];

/** Civic / industry types unlocked by research — coverage sweep targets these explicitly. */
const CIVIC_BUILDING_PRIORITY: BuildingTypeName[] = [
  BuildingType.Church,
  BuildingType.Prison,
  BuildingType.Blacksmith,
  BuildingType.Mine,
  BuildingType.Mill,
  BuildingType.Market,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.Mansion,
  BuildingType.TownHall,
];

// FIX: GROWTH_STATE was a module-level mutable global. This caused cross-test
// pollution when multiple sim runs executed in the same process. Now it is
// created locally in runSimulation and passed through as a parameter.
type GrowthState = {
  recruitsThisYear: number;
  lastGrowthYear: number;
};

function createGrowthState(): GrowthState {
  return { recruitsThisYear: 0, lastGrowthYear: -1 };
}

function resetGrowthYear(growth: GrowthState, year: number): void {
  if (year !== growth.lastGrowthYear) {
    growth.recruitsThisYear = 0;
    growth.lastGrowthYear = year;
  }
}

function needsAnotherFarm(state: WorldState, pop: number, foodPerCap: number): boolean {
  const farmCount = countPlayerBuildings(state, BuildingType.Farm);
  if (farmCount === 0) return true;
  // Wood economy must exist before scaling farms — otherwise the village stalls at wood=0.
  if (!hasCompletedBuilding(state, BuildingType.LumberMill)) return false;
  const completedFarms = countCompletedBuildings(state, BuildingType.Farm);
  return foodPerCap < 14 || completedFarms < Math.max(1, Math.ceil(pop / 14));
}

/** Ordered build candidates from village needs — tries each until one places. */
function listBuildPriorities(state: WorldState, build: BuildState): BuildingTypeName[] {
  const priorities: BuildingTypeName[] = [];
  const seen = new Set<BuildingTypeName>();
  const pop = popCounts(state).humans;
  const canBuildHouse = canPlaceMoreHousesThisYear(build, state.year);
  const beds = getTotalBeds(state);
  const housingHeadroom = state.maxHumanPopulation;
  const foodPerCap = pop > 0 ? state.resources.food / pop : 99;
  const mills = countCompletedBuildings(state, BuildingType.LumberMill);
  const farms = countCompletedBuildings(state, BuildingType.Farm);
  const farmCount = countPlayerBuildings(state, BuildingType.Farm);
  const woodNeedDay = getWoodNeedPerDay(pop);
  const woodRunway = woodNeedDay > 0 ? state.resources.wood / woodNeedDay : 99;
  const hasMill = hasCompletedBuilding(state, BuildingType.LumberMill);
  const hasQuarry = hasPlayerBuilding(state, BuildingType.Quarry);
  const lowWood = state.resources.wood < 80 || woodRunway < 50;
  const lowStone = state.resources.stone < 35;

  const consider = (type: BuildingTypeName, cond = true): void => {
    if (!cond || seen.has(type)) return;
    if (!simAutoBuildAllowed(type) || !canAffordBuilding(state, type)) return;
    seen.add(type);
    priorities.push(type);
  };

  if (canBuildHouse && beds < pop) {
    consider(BuildingType.House);
  }

  // Lumber mill before extra farms — without wood income the build queue stalls permanently.
  if (!hasMill && hasCompletedBuilding(state, BuildingType.House)) {
    consider(BuildingType.LumberMill);
  }
  if (!hasMill && lowWood) {
    consider(BuildingType.LumberMill);
  }

  // Stone economy — quarry before extra houses/farms burn starting stone to zero.
  if (!hasQuarry && (lowStone || (hasMill && hasCompletedBuilding(state, BuildingType.House)))) {
    consider(BuildingType.Quarry);
  }

  const essentials: [BuildingTypeName, boolean][] = [
    [BuildingType.House, canBuildHouse && !hasCompletedBuilding(state, BuildingType.House)],
    [BuildingType.LumberMill, !hasPlayerBuilding(state, BuildingType.LumberMill)],
    [BuildingType.Quarry, !hasPlayerBuilding(state, BuildingType.Quarry)],
    [BuildingType.Farm, !hasPlayerBuilding(state, BuildingType.Farm)],
    [BuildingType.Well, pop >= 4 && !hasPlayerBuilding(state, BuildingType.Well)],
  ];
  for (const [type, cond] of essentials) consider(type, cond);

  if (canBuildHouse && (beds < pop + 3 || beds < housingHeadroom)) {
    consider(BuildingType.House);
  }
  if (mills < Math.max(1, Math.ceil(pop / 35)) || woodRunway < 50) {
    consider(BuildingType.LumberMill);
  }
  if (needsAnotherFarm(state, pop, foodPerCap)) {
    consider(BuildingType.Farm);
  }

  if (state.unlockedTechs.includes('architecture_1')) {
    const dramaPipeline: [BuildingTypeName, boolean][] = [
      [BuildingType.Church, !hasPlayerBuilding(state, BuildingType.Church)],
      [BuildingType.Prison, !hasPlayerBuilding(state, BuildingType.Prison)],
    ];
    for (const [type, cond] of dramaPipeline) consider(type, cond);
  }

  if (profileCfg.preferEcoBuildings) {
    for (const type of ECO_BUILDING_PRIORITY) {
      if (hasPlayerBuilding(state, type)) continue;
      const cond = type !== BuildingType.Greenhouse || pop >= 100;
      consider(type, cond);
    }
  }

  const oneOffs: [BuildingTypeName, boolean][] = [
    [BuildingType.Silo, farms >= 1],
    [BuildingType.Barn, true],
    [BuildingType.Workshop, true],
    [BuildingType.Store, true],
    [BuildingType.Church, !profileCfg.preferEcoBuildings && !hasPlayerBuilding(state, BuildingType.Church)],
    [BuildingType.TamingPost, !profileCfg.preferEcoBuildings],
    [BuildingType.Road, !profileCfg.skipRoadCoverage],
  ];
  for (const [type, cond] of oneOffs) {
    if (hasPlayerBuilding(state, type)) continue;
    consider(type, cond);
  }

  for (const type of CIVIC_BUILDING_PRIORITY) {
    if (hasPlayerBuilding(state, type)) continue;
    if (!canUnlockBuilding(state, type)) continue;
    consider(type);
  }

  const defenseBuildings: [BuildingTypeName, boolean][] = [
    [BuildingType.Wall, canUnlockBuilding(state, BuildingType.Wall) && pop >= 12],
    [BuildingType.Watchtower, canUnlockBuilding(state, BuildingType.Watchtower)],
    [BuildingType.Barracks, canUnlockBuilding(state, BuildingType.Barracks) && pop >= 18],
    [BuildingType.WallCorner, canUnlockBuilding(state, BuildingType.WallCorner) && hasCompletedBuilding(state, BuildingType.Wall)],
    [BuildingType.WallGate, canUnlockBuilding(state, BuildingType.WallGate) && hasCompletedBuilding(state, BuildingType.Wall)],
    [BuildingType.Prison, canUnlockBuilding(state, BuildingType.Prison)],
  ];
  for (const [type, cond] of defenseBuildings) {
    if (type === BuildingType.Wall || type === BuildingType.WallCorner || type === BuildingType.WallGate) {
      // Walls are placed in segments — allow multiples.
    } else if (hasPlayerBuilding(state, type)) continue;
    consider(type, cond);
  }

  if (mills < Math.ceil(pop / 2)) consider(BuildingType.LumberMill);
  if (hasMill && farmCount === 0) consider(BuildingType.Farm);
  if (hasMill && farms < Math.ceil(pop / 12) && farmCount === farms) consider(BuildingType.Farm);
  if (canBuildHouse && beds < housingHeadroom) consider(BuildingType.House);

  return priorities;
}

function countStaffAtBuilding(state: WorldState, buildingId: number): number {
  return state.entities.filter(
    (e) => e.alive && isPlayerHuman(e) && e.homeBuildingId === buildingId && !isImprisoned(e),
  ).length;
}

/** Fill construction crews and every job slot (including manual-staff buildings). */
function autoStaffAllBuildings(state: WorldState): WorldState {
  // assignAllWorkers mutates in-place; we then ensure a prison guard is present
  assignAllWorkers(state.entities.filter(isPlayerHuman), state.buildings);
  return ensurePrisonGuard(state);
}

const STAFF_TRIGGER_CATEGORIES = new Set<ActionLog['category']>([
  'auto_build',
  'buildings',
  'coverage_sweep',
  'scheduled',
  'auto_growth',
]);

function simStaffingNeeded(t: number, actionLog: ActionLog[], buildLogBefore: number): boolean {
  if (t % SIM_STAFF_EVERY === 0) return true;
  if (t % 60 === 0) return true;
  for (let i = buildLogBefore; i < actionLog.length; i++) {
    const entry = actionLog[i];
    if (!entry.ok || !STAFF_TRIGGER_CATEGORIES.has(entry.category)) continue;
    if (entry.category === 'scheduled' && !/recruit/i.test(entry.action)) continue;
    return true;
  }
  return false;
}

// FIX: Removed BuildingType.Road from donor priority — roads have no assigned workers,
// so scanning them wasted iterations and could never yield a guard.
const PRISON_GUARD_DONOR_PRIORITY: BuildingTypeName[] = [
  BuildingType.Barracks,
  BuildingType.TamingPost,
  BuildingType.Greenhouse,
  BuildingType.Store,
  BuildingType.Workshop,
  BuildingType.Market,
  BuildingType.Mill,
  BuildingType.Mansion,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.Farm,
  BuildingType.LumberMill,
  BuildingType.Mine,
  BuildingType.Quarry,
  BuildingType.Blacksmith,
  BuildingType.Church,
];

function stealWorkerForPrisonGuard(state: WorldState, prisonId: number): WorldState {
  const prison = state.buildings.find((b) => b.id === prisonId);
  if (!prison) return state;
  const humans = state.entities.filter(isPlayerHuman);
  for (const donorType of PRISON_GUARD_DONOR_PRIORITY) {
    for (const donor of state.buildings) {
      if (!donor.completed || donor.faction === 'rival' || donor.type !== donorType) continue;
      const worker = humans.find(
        (h) => h.alive
          && !h.isJuvenile
          && !isImprisoned(h)
          && !h.pregnant
          && h.homeBuildingId === donor.id,
      );
      if (!worker) continue;
      donor.occupants = donor.occupants.filter((id) => id !== worker.id);
      worker.homeBuildingId = prison.id;
      worker.job = JobType.Guard;
      worker.occupation = getOccupationForBuilding(BuildingType.Prison);
      if (!prison.occupants.includes(worker.id)) prison.occupants.push(worker.id);
      return state;
    }
  }
  return state;
}

/** Arrests require a Guard at the prison — pull one in if auto-assign missed (common when pop is fully employed). */
function ensurePrisonGuard(state: WorldState): WorldState {
  let next = state;
  for (const prison of next.buildings) {
    if (!prison.completed || prison.type !== BuildingType.Prison || prison.faction === 'rival') continue;
    if (countStaffAtBuilding(next, prison.id) > 0) continue;
    next = assignIdleWorkerToBuilding(next, prison.id);
    if (countStaffAtBuilding(next, prison.id) > 0) continue;
    next = stealWorkerForPrisonGuard(next, prison.id);
  }
  return next;
}

function formatPrisonReport(state: WorldState, log: WorldState['eventLog']): string[] {
  const imprisonEvents = log.filter((e) => e.type === 'event' && e.message.includes('imprisoned for scandal'));
  const releaseEvents = log.filter((e) => e.type === 'event' && e.message.includes('released from prison'));
  const caughtScandals = log.filter((e) => e.type === 'scandal' && e.message.includes('was caught with'));
  const rumorScandals = log.filter((e) => e.type === 'scandal' && e.message.includes('Whispers spread'));
  const prisons = state.buildings.filter((b) => b.completed && b.type === BuildingType.Prison);
  const staffedPrisons = prisons.filter((b) => countStaffAtBuilding(state, b.id) > 0).length;
  const imprisonedNow = state.entities.filter((e) => e.alive && isImprisoned(e)).length;
  const hasArch1 = state.unlockedTechs.includes('architecture_1');
  const lines = [
    `Prisons completed: ${prisons.length} | Staffed: ${staffedPrisons}`
    + ` | architecture_1: ${hasArch1 ? 'yes' : 'no'}`,
    `Scandals — caught: ${caughtScandals.length} | rumors: ${rumorScandals.length}`,
    `Imprisonments: ${imprisonEvents.length} | Releases: ${releaseEvents.length} | Jailed now: ${imprisonedNow}`,
    'Note: only caught scandals imprison married settlers (not single paramours); rumors need a staffed prison + ~22% exposure roll.',
  ];
  if (prisons.length === 0 && !hasArch1) {
    lines.push('  → No prison yet — research architecture_1 (sim now prioritizes it earlier).');
  } else if (prisons.length === 0) {
    lines.push('  → architecture_1 unlocked but no prison placed — check build coverage logs.');
  } else if (staffedPrisons === 0) {
    lines.push('  → Prison built but no Guard staffed — imprisonment cannot trigger.');
  } else if (caughtScandals.length === 0 && rumorScandals.length === 0) {
    lines.push('  → No affairs exposed — need married settlers + affair progress (Church helps).');
  } else if (caughtScandals.length === 0 && rumorScandals.length > 0) {
    lines.push('  → Rumors only this run — caught busts are RNG-heavy even with a staffed prison.');
  }
  if (imprisonEvents.length > 0) {
    for (const e of imprisonEvents.slice(0, 8)) {
      lines.push(`  Y${e.year} D${e.day} tick ${e.tick} | ${e.message}`);
    }
    if (imprisonEvents.length > 8) {
      lines.push(`  … +${imprisonEvents.length - 8} more`);
    }
  } else if (caughtScandals.length > 0) {
    for (const e of caughtScandals.slice(0, 4)) {
      lines.push(`  caught Y${e.year} D${e.day} | ${e.message}`);
    }
    if (staffedPrisons === 0) {
      lines.push('  → Caught scandals but prison had no Guard — sim now steals a worker each tick until staffed.');
    } else {
      lines.push('  → Caught scandals logged but no imprisonments (arrest roll failed or prison full).');
    }
  }
  return lines;
}

function autoBuildFree(
  state: WorldState,
  coverage: CoverageMap,
  log: ActionLog[],
  build: BuildState,
): WorldState {
  const candidates = listBuildPriorities(state, build);
  if (candidates.length === 0) return state;

  const { cx, cy } = getSimBuildCenter(state);
  for (const type of candidates) {
    const { state: next, ok, detail } = tryPlaceWithLimits(state, type, cx, cy, build);
    if (ok) {
      cov(coverage, 'buildings', type);
      log.push({
        tick: state.tick,
        category: 'auto_build',
        action: `place:${type}`,
        ok: true,
        detail: `${formatPopulationBrief(popCounts(state))} food=${Math.floor(state.resources.food)} wood=${Math.floor(state.resources.wood)}`,
      });
      return maybeCompleteBuild(next);
    }
    if (SIM_VERBOSE && detail) {
      log.push({ tick: state.tick, category: 'auto_build', action: `place:${type}`, ok: false, detail });
    }
  }
  return state;
}

function autoProfileGrowth(
  state: WorldState,
  log: ActionLog[],
  growth: GrowthState,
): WorldState {
  const settlers = popCounts(state).humans;
  if (settlers >= state.maxHumanPopulation) return state;
  resetGrowthYear(growth, state.year);
  let s = state;

  if (
    profileCfg.autoRecruit
    && !isPreWinterRecruitPause(s)
    && growth.recruitsThisYear < profileCfg.maxRecruitsPerYear
    && settlers < s.maxHumanPopulation
    && s.resources.food >= 30
    && s.resources.gold >= 20
  ) {
    const before = settlers;
    const next = recruitSettler(s);
    const after = popCounts(next).humans;
    if (after > before) {
      growth.recruitsThisYear++;
      log.push({
        tick: s.tick,
        category: 'auto_growth',
        action: 'recruit',
        ok: true,
        detail: `settlers ${before}→${after} maxPop=${s.maxHumanPopulation}`,
      });
      s = next;
    }
  }

  return s;
}

// ─── Injected coverage events (rivals, visitors, diplomacy, raids) ───────────

function injectDiplomacyEvent(state: WorldState, rivalId: string, kind: DiplomacyEventKind): WorldState | null {
  const pending = state.pendingDiplomacyEvents ?? [];
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return null;
  if (pending.some((e) => e.rivalId === rivalId && e.kind === kind)) return null;

  const meta = DIPLOMACY_META[kind];
  const event: DiplomacyEvent = {
    id: `sim_dip_${kind}_${state.tick}`,
    rivalId: rival.id,
    rivalName: rival.name,
    kind,
    emoji: meta.emoji,
    title: meta.title(rival.name),
    description: meta.description(rival.name),
    choices: DIPLOMACY_CHOICE_IDS[kind].map((id) => ({ id, label: id, hint: id })),
    createdAtTick: state.tick,
  };
  return { ...state, pendingDiplomacyEvents: [...pending, event] };
}

function dropStaleDiplomacyEvents(state: WorldState, log: ActionLog[]): WorldState {
  const events = state.pendingDiplomacyEvents ?? [];
  if (events.length === 0) return state;
  const kept: DiplomacyEvent[] = [];
  for (const evt of events) {
    if (state.tick - evt.createdAtTick >= DIPLOMACY_STALE_TICKS) {
      log.push({
        tick: state.tick,
        category: 'diplomacy_stale',
        action: evt.kind,
        ok: true,
        detail: `expired after ${DIPLOMACY_STALE_TICKS} ticks`,
      });
    } else {
      kept.push(evt);
    }
  }
  if (kept.length === events.length) return state;
  return { ...state, pendingDiplomacyEvents: kept };
}

function dropStaleRaidEvents(state: WorldState, log: ActionLog[]): WorldState {
  const events = state.pendingRaidEvents ?? [];
  if (events.length === 0) return state;
  const kept = events.filter((evt) => {
    const expires = evt.expiresAtTick ?? evt.createdAtTick + RAID_STALE_TICKS;
    const stale = state.tick >= expires || state.tick - evt.createdAtTick >= RAID_STALE_TICKS;
    if (stale) {
      log.push({
        tick: state.tick,
        category: 'raid_stale',
        action: evt.rivalName,
        ok: true,
        detail: 'expired unanswerable raid',
      });
    }
    return !stale;
  });
  if (kept.length === events.length) return state;
  return { ...state, pendingRaidEvents: kept };
}

function injectRaidEvent(state: WorldState, rivalId: string, lootFood = 25): WorldState | null {
  const pending = state.pendingRaidEvents ?? [];
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return null;
  if (pending.some((e) => e.rivalId === rivalId)) return null;

  const event: RaidEvent = {
    id: `sim_raid_${state.tick}`,
    rivalId: rival.id,
    rivalName: rival.name,
    emoji: '⚔️',
    title: `${rival.name} is raiding!`,
    description: `Sim-injected raid for balance coverage.`,
    choices: [
      { id: 'defend', label: 'Defend', hint: 'Militia fight' },
      { id: 'barricade', label: 'Barricade', hint: 'Fortify' },
      { id: 'payoff', label: `Pay ${lootFood}`, hint: 'Pay off' },
    ],
    createdAtTick: state.tick,
    expiresAtTick: state.tick + 6 * TICKS_PER_DAY,
    marchDistanceTiles: 12,
    attackerStrength: (() => {
      const defendStr = getMilitiaStrength(state, state.entities);
      const barricadeStr = getBarricadeStrength(state, state.entities);
      const defenderRef = Math.max(defendStr, barricadeStr, 40);
      const ratioBands = [0.55, 0.75, 0.92, 1.05, 1.25] as const;
      const band = ratioBands[Math.floor(state.tick / TICKS_PER_DAY) % ratioBands.length];
      return Math.max(35, Math.floor(defenderRef * band));
    })(),
    lootFood,
    lootGold: 10,
    lootWood: 30 + Math.floor(rival.population * 3),
    lootStone: 12 + rival.population,
  };
  return { ...state, pendingRaidEvents: [...pending, event] };
}

function ensureRival(
  state: WorldState,
  relationship: 'tense' | 'competitive' | 'neutral' | 'friendly',
): { state: WorldState; label: string | null } {
  if (state.rivalSettlements.some((r) => r.relationship === relationship)) {
    return { state, label: null };
  }
  const next = shallowCloneWorld(state);
  spawnRivalSettlement(next, next.entities, next.buildings);
  const idx = next.rivalSettlements.length - 1;
  next.rivalSettlements = next.rivalSettlements.map((r, i) => (
    i === idx
      ? { ...r, relationship, raidCooldownDays: 0, daysUntilAction: 8, peaceTreatyDays: 0 }
      : r
  ));
  const rival = next.rivalSettlements[idx];
  return { state: next, label: `spawn_rival:${rival.name}[${relationship}]` };
}

/** Pick a rival for harness raid injection; re-tense them so diplomacy/peace doesn't block coverage. */
function prepareRaidInjectionTarget(state: WorldState): { state: WorldState; rivalId: string | null; label: string | null } {
  let s = state;
  let label: string | null = null;
  if (s.rivalSettlements.length === 0) {
    const spawned = ensureRival(s, 'tense');
    if (spawned.label) label = spawned.label;
    s = spawned.state;
  }
  const rival = s.rivalSettlements.find((r) => r.relationship === 'tense')
    ?? s.rivalSettlements.find((r) => r.relationship === 'competitive')
    ?? s.rivalSettlements[0];
  if (!rival) return { state: s, rivalId: null, label };
  if (rival.relationship !== 'tense') {
    s = {
      ...s,
      rivalSettlements: s.rivalSettlements.map((r) => (
        r.id === rival.id
          ? { ...r, relationship: 'tense' as const, peaceTreatyDays: 0, raidCooldownDays: 0 }
          : r
      )),
    };
    label = label ?? `retense_rival:${rival.name}`;
  }
  return { state: s, rivalId: rival.id, label };
}

function ensureVisitor(state: WorldState, kind: VisitorKind): { state: WorldState; label: string | null } {
  const active = state.visitorGroups.filter((g) => g.kind === kind && g.daysLeft > 0);
  if (kind === 'refugees') {
    // New refugee wave once the prior group finished negotiation (talk + welcome/screen/turn_away).
    if (active.some((g) => !g.refugeeResolved)) return { state, label: null };
  } else if (active.some((g) => !g.leaderTalked)) {
    // Don't stack duplicate kinds before leader talk coverage runs.
    return { state, label: null };
  } else if (active.length > 0) {
    return { state, label: null };
  }
  const next = shallowCloneWorld(state);
  const beforeLen = next.visitorGroups.length;
  spawnVisitorGroup(next, next.entities, next.buildings, kind);
  const spawned = next.visitorGroups[next.visitorGroups.length - 1];
  if (kind === 'refugees' && spawned && next.visitorGroups.length > beforeLen && spawned.kind === 'refugees') {
    next.visitorGroups = next.visitorGroups.map((g, i) => (
      i === next.visitorGroups.length - 1 ? { ...g, refugeeResolved: false } : g
    ));
  }
  return { state: next, label: `spawn_visitor:${kind}` };
}

// ─── Coverage injection schedule (scales to SIM_MAX_TICKS) ─────────────────

type InjectionKind =
  | { type: 'rival'; relationship: 'tense' | 'competitive' | 'neutral' | 'friendly' }
  | { type: 'visitor'; kind: VisitorKind }
  | { type: 'diplomacy'; kind: DiplomacyEventKind }
  | { type: 'raid' };

type ScheduledInjection = { tick: number; injection: InjectionKind };

/** Player rules — rivals, visitors, diplomacy, and raids come from game RNG only. */
function buildInjectionSchedule(_totalTicks: number): ScheduledInjection[] {
  return [];
}

const INJECTION_SCHEDULE = buildInjectionSchedule(TOTAL_TICKS);
const INJECTIONS_BY_TICK = new Map<number, InjectionKind[]>();
for (const { tick, injection } of INJECTION_SCHEDULE) {
  const list = INJECTIONS_BY_TICK.get(tick) ?? [];
  list.push(injection);
  INJECTIONS_BY_TICK.set(tick, list);
}

const HAS_SCHEDULED_DIPLOMACY = INJECTION_SCHEDULE.some((e) => e.injection.type === 'diplomacy');
const HAS_SCHEDULED_RAIDS = INJECTION_SCHEDULE.some((e) => e.injection.type === 'raid');
const HAS_SCHEDULED_WINTER = TOTAL_TICKS >= FIRST_WINTER_TICK;

function formatRunLength(ticks: number): string {
  if (ticks >= FULL_BALANCE_TICKS) {
    return `${ticks} ticks (${SIM_YEARS} game years)`;
  }
  const years = (ticks / TICKS_PER_YEAR).toFixed(2);
  const days = Math.floor(ticks / TICKS_PER_DAY);
  return `${ticks} ticks (~${years} game years, ${days} days — smoke run, not the 10-year test)`;
}

function applyInjection(state: WorldState, injection: InjectionKind): { state: WorldState; label: string | null } {
  switch (injection.type) {
    case 'rival':
      return ensureRival(state, injection.relationship);
    case 'visitor':
      return ensureVisitor(state, injection.kind);
    case 'diplomacy': {
      const dipRival = state.rivalSettlements.find((r) => r.relationship === 'tense')
        ?? state.rivalSettlements[0];
      if (!dipRival) return { state, label: null };
      const injected = injectDiplomacyEvent(state, dipRival.id, injection.kind);
      return injected
        ? { state: injected, label: `diplomacy:${injection.kind}` }
        : { state, label: null };
    }
    case 'raid': {
      const prepared = prepareRaidInjectionTarget(state);
      if (!prepared.rivalId) return { state: prepared.state, label: prepared.label };
      const injected = injectRaidEvent(prepared.state, prepared.rivalId, 22);
      return injected
        ? { state: injected, label: prepared.label ?? 'raid:incoming' }
        : { state: prepared.state, label: prepared.label };
    }
    default:
      return { state, label: null };
  }
}

/** Scheduled injections so frontier / visitor options are exercised even if RNG skips them. */
function tickCoverageInjections(
  state: WorldState,
  t: number,
  log: ActionLog[],
  logger?: SimLogger,
): WorldState {
  const batch = INJECTIONS_BY_TICK.get(t);
  if (!batch) return state;

  let s = state;
  for (const injection of batch) {
    const result = applyInjection(s, injection);
    s = result.state;
    if (result.label) {
      log.push({ tick: t, category: 'inject', action: result.label, ok: true });
      logger?.live(`  → inject tick ${t}: ${result.label}`);
    }
    if (injection.type === 'raid' && result.label && !result.label.includes('raid:')) {
      log.push({ tick: t, category: 'inject', action: 'raid:incoming', ok: true });
      logger?.live(`  → inject tick ${t}: raid:incoming`);
    }
  }
  return s;
}

// ─── Auto player actions (option coverage) ─────────────────────────────────

type ActionLog = { tick: number; category: string; action: string; ok: boolean; detail?: string };

function pickUntestedChoice(
  tested: Set<string>,
  choices: string[],
  eligibility: (id: string) => boolean,
): string | null {
  for (const id of choices) {
    if (!tested.has(id) && eligibility(id)) return id;
  }
  for (const id of choices) {
    if (eligibility(id)) return id;
  }
  return null;
}

function autoResearch(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  if (state.activeResearch) return state;
  syncResearchUnlocks(state);

  const order = SIM_PROFILE === 'eco' || SIM_PROFILE === 'town'
    ? [
      'forestry_1', 'forestry_2', 'architecture_1', 'defense_2', 'defense_1', 'mining_1', 'agriculture_1',
      'defense_3', 'trade_1', 'education_1', 'medicine_1',
      'defense_4', 'defense_5', 'agriculture_2', 'mining_2',
      'architecture_2', 'trade_2', 'education_2', 'medicine_2', 'agriculture_3',
    ]
    : [
    'defense_2', 'forestry_1', 'defense_1', 'mining_1', 'agriculture_1',
    'defense_3', 'trade_1', 'education_1', 'medicine_1', 'architecture_1',
    'defense_4', 'defense_5', 'agriculture_2', 'forestry_2', 'mining_2',
    'architecture_2', 'trade_2', 'education_2', 'medicine_2', 'agriculture_3',
  ];

  for (const id of order) {
    const node = state.researchNodes.find((n) => n.id === id);
    if (!node || node.researched || !node.unlocked) continue;
    const next = startResearch(state, id);
    if (next.activeResearch === id) {
      log.push({ tick: state.tick, category: 'research', action: `start:${id}`, ok: true });
      return next;
    }
  }
  return state;
}

function autoForge(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  const smith = state.buildings.find((b) => b.completed && b.type === BuildingType.Blacksmith);
  if (!smith) return state;

  const orders: ForgeOrderId[] = FORGE_ORDERS.map((o) => o.id);
  for (const orderId of orders) {
    if (coverage.forge?.has(orderId)) continue;
    if (isForgeOrderComplete(state.villageForge, orderId)) continue;
    if (state.villageForge.activeOrder && state.villageForge.activeOrder !== orderId) continue;
    if (getForgeBlockReason(state, orderId) != null) continue;
    const before = state.villageForge.activeOrder;
    const next = queueForgeOrder(state, smith.id, orderId);
    if (next.villageForge.activeOrder === orderId && before !== orderId) {
      log.push({ tick: state.tick, category: 'forge', action: `queue:${orderId}`, ok: true });
      return next;
    }
  }
  return state;
}

function autoDiplomacy(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  const s = dropStaleDiplomacyEvents(state, log);
  const events = s.pendingDiplomacyEvents ?? [];
  if (events.length === 0) return s;

  for (const evt of events) {
    const cat = `diplomacy_${evt.kind}`;
    const tested = coverage[cat] ?? new Set();
    const choices = DIPLOMACY_CHOICE_IDS[evt.kind] ?? [];
    const choice = pickUntestedChoice(tested, choices, (id) => {
      const el = getDiplomacyChoiceEligibility(s, evt, id);
      return el.ok;
    });
    if (!choice) continue;

    const beforeLen = s.pendingDiplomacyEvents.length;
    const next = respondToDiplomacyEvent(s, evt.id, choice);
    const resolved = next.pendingDiplomacyEvents.length < beforeLen;
    if (resolved) cov(coverage, cat, choice);
    const remaining = next.pendingDiplomacyEvents?.find((e) => e.id === evt.id);
    log.push({
      tick: s.tick,
      category: cat,
      action: choice,
      ok: resolved,
      detail: resolved || !remaining
        ? undefined
        : getDiplomacyChoiceEligibility(next, remaining, choice).blockReason,
    });
    return next;
  }
  return s;
}

function predictRaidOutcome(
  state: WorldState,
  evt: RaidEvent,
  choice: (typeof RAID_RESPONSES)[number],
): RaidOutcomeTier | 'payoff' | 'unresolved' {
  if (choice === 'payoff') return 'payoff';
  const strength = choice === 'barricade'
    ? getBarricadeStrength(state, state.entities)
    : getMilitiaStrength(state, state.entities);
  return resolveDefenseRatio(strength, evt.attackerStrength);
}

function sliceNewCombatMessages(beforeLen: number, state: WorldState): string[] {
  const msgs: string[] = [];
  for (let i = beforeLen; i < state.eventLog.length; i++) {
    const entry = state.eventLog[i];
    if (entry?.type === 'combat') msgs.push(entry.message);
  }
  return msgs;
}

function autoRaidResponse(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  const s = dropStaleRaidEvents(state, log);
  const events = s.pendingRaidEvents ?? [];
  if (events.length === 0) return s;

  for (const evt of events) {
    const tested = coverage.raid_response ?? new Set();
    const choice = pickUntestedChoice(tested, [...RAID_RESPONSES], (id) => {
      if (id === 'defend') {
        return (hasStoneSpears(s) || hasIronSpears(s))
          && getMilitiaStrength(s, s.entities) > 0;
      }
      if (id === 'barricade') return s.resources.wood >= 20 && s.resources.stone >= 10;
      if (id === 'payoff') return s.resources.food >= evt.lootFood;
      return false;
    });
    if (!choice) continue;

    const beforeLen = s.pendingRaidEvents.length;
    const eventLogBefore = s.eventLog.length;
    const deathsBefore = s.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
    const predicted = predictRaidOutcome(s, evt, choice);
    const next = respondToRaidEvent(s, evt.id, choice);
    const resolved = next.pendingRaidEvents.length < beforeLen;
    if (resolved) cov(coverage, 'raid_response', choice);
    const deathsAfter = next.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
    const casualties = Math.max(0, deathsBefore - deathsAfter);
    const combatMsgs = sliceNewCombatMessages(eventLogBefore, next);
    const outcomeMsg = combatMsgs[combatMsgs.length - 1] ?? '(no combat log)';
    log.push({
      tick: s.tick,
      category: 'raid_response',
      action: choice,
      ok: resolved,
      detail: `attacker=${evt.attackerStrength} vs ${
        choice === 'barricade'
          ? getBarricadeStrength(s, s.entities)
          : getMilitiaStrength(s, s.entities)
      } | predicted=${predicted} | casualties=${casualties} | ${outcomeMsg}`,
    });
    return next;
  }
  return s;
}

function canVisitorTrade(state: WorldState, action: VisitorTradeAction): boolean {
  if (action === 'buy_food') return state.resources.gold >= 25;
  if (action === 'buy_wood') return state.resources.gold >= 20;
  if (action === 'sell_food') return state.resources.food >= 30;
  return false;
}

function canRefugeeChoice(state: WorldState, choice: RefugeeChoice): boolean {
  if (choice === 'turn_away') return true;
  if (popCounts(state).humans >= state.maxHumanPopulation) return false;
  if (choice === 'welcome') return state.resources.food >= 40;
  if (choice === 'screen') return state.resources.food >= 20;
  return false;
}

function autoVisitors(state: WorldState, coverage: CoverageMap, log: ActionLog[]): WorldState {
  let s = state;
  const talkTested = coverage.visitor_talk ?? new Set();

  // Respond to game-spawned visitors only — no harness respawns.
  const groups = [...s.visitorGroups].sort((a, b) => {
    const aNeedTalk = !a.leaderTalked && !talkTested.has(a.kind);
    const bNeedTalk = !b.leaderTalked && !talkTested.has(b.kind);
    if (aNeedTalk !== bNeedTalk) return aNeedTalk ? -1 : 1;
    return 0;
  });

  for (const group of groups) {
    if (group.kind === 'refugees') {
      if (!group.leaderTalked) {
        const before = group.leaderTalked;
        s = talkToVisitorLeader(s, group.id);
        const g = s.visitorGroups.find((x) => x.id === group.id);
        const resolved = Boolean(g?.leaderTalked && !before);
        if (resolved) cov(coverage, 'visitor_talk', group.kind);
        log.push({ tick: s.tick, category: 'visitor_talk', action: group.kind, ok: resolved });
        continue;
      }
      if (!group.refugeeResolved) {
        const tested = coverage.refugee ?? new Set();
        const choices: RefugeeChoice[] = ['welcome', 'screen', 'turn_away'];
        const choice = pickUntestedChoice(tested, choices, (id) => canRefugeeChoice(s, id as RefugeeChoice));
        if (!choice) continue;
        const before = group.refugeeResolved;
        s = negotiateRefugees(s, group.id, choice);
        const g = s.visitorGroups.find((x) => x.id === group.id);
        const resolved = Boolean(g?.refugeeResolved && !before);
        if (resolved) cov(coverage, 'refugee', choice);
        log.push({ tick: s.tick, category: 'refugee', action: choice, ok: resolved });
      }
      continue;
    }

    if (!group.leaderTalked) {
      const before = group.leaderTalked;
      s = talkToVisitorLeader(s, group.id);
      const g = s.visitorGroups.find((x) => x.id === group.id);
      const resolved = Boolean(g?.leaderTalked && !before);
      if (resolved) cov(coverage, 'visitor_talk', group.kind);
      log.push({ tick: s.tick, category: 'visitor_talk', action: group.kind, ok: resolved });
    }

    const tradeActions: VisitorTradeAction[] = ['buy_food', 'buy_wood', 'sell_food'];
    const canTrade = group.kind === 'traders' || group.kind === 'nomads' || group.kind === 'hunters';
    if (canTrade && group.tradesCompleted < 3) {
      const tested = coverage.visitor_trade ?? new Set();
      const action = pickUntestedChoice(tested, tradeActions, (id) => canVisitorTrade(s, id as VisitorTradeAction));
      if (action) {
        const before = group.tradesCompleted;
        s = tradeWithVisitors(s, group.id, action as VisitorTradeAction);
        const g = s.visitorGroups.find((x) => x.id === group.id);
        const resolved = (g?.tradesCompleted ?? 0) > before;
        if (resolved) cov(coverage, 'visitor_trade', action);
        log.push({ tick: s.tick, category: 'visitor_trade', action, ok: resolved });
      }
    }
  }

  return s;
}

function rivalActionApplied(
  before: WorldState,
  after: WorldState,
  rivalId: string,
  actionId: string,
): boolean {
  const rb = before.rivalSettlements.find((r) => r.id === rivalId);
  const ra = after.rivalSettlements.find((r) => r.id === rivalId);
  if (!rb || !ra) return false;

  switch (actionId) {
    case 'gift': {
      // FIX: Old check was fragile — any food drop counted as "gift sent". Now also
      // checks for a specific event log entry on the same tick to confirm the action
      // actually triggered, not just passive consumption.
      const hadGiftEvent = hasNewEventLogType(before.eventLog.length, after, 'event', after.tick);
      return after.resources.food < before.resources.food || hadGiftEvent;
    }
    case 'trade_pact':
      return ra.relationship === 'friendly'
        && (rb.relationship !== 'friendly' || after.resources.gold < before.resources.gold);
    case 'show_strength':
      return rb.relationship !== ra.relationship
        || rb.daysUntilAction !== ra.daysUntilAction
        || hasNewEventLogType(before.eventLog.length, after, 'event', after.tick);
    case 'peace_treaty':
      return (after.resources.gold < before.resources.gold && after.resources.food < before.resources.food)
        || ra.peaceTreatyDays > rb.peaceTreatyDays;
    case 'counter_raid':
      return hasNewEventLogType(before.eventLog.length, after, 'combat', after.tick);
    default:
      return false;
  }
}

function rivalsForAction(rivals: WorldState['rivalSettlements'], actionId: string, tick: number): WorldState['rivalSettlements'] {
  const relRank: Record<string, number> = { tense: 0, competitive: 1, neutral: 2, friendly: 3 };
  const sorted = [...rivals].sort((a, b) => (relRank[a.relationship] ?? 9) - (relRank[b.relationship] ?? 9));
  const rotate = tick % Math.max(1, sorted.length);
  const rotated = [...sorted.slice(rotate), ...sorted.slice(0, rotate)];
  if (actionId === 'trade_pact') {
    return rotated.filter((r) => r.relationship === 'neutral' || r.relationship === 'competitive');
  }
  if (actionId === 'show_strength' || actionId === 'counter_raid') {
    return rotated.filter((r) => r.relationship === 'tense' || r.relationship === 'competitive');
  }
  if (actionId === 'peace_treaty') {
    return rotated.filter((r) => r.relationship !== 'friendly');
  }
  return rotated;
}

function autoRivalActions(
  state: WorldState,
  coverage: CoverageMap,
  log: ActionLog[],
  frontier: FrontierTracker,
): WorldState {
  let s = state;
  const rivals = s.rivalSettlements;
  if (rivals.length === 0) return s;

  const actions: { id: string; fn: (st: WorldState, rid: string) => WorldState }[] = [
    { id: 'gift', fn: sendRivalGift },
    { id: 'trade_pact', fn: establishRivalTradePact },
    { id: 'show_strength', fn: showStrengthToRival },
    { id: 'peace_treaty', fn: signPeaceTreaty },
  ];

  const untested = actions.filter((a) => !coverage.rival_action?.has(a.id));
  for (const { id, fn } of untested) {
    for (const rival of rivalsForAction(rivals, id, s.tick)) {
      const before = s;
      const next = fn(s, rival.id);
      if (rivalActionApplied(before, next, rival.id, id)) {
        cov(coverage, 'rival_action', id);
        log.push({ tick: s.tick, category: 'rival_action', action: `${id}:${rival.name}`, ok: true });
        frontier.recordOutgoingDiplomacy();
        s = next;
        break;
      }
    }
  }

  if (!coverage.rival_action?.has('counter_raid')) {
    for (const rival of rivalsForAction(s.rivalSettlements, 'counter_raid', s.tick)) {
      let attemptState = s;
      const liveRival = attemptState.rivalSettlements.find((r) => r.id === rival.id);
      if (!liveRival) continue;

      if (liveRival.relationship === 'friendly' || isRivalAtPeace(liveRival)) {
        attemptState = {
          ...attemptState,
          rivalSettlements: attemptState.rivalSettlements.map((r) => (
            r.id === rival.id
              ? { ...r, relationship: 'tense' as const, peaceTreatyDays: 0, raidCooldownDays: 0 }
              : r
          )),
        };
      }

      const check = canLaunchRaidOnRival(
        attemptState,
        attemptState.rivalSettlements.find((r) => r.id === rival.id) ?? liveRival,
      );
      if (!check.ok) continue;

      const before = attemptState;
      const next = launchRaidOnRival(attemptState, rival.id);
      if (rivalActionApplied(before, next, rival.id, 'counter_raid')) {
        cov(coverage, 'rival_action', 'counter_raid');
        log.push({ tick: s.tick, category: 'rival_action', action: `counter_raid:${rival.name}`, ok: true });
        frontier.recordOutgoingRaid();
        s = next;
        break;
      }
    }
  }

  return s;
}

// ─── Main simulation ─────────────────────────────────────────────────────────

async function runSimulation(): Promise<void> {
  await Promise.all([loadNames(), preloadDialogueBank()]);
  // Particles / screen shake are no-ops in balance testing but still cost allocations.
  saveJuiceEffectsEnabled(false);

  // FIX: GROWTH_STATE is now local to avoid cross-run pollution.
  const growthState = createGrowthState();
  const buildState = createBuildState();

  const logger = new SimLogger(SIM_PROFILE);
  const coverage: CoverageMap = {};
  const actionLog: ActionLog[] = [];
  const yearSnapshots: YearSnapshot[] = [];
  const winterTracker = new WinterTracker();
  const frontierTracker = new FrontierTracker();
  const perfSamples: { tick: number; ms: number; humans: number; visitors: number; alive: number }[] = [];
  const mainSyncMs: number[] = [];
  const workerWaitMs: number[] = [];
  const prepSyncMs: number[] = [];
  const allTickMs: number[] = [];
  const pregnancySnap: PregnancySnap = new Map();

  let state = initGame({ villageName: 'Balanceville' });
  const simFocus = getSimFocus(state);

  const workerBoot = await initSimWorkerHost(state);
  const workerHost = workerBoot.host;
  state = workerBoot.state;

  const scheduled = buildScheduledSupports(SIM_PROFILE);
  let lastYear = state.year;
  let lastSeason: Season | null = null;
  let lastDayInYear = state.dayInYear;
  let playerDeathsCumulative = 0;
  let playerBirthsCumulative = 0;

  const start = performance.now();
  let lastProgressTick = 0;

  logger.live(`=== Wilderfolk ${SIM_YEARS}-year balance simulation (live) ===`);
  logger.live(
    SIM_USE_WORKER
      ? simHeadless()
        ? 'Tick engine: worker_threads (headless — syncSimPrep, no render SoA)'
        : 'Tick engine: worker_threads (full importSave + render SoA — playability path)'
      : 'Tick engine: main-thread gameTick (SIM_USE_WORKER=0 legacy debug path)',
  );
  if (SIM_USE_WORKER) {
    logger.live(
      'Perf note: worker path is ~4× slower wall time — validates live-game protocol, not balance throughput.'
      + ' For fast runs use: npm run simulate:10year (main-thread default).',
    );
  } else {
    logger.live('Perf: main-thread ticks (fast balance path). Worker validation: npm run simulate:10year:worker');
  }
  logger.live(`Profile: ${SIM_PROFILE} — ${profileCfg.label}`);
  logger.live(`Auto-build policy: ${describeSimBuildPolicy(simBuildPolicy)}`);
  const names = getNamePoolInfo();
  logger.live(
    names.full
      ? `Name pool: full lists (${names.male} male, ${names.female} female, ${names.last} surnames)`
      : `Name pool: embedded fallback (${names.male} male, ${names.female} female — expect repeats like Ezra & Hannah)`,
  );
  logger.live(`Targets @ Y${SIM_YEARS}: pop ${scaledPopGateMin()}–${scaledPopGateMax()} (reference only)`);
  logger.live(
    `Player rules: initGame defaults | construction=${SIM_INSTANT_BUILD ? 'instant (cheat)' : 'real'}`
    + ` | no grants/injections/coverage sweeps`,
  );
  logger.live(`Target: ${formatRunLength(TOTAL_TICKS)} | map ${state.width}×${state.height}`);
  if (IS_SMOKE_RUN) {
    const winterNote = HAS_SCHEDULED_WINTER
      ? 'on'
      : `off (winter starts tick ${FIRST_WINTER_TICK}, smoke run is ${TOTAL_TICKS})`;
    logger.live(
      `⚠ Smoke run — NOT the ${SIM_YEARS}-year balance test. Unset SIM_MAX_TICKS for official verdict`
      + ` (${FULL_BALANCE_TICKS} ticks = ${SIM_YEARS} years).`,
    );
    logger.live(
      `Smoke gates: Y${SIM_YEARS}/pop-range skipped; winter=${winterNote};`
      + ` diplomacy=${HAS_SCHEDULED_DIPLOMACY ? 'on' : 'off'};`
      + ` raids=${HAS_SCHEDULED_RAIDS ? 'on' : 'off'}`,
    );
  }
  logger.live(`Progress every ${PROGRESS_EVERY} ticks (~${(PROGRESS_EVERY / TICKS_PER_DAY).toFixed(0)} game days)`);
  logger.live(
    `Build mode: village needs — auto_build day 1 + every ${AUTO_BUILD_EVERY} ticks (~${(AUTO_BUILD_EVERY / TICKS_PER_DAY).toFixed(0)} game days)`
    + `, max ${maxHousesPerYear()} houses/year`
    + ` (${expectedBuildingTypeCount()} types); placements stream live as 🏗️`,
  );
  logger.live(`Auto-staff: every ${SIM_STAFF_EVERY} ticks + after placements/recruits (not every tick)`);
  if (SIM_LOG_LIFE) {
    logger.live(`Life events: live → ${logger.getLifeLogPath()} (pregnancies, births, deaths, marriages, scandals, prison)`);
  }
  logger.live('');

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    for (const action of scheduled) {
      if (action.at === t) {
        const result = action.fn(state);
        state = result.state;
        actionLog.push({
          tick: t,
          category: 'scheduled',
          action: action.label,
          ok: result.ok,
          detail: result.detail,
        });
        if (SIM_VERBOSE || action.at >= TICKS_PER_YEAR) {
          const suffix = result.ok ? '' : ` [FAILED${result.detail ? `: ${result.detail}` : ''}]`;
          logger.live(`  → scheduled tick ${t}: ${action.label}${suffix}`);
        }
      }
    }

    state = tickCoverageInjections(state, t, actionLog, logger);

    const buildLogBefore = actionLog.length;

    // Order matters: research/forge first, then frontier responses (fresh eligibility),
    // then growth/placement which spend resources.
    state = autoResearch(state, coverage, actionLog);
    state = autoForge(state, coverage, actionLog);
    state = autoDiplomacy(state, coverage, actionLog);
    state = autoRaidResponse(state, coverage, actionLog);
    state = autoVisitors(state, coverage, actionLog);
    if (t % 72 === 0) {
      state = autoRivalActions(state, coverage, actionLog, frontierTracker);
    }
    if (shouldAttemptAutoBuild(t)) {
      state = autoBuildFree(state, coverage, actionLog, buildState);
    }
    if (t % GROWTH_EVERY === 0) {
      state = autoProfileGrowth(state, actionLog, growthState);
    }
    if (simStaffingNeeded(t, actionLog, buildLogBefore)) {
      state = autoStaffAllBuildings(state);
    }
    drainBuildActions(logger, actionLog, buildLogBefore);

    const woodBeforeTick = state.resources.wood;
    const popBeforeTick = popCounts(state).humans;
    const eventLogLenBefore = state.eventLog.length;

    const tickStart = performance.now();
    const tickResult = await advanceSimTick(state, simFocus, workerHost);
    state = tickResult.state;
    if (tickResult.timing) {
      prepSyncMs.push(tickResult.timing.importMs);
      mainSyncMs.push(tickResult.timing.mainSyncMs);
      workerWaitMs.push(tickResult.timing.workerWaitMs);
    }
    pruneEventLog(state);
    frontierTracker.scanIncoming(state);
    allTickMs.push(performance.now() - tickStart);

    if (SIM_LOG_LIFE) {
      drainLifeEvents(logger, pregnancySnap, eventLogLenBefore, state);
      logger.flushLifeBuffers();
    }

    const playerDeathsThisTick = countNewPlayerDeaths(eventLogLenBefore, state);
    playerDeathsCumulative += playerDeathsThisTick;
    playerBirthsCumulative += countNewEventLogType(eventLogLenBefore, state, 'birth');

    if (state.dayInYear >= PRE_WINTER_DAY && state.dayInYear < WINTER_START_DAY && lastDayInYear < PRE_WINTER_DAY) {
      winterTracker.capturePreWinter(state);
      const counts = popCounts(state);
      const pop = counts.humans;
      const woodNeedDay = getWoodNeedPerDay(pop);
      const woodNeedWinter = getWinterWoodNeed(pop);
      const woodBufferDays = woodNeedDay > 0 ? Math.floor(state.resources.wood / woodNeedDay) : 999;
      const foodPerCap = pop > 0 ? state.resources.food / pop : 0;
      logger.live(
        `  📋 Pre-winter Y${state.year} day ${PRE_WINTER_DAY} | ${formatPopulationBrief(counts, state.maxHumanPopulation)} beds=${getTotalBeds(state)}`
        + ` food=${Math.floor(state.resources.food)} (${foodPerCap.toFixed(1)}/cap) wood=${Math.floor(state.resources.wood)}`
        + ` buffer=${woodBufferDays}d need=${woodNeedWinter}`,
      );
    }
    const season = getSeason(state.dayInYear);
    if (season === Season.Winter) {
      winterTracker.recordWinterDeaths(playerDeathsThisTick);
      winterTracker.onWinterIntraDay(state);
      if (state.tick % TICKS_PER_DAY === 0) {
        winterTracker.onWinterCalendarDayEnd(state, woodBeforeTick, popBeforeTick);
      }
    }

    if (state.year !== lastYear) {
      resetBuildYear(buildState, state.year);
      const snap = captureYearSnapshot(state, playerDeathsCumulative, frontierTracker);
      yearSnapshots.push(snap);
      syncResearchCoverage(state, coverage);
      syncBuildingCoverage(state, coverage);
      syncForgeCoverage(state, coverage);
      logger.progressYear(
        t,
        state.year,
        `YEAR END | ${formatPopulationBrief({ humans: snap.pop, visitorHumans: snap.visitorHumans, rivalHumans: 0 })} ${snap.resources} eco=${snap.eco}% rep=${snap.rep}`
        + ` | buildings=${snap.buildings} [${snap.buildingTypes}]`
        + ` rivals=${snap.rivals} playerDeaths=${snap.playerDeaths}`,
      );
      lastYear = state.year;
    }

    if (lastSeason !== null && lastSeason !== Season.Winter && season === Season.Winter) {
      const e = winterTracker.onWinterEnter(state, playerDeathsCumulative);
      logger.live(
        `  ❄ Winter Y${state.year} day ${e.day} ENTER | ${formatPopulationBrief({ humans: e.pop, visitorHumans: e.visitors, rivalHumans: 0 }, e.maxPop)} beds=${e.beds}`
        + ` food=${e.food} wood=${e.wood} need=${e.woodNeedDay}/d (${e.woodNeedWinter} total)`
        + ` buffer=${e.woodBufferDays}d eco=${e.eco}%`,
      );
    }
    if (lastSeason === Season.Winter && season !== Season.Winter) {
      const rec = winterTracker.onWinterExit(state, playerDeathsCumulative);
      if (rec) {
        logger.live(
          `  ❄ Winter Y${rec.year} EXIT ${rec.passed ? 'PASS' : 'FAIL'}`
          + ` | minFood=${rec.minFood} minWood=${rec.minWood} minPop=${rec.minPop}`
          + ` playerDeaths=${rec.playerDeathsInWinter} netLoss=${rec.netPopLoss}`
          + ` heatingFail=${rec.heatingFailDays}d`
          + (rec.failReasons.length ? ` — ${rec.failReasons.join('; ')}` : ''),
        );
      }
    }
    lastSeason = season;
    lastDayInYear = state.dayInYear;

    if (t - lastProgressTick >= PROGRESS_EVERY) {
      const recentMs = allTickMs.slice(-Math.min(PROGRESS_EVERY, allTickMs.length));
      const avgRecent = recentMs.length
        ? recentMs.reduce((a, b) => a + b, 0) / recentMs.length
        : 0;
      const beds = getTotalBeds(state);
      let aliveEntities = 0;
      for (const e of state.entities) if (e.alive) aliveEntities++;
      logger.progress(
        t,
        state.year,
        state.dayInYear,
        `${formatPopulationBrief(popCounts(state), state.maxHumanPopulation)} beds=${beds}`
        + ` food=${Math.floor(state.resources.food)} wood=${Math.floor(state.resources.wood)}`
        + ` eco=${state.ecosystemHealth}%`
        + ` entities=${aliveEntities}`
        + ` | ${formatBuildingLiveSummary(state, coverage)}`
        + ` | ${frontierTracker.formatProgress()}`
        + ` | avg ${avgRecent.toFixed(2)}ms/tick`,
      );
      lastProgressTick = t;
    }

    if (t % PERF_SAMPLE_EVERY === 0) {
      let alive = 0;
      for (const e of state.entities) if (e.alive) alive++;
      const counts = popCounts(state);
      perfSamples.push({
        tick: t,
        ms: allTickMs[allTickMs.length - 1],
        humans: counts.humans,
        visitors: counts.visitorHumans,
        alive,
      });
    }
  }

  winterTracker.forceCloseOpenWinter(state, playerDeathsCumulative);

  syncResearchCoverage(state, coverage);
  syncBuildingCoverage(state, coverage);
  syncForgeCoverage(state, coverage);

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const overall = summarizeTickMs(allTickMs);
  const syncOverall = summarizeTickMs(mainSyncMs);
  const workerOverall = summarizeTickMs(workerWaitMs);
  const completedBuildings = state.buildings.filter((b) => b.completed && b.faction !== 'rival');
  const log = state.eventLog;
  const combatEvents = log.filter((e) => e.type === 'combat').length;
  const tradeEvents = log.filter((e) => e.type === 'trade').length;
  const researchEvents = log.filter((e) => e.type === 'research').length;

  logger.live(`\n✓ Simulation complete in ${elapsed}s`);
  logger.log(`=== Wilderfolk ${SIM_YEARS}-year balance simulation ===`);
  logger.log(`Profile: ${SIM_PROFILE} — ${profileCfg.label}`);
  logger.log(`Targets @ Y${SIM_YEARS}: pop ${scaledPopGateMin()}–${scaledPopGateMax()} (reference only)`);
  logger.log(`Ticks: ${formatRunLength(TOTAL_TICKS)} | Wall time: ${elapsed}s`);
  logger.log(`Calendar: Year ${state.year}, Day ${state.dayInYear} | Total days: ${Math.floor(state.tick / TICKS_PER_DAY)}`);
  logger.log(`Map: ${state.width}×${state.height}`);
  logger.log(`Housing: ${getTotalBeds(state)} beds | maxPop=${state.maxHumanPopulation}`);

  logger.section('Year-by-year snapshots');
  for (const y of yearSnapshots) {
    logger.log(
      `Y${y.year} tick=${y.tick} | ${formatPopulationBrief({ humans: y.pop, visitorHumans: y.visitorHumans, rivalHumans: 0 })} | ${y.resources} | eco=${y.eco}% (≥80% streak=${y.ecoYears80}y)`
      + ` | rep=${y.rep} | ${y.militia} | grazing=${y.grazing}`
      + ` | buildings=${y.buildings} [${y.buildingTypes}]`
      + ` raids_on=${y.raidsOnVillage} raids_out=${y.raidsInitiated}`
      + ` dip_on=${y.diplomacyOnVillage} dip_out=${y.diplomacyInitiated}`
      + ` | visitor_groups=${y.visitors} rivals=${y.rivals} playerDeaths=${y.playerDeaths}`,
    );
  }

  logger.section(`Winter log (${SIM_YEARS}-year test judgment)`);
  const winterLines = winterTracker.formatReport();
  if (winterLines.length === 0) {
    logger.log('(no winters captured)');
  } else {
    for (const line of winterLines) logger.log(line);
  }

  logger.section('End state — population');
  const endPop = popCounts(state);
  logger.log(
    `Camp population: ${formatPopulationBrief(endPop)}`
    + ` (adults ${humans.filter((h) => !h.isJuvenile).length}, children ${humans.filter((h) => h.isJuvenile).length})`,
  );
  logger.log(`Village leader id: ${state.villageLeaderId ?? 'none'} | last election year: ${state.lastElectionYear}`);
  logger.log(`Player deaths (entity-tracked): ${playerDeathsCumulative} | births: ${playerBirthsCumulative}`);
  logger.log(`Death events in log (all entities): ${log.filter((e) => e.type === 'death').length}`);

  logger.section('Prison & scandal');
  for (const line of formatPrisonReport(state, log)) logger.log(line);

  logger.section('Combat & raids');
  for (const line of formatCombatReportLines(log, actionLog)) logger.log(line);

  logger.section('Building inventory');
  for (const line of formatBuildingInventoryReport(state, coverage)) logger.log(line);

  logger.section('Build chronicle (automated placements)');
  for (const line of formatBuildChronicle(actionLog)) logger.log(line);

  logger.section('End state — village & frontier');
  logger.log(`Completed buildings: ${completedBuildings.length}`);
  logger.log(`Building types placed: ${formatBuildingTypesLine(state)}`);
  logger.log(`Resources: ${resourceSnapshot(state)}`);
  logger.log(`Reputation: ${state.villageReputation} | Ecosystem: ${state.ecosystemHealth}% | eco≥80% years: ${state.ecoHealthYearsAbove80}`);
  logger.log(`Wildlife: rabbits=${state.wildlifeCounts.rabbits} deer=${state.wildlifeCounts.deer} wolves=${state.wildlifeCounts.wolves} grass=${state.wildlifeCounts.grass}`);
  const wallSegments = countCompletedDefenseBuildings(state.buildings, [
    BuildingType.Wall, BuildingType.WallCorner, BuildingType.WallGate,
  ]);
  logger.log(
    `Militia: ${militiaSnapshot(state)} | raw strength=${getMilitiaStrength(state, state.entities)}`
    + ` barricade=${getBarricadeStrength(state, state.entities)} (+${getWallSegmentBonus(state.buildings, state)} from ${wallSegments} wall segments)`,
  );
  const forged = FORGE_ORDERS.filter((o) => isForgeOrderComplete(state.villageForge, o.id)).map((o) => o.id).join(',') || 'none';
  logger.log(`Forge: forged=[${forged}] active=${state.villageForge.activeOrder ?? 'none'}`);
  logger.log(`Researched: ${state.researchNodes.filter((n) => n.researched).map((n) => n.id).join(', ') || '(none)'}`);
  logger.log(`Rivals (${state.rivalSettlements.length}): ${state.rivalSettlements.map((r) => `${r.name}[${r.relationship} pop=${r.population}]`).join('; ') || 'none'}`);

  syncResearchCoverage(state, coverage);
  syncBuildingCoverage(state, coverage);
  syncForgeCoverage(state, coverage);

  const diplomacyResolved = actionLog.filter((a) => a.category.startsWith('diplomacy_') && a.ok).length;
  const raidsResolved = actionLog.filter((a) => a.category === 'raid_response' && a.ok).length;
  const diplomacyCoverage = Object.keys(EXPECTED_OPTIONS)
    .filter((k) => k.startsWith('diplomacy_'))
    .reduce((n, k) => n + (coverage[k]?.size ?? 0), 0);

  logger.section('Event totals');
  for (const line of formatEventSummaryLines(log)) logger.log(line);
  logger.log(`Player deaths (entity-tracked): ${playerDeathsCumulative} | births (log): ${playerBirthsCumulative}`);
  logger.log(`Combat events: ${combatEvents} | Trade events: ${tradeEvents} | Research events: ${researchEvents}`);
  logger.log(
    `Frontier totals: raids on village=${frontierTracker.incomingRaids} player raids=${frontierTracker.outgoingRaids}`
    + ` | diplomacy on village=${frontierTracker.incomingDiplomacy} player diplomacy=${frontierTracker.outgoingDiplomacy}`,
  );
  logger.log(`Diplomacy responses: ${diplomacyResolved} (coverage choices=${diplomacyCoverage}) | Raid responses: ${raidsResolved} (coverage=${coverage.raid_response?.size ?? 0})`);

  if (SIM_LOG_EVENTS) {
    logger.section('Village chronicle — all events (grouped, oldest first)');
    for (const line of formatGroupedChronicleLines(log)) logger.log(line);
  } else {
    logger.log('\n(Set SIM_LOG_EVENTS=1 to include full weddings/births/deaths listing in this log)');
  }

  const chronicleStamp = new Date().toISOString().replace(/[:.]/g, '-');
  const chronicleEngineTag = SIM_USE_WORKER ? '' : '-mainthread';
  const chroniclePath = process.env.SIM_CHRONICLE_FILE
    ?? join(defaultLogDir, `sim-${SIM_YEARS}year-${SIM_PROFILE}${chronicleEngineTag}-chronicle-${chronicleStamp}.txt`);
  writeChronicleFile(log, buildChronicleMeta(state), chroniclePath);
  if (SIM_LOG_LIFE) {
    logger.log(`Life events log: ${logger.getLifeLogPath()} (${logger.getLifeEventCount()} entries)`);
  }
  logger.log(`\nFlat chronicle export: ${chroniclePath}`);

  logger.section('Option coverage');
  for (const line of covReport(coverage, EXPECTED_OPTIONS)) {
    logger.log(line);
  }

  logger.section('Performance');
  logger.log(
    `Round-trip (harness): avg=${overall.avg.toFixed(2)}ms p50=${overall.p50.toFixed(2)}ms p95=${overall.p95.toFixed(2)}ms max=${overall.max.toFixed(2)}ms`,
  );
  if (SIM_USE_WORKER && mainSyncMs.length > 0) {
    const importOverall = summarizeTickMs(prepSyncMs);
    logger.log(
      `Prep sync (importSave/syncSimPrep): avg=${importOverall.avg.toFixed(2)}ms p50=${importOverall.p50.toFixed(2)}ms`
      + ` p95=${importOverall.p95.toFixed(2)}ms max=${importOverall.max.toFixed(2)}ms`,
    );
    logger.log(
      `Main-thread sync (playability): avg=${syncOverall.avg.toFixed(2)}ms p50=${syncOverall.p50.toFixed(2)}ms`
      + ` p95=${syncOverall.p95.toFixed(2)}ms max=${syncOverall.max.toFixed(2)}ms`,
    );
    logger.log(
      `Worker sim wait (off-thread): avg=${workerOverall.avg.toFixed(2)}ms p50=${workerOverall.p50.toFixed(2)}ms`
      + ` p95=${workerOverall.p95.toFixed(2)}ms max=${workerOverall.max.toFixed(2)}ms`,
    );
  }
  logger.log(`Budget @ 60fps: ${(1000 / 60).toFixed(1)}ms/frame for main-thread sync | @ 10×: ${(1000 / 600).toFixed(2)}ms/tick`);
  for (const s of perfSamples) {
    logger.log(
      `  tick ${s.tick}: ${s.ms.toFixed(2)}ms | ${formatPopulationBrief({ humans: s.humans, visitorHumans: s.visitors, rivalHumans: 0 })} alive_entities=${s.alive}`,
    );
  }

  const winterRecords = winterTracker.getRecords();
  const completeWinterRecords = winterRecords.filter((r) => !r.incomplete);
  const wintersPassed = completeWinterRecords.filter((r) => r.passed).length;
  const wintersTotal = completeWinterRecords.length;
  const popGateMin = scaledPopGateMin();
  const popGateMax = scaledPopGateMax();
  const popInRange = humans.length >= popGateMin && humans.length <= popGateMax;
  const winterGatesApplicable = HAS_SCHEDULED_WINTER && wintersTotal > 0;
  const buildingTypesCompleted = getCompletedBuildingTypes(state).size;
  const buildingTypesExpected = expectedBuildingTypeCount();
  const missingBuildingTypes = simCoverageBuildingTypes().filter(
    (type) => !coverage.buildings?.has(type),
  );
  const allBuildingTypesBuilt = missingBuildingTypes.length === 0;

  logger.section(`Balance gates — profile: ${SIM_PROFILE}`);
  type BalanceGate = {
    name: string;
    pass: boolean;
    detail: string;
    applicable: boolean;
    skipReason?: string;
  };
  const gates: BalanceGate[] = [
    {
      name: `Reached year ${SIM_YEARS}`,
      applicable: IS_FULL_BALANCE_RUN,
      skipReason: `smoke run — ${SIM_YEARS}-year test needs ${FULL_BALANCE_TICKS} ticks (have ${TOTAL_TICKS})`,
      pass: state.year >= SIM_YEARS,
      detail: `year=${state.year}`,
    },
    {
      name: 'Population alive',
      applicable: true,
      pass: humans.length > 0,
      detail: formatPopulationBrief(endPop),
    },
    {
      name: 'Food stockpile > 0',
      applicable: true,
      pass: state.resources.food > 0,
      detail: `food=${Math.floor(state.resources.food)}`,
    },
    {
      name: 'All winters survived',
      applicable: winterGatesApplicable,
      skipReason: HAS_SCHEDULED_WINTER
        ? 'no completed winter in run'
        : `run ended before winter (tick ${TOTAL_TICKS} < ${FIRST_WINTER_TICK})`,
      pass: wintersPassed === wintersTotal,
      detail: `${wintersPassed}/${wintersTotal} winters passed`,
    },
    {
      name: 'No winter starvation',
      applicable: winterGatesApplicable,
      skipReason: HAS_SCHEDULED_WINTER
        ? 'no completed winter in run'
        : `run ended before winter (tick ${TOTAL_TICKS} < ${FIRST_WINTER_TICK})`,
      pass: completeWinterRecords.every((r) => r.minFood > 0),
      detail: `min winter food across years: ${completeWinterRecords.length ? Math.min(...completeWinterRecords.map((r) => r.minFood)) : 'n/a'}`,
    },
    {
      name: 'Diplomacy exercised',
      applicable: HAS_SCHEDULED_DIPLOMACY,
      skipReason: `no diplomacy injections scheduled (run < ${INJECTION_SCHEDULE.find((e) => e.injection.type === 'diplomacy')?.tick ?? 'n/a'} ticks)`,
      pass: diplomacyResolved >= 1,
      detail: `responses=${diplomacyResolved}`,
    },
    {
      name: 'Raids exercised',
      applicable: HAS_SCHEDULED_RAIDS,
      skipReason: `no raid injections scheduled (run < ${INJECTION_SCHEDULE.find((e) => e.injection.type === 'raid')?.tick ?? 'n/a'} ticks)`,
      pass: raidsResolved >= 1,
      detail: `responses=${raidsResolved}`,
    },
    {
      name: 'Main-thread sync p95 < 16ms (playability)',
      applicable: true,
      pass: SIM_USE_WORKER ? syncOverall.p95 < 16 : overall.p95 < 16,
      detail: SIM_USE_WORKER
        ? `sync p95=${syncOverall.p95.toFixed(2)}ms (worker wait p95=${workerOverall.p95.toFixed(2)}ms informational)`
        : `p95=${overall.p95.toFixed(2)}ms`,
    },
    {
      name: `All building types built (${buildingTypesExpected})`,
      applicable: IS_FULL_BALANCE_RUN,
      skipReason: `smoke run — ${SIM_YEARS}-year test needs ${FULL_BALANCE_TICKS} ticks (have ${TOTAL_TICKS})`,
      pass: allBuildingTypesBuilt,
      detail: `${buildingTypesCompleted}/${buildingTypesExpected} types`
        + (missingBuildingTypes.length ? ` — missing: ${missingBuildingTypes.join(', ')}` : ''),
    },
  ];

  const applicableGates = gates.filter((g) => g.applicable);
  const skippedGates = gates.filter((g) => !g.applicable);
  const failedGateList: BalanceGate[] = [];

  for (const g of gates) {
    if (!g.applicable) {
      logger.log(`SKIP — ${g.name} (${g.skipReason})`);
      continue;
    }
    logger.log(`${g.pass ? 'PASS' : 'FAIL'} — ${g.name} (${g.detail})`);
    if (!g.pass) failedGateList.push(g);
  }

  const ecoInRange = state.ecosystemHealth >= profileCfg.ecoMin && state.ecosystemHealth <= profileCfg.ecoMax;
  logger.log(
    `INFO — Population target ${popGateMin}–${popGateMax} (${formatPopulationBrief(endPop)}, ${popInRange ? 'in range' : 'out of range'}, not a pass gate)`,
  );
  logger.log(
    `INFO — Ecosystem ${profileCfg.ecoMin}–${profileCfg.ecoMax}% (eco=${state.ecosystemHealth}%, ${ecoInRange ? 'in range' : 'out of range'}, not a pass gate)`,
  );

  const failedGates = failedGateList.length;
  const profilePass = failedGates === 0;
  const failedGateSummary = failedGateList.map((g) => `${g.name} (${g.detail})`).join('; ');
  logger.section('VERDICT');
  logger.log(`${profilePass ? 'PASS' : 'FAIL'} — ${SIM_YEARS}-year ${SIM_PROFILE} balance test`);
  logger.log(
    `Gates: ${applicableGates.length} tested, ${skippedGates.length} skipped`
    + (IS_SMOKE_RUN ? ` (smoke run — official test is ${FULL_BALANCE_TICKS} ticks)` : ''),
  );
  if (!profilePass) {
    logger.log(`Failed ${failedGates}/${applicableGates.length} applicable gates:`);
    for (const g of failedGateList) {
      logger.log(`  • ${g.name} — ${g.detail}`);
    }
  }
  if (skippedGates.length > 0 && IS_SMOKE_RUN) {
    logger.log(`Skipped ${skippedGates.length} gates — run the full ${SIM_YEARS}-year test (unset SIM_MAX_TICKS).`);
  }
  const verdictLabel = IS_SMOKE_RUN
    ? `smoke run (${SIM_PROFILE}, ${TOTAL_TICKS} ticks — not the ${SIM_YEARS}-year test)`
    : `${SIM_YEARS}-year ${SIM_PROFILE} balance test`;
  logger.live(
    profilePass
      ? `\n✓ VERDICT: PASS — ${verdictLabel} (${applicableGates.length} gates tested)`
      : `\n✗ VERDICT: FAIL — ${verdictLabel} (${failedGates}/${applicableGates.length} gate failure${failedGates === 1 ? '' : 's'}: ${failedGateSummary})`,
  );

  const missingCategories = covReport(coverage, EXPECTED_OPTIONS).filter((l) => l.includes('missing:'));
  if (missingCategories.length > 0) {
    logger.log(`\nUntested options (${missingCategories.length} categories with gaps):`);
    for (const m of missingCategories) logger.log(`  ${m}`);
  }

  if (SIM_VERBOSE || actionLog.length < 200) {
    logger.section('Player action log');
    for (const a of actionLog) {
      logger.log(
        `tick ${a.tick} [${a.category}] ${a.action} ${a.ok ? 'OK' : 'SKIP'}${a.detail ? ` — ${a.detail}` : ''}`,
      );
    }
  } else {
    logger.log(`\n(Player action log: ${actionLog.length} entries — set SIM_VERBOSE=1 to print all)`);
  }

  const strictCoverageFail = SIM_STRICT_COVERAGE && missingCategories.length > 0;
  if (strictCoverageFail) {
    logger.log(`\nFAIL — strict coverage (${missingCategories.length} categories with gaps)`);
    for (const m of missingCategories) logger.log(`  • ${m}`);
  }

  const mainLogPath = logger.flush(SIM_PROFILE);
  logger.live(`Chronicle export: ${chroniclePath}${mainLogPath ? ` | Main log: ${mainLogPath}` : ''}`);

  disposeSimWorkerHost(workerHost);

  // FIX: process.exit() kills the process immediately, preventing the event loop
  // from flushing stdio and running finally-blocks. Setting exitCode lets the
  // process end gracefully while still communicating the result to the shell.
  const exitCode = (failedGates > 0 || strictCoverageFail) ? 1 : 0;
  process.exitCode = exitCode;
}

runSimulation().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});