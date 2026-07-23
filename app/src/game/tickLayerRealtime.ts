/**
 * Realtime layer — every tick.
 *
 * Human + wildlife AI, spatial grid sync, scent grid, stats sampling,
 * particle / floating-text animation, and hunt-visual pruning.
 */
import { pruneHuntVisuals } from './huntvisuals';
import type {
  WorldState, DeathParticle, FloatingText, PopulationHistoryEntry,
} from './gameTypes';
import { EntityType } from './gameTypes';
import {
  USE_SPATIAL_GRID,
  syncMobileSimGrid,
  syncGrassRenderGrid,
} from './spatialGrid';
import { USE_SCENT_GRID, ensureScentGrid, tickScentGrid } from './scentGrid';
import { computePopulationCounts } from './entityCounts';
import { tickHumans, tickWildlife } from './lifeSimulation';
import type { TickContext } from './lifeSimulation';

/** How often we sample world metrics into populationHistory. */
export const STATS_SAMPLE_INTERVAL_TICKS = 10;

/** Rolling buffer length — 300 × 10 ticks ≈ 3,000 ticks (~125 game days at 24 ticks/day). */
export const POPULATION_HISTORY_MAX = 300;

export function tickLayerRealtime(state: WorldState, ctx: TickContext): void {
  const { width, height, byType, predators } = ctx;
  const aliveEntities = state.entities.filter((e) => e.alive);

  // Spatial grid sync (must run before AI uses the grids)
  const mobileGrid = USE_SPATIAL_GRID
    ? syncMobileSimGrid(state.mobileGrid, width, height, aliveEntities)
    : undefined;
  state.mobileGrid = mobileGrid;
  ctx.mobileGrid = mobileGrid;

  const grassGrid = USE_SPATIAL_GRID
    ? syncGrassRenderGrid(state.grassGrid, width, height, byType[EntityType.Grass] ?? [])
    : undefined;
  state.grassGrid = grassGrid ?? undefined;
  ctx.grassGrid = grassGrid;

  // Scent grid
  const scentGrid = USE_SCENT_GRID ? ensureScentGrid(state) : undefined;
  if (scentGrid) tickScentGrid(state, predators);
  ctx.scentGrid = scentGrid;

  // Active AI
  tickHumans(state, ctx);
  tickWildlife(state, ctx);

  // Stats sampling (every 10 ticks)
  if (state.tick % STATS_SAMPLE_INTERVAL_TICKS === 0) {
    if (!state.populationHistory) {
      state.populationHistory = [];
    }

    const counts = computePopulationCounts(state.entities.filter((e) => e.alive));
    let completedBuildings = 0;
    for (const b of state.buildings) {
      if (b.completed && b.faction !== 'rival') completedBuildings++;
    }

    const snapshot: PopulationHistoryEntry = {
      tick: state.tick,
      year: state.year,
      day: state.dayInYear,
      season: state.season,
      humans: counts.humans,
      werewolves: counts.werewolves,
      wildkin: counts.wildkin,
      rabbits: counts.rabbits,
      deer: counts.deer,
      wolves: counts.wolves,
      foxes: counts.foxes,
      grass: counts.grass,
      buildings: completedBuildings,
      gold: state.resources.gold,
      food: state.resources.food,
      wood: state.resources.wood,
      stone: state.resources.stone,
      pollution: state.pollutionLevel,
      ecosystemHealth: state.ecosystemHealth,
      biodiversity: state.biodiversityIndex,
    };

    state.populationHistory.push(snapshot);
    while (state.populationHistory.length > POPULATION_HISTORY_MAX) {
      state.populationHistory.shift();
    }
  }

  // Particle animation
  const newParticles: DeathParticle[] = [];
  for (const p of state.deathParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02;
    p.life--;
    if (p.life > 0) newParticles.push(p);
  }
  state.deathParticles = newParticles;

  // Floating-text animation
  const newFloatingTexts: FloatingText[] = [];
  for (const ft of state.floatingTexts) {
    ft.y -= 0.7;
    ft.life--;
    ft.scale = ft.life < 6 ? ft.life / 6 : 1;
    if (ft.life > 0) newFloatingTexts.push(ft);
  }
  state.floatingTexts = newFloatingTexts;

  // Hunt visuals pruning
  pruneHuntVisuals(state);
}
