import type { WorldState, Building } from './gameTypes';
import { BuildingType } from './gameTypes';
import { hasTech } from './simHelpers';
import type { PopulationCounts } from './entityCounts';

const INDUSTRIAL_BUILDING_TYPES: BuildingType[] = [
  BuildingType.Blacksmith,
  BuildingType.Mill,
  BuildingType.Workshop,
  BuildingType.Mine,
  BuildingType.Quarry,
  BuildingType.LumberMill,
];

const IDEAL_WILDLIFE = 80;

/**
 * Update pollution, ecosystem health, and biodiversity indexes.
 *
 * Pollution is driven by completed industrial buildings and human population.
 * Ecosystem health falls with buildings and pollution, rises with wildlife.
 * Biodiversity is the Shannon diversity index over rabbits/deer/wolves/foxes.
 */
export function tickEcosystemMetrics(
  state: WorldState,
  counts: PopulationCounts,
  buildings: Building[],
): void {
  const industrialCount = buildings.filter(
    (b) => b.completed && INDUSTRIAL_BUILDING_TYPES.includes(b.type),
  ).length;
  const pollutionMult = hasTech(state, 'forestry_2') ? 0.5 : 1;
  state.pollutionLevel = Math.min(
    100,
    Math.floor(industrialCount * 4 * pollutionMult + counts.humans / 3),
  );

  const totalWildlife = counts.rabbits + counts.deer + counts.wolves + counts.foxes;
  const wildlifeRatio = Math.min(1, totalWildlife / IDEAL_WILDLIFE);
  const playerCompletedBuildings = buildings.filter(
    (b) => b.completed && b.faction !== 'rival',
  ).length;
  const buildingImpact = playerCompletedBuildings * 2;
  const pollutionPenalty = Math.floor(state.pollutionLevel / 2);
  state.ecosystemHealth = Math.max(
    0,
    Math.min(100, 100 - buildingImpact - pollutionPenalty + (wildlifeRatio * 30 - 20)),
  );

  const species = [counts.rabbits, counts.deer, counts.wolves, counts.foxes].filter((c) => c > 0);
  const total = species.reduce((a, b) => a + b, 0);
  if (total > 0) {
    state.biodiversityIndex = species.reduce((sum, count) => {
      const p = count / total;
      return sum - p * Math.log(p);
    }, 0);
  } else {
    state.biodiversityIndex = 0;
  }
}

/**
 * Production penalty from pollution.
 *
 * At 0% pollution: multiplier = 1.
 * At 100% pollution: multiplier = 0.5.
 */
export function getPollutionProductionMultiplier(state: WorldState): number {
  return Math.max(0.5, 1 - state.pollutionLevel / 200);
}
