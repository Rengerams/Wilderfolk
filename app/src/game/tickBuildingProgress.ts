import type { WorldState, Building } from './gameTypes';
import { BuildingType, JobType, Season, BUILDING_CONFIGS } from './gameTypes';
import {
  buildWorkTicks,
  getHourOfDay,
  isNewCalendarDayTick,
  isWorkHour,
  WORK_START,
} from './dayCycle';
import { logEvent } from './eventLog';
import { spawnBuildCompleteParticles } from './juiceEffects';
import { syncAdjacency } from './adjacencyIndex';
import { getJobForBuilding, gainSkill, getWorkerSkillMultiplier } from './skills';
import { addReputation, getMultiplier } from './simHelpers';
import {
  addFloatingText,
  createDeathParticles,
  impulseScreenShake,
} from './simEffects';
import { loadJuiceEffectsEnabled } from './preferences';

const isPassiveBuild = (type: BuildingType) =>
  type === BuildingType.House || type === BuildingType.Road || type === BuildingType.Well;

/**
 * Advance construction progress and apply daily repair / winter decay.
 *
 * Called every tick from the economy layer. Construction advances during work
 * hours; repair and decay are gated to once per calendar day.
 */
export function tickBuildingProgress(state: WorldState): Building[] {
  const hourOfDay = getHourOfDay(state.tick);
  const isNewCalendarDay = isNewCalendarDayTick(state);
  const entityById = new Map<number, import('./gameTypes').Entity>();
  for (const e of state.entities) {
    if (e.alive) entityById.set(e.id, e);
  }

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
    if (building.completed && state.season === Season.Winter && isNewCalendarDay) {
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

  return updatedBuildings;
}
