import { EntityType, Season, WeatherType, type WorldState } from './gameTypes';
import { TICKS_PER_DAY } from './dayCycle';

function grassGrowthMultiplier(season: Season, weather: WeatherType): number {
  let base = 1;
  switch (season) {
    case Season.Spring: base = 1.8; break;
    case Season.Summer: base = 1.2; break;
    case Season.Fall: base = 0.6; break;
    case Season.Winter: base = 0.15; break;
  }
  if (weather === WeatherType.Rain) base *= 1.3;
  if (weather === WeatherType.Drought) base *= 0.3;
  if (weather === WeatherType.Snow) base *= 0.5;
  return base;
}

export type GrazingPressureLevel = 'stable' | 'caution' | 'critical';

export interface GrazingPressureReport {
  level: GrazingPressureLevel;
  deerCount: number;
  grassCount: number;
  rabbitCount: number;
  wolfCount: number;
  /** Deer grazing demand vs grass recovery (1.0 = balanced). */
  pressureRatio: number;
  grassRecoveryPerDay: number;
  grazingDemandPerDay: number;
  headline: string;
  advice: string;
}

function countAlive(state: WorldState, type: EntityType): number {
  return state.entities.filter((e) => e.alive && e.type === type).length;
}

/**
 * Estimates whether deer (and other grazers) are outpacing grass regrowth.
 * Used for the Nature tab first-hour hook.
 */
export function getGrazingPressureReport(state: WorldState): GrazingPressureReport {
  const deerCount = countAlive(state, EntityType.Deer);
  const grassCount = countAlive(state, EntityType.Grass);
  const rabbitCount = countAlive(state, EntityType.Rabbit);
  const wolfCount = countAlive(state, EntityType.Wolf);

  const grassMult = grassGrowthMultiplier(state.season, state.weather);
  const grassRecoveryPerDay = grassCount * 2.5 * grassMult * TICKS_PER_DAY;
  const grazingDemandPerDay = deerCount * 18 + rabbitCount * 6;

  const pressureRatio = grazingDemandPerDay / Math.max(grassRecoveryPerDay, 12);

  let level: GrazingPressureLevel = 'stable';
  if (pressureRatio >= 1.35 || (deerCount >= 8 && grassCount < 80)) {
    level = 'critical';
  } else if (pressureRatio >= 0.95 || (deerCount >= 5 && grassCount < 120)) {
    level = 'caution';
  }

  const seasonNote =
    state.season === Season.Winter
      ? 'Grass barely grows in winter — herds shrink or starve.'
      : state.weather === WeatherType.Drought
        ? 'Drought is slowing grass recovery.'
        : '';

  const headlines: Record<GrazingPressureLevel, string> = {
    stable: 'Grazing pressure is within recovery limits.',
    caution: 'Deer are grazing faster than grass can regrow.',
    critical: 'The valley is overgrazed — grass cannot keep up with deer.',
  };

  const adviceParts: string[] = [];
  if (level !== 'stable') {
    adviceParts.push('Let wolves hunt — predators keep deer numbers in check.');
    if (wolfCount < 2) adviceParts.push('A healthy wolf pack is your best balance tool.');
    if (deerCount > grassCount * 0.08) adviceParts.push('Too many deer for available pasture — expect die-offs soon.');
    if (seasonNote) adviceParts.push(seasonNote);
  } else if (wolfCount === 0 && deerCount >= 4) {
    adviceParts.push('No wolves yet — if deer multiply, grass will thin out.');
  }

  return {
    level,
    deerCount,
    grassCount,
    rabbitCount,
    wolfCount,
    pressureRatio,
    grassRecoveryPerDay: Math.round(grassRecoveryPerDay),
    grazingDemandPerDay: Math.round(grazingDemandPerDay),
    headline: headlines[level],
    advice: adviceParts.join(' ') || 'Watch deer and grass bars — both should stay in a healthy band.',
  };
}