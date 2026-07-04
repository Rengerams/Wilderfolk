import type { GameState, VictoryPath, VictoryProgress } from './gameTypes';

/** Victory paths shown and achievable in v1 — must match App.tsx Goals tab. */
export const ACTIVE_VICTORY_PATHS: readonly VictoryPath[] = [
  'eco_utopia', 'great_city', 'trade_empire', 'harmony',
];

/** Reserved for future victory paths not yet in the Goals tab. */
export const COMING_SOON_VICTORY_PATHS: readonly VictoryPath[] = [];

export const VICTORY_DEFINITIONS: Record<VictoryPath, { label: string; description: string; emoji: string }> = {
  eco_utopia: {
    label: 'Eco-Utopia',
    description: 'Reach 100 humans and maintain 80%+ ecosystem health for 20 years',
    emoji: '🌿',
  },
  trade_empire: {
    label: 'Trade Empire',
    description: 'Establish 5 active trade routes and accumulate 10,000 gold',
    emoji: '💰',
  },
  great_city: {
    label: 'Great City',
    description: 'Grow to 200 humans with 50 completed buildings',
    emoji: '🏰',
  },
  harmony: {
    label: 'Harmony',
    description: 'Tame 10 wolves and sustain 50 wildkin in the valley',
    emoji: '🐺',
  },
};

export function createInitialVictories(): VictoryProgress[] {
  return (Object.keys(VICTORY_DEFINITIONS) as VictoryPath[]).map((path) => ({
    path,
    label: VICTORY_DEFINITIONS[path].label,
    description: VICTORY_DEFINITIONS[path].description,
    progress: 0,
    achieved: false,
  }));
}

function clampPct(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

export function computeVictoryProgress(state: GameState): VictoryProgress[] {
  const humans = state.humanPopulation;
  const buildings = state.buildings.filter((b) => b.completed && b.faction !== 'rival').length;
  const activeRoutes = state.tradeRoutes.filter((r) => r.active).length;
  const gold = state.resources.gold;
  const tamedWolves = state.entities.filter(
    (e) => e.alive && e.type === 'wolf' && e.tamedBy !== undefined
  ).length;
  const wildkin = state.entities.filter((e) => e.alive && e.type === 'wildkin').length;

  return state.victories.map((v) => {
    if (v.achieved) return v;

    let progress = 0;
    switch (v.path) {
      case 'eco_utopia':
        progress = clampPct(
          (Math.min(humans, 100) / 100) * 50 +
            (Math.min(state.ecoHealthYearsAbove80, 20) / 20) * 50
        );
        break;
      case 'trade_empire':
        progress = clampPct(
          (Math.min(activeRoutes, 5) / 5) * 50 + (Math.min(gold, 10000) / 10000) * 50
        );
        break;
      case 'great_city':
        progress = clampPct(
          (Math.min(humans, 200) / 200) * 50 + (Math.min(buildings, 50) / 50) * 50
        );
        break;
      case 'harmony':
        progress = clampPct(
          (Math.min(tamedWolves, 10) / 10) * 50 + (Math.min(wildkin, 50) / 50) * 50
        );
        break;
    }

    return { ...v, progress };
  });
}

export function checkVictoryAchievements(state: GameState): {
  victories: VictoryProgress[];
  victoryAchieved: VictoryPath | null;
  newlyAchieved: VictoryPath | null;
} {
  const victories = computeVictoryProgress(state);
  let newlyAchieved: VictoryPath | null = null;
  let victoryAchieved = state.victoryAchieved;

  for (const v of victories) {
    if (!ACTIVE_VICTORY_PATHS.includes(v.path)) continue;
    if (v.achieved || v.progress < 100) continue;
    v.achieved = true;
    if (!victoryAchieved) {
      victoryAchieved = v.path;
      newlyAchieved = v.path;
    }
  }

  return { victories, victoryAchieved, newlyAchieved };
}