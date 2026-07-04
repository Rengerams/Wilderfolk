import type { Building, Entity, RivalSettlement, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycle';
import { hasIronSpears, hasStoneSpears } from './combat';
import { logEvent } from './eventLog';
import { isPlayerHuman, isRivalAtPeace } from './groupEvents';
import {
  computeMilitiaBreakdown,
  getMilitiaArmamentLabel,
  getMilitiaSpearTier,
} from './militiaBalance';

export interface RaidChoice {
  id: string;
  label: string;
  hint: string;
}

export interface RaidEvent {
  id: string;
  rivalId: string;
  rivalName: string;
  title: string;
  description: string;
  emoji: string;
  choices: RaidChoice[];
  createdAtTick: number;
  /** Tick when unanswered raid auto-resolves (distance-scaled march time). */
  expiresAtTick: number;
  /** Camp distance in tiles when the raid was declared. */
  marchDistanceTiles: number;
  attackerStrength: number;
  lootFood: number;
  lootGold: number;
}

const RAID_RESPONSE_MIN_DAYS = 2;
const RAID_RESPONSE_MAX_DAYS = 6;
/** Legacy fixed window for saves/events missing `expiresAtTick`. */
const RAID_EXPIRE_TICKS_LEGACY = 3 * TICKS_PER_DAY;
const PIXELS_PER_TILE = 10;
const RAID_FOOD_MIN = 22;
const RAID_FOOD_MAX = 50;
/** Home-turf bonus when you attack a rival camp (harder than meeting them at your gate). */
const OUTGOING_RAID_DEFENSE_MULT = 1.25;

export function getCampDistancePixels(
  state: WorldState,
  buildings: Building[],
  camp: { campX: number; campY: number },
): number {
  const player = getPlayerCampCenter(state, buildings);
  return Math.hypot(camp.campX - player.x, camp.campY - player.y);
}

export function getCampDistanceTiles(distancePixels: number): number {
  return Math.round(distancePixels / PIXELS_PER_TILE);
}

export function formatCampDistance(distancePixels: number): string {
  const tiles = getCampDistanceTiles(distancePixels);
  return `${tiles} tile${tiles === 1 ? '' : 's'}`;
}

/** How long the player has to respond — farther camps get a longer march window. */
export function getIncomingRaidResponseDays(distanceTiles: number): number {
  const extra = Math.floor(distanceTiles / 18);
  return Math.min(
    RAID_RESPONSE_MAX_DAYS,
    Math.max(RAID_RESPONSE_MIN_DAYS, RAID_RESPONSE_MIN_DAYS + extra),
  );
}

export function getIncomingRaidExpireTicks(distancePixels: number): number {
  return getIncomingRaidResponseDays(getCampDistanceTiles(distancePixels)) * TICKS_PER_DAY;
}

export function getRaidExpiresAtTick(evt: RaidEvent): number {
  return evt.expiresAtTick ?? evt.createdAtTick + RAID_EXPIRE_TICKS_LEGACY;
}

export function getRaidTicksRemaining(evt: RaidEvent, currentTick: number): number {
  return Math.max(0, getRaidExpiresAtTick(evt) - currentTick);
}

export function getRaidDaysRemaining(evt: RaidEvent, currentTick: number): number {
  return Math.max(0, Math.ceil(getRaidTicksRemaining(evt, currentTick) / TICKS_PER_DAY));
}

export function formatRaidDeadline(evt: RaidEvent, currentTick: number): string {
  const days = getRaidDaysRemaining(evt, currentTick);
  if (days <= 0) return 'arriving now';
  return `${days} day${days === 1 ? '' : 's'} left`;
}

/** March provisions for an outgoing raid — farther camps need more food packed. */
export function getOutgoingRaidFoodCost(distancePixels: number): number {
  const tiles = distancePixels / PIXELS_PER_TILE;
  const cost = 18 + Math.round(tiles / 4);
  return Math.min(RAID_FOOD_MAX, Math.max(RAID_FOOD_MIN, cost));
}

/** Remove in-flight raid events when a truce is signed. */
export function cancelPendingRaidsForRival(state: WorldState, rivalId: string): boolean {
  const before = state.pendingRaidEvents?.length ?? 0;
  state.pendingRaidEvents = (state.pendingRaidEvents ?? []).filter((e) => e.rivalId !== rivalId);
  return (state.pendingRaidEvents?.length ?? 0) < before;
}

/** Rival strength when they attack you (war-band on the march). */
export function getRivalRaidStrength(rival: RivalSettlement): number {
  const mood = rival.relationship === 'tense' ? 1.35 : rival.relationship === 'competitive' ? 1.15 : 0.9;
  return Math.round(rival.population * 12 * mood);
}

/** Rival strength when you attack their camp — includes home-turf defense bonus. */
export function getRivalDefenseStrength(rival: RivalSettlement): number {
  return Math.round(getRivalRaidStrength(rival) * OUTGOING_RAID_DEFENSE_MULT);
}

export type CounterRaidTier = 'success' | 'meager' | 'fail';

export function resolveCounterRaidRatio(attacker: number, defender: number): CounterRaidTier {
  const ratio = attacker / Math.max(defender, 1);
  if (ratio >= 1.35) return 'success';
  if (ratio >= 1.0) return 'meager';
  return 'fail';
}

function getCounterRaidBlockReason(
  state: WorldState,
  rival: RivalSettlement | undefined,
  hasSpears: boolean,
  outgoingRaidFoodCost: number | null,
): string | null {
  if (!rival) return null;
  if (isRivalAtPeace(rival)) return `Peace treaty — ${rival.peaceTreatyDays} days left`;
  if (rival.relationship === 'friendly') return 'Friendly — cannot raid';
  if (!hasSpears) return 'Need stone/iron spears';
  if (state.humanPopulation < 8) return `Need 8+ population (have ${state.humanPopulation})`;
  if (outgoingRaidFoodCost != null && state.resources.food < outgoingRaidFoodCost) {
    return `Need ${outgoingRaidFoodCost}🍖 provisions (have ${state.resources.food})`;
  }
  return null;
}

export function getOutgoingRaidFoodCostForRival(state: WorldState, rival: RivalSettlement): number {
  return getOutgoingRaidFoodCost(getCampDistancePixels(state, state.buildings, rival));
}

/** Stable village anchor for distance, raids, and war-band march targets. */
export function getPlayerCampCenter(state: WorldState, buildings: Building[]): { x: number; y: number } {
  const playerBuildings = buildings.filter((b) => b.completed && b.faction !== 'rival');
  const townHall = playerBuildings.find((b) => b.type === BuildingType.TownHall);
  if (townHall) {
    return { x: townHall.x + townHall.width / 2, y: townHall.y + townHall.height / 2 };
  }
  const house = playerBuildings.find((b) => b.type === BuildingType.House);
  if (house) {
    return { x: house.x + house.width / 2, y: house.y + house.height / 2 };
  }
  const players = state.entities.filter((e) => e.alive && isPlayerHuman(e));
  if (players.length > 0) {
    return {
      x: players.reduce((s, e) => s + e.x, 0) / players.length,
      y: players.reduce((s, e) => s + e.y, 0) / players.length,
    };
  }
  return { x: state.width / 2, y: state.height / 2 };
}

export function isRaidMarchingForRival(state: WorldState, groupId: string): boolean {
  return (state.pendingRaidEvents ?? []).some((r) => r.rivalId === groupId);
}

export function countArmedMilitia(state: WorldState, entities: Entity[]): number {
  const armed = hasIronSpears(state) || hasStoneSpears(state);
  if (!armed) return 0;
  return entities.filter((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile).length;
}

export function getMilitiaStrength(state: WorldState, entities: Entity[]): number {
  return computeMilitiaBreakdown(state, entities, { includeStructures: false }).militiaStrength;
}

export function getBarricadeStrength(state: WorldState, entities: Entity[]): number {
  return computeMilitiaBreakdown(state, entities).barricadeStrength;
}

export type RaidOutcomeTier = 'decisive' | 'narrow' | 'stalemate' | 'defeat';

export interface CombatPreview {
  militiaCount: number;
  militiaStrength: number;
  barricadeStrength: number;
  hasSpears: boolean;
  armamentLabel: string | null;
  breakdown: string[];
  rivalStrength: number | null;
  distanceTiles: number | null;
  distanceLabel: string | null;
  outgoingRaidFoodCost: number | null;
  incomingPayoffFood: number | null;
  counterRaidRivalStrength: number | null;
  canCounterRaid: boolean;
  counterRaidBlockReason: string | null;
  defendRatio: number | null;
  barricadeRatio: number | null;
  counterRaidRatio: number | null;
  defendOutcome: RaidOutcomeTier | null;
  barricadeOutcome: RaidOutcomeTier | null;
  counterRaidOutcome: CounterRaidTier | null;
}

export const RAID_OUTCOME_LABELS: Record<RaidOutcomeTier, { label: string; hint: string; tone: 'good' | 'warn' | 'bad' }> = {
  decisive: { label: 'Likely victory', hint: 'Rep +4, relations ease, long peace', tone: 'good' },
  narrow: { label: 'Costly win', hint: 'Minor building damage, small rep gain', tone: 'good' },
  stalemate: { label: 'Stalemate', hint: 'Partial loot, damage, casualty risk', tone: 'warn' },
  defeat: { label: 'Likely defeat', hint: 'Full loot, heavy damage, high casualty risk', tone: 'bad' },
};

export const COUNTER_RAID_LABELS: Record<CounterRaidTier, { label: string; hint: string; tone: 'good' | 'warn' | 'bad' }> = {
  success: { label: 'Raid would succeed', hint: 'Seize food & gold; relations worsen; camp defends at +25%', tone: 'good' },
  meager: { label: 'Meager spoils', hint: 'Small food gain, high tension; camp defends at +25%', tone: 'warn' },
  fail: { label: 'Raid would fail', hint: 'Provisions lost + 15🍖 more; casualties; counter-raid risk', tone: 'bad' },
};

export const RAID_PREPARATION_HINT =
  'Raids test preparation you already made — walls, forge tier, guards, and food for tribute. There is no battle screen; outcomes resolve from strength ratios.';
export const DEFENSE_RATIO_HINT = 'Ratio ≥135% decisive · ≥95% narrow · ≥65% stalemate · below = defeat';
export const MILITIA_TIER_HINT = 'Iron spear/shield tiers replace stone/wooden — bonuses do not stack.';
export const COUNTER_RAID_RATIO_HINT = 'Ratio ≥135% full spoils · ≥100% meager · below = repelled (+15🍖 extra loss)';

export function canLaunchRaidOnRival(
  state: WorldState,
  rival: RivalSettlement,
): { ok: boolean; foodCost: number; blockReason?: string } {
  const foodCost = getOutgoingRaidFoodCostForRival(state, rival);
  if (isRivalAtPeace(rival)) return { ok: false, foodCost, blockReason: 'At peace' };
  if (rival.relationship === 'friendly') return { ok: false, foodCost, blockReason: 'Friendly relations' };
  if (!(hasIronSpears(state) || hasStoneSpears(state))) {
    return { ok: false, foodCost, blockReason: 'Need stone or iron spears' };
  }
  if (state.humanPopulation < 8) return { ok: false, foodCost, blockReason: 'Need 8+ population' };
  if (state.resources.food < foodCost) {
    return { ok: false, foodCost, blockReason: `Need ${foodCost}🍖 march provisions` };
  }
  return { ok: true, foodCost };
}

export function getCombatPreview(
  state: WorldState,
  options?: { attackerStrength?: number; rival?: RivalSettlement; incomingPayoffFood?: number },
): CombatPreview {
  const entities = state.entities;
  const militiaBreakdown = computeMilitiaBreakdown(state, entities);
  const breakdown = [...militiaBreakdown.lines];
  const armament = getMilitiaArmamentLabel(state);
  if (armament) {
    breakdown.unshift(`Armament: ${armament}`);
  }
  const count = militiaBreakdown.adultCount;
  const militiaStrength = militiaBreakdown.militiaStrength;
  const barricadeStrength = militiaBreakdown.barricadeStrength;
  const hasSpears = getMilitiaSpearTier(state) !== 'none';

  let rivalStrength: number | null = null;
  let distanceTiles: number | null = null;
  let distanceLabel: string | null = null;
  let outgoingRaidFoodCost: number | null = null;

  if (options?.rival) {
    const distancePx = getCampDistancePixels(state, state.buildings, options.rival);
    distanceTiles = getCampDistanceTiles(distancePx);
    distanceLabel = formatCampDistance(distancePx);
    outgoingRaidFoodCost = getOutgoingRaidFoodCost(distancePx);
    breakdown.push(`${options.rival.name} camp: ${distanceLabel} from your village`);
    breakdown.push(`Raid provisions: ${outgoingRaidFoodCost}🍖 (march rations)`);
  }

  if (options?.attackerStrength != null) {
    rivalStrength = options.attackerStrength;
  } else if (options?.rival) {
    rivalStrength = getRivalRaidStrength(options.rival);
    breakdown.push(
      `${options.rival.name} war-band: ${options.rival.population} pop × 12 × ${options.rival.relationship === 'tense' ? '1.35' : options.rival.relationship === 'competitive' ? '1.15' : '0.9'} = ${rivalStrength}`,
    );
  }

  const counterRaidRivalStrength = options?.rival ? getRivalDefenseStrength(options.rival) : null;
  if (counterRaidRivalStrength != null && options?.rival) {
    breakdown.push(
      `${options.rival.name} camp defense: ${rivalStrength ?? getRivalRaidStrength(options.rival)} × ${OUTGOING_RAID_DEFENSE_MULT} home turf = ${counterRaidRivalStrength}`,
    );
  }

  const counterRaidBlockReason = getCounterRaidBlockReason(
    state,
    options?.rival,
    hasSpears,
    outgoingRaidFoodCost,
  );
  const canCounterRaid = options?.rival != null && counterRaidBlockReason == null;

  const defendRatio = rivalStrength != null && rivalStrength > 0 ? militiaStrength / rivalStrength : null;
  const barricadeRatio = rivalStrength != null && rivalStrength > 0 ? barricadeStrength / rivalStrength : null;
  const counterRaidRatio = counterRaidRivalStrength != null && counterRaidRivalStrength > 0
    ? militiaStrength / counterRaidRivalStrength
    : null;

  return {
    militiaCount: count,
    militiaStrength,
    barricadeStrength,
    hasSpears,
    armamentLabel: armament,
    breakdown,
    rivalStrength,
    distanceTiles,
    distanceLabel,
    outgoingRaidFoodCost,
    incomingPayoffFood: options?.incomingPayoffFood ?? null,
    counterRaidRivalStrength,
    canCounterRaid,
    counterRaidBlockReason,
    defendRatio,
    barricadeRatio,
    counterRaidRatio,
    defendOutcome: defendRatio != null ? resolveDefenseRatio(militiaStrength, rivalStrength!) : null,
    barricadeOutcome: barricadeRatio != null ? resolveDefenseRatio(barricadeStrength, rivalStrength!) : null,
    counterRaidOutcome: counterRaidRatio == null
      ? null
      : resolveCounterRaidRatio(militiaStrength, counterRaidRivalStrength!),
  };
}

function pushFloat(state: WorldState, x: number, y: number, text: string, color: string) {
  state.floatingTexts.push({
    id: state.nextFloatingTextId++,
    x, y, text, color,
    life: 28, maxLife: 28, scale: 1,
  });
}

function pushNews(state: WorldState, title: string, message: string, type: 'positive' | 'negative' | 'neutral') {
  state.bigNews.push({
    id: `raid_${state.tick}_${state.bigNews.length}`,
    title,
    message,
    type,
    createdAt: state.tick,
    dismissed: false,
  });
}

function flashMilitia(entities: Entity[], ticks = 22) {
  for (const e of entities) {
    if (e.alive && isPlayerHuman(e) && !e.isJuvenile) {
      e.combatTicks = Math.max(e.combatTicks ?? 0, ticks);
      e.flash = 10;
    }
  }
}

function damageRandomPlayerBuilding(state: WorldState, amount: number): Building | null {
  const targets = state.buildings.filter((b) => b.completed && b.faction !== 'rival');
  if (targets.length === 0) return null;
  const b = targets[Math.floor(Math.random() * targets.length)];
  b.health = Math.max(5, b.health - amount);
  return b;
}

function maybeRaidCasualty(state: WorldState, entities: Entity[], chance: number): Entity | null {
  const pool = entities.filter((e) => e.alive && isPlayerHuman(e) && !e.isJuvenile);
  if (pool.length === 0 || Math.random() > chance) return null;
  const victim = pool[Math.floor(Math.random() * pool.length)];
  victim.alive = false;
  const name = victim.name ? `${victim.name}${victim.surname ? ` ${victim.surname}` : ''}` : 'A settler';
  logEvent(state, 'death', `${name} fell defending the village`, name);
  return victim;
}

export function resolveDefenseRatio(defender: number, attacker: number): RaidOutcomeTier {
  const ratio = defender / Math.max(attacker, 1);
  if (ratio >= 1.35) return 'decisive';
  if (ratio >= 0.95) return 'narrow';
  if (ratio >= 0.65) return 'stalemate';
  return 'defeat';
}

function applyRaidLoot(state: WorldState, food: number, gold: number) {
  if (food > 0) state.resources.food = Math.max(0, state.resources.food - food);
  if (gold > 0) state.resources.gold = Math.max(0, state.resources.gold - gold);
}

function raidChoices(lootFood: number, rivalName: string): RaidChoice[] {
  return [
    {
      id: 'defend',
      label: 'Defend with militia (spears)',
      hint: 'Stone or iron spears required — meet them in open battle.',
    },
    {
      id: 'barricade',
      label: 'Barricade the village (20🪵 + 10🪨)',
      hint: 'No spears needed — fortify and hold; weaker than a full militia fight.',
    },
    {
      id: 'payoff',
      label: `Pay them off (${lootFood}🍖)`,
      hint: `${rivalName} takes food and leaves without a fight.`,
    },
  ];
}

export function maybeQueueRaid(state: WorldState, rival: RivalSettlement, allAlive: Entity[]): void {
  if (!state.pendingRaidEvents) state.pendingRaidEvents = [];
  if (state.pendingRaidEvents.some((r) => r.rivalId === rival.id)) return;
  if (rival.raidCooldownDays > 0) return;
  if (isRivalAtPeace(rival)) return;
  if (rival.relationship !== 'tense' && rival.relationship !== 'competitive') return;
  if (isPlayerHumanCount(allAlive) < 5) return;

  const hasPlayerStructure = state.buildings.some((b) => b.completed && b.faction !== 'rival');
  if (!hasPlayerStructure) return;

  const chance = rival.relationship === 'tense' ? 0.22 : 0.12;
  if (Math.random() > chance) return;

  const attackerStrength = getRivalRaidStrength(rival);
  const lootFood = 20 + Math.floor(Math.random() * 25);
  const lootGold = rival.relationship === 'tense' ? 8 + Math.floor(Math.random() * 12) : 0;
  const marchDistancePx = getCampDistancePixels(state, state.buildings, rival);
  const marchDistanceTiles = getCampDistanceTiles(marchDistancePx);
  const responseDays = getIncomingRaidResponseDays(marchDistanceTiles);
  const expireTicks = responseDays * TICKS_PER_DAY;
  const distanceLabel = formatCampDistance(marchDistancePx);

  const event: RaidEvent = {
    id: `raid_${rival.id}_${state.tick}`,
    rivalId: rival.id,
    rivalName: rival.name,
    emoji: '⚔️',
    title: `${rival.name} is raiding!`,
    description: `War-bands march from ${distanceLabel} away. You have ${responseDays} days to defend, barricade, or pay them off.`,
    choices: raidChoices(lootFood, rival.name),
    createdAtTick: state.tick,
    expiresAtTick: state.tick + expireTicks,
    marchDistanceTiles,
    attackerStrength,
    lootFood,
    lootGold,
  };

  state.pendingRaidEvents.push(event);
  rival.raidCooldownDays = 21;
  pushNews(state, '⚔️ Raid incoming!', `${rival.name} war-bands approach your border. Respond in the banner or rival inspector.`, 'negative');
  logEvent(state, 'combat', `${rival.name} launched a raid on the village`, rival.name);
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, 5);
}

function isPlayerHumanCount(allAlive: Entity[]): number {
  return allAlive.filter((e) => e.alive && isPlayerHuman(e)).length;
}

export function tickPendingRaidEvents(state: WorldState, allAlive: Entity[]): void {
  if (!state.pendingRaidEvents?.length) return;

  const expired: RaidEvent[] = [];
  state.pendingRaidEvents = state.pendingRaidEvents.filter((evt) => {
    if (state.tick < getRaidExpiresAtTick(evt)) return true;
    expired.push(evt);
    return false;
  });

  for (const evt of expired) {
    const rival = state.rivalSettlements.find((r) => r.id === evt.rivalId);
    applyRaidLoot(state, evt.lootFood, Math.floor(evt.lootGold * 0.6));
    damageRandomPlayerBuilding(state, 12);
    state.villageReputation = Math.max(0, state.villageReputation - 4);
    if (rival) rival.relationship = 'tense';
    pushFloat(state, getPlayerCampCenter(state, state.buildings).x, getPlayerCampCenter(state, state.buildings).y - 25, `-${evt.lootFood}🍖 Raid!`, '#f87171');
    logEvent(state, 'combat', `Raid from ${evt.rivalName} succeeded — no response in time`, evt.rivalName);
    maybeRaidCasualty(state, allAlive, 0.25);
  }
}

export function respondToRaidEvent(
  originalState: WorldState,
  eventId: string,
  choiceId: string,
): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const idx = state.pendingRaidEvents?.findIndex((e) => e.id === eventId) ?? -1;
  if (idx < 0) return state;

  const event = state.pendingRaidEvents[idx];
  const rival = state.rivalSettlements.find((r) => r.id === event.rivalId);
  const allAlive = state.entities;
  const camp = getPlayerCampCenter(state, state.buildings);
  const defenderStrength = getMilitiaStrength(state, allAlive);
  const remove = () => {
    state.pendingRaidEvents = state.pendingRaidEvents.filter((e) => e.id !== eventId);
  };

  if (choiceId === 'payoff') {
    if (state.resources.food < event.lootFood) {
      pushFloat(state, camp.x, camp.y - 20, `Need ${event.lootFood}🍖`, '#f97316');
      return state;
    }
    state.resources.food -= event.lootFood;
    if (rival) {
      rival.relationship = rival.relationship === 'tense' ? 'competitive' : rival.relationship;
      rival.raidCooldownDays = 14;
    }
    pushFloat(state, camp.x, camp.y - 20, 'Paid off', '#eab308');
    logEvent(state, 'combat', `Paid ${event.lootFood} food to end ${event.rivalName}'s raid`, event.rivalName);
    remove();
    return state;
  }

  if (choiceId === 'barricade') {
    if (state.resources.wood < 20 || state.resources.stone < 10) {
      pushFloat(state, camp.x, camp.y - 20, 'Need 20🪵 + 10🪨', '#f97316');
      return state;
    }
    state.resources.wood -= 20;
    state.resources.stone -= 10;
    const effectiveDef = getBarricadeStrength(state, allAlive);
    const outcome = resolveDefenseRatio(effectiveDef, event.attackerStrength);
    if (outcome === 'defeat' || outcome === 'stalemate') {
      applyRaidLoot(state, Math.floor(event.lootFood * 0.5), Math.floor(event.lootGold * 0.4));
      damageRandomPlayerBuilding(state, 8);
      state.villageReputation = Math.max(0, state.villageReputation - 2);
      logEvent(state, 'combat', `Barricade held poorly against ${event.rivalName} — partial losses`, event.rivalName);
    } else {
      state.villageReputation = Math.min(100, state.villageReputation + 2);
      if (rival) rival.relationship = rival.relationship === 'tense' ? 'competitive' : rival.relationship;
      pushFloat(state, camp.x, camp.y - 20, 'Held!', '#22c55e');
      logEvent(state, 'combat', `Barricade repelled ${event.rivalName}'s raid`, event.rivalName);
    }
    flashMilitia(allAlive, 14);
    if (rival) rival.raidCooldownDays = 18;
    remove();
    return state;
  }

  if (choiceId === 'defend') {
    if (!hasStoneSpears(state) && !hasIronSpears(state)) {
      pushFloat(state, camp.x, camp.y - 20, 'Need spears', '#f97316');
      return state;
    }
    if (defenderStrength <= 0) {
      pushFloat(state, camp.x, camp.y - 20, 'No militia strength', '#f97316');
      return state;
    }

    const outcome = resolveDefenseRatio(defenderStrength, event.attackerStrength);
    flashMilitia(allAlive, 24);
    state.screenShakeImpulse = Math.max(state.screenShakeImpulse, 6);

    switch (outcome) {
      case 'decisive':
        state.villageReputation = Math.min(100, state.villageReputation + 4);
        if (rival) {
          rival.relationship = rival.relationship === 'tense' ? 'competitive' : 'neutral';
          rival.raidCooldownDays = 28;
        }
        pushFloat(state, camp.x, camp.y - 20, 'Victory!', '#22c55e');
        logEvent(state, 'combat', `Militia routed ${event.rivalName}'s war-band`, event.rivalName);
        break;
      case 'narrow':
        damageRandomPlayerBuilding(state, 6);
        state.villageReputation = Math.min(100, state.villageReputation + 1);
        if (rival) rival.raidCooldownDays = 20;
        pushFloat(state, camp.x, camp.y - 20, 'Costly win', '#fbbf24');
        logEvent(state, 'combat', `Militia drove back ${event.rivalName} with minor damage`, event.rivalName);
        break;
      case 'stalemate':
        applyRaidLoot(state, Math.floor(event.lootFood * 0.65), Math.floor(event.lootGold * 0.5));
        damageRandomPlayerBuilding(state, 10);
        state.villageReputation = Math.max(0, state.villageReputation - 3);
        if (rival) rival.relationship = 'tense';
        maybeRaidCasualty(state, allAlive, 0.15);
        logEvent(state, 'combat', `Stalemate with ${event.rivalName} — village looted`, event.rivalName);
        break;
      case 'defeat':
        applyRaidLoot(state, event.lootFood, event.lootGold);
        damageRandomPlayerBuilding(state, 18);
        state.villageReputation = Math.max(0, state.villageReputation - 6);
        if (rival) rival.relationship = 'tense';
        maybeRaidCasualty(state, allAlive, 0.35);
        pushFloat(state, camp.x, camp.y - 20, 'Raided!', '#f87171');
        logEvent(state, 'combat', `${event.rivalName} overran the militia`, event.rivalName);
        break;
    }
    remove();
    return state;
  }

  return state;
}

export function launchRaidOnRival(originalState: WorldState, rivalId: string): WorldState {
  const state = structuredClone(originalState) as WorldState;
  const rival = state.rivalSettlements.find((r) => r.id === rivalId);
  if (!rival) return state;
  if (rival.relationship === 'friendly') return state;
  if (isRivalAtPeace(rival)) return state;
  if (!hasStoneSpears(state) && !hasIronSpears(state)) return state;
  if (state.humanPopulation < 8) return state;
  const raidFoodCost = getOutgoingRaidFoodCostForRival(state, rival);
  if (state.resources.food < raidFoodCost) return state;

  state.resources.food -= raidFoodCost;
  const defenderStrength = getMilitiaStrength(state, state.entities);
  const rivalDefense = getRivalDefenseStrength(rival);
  const outcome = resolveCounterRaidRatio(defenderStrength, rivalDefense);

  flashMilitia(state.entities, 20);
  state.screenShakeImpulse = Math.max(state.screenShakeImpulse, 4);

  if (outcome === 'success') {
    const food = 25 + Math.floor(Math.random() * 20);
    const gold = 10 + Math.floor(Math.random() * 15);
    state.resources.food = Math.min(state.storageMax.food, state.resources.food + food);
    state.resources.gold = Math.min(state.storageMax.gold, state.resources.gold + gold);
    rival.relationship = 'tense';
    rival.raidCooldownDays = 10;
    pushFloat(state, rival.campX, rival.campY - 20, `+${food}🍖 +${gold}g`, '#22c55e');
    logEvent(state, 'combat', `Raid on ${rival.name} succeeded — seized supplies`, rival.name);
    state.villageReputation = Math.max(0, state.villageReputation - 5);
  } else if (outcome === 'meager') {
    const food = 10 + Math.floor(Math.random() * 10);
    state.resources.food = Math.min(state.storageMax.food, state.resources.food + food);
    rival.relationship = 'tense';
    rival.raidCooldownDays = 14;
    state.villageReputation = Math.max(0, state.villageReputation - 4);
    logEvent(state, 'combat', `Raid on ${rival.name} — meager spoils, high tension`, rival.name);
  } else {
    state.resources.food = Math.max(0, state.resources.food - 15);
    state.villageReputation = Math.max(0, state.villageReputation - 8);
    rival.relationship = 'tense';
    rival.raidCooldownDays = 7;
    maybeRaidCasualty(state, state.entities, 0.2);
    pushFloat(state, rival.campX, rival.campY - 20, 'Repelled!', '#f87171');
    logEvent(state, 'combat', `Raid on ${rival.name} failed — war-band fought back`, rival.name);
    maybeQueueRaid(state, rival, state.entities.filter((e) => e.alive));
  }

  rival.daysUntilAction = 30;
  return state;
}