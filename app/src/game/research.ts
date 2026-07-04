import type { WorldState } from './gameTypes';
import { BuildingType, BUILDING_CONFIGS } from './gameTypes';
import { logEvent } from './eventLog';
import {
  addNotification,
  impulseScreenShake,
  getMultiplier,
} from './gameEngine';

/** Keep researched techs, unlocked flags, and build unlocks in sync (fixes older saves). */
export function syncResearchUnlocks(state: WorldState): void {
  for (const node of state.researchNodes) {
    if (node.researched && !state.unlockedTechs.includes(node.id)) {
      state.unlockedTechs.push(node.id);
    }
  }
  for (const node of state.researchNodes) {
    if (!node.unlocked && node.prerequisites.every((p) => state.unlockedTechs.includes(p))) {
      node.unlocked = true;
    }
  }
}

export function notifyBuildingLocked(state: WorldState, type: BuildingType): WorldState {
  const s = structuredClone(state) as WorldState;
  syncResearchUnlocks(s);
  const config = BUILDING_CONFIGS[type];
  if (!config.unlockRequirement || s.unlockedTechs.includes(config.unlockRequirement)) return s;

  const lockTech = s.researchNodes.find((n) => n.id === config.unlockRequirement);
  const missingPrereq = lockTech?.prerequisites.find((p) => !s.unlockedTechs.includes(p));
  const prereqTech = missingPrereq
    ? s.researchNodes.find((n) => n.id === missingPrereq)
    : undefined;
  const chain = prereqTech
    ? `Research ${prereqTech.name} first, then ${lockTech?.name ?? 'the required tech'} (Research tab → Architecture).`
    : `Research ${lockTech?.name ?? config.unlockRequirement} in the Research tab.`;

  addNotification(s, `${config.label} locked`, chain, 'warning');
  return s;
}

export function startResearch(state: WorldState, researchId: string): WorldState {
  const s = structuredClone(state) as WorldState;
  const node = s.researchNodes.find(n => n.id === researchId);
  if (!node || !node.unlocked || node.researched || s.activeResearch) return s;

  const prereqsMet = node.prerequisites.every(p => s.unlockedTechs.includes(p));
  if (!prereqsMet) return s;
  
  if (s.resources.wood >= node.cost.wood && s.resources.stone >= node.cost.stone && s.resources.gold >= node.cost.gold) {
    s.resources.wood -= node.cost.wood;
    s.resources.stone -= node.cost.stone;
    s.resources.gold -= node.cost.gold;
    s.activeResearch = researchId;
    s.researchProgress = 0;
    addNotification(s, 'Research Started', `Started researching: ${node.name}`, 'info');
  }
  return s;
}

export function updateResearch(state: WorldState) {
  if (!state.activeResearch) return;
  const node = state.researchNodes.find(n => n.id === state.activeResearch);
  if (!node) { state.activeResearch = null; return; }
  
  const speedMult = getMultiplier(state, 'research_speed');
  state.researchProgress += speedMult;
  
  if (state.researchProgress >= 100) {
    node.researched = true;
    state.unlockedTechs.push(node.id);
    state.activeResearch = null;
    state.researchProgress = 0;
    
    syncResearchUnlocks(state);
    
    addNotification(state, 'Research Complete!', `${node.name} has been researched!`, 'success');
    state.villageReputation = Math.min(100, state.villageReputation + 3);
    if (node.id === 'architecture_2') {
      addNotification(
        state,
        'Town Hall unlocked',
        'Open Build (B) → Community → Town Hall 🏰',
        'success',
      );
    }
    if (node.id === 'defense_4' || node.id === 'defense_5') {
      const hasSmith = state.buildings.some((b) => b.completed && b.type === BuildingType.Blacksmith);
      addNotification(
        state,
        hasSmith ? 'Iron gear researched — queue forge' : 'Iron gear researched — build Blacksmith',
        hasSmith
          ? `Open your Blacksmith on the map → Village forge → queue ${node.name} (~6 days staffed).`
          : 'Build & complete a Blacksmith (Industry), then queue the forge order.',
        'warning',
      );
    }
    logEvent(state, 'research', `${node.name} researched`);
    impulseScreenShake(state, 3);
    
  }
}
