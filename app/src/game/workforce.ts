/**
 * Workforce staffing: auto-assign, rebalance, workplace lookup, prisoner release.
 */
import type { Building, Entity, WorldState } from './gameTypes';
import { BuildingType, EntityType, BUILDING_CONFIGS, BUILDING_JOB_TYPES, JobType } from './gameTypes';
import { getOccupationForBuilding, ensureEntitySkills, readSkill } from './skills';
import { isPlayerHuman } from './groupEvents';
import { assignMissingResidences, hasWorkAssignment, isImprisoned, isResidenceBuildingType } from './dayCycle';
import { logEvent } from './eventLog';
import { addFloatingText } from './simEffects';

function isOnConstructionCrew(human: Entity, buildings: Building[]): boolean {
  return buildings.some((b) => !b.completed && b.occupants.includes(human.id));
}

const AUTO_JOB_BUILDING_PRIORITY: BuildingType[] = [
  BuildingType.Farm,
  BuildingType.Greenhouse,
  BuildingType.LumberMill,
  BuildingType.Quarry,
  BuildingType.Mine,
  BuildingType.Blacksmith,
  BuildingType.Workshop,
  BuildingType.Store,
  BuildingType.Market,
  BuildingType.School,
  BuildingType.Hospital,
  BuildingType.TownHall,
  BuildingType.Church,
];

/** Job sites the player staffs manually (no auto-fill each tick). */
const MANUAL_STAFF_BUILDINGS = new Set<BuildingType>([BuildingType.Church, BuildingType.Prison, BuildingType.Barracks]);

export function isManualStaffBuilding(type: BuildingType): boolean {
  return MANUAL_STAFF_BUILDINGS.has(type);
}

export function jobBuildingPriority(type: BuildingType): number {
  const idx = AUTO_JOB_BUILDING_PRIORITY.indexOf(type);
  return idx === -1 ? AUTO_JOB_BUILDING_PRIORITY.length : idx;
}

export function countWorkersAtBuilding(humans: Entity[], buildingId: number): number {
  return humans.filter((h) => h.alive && !h.faction && h.homeBuildingId === buildingId).length;
}

export function countStaffedWorkersAtType(buildings: Building[], humans: Entity[], type: BuildingType): number {
  let total = 0;
  for (const b of buildings) {
    if (b.completed && b.type === type && b.faction !== 'rival') {
      total += countWorkersAtBuilding(humans, b.id);
    }
  }
  return total;
}

export function getSmithBonus(buildings: Building[], humans: Entity[]): number {
  const workers = countStaffedWorkersAtType(buildings, humans, BuildingType.Blacksmith);
  if (workers <= 0) return 1.0;
  return Math.min(1.5, 1 + workers * 0.25);
}

/** 0 = no church, 0.5 = built but unstaffed, 1 = staffed priest on duty */
export function getChurchStrength(buildings: Building[], humans: Entity[]): number {
  const hasChurch = buildings.some(
    (b) => b.completed && b.type === BuildingType.Church && b.faction !== 'rival',
  );
  if (!hasChurch) return 0;
  const workers = countStaffedWorkersAtType(buildings, humans, BuildingType.Church);
  return workers > 0 ? 1 : 0.5;
}

export function hasStaffedSchool(buildings: Building[]): boolean {
  return buildings.some(
    (b) => b.completed && b.type === BuildingType.School && b.faction !== 'rival' && b.occupants.length > 0,
  );
}

export function completedJobBuildings(buildings: Building[]): Building[] {
  return buildings
    .filter((b) => {
      if (!b.completed || b.faction === 'rival' || !BUILDING_JOB_TYPES[b.type]) return false;
      return BUILDING_CONFIGS[b.type].maxOccupants > 0;
    })
    .sort((a, b) => {
      const prio = jobBuildingPriority(a.type) - jobBuildingPriority(b.type);
      if (prio !== 0) return prio;
      return a.id - b.id;
    });
}

export function findOverstaffedDonorBuilding(
  jobBuildings: Building[],
  humans: Entity[],
  excludeBuildingId: number,
): Building | undefined {
  return jobBuildings
    .filter((b) => b.id !== excludeBuildingId && countWorkersAtBuilding(humans, b.id) >= 2)
    .sort((a, b) => countWorkersAtBuilding(humans, a.id) - countWorkersAtBuilding(humans, b.id))[0];
}

export function pickWorkerToTransfer(
  humans: Entity[],
  fromBuilding: Building,
  toBuilding: Building,
): Entity | undefined {
  const toJob = BUILDING_JOB_TYPES[toBuilding.type];
  const fromJob = BUILDING_JOB_TYPES[fromBuilding.type];
  if (!toJob || !fromJob) return undefined;

  const workers = humans.filter(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !h.pregnant
      && h.homeBuildingId === fromBuilding.id,
  );
  if (workers.length === 0) return undefined;

  workers.sort((a, b) => {
    const aFit = readSkill(a, toJob) - readSkill(a, fromJob);
    const bFit = readSkill(b, toJob) - readSkill(b, fromJob);
    return bFit - aFit;
  });
  return workers[0];
}

export function transferWorkerBetweenBuildings(
  worker: Entity,
  fromBuilding: Building,
  toBuilding: Building,
): void {
  const job = BUILDING_JOB_TYPES[toBuilding.type];
  if (!job) return;

  fromBuilding.occupants = fromBuilding.occupants.filter((id) => id !== worker.id);
  if (!toBuilding.occupants.includes(worker.id)) toBuilding.occupants.push(worker.id);

  worker.homeBuildingId = toBuilding.id;
  worker.occupation = getOccupationForBuilding(toBuilding.type);
  worker.job = job;
  ensureEntitySkills(worker)[job] = readSkill(worker, job);
}

export function rebalanceJobWorkers(humans: Entity[], buildings: Building[]): void {
  const jobBuildings = completedJobBuildings(buildings);
  let changed = true;

  while (changed) {
    changed = false;
    for (const needy of jobBuildings) {
      if (isManualStaffBuilding(needy.type)) continue;
      if (BUILDING_CONFIGS[needy.type].maxOccupants <= 0) continue;
      if (countWorkersAtBuilding(humans, needy.id) !== 0) continue;

      const donor = findOverstaffedDonorBuilding(jobBuildings, humans, needy.id);
      if (!donor) continue;

      const worker = pickWorkerToTransfer(humans, donor, needy);
      if (!worker) continue;

      transferWorkerBetweenBuildings(worker, donor, needy);
      changed = true;
    }
  }
}

export function syncJobBuildingOccupants(humans: Entity[], buildings: Building[]): void {
  for (const building of buildings) {
    if (!building.completed || building.faction === 'rival' || !BUILDING_JOB_TYPES[building.type]) continue;
    building.occupants = humans
      .filter((h) => h.alive && !h.faction && h.homeBuildingId === building.id && h.prisonBuildingId == null)
      .map((h) => h.id);
  }
}

export function assignWorkerInPlace(building: Building, humans: Entity[], buildings: Building[]): boolean {
  const job = BUILDING_JOB_TYPES[building.type];
  if (!job || !building.completed || building.faction === 'rival') return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (countWorkersAtBuilding(humans, building.id) >= cap) return false;

  const candidates = humans.filter(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !hasWorkAssignment(h)
      && !isImprisoned(h)
      && !h.pregnant
      && !isOnConstructionCrew(h, buildings),
  );
  candidates.sort((a, b) => readSkill(b, job) - readSkill(a, job));
  const worker = candidates[0];
  if (!worker) return false;

  worker.homeBuildingId = building.id;
  worker.occupation = getOccupationForBuilding(building.type);
  worker.job = job;
  ensureEntitySkills(worker)[job] = readSkill(worker, job);
  if (!building.occupants.includes(worker.id)) building.occupants.push(worker.id);
  return true;
}

export function assignBuilderInPlace(
  building: Building,
  humans: Entity[],
  allBuildings: Building[],
): boolean {
  if (building.completed || building.faction === 'rival') return false;

  const cap = BUILDING_CONFIGS[building.type].maxOccupants;
  if (building.occupants.length >= cap) return false;

  const builder = humans.find(
    (h) =>
      isPlayerHuman(h)
      && h.alive
      && !h.isJuvenile
      && !hasWorkAssignment(h)
      && !isImprisoned(h)
      && !h.pregnant
      && !building.occupants.includes(h.id)
      && !allBuildings.some((b) => !b.completed && b.id !== building.id && b.occupants.includes(h.id)),
  );
  if (!builder) return false;

  building.occupants.push(builder.id);
  return true;
}

export function prepareWorkforce(humans: Entity[], buildings: Building[]): Entity[] {
  const alive = humans.filter((h) => h.alive && !h.faction);

  for (const human of alive) {
    if (human.prisonBuildingId != null) {
      if (human.homeBuildingId != null) {
        human.homeBuildingId = undefined;
        human.occupation = 'settler';
        human.job = JobType.Settler;
      }
      continue;
    }
    if (!hasWorkAssignment(human)) continue;
    const workplace = buildings.find((b) => b.id === human.homeBuildingId);
    if (
      !workplace
      || !workplace.completed
      || workplace.faction === 'rival'
      || !BUILDING_JOB_TYPES[workplace.type]
    ) {
      human.homeBuildingId = undefined;
      human.occupation = 'settler';
      human.job = JobType.Settler;
    }
  }

  syncJobBuildingOccupants(alive, buildings);
  return alive;
}

export function staffConstructionCrews(alive: Entity[], buildings: Building[]): void {
  const incomplete = buildings
    .filter((b) => !b.completed && b.faction !== 'rival')
    .sort((a, b) => {
      const aHouse = isResidenceBuildingType(a.type) ? 0 : 1;
      const bHouse = isResidenceBuildingType(b.type) ? 0 : 1;
      if (aHouse !== bHouse) return aHouse - bHouse;
      return a.id - b.id;
    });

  for (const building of incomplete) {
    while (assignBuilderInPlace(building, alive, buildings)) {
      // fill construction crews
    }
  }
}

export function staffJobBuildings(alive: Entity[], buildings: Building[], includeManualStaff: boolean): void {
  const jobBuildings = completedJobBuildings(buildings);

  for (const building of jobBuildings) {
    if (!includeManualStaff && isManualStaffBuilding(building.type)) continue;
    while (assignWorkerInPlace(building, alive, buildings)) {
      // fill open job slots
    }
  }

  if (!includeManualStaff) {
    rebalanceJobWorkers(alive, buildings);
  }
  syncJobBuildingOccupants(alive, buildings);
}

/** Auto-staff construction sites and job buildings so settlers work instead of wandering. */
export function assignMissingWorkers(humans: Entity[], buildings: Building[]): void {
  const alive = prepareWorkforce(humans, buildings);
  staffConstructionCrews(alive, buildings);
  staffJobBuildings(alive, buildings, false);
}

/** Headless balance sims — fill every job slot including church, prison, and barracks. */
export function assignAllWorkers(humans: Entity[], buildings: Building[]): void {
  const alive = prepareWorkforce(humans, buildings);
  staffConstructionCrews(alive, buildings);
  staffJobBuildings(alive, buildings, true);
}

export function countWorkingAndIdleSettlers(
  humans: Entity[],
  buildings: Building[],
): { working: number; idle: number } {
  const constructionWorkers = new Set<number>();
  for (const b of buildings) {
    if (!b.completed) {
      for (const id of b.occupants) constructionWorkers.add(id);
    }
  }
  let working = 0;
  let idle = 0;
  for (const e of humans) {
    if (!e.alive || e.faction || e.isJuvenile || e.type !== EntityType.Human) continue;
    if (isImprisoned(e)) continue;
    if (hasWorkAssignment(e) || constructionWorkers.has(e.id)) working++;
    else idle++;
  }
  return { working, idle };
}

export function findHumanWorkplace(entity: Entity, buildings: Building[]): Building | undefined {
  if (hasWorkAssignment(entity)) {
    const jobSite = buildings.find(
      (b) => b.id === entity.homeBuildingId && b.completed && BUILDING_JOB_TYPES[b.type],
    );
    if (jobSite) return jobSite;
  }
  return buildings.find((b) => !b.completed && b.occupants.includes(entity.id));
}

export function releasePrisoners(state: WorldState): void {
  let released = false;
  for (const entity of state.entities) {
    if (!entity.alive || entity.type !== EntityType.Human) continue;
    if (entity.prisonBuildingId == null || entity.prisonerUntilTick == null) continue;
    if (state.tick < entity.prisonerUntilTick) continue;
    const prison = state.buildings.find((b) => b.id === entity.prisonBuildingId);
    if (prison) {
      prison.occupants = prison.occupants.filter((id) => id !== entity.id);
    }
    entity.prisonBuildingId = undefined;
    entity.prisonerUntilTick = undefined;
    entity.prisonSentenceCrime = undefined;
    entity.flash = 8;
    const name = entity.name ? `${entity.name}${entity.surname ? ` ${entity.surname}` : ''}` : 'A settler';
    logEvent(state, 'event', `${name} was released from prison`, name);
    addFloatingText(state, entity.x, entity.y - 18, 'Released', '#22c55e');
    released = true;
  }
  if (released) {
    assignMissingResidences(
      state.entities.filter((e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e)),
      state.buildings,
      state.entities,
    );
  }
}


