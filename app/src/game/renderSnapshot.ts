import { BuildingType, type Building, type Camera, type Entity, type WorldState } from './gameTypes';
import { getHourOfDay } from './dayCycle';
import { loadJuiceEffectsEnabled } from './preferences';
import type { ViewState } from './viewState';
import { resolveBuilding, resolveEntity } from './viewState';

/** Read-only bundle for the canvas renderer — simulation rules must not mutate this. */
export interface RenderSnapshot {
  readonly entities: Entity[];
  readonly buildings: Building[];
  readonly deathParticles: WorldState['deathParticles'];
  readonly floatingTexts: WorldState['floatingTexts'];
  readonly tick: number;
  readonly hourOfDay: number;
  readonly season: WorldState['season'];
  readonly year: number;
  readonly dayInYear: number;
  readonly width: number;
  readonly height: number;
  readonly weather: WorldState['weather'];
  readonly worldMap: WorldState['worldMap'];
  readonly disasters: WorldState['disasters'];
  readonly camera: Camera;
  readonly screenShake: number;
  readonly selectedEntity: Entity | null;
  readonly selectedBuilding: Building | null;
  readonly hoveredBuilding: Building | null;
  readonly buildMode: BuildingType | null;
  readonly buildGhost: ViewState['buildGhost'];
  readonly buildRotation: ViewState['buildRotation'];
  readonly showGrid: boolean;
  readonly showPaths: boolean;
  readonly festival: WorldState['festival'];
  readonly visitorGroups: WorldState['visitorGroups'];
  readonly rivalSettlements: WorldState['rivalSettlements'];
  readonly highlightedCampKey: string | null;
  readonly ecosystemHealth: number;
  readonly pollutionLevel: number;
  readonly renffrOmen: WorldState['renffrOmen'];
  readonly unlockedTechs: readonly string[];
  readonly hasBlacksmith: boolean;
  readonly villageForge: WorldState['villageForge'];
  readonly villageLeaderId: number | null;
  readonly pendingRaidEvents: WorldState['pendingRaidEvents'];
  readonly juiceEffectsEnabled: boolean;
}

export function buildRenderSnapshot(world: WorldState, view: ViewState): RenderSnapshot {
  return {
    entities: world.entities,
    buildings: world.buildings,
    deathParticles: world.deathParticles,
    floatingTexts: world.floatingTexts,
    tick: world.tick,
    hourOfDay: getHourOfDay(world.tick),
    season: world.season,
    year: world.year,
    dayInYear: world.dayInYear,
    width: world.width,
    height: world.height,
    weather: world.weather,
    worldMap: world.worldMap,
    disasters: world.disasters,
    camera: view.camera,
    screenShake: view.screenShake,
    selectedEntity: resolveEntity(world, view.selectedEntityId),
    selectedBuilding: resolveBuilding(world, view.selectedBuildingId),
    hoveredBuilding: resolveBuilding(world, view.hoveredBuildingId),
    buildMode: view.buildMode,
    buildGhost: view.buildGhost,
    buildRotation: view.buildRotation,
    showGrid: view.showGrid,
    showPaths: view.showPaths,
    festival: world.festival,
    visitorGroups: world.visitorGroups,
    rivalSettlements: world.rivalSettlements,
    highlightedCampKey: view.highlightedCampKey,
    ecosystemHealth: world.ecosystemHealth,
    pollutionLevel: world.pollutionLevel,
    renffrOmen: world.renffrOmen ?? null,
    unlockedTechs: world.unlockedTechs,
    hasBlacksmith: world.buildings.some((b) => b.completed && b.type === BuildingType.Blacksmith),
    villageForge: world.villageForge,
    villageLeaderId: world.villageLeaderId,
    pendingRaidEvents: world.pendingRaidEvents ?? [],
    juiceEffectsEnabled: loadJuiceEffectsEnabled(),
  };
}