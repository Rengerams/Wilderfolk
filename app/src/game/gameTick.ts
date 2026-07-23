/**
 * gameTick — one simulation step. Orchestrates layers; mutates WorldState in place.
 */
import type {
  WorldState, Entity, Building,
} from './gameTypes';
import {
  BuildingType,
  Season,
  EntityType,
} from './gameTypes';
import { recordYearlyStats, updateLifetimeStats } from './stats';
import { checkVictoryAchievements } from './victory';
import { logEvent } from './eventLog';
import { ensureEntityByIdMap } from './entityIndex';
import { getGrassGrowthMultiplier, getWinterEnergyPenalty } from './grassEcology';
import {
  getCalendarDay, getHourOfDay,
  TICKS_PER_DAY, isNightHour,
  markCalendarDayProcessed,
  getAbsoluteCalendarDay, syncHumanAgeFromCalendar,
  reconcileOrphanedMarriages,
  isResidenceOccupantEntity,
  syncResidenceOccupants,
} from './dayCycle';
import {
  buildEntityByType,
  type SimulationFocus,
} from './simFocus';
import {
  getSeason,
  getReproductionMultiplier,
} from './simHelpers';
import { tickEcosystemMetrics } from './tickEcosystem';
import {
  impulseScreenShake,
  addNotification,
  addBigNews,
} from './simEffects';
import {
  releasePrisoners,
  countWorkingAndIdleSettlers,
} from './workforce';
import { maybeTriggerRenffrOmen, tickRenffrOmen } from './renffrStar';
import { isPlayerHuman } from './groupEvents';
import type { TickContext } from './lifeSimulation';
import { buildHuntTargetByPreyIndex } from './lifeSimulation';
import { tickLayerRealtime } from './tickLayerRealtime';
import { tickLayerSystems, LAYER_SYSTEMS_INTERVAL } from './tickLayerSystems';
import { tickLayerSocial, LAYER_SOCIAL_INTERVAL } from './tickLayerSocial';
import { tickLayerDaily } from './tickLayerDaily';
import { tickBuildingProgress } from './tickBuildingProgress';
import { tickWinterHeating } from './tickLayerDaily';
import {
  USE_SPATIAL_GRID,
  buildRoadAvoidanceIndex,
  computeRoadLayoutStamp,
  assertSpatialGridInvariants,
} from './spatialGrid';
import {
  computePopulationCounts,
  wildlifeCountsFromPopulation,
} from './entityCounts';
import {
  flushSpatialQueryTickToSession,
  isSpatialQueryMetricsEnabled,
  resetSpatialQueryTickMetrics,
  setSpatialQueryGridMode,
} from './spatialQueryMetrics';
import {
  isActiveMoonHowler,
  tickMoonHowlerCycle,
} from './moonHowler';

export function gameTick(state: WorldState, focus?: SimulationFocus): WorldState {
  if (state.paused) return state;
  const { width, height } = state;

  if (isSpatialQueryMetricsEnabled()) {
    resetSpatialQueryTickMetrics();
    setSpatialQueryGridMode(USE_SPATIAL_GRID ? 'grid' : 'naive');
  }

  // 1. Calendar setup
  state.tick++;
  state.dayInYear = getCalendarDay(state.tick);
  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const yearRollover = state.dayInYear === 0 && prevCalendarDay > 0;
  const newYear = yearRollover ? state.year + 1 : state.year;

  if (yearRollover) {
    const yearlyStat = recordYearlyStats(state, state.year);
    state.yearlyStats.push(yearlyStat);
    if (state.yearlyStats.length > 50) state.yearlyStats.shift();
    state.lifetimeStats = updateLifetimeStats(state, state.lifetimeStats);
    state.eventsThisYear = [];
    if (newYear > 0) {
      state.ecoHealthYearsAbove80 = state.ecosystemHealth >= 80
        ? state.ecoHealthYearsAbove80 + 1
        : 0;
    }
    state.year = newYear;
  }

  const season = getSeason(state.dayInYear);
  const grassMult = getGrassGrowthMultiplier(season, state.weather);
  const reproMult = getReproductionMultiplier(season);
  const winterPenalty = getWinterEnergyPenalty(season);

  state.season = season;

  ensureEntityByIdMap(state);
  releasePrisoners(state);

  const newEntities: Entity[] = [];
  const aliveEntities = state.entities.filter((e) => e.alive);

  for (const entity of aliveEntities) {
    if (entity.moonHowlerCursed && entity.type === EntityType.Human) {
      syncHumanAgeFromCalendar(entity, state);
    }
  }

  let byType = buildEntityByType(aliveEntities);

  const hourOfDay = getHourOfDay(state.tick);
  const colonyDay = getAbsoluteCalendarDay(state.tick);

  const entityById = ensureEntityByIdMap(state);
  const moonResult = tickMoonHowlerCycle(state, aliveEntities, state.buildings, colonyDay, hourOfDay, entityById);
  if (moonResult.changed) {
    byType = moonResult.byType;
  }

  // 2. Advance construction, repair, and decay.
  const updatedBuildings = tickBuildingProgress(state);

  const roadBuildings = updatedBuildings.filter((b) => b.type === BuildingType.Road && b.completed);
  const playerHumans = byType[EntityType.Human].filter(isPlayerHuman);
  const humanCount = playerHumans.length;
  const isWinter = season === Season.Winter;

  if (maybeTriggerRenffrOmen(state, state.entities, isNightHour(hourOfDay))) {
    logEvent(state, 'event', 'A star scratched "Renffr" across the night sky. The letters fell out of alignment.', 'Renffr');
  }
  state.renffrOmen = tickRenffrOmen(state.renffrOmen);

  // 3. Winter heating — compute canHeat before context
  const canHeat = tickWinterHeating(state, humanCount, isWinter);

  const buildingById = new Map<number, Building>();
  for (const b of updatedBuildings) buildingById.set(b.id, b);

  const predators = [
    ...byType[EntityType.Wolf],
    ...byType[EntityType.Fox],
    ...byType[EntityType.Human].filter((h) => isPlayerHuman(h) && h.alive && !h.isJuvenile),
    ...byType[EntityType.Human].filter((h) => h.faction === 'rival' && h.alive),
    ...byType[EntityType.Werewolf].filter((e) => e.alive),
  ];

  const roadStamp = computeRoadLayoutStamp(roadBuildings);
  if (
    !state.roadAvoidance
    || state.roadAvoidanceStamp !== roadStamp
    || typeof state.roadAvoidance.isNearRoad !== 'function'
    || !state.roadAvoidance.matchesLayout(width, height)
  ) {
    state.roadAvoidance = buildRoadAvoidanceIndex(width, height, roadBuildings);
    state.roadAvoidanceStamp = roadStamp;
  }

  // 4. Build TickContext
  const ctx: TickContext = {
    width, height, hourOfDay, season, grassMult, reproMult, winterPenalty, canHeat,
    byType, newEntities, updatedBuildings, roadBuildings,
    playerHumans: byType[EntityType.Human].filter(isPlayerHuman),
    entityById,
    buildingById,
    predators,
    grassGrid: undefined,
    mobileGrid: undefined,
    roadAvoidance: state.roadAvoidance,
    huntTargetByPreyId: buildHuntTargetByPreyIndex(byType),
    scentGrid: undefined,
    focus,
    wildlifeSpawnParent: new Map(),
    hasWell: updatedBuildings.some((b) => b.type === BuildingType.Well && b.completed),
    hasHospital: updatedBuildings.some((b) => b.type === BuildingType.Hospital && b.completed),
  };

  if (aliveEntities.some(isActiveMoonHowler)) {
    syncResidenceOccupants(
      aliveEntities.filter(isResidenceOccupantEntity),
      updatedBuildings,
    );
  }

  // 5. Call layers in order
  tickLayerRealtime(state, ctx);

  if (state.tick % LAYER_SYSTEMS_INTERVAL === 0) {
    tickLayerSystems(state, ctx);
  }

  if (state.tick % LAYER_SOCIAL_INTERVAL === 0) {
    tickLayerSocial(state, ctx);
  }

  // Compute post-layer alive set and counts
  const allAlive: Entity[] = [];
  for (const e of aliveEntities) {
    if (e.alive) allAlive.push(e);
  }
  for (const e of newEntities) {
    if (e.alive) allAlive.push(e);
  }

  assertSpatialGridInvariants(ctx.grassGrid, ctx.mobileGrid, allAlive);

  const counts = computePopulationCounts(allAlive);

  if (state.tick % TICKS_PER_DAY === 0) {
    tickLayerDaily(state, ctx, allAlive, counts);
  }

  // 6. Post-tick
  tickEcosystemMetrics(state, counts, updatedBuildings);

  state.buildings = updatedBuildings;
  state.entities = allAlive;

  const endTickHumans = allAlive.filter(isPlayerHuman);
  const workforceCounts = countWorkingAndIdleSettlers(endTickHumans, updatedBuildings);
  state.workingSettlers = workforceCounts.working;
  state.idleSettlers = workforceCounts.idle;

  const preVictoryState: WorldState = {
    ...state,
    entities: allAlive,
    buildings: updatedBuildings,
    humanPopulation: counts.humans,
    ecoHealthYearsAbove80: state.ecoHealthYearsAbove80,
  };
  const victoryResult = checkVictoryAchievements(preVictoryState);
  if (victoryResult.newlyAchieved) {
    const def = victoryResult.victories.find((v) => v.path === victoryResult.newlyAchieved);
    addBigNews(
      state,
      `🏆 ${def?.label ?? 'Victory'}!`,
      def?.description ?? 'Your settlement has achieved greatness!',
      'positive'
    );
    addNotification(state, 'Victory Achieved!', `${def?.label ?? 'Victory'} — your legacy is secured!`, 'success');
    impulseScreenShake(state, 6);
    logEvent(state, 'season', `Victory: ${def?.label ?? victoryResult.newlyAchieved}`);
  }

  reconcileOrphanedMarriages(allAlive);
  state.entityByType = buildEntityByType(state.entities);
  if (USE_SPATIAL_GRID) state.mobileGrid = ctx.mobileGrid;
  state.buildings = updatedBuildings;

  state.season = season;
  state.humanPopulation = counts.humans;
  state.wildlifeCounts = wildlifeCountsFromPopulation(counts);
  state.victories = victoryResult.victories;
  state.victoryAchieved = victoryResult.victoryAchieved;
  markCalendarDayProcessed(state);
  if (isSpatialQueryMetricsEnabled()) flushSpatialQueryTickToSession();

  return state;
}
