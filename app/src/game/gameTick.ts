/**
 * gameTick — one simulation step. Orchestrates layers; mutates WorldState in place.
 */
import { addHuntVisual, pruneHuntVisuals } from './huntvisuals';
import type {
  WorldState, Entity, Building, DeathParticle, FloatingText, Challenge,
} from './gameTypes';
import {
  BuildingType,
  Season,
  BUILDING_CONFIGS,
  JobType, BUILDING_JOB_TYPES,
  WEREWOLF_CURSE_LINES, WEREWOLF_TRANSFORM_LINES, WEREWOLF_TAME_LINES,
  getWorkshopRecipe,
  EntityType,
} from './gameTypes';
import { recordYearlyStats, updateLifetimeStats, trackYearEvent } from './stats';
import { checkVictoryAchievements } from './victory';
import { logEvent } from './eventLog';
import {
  getWorkerSkillMultiplier,
  getJobForBuilding, gainSkill, rewardProductionSkills, decayIdleSkills,
} from './skills';
import { spawnBuildCompleteParticles } from './juiceEffects';
import {
  buildingUsesAdjacency,
  ensureAdjacencyIndex,
  getAdjacencyMultiplierFromIndex,
  syncAdjacency,
} from './adjacencyIndex';
import { ensureEntityByIdMap, indexEntity } from './entityIndex';
import { getLumberMillTreeMultiplier } from './treeProximity';
import { getGrassGrowthMultiplier, getWinterEnergyPenalty } from './grassEcology';
import {
  assignMissingResidences, buildWorkTicks, getCalendarDay, getHourOfDay,
  IMMIGRATION_CHECK_TICKS, FESTIVAL_CHECK_TICKS, isProductionTick,
  PRODUCTION_INTERVAL,
  TICKS_PER_DAY, WORK_START, isNightHour, ticksForDays,
  EVENT_INTERVAL, isNewCalendarDayTick, markCalendarDayProcessed,
  getAbsoluteCalendarDay, syncHumanAgeFromCalendar,
  reconcileOrphanedMarriages,
  isResidenceOccupantEntity,
  syncResidenceOccupants,
  isWorkHour,
  getResidenceCapacity,
} from './dayCycle';
import { SPECIES_CONFIG } from './speciesConfig';
import {
  buildEntityByType,
  type SimulationFocus,
} from './simFocus';
import {
  getSeason,
  getReproductionMultiplier,
  hasTech,
  getMultiplier,
  addReputation,
} from './simHelpers';
import {
  impulseScreenShake,
  createDeathParticles,
  addFloatingText,
  addNotification,
  addBigNews,
} from './simEffects';
import {
  getTerrainEfficiencyMultiplier,
  findHumanSpawnNear,
} from './terrainSystems';
import {
  getSmithBonus,
  assignMissingWorkers,
  releasePrisoners,
  countWorkingAndIdleSettlers,
} from './workforce';
import { maybeTriggerRenffrOmen, tickRenffrOmen } from './renffrStar';
import {
  isPlayerHuman, tickVisitorGroups, tickRivalSettlements,
  rollYearlyWorldEvent, tryFirstWeekVisitor, tryMidYearVisitorEvent,
} from './groupEvents';
import {
  getTownHallGovernanceEfficiency,
  getTownHallImmigrationMultiplier,
  tickTownHallCivic,
  getTownHallFestivalCooldownTicks,
} from './townHall';
import {
  tickElectionBuildup,
  tickElectionCeremony,
  tickLeaderVacancy,
  tryStartDecennialElectionCeremony,
  tryStartVacancyElectionCeremony,
} from './villageLeadership';
import { tickPendingOutgoingRaidEvents, tickPendingRaidEvents } from './frontierCombat';
import { buildHuntTargetByPreyIndex, type TickContext } from './lifeSimulation';
import { tickLayerStatic } from './tickLayerStatic';
import { tickLayerSocial, LAYER_SOCIAL_INTERVAL } from './tickLayerSocial';
import { tickLayerEcological, LAYER_ECO_INTERVAL } from './tickLayerEcological';
import { tickLayerActive } from './tickLayerActive';
import { tickLayerStats } from './tickLayerStats';
import {
  USE_SPATIAL_GRID,
  syncMobileSimGrid,
  syncTreeSimGrid,
  buildRoadAvoidanceIndex,
  computeRoadLayoutStamp,
  assertSpatialGridInvariants,
  syncGrassRenderGrid,
} from './spatialGrid';
import { USE_SCENT_GRID, ensureScentGrid, tickScentGrid } from './scentGrid';
import { createEntity, createImmigrantSettler, replenishDepletedWildlife } from './worldGen';
import { getForgeQuarryMultiplier, tickVillageForge } from './forge';
import { pruneFactionWanderStates } from './factionWander';
import { loadJuiceEffectsEnabled } from './preferences';
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
  canMoonHowlerCurse, countActiveMoonHowlerCurses, curseMoonHowler,
  isActiveMoonHowler,
  shouldApplyNewMoonHowlerCurse, syncMoonHowlerForms, transformToWerewolfForm,
  tryMoonHowlerChurchCures,
} from './moonHowler';
import { addResource, canAffordWorkshopRecipe, consumeWorkshopRecipeInputs } from './economy';


export function gameTick(state: WorldState, focus?: SimulationFocus): WorldState {
  if (state.paused) return state;
  const { width, height } = state;

  if (isSpatialQueryMetricsEnabled()) {
    resetSpatialQueryTickMetrics();
    setSpatialQueryGridMode(USE_SPATIAL_GRID ? 'grid' : 'naive');
  }

  state.tick++;
  state.dayInYear = getCalendarDay(state.tick);
  const prevCalendarDay = state.tick <= 1 ? 0 : getCalendarDay(state.tick - 1);
  const yearRollover = state.dayInYear === 0 && prevCalendarDay > 0;
  const newYear = yearRollover ? state.year + 1 : state.year;

  let ecoHealthYearsAbove80 = state.ecoHealthYearsAbove80;
  if (yearRollover) {
    const yearlyStat = recordYearlyStats(state, state.year);
    state.yearlyStats.push(yearlyStat);
    if (state.yearlyStats.length > 50) state.yearlyStats.shift();
    state.lifetimeStats = updateLifetimeStats(state, state.lifetimeStats);
    state.eventsThisYear = [];
    if (newYear > 0) {
      ecoHealthYearsAbove80 = state.ecosystemHealth >= 80
        ? ecoHealthYearsAbove80 + 1
        : 0;
    }
    state.year = newYear;
  }

  const season = getSeason(state.dayInYear);
  const grassMult = getGrassGrowthMultiplier(season, state.weather);
  const reproMult = getReproductionMultiplier(season);
  const winterPenalty = getWinterEnergyPenalty(season);

  state.season = season;

// Layered systems — see tickLayer*.ts (social / active / ecological / static / stats)
  ensureEntityByIdMap(state);
  releasePrisoners(state);

  const vacancyNews = tickLeaderVacancy(state);
  if (vacancyNews) {
    addBigNews(state, vacancyNews.title, vacancyNews.message, 'neutral');
    addNotification(state, vacancyNews.title, vacancyNews.message, 'event');
  }

  // Static / daily — food spoilage + election gossip (once per calendar day boundary)
  if (state.tick % TICKS_PER_DAY === 0) {
    tickLayerStatic(state, season);
  }

  const newEntities: Entity[] = [];
  const aliveEntities = state.entities.filter(e => e.alive);

  for (const entity of aliveEntities) {
    if (entity.moonHowlerCursed && entity.type === EntityType.Human) {
      syncHumanAgeFromCalendar(entity, state);
    }
  }

  let byType = buildEntityByType(aliveEntities);

  const hourOfDay = getHourOfDay(state.tick);
  const isNewCalendarDay = isNewCalendarDayTick(state);
  const colonyDay = getAbsoluteCalendarDay(state.tick);

  const moonSync = syncMoonHowlerForms(aliveEntities, colonyDay, hourOfDay);
  if (moonSync.transformed.length > 0 || moonSync.reverted.length > 0) {
    byType = buildEntityByType(aliveEntities);
    syncResidenceOccupants(
      aliveEntities.filter(isResidenceOccupantEntity),
      state.buildings,
    );
  }
  if (moonSync.nightFall) {
    addBigNews(state, '🌝 Full Moon!', 'Moon Howlers are abroad. Keep settlers indoors — they hunt tonight.', 'negative');
    logEvent(state, 'event', 'Full moon rose — cursed settlers transformed');
  }
  for (const were of moonSync.transformed) {
    const who = were.name ? `${were.name}${were.surname ? ` ${were.surname}` : ''}` : 'A settler';
    const line = WEREWOLF_TRANSFORM_LINES[Math.floor(Math.random() * WEREWOLF_TRANSFORM_LINES.length)](who);
    addFloatingText(state, were.x, were.y - 20, 'AWOO!', '#c4b5fd');
    logEvent(state, 'event', line, who);
  }

  const activeMoonCurses = countActiveMoonHowlerCurses(aliveEntities);
  const humanPop = aliveEntities.filter((e) => e.alive && isPlayerHuman(e)).length;
  if (shouldApplyNewMoonHowlerCurse(colonyDay, hourOfDay, humanPop, activeMoonCurses)) {
    const candidates = byType[EntityType.Human].filter((h) => isPlayerHuman(h) && canMoonHowlerCurse(h));
    const human = candidates[Math.floor(Math.random() * candidates.length)];
    if (human) {
      const who = human.name ? `${human.name}${human.surname ? ` ${human.surname}` : ''}` : 'A settler';
      curseMoonHowler(human);
      transformToWerewolfForm(human);
      byType = buildEntityByType(aliveEntities);
      const line = WEREWOLF_CURSE_LINES[Math.floor(Math.random() * WEREWOLF_CURSE_LINES.length)](who);
      addBigNews(state, '🌝 Moon Howler Curse!', line, 'negative');
      addFloatingText(state, human.x, human.y - 20, 'Cursed…', '#c4b5fd');
      logEvent(state, 'event', `${who} was cursed as a Moon Howler`, who);
      const transformLine = WEREWOLF_TRANSFORM_LINES[Math.floor(Math.random() * WEREWOLF_TRANSFORM_LINES.length)](who);
      addFloatingText(state, human.x, human.y - 20, 'AWOO!', '#c4b5fd');
      logEvent(state, 'event', transformLine, who);
      if (!moonSync.nightFall) {
        addBigNews(state, '🌝 Full Moon!', 'Moon Howlers are abroad. Keep settlers indoors — they hunt tonight.', 'negative');
        logEvent(state, 'event', 'Full moon rose — cursed settlers transformed');
      }
    }
  }

  const entityById = ensureEntityByIdMap(state);

  const dawnCures = tryMoonHowlerChurchCures(state, aliveEntities, state.buildings, colonyDay, hourOfDay, entityById);
  if (dawnCures.cured.length > 0) {
    for (const curedOne of dawnCures.cured) {
      const who = curedOne.name ? `${curedOne.name}${curedOne.surname ? ` ${curedOne.surname}` : ''}` : 'A settler';
      const line = WEREWOLF_TAME_LINES[Math.floor(Math.random() * WEREWOLF_TAME_LINES.length)];
      addBigNews(state, '⛪ Curse Broken!', `${who} — ${line}`, 'positive');
      addFloatingText(state, curedOne.x, curedOne.y - 20, 'Cured!', '#22c55e');
      logEvent(state, 'event', `${who} was cured of the Moon Howler curse`, who);
    }
    byType = buildEntityByType(aliveEntities);
    ensureEntityByIdMap(state);
  }

  const isPassiveBuild =
    (type: BuildingType) =>
      type === BuildingType.House || type === BuildingType.Road || type === BuildingType.Well;

  // Update buildings (clone so state.buildings is not mutated mid-tick)
  const updatedBuildings = state.buildings.map((b) => {
    const building = { ...b, occupants: [...b.occupants] };
    if (!building.completed && building.constructionProgress < 100) {
      const workers = building.occupants.length;

      if (isWorkHour(hourOfDay)) {
        const buildDays = BUILDING_CONFIGS[building.type].buildTime;
        const totalWorkTicks = buildWorkTicks(buildDays);
        const baseRate = 100 / totalWorkTicks;
        const buildMultiplier = workers > 0
          ? 1 + workers * 0.25
          : isPassiveBuild(building.type) ? 0.55 : 0.12;
        const globalMult = getMultiplier(state, 'global_efficiency');
        const skillMult = getWorkerSkillMultiplier(state, building, entityById);
        building.constructionProgress += baseRate * buildMultiplier * globalMult * skillMult;
        if (workers > 0 && hourOfDay === WORK_START) {
          const job = getJobForBuilding(building.type) ?? JobType.Builder;
          for (const id of building.occupants) gainSkill(state, id, job, 0.15);
        }
      }
      building.buildAnimTimer += 0.1;
      if (building.constructionProgress >= 100) {
        building.constructionProgress = 100;
        building.completed = true;
        building.occupants = [];
        logEvent(state, 'building', `${BUILDING_CONFIGS[building.type].label} completed`);
        building.spriteScale = 1.18;
        if (building.faction !== 'rival') state.totalBuildingsCompleted++;
        const repGain = building.faction === 'rival' ? 0 : 2;
        if (repGain > 0) {
          addReputation(state, repGain);
        }
        if (building.faction !== 'rival') {
          if (loadJuiceEffectsEnabled()) {
            spawnBuildCompleteParticles(state, building);
            addFloatingText(state, building.x, building.y - building.height * 0.35, '✨ Built!', '#fde047', 'emphasis');
            if (repGain > 0) {
              addFloatingText(state, building.x, building.y - 8, `+${repGain}⭐`, '#22c55e', 'brief');
            }
            impulseScreenShake(state, 3.5);
          }
        } else {
          createDeathParticles(state, building.x, building.y, '#ffd700', 12, 'star');
        }
        syncAdjacency(state, building, b.completed);
      }
    }
    if (building.completed && building.spriteScale > 1) {
      building.spriteScale = Math.max(1, building.spriteScale - 0.025);
    } else if (building.completed && building.spriteScale < 1) {
      building.spriteScale = Math.min(1, building.spriteScale + 0.05);
    }
    // Winter building decay — once per game-day
    if (building.completed && season === Season.Winter && isNewCalendarDay) {
      building.health = Math.max(10, building.health - 2);
    }
    // Auto repair with workers — once per game-day (alive occupants only)
    const aliveRepairWorkers = building.occupants.filter(
      (id) => entityById.get(id)?.alive,
    ).length;
    if (
      building.completed
      && building.health < building.maxHealth
      && aliveRepairWorkers > 0
      && isNewCalendarDay
    ) {
      const hpNeeded = building.maxHealth - building.health;
      const repairAmount = Math.min(5, hpNeeded);
      const woodCost = hpNeeded <= 1 ? 1 : 2;
      if (state.resources.wood >= woodCost) {
        state.resources.wood -= woodCost;
        building.health = Math.min(building.maxHealth, building.health + repairAmount);
      }
    }
    return building;
  });

  const hasMill = updatedBuildings.some(b => b.type === BuildingType.Mill && b.completed);
  const roadBuildings = updatedBuildings.filter(b => b.type === BuildingType.Road && b.completed);

  const playerHumans = byType[EntityType.Human].filter(isPlayerHuman);
  assignMissingWorkers(playerHumans, updatedBuildings);

  if (isNewCalendarDay) {
    for (const human of playerHumans) {
      if (!human.alive || human.isJuvenile) continue;
      decayIdleSkills(human, human.job);
    }
  }

  if (maybeTriggerRenffrOmen(state, state.entities, isNightHour(hourOfDay))) {
    logEvent(state, 'event', 'A star scratched "Renffr" across the night sky. The letters fell out of alignment.', 'Renffr');
  }
  state.renffrOmen = tickRenffrOmen(state.renffrOmen);

  const humanCount = playerHumans.length;
  const isWinter = season === Season.Winter;

  // Winter heating
  let canHeat = true;
  if (isWinter && state.tick % TICKS_PER_DAY === 0 && humanCount > 0) {
    const woodNeeded = Math.ceil(humanCount / 5);
    if (state.resources.wood >= woodNeeded) {
      state.resources.wood -= woodNeeded;
    } else {
      canHeat = false;
    }
  }

  // Predator migration
  if (isProductionTick(state.tick, EVENT_INTERVAL.wolfRecruit) && byType[EntityType.Wolf].filter(e => e.alive).length < 2 && Math.random() < 0.1) {
    const edge = Math.floor(Math.random() * 4);
    let sx = 0, sy = 0;
    if (edge === 0) { sx = Math.random() * width; sy = 0; }
    else if (edge === 1) { sx = Math.random() * width; sy = height; }
    else if (edge === 2) { sx = 0; sy = Math.random() * height; }
    else { sx = width; sy = Math.random() * height; }
    const wolf = createEntity(
      EntityType.Wolf, sx, sy, state.nextEntityId++, SPECIES_CONFIG[EntityType.Wolf].spawnEnergy,
    );
    newEntities.push(wolf);
    indexEntity(entityById, wolf);
    addFloatingText(state, sx, sy, 'A lone wolf enters', '#6b7280');
  }

  const buildingById = new Map<number, Building>();
  for (const b of updatedBuildings) buildingById.set(b.id, b);

  const predators = [
    ...byType[EntityType.Wolf],
    ...byType[EntityType.Fox],
    ...byType[EntityType.Human].filter((h) => isPlayerHuman(h) && h.alive && !h.isJuvenile),
    ...byType[EntityType.Human].filter((h) => h.faction === 'rival' && h.alive),
    ...byType[EntityType.Werewolf].filter((e) => e.alive),
  ];

  const mobileGrid = USE_SPATIAL_GRID
    ? syncMobileSimGrid(state.mobileGrid, width, height, aliveEntities)
    : undefined;
  state.mobileGrid = mobileGrid;

  const grassGrid = USE_SPATIAL_GRID
    ? syncGrassRenderGrid(state.grassGrid, width, height, byType[EntityType.Grass] ?? [])
    : undefined;

  const treeTypeList = byType[EntityType.Tree];
  const treeGrid = syncTreeSimGrid(state.treeGrid, width, height, treeTypeList);
  state.treeGrid = treeGrid;

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

  const scentGrid = USE_SCENT_GRID ? ensureScentGrid(state) : undefined;
  if (scentGrid) tickScentGrid(state, predators);

  const electionReveal = tickElectionCeremony(state, state.year);
  if (electionReveal) {
    addBigNews(state, electionReveal.title, electionReveal.message, 'positive');
    addNotification(state, electionReveal.title, electionReveal.message, 'event');
    impulseScreenShake(state, 4);
  }

  // === LAYERED TICK SYSTEM ===
  const ctx: TickContext = {
    width, height, hourOfDay, season, grassMult, reproMult, winterPenalty, canHeat,
    byType, newEntities, updatedBuildings, roadBuildings,
    playerHumans: byType[EntityType.Human].filter(isPlayerHuman),
    entityById,
    buildingById,
    predators,
    grassGrid,
    mobileGrid,
    treeGrid,
    roadAvoidance: state.roadAvoidance,
    huntTargetByPreyId: buildHuntTargetByPreyIndex(byType),
    scentGrid,
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

  // --- Tick layers (orchestration only; heavy AI lives in lifeSimulation) ---
  // 1) Social first so residence assignments exist before Active AI.
  if (state.tick % LAYER_SOCIAL_INTERVAL === 0) {
    tickLayerSocial(state, ctx);
  }

  // 2) Active — every tick (humans + wildlife AI)
  tickLayerActive(state, ctx);

  // 3) Ecological — weather, disasters, research, caravans
  if (state.tick % LAYER_ECO_INTERVAL === 0) {
    tickLayerEcological(state, ctx);
  }

  const allAlive: Entity[] = [];
  for (const e of aliveEntities) {
    if (e.alive) allAlive.push(e);
  }
  for (const e of newEntities) {
    if (e.alive) allAlive.push(e);
  }

  assertSpatialGridInvariants(grassGrid, mobileGrid, allAlive, treeGrid);

  // Frontier systems — single call sites (outgoing raids not also in ecological)
  tickVisitorGroups(state, allAlive);
  tickPendingRaidEvents(state, allAlive, updatedBuildings);
  tickPendingOutgoingRaidEvents(state);
  tickRivalSettlements(state, allAlive);
  for (let i = allAlive.length - 1; i >= 0; i--) {
    if (!allAlive[i].alive) allAlive.splice(i, 1);
  }
  pruneFactionWanderStates(allAlive.map((e) => e.id));

  const counts = computePopulationCounts(allAlive);

  // Village festival / party
  const townHallFestivalBoost = updatedBuildings.some(
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

  // Pollution
  const industrialTypes: BuildingType[] = [BuildingType.Blacksmith, BuildingType.Mill, BuildingType.Workshop, BuildingType.Mine, BuildingType.Quarry, BuildingType.LumberMill];
  const industrialCount = updatedBuildings.filter(b => b.completed && industrialTypes.includes(b.type)).length;
  const pollutionMult = hasTech(state, 'forestry_2') ? 0.5 : 1;
  state.pollutionLevel = Math.min(100, Math.floor(industrialCount * 4 * pollutionMult + (counts.humans / 3)));

  // Ecosystem health
  const totalWildlife = counts.rabbits + counts.deer + counts.wolves + counts.foxes;
  const idealWildlife = 80;
  const wildlifeRatio = Math.min(1, totalWildlife / idealWildlife);
  const playerCompletedBuildings = updatedBuildings.filter(
    (b) => b.completed && b.faction !== 'rival',
  ).length;
  const buildingImpact = playerCompletedBuildings * 2;
  const pollutionPenalty = Math.floor(state.pollutionLevel / 2);
  state.ecosystemHealth = Math.max(0, Math.min(100, 100 - buildingImpact - pollutionPenalty + (wildlifeRatio * 30 - 20)));

  // Biodiversity
  const species = [counts.rabbits, counts.deer, counts.wolves, counts.foxes].filter(c => c > 0);
  const total = species.reduce((a, b) => a + b, 0);
  if (total > 0) {
    state.biodiversityIndex = species.reduce((sum, count) => {
      const p = count / total;
      return sum - p * Math.log(p);
    }, 0);
  } else {
    state.biodiversityIndex = 0;
  }

  // Housing
  const housingCap = updatedBuildings
    .filter((b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion))
    .reduce((sum, b) => sum + getResidenceCapacity(b), 0);
  state.maxHumanPopulation = 5 + housingCap + Math.floor(state.villageReputation / 10);

  // Immigration
  const completedHousing = updatedBuildings.filter(b => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion)).length;
  const immigrationChance = Math.min(
    0.95,
    (0.05 + state.villageReputation / 120 + completedHousing * 0.03)
      * (state.festival?.active ? 1.5 : 1)
      * getTownHallImmigrationMultiplier(updatedBuildings),
  );
  if (state.tick > 0 && state.tick % IMMIGRATION_CHECK_TICKS === 0 && counts.humans < state.maxHumanPopulation && Math.random() < immigrationChance) {
    let spawnX = width / 2, spawnY = height / 2;
    const homes = updatedBuildings.filter(b => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion));
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
    assignMissingWorkers(allAlive.filter(isPlayerHuman), updatedBuildings);
    addFloatingText(state, spawnX, spawnY - 18, '+1 Settler arrived', '#22c55e');
  }

  // Building production
  const smithBonus = getSmithBonus(updatedBuildings, playerHumans);
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
      const amount = Math.floor(22 * totalMult * harvestBonus * millBonus * farmMult * globalEff);
      const added = addResource(state, 'food', amount);
      if (added > 0 && productionJob) {
        for (const id of building.occupants) gainSkill(state, id, productionJob, 0.2);
      }
    }

    const hunterInterval = PRODUCTION_INTERVAL.huntingSpot;

    if (building.completed && staffed && building.type === BuildingType.HuntingSpot && isProductionTick(state.tick, hunterInterval)) {
      const searchRadius = 320;
      const targetPrey = state.entities.find((e) => 
        e.alive && 
        (e.type === EntityType.Deer || e.type === EntityType.Rabbit || e.type === EntityType.Wolf) &&
        Math.hypot(e.x - building.x, e.y - building.y) < searchRadius
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
          logEvent(state, 'combat', `A wild wolf fought back at the Hunting Spot!`);
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
      const treeMult = getLumberMillTreeMultiplier(building, treeGrid, treeTypeList);
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
      const amount = Math.floor((18 + workers * 5) * totalMult * harvestBonus * millBonus * farmMult * globalEff);
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
      tickTownHallCivic(state, building, allAlive.filter(isPlayerHuman));
    }
    if (building.completed && building.type === BuildingType.Silo && isProductionTick(state.tick, PRODUCTION_INTERVAL.silo)) {
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

  // Population / economy history — single writer (stats layer).
  // Use post-tick alive set + updated buildings so the sample matches UI counts.
  state.buildings = updatedBuildings;
  state.entities = allAlive;
  tickLayerStats(state, counts);

  let currentActiveEvent = state.activeEvent;
  let currentLastEventYear = state.lastEventYear;
  let currentBountifulHarvest = state.bountifulHarvest;

  if (state.dayInYear === 0 && state.year > 0) {
    currentActiveEvent = null;
  }

  if (state.year > 0 && state.year % 2 === 0 && state.year !== currentLastEventYear) {
    currentLastEventYear = state.year;
    const rolled = rollYearlyWorldEvent(
      state, allAlive, updatedBuildings, width, height,
      () => state.nextEntityId++
    );
    currentActiveEvent = rolled.event;
    if (rolled.bountifulHarvest) currentBountifulHarvest = true;
    if (currentActiveEvent) {
      trackYearEvent(state, currentActiveEvent.title);
      addNotification(state, currentActiveEvent.title, currentActiveEvent.description, currentActiveEvent.type === 'positive' ? 'success' : currentActiveEvent.type === 'negative' ? 'warning' : 'event');
    }
  }

  if (state.dayInYear === 180 && state.year > 0 && state.tick > 0) {
    const midEvent = tryMidYearVisitorEvent(state, allAlive, updatedBuildings);
    if (midEvent) {
      currentActiveEvent = midEvent;
      trackYearEvent(state, midEvent.title);
      addNotification(state, midEvent.title, midEvent.description, 'event');
    }
  }

  if (!state.firstWeekVisitorSpawned) {
    const firstWeekEvent = tryFirstWeekVisitor(state, allAlive, updatedBuildings);
    if (firstWeekEvent) {
      currentActiveEvent = firstWeekEvent;
      trackYearEvent(state, firstWeekEvent.title);
      addNotification(state, firstWeekEvent.title, firstWeekEvent.description, 'success');
    }
  }

  if (state.year > 0 && state.year % 2 !== 0) {
    currentBountifulHarvest = false;
  }

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

  // Challenges — after year rollover and eco streak update so year/eco checks are current
  const challengeHumanCount = computePopulationCounts(allAlive).humans;
  const challengeState: WorldState = { ...state, ecoHealthYearsAbove80 };
  state.challenges = state.challenges.map(c => {
    if (c.completed) return c;
    const completed = isChallengeComplete(c, challengeState, challengeHumanCount, updatedBuildings);

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

  const endTickHumans = allAlive.filter(isPlayerHuman);
  // assignMissingResidences draait nu veilig en geoptimaliseerd in tickLayerSocial!
  assignMissingWorkers(endTickHumans, updatedBuildings);

  const workforceCounts = countWorkingAndIdleSettlers(endTickHumans, updatedBuildings);
  state.workingSettlers = workforceCounts.working;
  state.idleSettlers = workforceCounts.idle;

  const preVictoryState: WorldState = {
    ...state,
    entities: allAlive,
    buildings: updatedBuildings,
    humanPopulation: counts.humans,
    ecoHealthYearsAbove80,
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
  state.entities = allAlive;
  if (state.tick > 0 && state.tick % ticksForDays(7) === 0) {
    replenishDepletedWildlife(state);
  }
  state.entityByType = buildEntityByType(state.entities);
  state.grassGrid = grassGrid ?? undefined;
  if (USE_SPATIAL_GRID) state.mobileGrid = mobileGrid;
  state.buildings = updatedBuildings;

  const newParticles: DeathParticle[] = [];
  for (const p of state.deathParticles) {
    p.x += p.vx;
    p.y += p.vy;
    p.vy += 0.02;
    p.life--;
    if (p.life > 0) newParticles.push(p);
  }
  state.deathParticles = newParticles;

  const newFloatingTexts: FloatingText[] = [];
  for (const ft of state.floatingTexts) {
    ft.y -= 0.7;
    ft.life--;
    ft.scale = ft.life < 6 ? ft.life / 6 : 1;
    if (ft.life > 0) newFloatingTexts.push(ft);
  }
  state.floatingTexts = newFloatingTexts;

  state.season = season;
  state.humanPopulation = counts.humans;
  state.wildlifeCounts = wildlifeCountsFromPopulation(counts);
  state.activeEvent = currentActiveEvent;
  state.lastEventYear = currentLastEventYear;
  state.bountifulHarvest = currentBountifulHarvest;
  state.ecoHealthYearsAbove80 = ecoHealthYearsAbove80;
  state.victories = victoryResult.victories;
  state.victoryAchieved = victoryResult.victoryAchieved;
  markCalendarDayProcessed(state);
  if (isSpatialQueryMetricsEnabled()) flushSpatialQueryTickToSession();

  pruneHuntVisuals(state); // Maakt de visuele jachten leeg na verloop van tijd
  return state;
}

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

 

