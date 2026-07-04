import type { Building, BuildingType, Camera, Entity, WorldState } from './gameTypes';

export interface ViewState {
  camera: Camera;
  screenShake: number;
  selectedEntityId: number | null;
  selectedBuildingId: number | null;
  hoveredBuildingId: number | null;
  buildMode: BuildingType | null;
  buildGhost: { x: number; y: number; valid: boolean } | null;
  /** Placement rotation for rotatable build types (Road, Wall, Wall Gate). */
  buildRotation: 0 | 90;
  showGrid: boolean;
  showPaths: boolean;
  showTechTree: boolean;
  /** Camp marker highlight — `rival:<id>` or `visitor:<id>`. */
  highlightedCampKey: string | null;
  /** Selected visitor/rival camp for diplomacy inspector. */
  selectedCampKey: string | null;
}

export function createInitialView(width: number, height: number, zoom = 1.45): ViewState {
  const cx = width / 2;
  const cy = height / 2;
  return {
    camera: { x: cx, y: cy, zoom, targetX: cx, targetY: cy, targetZoom: zoom },
    screenShake: 0,
    selectedEntityId: null,
    selectedBuildingId: null,
    hoveredBuildingId: null,
    buildMode: null,
    buildGhost: null,
    buildRotation: 0,
    showGrid: true,
    showPaths: false,
    showTechTree: false,
    highlightedCampKey: null,
    selectedCampKey: null,
  };
}

/** Restore view from a saved game payload (backward compatible with v2.0/2.1 saves). */
export function createViewFromSave(
  data: Record<string, unknown>,
  world: WorldState
): ViewState {
  const w = (data.width as number) ?? world.width;
  const h = (data.height as number) ?? world.height;
  const base = createInitialView(w, h);
  const camera = data.camera as Camera | undefined;
  const selectedEntity = data.selectedEntity as Entity | null | undefined;
  const selectedBuilding = data.selectedBuilding as Building | null | undefined;
  const hoveredBuilding = data.hoveredBuilding as Building | null | undefined;

  return {
    ...base,
    camera: camera
      ? {
          ...camera,
          x: camera.targetX ?? camera.x,
          y: camera.targetY ?? camera.y,
        }
      : base.camera,
    selectedEntityId: selectedEntity?.id ?? null,
    selectedBuildingId: selectedBuilding?.id ?? null,
    hoveredBuildingId: hoveredBuilding?.id ?? null,
    buildMode: (data.buildMode as BuildingType | null) ?? null,
    buildGhost: (data.buildGhost as ViewState['buildGhost']) ?? null,
    buildRotation: (data.buildRotation as 0 | 90) === 90 ? 90 : 0,
    showGrid: (data.showGrid as boolean) ?? true,
    showPaths: (data.showPaths as boolean) ?? false,
    showTechTree: false,
    highlightedCampKey: null,
    selectedCampKey: null,
  };
}

export function resolveEntity(world: WorldState, id: number | null): Entity | null {
  if (id == null) return null;
  return world.entities.find((e) => e.id === id) ?? null;
}

export function resolveBuilding(world: WorldState, id: number | null): Building | null {
  if (id == null) return null;
  return world.buildings.find((b) => b.id === id) ?? null;
}

/** Merge world + view into a serializable save payload. */
export function mergeForSave(world: WorldState, view: ViewState): Record<string, unknown> {
  return {
    ...world,
    worldMap: world.worldMap,
    camera: {
      ...view.camera,
      x: view.camera.targetX,
      y: view.camera.targetY,
      targetX: view.camera.targetX,
      targetY: view.camera.targetY,
      targetZoom: view.camera.targetZoom,
    },
    selectedEntity: resolveEntity(world, view.selectedEntityId),
    selectedBuilding: resolveBuilding(world, view.selectedBuildingId),
    hoveredBuilding: null,
    buildMode: view.buildMode,
    buildGhost: null,
    showGrid: view.showGrid,
    showPaths: view.showPaths,
    showTechTree: view.showTechTree,
    screenShake: 0,
    deathParticles: [],
    floatingTexts: [],
    notifications: [],
    disasters: [],
    activeEvent: null,
    paused: true,
  };
}

const CAMERA_LERP = 0.12;

export function updateView(view: ViewState, dtMs: number): ViewState {
  const t = 1 - Math.pow(1 - CAMERA_LERP, dtMs / 16.67);
  const cam = view.camera;
  const nextCamera: Camera = {
    ...cam,
    x: cam.x + (cam.targetX - cam.x) * t,
    y: cam.y + (cam.targetY - cam.y) * t,
    zoom: cam.zoom + (cam.targetZoom - cam.zoom) * t,
  };
  const nextShake = view.screenShake > 0.05 ? view.screenShake * Math.pow(0.9, dtMs / 16.67) : 0;
  if (
    nextCamera.x === cam.x &&
    nextCamera.y === cam.y &&
    nextCamera.zoom === cam.zoom &&
    nextShake === view.screenShake
  ) {
    return view;
  }
  return { ...view, camera: nextCamera, screenShake: nextShake };
}

export function clampCameraTarget(cam: Camera, worldW: number, worldH: number): void {
  const marginX = worldW * 0.02;
  const marginY = worldH * 0.02;
  cam.targetX = Math.max(-marginX, Math.min(worldW + marginX, cam.targetX));
  cam.targetY = Math.max(-marginY, Math.min(worldH + marginY, cam.targetY));
}

export function moveCameraView(view: ViewState, world: WorldState, dx: number, dy: number): ViewState {
  const cam = { ...view.camera };
  cam.targetX += dx / cam.zoom;
  cam.targetY += dy / cam.zoom;
  clampCameraTarget(cam, world.width, world.height);
  return { ...view, camera: cam };
}

export function zoomCameraView(view: ViewState, factor: number): ViewState {
  const cam = { ...view.camera };
  cam.targetZoom = Math.max(0.5, Math.min(3, cam.targetZoom * factor));
  return { ...view, camera: cam };
}

/** Pan camera to a world position (e.g. center on settlers with H). */
export function focusCameraOn(view: ViewState, x: number, y: number, zoom?: number): ViewState {
  const cam = { ...view.camera, targetX: x, targetY: y };
  if (zoom !== undefined) cam.targetZoom = Math.max(0.5, Math.min(3, zoom));
  return { ...view, camera: cam };
}

/** Gentle pan toward a map click target — keeps context, unlike full focusCameraOn. */
export function nudgeCameraToward(
  view: ViewState,
  world: WorldState,
  x: number,
  y: number,
  strength = 0.28,
): ViewState {
  const cam = { ...view.camera };
  cam.targetX += (x - cam.targetX) * strength;
  cam.targetY += (y - cam.targetY) * strength;
  if (cam.targetZoom < 1.15) {
    cam.targetZoom = Math.min(1.15, cam.targetZoom + 0.04);
  }
  clampCameraTarget(cam, world.width, world.height);
  return { ...view, camera: cam };
}

export function syncScreenShakeFromWorld(view: ViewState, world: WorldState): ViewState {
  if (world.screenShakeImpulse <= view.screenShake) return view;
  return { ...view, screenShake: world.screenShakeImpulse };
}

export function clearScreenShakeImpulse(world: WorldState): void {
  world.screenShakeImpulse = 0;
}