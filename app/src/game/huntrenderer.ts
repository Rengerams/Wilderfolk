import type { WorldState } from './gameTypes';
import { EntityType } from './gameTypes';
import { getSpriteFrame } from './spriteLoader';
import { huntAnimProgress, isHuntVisualActive } from './huntvisuals';
import { worldToScreen } from './viewState';

const PREY_SPRITES: Partial<Record<EntityType, string>> = {
  [EntityType.Deer]: '/sprites/deer.png',
  [EntityType.Wolf]: '/sprites/wolf.png',
  [EntityType.Rabbit]: '/sprites/rabbit.png',
};

function lerp(start: number, end: number, amt: number): number {
  return (1 - amt) * start + amt * end;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function drawBow(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  aimAngle: number,
  zoom: number,
  drawn: boolean,
) {
  const scale = Math.max(0.55, zoom * 0.9);
  ctx.save();
  ctx.translate(sx, sy);
  ctx.rotate(aimAngle);
  ctx.scale(scale, scale);

  ctx.strokeStyle = '#5d4037';
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.arc(0, 0, 10, -Math.PI * 0.55, Math.PI * 0.55);
  ctx.stroke();

  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-9, -8);
  ctx.lineTo(-9, 8);
  ctx.stroke();

  if (drawn) {
    ctx.strokeStyle = '#d4a574';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-9, 0);
    ctx.lineTo(14, 0);
    ctx.stroke();
    ctx.fillStyle = '#4a3728';
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(10, -2);
    ctx.lineTo(10, 2);
    ctx.closePath();
    ctx.fill();
  }

  ctx.restore();
}

function drawArrow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  zoom: number,
) {
  const len = Math.max(10, 14 * zoom);
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.strokeStyle = '#8d6e63';
  ctx.lineWidth = Math.max(1.2, 1.8 * zoom);
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(-len * 0.45, 0);
  ctx.lineTo(len * 0.35, 0);
  ctx.stroke();
  ctx.fillStyle = '#bdbdbd';
  ctx.beginPath();
  ctx.moveTo(len * 0.35, 0);
  ctx.lineTo(len * 0.2, -3 * zoom);
  ctx.lineTo(len * 0.2, 3 * zoom);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCombatBurst(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  size: number,
  tick: number,
  id: string,
) {
  const pulse = 0.5 + Math.sin(tick * 0.5 + id.charCodeAt(0)) * 0.5;
  ctx.save();
  ctx.strokeStyle = `rgba(251,191,36,${0.35 + pulse * 0.35})`;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(sx, sy, size * 0.55 + pulse * 3, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawFightBackBanner(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  zoom: number,
  pulse: number,
) {
  const label = 'WOLF FIGHTS BACK!';
  const fontSize = Math.max(11, 14 * zoom);
  ctx.font = `bold ${fontSize}px sans-serif`;
  ctx.textAlign = 'center';
  const textW = ctx.measureText(label).width;
  const padX = 8;
  const padY = 5;
  const bw = textW + padX * 2;
  const bh = fontSize + padY * 2;
  const bx = sx - bw / 2;
  const by = sy - bh - 6 + Math.sin(pulse * 8) * 2;

  ctx.fillStyle = 'rgba(127,29,29,0.92)';
  ctx.strokeStyle = '#fca5a5';
  ctx.lineWidth = 2;
  ctx.beginPath();
  if (ctx.roundRect) {
    ctx.roundRect(bx, by, bw, bh, 4);
  } else {
    ctx.rect(bx, by, bw, bh);
  }
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#fef2f2';
  ctx.fillText(label, sx, by + padY + fontSize * 0.82);
}

function drawPreySprite(
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  preyType: EntityType,
  zoom: number,
  shake: number,
  tintRed = false,
) {
  const src = PREY_SPRITES[preyType] || '/sprites/rabbit.png';
  const frame = getSpriteFrame(src);
  const h = Math.max(14, 22 * zoom);
  const bob = Math.sin(shake) * 2;

  if (frame) {
    const aspect = frame.sw / frame.sh;
    const w = h * aspect;
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if (tintRed) {
      ctx.filter = 'sepia(1) hue-rotate(-50deg) saturate(3)';
    }
    ctx.drawImage(frame.image, frame.sx, frame.sy, frame.sw, frame.sh, sx - w / 2, sy - h - bob, w, h);
    ctx.restore();
    return;
  }

  ctx.fillStyle = tintRed ? '#ef4444' : '#78909c';
  ctx.beginPath();
  ctx.ellipse(sx, sy - h * 0.4 - bob, h * 0.35, h * 0.28, 0, 0, Math.PI * 2);
  ctx.fill();
}

export function renderHuntVisuals(
  ctx: CanvasRenderingContext2D,
  state: WorldState,
  camera: import('./gameTypes').Camera,
) {
  if (!state.huntVisuals || state.huntVisuals.length === 0 || camera.zoom < 0.25) return;

  const now = Date.now();
  const cw = ctx.canvas.width;
  const ch = ctx.canvas.height;

  for (const visual of state.huntVisuals) {
    if (!isHuntVisualActive(visual, now)) continue;

    const progress = huntAnimProgress(visual, now);
    
    const [fromSx, fromSy] = worldToScreen(visual.fromX, visual.fromY, camera, cw, ch);
    const [toSx, toSy] = worldToScreen(visual.toX, visual.toY, camera, cw, ch);
    const angle = Math.atan2(toSy - fromSy, toSx - fromSx);

    if (visual.foughtBack) {
      const chargeT = clamp(progress / 0.55, 0, 1);
      const preySx = lerp(toSx, fromSx, chargeT);
      const preySy = lerp(toSy, fromSy, chargeT);

      drawBow(ctx, fromSx, fromSy - 18 * camera.zoom, angle + Math.PI * chargeT, camera.zoom, false);
      drawPreySprite(ctx, preySx, preySy, visual.preyType, camera.zoom, now * 0.018, true);

      if (chargeT < 0.12) {
        const missAngle = angle + Math.PI * 0.5;
        drawArrow(ctx, toSx, toSy, missAngle, camera.zoom);
      }

      if (chargeT > 0.75) {
        drawCombatBurst(ctx, fromSx, fromSy - 14 * camera.zoom, 14 * camera.zoom, state.tick, visual.id);
      }

      drawFightBackBanner(ctx, (fromSx + preySx) / 2, Math.min(fromSy, preySy) - 28 * camera.zoom, camera.zoom, progress);
      continue;
    }

    drawPreySprite(ctx, toSx, toSy, visual.preyType, camera.zoom, state.tick * 0.4 + visual.id.length);

    if (progress < 0.55) {
      const flyT = progress / 0.55;
      const ax = lerp(fromSx, toSx, flyT);
      const ay = lerp(fromSy, toSy, flyT);
      drawArrow(ctx, ax, ay, angle, camera.zoom);
      drawBow(ctx, fromSx, fromSy - 18 * camera.zoom, angle, camera.zoom, true);
    } else if (visual.success) {
      drawBow(ctx, fromSx, fromSy - 18 * camera.zoom, angle, camera.zoom, false);
      drawCombatBurst(ctx, toSx, toSy - 10 * camera.zoom, 10 * camera.zoom, state.tick, visual.id);
      ctx.font = `bold ${Math.max(10, 12 * camera.zoom)}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#fb923c';
      ctx.fillText('+MEAT', (fromSx + toSx) / 2, (fromSy + toSy) / 2 - 8);
    }
  }
}