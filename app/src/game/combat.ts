import {
  BuildingType, EntityType, JobType,
  createInitialResearchNodes,
  type Building, type Entity, type ResearchNode, type WorldState,
} from './gameTypes';
import { isBarracksGuard } from './defenseStructures';
import type { VillageForgeState } from './forge';
import { COMBAT_TECH } from './combatTech';

export { COMBAT_TECH } from './combatTech';

const EMPTY_FORGE: VillageForgeState = {
  activeOrder: null,
  progress: 0,
  spearsReady: false,
  shieldsReady: false,
};

type CombatContext = Pick<WorldState, 'unlockedTechs' | 'researchNodes' | 'buildings' | 'villageForge'>;

function hasTech(state: CombatContext, techId: string): boolean {
  return state.unlockedTechs.includes(techId);
}

function researchedEffect(state: CombatContext, target: string, mode: 'mult' | 'add'): number {
  let value = mode === 'mult' ? 1 : 0;
  for (const node of state.researchNodes) {
    if (!node.researched) continue;
    for (const effect of node.effects) {
      if (effect.target !== target) continue;
      if (mode === 'mult' && effect.multiplier) value *= effect.multiplier;
      if (mode === 'add' && effect.add) value += effect.add;
    }
  }
  return value;
}

export function hasCompletedBlacksmith(state: CombatContext): boolean {
  return state.buildings.some((b) => b.completed && b.type === BuildingType.Blacksmith);
}

export function hasStoneSpears(state: CombatContext): boolean {
  return hasTech(state, COMBAT_TECH.stoneSpears);
}

export function hasIronSpears(state: CombatContext & { villageForge?: { spearsReady: boolean } }): boolean {
  return hasTech(state, COMBAT_TECH.ironSpears)
    && hasCompletedBlacksmith(state)
    && (state.villageForge?.spearsReady ?? false);
}

export function hasWoodenShields(state: CombatContext): boolean {
  return hasTech(state, COMBAT_TECH.woodenShields);
}

export function hasIronShields(state: CombatContext & { villageForge?: { shieldsReady: boolean } }): boolean {
  return hasTech(state, COMBAT_TECH.ironShields)
    && hasCompletedBlacksmith(state)
    && (state.villageForge?.shieldsReady ?? false);
}

export function getHuntRangeMultiplier(state: WorldState): number {
  return researchedEffect(state, 'hunt_range', 'mult');
}

export function getHuntFoodMultiplier(state: WorldState): number {
  return researchedEffect(state, 'hunt_food', 'mult');
}

export function getHumanHuntRange(state: WorldState, baseRange: number): number {
  return baseRange * getHuntRangeMultiplier(state);
}

export function getPredatorBlockChance(state: WorldState): number {
  let chance = researchedEffect(state, 'predator_block', 'add');
  if (hasIronShields(state)) chance = Math.max(chance, 0.6);
  else if (hasWoodenShields(state)) chance = Math.max(chance, 0.35);
  return Math.min(0.85, chance);
}

export function getHumanFleeSpeedMultiplier(state: WorldState): number {
  return researchedEffect(state, 'flee_speed', 'mult');
}

export function getCounterAttackChance(state: WorldState): number {
  if (!hasIronSpears(state)) return 0;
  return researchedEffect(state, 'counter_attack', 'add') || 0.45;
}

export function rollPredatorBlock(state: WorldState, humanId: number, tick: number): boolean {
  const chance = getPredatorBlockChance(state);
  if (chance <= 0) return false;
  const roll = (((humanId * 1103515245 + tick * 12345) >>> 0) % 1000) / 1000;
  return roll < chance;
}

export function rollCounterAttack(state: WorldState, humanId: number, predatorId: number, tick: number): boolean {
  const chance = getCounterAttackChance(state);
  if (chance <= 0) return false;
  const roll = (((humanId * 2654435761 + predatorId * 1597334677 + tick) >>> 0) % 1000) / 1000;
  return roll < chance;
}

export interface ArmamentStep {
  id: string;
  label: string;
  done: boolean;
  detail: string;
}

export function getArmamentSteps(state: WorldState): ArmamentStep[] {
  const hasSmith = hasCompletedBlacksmith(state);
  const hasMining = hasTech(state, 'mining_1');
  return [
    {
      id: 'stone_spears',
      label: 'Stone Spears',
      done: hasStoneSpears(state),
      detail: 'Defense tab → research Stone Spears (no building needed). Buffs hunting.',
    },
    {
      id: 'wood_shields',
      label: 'Wooden Shields',
      done: hasWoodenShields(state),
      detail: 'Defense → Wooden Shields after Fortification. Blocks moon howler strikes.',
    },
    {
      id: 'blacksmith',
      label: 'Blacksmith',
      done: hasSmith,
      detail: 'Forestry → Carpentry, then build & staff a Blacksmith (Industry tab).',
    },
    {
      id: 'mining',
      label: 'Deep Mining',
      done: hasMining,
      detail: 'Mining → Deep Mining (needed before iron weapons).',
    },
    {
      id: 'iron_spears',
      label: 'Iron Spears',
      done: hasIronSpears(state),
      detail: state.villageForge?.activeOrder === 'iron_spears'
        ? `Forging at Blacksmith… ${Math.round(state.villageForge.progress)}%`
        : state.villageForge?.spearsReady
          ? 'Forged at the Blacksmith — village armed.'
          : 'Research Iron Spears, staff Blacksmith, queue forge order.',
    },
    {
      id: 'iron_shields',
      label: 'Iron Shields',
      done: hasIronShields(state),
      detail: state.villageForge?.activeOrder === 'iron_shields'
        ? `Forging at Blacksmith… ${Math.round(state.villageForge.progress)}%`
        : state.villageForge?.shieldsReady
          ? 'Forged at the Blacksmith — shields active.'
          : 'Research Iron Shields, staff Blacksmith, queue forge order.',
    },
  ];
}

export function getHumanArmamentLabel(state: WorldState): string | null {
  if (hasIronSpears(state) && hasIronShields(state)) return 'Iron spear & shield';
  if (hasIronSpears(state)) return 'Iron spear';
  if (hasIronShields(state)) return 'Iron shield';
  if (hasStoneSpears(state) && hasWoodenShields(state)) return 'Spear & wooden shield';
  if (hasStoneSpears(state)) return 'Stone spear';
  if (hasWoodenShields(state)) return 'Wooden shield';
  return null;
}

function combatProbeState(
  unlockedTechs: readonly string[],
  hasBlacksmith: boolean,
  villageForge?: VillageForgeState,
): CombatContext {
  const buildings: Building[] = hasBlacksmith
    ? [{
      id: 0, type: BuildingType.Blacksmith, x: 0, y: 0, width: 1, height: 1,
      occupants: [], level: 1, constructionProgress: 100, completed: true,
      health: 100, maxHealth: 100, spriteScale: 1, buildAnimTimer: 0,
    }]
    : [];
  return {
    unlockedTechs: [...unlockedTechs],
    researchNodes: [],
    buildings,
    villageForge: villageForge ?? EMPTY_FORGE,
  };
}

export function getHumanStatusCombatIcon(
  human: Entity,
  unlockedTechs: readonly string[],
  hasBlacksmith: boolean,
  villageForge?: VillageForgeState,
  buildings?: readonly Building[],
): string | null {
  const probe = combatProbeState(unlockedTechs, hasBlacksmith, villageForge);
  if (
    buildings
    && human.job === JobType.Guard
    && isBarracksGuard(human.id, human.homeBuildingId, buildings as Building[])
  ) {
    return '🪖';
  }
  if (human.huntTargetId) return '🏹';
  if (human.combatTicks && human.combatTicks > 0) return '⚔️';
  if (hasIronShields(probe) || hasWoodenShields(probe)) return '🛡️';
  if (hasIronSpears(probe) || hasStoneSpears(probe)) return '🏹';
  return null;
}

export function isPredatorType(type: EntityType): boolean {
  return type === EntityType.Wolf || type === EntityType.Fox || type === EntityType.Werewolf;
}

export function mergeCombatResearchNodes(nodes: ResearchNode[]): void {
  const fresh = createInitialResearchNodes();
  const existing = new Set(nodes.map((n) => n.id));
  for (const node of fresh) {
    if (!existing.has(node.id) && node.id.startsWith('defense_') && node.id !== 'defense_1') {
      nodes.push({ ...node });
    }
  }
  for (const node of nodes) {
    if (node.id === 'defense_1' && !node.unlocked) node.unlocked = true;
  }
}

