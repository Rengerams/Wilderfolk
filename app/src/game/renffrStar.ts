import { TICKS_PER_DAY } from './dayCycle';
import { sayHumanChatPhrase } from './humanChat';
import { isPlayerHuman } from './groupEvents';
import { EntityType, type Entity, type WorldState } from './gameTypes';

/** Lines spoken the night an omen appears (assigned directly to settlers). */
export const RENFFR_OMEN_LINES = [
  'I saw the mark of Renffr in the stars tonight… the harvest will be plentiful.',
  'Did you see it? Renffr — written across the sky!',
  'The letters fell apart… what does Renffr want?',
  'My grandmother spoke of Renffr on nights like this.',
];

const RENFFR_GOSSIP_DAYS = 3;

export interface RenffrLetter {
  char: string;
  nx: number;
  ny: number;
  vx: number;
  vy: number;
  rot: number;
  vr: number;
}

export interface RenffrOmen {
  life: number;
  maxLife: number;
  phase: number;
  phaseTimer: number;
  streakT: number;
  letters: RenffrLetter[];
}

const NAME = 'Renffr';
const STREAK_DURATION = 50;
const REVEAL_DURATION = 45;
const SCATTER_DURATION = 130;

export function createRenffrOmen(): RenffrOmen {
  const spacing = 0.028;
  const startNx = 0.5 - ((NAME.length - 1) * spacing) / 2;
  const letters: RenffrLetter[] = NAME.split('').map((char, i) => ({
    char,
    nx: startNx + i * spacing,
    ny: 0.34,
    vx: 0,
    vy: 0,
    rot: 0,
    vr: 0,
  }));

  return {
    life: STREAK_DURATION + REVEAL_DURATION + SCATTER_DURATION,
    maxLife: STREAK_DURATION + REVEAL_DURATION + SCATTER_DURATION,
    phase: 0,
    phaseTimer: 0,
    streakT: 0,
    letters,
  };
}

export function beginRenffrSettlerChatter(state: WorldState, entities: readonly Entity[]): void {
  state.renffrChatterUntilTick = state.tick + TICKS_PER_DAY * RENFFR_GOSSIP_DAYS;

  const humans = entities.filter(
    (e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e),
  );
  if (humans.length === 0) return;

  const shuffled = [...humans].sort(() => Math.random() - 0.5);
  const count = Math.min(3, shuffled.length);
  for (let i = 0; i < count; i++) {
    sayHumanChatPhrase(
      shuffled[i],
      RENFFR_OMEN_LINES[i % RENFFR_OMEN_LINES.length],
      150,
    );
  }
}

export function isRenffrGossipActive(state: WorldState): boolean {
  return (state.renffrChatterUntilTick ?? 0) > state.tick;
}

export function maybeTriggerRenffrOmen(
  state: WorldState,
  isNight: boolean,
): boolean {
  if (state.renffrOmen || !isNight || state.tick < TICKS_PER_DAY * 3) return false;
  if (state.humanPopulation < 2) return false;
  if (Math.random() >= 0.00035) return false;

  state.renffrOmen = createRenffrOmen();
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, 2.5);
  return true;
}

export function tickRenffrOmen(omen: RenffrOmen | null | undefined): RenffrOmen | null {
  if (!omen) return null;

  omen.life--;
  omen.phaseTimer++;

  if (omen.phase === 0) {
    omen.streakT = Math.min(1, omen.streakT + 0.028);
    if (omen.phaseTimer >= STREAK_DURATION) {
      omen.phase = 1;
      omen.phaseTimer = 0;
    }
  } else if (omen.phase === 1) {
    if (omen.phaseTimer >= REVEAL_DURATION) {
      omen.phase = 2;
      omen.phaseTimer = 0;
      for (let i = 0; i < omen.letters.length; i++) {
        const L = omen.letters[i];
        const spread = (i - (omen.letters.length - 1) / 2) * 0.003;
        L.vx = spread + (Math.random() - 0.5) * 0.018;
        L.vy = -0.012 - Math.random() * 0.018;
        L.vr = (Math.random() - 0.5) * 0.14;
      }
    }
  } else {
    for (const L of omen.letters) {
      L.vy += 0.0009;
      L.vx *= 0.998;
      L.nx += L.vx;
      L.ny += L.vy;
      L.rot += L.vr;
    }
  }

  return omen.life > 0 ? omen : null;
}

export function drawRenffrOmen(
  ctx: CanvasRenderingContext2D,
  omen: RenffrOmen,
  cw: number,
  ch: number,
  time: number,
) {
  const fade = Math.min(1, omen.life / 30);
  const alpha = fade;

  if (omen.phase === 0 || omen.streakT < 1) {
    const t = omen.streakT;
    const x0 = cw * 0.08;
    const y0 = ch * 0.1;
    const x1 = cw * 0.58;
    const y1 = ch * 0.32;
    const sx = x0 + (x1 - x0) * t;
    const sy = y0 + (y1 - y0) * t;

    const grad = ctx.createLinearGradient(sx - 80, sy - 40, sx, sy);
    grad.addColorStop(0, 'rgba(255,255,255,0)');
    grad.addColorStop(0.5, `rgba(253,224,71,${0.35 * alpha})`);
    grad.addColorStop(1, `rgba(255,255,255,${0.95 * alpha})`);

    ctx.save();
    ctx.strokeStyle = grad;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = 12;
    ctx.beginPath();
    ctx.moveTo(sx - 70 * t, sy - 35 * t);
    ctx.lineTo(sx, sy);
    ctx.stroke();

    ctx.fillStyle = `rgba(255,255,255,${alpha})`;
    ctx.shadowBlur = 18;
    ctx.beginPath();
    ctx.arc(sx, sy, 3 + Math.sin(time * 12) * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  if (omen.phase < 1) return;

  const nameAlpha = omen.phase === 1
    ? Math.min(1, omen.phaseTimer / 12)
    : alpha;

  ctx.save();
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 34px Fraunces, Georgia, serif';

  for (const L of omen.letters) {
    const x = L.nx * cw;
    const y = L.ny * ch;
    const wobble = omen.phase === 1 ? Math.sin(time * 3 + L.nx * 40) * 2 : 0;
    ctx.save();
    ctx.translate(x, y + wobble);
    ctx.rotate(L.rot);

    const glow = omen.phase === 1 ? 16 : 8;
    ctx.shadowColor = '#fde047';
    ctx.shadowBlur = glow;
    ctx.fillStyle = `rgba(253,224,71,${nameAlpha})`;
    ctx.strokeStyle = `rgba(120,90,10,${nameAlpha * 0.5})`;
    ctx.lineWidth = 1;
    ctx.strokeText(L.char, 0, 0);
    ctx.fillText(L.char, 0, 0);
    ctx.restore();
  }

  if (omen.phase === 1 && omen.phaseTimer > 18) {
    ctx.font = 'italic 11px Georgia, serif';
    ctx.fillStyle = `rgba(253,224,71,${nameAlpha * 0.45})`;
    ctx.shadowBlur = 0;
    ctx.fillText('…the higher gods, probably', cw * 0.5, ch * 0.34 + 38);
  }

  ctx.restore();
}