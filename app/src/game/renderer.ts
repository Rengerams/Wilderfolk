import type { Camera, Entity } from './gameEngine';
import type { RenderSnapshot } from './renderSnapshot';
import { EntityType, BuildingType, Season, WeatherType, SPECIES_CONFIG, BUILDING_CONFIGS, GRID_SIZE, snapToGrid, TerrainType } from './gameEngine';
import { getBuildingFootprintForType, normalizeBuildingRotation } from './buildingRotation';
import { getNightGlowIntensity, NIGHT_HOME_GLOW_TYPES } from './juiceEffects';
import { canPlaceBuildingSnapshot, isUnbuildableTerrainType, isWaterTerrainType } from './placementUtils';
import { getSpriteFrame, type SpriteFrame } from './spriteLoader';
import {
  drawPioneerAt, getHumanSpriteMetrics, getHumanSpritePath,
  getHumanWalkBob, getHumanWalkFrameIndex,
  HUMAN_BASE_SPRITES,
} from './humanSprites';
import { ANIMAL_SPRITE_ANCHOR_Y, getAnimalSpriteMetrics } from './entitySprites';
import { getAnimatedChatDots } from './humanChat';
import { isNightHour, isWorkHour, shouldBeAtHome } from './dayCycle';
import { drawRenffrOmen } from './renffrStar';
import { getHumanStatusCombatIcon, isPredatorType } from './combat';
import { getPlayerCampCenter } from './frontierCombat';

function isSnowGround(state: RenderSnapshot): boolean {
  return state.season === Season.Winter;
}

// ============ TERRAIN COLOR PALETTE ============
const TERRAIN_COLORS: Record<TerrainType, number> = {
  [TerrainType.DeepWater]:    0x1c3a6e,
  [TerrainType.ShallowWater]: 0x2a588c,
  [TerrainType.River]:        0x3264a0,
  [TerrainType.RiverBank]:    0x52733e,
  [TerrainType.Beach]:        0xc2b280,
  [TerrainType.Grassland]:    0x5e7a3a,
  [TerrainType.Forest]:       0x3a5c2a,
  [TerrainType.DarkForest]:   0x223a1c,
  [TerrainType.Hills]:        0x76663e,
  [TerrainType.Mountains]:    0x524e48,
  [TerrainType.Rocky]:        0x625c52,
  [TerrainType.Snow]:         0xd2dae1,
};

const SEASON_MODS: Record<Season, Partial<Record<TerrainType, number>>> = {
  [Season.Spring]: { [TerrainType.Grassland]: 0x6e8a4a, [TerrainType.Forest]: 0x4a6c3a },
  [Season.Summer]: { [TerrainType.Grassland]: 0x5e8a2a, [TerrainType.Forest]: 0x3a5c1a },
  [Season.Fall]:   { [TerrainType.Grassland]: 0x8e7a2a, [TerrainType.Forest]: 0x6a4c1a, [TerrainType.DarkForest]: 0x5a3a0a, [TerrainType.Hills]: 0x86663a },
  [Season.Winter]: { [TerrainType.Grassland]: 0x7e8a6a, [TerrainType.Forest]: 0x6a7a5a, [TerrainType.Hills]: 0x8e8a7a, [TerrainType.DarkForest]: 0x5a6a4a },
};

// ============ TERRAIN CACHE ============
let terrainCache: { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D; width: number; height: number; seed: number; preset: string; season: Season } | null = null;

function getTerrainColor(type: TerrainType, season: Season, variation: number): string {
  const hex = SEASON_MODS[season]?.[type] || TERRAIN_COLORS[type] || TERRAIN_COLORS[TerrainType.Grassland];
  const r = (hex >> 16) & 0xff;
  const g = (hex >> 8) & 0xff;
  const b = hex & 0xff;
  const v = (variation - 0.5) * 10;
  return `rgb(${Math.min(255,Math.max(0,r+v))|0},${Math.min(255,Math.max(0,g+v))|0},${Math.min(255,Math.max(0,b+v))|0})`;
}

function buildTerrainCache(state: RenderSnapshot) {
  if (!state.worldMap) return;
  const map = state.worldMap;
  const tileW = Math.ceil(map.width / 10);
  const tileH = Math.ceil(map.height / 10);
  const needRebuild = !terrainCache || terrainCache.width !== tileW || terrainCache.height !== tileH || terrainCache.seed !== map.seed || terrainCache.preset !== map.preset || terrainCache.season !== state.season;
  if (!needRebuild) return;

  const canvas = document.createElement('canvas');
  canvas.width = tileW;
  canvas.height = tileH;
  const ctx = canvas.getContext('2d')!;

  for (let ty = 0; ty < tileH; ty++) {
    for (let tx = 0; tx < tileW; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile) continue;
      ctx.fillStyle = getTerrainColor(tile.type, state.season, tile.variation);
      ctx.fillRect(tx, ty, 1, 1);
    }
  }

  terrainCache = { canvas, ctx, width: tileW, height: tileH, seed: map.seed, preset: map.preset, season: state.season };
}

// ============ CACHED SORTED ENTITY LISTS ============
let _cachedEntityTick = -1;
let _cachedTrees: Entity[] = [];
let _cachedAnimals: Entity[] = [];
let _cachedHumans: Entity[] = [];
let _cachedGrass: Entity[] = [];

function updateCachedEntities(entities: Entity[], tick: number) {
  if (tick === _cachedEntityTick) return;
  _cachedEntityTick = tick;
  const alive = entities.filter(e => e.alive);
  _cachedTrees = alive.filter(e => e.type === EntityType.Tree).sort((a, b) => a.y - b.y);
  _cachedGrass = alive.filter(e => e.type === EntityType.Grass);
  _cachedAnimals = alive.filter(e => e.type !== EntityType.Grass && e.type !== EntityType.Tree && e.type !== EntityType.Human).sort((a, b) => a.y - b.y);
  _cachedHumans = alive.filter(e => e.type === EntityType.Human).sort((a, b) => a.y - b.y);
}

// ============ CACHED NAME WIDTHS ============
const _nameWidthCache = new Map<string, number>();

// ============ HELPERS ============
let _time = 0;
function w2s(x: number, y: number, cam: Camera, cw: number, ch: number): [number, number] {
  return [(x - cam.x) * cam.zoom + cw / 2, (y - cam.y) * cam.zoom + ch / 2];
}

function s2w(sx: number, sy: number, cam: Camera, cw: number, ch: number): [number, number] {
  return [(sx - cw / 2) / cam.zoom + cam.x, (sy - ch / 2) / cam.zoom + cam.y];
}

interface SpriteMotion {
  bobY?: number;
  scaleX?: number;
  scaleY?: number;
}

function drawSpriteFrame(
  ctx: CanvasRenderingContext2D,
  frame: SpriteFrame,
  cx: number,
  cy: number,
  maxW: number,
  maxH: number,
  anchorX = 0.5,
  anchorY = 0.85,
  flipX = false,
  motion: SpriteMotion = {},
  fit: 'contain' | 'height' = 'contain',
  rotationDeg: 0 | 90 = 0,
) {
  const fitMaxW = rotationDeg === 90 ? maxH : maxW;
  const fitMaxH = rotationDeg === 90 ? maxW : maxH;
  const aspect = frame.sw / frame.sh;
  let dw = fitMaxW;
  let dh = fitMaxH;
  if (fit === 'height') {
    dh = fitMaxH;
    dw = dh * aspect;
    if (dw > fitMaxW) {
      dw = fitMaxW;
      dh = dw / aspect;
    }
  } else if (dw / dh > aspect) {
    dw = dh * aspect;
  } else {
    dh = dw / aspect;
  }

  const scaleX = motion.scaleX ?? 1;
  const scaleY = motion.scaleY ?? 1;
  dw = Math.max(1, Math.round(dw * scaleX));
  dh = Math.max(1, Math.round(dh * scaleY));
  const bobY = motion.bobY ?? 0;

  ctx.save();
  if (flipX) {
    ctx.translate(cx, 0);
    ctx.scale(-1, 1);
    ctx.translate(-cx, 0);
  }
  if (rotationDeg === 90) {
    ctx.translate(cx, cy);
    ctx.rotate(Math.PI / 2);
    ctx.drawImage(
      frame.image, frame.sx, frame.sy, frame.sw, frame.sh,
      Math.round(-dw * anchorX),
      Math.round(-dh * anchorY - bobY),
      dw, dh,
    );
  } else {
    const dx = Math.round(cx - dw * anchorX);
    const dy = Math.round(cy - dh * anchorY - bobY);
    ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, dx, dy, dw, dh);
  }
  ctx.restore();
}

function getHumanWalkMotion(human: Entity, camZoom: number, hasWalkFrame: boolean, walkFrame: number): SpriteMotion {
  const speed = Math.hypot(human.vx, human.vy);
  if (speed < 0.08) return {};
  if (hasWalkFrame) {
    return { bobY: getHumanWalkBob(walkFrame, speed, camZoom) };
  }
  const stride = Math.min(1, speed / 1.4);
  const phase = human.animFrame * 1.9 + human.id * 0.15;
  return { bobY: Math.abs(Math.sin(phase)) * stride * 2.8 * camZoom };
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

// ============ COLOR UTILITIES ============
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const n = parseInt(hex.replace('#', ''), 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${[r, g, b].map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('')}`;
}

function darkerColor(hex: string, factor = 0.35): string {
  const { r, g, b } = hexToRgb(hex);
  return rgbToHex(r * (1 - factor), g * (1 - factor), b * (1 - factor));
}

function applySeasonTint(hex: string, season: Season): string {
  const { r, g, b } = hexToRgb(hex);
  switch (season) {
    case Season.Spring: return rgbToHex(r * 1.05, g * 1.08, b * 0.95);
    case Season.Summer: return rgbToHex(r * 1.02, g * 1.05, b * 0.92);
    case Season.Fall:   return rgbToHex(r * 1.08, g * 0.95, b * 0.82);
    case Season.Winter: return rgbToHex(r * 0.82, g * 0.85, b * 0.95);
    default: return hex;
  }
}

function categoryBorderDash(category: string): number[] {
  switch (category) {
    case 'Housing': return [];
    case 'Food': return [4, 3];
    case 'Resources': return [2, 2];
    case 'Industry': return [6, 2, 2, 2];
    case 'Community': return [3, 3];
    case 'Infrastructure': return [1, 2];
    default: return [];
  }
}

function drawBuildingPad(
  ctx: CanvasRenderingContext2D,
  shape: 'round' | 'rect' | 'circle' | 'road',
  x: number, y: number, w: number, h: number,
  fillColor: string, borderColor: string, alpha: number,
  dash: number[], lineWidth: number
) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillColor;

  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  } else if (shape === 'road') {
    if (w >= h) {
      const padH = Math.max(4, h * 1.4);
      ctx.fillRect(x - w / 2, y - padH / 2, w, padH);
    } else {
      const padW = Math.max(4, w * 1.4);
      ctx.fillRect(x - padW / 2, y - h / 2, padW, h);
    }
  } else if (shape === 'rect') {
    ctx.fillRect(x - w / 2, y - h / 2, w, h);
  } else {
    const r = Math.min(w, h) * 0.18;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, r);
    ctx.fill();
  }

  // Border (colorblind-friendly secondary cue)
  ctx.globalAlpha = Math.min(1, alpha + 0.25);
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dash);

  if (shape === 'circle') {
    const r = Math.min(w, h) / 2;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (shape === 'road') {
    if (w >= h) {
      const padH = Math.max(4, h * 1.4);
      ctx.strokeRect(x - w / 2, y - padH / 2, w, padH);
    } else {
      const padW = Math.max(4, w * 1.4);
      ctx.strokeRect(x - padW / 2, y - h / 2, padW, h);
    }
  } else if (shape === 'rect') {
    ctx.strokeRect(x - w / 2, y - h / 2, w, h);
  } else {
    const r = Math.min(w, h) * 0.18;
    roundRect(ctx, x - w / 2, y - h / 2, w, h, r);
    ctx.stroke();
  }

  ctx.setLineDash([]);
  ctx.restore();
}

// ============ GROUND ============
function drawSimpleGreenGround(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  const worldW = state.width || 1200;
  const worldH = state.height || 900;

  const snow = isSnowGround(state);

  ctx.fillStyle = snow ? '#dbe4ec' : '#3f6f38';
  ctx.fillRect(0, 0, cw, ch);

  const [tlx, tly] = w2s(0, 0, cam, cw, ch);
  const [brx, bry] = w2s(worldW, worldH, cam, cw, ch);
  const mapW = brx - tlx;
  const mapH = bry - tly;

  ctx.fillStyle = snow ? '#ffffff' : '#72a85c';
  ctx.fillRect(tlx, tly, mapW, mapH);

  ctx.strokeStyle = snow ? 'rgba(100, 116, 139, 0.55)' : 'rgba(31, 56, 28, 0.45)';
  ctx.lineWidth = Math.max(2, 2 * cam.zoom);
  ctx.strokeRect(tlx, tly, mapW, mapH);

  if (!snow && state.season === Season.Fall) {
    ctx.fillStyle = 'rgba(180, 120, 40, 0.05)';
    ctx.fillRect(tlx, tly, mapW, mapH);
  }
}

function drawProceduralGround(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  const worldW = state.width || 1200;
  const worldH = state.height || 900;

  ctx.fillStyle = '#1a2e1a';
  ctx.fillRect(0, 0, cw, ch);

  if (state.worldMap && terrainCache) {
    const [sx0, sy0] = w2s(0, 0, cam, cw, ch);
    const drawTileSize = 10 * cam.zoom;
    ctx.drawImage(terrainCache.canvas, sx0, sy0, terrainCache.width * drawTileSize, terrainCache.height * drawTileSize);

    if (state.worldMap.rivers) {
      ctx.strokeStyle = 'rgba(55,115,180,0.7)';
      ctx.lineWidth = 3 * cam.zoom;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      for (const river of state.worldMap.rivers) {
        if (river.length < 2) continue;
        ctx.beginPath();
        const [rx0, ry0] = w2s(river[0].x, river[0].y, cam, cw, ch);
        ctx.moveTo(rx0, ry0);
        for (let i = 1; i < river.length; i++) {
          const [rx, ry] = w2s(river[i].x, river[i].y, cam, cw, ch);
          ctx.lineTo(rx, ry);
        }
        ctx.stroke();
      }
    }

    const [tlx, tly] = w2s(0, 0, cam, cw, ch);
    const [brx, bry] = w2s(worldW, worldH, cam, cw, ch);
    ctx.strokeStyle = 'rgba(0,0,0,0.3)';
    ctx.lineWidth = 2;
    ctx.strokeRect(tlx, tly, brx - tlx, bry - tly);
  }

  if (state.season === Season.Winter) {
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.fillRect(0, 0, cw, ch);
  }
}

function drawGround(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.worldMap) {
    buildTerrainCache(state);
    drawProceduralGround(ctx, state, cw, ch);
    return;
  }
  // Fallback if terrain missing (should not happen in normal play)
  drawSimpleGreenGround(ctx, state, cw, ch);
}

// ============ GRID ============
const GRID_MAJOR_EVERY = 5;

interface GridViewport {
  sx0: number;
  ex: number;
  sy0: number;
  ey: number;
  mx0: number;
  my0: number;
}

function getGridViewport(cam: RenderSnapshot['camera'], cw: number, ch: number): GridViewport {
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const wl = cam.x - (cw / 2) / cam.zoom;
  const wr = cam.x + (cw / 2) / cam.zoom;
  const wt = cam.y - (ch / 2) / cam.zoom;
  const wb = cam.y + (ch / 2) / cam.zoom;
  return {
    sx0: Math.floor(wl / gs) * gs,
    ex: Math.ceil(wr / gs) * gs,
    sy0: Math.floor(wt / gs) * gs,
    ey: Math.ceil(wb / gs) * gs,
    mx0: Math.floor(wl / majorGs) * majorGs,
    my0: Math.floor(wt / majorGs) * majorGs,
  };
}

function worldToScreenX(wx: number, cam: RenderSnapshot['camera'], cw: number): number {
  return (wx - cam.x) * cam.zoom + cw / 2;
}

function worldToScreenY(wy: number, cam: RenderSnapshot['camera'], ch: number): number {
  return (wy - cam.y) * cam.zoom + ch / 2;
}

function strokeGridLines(
  ctx: CanvasRenderingContext2D,
  vp: GridViewport,
  cam: RenderSnapshot['camera'],
  cw: number,
  ch: number,
  step: number,
  skipMajor: boolean,
  color: string,
  shadowColor: string,
  lineWidth: number,
  whiteOutline = 0,
) {
  const gs = GRID_SIZE;
  const drawPass = (stroke: string, width: number, offsetX = 0, offsetY = 0) => {
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.beginPath();
    for (let x = vp.sx0; x <= vp.ex; x += step) {
      if (skipMajor && Math.round(x / gs) % GRID_MAJOR_EVERY === 0) continue;
      const px = worldToScreenX(x, cam, cw) + offsetX;
      ctx.moveTo(px, 0);
      ctx.lineTo(px, ch);
    }
    for (let y = vp.sy0; y <= vp.ey; y += step) {
      if (skipMajor && Math.round(y / gs) % GRID_MAJOR_EVERY === 0) continue;
      const py = worldToScreenY(y, cam, ch) + offsetY;
      ctx.moveTo(0, py);
      ctx.lineTo(cw, py);
    }
    ctx.stroke();
  };

  if (whiteOutline > 0) {
    drawPass(`rgba(255, 255, 255, ${whiteOutline})`, lineWidth + 2.2);
    drawPass(`rgba(255, 255, 255, ${whiteOutline * 0.55})`, lineWidth + 1.1);
  }
  drawPass(shadowColor, lineWidth + 0.8, 0.5, 0.5);
  drawPass(color, lineWidth);
}

/** Terrain blockers + valid snap points while placing a building. */
function drawBuildZoneOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.buildMode || !state.worldMap) return;
  const cam = state.camera;
  const map = state.worldMap;
  const wl = cam.x - (cw / 2) / cam.zoom;
  const wr = cam.x + (cw / 2) / cam.zoom;
  const wt = cam.y - (ch / 2) / cam.zoom;
  const wb = cam.y + (ch / 2) / cam.zoom;

  const startTx = Math.max(0, Math.floor(wl / 10));
  const endTx = Math.min(map.width - 1, Math.ceil(wr / 10));
  const startTy = Math.max(0, Math.floor(wt / 10));
  const endTy = Math.min(map.height - 1, Math.ceil(wb / 10));

  for (let ty = startTy; ty <= endTy; ty++) {
    for (let tx = startTx; tx <= endTx; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile || !isUnbuildableTerrainType(tile.type)) continue;
      // Water is visible on terrain tiles — only highlight less obvious blockers.
      if (isWaterTerrainType(tile.type)) continue;
      const wx = tx * 10 + 5;
      const wy = ty * 10 + 5;
      const px = worldToScreenX(wx, cam, cw) - 5 * cam.zoom;
      const py = worldToScreenY(wy, cam, ch) - 5 * cam.zoom;
      const psz = 10 * cam.zoom;
      ctx.fillStyle = 'rgba(220, 38, 38, 0.28)';
      ctx.fillRect(px, py, psz, psz);
    }
  }

  if (cam.zoom < 0.35) return;

  const gs = GRID_SIZE;
  const step = cam.zoom < 0.7 ? gs * 2 : gs;
  const startX = Math.floor(wl / step) * step;
  const endX = Math.ceil(wr / step) * step;
  const startY = Math.floor(wt / step) * step;
  const endY = Math.ceil(wb / step) * step;
  const placeType = state.buildMode;

  for (let wx = startX; wx <= endX; wx += step) {
    for (let wy = startY; wy <= endY; wy += step) {
      const snapX = snapToGrid(wx, gs);
      const snapY = snapToGrid(wy, gs);
      if (snapX !== wx || snapY !== wy) continue;
      const valid = canPlaceBuildingSnapshot(state, placeType, snapX, snapY, state.buildRotation);
      const [px, py] = w2s(snapX, snapY, cam, cw, ch);
      const r = Math.max(2.5, 3.5 * cam.zoom);
      ctx.fillStyle = valid ? 'rgba(34, 197, 94, 0.75)' : 'rgba(248, 113, 113, 0.45)';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawGrid(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.showGrid || !state.buildMode) return;
  const cam = state.camera;
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const vp = getGridViewport(cam, cw, ch);

  // Validity checker on coarse cells while placing buildings
  if (cam.zoom >= 0.3 && state.buildMode) {
    for (let wx = vp.mx0; wx < vp.ex; wx += majorGs) {
      for (let wy = vp.my0; wy < vp.ey; wy += majorGs) {
        const cx = snapToGrid(wx + majorGs / 2, gs);
        const cy = snapToGrid(wy + majorGs / 2, gs);
        const px = worldToScreenX(wx, cam, cw);
        const py = worldToScreenY(wy, cam, ch);
        const psz = majorGs * cam.zoom;
        if (px + psz < 0 || px > cw || py + psz < 0 || py > ch) continue;
        const valid = canPlaceBuildingSnapshot(state, state.buildMode, cx, cy, state.buildRotation);
        ctx.fillStyle = valid ? 'rgba(16, 185, 129, 0.14)' : 'rgba(127, 29, 29, 0.18)';
        ctx.fillRect(px, py, psz, psz);
      }
    }
  }

  // Cell size hint when zoomed in during build
  if (cam.zoom >= 0.75) {
    ctx.font = `bold ${Math.max(8, Math.round(9 * cam.zoom))}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(6, 78, 59, 0.85)';
    const label = `${majorGs}u`;
    const lx = worldToScreenX(vp.mx0 + majorGs * 0.5, cam, cw);
    const ly = worldToScreenY(vp.my0 + majorGs * 0.5, cam, ch);
    if (lx > 20 && lx < cw - 20 && ly > 14 && ly < ch - 14) {
      ctx.fillText(label, lx, ly);
    }
  }

  // Build ghost — full building footprint
  if (state.buildMode && state.buildGhost) {
    const footprint = getBuildingFootprintForType(state.buildMode, state.buildRotation);
    const [gx, gy] = w2s(state.buildGhost.x, state.buildGhost.y, cam, cw, ch);
    const bw = footprint.width * cam.zoom;
    const bh = footprint.height * cam.zoom;
    const valid = state.buildGhost.valid;
    const x0 = gx - bw / 2;
    const y0 = gy - bh / 2;

    ctx.fillStyle = valid ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)';
    ctx.fillRect(x0, y0, bw, bh);

    ctx.setLineDash([Math.max(4, 6 / cam.zoom), Math.max(3, 4 / cam.zoom)]);
    ctx.strokeStyle = valid ? 'rgba(34, 197, 94, 0.85)' : 'rgba(239, 68, 68, 0.85)';
    ctx.lineWidth = Math.max(1.5, 2.2 / cam.zoom);
    ctx.strokeRect(x0, y0, bw, bh);
    ctx.setLineDash([]);

    // Inner cell lines for large footprints
    if (cam.zoom >= 0.5 && bw > gs * cam.zoom * 1.5) {
      ctx.strokeStyle = valid ? 'rgba(34, 197, 94, 0.25)' : 'rgba(239, 68, 68, 0.25)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      const left = state.buildGhost.x - footprint.width / 2;
      const right = state.buildGhost.x + footprint.width / 2;
      const top = state.buildGhost.y - footprint.height / 2;
      const bottom = state.buildGhost.y + footprint.height / 2;
      for (let wx = Math.ceil(left / gs) * gs; wx < right; wx += gs) {
        const px = (wx - cam.x) * cam.zoom + cw / 2;
        ctx.moveTo(px, y0);
        ctx.lineTo(px, y0 + bh);
      }
      for (let wy = Math.ceil(top / gs) * gs; wy < bottom; wy += gs) {
        const py = (wy - cam.y) * cam.zoom + ch / 2;
        ctx.moveTo(x0, py);
        ctx.lineTo(x0 + bw, py);
      }
      ctx.stroke();
    }

    // Snap anchor
    ctx.fillStyle = valid ? '#4ade80' : '#f87171';
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    ctx.lineWidth = Math.max(1, 1.2 / cam.zoom);
    ctx.beginPath();
    ctx.arc(gx, gy, Math.max(3, 4.5 * cam.zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

/** Placement grid on top of sprites — major lines only during play; full grid in build mode. */
function drawGridTopOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.showGrid) return;

  const cam = state.camera;
  const inBuildMode = !!state.buildMode;
  const vp = getGridViewport(cam, cw, ch);
  const gs = GRID_SIZE;
  const majorGs = gs * GRID_MAJOR_EVERY;
  const onSnow = isSnowGround(state);
  const isNight = isNightHour(state.hourOfDay);

  if (inBuildMode) {
    const minorW = Math.max(0.9, 1.2 / cam.zoom);
    const majorW = Math.max(1.2, 2 / cam.zoom);
    strokeGridLines(ctx, vp, cam, cw, ch, gs, true, 'rgba(110, 231, 183, 0.55)', 'rgba(0,0,0,0.35)', minorW);
    strokeGridLines(ctx, vp, cam, cw, ch, majorGs, false, 'rgba(52, 211, 153, 0.85)', 'rgba(0,0,0,0.45)', majorW);
    if (cam.zoom >= 0.4) {
      const dotR = Math.max(2, 2.5 * cam.zoom);
      ctx.fillStyle = 'rgba(167, 243, 208, 0.9)';
      for (let x = vp.mx0; x <= vp.ex; x += majorGs) {
        for (let y = vp.my0; y <= vp.ey; y += majorGs) {
          const px = worldToScreenX(x, cam, cw);
          const py = worldToScreenY(y, cam, ch);
          if (px < -8 || px > cw + 8 || py < -8 || py > ch + 8) continue;
          ctx.beginPath();
          ctx.arc(px, py, dotR, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    }
    return;
  }

  // Normal play: one clean major grid (every 5 cells) — no minor lines, dots, or checker
  const majorW = Math.max(1, 1.4 / cam.zoom);
  const lineColor = onSnow
    ? 'rgba(100, 116, 139, 0.35)'
    : isNight
      ? 'rgba(226, 232, 240, 0.4)'
      : 'rgba(31, 56, 28, 0.28)';
  strokeGridLines(ctx, vp, cam, cw, ch, majorGs, false, lineColor, 'rgba(0,0,0,0)', majorW);
}

// ============ GRASS (BATCHED, NO SPRITES, NO SHADOWS) ============
function drawGrass(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  // Batch all grass into a single path for much faster rendering
  ctx.fillStyle = '#22c55e';
  ctx.globalAlpha = 0.16;

  let drawn = 0;
  for (const grass of _cachedGrass) {
    const sx = (grass.x - cam.x) * cam.zoom + cw / 2;
    const sy = (grass.y - cam.y) * cam.zoom + ch / 2;
    const size = grass.size * 1.0 * cam.zoom;
    // Fast culling without function call
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;
    // Only draw every other grass at low zoom
    if (cam.zoom < 0.8 && drawn % 2 !== 0) { drawn++; continue; }
    const r = size * 0.3;
    ctx.beginPath();
    ctx.arc(sx, sy, r, 0, Math.PI * 2);
    ctx.fill();
    drawn++;
  }
  ctx.globalAlpha = 1;
}

// ============ TREES (CULLED) ============
function drawTrees(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  for (const tree of _cachedTrees) {
    const sx = (tree.x - cam.x) * cam.zoom + cw / 2;
    const sy = (tree.y - cam.y) * cam.zoom + ch / 2;
    const size = tree.size * 2.4 * cam.zoom;
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;

    // Shadow - simple dark circle, no save/restore
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + size * 0.3, size * 0.5, size * 0.15, 0, 0, Math.PI * 2);
    ctx.fill();

    const treeFrame = getSpriteFrame('/sprites/tree.png');
    if (treeFrame) {
      drawSpriteFrame(ctx, treeFrame, sx, sy, size * 2, size * 2.2, 0.5, 0.92);
    } else {
      ctx.fillStyle = '#228B22';
      ctx.beginPath();
      ctx.arc(sx, sy, size / 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// ============ BUILDINGS (CULLED) ============
function drawBuildings(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;

  function getBuildingScreenRect(b: typeof state.buildings[0]) {
    const sx = (b.x - cam.x) * cam.zoom + cw / 2;
    const sy = (b.y - cam.y) * cam.zoom + ch / 2;
    const w = b.width * cam.zoom;
    const h = b.height * cam.zoom;
    return { sx, sy, w, h };
  }

  const isHovered = (b: typeof state.buildings[0]) => state.hoveredBuilding?.id === b.id;

  // Roads first
  for (const b of state.buildings) {
    if (b.type !== BuildingType.Road || !b.completed) continue;
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;
    const cfg = BUILDING_CONFIGS[b.type];
    const tint = applySeasonTint(cfg.backgroundColor, state.season);
    const border = darkerColor(tint, 0.45);
    const dash = categoryBorderDash(cfg.category);
    const hover = isHovered(b);
    const rot = normalizeBuildingRotation(b.rotation);
    drawBuildingPad(ctx, cfg.padShape, sx, sy, w, h, tint, border, hover ? 0.55 : 0.35, dash, 1.5);
    const roadFrame = getSpriteFrame(cfg.sprite);
    if (roadFrame) drawSpriteFrame(ctx, roadFrame, sx, sy, w, h, 0.5, 0.55, false, {}, 'contain', rot);
    else { ctx.fillStyle = '#78716c'; ctx.fillRect(sx - w / 2, sy - h / 2, w, h); }
  }

  // Under construction
  for (const b of state.buildings) {
    if (b.completed) continue;
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;
    const cfg = BUILDING_CONFIGS[b.type];
    const tint = applySeasonTint(cfg.backgroundColor, state.season);
    const border = darkerColor(tint, 0.35);
    const dash = categoryBorderDash(cfg.category);
    const hover = isHovered(b);
    drawBuildingPad(ctx, cfg.padShape, sx, sy, w, h, tint, border, hover ? 0.45 : 0.28, dash, 1.5);

    // Progress bar
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(sx - w / 2, sy + h / 2 - 4, w, 4);
    ctx.fillStyle = '#22c55e';
    ctx.fillRect(sx - w / 2, sy + h / 2 - 4, w * (b.constructionProgress / 100), 4);
    ctx.fillStyle = '#44403c';
    ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(`${Math.floor(b.constructionProgress)}%`, sx, sy + 3);
  }

  // Completed buildings
  const sorted = state.buildings.filter(b => b.completed).sort((a, b) => (a.y + a.height / 2) - (b.y + b.height / 2));
  for (const b of sorted) {
    const { sx, sy, w, h } = getBuildingScreenRect(b);
    if (sx + w < -20 || sx - w > cw + 20 || sy + h < -20 || sy - h > ch + 20) continue;

    const cfg = BUILDING_CONFIGS[b.type];
    const frame = getSpriteFrame(cfg.sprite);
    const sel = state.selectedBuilding?.id === b.id;
    const hover = isHovered(b);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + h * 0.1 + 2, w * 0.35, h * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    // Category-colored foundation pad
    const pad = Math.max(2, Math.min(w, h) * 0.08);
    const padW = w + pad * 2;
    const padH = h + pad * 2;
    const isRival = b.faction === 'rival';
    const tint = isRival ? '#312e81' : applySeasonTint(cfg.backgroundColor, state.season);
    const border = isRival ? '#6366f1' : darkerColor(tint, 0.4);
    const dash = categoryBorderDash(cfg.category);
    const baseAlpha = hover ? 0.52 : isRival ? 0.42 : 0.38;
    drawBuildingPad(ctx, cfg.padShape, sx, sy, padW, padH, tint, border, baseAlpha, dash, isRival ? 2 : 1.5);

    if (frame) {
      const sc = Math.max(0.1, b.spriteScale || 1);
      const displayScale = cfg.spriteDisplayScale ?? 1.15;
      const rot = normalizeBuildingRotation(b.rotation);
      drawSpriteFrame(
        ctx, frame, sx, sy,
        w * sc * displayScale, h * sc * displayScale,
        0.5, 0.92, false, {}, 'contain', rot,
      );
    } else {
      ctx.fillStyle = '#e7e5e4';
      ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
      ctx.strokeStyle = sel ? tint : '#a8a29e';
      ctx.lineWidth = sel ? 3 : 1;
      ctx.strokeRect(sx - w / 2, sy - h / 2, w, h);
    }

    // Selection ring uses the building's category color
    if (isRival && b.campLabel && cam.zoom > 0.45) {
      ctx.font = `bold ${Math.max(7, 8 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(15, 23, 42, 0.65)';
      const label = b.campLabel;
      const tw = ctx.measureText(label).width;
      ctx.fillRect(sx - tw / 2 - 4, sy - h / 2 - 14, tw + 8, 12);
      ctx.fillStyle = '#a5b4fc';
      ctx.fillText(label, sx, sy - h / 2 - 5);
    }

    if (sel || hover) {
      const ringColor = sel ? (isRival ? '#818cf8' : tint) : '#ffffff';
      ctx.strokeStyle = ringColor;
      ctx.lineWidth = sel ? 2.5 : 1.5;
      ctx.shadowColor = ringColor;
      ctx.shadowBlur = sel ? 10 : 6;
      ctx.strokeRect(sx - w / 2 - 2, sy - h / 2 - 2, w + 4, h + 4);
      ctx.shadowBlur = 0;
    }

    if (b.level > 1) {
      ctx.fillStyle = '#b45309';
      ctx.font = `bold ${Math.max(7, 9 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'right';
      ctx.fillText(`Lv${b.level}`, sx + w / 2 - 4, sy - h / 2 + 10);
    }

    // Health bar
    if (b.health < b.maxHealth * 0.5) {
      const bw = w * 0.8;
      const bh = 3;
      const by = sy - h / 2 - 8;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - bw / 2, by, bw, bh);
      ctx.fillStyle = b.health < b.maxHealth * 0.25 ? '#ef4444' : '#f59e0b';
      ctx.fillRect(sx - bw / 2, by, bw * (b.health / b.maxHealth), bh);
    }

    // Worker badge
    if (b.occupants.length > 0 && cam.zoom > 0.8) {
      const bs = Math.max(10, 12 * cam.zoom);
      const bx = sx + w / 2 - bs / 2;
      const by = sy + h / 2 - bs / 2;
      ctx.fillStyle = '#2563eb';
      ctx.beginPath();
      ctx.arc(bx, by, bs / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 1;
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = `bold ${Math.max(7, 8 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${b.occupants.length}`, bx, by + 1);
      ctx.textBaseline = 'alphabetic';
    }
  }
}

// ============ ANIMALS (CULLED) ============
function drawAnimals(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;

  for (const e of _cachedAnimals) {
    const sx = (e.x - cam.x) * cam.zoom + cw / 2;
    const sy = (e.y - cam.y) * cam.zoom + ch / 2;
    const cfg = SPECIES_CONFIG[e.type];
    const { spriteH, shadowW, shadowY } = getAnimalSpriteMetrics(e, cam.zoom);
    const cullPad = spriteH * 0.75;
    if (sx + cullPad < -20 || sx - cullPad > cw + 20 || sy + cullPad < -20 || sy - cullPad > ch + 20) continue;

    const sel = state.selectedEntity?.id === e.id;
    const flipX = e.vx < 0;
    const frame = getSpriteFrame(cfg.sprite);

    // Shadow
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, sy + shadowY, shadowW * 0.45, shadowW * 0.12, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawAnimal = () => {
      if (frame) {
        const aspect = frame.sw / frame.sh;
        drawSpriteFrame(
          ctx, frame, sx, sy, spriteH * aspect, spriteH,
          0.5, ANIMAL_SPRITE_ANCHOR_Y, flipX, {}, 'height',
        );
        return;
      }
      ctx.fillStyle = cfg.color;
      ctx.beginPath();
      ctx.arc(sx, sy, spriteH * 0.35, 0, Math.PI * 2);
      ctx.fill();
    };

    if (e.flash > 0) {
      ctx.globalAlpha = 0.7 + Math.sin(_time * 20) * 0.3;
      drawAnimal();
      ctx.globalAlpha = 1;
    } else {
      drawAnimal();
    }

    if (e.huntTargetId && cam.zoom > 0.5) {
      ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🐾', sx, sy - spriteH * 0.55 - 4);
    } else if (e.type === EntityType.Werewolf && cam.zoom > 0.55) {
      ctx.font = `${Math.max(8, 10 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('🌝', sx, sy - spriteH * 0.55 - 4);
    }

    if (e.combatTicks && e.combatTicks > 0) {
      drawCombatBurst(ctx, sx, sy, spriteH * 0.45, state.tick, e.id);
    }

    if (sel) {
      ctx.strokeStyle = e.type === EntityType.Werewolf ? '#a78bfa' : '#d97706';
      ctx.lineWidth = 2;
      ctx.shadowColor = ctx.strokeStyle;
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.arc(sx, sy, spriteH * 0.38 + 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}

// ============ HUMANS (CULLED) ============
function drawTalkingMouth(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  flipX: boolean,
  animFrame: number,
) {
  const talking = Math.sin(animFrame * 0.9) > -0.15;
  if (!talking) return;
  const mx = Math.round(sx + (flipX ? -size * 0.08 : size * 0.08));
  const my = Math.round(sy - size * 0.38);
  ctx.fillStyle = '#3d2817';
  ctx.fillRect(mx, my, 2, talking && Math.sin(animFrame * 1.6) > 0 ? 2 : 1);
}

function drawSpeechBubble(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  text: string,
  tick: number,
  entityId: number,
  zoom: number,
) {
  if (zoom < 0.45) return;

  const bob = Math.sin(tick * 0.14 + entityId) * 1.5;
  const fontSize = Math.max(6, Math.min(8, 7 * zoom));
  ctx.font = `bold ${fontSize}px sans-serif`;
  const padX = 5;
  const padY = 3;
  const tw = ctx.measureText(text).width;
  const bw = Math.ceil(tw + padX * 2);
  const bh = Math.ceil(fontSize + padY * 2);
  const bx = Math.round(sx - bw / 2);
  const by = Math.round(sy - size - bh - 12 + bob);

  ctx.fillStyle = 'rgba(255,253,245,0.96)';
  ctx.strokeStyle = 'rgba(28,25,23,0.55)';
  ctx.lineWidth = 1;
  roundRect(ctx, bx, by, bw, bh, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255,253,245,0.96)';
  ctx.beginPath();
  ctx.moveTo(sx - 4, by + bh - 1);
  ctx.lineTo(sx, sy - size - 3 + bob * 0.3);
  ctx.lineTo(sx + 4, by + bh - 1);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1c1917';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, sx, by + bh / 2);
  ctx.textBaseline = 'alphabetic';
}

function getStatusIcon(
  human: Entity,
  hourOfDay: number,
  unlockedTechs: readonly string[],
  hasBlacksmith: boolean,
  villageForge: RenderSnapshot['villageForge'],
  buildings: RenderSnapshot['buildings'],
  villageLeaderId: number | null,
): string {
  if (villageLeaderId != null && human.id === villageLeaderId) return '👑';
  const combatIcon = getHumanStatusCombatIcon(human, unlockedTechs, hasBlacksmith, villageForge, buildings);
  if (combatIcon) return combatIcon;
  if (human.faction === 'visitor') return '🧳';
  if (human.faction === 'rival') return '🏕️';
  if (human.isJuvenile) return '👶';
  if (human.pregnant) return '🤰';
  if (human.courtshipProgress && human.courtshipProgress > 0 && !shouldBeAtHome(hourOfDay)) return '💕';
  if (shouldBeAtHome(hourOfDay)) return '🏠';
  const onConstruction = buildings.some(
    (b) => !b.completed && b.occupants.includes(human.id),
  );
  if (isWorkHour(hourOfDay) && (human.homeBuildingId || onConstruction)) return '🔨';
  if (human.relationshipStatus === 'married' && human.partnerId) return '💍';
  return '🚶';
}

function drawRaidMarchLines(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.pendingRaidEvents?.length || state.camera.zoom < 0.35) return;
  const cam = state.camera;
  const village = getPlayerCampCenter(
    { buildings: state.buildings, entities: state.entities } as import('./gameTypes').WorldState,
    state.buildings,
  );
  const vx = (village.x - cam.x) * cam.zoom + cw / 2;
  const vy = (village.y - cam.y) * cam.zoom + ch / 2;

  for (const raid of state.pendingRaidEvents) {
    const rival = state.rivalSettlements.find((r) => r.id === raid.rivalId);
    if (!rival) continue;
    const rx = (rival.campX - cam.x) * cam.zoom + cw / 2;
    const ry = (rival.campY - cam.y) * cam.zoom + ch / 2;
    ctx.strokeStyle = 'rgba(239,68,68,0.45)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.moveTo(rx, ry);
    ctx.lineTo(vx, vy);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.font = `${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = '#f87171';
    ctx.fillText('⚔️', (rx + vx) / 2, (ry + vy) / 2 - 6);
  }
}

function drawHuntChaseLines(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (state.camera.zoom < 0.4) return;
  const cam = state.camera;
  const entityById = new Map(state.entities.map((e) => [e.id, e]));

  for (const hunter of state.entities) {
    if (!hunter.alive || !hunter.huntTargetId) continue;
    const prey = entityById.get(hunter.huntTargetId);
    if (!prey?.alive) continue;

    const hx = (hunter.x - cam.x) * cam.zoom + cw / 2;
    const hy = (hunter.y - cam.y) * cam.zoom + ch / 2;
    const px = (prey.x - cam.x) * cam.zoom + cw / 2;
    const py = (prey.y - cam.y) * cam.zoom + ch / 2;

    const isHumanHunter = hunter.type === EntityType.Human;
    ctx.strokeStyle = isHumanHunter ? 'rgba(249,115,22,0.55)' : 'rgba(168,162,158,0.45)';
    ctx.lineWidth = isHumanHunter ? 1.5 : 1;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(hx, hy);
    ctx.lineTo(px, py);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.font = `${Math.max(7, 8 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillStyle = isHumanHunter ? '#fb923c' : '#a8a29e';
    ctx.fillText(isHumanHunter ? '🏹' : isPredatorType(hunter.type) ? '🐾' : '•', (hx + px) / 2, (hy + py) / 2 - 4);
  }
}

function drawCombatBurst(ctx: CanvasRenderingContext2D, sx: number, sy: number, size: number, tick: number, entityId: number) {
  const pulse = 0.5 + Math.sin(tick * 0.5 + entityId) * 0.5;
  ctx.strokeStyle = `rgba(251,191,36,${0.35 + pulse * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, size * 0.55 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
}

function drawHumans(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const tick = state.tick;
  const cam = state.camera;

  for (const human of _cachedHumans) {
    const sx = (human.x - cam.x) * cam.zoom + cw / 2;
    const sy = (human.y - cam.y) * cam.zoom + ch / 2;
    const { size, spriteH, footOffset } = getHumanSpriteMetrics(human, cam.zoom);
    const cullPad = Math.max(size * 1.5, spriteH);
    if (sx + cullPad < -20 || sx - cullPad > cw + 20 || sy + cullPad < -20 || sy - cullPad > ch + 20) continue;

    const isSel = state.selectedEntity?.id === human.id;
    const flipX = human.vx < -0.05 || (Math.abs(human.vx) <= 0.05 && Math.cos(human.spriteAngle) < 0);
    const speed = Math.hypot(human.vx, human.vy);
    const walkFrame = getHumanWalkFrameIndex(human.animFrame, speed);
    const walkMotion = getHumanWalkMotion(human, cam.zoom, true, walkFrame);
    const drawSize = size;
    const footY = sy + footOffset;
    const headY = footY - spriteH;
    const bobY = walkMotion.bobY ?? 0;

    const shadowScale = speed > 0.1 ? 1.08 : 1;
    ctx.fillStyle = 'rgba(0,0,0,0.15)';
    ctx.beginPath();
    ctx.ellipse(sx, footY + 1, size * 0.42 * shadowScale, size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();

    const drawHuman = () => {
      const spritePath = getHumanSpritePath(human);
      const frame = getSpriteFrame(spritePath)
        ?? getSpriteFrame(HUMAN_BASE_SPRITES[human.gender ?? 'male']);
      if (frame) {
        const aspect = frame.sw / frame.sh;
        const anchorY = frame.anchorY ?? 1;
        // fit:'height' + feet anchor — full 27x72 body, not a cropped head
        drawSpriteFrame(
          ctx, frame, sx, footY, spriteH * aspect, spriteH,
          0.5, anchorY, flipX, { bobY }, 'height',
        );
        return;
      }
      drawPioneerAt(
        ctx, sx, footY, spriteH,
        human.gender, human.spriteVariant ?? 0, walkFrame, flipX, bobY,
      );
    };

    if (human.flash > 0) {
      ctx.globalAlpha = 0.7 + Math.sin(_time * 20) * 0.3;
      drawHuman();
      ctx.globalAlpha = 1;
    } else {
      drawHuman();
    }

    if (human.combatTicks && human.combatTicks > 0) {
      drawCombatBurst(ctx, sx, footY - spriteH * 0.45, drawSize, tick, human.id);
    }

    const isTalking = (human.chatTicks ?? 0) > 0;
    if (isTalking) {
      drawTalkingMouth(ctx, sx, headY + spriteH * 0.12, drawSize, flipX, human.animFrame);
      const bubbleText = human.chatPhrase || getAnimatedChatDots(tick, human.id);
      drawSpeechBubble(ctx, sx, headY, drawSize, bubbleText, tick, human.id, cam.zoom);
    }

    // Status badge
    if (cam.zoom > 0.6) {
      const bx = sx + size * 0.35;
      const by = headY + spriteH * 0.12;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.arc(bx, by, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.font = '8px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(
        getStatusIcon(human, state.hourOfDay, state.unlockedTechs, state.hasBlacksmith, state.villageForge, state.buildings, state.villageLeaderId),
        bx,
        by,
      );
      ctx.textBaseline = 'alphabetic';
    }

    // Name label
    const labelY = headY - (isTalking ? 22 : 4);
    if (human.faction && cam.zoom > 0.55) {
      ctx.strokeStyle = human.faction === 'visitor' ? '#22d3ee' : '#fb923c';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.38, spriteH * 0.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (human.name && cam.zoom > (human.isJuvenile ? 0.38 : 0.45)) {
      const prefix = human.faction === 'visitor' ? '↗ ' : human.faction === 'rival' ? '⚑ ' : '';
      const childTag = human.isJuvenile ? ' · child' : '';
      const fullName = prefix + (human.surname ? `${human.name} ${human.surname}` : human.name) + childTag;
      let tw = _nameWidthCache.get(fullName);
      if (!tw) {
        const fontSize = Math.max(7, Math.min(9, 8 * cam.zoom));
        ctx.font = `bold ${fontSize}px sans-serif`;
        tw = ctx.measureText(fullName).width;
        _nameWidthCache.set(fullName, tw);
      }
      const fontSize = Math.max(7, Math.min(9, 8 * cam.zoom));
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(sx - tw / 2 - 3, labelY - fontSize - 2, tw + 6, fontSize + 4);
      ctx.fillStyle = human.faction === 'visitor' ? '#67e8f9' : human.faction === 'rival' ? '#fdba74' : human.gender === 'male' ? '#fbbf24' : '#fda4af';
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText(fullName, sx, labelY);
      ctx.textBaseline = 'alphabetic';
    }

    if (isSel) {
      ctx.strokeStyle = '#d97706';
      ctx.lineWidth = 2;
      ctx.shadowColor = '#d97706';
      ctx.shadowBlur = 8;
      ctx.beginPath();
      ctx.ellipse(sx, footY - spriteH * 0.48, size * 0.42, spriteH * 0.54, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }
}

// ============ CAMP MARKERS ============
function drawCampMarkers(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  if (cam.zoom < 0.35) return;

  for (const group of state.visitorGroups) {
    const sx = (group.campX - cam.x) * cam.zoom + cw / 2;
    const sy = (group.campY - cam.y) * cam.zoom + ch / 2;
    if (sx < -40 || sx > cw + 40 || sy < -40 || sy > ch + 40) continue;
    const highlighted = state.highlightedCampKey === `visitor:${group.id}`;
    if (highlighted) {
      const pulse = 0.55 + 0.25 * Math.sin(state.tick * 0.15);
      ctx.strokeStyle = `rgba(34, 211, 238, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(18, 22 * cam.zoom), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(6, 78, 59, 0.55)';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(10, 14 * cam.zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(34, 211, 238, 0.7)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (cam.zoom > 0.5) {
      ctx.font = `bold ${Math.max(7, 8 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#a5f3fc';
      ctx.fillText(group.name, sx, sy - Math.max(12, 16 * cam.zoom));
      ctx.fillStyle = '#6ee7b7';
      ctx.font = `${Math.max(6, 7 * cam.zoom)}px sans-serif`;
      ctx.fillText(`${group.daysLeft}d`, sx, sy + Math.max(14, 18 * cam.zoom));
    }
  }

  for (const rival of state.rivalSettlements) {
    const sx = (rival.campX - cam.x) * cam.zoom + cw / 2;
    const sy = (rival.campY - cam.y) * cam.zoom + ch / 2;
    if (sx < -40 || sx > cw + 40 || sy < -40 || sy > ch + 40) continue;
    const highlighted = state.highlightedCampKey === `rival:${rival.id}`;
    if (highlighted) {
      const pulse = 0.55 + 0.25 * Math.sin(state.tick * 0.15);
      ctx.strokeStyle = `rgba(251, 146, 60, ${pulse})`;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(20, 24 * cam.zoom), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(67, 20, 7, 0.5)';
    ctx.beginPath();
    ctx.arc(sx, sy, Math.max(12, 16 * cam.zoom), 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(251, 146, 60, 0.75)';
    ctx.lineWidth = 1.5;
    ctx.stroke();
    if (cam.zoom > 0.5) {
      ctx.font = `bold ${Math.max(7, 8 * cam.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fed7aa';
      ctx.fillText(rival.name, sx, sy - Math.max(12, 16 * cam.zoom));
      ctx.fillStyle = '#fdba74';
      ctx.font = `${Math.max(6, 7 * cam.zoom)}px sans-serif`;
      ctx.fillText(`${rival.population} · ${rival.relationship}`, sx, sy + Math.max(14, 18 * cam.zoom));
    }
  }
}

// ============ PARTICLES ============
function drawParticleShape(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  p: RenderSnapshot['deathParticles'][0],
  lifeRatio: number,
) {
  const alpha = lifeRatio * (p.type === 'smoke' ? 0.45 : 0.85);
  ctx.globalAlpha = alpha;
  ctx.fillStyle = p.color;

  if (p.type === 'star') {
    const r = size;
    ctx.beginPath();
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 - Math.PI / 2;
      const x = sx + Math.cos(a) * r;
      const y = sy + Math.sin(a) * r;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
      const a2 = a + Math.PI / 4;
      ctx.lineTo(sx + Math.cos(a2) * r * 0.35, sy + Math.sin(a2) * r * 0.35);
    }
    ctx.closePath();
    ctx.fill();
  } else if (p.type === 'sparkle') {
    ctx.fillRect(sx - size * 0.15, sy - size, size * 0.3, size * 2);
    ctx.fillRect(sx - size, sy - size * 0.15, size * 2, size * 0.3);
  } else if (p.type === 'smoke') {
    const grad = ctx.createRadialGradient(sx, sy, 0, sx, sy, size * 1.8);
    grad.addColorStop(0, p.color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(sx, sy, size * 1.8, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.beginPath();
    ctx.arc(sx, sy, size, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawParticles(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  for (const p of state.deathParticles) {
    const sx = (p.x - cam.x) * cam.zoom + cw / 2;
    const sy = (p.y - cam.y) * cam.zoom + ch / 2;
    const size = p.size * cam.zoom;
    if (sx + size < -20 || sx - size > cw + 20 || sy + size < -20 || sy - size > ch + 20) continue;
    drawParticleShape(ctx, sx, sy, size, p, p.life / p.maxLife);
  }
  ctx.globalAlpha = 1;
}

// ============ NIGHT BUILDING GLOW ============
function drawNightBuildingGlow(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!isNightHour(state.hourOfDay) || state.camera.zoom < 0.32) return;
  const cam = state.camera;

  ctx.save();
  ctx.globalCompositeOperation = 'lighter';

  for (const b of state.buildings) {
    if (!b.completed || b.faction === 'rival') continue;
    if (!state.juiceEffectsEnabled) continue;
    const intensity = getNightGlowIntensity(b, state.entities);
    if (intensity <= 0) continue;

    const sx = (b.x - cam.x) * cam.zoom + cw / 2;
    const sy = (b.y - cam.y) * cam.zoom + ch / 2;
    const w = b.width * cam.zoom;
    const h = b.height * cam.zoom;
    if (sx + w < -50 || sx - w > cw + 50 || sy + h < -50 || sy - h > ch + 50) continue;

    const flicker = 0.82 + Math.sin(_time * 3.5 + b.id * 1.9) * 0.18;
    const warm = intensity * flicker;

    if (NIGHT_HOME_GLOW_TYPES.has(b.type)) {
      const winW = Math.max(2.5, w * 0.09);
      const winH = Math.max(2.5, h * 0.11);
      const windows = [
        { ox: -w * 0.2, oy: -h * 0.06 },
        { ox: w * 0.06, oy: -h * 0.08 },
        ...(b.type === BuildingType.Mansion ? [{ ox: w * 0.22, oy: -h * 0.04 }] : []),
      ];
      for (const { ox, oy } of windows) {
        const grad = ctx.createRadialGradient(sx + ox, sy + oy, 0, sx + ox, sy + oy, winW * 2.8);
        grad.addColorStop(0, `rgba(255, 210, 140, ${0.6 * warm})`);
        grad.addColorStop(0.55, `rgba(255, 150, 60, ${0.2 * warm})`);
        grad.addColorStop(1, 'rgba(255, 120, 40, 0)');
        ctx.fillStyle = grad;
        ctx.fillRect(sx + ox - winW * 1.2, sy + oy - winH * 1.2, winW * 2.4, winH * 2.4);
      }

      const chimX = sx + w * 0.24;
      const chimY = sy - h * 0.36;
      const emberR = Math.max(2, 3 * cam.zoom);
      const chimGrad = ctx.createRadialGradient(chimX, chimY, 0, chimX, chimY - emberR * 2, emberR * 5);
      chimGrad.addColorStop(0, `rgba(255, 150, 60, ${0.75 * warm})`);
      chimGrad.addColorStop(0.35, `rgba(255, 90, 30, ${0.3 * warm})`);
      chimGrad.addColorStop(1, 'rgba(60, 30, 10, 0)');
      ctx.fillStyle = chimGrad;
      ctx.beginPath();
      ctx.arc(chimX, chimY, emberR * 4, 0, Math.PI * 2);
      ctx.fill();

      if (cam.zoom > 0.42) {
        const drift = Math.sin(_time * 1.2 + b.id) * 2;
        const smokeY = chimY - emberR * 3 - ((_time * 14 + b.id * 3) % 22);
        ctx.globalAlpha = 0.18 * warm;
        ctx.fillStyle = '#cbd5e1';
        ctx.beginPath();
        ctx.arc(chimX + drift, smokeY, emberR * 1.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    } else {
      const doorGrad = ctx.createRadialGradient(sx, sy + h * 0.12, 0, sx, sy + h * 0.12, w * 0.4);
      doorGrad.addColorStop(0, `rgba(255, 190, 110, ${0.4 * warm})`);
      doorGrad.addColorStop(1, 'rgba(255, 120, 40, 0)');
      ctx.fillStyle = doorGrad;
      ctx.beginPath();
      ctx.arc(sx, sy + h * 0.12, w * 0.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.restore();
}

// ============ FLOATING TEXTS ============
function drawFloatingTexts(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  const cam = state.camera;
  const gridSize = 60;
  const gridMap = new Map<string, number>();

  for (const ft of state.floatingTexts) {
    const sx = (ft.x - cam.x) * cam.zoom + cw / 2;
    const sy = (ft.y - cam.y) * cam.zoom + ch / 2;
    const gx = Math.floor(sx / gridSize);
    const gy = Math.floor(sy / gridSize);
    const key = `${gx},${gy}`;
    const count = gridMap.get(key) || 0;
    gridMap.set(key, count + 1);

    const offsetY = count * -12;
    const lifeRatio = ft.life / ft.maxLife;
    const fadeOut = ft.life < 7 ? ft.life / 7 : 1;
    ctx.globalAlpha = Math.min(1, lifeRatio * fadeOut);
    ctx.fillStyle = ft.color;
    ctx.font = `bold ${Math.max(9, 11 * cam.zoom)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.fillText(ft.text, sx, sy + offsetY);
  }
  ctx.globalAlpha = 1;
}

// ============ ECOSYSTEM CONNECTIONS ============
function drawEcoConnections(ctx: CanvasRenderingContext2D, _state: RenderSnapshot, cam: Camera, cw: number, ch: number) {
  if (cam.zoom < 0.6) return;

  for (const h of _cachedHumans) {
    if (h.partnerId && h.relationshipStatus === 'married' && h.gender === 'male') {
      const p = _cachedHumans.find(x => x.id === h.partnerId);
      if (!p) continue;
      const x1 = (h.x - cam.x) * cam.zoom + cw / 2;
      const y1 = (h.y - 8 - cam.y) * cam.zoom + ch / 2;
      const x2 = (p.x - cam.x) * cam.zoom + cw / 2;
      const y2 = (p.y - 8 - cam.y) * cam.zoom + ch / 2;
      if ((x1 + x2) / 2 + Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) < -50) continue;
      if ((x1 + x2) / 2 - Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2)) > cw + 50) continue;

      ctx.strokeStyle = 'rgba(255,215,0,0.3)';
      ctx.lineWidth = 1;
      ctx.setLineDash([3, 3]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,215,0,0.5)';
      ctx.font = '10px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('💍', (x1 + x2) / 2, (y1 + y2) / 2);
    }
  }
}

// ============ SEASON OVERLAY ============
function drawSeasonOverlay(ctx: CanvasRenderingContext2D, state: RenderSnapshot, _cw: number, ch: number) {
  const seasonIcons: Record<Season, string> = { [Season.Spring]: '🌸', [Season.Summer]: '☀️', [Season.Fall]: '🍂', [Season.Winter]: '❄️' };
  const seasonColors: Record<Season, string> = { [Season.Spring]: '#86efac', [Season.Summer]: '#fde047', [Season.Fall]: '#fdba74', [Season.Winter]: '#bfdbfe' };

  const label = `${seasonIcons[state.season]} ${state.season.toUpperCase()} | Year ${state.year}`;
  ctx.font = 'bold 12px sans-serif';
  ctx.textAlign = 'right';
  const tw = ctx.measureText(label).width;
  const mx = 155, my = ch - 120;
  ctx.fillStyle = 'rgba(0,0,0,0.6)';
  ctx.fillRect(mx - tw - 10, my - 18, tw + 14, 22);
  ctx.fillStyle = seasonColors[state.season];
  ctx.fillText(label, mx, my + 4);
}

// ============ BUILD PREVIEW ============
function drawBuildPreview(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  if (!state.buildMode || !state.buildGhost) return;
  const sx = (state.buildGhost.x - state.camera.x) * state.camera.zoom + cw / 2;
  const sy = (state.buildGhost.y - state.camera.y) * state.camera.zoom + ch / 2;
  const cfg = BUILDING_CONFIGS[state.buildMode];
  const footprint = getBuildingFootprintForType(state.buildMode, state.buildRotation);
  const w = footprint.width * state.camera.zoom;
  const h = footprint.height * state.camera.zoom;

  // Category-colored pad with validity tint
  const tint = state.buildGhost.valid ? cfg.backgroundColor : '#7f1d1d';
  const border = state.buildGhost.valid ? darkerColor(tint, 0.4) : '#ef4444';
  const dash = categoryBorderDash(cfg.category);
  const pad = Math.max(2, Math.min(w, h) * 0.08);
  drawBuildingPad(ctx, cfg.padShape, sx, sy, w + pad * 2, h + pad * 2, tint, border, 0.35, dash, 1.5);

  const previewFrame = getSpriteFrame(cfg.sprite);
  ctx.globalAlpha = 0.55;
  if (previewFrame) {
    const displayScale = cfg.spriteDisplayScale ?? 1.15;
    drawSpriteFrame(
      ctx, previewFrame, sx, sy,
      w * displayScale, h * displayScale,
      0.5, 0.92, false, {}, 'contain', state.buildRotation,
    );
  } else {
    ctx.fillStyle = state.buildGhost.valid ? 'rgba(34,197,94,0.3)' : 'rgba(239,68,68,0.3)';
    ctx.fillRect(sx - w / 2, sy - h / 2, w, h);
  }
  ctx.globalAlpha = 1;

  // Validity outline
  ctx.strokeStyle = state.buildGhost.valid ? '#22c55e' : '#ef4444';
  ctx.lineWidth = 2;
  ctx.setLineDash([4, 4]);
  ctx.strokeRect(sx - w / 2 - 2, sy - h / 2 - 2, w + 4, h + 4);
  ctx.setLineDash([]);
}

// ============ WEATHER PARTICLES (BATCHED) ============
interface WParticle { x: number; y: number; vx: number; vy: number; s: number; a: number }
let wParts: WParticle[] = [];
let lastWType: WeatherType | null = null;

function updateWeatherParticles(w: WeatherType, cw: number, ch: number) {
  if (w !== lastWType) {
    lastWType = w;
    wParts = [];
    const count = w === 'rain' ? 40 : w === 'snow' ? 25 : w === 'storm' ? 50 : 0;
    for (let i = 0; i < count; i++) {
      wParts.push({
        x: Math.random() * cw * 1.5 - cw * 0.25,
        y: Math.random() * ch * 1.5 - ch * 0.25,
        vx: w === 'storm' ? (Math.random() - 0.3) * 3 : (Math.random() - 0.5) * 0.5,
        vy: w === 'snow' ? 0.5 + Math.random() : 2 + Math.random() * 3,
        s: w === 'snow' ? 2 + Math.random() * 2 : 1 + Math.random(),
        a: 0.3 + Math.random() * 0.4,
      });
    }
  }
  for (const p of wParts) {
    p.x += p.vx; p.y += p.vy;
    if (p.y > ch * 1.3) { p.y = -10; p.x = Math.random() * cw * 1.5 - cw * 0.25; }
    if (p.x > cw * 1.3) p.x = -10;
    if (p.x < -cw * 0.3) p.x = cw * 1.3;
  }
}

function drawWeather(ctx: CanvasRenderingContext2D, w: WeatherType, cw: number, ch: number) {
  updateWeatherParticles(w, cw, ch);
  if (w === 'fog') { ctx.fillStyle = 'rgba(180,170,155,0.2)'; ctx.fillRect(0, 0, cw, ch); return; }
  if (w === 'drought') { ctx.fillStyle = 'rgba(180,100,20,0.06)'; ctx.fillRect(0, 0, cw, ch); return; }
  if (wParts.length === 0) return;

  // Batch weather particles
  if (w === 'snow') {
    ctx.fillStyle = '#fff';
    for (const p of wParts) {
      ctx.globalAlpha = p.a;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    ctx.strokeStyle = w === 'storm' ? '#90a0b0' : '#8a9aaa';
    ctx.beginPath();
    for (const p of wParts) {
      ctx.globalAlpha = p.a;
      ctx.lineWidth = p.s;
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(p.x + p.vx * 2, p.y + p.vy * 2);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1;

  if (w === 'storm' && Math.random() < 0.003) {
    ctx.fillStyle = `rgba(255,255,255,${0.3 + Math.random() * 0.4})`;
    ctx.fillRect(0, 0, cw, ch);
  }
}

// ============ MAIN RENDER ============
/** Read-only render pass — camera/screenShake must be pre-interpolated in the snapshot. */
export function renderGame(ctx: CanvasRenderingContext2D, state: RenderSnapshot, cw: number, ch: number) {
  _time += 0.016;
  ctx.imageSmoothingEnabled = false;

  updateCachedEntities(state.entities, state.tick);

  const shake = state.screenShake;
  if (shake > 0.1) {
    ctx.save();
    ctx.translate((Math.random() - 0.5) * shake * 2, (Math.random() - 0.5) * shake * 2);
  }

  drawGround(ctx, state, cw, ch);
  drawBuildZoneOverlay(ctx, state, cw, ch);
  drawGrid(ctx, state, cw, ch);
  drawGrass(ctx, state, cw, ch);
  drawTrees(ctx, state, cw, ch);
  drawBuildings(ctx, state, cw, ch);
  drawCampMarkers(ctx, state, cw, ch);
  drawEcoConnections(ctx, state, state.camera, cw, ch);
  drawBuildPreview(ctx, state, cw, ch);
  drawAnimals(ctx, state, cw, ch);
  drawRaidMarchLines(ctx, state, cw, ch);
  drawHuntChaseLines(ctx, state, cw, ch);
  drawHumans(ctx, state, cw, ch);
  drawParticles(ctx, state, cw, ch);
  drawFloatingTexts(ctx, state, cw, ch);
  drawSeasonOverlay(ctx, state, cw, ch);
  drawWeather(ctx, state.weather, cw, ch);

  if (isNightHour(state.hourOfDay)) {
    const depth = state.hourOfDay >= 22 || state.hourOfDay < 4 ? 0.4 : 0.28;
    ctx.fillStyle = `rgba(8,12,32,${depth})`;
    ctx.fillRect(0, 0, cw, ch);
    drawNightBuildingGlow(ctx, state, cw, ch);
  }

  // Grid lines on top of all map sprites (underlay was hidden under trees/grass)
  drawGridTopOverlay(ctx, state, cw, ch);

  if (state.renffrOmen) {
    drawRenffrOmen(ctx, state.renffrOmen, cw, ch, _time);
  }

  if (shake > 0.1) {
    ctx.restore();
  }
}

export { w2s as worldToScreen, s2w as screenToWorld };
