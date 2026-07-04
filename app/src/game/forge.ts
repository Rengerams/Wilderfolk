import type { Building, Resources, WorldState } from './gameTypes';
import { BuildingType } from './gameTypes';
import { isProductionTick, PRODUCTION_INTERVAL } from './dayCycle';
import { COMBAT_TECH } from './combatTech';
import { hasCompletedBlacksmith } from './combat';
import { logEvent } from './eventLog';
import { addNotification } from './gameEngine';

function addForgeFloat(state: WorldState, x: number, y: number, text: string, color: string) {
  state.floatingTexts.push({
    id: state.nextFloatingTextId++,
    x,
    y,
    text,
    color,
    life: 18,
    maxLife: 18,
    scale: 1,
  });
}

export type ForgeOrderId = 'iron_spears' | 'iron_shields';

export interface ForgeOrder {
  id: ForgeOrderId;
  label: string;
  emoji: string;
  description: string;
  techId: string;
  inputs: Partial<Resources>;
  /** Progress gained per staffed forge tick (3 ticks ≈ 6 in-game days). */
  progressPerTick: number;
}

export interface VillageForgeState {
  activeOrder: ForgeOrderId | null;
  progress: number;
  spearsReady: boolean;
  shieldsReady: boolean;
}

export const FORGE_ORDERS: ForgeOrder[] = [
  {
    id: 'iron_spears',
    label: 'Iron Spears',
    emoji: '⚔️',
    description: 'Forge village-wide iron spears — hunt farther, fight back vs wolves.',
    techId: COMBAT_TECH.ironSpears,
    inputs: { wood: 35, stone: 25, gold: 40 },
    progressPerTick: 34,
  },
  {
    id: 'iron_shields',
    label: 'Iron Shields',
    emoji: '🛡️',
    description: 'Forge iron shields for all settlers — heavy predator protection.',
    techId: COMBAT_TECH.ironShields,
    inputs: { wood: 40, stone: 30, gold: 45 },
    progressPerTick: 34,
  },
];

export function createInitialForgeState(): VillageForgeState {
  return {
    activeOrder: null,
    progress: 0,
    spearsReady: false,
    shieldsReady: false,
  };
}

export function getForgeOrder(orderId?: ForgeOrderId | null): ForgeOrder | undefined {
  return FORGE_ORDERS.find((o) => o.id === orderId);
}

export function findCompletedBlacksmith(state: WorldState): Building | undefined {
  return state.buildings.find((b) => b.completed && b.type === BuildingType.Blacksmith);
}

export function isBlacksmithStaffed(state: WorldState): boolean {
  return state.buildings.some(
    (b) => b.completed && b.type === BuildingType.Blacksmith && b.occupants.length > 0,
  );
}

/** Iron tech researched but not yet forged — and no order currently running. */
export function getOutstandingForgeOrder(state: WorldState): ForgeOrderId | null {
  const { villageForge, unlockedTechs } = state;
  if (villageForge.activeOrder) return null;
  if (unlockedTechs.includes(COMBAT_TECH.ironSpears) && !villageForge.spearsReady) {
    return 'iron_spears';
  }
  if (unlockedTechs.includes(COMBAT_TECH.ironShields) && !villageForge.shieldsReady) {
    return 'iron_shields';
  }
  return null;
}

export function formatForgeInputs(inputs: Partial<Resources>): string {
  const parts: string[] = [];
  if (inputs.wood) parts.push(`${inputs.wood}🪵`);
  if (inputs.stone) parts.push(`${inputs.stone}🪨`);
  if (inputs.gold) parts.push(`${inputs.gold}💰`);
  return parts.join(' · ') || '—';
}

function canAffordForgeInputs(resources: Resources, inputs: Partial<Resources>): boolean {
  return (inputs.wood ?? 0) <= resources.wood
    && (inputs.stone ?? 0) <= resources.stone
    && (inputs.gold ?? 0) <= resources.gold;
}

function consumeForgeInputs(state: WorldState, inputs: Partial<Resources>): void {
  state.resources.wood -= inputs.wood ?? 0;
  state.resources.stone -= inputs.stone ?? 0;
  state.resources.gold -= inputs.gold ?? 0;
}

export function isForgeOrderComplete(state: WorldState, orderId: ForgeOrderId): boolean {
  if (orderId === 'iron_spears') return state.villageForge.spearsReady;
  return state.villageForge.shieldsReady;
}

export function getForgeBlockReason(state: WorldState, orderId: ForgeOrderId): string | null {
  const order = getForgeOrder(orderId);
  if (!order) return 'Unknown order';
  if (!state.unlockedTechs.includes(order.techId)) {
    return `Research ${order.label} first (Defense tab)`;
  }
  if (!hasCompletedBlacksmith(state)) return 'Complete a Blacksmith first';
  if (isForgeOrderComplete(state, orderId)) return `${order.label} already forged`;
  if (state.villageForge.activeOrder === orderId) return null;
  if (state.villageForge.activeOrder) {
    const active = getForgeOrder(state.villageForge.activeOrder);
    return `Smith is forging ${active?.label ?? 'another order'}`;
  }
  const staffed = state.buildings.some(
    (b) => b.completed && b.type === BuildingType.Blacksmith && b.occupants.length > 0,
  );
  if (!staffed) return 'Staff the Blacksmith to forge';
  if (!canAffordForgeInputs(state.resources, order.inputs)) {
    return `Need ${formatForgeInputs(order.inputs)}`;
  }
  return null;
}

export function queueForgeOrder(
  originalState: WorldState,
  buildingId: number,
  orderId: ForgeOrderId,
): WorldState {
  const block = getForgeBlockReason(originalState, orderId);
  if (block) {
    const blocked = structuredClone(originalState) as WorldState;
    addNotification(blocked, 'Forge blocked', block, 'warning');
    return blocked;
  }
  const building = originalState.buildings.find((b) => b.id === buildingId);
  if (!building || building.type !== BuildingType.Blacksmith || !building.completed) {
    return originalState;
  }
  const order = getForgeOrder(orderId)!;
  const state = {
    ...originalState,
    resources: { ...originalState.resources },
    villageForge: { ...originalState.villageForge },
  };
  if (state.villageForge.activeOrder === orderId) return originalState;
  consumeForgeInputs(state, order.inputs);
  state.villageForge.activeOrder = orderId;
  state.villageForge.progress = 0;
  logEvent(state, 'event', `Blacksmith began forging ${order.label}`, building.campLabel ?? 'Blacksmith');
  return state;
}

/** Migrate saves that had iron gear via research-only rules. */
export function migrateVillageForgeOnLoad(state: WorldState): void {
  if (state.villageForge) return;
  const hasSmith = hasCompletedBlacksmith(state);
  const hadSpears = state.unlockedTechs.includes(COMBAT_TECH.ironSpears) && hasSmith;
  const hadShields = state.unlockedTechs.includes(COMBAT_TECH.ironShields) && hasSmith;
  state.villageForge = {
    activeOrder: null,
    progress: 0,
    spearsReady: hadSpears,
    shieldsReady: hadShields,
  };
}

export function tickVillageForge(state: WorldState, buildings: Building[]): void {
  const forge = state.villageForge;
  if (!forge?.activeOrder) return;
  const order = getForgeOrder(forge.activeOrder);
  if (!order) return;

  const smith = buildings.find(
    (b) => b.completed && b.type === BuildingType.Blacksmith && b.occupants.length > 0,
  );
  if (!smith) return;

  if (!isProductionTick(state.tick, PRODUCTION_INTERVAL.workshop)) return;

  forge.progress = Math.min(100, forge.progress + order.progressPerTick);

  if (forge.progress < 100) {
    addForgeFloat(
      state,
      smith.x + smith.width / 2,
      smith.y - 14,
      `🔨 ${order.label} ${Math.round(forge.progress)}%`,
      '#fb923c',
    );
    return;
  }

  if (order.id === 'iron_spears') forge.spearsReady = true;
  else forge.shieldsReady = true;

  forge.activeOrder = null;
  forge.progress = 0;

  state.notifications.push({
    id: `forge_${state.tick}_${order.id}`,
    title: `${order.emoji} ${order.label} ready`,
    message: 'Village militia is now armed — check settlers on the map.',
    type: 'success',
    createdAt: state.tick,
  });
  addForgeFloat(
    state,
    smith.x + smith.width / 2,
    smith.y - 18,
    `${order.emoji} ${order.label} forged!`,
    '#4ade80',
  );
  state.deathParticles.push({
    x: smith.x + Math.random() * smith.width,
    y: smith.y + Math.random() * smith.height,
    vx: (Math.random() - 0.5) * 0.6,
    vy: -1 - Math.random(),
    life: 30,
    maxLife: 30,
    color: '#f97316',
    size: 3 + Math.random() * 2,
    type: 'sparkle',
  });
  logEvent(state, 'event', `Blacksmith finished forging ${order.label} — village armed`, order.label);
}