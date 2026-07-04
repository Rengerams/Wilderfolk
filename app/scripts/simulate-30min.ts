/**
 * Headless 30-minute session (~1800 ticks @ 1 tick/s) with village growth + family stats.
 * Run: npx tsx scripts/simulate-30min.ts
 */
import {
  initGame,
  gameTick,
  startBuilding,
  recruitSettler,
  EntityType,
  BuildingType,
  canPlaceBuilding,
  snapToGrid,
} from '../src/game/gameEngine';
import type { WorldState } from '../src/game/gameTypes';
import { isPlayerHuman } from '../src/game/groupEvents';

const TICKS_PER_REAL_MINUTE = 60;
const SIM_MINUTES = Number(process.env.SIM_MINUTES ?? 1200);
const TOTAL_TICKS = TICKS_PER_REAL_MINUTE * SIM_MINUTES;
const PERF_SAMPLE_EVERY = Number(process.env.PERF_SAMPLE_EVERY ?? 120);

type PerfSample = {
  tick: number;
  ms: number;
  alive: number;
  humans: number;
  grass: number;
};

function percentile(sorted: number[], p: number): number {
  if (sorted.length === 0) return 0;
  const idx = Math.min(sorted.length - 1, Math.floor((sorted.length - 1) * p));
  return sorted[idx];
}

function summarizeTickMs(samples: number[]): { avg: number; p50: number; p95: number; max: number } {
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

function findBuildSpot(state: WorldState, type: BuildingType, cx: number, cy: number): [number, number] | null {
  for (let ring = 0; ring < 12; ring++) {
    const radius = 80 + ring * 40;
    const steps = 8 + ring * 2;
    for (let i = 0; i < steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      const x = snapToGrid(cx + Math.cos(angle) * radius);
      const y = snapToGrid(cy + Math.sin(angle) * radius);
      if (canPlaceBuilding(state, type, x, y)) return [x, y];
    }
  }
  return null;
}

function tryPlaceNear(state: WorldState, type: BuildingType, cx: number, cy: number): WorldState {
  const spot = findBuildSpot(state, type, cx, cy);
  if (!spot) return state;
  return startBuilding(state, type, spot[0], spot[1]);
}

type ScheduledAction = { at: number; fn: (s: WorldState) => WorldState; label: string };

function buildScenario(cx: number, cy: number): ScheduledAction[] {
  const place = (at: number, label: string, type: BuildingType, ox = 0, oy = 0) => ({
    at,
    label,
    fn: (s: WorldState) => tryPlaceNear(s, type, cx + ox, cy + oy),
  });
  const recruit = (at: number) => ({
    at,
    label: 'Recruit settler',
    fn: (s: WorldState) => recruitSettler(s),
  });

  return [
    place(1, 'House A', BuildingType.House),
    place(24, 'Farm', BuildingType.Farm, 60, 0),
    place(48, 'House B', BuildingType.House, -80, 40),
    place(72, 'Lumber mill', BuildingType.LumberMill, 120, -40),
    place(96, 'Well', BuildingType.Well, -30, -60),
    recruit(120),
    place(150, 'Quarry', BuildingType.Quarry, -140, -30),
    recruit(180),
    place(210, 'House C', BuildingType.House, 20, 100),
    recruit(300),
    place(360, 'Church', BuildingType.Church, -60, 80),
    recruit(420),
    place(480, 'House D', BuildingType.House, 100, 60),
    place(540, 'Silo', BuildingType.Silo, 40, -100),
    recruit(600),
    place(720, 'Barn', BuildingType.Barn, 80, 40),
    recruit(780),
    place(900, 'House E', BuildingType.House, -100, -80),
    recruit(1020),
    place(1080, 'Workshop', BuildingType.Workshop, 140, 20),
    recruit(1200),
    place(1320, 'House F', BuildingType.House, 0, -120),
    recruit(1440),
    recruit(1560),
    recruit(1680),
  ];
}

function countMarriedPairs(humans: ReturnType<typeof initGame>['entities']): number {
  const seen = new Set<number>();
  let pairs = 0;
  for (const h of humans) {
    if (!h.partnerId || seen.has(h.id)) continue;
    const partner = humans.find((p) => p.id === h.partnerId);
    if (partner?.alive) {
      seen.add(h.id);
      seen.add(partner.id);
      pairs++;
    }
  }
  return pairs;
}

function runSimulation(): void {
  let state = initGame({ villageName: 'Simville' });
  state.resources.wood = 4000;
  state.resources.stone = 2000;
  state.resources.food = 1200;
  state.resources.gold = 400;

  const cx = state.width / 2;
  const cy = state.height / 2;
  const actions = buildScenario(cx, cy);
  const milestones: string[] = [];
  const perfSamples: PerfSample[] = [];
  const allTickMs: number[] = [];
  const start = performance.now();

  for (let t = 1; t <= TOTAL_TICKS; t++) {
    for (const action of actions) {
      if (action.at === t) {
        const before = state.humanPopulation;
        state = action.fn(state);
        const after = state.humanPopulation;
        const recruited = after > before;
        milestones.push(`tick ${t}: ${action.label}${recruited ? ' (+1 settler)' : ''}`);
      }
    }
    const tickStart = performance.now();
    state = gameTick(state);
    const tickMs = performance.now() - tickStart;
    allTickMs.push(tickMs);

    let alive = 0;
    for (const e of state.entities) if (e.alive) alive++;

    if (t % PERF_SAMPLE_EVERY === 0) {
      perfSamples.push({
        tick: t,
        ms: tickMs,
        alive,
        humans: state.humanPopulation,
        grass: state.wildlifeCounts.grass,
      });
      const day = t / 24;
      milestones.push(
        `— day ${day.toFixed(0)}: camp=${state.humanPopulation}, entities=${alive}, grass=${state.wildlifeCounts.grass}, food=${state.resources.food}, year=${state.year}`,
      );
    }
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(1);
  const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  const children = humans.filter((h) => h.isJuvenile);
  const adults = humans.filter((h) => !h.isJuvenile);
  const singles = adults.filter((h) => h.relationshipStatus === 'single' && !h.pregnant);
  const expecting = adults.filter((h) => h.relationshipStatus === 'expecting' || h.pregnant);
  const marriedPairs = countMarriedPairs(humans);
  const bastardChildren = humans.filter((h) => h.isBastard).length;
  const wildkin = state.entities.filter((e) => e.alive && e.type === EntityType.Wildkin).length;

  const log = state.eventLog;
  const marriages = log.filter((e) => e.type === 'marriage').length;
  const births = log.filter((e) => e.type === 'birth').length;
  const wildkinBirths = log.filter((e) => e.type === 'birth' && e.message.includes('Wildkin')).length;
  const humanBirths = births - wildkinBirths;
  const bastardBirths = log.filter((e) => e.type === 'birth' && e.message.includes('bastard')).length;
  const scandals = log.filter((e) => e.type === 'scandal').length;
  const playerDeaths = log.filter((e) => e.type === 'death').length;

  const completedBuildings = state.buildings.filter((b) => b.completed && b.faction !== 'rival');
  const houses = completedBuildings.filter((b) => b.type === BuildingType.House || b.type === BuildingType.Mansion);

  console.log('\n=== Wilderfolk 30-minute simulation ===');
  console.log(`Ticks: ${TOTAL_TICKS} (~${SIM_MINUTES} min @ 1×) | Wall time: ${elapsed}s`);
  console.log(`Game calendar: Year ${state.year}, Day ${state.dayInYear} (~${Math.floor(state.tick / 24)} total days)`);

  console.log('\n--- Camp population ---');
  console.log(`Total in camp: ${humans.length}`);
  console.log(`  Adults: ${adults.length}`);
  console.log(`  Children (living): ${children.length}`);
  console.log(`  Married couples: ${marriedPairs}`);
  console.log(`  Singles (adults): ${singles.length}`);
  console.log(`  Pregnant / expecting: ${expecting.length}`);
  console.log(`  Living bastards: ${bastardChildren}`);
  console.log(`  Wildkin in valley: ${wildkin}`);

  console.log('\n--- Life events (event log) ---');
  console.log(`Marriages: ${marriages}`);
  console.log(`Births (all): ${births}`);
  console.log(`  Human baby births: ${humanBirths}`);
  console.log(`  Wildkin births: ${wildkinBirths}`);
  console.log(`  Bastard births: ${bastardBirths}`);
  console.log(`Scandals: ${scandals}`);
  console.log(`Death log entries: ${playerDeaths}`);

  console.log('\n--- Village ---');
  console.log(`Completed buildings: ${completedBuildings.length} (${houses.length} houses)`);
  console.log(`Resources: food=${state.resources.food}, wood=${state.resources.wood}, stone=${state.resources.stone}, gold=${state.resources.gold}`);
  console.log(`Reputation: ${state.villageReputation} | Ecosystem: ${state.ecosystemHealth}%`);
  console.log(
    `Wildlife: ${state.wildlifeCounts.rabbits} rabbits, ${state.wildlifeCounts.deer} deer, ${state.wildlifeCounts.wolves} wolves, ${state.wildlifeCounts.grass} grass`,
  );

  const aliveEnd = state.entities.filter((e) => e.alive).length;
  const overall = summarizeTickMs(allTickMs);
  console.log('\n--- Performance ---');
  console.log(`Alive entities (end): ${aliveEnd}`);
  console.log(
    `Tick cost (all ${TOTAL_TICKS} ticks): avg=${overall.avg.toFixed(2)}ms p50=${overall.p50.toFixed(2)}ms p95=${overall.p95.toFixed(2)}ms max=${overall.max.toFixed(2)}ms`,
  );
  console.log(`Budget @ 60fps sim: ${(1000 / 60).toFixed(1)}ms/tick | @ 10× speed: ${(1000 / 600).toFixed(2)}ms/tick`);

  if (perfSamples.length > 0) {
    console.log(`\n--- Perf samples (every ${PERF_SAMPLE_EVERY} ticks) ---`);
    for (const s of perfSamples) {
      console.log(
        `tick ${s.tick}: ${s.ms.toFixed(2)}ms | humans=${s.humans} alive=${s.alive} grass=${s.grass}`,
      );
    }
  }

  console.log('\n--- Milestones (every 5 game-days) ---');
  for (const m of milestones) console.log(m);
}

runSimulation();