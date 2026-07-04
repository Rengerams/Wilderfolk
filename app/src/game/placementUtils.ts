import { type BuildingRotation, getBuildingFootprintForType } from './buildingRotation';
import { BUILDING_CONFIGS, BuildingType, TerrainType, type Building } from './gameTypes';
import type { RenderSnapshot } from './renderSnapshot';

const UNBUILDABLE_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
  TerrainType.RiverBank,
  TerrainType.Mountains,
  TerrainType.Snow,
]);

const WATER_TERRAIN = new Set<TerrainType>([
  TerrainType.DeepWater,
  TerrainType.ShallowWater,
  TerrainType.River,
]);

export function isUnbuildableTerrainType(type: TerrainType): boolean {
  return UNBUILDABLE_TERRAIN.has(type);
}

export function isWaterTerrainType(type: TerrainType): boolean {
  return WATER_TERRAIN.has(type);
}

function isFootprintOnBuildableTerrain(
  snapshot: Pick<RenderSnapshot, 'worldMap'>,
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  if (!snapshot.worldMap) return false;
  const left = x - width / 2;
  const right = x + width / 2;
  const top = y - height / 2;
  const bottom = y + height / 2;
  const startTx = Math.floor(left / 10);
  const endTx = Math.floor(right / 10);
  const startTy = Math.floor(top / 10);
  const endTy = Math.floor(bottom / 10);

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const tile = snapshot.worldMap.tiles[ty]?.[tx];
      if (!tile || UNBUILDABLE_TERRAIN.has(tile.type)) return false;
    }
  }
  return true;
}

function isFootprintWithinMapBounds(
  width: number,
  height: number,
  x: number,
  y: number,
  mapWidth: number,
  mapHeight: number,
): boolean {
  return (
    x - width / 2 >= 0
    && y - height / 2 >= 0
    && x + width / 2 <= mapWidth
    && y + height / 2 <= mapHeight
  );
}

function overlapsExistingBuilding(
  buildings: readonly Building[],
  width: number,
  height: number,
  x: number,
  y: number,
): boolean {
  for (const b of buildings) {
    if (
      x + width / 2 > b.x - b.width / 2
      && x - width / 2 < b.x + b.width / 2
      && y + height / 2 > b.y - b.height / 2
      && y - height / 2 < b.y + b.height / 2
    ) {
      return true;
    }
  }
  return false;
}

/** Read-only placement check for the renderer (matches gameEngine rules). */
export function canPlaceBuildingSnapshot(
  snapshot: RenderSnapshot,
  type: BuildingType,
  x: number,
  y: number,
  rotation: BuildingRotation = 0,
): boolean {
  const config = BUILDING_CONFIGS[type];
  const { width, height } = getBuildingFootprintForType(type, rotation);
  if (!isFootprintWithinMapBounds(width, height, x, y, snapshot.width, snapshot.height)) return false;
  if (config.unlockRequirement && !snapshot.unlockedTechs.includes(config.unlockRequirement)) return false;
  if (!isFootprintOnBuildableTerrain(snapshot, width, height, x, y)) return false;
  if (overlapsExistingBuilding(snapshot.buildings, width, height, x, y)) return false;
  return true;
}