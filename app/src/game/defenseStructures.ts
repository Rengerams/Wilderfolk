import { BuildingType, JobType } from './gameTypes';
import type { Building, WorldState } from './gameTypes';
import { MILITIA_BALANCE } from './militiaBalance';

const WALL_TYPES = new Set<BuildingType>([
  BuildingType.Wall,
  BuildingType.WallCorner,
  BuildingType.WallGate,
]);

export function isWallBuildingType(type: BuildingType): boolean {
  return WALL_TYPES.has(type);
}

export function countCompletedDefenseBuildings(
  buildings: Building[],
  types: BuildingType | BuildingType[],
): number {
  const wanted = Array.isArray(types) ? new Set(types) : new Set([types]);
  return buildings.filter(
    (b) => b.completed && b.faction !== 'rival' && wanted.has(b.type),
  ).length;
}

export function getWallSegmentBonus(buildings: Building[]): number {
  const segments = countCompletedDefenseBuildings(buildings, [
    BuildingType.Wall,
    BuildingType.WallCorner,
    BuildingType.WallGate,
  ]);
  return Math.min(72, segments * 8);
}

export function getWatchtowerBonus(buildings: Building[]): number {
  return countCompletedDefenseBuildings(buildings, BuildingType.Watchtower) * 15;
}

export function getBarracksGuardCount(state: WorldState, buildings: Building[]): number {
  let guards = 0;
  for (const b of buildings) {
    if (!b.completed || b.type !== BuildingType.Barracks || b.faction === 'rival') continue;
    for (const humanId of b.occupants) {
      const human = state.entities.find((e) => e.id === humanId && e.alive);
      if (human && human.job === JobType.Guard) guards += 1;
    }
  }
  return guards;
}

export function getBarracksGuardBonus(state: WorldState, buildings: Building[]): number {
  return getBarracksGuardCount(state, buildings) * MILITIA_BALANCE.guardBonusPerGuard;
}

export function getDefenseStructureBreakdown(state: WorldState, buildings: Building[]): string[] {
  const lines: string[] = [];
  const walls = countCompletedDefenseBuildings(buildings, [
    BuildingType.Wall,
    BuildingType.WallCorner,
    BuildingType.WallGate,
  ]);
  const wallBonus = getWallSegmentBonus(buildings);
  if (walls > 0) {
    lines.push(`+ ${wallBonus} wall segments (${walls} built, max +72)`);
  }
  const towers = countCompletedDefenseBuildings(buildings, BuildingType.Watchtower);
  const towerBonus = getWatchtowerBonus(buildings);
  if (towers > 0) {
    lines.push(`+ ${towerBonus} watchtowers (${towers})`);
  }
  const guards = getBarracksGuardCount(state, buildings);
  const guardBonus = getBarracksGuardBonus(state, buildings);
  if (guards > 0) {
    lines.push(`+ ${guardBonus} barracks guards (${guards} staffed)`);
  }
  return lines;
}

export function isBarracksGuard(_humanId: number, homeBuildingId: number | null | undefined, buildings: Building[]): boolean {
  if (homeBuildingId == null) return false;
  const workplace = buildings.find((b) => b.id === homeBuildingId);
  return !!workplace?.completed && workplace.type === BuildingType.Barracks;
}