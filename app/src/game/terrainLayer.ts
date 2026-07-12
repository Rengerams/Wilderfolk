import { TerrainType, TERRAIN_TILE_SIZE, type MapPreset, type Season, type WorldMap } from './gameTypes';
import {
  createCanvasSurface,
  disposeCanvasSurface,
  getCanvasContext,
  type CanvasContext2d,
  type CanvasSurface,
} from './canvasLayer';

export type TerrainSurface = CanvasSurface;

export interface TerrainLayerCache {
  surface: TerrainSurface;
  ctx: CanvasContext2d;
  width: number;
  height: number;
  worldWidth: number;
  worldHeight: number;
  seed: number;
  preset: string;
  season: Season;
}

/** World-pixel decor (rivers + map border) — static until map seed/preset changes. */
export interface TerrainDecorCache {
  surface: TerrainSurface;
  ctx: CanvasContext2d;
  width: number;
  height: number;
  seed: number;
  preset: string;
}

export function terrainLayerNeedsRebuild(
  cache: TerrainLayerCache | null,
  map: WorldMap,
  season: Season,
  worldWidth: number,
  worldHeight: number,
): boolean {
  if (!cache) return true;
  return cache.worldWidth !== worldWidth
    || cache.worldHeight !== worldHeight
    || cache.seed !== map.seed
    || cache.preset !== map.preset
    || cache.season !== season;
}

export function terrainDecorNeedsRebuild(
  cache: TerrainDecorCache | null,
  map: WorldMap,
  worldWidth: number,
  worldHeight: number,
): boolean {
  if (!cache) return true;
  return cache.width !== worldWidth
    || cache.height !== worldHeight
    || cache.seed !== map.seed
    || cache.preset !== map.preset;
}

/** Release GPU/RAM held by a baked terrain surface before replacing the cache. */
export function disposeTerrainLayer(cache: TerrainLayerCache | null): void {
  if (!cache) return;
  disposeCanvasSurface(cache.surface);
}

export function disposeTerrainDecor(cache: TerrainDecorCache | null): void {
  if (!cache) return;
  disposeCanvasSurface(cache.surface);
}

function terrainColorAtEdge(
  map: WorldMap,
  px: number,
  py: number,
  season: Season,
  colorAt: (type: TerrainType, season: Season, variation: number, preset?: MapPreset) => string,
): string {
  const tx = Math.floor(px / TERRAIN_TILE_SIZE);
  const ty = Math.floor(py / TERRAIN_TILE_SIZE);
  const tile = map.tiles[ty]?.[tx];
  if (!tile) return colorAt(TerrainType.Grassland, season, 0.5, map.preset);

  const localX = px - tx * TERRAIN_TILE_SIZE;
  const localY = py - ty * TERRAIN_TILE_SIZE;
  const edgeBlend = Math.min(localX, TERRAIN_TILE_SIZE - 1 - localX, localY, TERRAIN_TILE_SIZE - 1 - localY);
  if (edgeBlend > 1) {
    return colorAt(tile.type, season, tile.variation, map.preset);
  }

  const neighbors: string[] = [colorAt(tile.type, season, tile.variation, map.preset)];
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]] as const;
  for (const [dx, dy] of dirs) {
    const nt = map.tiles[ty + dy]?.[tx + dx];
    if (!nt || nt.type === tile.type) continue;
    neighbors.push(colorAt(nt.type, season, nt.variation, map.preset));
  }
  if (neighbors.length === 1) {
    return neighbors[0];
  }

  const blend = edgeBlend / 2;
  const base = parseTerrainRgb(neighbors[0]);
  let r = base.r;
  let g = base.g;
  let b = base.b;
  for (let i = 1; i < neighbors.length; i++) {
    const c = parseTerrainRgb(neighbors[i]);
    r += (c.r - r) * blend;
    g += (c.g - g) * blend;
    b += (c.b - b) * blend;
  }
  return `rgb(${r | 0},${g | 0},${b | 0})`;
}

function parseTerrainRgb(color: string): { r: number; g: number; b: number } {
  const m = color.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
  if (!m) return { r: 94, g: 122, b: 58 };
  return { r: Number(m[1]), g: Number(m[2]), b: Number(m[3]) };
}

export function bakeTerrainLayer(
  map: WorldMap,
  worldWidth: number,
  worldHeight: number,
  season: Season,
  colorAt: (type: TerrainType, season: Season, variation: number, preset?: MapPreset) => string,
): TerrainLayerCache {
  const w = Math.max(1, Math.floor(worldWidth));
  const h = Math.max(1, Math.floor(worldHeight));
  const surface = createCanvasSurface(w, h);
  const ctx = getCanvasContext(surface);
  const tileSize = TERRAIN_TILE_SIZE;

  for (let ty = 0; ty < map.height; ty++) {
    for (let tx = 0; tx < map.width; tx++) {
      const tile = map.tiles[ty]?.[tx];
      if (!tile) continue;
      const x0 = tx * tileSize;
      const y0 = ty * tileSize;
      if (x0 >= w || y0 >= h) continue;
      const fillW = Math.min(tileSize, w - x0);
      const fillH = Math.min(tileSize, h - y0);
      ctx.fillStyle = colorAt(tile.type, season, tile.variation, map.preset);
      if (fillW <= 4 || fillH <= 4) {
        ctx.fillRect(x0, y0, fillW, fillH);
        continue;
      }
      ctx.fillRect(x0 + 2, y0 + 2, fillW - 4, fillH - 4);
    }
  }

  for (let py = 0; py < h; py++) {
    for (let px = 0; px < w; px++) {
      const localX = px % tileSize;
      const localY = py % tileSize;
      const edgeBlend = Math.min(localX, tileSize - 1 - localX, localY, tileSize - 1 - localY);
      if (edgeBlend > 1) continue;
      ctx.fillStyle = terrainColorAtEdge(map, px, py, season, colorAt);
      ctx.fillRect(px, py, 1, 1);
    }
  }

  return {
    surface,
    ctx,
    width: w,
    height: h,
    worldWidth: w,
    worldHeight: h,
    seed: map.seed,
    preset: map.preset,
    season,
  };
}

export function bakeTerrainDecor(map: WorldMap, worldWidth: number, worldHeight: number): TerrainDecorCache {
  const w = Math.max(1, Math.floor(worldWidth));
  const h = Math.max(1, Math.floor(worldHeight));
  const surface = createCanvasSurface(w, h);
  const ctx = getCanvasContext(surface);

  if (map.rivers) {
    ctx.strokeStyle = 'rgba(55,115,180,0.7)';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const river of map.rivers) {
      if (river.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(river[0].x, river[0].y);
      for (let i = 1; i < river.length; i++) {
        ctx.lineTo(river[i].x, river[i].y);
      }
      ctx.stroke();
    }
  }

  ctx.strokeStyle = 'rgba(0,0,0,0.3)';
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);

  return {
    surface,
    ctx,
    width: w,
    height: h,
    seed: map.seed,
    preset: map.preset,
  };
}