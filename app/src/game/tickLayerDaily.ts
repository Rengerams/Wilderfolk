/**
 * Daily layer — every 24 ticks.
 *
 * Consolidates static bookkeeping, building production, frontier systems
 * (festivals, immigration, raids, rivals), and daily-gated world events.
 */
import type { WorldState, Entity, Building, Challenge, Season } from './gameTypes';
import {
  BuildingType,
  BUILDING_JOB_TYPES,
  EntityType,
  getWorkshopRecipe,
} from './gameTypes';
import {
  buildingUsesAdjacency,
  ensureAdjacencyIndex,
  getAdjacencyMultiplierFromIndex,
} from './adjacencyIndex';
import { indexEntity } from './entityIndex';
import type { PopulationCounts } from './entityCounts';
import {
  addResource,
  canAffordWorkshopRecipe,
  consumeWorkshopRecipeInputs,
  applyFoodSpoilage,
} from './economy';
import { logEvent } from './eventLog';
import { getForgeQuarryMultiplier, tickVillageForge } from './forge';
import { getLumberMillTreeMultiplier } from './treeProximity';
import {
  isProductionTick,
  PRODUCTION_INTERVAL,
  TICKS_PER_DAY,
  isNewCalendarDayTick,
  getCalendarDay,
  FESTIVAL_CHECK_TICKS,
  IMMIGRATION_CHECK_TICKS,
  getResidenceCapacity,
  assignMissingResidences,
} from './dayCycle';
import type { TickContext } from './lifeSimulation';
import { getMultiplier, addReputation } from './simHelpers';
import { getPollutionProductionMultiplier } from './tickEcosystem';
import { addFloatingText, addBigNews, addNotification, impulseScreenShake } from './simEffects';
import { getTerrainEfficiencyMultiplier, findHumanSpawnNear } from './terrainSystems';
import {
  gainSkill,
  getJobForBuilding,
  rewardProductionSkills,
  decayIdleSkills,
  getWorkerSkillMultiplier,
} from './skills';
import { getSmithBonus } from './workforce';
import { isPlayerHuman } from './groupEvents';
import {
  rollYearlyWorldEvent,
  tryFirstWeekVisitor,
  tryMidYearVisitorEvent,
} from './groupEvents';
import {
  tickElectionGossip,
  tickElectionCeremony,
  tickElectionBuildup,
  tickLeaderVacancy,
  tryStartDecennialElectionCeremony,
  tryStartVacancyElectionCeremony,
} from './villageLeadership';
import { trackYearEvent } from './stats';
import {
  getTownHallGovernanceEfficiency,
  tickTownHallCivic,
  getTownHallFestivalCooldownTicks,
  getTownHallImmigrationMultiplier,
} from './townHall';
import {
  tickPendingOutgoingRaidEvents,
  tickPendingRaidEvents,
} from './frontierCombat';
import { pruneFactionWanderStates } from './factionWander';
import { tickRivalSettlements, tickVisitorGroups } from './groupEvents';
import { createImmigrantSettler, replenishDepletedWildlife } from './worldGen';
import { addHuntVisual } from './huntvisuals';

/** Daily winter heating — keep settlers warm or flag that we cannot. */
export function tickWinterHeating(
  state: WorldState,
  humanCount: number,
  isWinter: boolean,
): boolean {
  let canHeat = true;
  if (isWinter && state.tick > 0 && state.tick % TICKS_PER_DAY === 0 && humanCount > 0) {
    const woodNeeded = Math.ceil(humanCount / 5);
    if (state.resources.wood >= woodNeeded) {
      state.resources.wood -= woodNeeded;
    } else {
      canHeat = false;
    }
  }
  return canHeat;
}

// ==================== STATIC / DAILY BOOKKEEPING ====================

function tickStaticDaily(state: WorldState, season: Season): void {
  applyFoodSpoilage(state, season);
  tickElectionGossip(state);
}

// ==================== BUILDING PRODUCTION ====================

function tickBuildingProduction(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
): void {
  const { updatedBuildings, entityById, byType, roadBuildings } = ctx;

  const hasMill = updatedBuildings.some(
    (b) => b.type === BuildingType.Mill && b.completed,
  );
  const millBonus = hasMill ? 1.25 : 1.0;
  const globalEff = getMultiplier(state, 'global_efficiency')
    * getTownHallGovernanceEfficiency(state, updatedBuildings);
  const festivalMult = state.festival?.active ? 1.5 : 1;
  const playerWorkers = allAlive.filter(isPlayerHuman);
  const workersByBuildingId = new Map<number, number>();
  for (const h of playerWorkers) {
    if (!h.alive || h.faction) continue;
    const siteId = h.homeBuildingId;
    if (siteId == null) continue;
    workersByBuildingId.set(siteId, (workersByBuildingId.get(siteId) ?? 0) + 1);
  }
  const adjacencyIndex = ensureAdjacencyIndex(state);
  const smithBonus = getSmithBonus(updatedBuildings, playerWorkers);

  for (const building of updatedBuildings) {
    const levelMult = building.level || 1;
    const terrainMult = getTerrainEfficiencyMultiplier(state, building);
    const adjacencyMult = buildingUsesAdjacency(building)
      ? getAdjacencyMultiplierFromIndex(adjacencyIndex, building)
      : 1;
    const skillMult = getWorkerSkillMultiplier(state, building, entityById);
    const totalMult = levelMult * terrainMult * adjacencyMult * festivalMult * skillMult;
    const productionJob = getJobForBuilding(building.type);

    const workers = BUILDING_JOB_TYPES[building.type]
      ? (workersByBuildingId.get(building.id) ?? 0)
      : 0;
    const staffed = !BUILDING_JOB_TYPES[building.type] || workers > 0;

    if (building.completed && staffed && building.type === BuildingType.Farm && isProductionTick(state.tick, PRODUCTION_INTERVAL.farm)) {
      const harvestBonus = state.bountifulHarvest ? 2 : 1;
      const farmMult = getMultiplier(state, 'farm_yield');
      const pollutionMult = getPollutionProductionMultiplier(state);
      const amount = Math.floor(22 * totalMult * harvestBonus * millBonus * farmMult * globalEff * pollutionMult);
      const added = addResource(state, 'food', amount);
      if (added > 0 && productionJob) {
        for (const id of building.occupants) gainSkill(state, id, productionJob, 0.2);
      }
    }

    if (building.completed && staffed && building.type === BuildingType.HuntingSpot && isProductionTick(state.tick, PRODUCTION_INTERVAL.huntingSpot)) {
      const searchRadius = 320;
      const targetPrey = state.entities.find((e) =>
        e.alive
        && (e.type === EntityType.Deer || e.type === EntityType.Rabbit || e.type === EntityType.Wolf)
        && Math.hypot(e.x - building.x, e.y - building.y) < searchRadius,
      );

      if (targetPrey) {
        const isWolf = targetPrey.type === EntityType.Wolf;
        const foughtBack = isWolf && Math.random() < 0.35;
        const success = !foughtBack && Math.random() < 0.85;

        const visual = {
          id: `hunt_${state.tick}_${Math.floor(Math.random() * 1000)}`,
          hunterId: building.id,
          preyType: targetPrey.type,
          fromX: building.x,
          fromY: building.y,
          toX: targetPrey.x,
          toY: targetPrey.y,
          startedAtTick: state.tick,
          startedAtMs: Date.now(),
          success,
          foughtBack,
        };

        addHuntVisual(state, visual);

        if (foughtBack) {
          building.health = Math.max(10, building.health - 12);
          addFloatingText(state, building.x, building.y - 12, 'Wolf fights back! 🐺', '#f87171');
          logEvent(state, 'combat', 'A wild wolf fought back at the Hunting Spot!');
        } else if (success) {
          targetPrey.alive = false;
          targetPrey.energy = 0;

          const huntMult = getMultiplier(state, 'hunt_yield');
          const amount = Math.floor((12 + workers * 6) * totalMult * huntMult * globalEff);

          if (addResource(state, 'food', amount) > 0) {
            rewardProductionSkills(state, building, 0.2, entityById);
            addFloatingText(state, targetPrey.x, targetPrey.y - 12, `+${amount} meat`, '#ef4444', 'brief');
            logEvent(state, 'event', `Hunting Spot successfully harvested a ${targetPrey.type} (+${amount} meat)`);
          }
        } else {
          addFloatingText(state, targetPrey.x, targetPrey.y - 12, 'Missed shot!', '#94a3b8', 'brief');
        }
      } else {
        addFloatingText(state, building.x + building.width / 2, building.y - 12, 'No prey in range!', '#ef4444', 'brief');
      }
    }

    if (building.completed && staffed && building.type === BuildingType.Store && isProductionTick(state.tick, PRODUCTION_INTERVAL.store)) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor(5 * totalMult * goldMult * globalEff);
      if (addResource(state, 'gold', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
    }
    if (building.completed && staffed && building.type === BuildingType.LumberMill && isProductionTick(state.tick, PRODUCTION_INTERVAL.lumber)) {
      const lumberMult = getMultiplier(state, 'lumber_yield');
      const treeMult = getLumberMillTreeMultiplier(building, byType[EntityType.Tree] ?? []);
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * lumberMult * treeMult * globalEff);
      if (addResource(state, 'wood', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.5, vy: -1 - Math.random(), life: 20, maxLife: 20, color: '#8B7355', size: 2 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Quarry && isProductionTick(state.tick, PRODUCTION_INTERVAL.quarry)) {
      const stoneMult = getMultiplier(state, 'quarry_yield') * getForgeQuarryMultiplier(state);
      const amount = Math.floor((8 + workers * 3) * totalMult * smithBonus * stoneMult * globalEff);
      if (addResource(state, 'stone', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.3, vy: -0.8 - Math.random() * 0.5, life: 25, maxLife: 25, color: '#808080', size: 2 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Mine && isProductionTick(state.tick, PRODUCTION_INTERVAL.mine)) {
      const stoneMult = getMultiplier(state, 'stone_production');
      const amount = Math.floor((12 + workers * 4) * totalMult * smithBonus * stoneMult * globalEff);
      if (addResource(state, 'stone', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.4, vy: -1 - Math.random(), life: 30, maxLife: 30, color: '#555555', size: 3 + Math.random() * 2, type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Greenhouse && isProductionTick(state.tick, PRODUCTION_INTERVAL.greenhouse)) {
      const harvestBonus = state.bountifulHarvest ? 2 : 1;
      const farmMult = getMultiplier(state, 'farm_yield');
      const pollutionMult = getPollutionProductionMultiplier(state);
      const amount = Math.floor((18 + workers * 5) * totalMult * harvestBonus * millBonus * farmMult * globalEff * pollutionMult);
      if (addResource(state, 'food', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.3, vy: -0.8 - Math.random() * 0.5, life: 25, maxLife: 25, color: '#90EE90', size: 2 + Math.random(), type: 'smoke' });
    }
    if (building.completed && staffed && building.type === BuildingType.Market && isProductionTick(state.tick, PRODUCTION_INTERVAL.market)) {
      const goldMult = getMultiplier(state, 'gold_production');
      const amount = Math.floor((8 + workers * 3) * totalMult * goldMult * globalEff);
      if (addResource(state, 'gold', amount) > 0) rewardProductionSkills(state, building, 0.2, entityById);
      state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.5, vy: -1.2 - Math.random(), life: 30, maxLife: 30, color: '#ffd700', size: 2 + Math.random() * 2, type: 'star' });
    }
    if (building.completed && building.type === BuildingType.Workshop && isProductionTick(state.tick, PRODUCTION_INTERVAL.workshop)) {
      if (workers === 0) {
        addFloatingText(state, building.x + building.width / 2, building.y - 10, 'Needs worker', '#eab308', 'brief');
      } else {
        const goldMult = getMultiplier(state, 'gold_production');
        const recipe = getWorkshopRecipe(building.workshopRecipeId);
        const outputMult = (1 + workers * 0.5) * totalMult * goldMult * globalEff;
        if (canAffordWorkshopRecipe(state, recipe)) {
          const amount = Math.max(1, Math.floor(recipe.baseGold * outputMult));
          const added = addResource(state, 'gold', amount);
          if (added > 0) {
            consumeWorkshopRecipeInputs(state, recipe);
            rewardProductionSkills(state, building, 0.2, entityById);
            addFloatingText(
              state,
              building.x + building.width / 2,
              building.y - 12,
              `+${added} gold · ${recipe.label}`,
              '#ffd700',
              'brief',
            );
            state.deathParticles.push({ x: building.x + Math.random() * building.width, y: building.y + Math.random() * building.height, vx: (Math.random() - 0.5) * 0.6, vy: -1 - Math.random(), life: 25, maxLife: 25, color: '#cd7f32', size: 2 + Math.random(), type: 'sparkle' });
          }
        } else {
          addFloatingText(state, building.x + building.width / 2, building.y - 10, 'Need materials', '#f97316', 'brief');
        }
      }
    }
    if (building.completed && staffed && building.type === BuildingType.Hospital && isProductionTick(state.tick, PRODUCTION_INTERVAL.hospital)) {
      addReputation(state, 2);
    }
    if (building.completed && staffed && building.type === BuildingType.TownHall && isProductionTick(state.tick, PRODUCTION_INTERVAL.townHall)) {
      // Deliberately use state.entities here to match legacy behavior:
      // town-hall civic ran before state.entities was replaced with allAlive.
      tickTownHallCivic(state, building, state.entities.filter(isPlayerHuman));
    }
    if (building.completed && staffed && building.type === BuildingType.Silo && isProductionTick(state.tick, PRODUCTION_INTERVAL.silo)) {
      const amount = Math.floor(8 * totalMult * millBonus * globalEff);
      addResource(state, 'food', amount);
    }
  }

  tickVillageForge(state, updatedBuildings);

  // Urban Planning: completed roads passively generate reputation (road_bonus research)
  const roadRepMult = getMultiplier(state, 'road_bonus');
  if (roadRepMult > 1 && isProductionTick(state.tick, PRODUCTION_INTERVAL.townHall)) {
    const roadCount = roadBuildings.length;
    if (roadCount > 0) {
      const rep = Math.min(5, Math.max(1, Math.floor(roadCount * (roadRepMult - 1) + 1)));
      addReputation(state, rep);
      const camp = updatedBuildings.find(
        (b) => b.completed && (b.type === BuildingType.TownHall || b.type === BuildingType.House),
      );
      if (camp) {
        addFloatingText(
          state,
          camp.x + camp.width / 2,
          camp.y - 12,
          `+${rep} rep (roads)`,
          '#c4b5fd',
          'brief',
        );
      }
    }
  }
}

// ==================== FRONTIER SYSTEMS ====================

function tickFestivals(state: WorldState, counts: PopulationCounts): void {
  const townHallFestivalBoost = state.buildings.some(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival' && b.occupants.length > 0,
  )
    ? 1.4
    : 1;

  if (
    !state.festival
    && state.tick >= (state.townHallFestivalCooldownUntilTick ?? 0)
    && state.tick % FESTIVAL_CHECK_TICKS === 0
    && counts.humans >= 6
    && Math.random() < 0.25 * townHallFestivalBoost
  ) {
    const festivalNames = ['Harvest Festival', 'Moonlight Feast', 'Founders Day', 'Spring Revel', 'Trade Fair'];
    const name = festivalNames[Math.floor(Math.random() * festivalNames.length)];
    state.festival = { active: true, name, daysLeft: 20 + Math.floor(Math.random() * 20) };
    state.townHallFestivalCooldownUntilTick = state.tick + getTownHallFestivalCooldownTicks();
    state.villageReputation = Math.min(100, state.villageReputation + 10);
    addBigNews(state, '🎉 Festival!', `${name} has begun! Production, courtship, and immigration are boosted for ${state.festival.daysLeft} days.`, 'positive');
    logEvent(state, 'season', `${name} festival began in the village`);
  }

  if (state.festival && state.tick > 0 && state.tick % TICKS_PER_DAY === 0) {
    state.festival.daysLeft--;
    if (state.festival.daysLeft <= 0) {
      addBigNews(state, '🎉 Festival Ended', `${state.festival.name} is over. The village returns to normal.`, 'neutral');
      state.festival = null;
      state.townHallFestivalCooldownUntilTick = state.tick + getTownHallFestivalCooldownTicks();
    }
  }
}

function tickImmigration(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  const { updatedBuildings, entityById, width, height } = ctx;

  const housingCap = updatedBuildings
    .filter((b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion))
    .reduce((sum, b) => sum + getResidenceCapacity(b), 0);
  state.maxHumanPopulation = 5 + housingCap + Math.floor(state.villageReputation / 10);

  const completedHousing = updatedBuildings.filter(
    (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  ).length;
  const immigrationChance = Math.min(
    0.95,
    (0.05 + state.villageReputation / 120 + completedHousing * 0.03)
      * (state.festival?.active ? 1.5 : 1)
      * getTownHallImmigrationMultiplier(updatedBuildings),
  );

  if (
    state.tick > 0
    && state.tick % IMMIGRATION_CHECK_TICKS === 0
    && counts.humans < state.maxHumanPopulation
    && Math.random() < immigrationChance
  ) {
    let spawnX = width / 2;
    let spawnY = height / 2;
    const homes = updatedBuildings.filter(
      (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
    );
    if (homes.length > 0) {
      const home = homes[Math.floor(Math.random() * homes.length)];
      spawnX = home.x + home.width / 2;
      spawnY = home.y + home.height / 2;
    }
    const rawSpawnX = spawnX + (Math.random() - 0.5) * 40;
    const rawSpawnY = spawnY + (Math.random() - 0.5) * 40;
    const spawn = findHumanSpawnNear(state, rawSpawnX, rawSpawnY);
    const newcomers = createImmigrantSettler(state, spawn.x, spawn.y);
    for (const newcomer of newcomers) {
      allAlive.push(newcomer);
      indexEntity(entityById, newcomer);
      counts.humans++;
    }
    assignMissingResidences(allAlive.filter(isPlayerHuman), updatedBuildings, allAlive);
    addFloatingText(state, spawnX, spawnY - 18, '+1 Settler arrived', '#22c55e');
  }
}

// ==================== DAILY GATING FROM GAMETICK ====================

function isChallengeComplete(
  challenge: Challenge,
  state: WorldState,
  humanCount: number,
  buildings: Building[],
): boolean {
  function countPlayerCompletedBuildings(buildings: Building[]): number {
    return buildings.filter((b) => b.completed && b.faction !== 'rival').length;
  }
  const playerBuildings = countPlayerCompletedBuildings(buildings);
  const hasHousing = buildings.some(
    (b) =>
      b.completed
      && b.faction !== 'rival'
      && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
  );

  switch (challenge.id) {
    case 'first_settlers':
      return humanCount >= (challenge.targetPopulation ?? 0) && hasHousing;
    case 'growing_village':
      return (
        state.year >= (challenge.targetYear ?? 0)
        && playerBuildings >= (challenge.targetBuildings ?? 0)
      );
    case 'eco_master':
      return state.ecoHealthYearsAbove80 >= 10;
    case 'great_city':
      return humanCount >= (challenge.targetPopulation ?? 0) && playerBuildings >= (challenge.targetBuildings ?? 0);
    case 'tech_pioneer':
      return state.unlockedTechs.length >= 5;
    case 'trading_hub':
      return state.tradeRoutes.filter((r) => r.active).length >= 3;
    default: {
      let met = true;
      if (challenge.targetYear !== undefined) met = met && state.year >= challenge.targetYear;
      if (challenge.targetPopulation !== undefined) met = met && humanCount >= challenge.targetPopulation;
      if (challenge.targetBuildings !== undefined) met = met && playerBuildings >= challenge.targetBuildings;
      return met;
    }
  }
}

// ==================== DAILY LAYER ENTRYPOINT ====================

export function tickLayerDaily(
  state: WorldState,
  ctx: TickContext,
  allAlive: Entity[],
  counts: PopulationCounts,
): void {
  // Static / daily bookkeeping
  tickStaticDaily(state, ctx.season);

  // Frontier systems
  tickVisitorGroups(state, allAlive);
  tickPendingRaidEvents(state, allAlive, ctx.updatedBuildings);
  tickPendingOutgoingRaidEvents(state);
  tickRivalSettlements(state, allAlive);

  // Remove any entities that died during frontier resolution before counts are reused.
  for (let i = allAlive.length - 1; i >= 0; i--) {
    if (!allAlive[i].alive) allAlive.splice(i, 1);
  }
  pruneFactionWanderStates(allAlive.map((e) => e.id));

  tickFestivals(state, counts);
  tickImmigration(state, ctx, allAlive, counts);

  if (state.tick > 0 && state.tick % (TICKS_PER_DAY * 7) === 0) {
    replenishDepletedWildlife(state);
  }

  // Building production + forge
  tickBuildingProduction(state, ctx, allAlive);

  // Skill decay (new calendar day)
  if (isNewCalendarDayTick(state)) {
    for (const human of ctx.playerHumans) {
      if (!human.alive || human.isJuvenile) continue;
      decayIdleSkills(human, human.job);
    }
  }

  // Election ceremony
  const electionReveal = tickElectionCeremony(state, state.year);
  if (electionReveal) {
    addBigNews(state, electionReveal.title, electionReveal.message, 'positive');
    addNotification(state, electionReveal.title, electionReveal.message, 'event');
    impulseScreenShake(state, 4);
  }

  // Leader vacancy
  const vacancyNews = tickLeaderVacancy(state);
  if (vacancyNews) {
    addBigNews(state, vacancyNews.title, vacancyNews.message, 'neutral');
    addNotification(state, vacancyNews.title, vacancyNews.message, 'event');
  }

  // Yearly world events
  if (state.dayInYear === 0 && state.year > 0) {
    state.activeEvent = null;
  }

  if (state.year > 0 && state.year % 2 === 0 && state.year !== state.lastEventYear) {
    state.lastEventYear = state.year;
    const rolled = rollYearlyWorldEvent(
      state, allAlive, ctx.updatedBuildings, ctx.width, ctx.height,
      () => state.nextEntityId++,
    );
    state.activeEvent = rolled.event;
    if (rolled.bountifulHarvest) state.bountifulHarvest = true;
    if (state.activeEvent) {
      trackYearEvent(state, state.activeEvent.title);
      addNotification(state, state.activeEvent.title, state.activeEvent.description, state.activeEvent.type === 'positive' ? 'success' : state.activeEvent.type === 'negative' ? 'warning' : 'event');
    }
  }

  // Mid-year visitor
  if (state.dayInYear === 180 && state.year > 0 && state.tick > 0) {
    const midEvent = tryMidYearVisitorEvent(state, allAlive, ctx.updatedBuildings);
    if (midEvent) {
      state.activeEvent = midEvent;
      trackYearEvent(state, midEvent.title);
      addNotification(state, midEvent.title, midEvent.description, 'event');
    }
  }

  // First-week visitor
  if (!state.firstWeekVisitorSpawned) {
    const firstWeekEvent = tryFirstWeekVisitor(state, allAlive, ctx.updatedBuildings);
    if (firstWeekEvent) {
      state.activeEvent = firstWeekEvent;
      trackYearEvent(state, firstWeekEvent.title);
      addNotification(state, firstWeekEvent.title, firstWeekEvent.description, 'success');
    }
  }

  // Bountiful harvest reset on odd years
  if (state.year > 0 && state.year % 2 !== 0) {
    state.bountifulHarvest = false;
  }

  // Election buildup and ceremonies (year rollover)
  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const yearRollover = state.dayInYear === 0 && prevCalendarDay > 0;
  if (yearRollover) {
    const buildupNews = tickElectionBuildup(state, state.year, yearRollover);
    if (buildupNews) {
      addBigNews(state, buildupNews.title, buildupNews.message, 'neutral');
      addNotification(state, buildupNews.title, buildupNews.message, 'event');
    }

    const vacancyCeremony = tryStartVacancyElectionCeremony(state, state.year, state.dayInYear);
    const decennialCeremony = !vacancyCeremony
      && tryStartDecennialElectionCeremony(state, state.year, state.dayInYear);

    if (vacancyCeremony || decennialCeremony) {
      addBigNews(
        state,
        '🗳️ Election Day',
        `Settlers gather for the leadership election (Year ${state.year}). Gossip, tension, then the merit reveal — and a village party after.`,
        'neutral',
      );
      addNotification(
        state,
        '🗳️ Election Day',
        `Year ${state.year} leadership election — villagers gathering now.`,
        'event',
      );
    }
  }

  // Challenges
  const challengeHumanCount = counts.humans;
  const challengeState: WorldState = { ...state, ecoHealthYearsAbove80: state.ecoHealthYearsAbove80 };
  state.challenges = state.challenges.map((c) => {
    if (c.completed) return c;
    const completed = isChallengeComplete(c, challengeState, challengeHumanCount, ctx.updatedBuildings);

    if (completed && c.reward) {
      addResource(state, 'wood', c.reward.wood || 0);
      addResource(state, 'stone', c.reward.stone || 0);
      addResource(state, 'food', c.reward.food || 0);
      addResource(state, 'gold', c.reward.gold || 0);
      addFloatingText(state, state.width / 2, state.height / 2 - 40, `Challenge: ${c.title}!`, '#fbbf24');
      if (c.rewardText) {
        addFloatingText(state, state.width / 2, state.height / 2 - 25, c.rewardText, '#22c55e');
      }
      addNotification(state, 'Challenge Complete!', `${c.title} - ${c.rewardText || 'Rewards granted!'}`, 'success');
      impulseScreenShake(state, 4);
    }

    return { ...c, completed: completed || c.completed };
  });
}
