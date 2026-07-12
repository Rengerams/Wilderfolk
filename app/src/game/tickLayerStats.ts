import type { PopulationCounts } from './entityCounts';
import { computePopulationCounts } from './entityCounts';
import type { PopulationHistoryEntry, WorldState } from './gameTypes';

/** How often we sample world metrics into `populationHistory`. */
export const STATS_SAMPLE_INTERVAL_TICKS = 10;

/** Rolling buffer length — 300 × 10 ticks ≈ 3,000 ticks (~125 game days at 24 ticks/day). */
export const POPULATION_HISTORY_MAX = 300;

/**
 * Stats layer: append a compact world snapshot for charts / roadmap UI.
 * Mutates `state.populationHistory` in place (same contract as other tick layers).
 *
 * Call once per tick from `gameTick` **after** final population counts / eco metrics.
 * Optional `counts` avoids a second full entity scan when the caller already computed them.
 */
export function tickLayerStats(
  state: WorldState,
  counts: PopulationCounts = computePopulationCounts(state.entities),
): void {
  if (state.tick % STATS_SAMPLE_INTERVAL_TICKS !== 0) return;

  if (!state.populationHistory) {
    state.populationHistory = [];
  }

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
