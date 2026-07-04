import { BUILDING_CONFIGS, BuildingType, type Building, type BuildingConfig } from './gameTypes';

/** Degrees — only 0 (horizontal) and 90 (vertical) supported. */
export type BuildingRotation = 0 | 90;

const ROTATABLE = new Set<BuildingType>([
  BuildingType.Road,
  BuildingType.Wall,
  BuildingType.WallGate,
]);

export function isRotatableBuildingType(type: BuildingType): boolean {
  return ROTATABLE.has(type);
}

export function normalizeBuildingRotation(rotation: unknown): BuildingRotation {
  return rotation === 90 ? 90 : 0;
}

export function toggleBuildingRotation(rotation: BuildingRotation): BuildingRotation {
  return rotation === 0 ? 90 : 0;
}

export function getBuildingFootprint(
  config: Pick<BuildingConfig, 'width' | 'height'>,
  rotation: BuildingRotation,
): { width: number; height: number } {
  if (rotation === 90) {
    return { width: config.height, height: config.width };
  }
  return { width: config.width, height: config.height };
}

export function getBuildingFootprintForType(
  type: BuildingType,
  rotation: BuildingRotation,
): { width: number; height: number } {
  return getBuildingFootprint(BUILDING_CONFIGS[type], rotation);
}

export function isEntityOnBuilding(entityX: number, entityY: number, building: Building, margin = 12): boolean {
  return (
    Math.abs(building.x - entityX) < building.width / 2 + margin
    && Math.abs(building.y - entityY) < building.height / 2 + margin
  );
}