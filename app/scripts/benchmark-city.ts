/**
 * City-scale sim benchmark — dual-layer spatial grid @ ~1250 alive, p95 < 20ms.
 * Run: npm run benchmark:city
 *
 * PATCHED VERSION — fixes applied:
 * 1. Removed duplicate maintainCityBenchmarkState() at loop start
 * 2. Gate now uses steady.p95 (all ticks) instead of sampled p95
 * 3. simFocus recalculated each tick after gameTick
 * 4. Alive count sampled immediately after gameTick, before maintenance
 * 5. Spatial metrics enabled after warmup to avoid polluted data
 * 6. Safe resource mutation with fallback
 * 7. Robust env parsing for BENCHMARK_GATE
 * 8. process.exitCode instead of hard process.exit()
 * 9. Better error logging in catch block
 * 10. Documented nearest-rank percentile method
 */
import { gameTick, initGame } from '../src/game/gameEngine';
import { MapSize } from '../src/game/gameTypes';
import { getSimFocus } from './simFocus';
import {
  CITY_BENCH_MIN_ALIVE,
  countAlive,
  DEFAULT_CITY_TARGETS,
  maintainCityBenchmarkState,
  refreshCityBenchmarkResources,
  seedCityScaleProfile,
} from './simCityProfile';
import { preloadDialogueBank } from '../src/game/dialogueTrees';
import { getSpatialQueryReport } from '../src/game/spatialQueryMetrics';
import { enableSpatialQueryMetrics, printSpatialQueryMetricsSection } from './spatialQueryReport';

const STEADY_TICKS = Number(process.env.CITY_BENCH_TICKS ?? 600);
const WARMUP_TICKS = Number(process.env.CITY_BENCH_WARMUP ?? 60);
const P95_GATE_MS = Number(process.env.CITY_P95_GATE_MS ?? 20);
const GATE = process.env.BENCHMARK_GATE === '1' || process.env.BENCHMARK_GATE === undefined;
const SAMPLE_EVERY = Number(process.env.PERF_SAMPLE_EVERY ?? 120);

/**
 * Nearest-rank percentile (no interpolation).
 * NOTE: This differs from Excel/Numpy linear interpolation.
 * For small samples, p95 may deviate from conventional definitions.
 */
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

async function run(): Promise<void> {
  await preloadDialogueBank();

  const metricsOn = process.env.SPATIAL_QUERY_METRICS !== '0';

  let state = initGame({ villageName: 'Benchburg', size: MapSize.Large });

  // Safe resource initialization — handles both mutable and frozen state objects
  if (state.resources && typeof state.resources === 'object') {
    state.resources.food = 8000;
  }

  seedCityScaleProfile(state, DEFAULT_CITY_TARGETS);

  const aliveStart = countAlive(state);
  const totalTicks = WARMUP_TICKS + STEADY_TICKS;

  const steadyMs: number[] = [];
  const perfSamples: { tick: number; ms: number; alive: number }[] = [];
  const start = performance.now();

  for (let t = 1; t <= totalTicks; t++) {
    if (metricsOn && t === WARMUP_TICKS + 1) enableSpatialQueryMetrics();

    // Refresh resources BEFORE the tick (1-indexed as per original design)
    refreshCityBenchmarkResources(state, t);

    // Recalculate sim focus each tick to avoid stale data
    const simFocus = getSimFocus(state);

    const t0 = performance.now();
    state = gameTick(state, simFocus);
    const ms = performance.now() - t0;

    // Capture alive count immediately after gameTick, before maintenance
    const aliveAfterTick = countAlive(state);

    // Apply maintenance AFTER tick processing and measurement
    maintainCityBenchmarkState(state);

    if (t > WARMUP_TICKS) {
      steadyMs.push(ms);
      if (t % SAMPLE_EVERY === 0) {
        perfSamples.push({ tick: t - WARMUP_TICKS, ms, alive: aliveAfterTick });
      }
    }
  }

  const elapsed = ((performance.now() - start) / 1000).toFixed(2);
  const aliveEnd = countAlive(state);
  const steady = summarizeTickMs(steadyMs);
  const sampleMs = perfSamples.map((s) => s.ms);
  const samplePerf = summarizeTickMs(sampleMs);

  // Gate uses steady.p95 (all ticks) for accurate measurement
  // Requires at least one sample for alive validation, plus start/end gates
  const sampleAliveOk = perfSamples.length > 0 && perfSamples.every((s) => s.alive >= CITY_BENCH_MIN_ALIVE);
  const pass = steady.p95 < P95_GATE_MS
    && aliveStart >= CITY_BENCH_MIN_ALIVE
    && aliveEnd >= CITY_BENCH_MIN_ALIVE
    && sampleAliveOk;

  console.log('\n=== Wilderfolk city benchmark (dual-layer spatial grid) ===');
  console.log(
    `Profile: ${DEFAULT_CITY_TARGETS.playerHumans} player + ${DEFAULT_CITY_TARGETS.rivalHumans} rival + ${DEFAULT_CITY_TARGETS.visitorHumans} visitor humans`,
  );
  console.log(
    `Alive: start=${aliveStart} end=${aliveEnd} (gate >= ${CITY_BENCH_MIN_ALIVE}) | warmup=${WARMUP_TICKS} steady=${STEADY_TICKS} | wall=${elapsed}s`,
  );
  console.log(
    `Steady tick cost: avg=${steady.avg.toFixed(2)}ms p50=${steady.p50.toFixed(2)}ms p95=${steady.p95.toFixed(2)}ms max=${steady.max.toFixed(2)}ms`,
  );
  if (perfSamples.length > 0) {
    console.log(`Sample p95 (every ${SAMPLE_EVERY} ticks): ${samplePerf.p95.toFixed(2)}ms`);
    for (const s of perfSamples) {
      console.log(`  tick ${s.tick}: ${s.ms.toFixed(2)}ms alive=${s.alive}`);
    }
  } else {
    console.log(`Warning: no perf samples collected (STEADY_TICKS=${STEADY_TICKS} < SAMPLE_EVERY=${SAMPLE_EVERY})`);
  }
  console.log(
    `Gate: steady p95 < ${P95_GATE_MS}ms @ >=${CITY_BENCH_MIN_ALIVE} alive -> ${pass ? 'PASS' : 'FAIL'}`,
  );
  if (steady.p95 >= P95_GATE_MS) {
    console.log(`Note: steady-state p95=${steady.p95.toFixed(2)}ms exceeded gate`);
  }

  if (metricsOn) printSpatialQueryMetricsSection();
  if (process.env.SPATIAL_QUERY_JSON === '1') {
    console.log(`__SPATIAL_QUERY_JSON__${JSON.stringify(getSpatialQueryReport())}`);
  }

  if (GATE && !pass) {
    process.exitCode = 1;
  }
}

run().catch((err: unknown) => {
  if (err instanceof Error) {
    console.error(err.stack || err.message);
  } else {
    console.error('Benchmark failed:', JSON.stringify(err));
  }
  process.exitCode = 1;
});