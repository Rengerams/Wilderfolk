import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import type { Entity } from '@/game/gameTypes';
import { EntityType } from '@/game/gameTypes';
import { createEntity } from '@/game/worldGen';
import { buildMobileGrid } from '@/game/spatialGrid';
import {
  buildGrassPopulationSnapshot,
  buildResidenceOccupantIndex,
  buildWildlifePopulationSnapshot,
  findClosestEntityInRadius,
  forEachEntityInRadius,
  getHousemates,
  grassPopulationTotal,
  recordGrassBirth,
  recordWildlifeBirth,
  wildlifeTypePopulation,
} from '@/game/tickQueries';
import {
  getCurrentTickMetrics,
  resetSpatialQuerySession,
  setSpatialQueryMetricsEnabled,
} from '@/game/spatialQueryMetrics';

function grassByType(entities: Entity[]): Record<EntityType, Entity[]> {
  return Object.fromEntries(
    Object.values(EntityType).map((type) => [type, type === EntityType.Grass ? entities : []]),
  ) as Record<EntityType, Entity[]>;
}

function wildlifeByType(type: EntityType, entities: Entity[]): Record<EntityType, Entity[]> {
  return Object.fromEntries(
    Object.values(EntityType).map((t) => [t, t === type ? entities : []]),
  ) as Record<EntityType, Entity[]>;
}

describe('tickQueries population snapshots', () => {
  it('recordGrassBirth skips absorbed newEntities ids but counts fresh births', () => {
    const existing = createEntity(EntityType.Grass, 10, 10, 1, 80);
    const fromHumansTick = createEntity(EntityType.Grass, 20, 20, 2, 80);
    const snapshot = buildGrassPopulationSnapshot(grassByType([existing]), [fromHumansTick]);
    expect(grassPopulationTotal(snapshot)).toBe(2);
    expect(snapshot.absorbedEntityIds.has(fromHumansTick.id)).toBe(true);

    recordGrassBirth(snapshot, fromHumansTick.id);
    expect(grassPopulationTotal(snapshot)).toBe(2);

    recordGrassBirth(snapshot);
    expect(grassPopulationTotal(snapshot)).toBe(3);
    expect(snapshot.baselineAlive).toBe(2);
    expect(snapshot.bornAfterSnapshot).toBe(1);
  });

  it('recordWildlifeBirth skips absorbed newEntities ids but counts fresh births', () => {
    const deer = createEntity(EntityType.Deer, 50, 50, 1, 200);
    const newborn = createEntity(EntityType.Deer, 60, 60, 2, 200);
    const snapshot = buildWildlifePopulationSnapshot(
      wildlifeByType(EntityType.Deer, [deer]),
      [newborn],
      new Map([[newborn.id, deer.id]]),
    );

    expect(snapshot.aliveByType.get(EntityType.Deer)).toBe(2);
    expect(snapshot.newByType.get(EntityType.Deer) ?? 0).toBe(0);
    expect(snapshot.newSpawnedByParent.get(deer.id)).toBe(1);
    expect(snapshot.absorbedEntityIds.has(newborn.id)).toBe(true);

    recordWildlifeBirth(snapshot, EntityType.Deer, deer.id, newborn.id);
    expect(snapshot.aliveByType.get(EntityType.Deer)).toBe(2);
    expect(snapshot.newByType.get(EntityType.Deer) ?? 0).toBe(0);
    expect(snapshot.newSpawnedByParent.get(deer.id)).toBe(1);

    recordWildlifeBirth(snapshot, EntityType.Deer, deer.id);
    expect(snapshot.aliveByType.get(EntityType.Deer)).toBe(2);
    expect(snapshot.newByType.get(EntityType.Deer)).toBe(1);
    expect(snapshot.newSpawnedByParent.get(deer.id)).toBe(2);
    expect(wildlifeTypePopulation(snapshot, EntityType.Deer, deer.id)).toBe(1);
  });
});

describe('tickQueries getHousemates', () => {
  it('returns empty for non-human entities even with residenceBuildingId', () => {
    const buildingId = 99;
    const tamedWolf = createEntity(EntityType.Wolf, 10, 10, 1, 200);
    tamedWolf.residenceBuildingId = buildingId;

    const human = createEntity(EntityType.Human, 20, 20, 2, 250);
    human.residenceBuildingId = buildingId;

    const index = buildResidenceOccupantIndex([human]);
    expect(getHousemates(tamedWolf, index)).toEqual([]);
  });

  it('returns other alive player humans sharing the residence', () => {
    const buildingId = 42;
    const self = createEntity(EntityType.Human, 10, 10, 1, 250);
    self.residenceBuildingId = buildingId;

    const mate = createEntity(EntityType.Human, 12, 12, 2, 250);
    mate.residenceBuildingId = buildingId;

    const visitor = createEntity(EntityType.Human, 14, 14, 3, 250);
    visitor.residenceBuildingId = buildingId;
    visitor.faction = 'visitor';

    const index = buildResidenceOccupantIndex([self, mate, visitor]);
    expect(getHousemates(self, index).map((h) => h.id)).toEqual([mate.id]);
  });
});

describe('tickQueries spatial query metrics parity', () => {
  beforeEach(() => {
    setSpatialQueryMetricsEnabled(true);
    resetSpatialQuerySession();
  });

  afterEach(() => {
    setSpatialQueryMetricsEnabled(false);
  });

  it('findClosestEntityInRadius grid and fallback record the same predicate-passing candidates', () => {
    const nearWolf = createEntity(EntityType.Wolf, 105, 100, 1, 200);
    const farWolf = createEntity(EntityType.Wolf, 130, 100, 2, 200);
    const deer = createEntity(EntityType.Deer, 110, 100, 3, 200);
    const entities = [nearWolf, farWolf, deer];
    const grid = buildMobileGrid(400, 400, entities);
    const predicate = (entity: Entity) => entity.type === EntityType.Wolf;

    findClosestEntityInRadius(grid, 100, 100, 50, predicate, 'hunt');
    const gridCandidates = getCurrentTickMetrics().hunt.candidates;

    resetSpatialQuerySession();
    findClosestEntityInRadius(undefined, 100, 100, 50, predicate, 'hunt', entities);
    const fallbackCandidates = getCurrentTickMetrics().hunt.candidates;

    expect(gridCandidates).toBe(2);
    expect(fallbackCandidates).toBe(gridCandidates);
  });

  it('forEachEntityInRadius grid and fallback record the same narrow-phase candidates', () => {
    const inRadius = createEntity(EntityType.Rabbit, 108, 100, 1, 200);
    const outOfRadius = createEntity(EntityType.Rabbit, 200, 100, 2, 200);
    const entities = [inRadius, outOfRadius];
    const grid = buildMobileGrid(400, 400, entities);

    forEachEntityInRadius(grid, 100, 100, 20, () => {}, 'flee');
    const gridCandidates = getCurrentTickMetrics().flee.candidates;

    resetSpatialQuerySession();
    forEachEntityInRadius(undefined, 100, 100, 20, () => {}, 'flee', entities);
    const fallbackCandidates = getCurrentTickMetrics().flee.candidates;

    expect(gridCandidates).toBe(1);
    expect(fallbackCandidates).toBe(gridCandidates);
  });
});