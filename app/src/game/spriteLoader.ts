import { loadHumanWalkSheets } from './humanSprites';

export interface SpriteFrame {
  image: CanvasImageSource;
  sx: number;
  sy: number;
  sw: number;
  sh: number;
  /** Y anchor within the frame (0 = top, 1 = feet). Defaults to 0.85 in drawSpriteFrame. */
  anchorY?: number;
}

const spriteCache = new Map<string, HTMLImageElement>();
const frameCache = new Map<string, SpriteFrame>();
const loadingPromises = new Map<string, Promise<SpriteFrame>>();

export function loadSprite(src: string): Promise<SpriteFrame> {
  if (frameCache.has(src)) return Promise.resolve(frameCache.get(src)!);
  if (loadingPromises.has(src)) return loadingPromises.get(src)!;

  const promise = new Promise<SpriteFrame>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      spriteCache.set(src, img);
      // Use full image bounds — alpha trim skews aspect ratio and warps sprites.
      const isHumanSprite = src.includes('/human_');
      const frame: SpriteFrame = {
        image: img,
        sx: 0,
        sy: 0,
        sw: img.width,
        sh: img.height,
        // Pioneer PNGs are authored feet-down; anchor the bottom edge when drawing.
        ...(isHumanSprite ? { anchorY: 1 as const } : {}),
      };
      frameCache.set(src, frame);
      loadingPromises.delete(src);
      resolve(frame);
    };
    img.onerror = () => {
      loadingPromises.delete(src);
      reject(new Error(`Failed to load sprite: ${src}`));
    };
    img.src = src;
  });

  loadingPromises.set(src, promise);
  return promise;
}

export function getSprite(src: string): HTMLImageElement | null {
  return spriteCache.get(src) || null;
}

export function getSpriteFrame(src: string): SpriteFrame | null {
  return frameCache.get(src) || null;
}

export function isSpriteLoaded(src: string): boolean {
  return frameCache.has(src);
}

export function preloadAllSprites(): Promise<void> {
  const sprites = [
    '/sprites/rabbit.png',
    '/sprites/deer.png',
    '/sprites/wolf.png',
    '/sprites/fox.png',
    '/sprites/tree.png',
    '/sprites/grass.png',
    '/sprites/house.png',
    '/sprites/farm.png',
    '/sprites/greenhouse.png',
    '/sprites/barn.png',
    '/sprites/silo.png',
    '/sprites/lumbermill.png',
    '/sprites/quarry.png',
    '/sprites/mine.png',
    '/sprites/mill.png',
    '/sprites/blacksmith.png',
    '/sprites/workshop.png',
    '/sprites/store.png',
    '/sprites/market.png',
    '/sprites/school.png',
    '/sprites/hospital.png',
    '/sprites/townhall.png',
    '/sprites/church.png',
    '/sprites/well.png',
    '/sprites/road.png',
    '/sprites/mansion.png',
    '/sprites/barracks.png',
    '/sprites/watchtower.png',
    '/sprites/wall_straight.png',
    '/sprites/wall_corner.png',
    '/sprites/wall_gate.png',
    '/sprites/human_male.png',
    '/sprites/human_female.png',
  ];

  return Promise.all([
    ...sprites.map(loadSprite),
    loadHumanWalkSheets(),
  ]).then(() => {});
}