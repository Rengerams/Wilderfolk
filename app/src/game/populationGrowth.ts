import { BuildingType, type WorldState } from './gameTypes';
import { getResidenceCapacity, isResidenceBuilding } from './dayCycle';
import { isPlayerHuman } from './groupEvents';

export type PopulationGrowthTone = 'good' | 'warn' | 'blocked';

export interface PopulationGrowthReport {
  tone: PopulationGrowthTone;
  headline: string;
  detail: string;
  reasons: string[];
}

export function getPopulationGrowthReport(state: WorldState): PopulationGrowthReport {
  const pop = state.entities.filter((e) => e.alive && isPlayerHuman(e)).length;
  const cap = state.maxHumanPopulation;
  const openSlots = cap - pop;
  const residences = state.buildings.filter((b) => b.completed && isResidenceBuilding(b));
  const bedCap = residences.reduce((sum, b) => sum + getResidenceCapacity(b), 0);
  const openBeds = Math.max(0, bedCap - pop);
  const reasons: string[] = [];

  if (pop >= cap) {
    reasons.push(`At population cap (${pop}/${cap}).`);
    const houseCount = state.buildings.filter(
      (b) => b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion),
    ).length;
    reasons.push(`Build more houses (+4 cap each) — you have ${houseCount} residence buildings.`);
    reasons.push(`⭐ Reputation adds cap (+1 per 10 rep, now ${state.villageReputation}).`);
    return {
      tone: 'blocked',
      headline: 'Population cap reached',
      detail: 'Immigration and recruitment stop until cap rises.',
      reasons,
    };
  }

  if (state.resources.food < 40) {
    reasons.push(`Low food (${state.resources.food}🍖) — newcomers are unlikely while stores are thin.`);
  }
  if (state.villageReputation < 25) {
    reasons.push(`Low reputation (${state.villageReputation}⭐) — immigrants arrive rarely. Trade and gifts raise rep.`);
  }
  if (openBeds > 4 && openSlots > 4) {
    reasons.push(`${openBeds} open beds and ${openSlots} cap slots — growth is gradual, not instant.`);
  }
  if (!state.festival?.active && state.villageReputation < 60) {
    reasons.push('Festivals and more housing speed immigration checks.');
  }

  if (reasons.length === 0) {
    return {
      tone: 'good',
      headline: 'Room to grow',
      detail: `${openSlots} cap slots open · immigrants arrive on periodic checks.`,
      reasons: [
        `Cap ${cap} (${pop} settlers now).`,
        'Houses and reputation are the main cap drivers.',
      ],
    };
  }

  return {
    tone: reasons.some((r) => r.includes('Low food')) ? 'warn' : 'good',
    headline: openSlots <= 8 ? 'Growth slowing' : 'Growing steadily',
    detail: `${pop}/${cap} settlers · ${openSlots} slots until cap.`,
    reasons,
  };
}