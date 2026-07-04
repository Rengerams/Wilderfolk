import type { Entity, WildlifeCounts } from './gameTypes';
import { EntityType } from './gameTypes';
import { isActiveMoonHowler } from './moonHowler';

/** Scan alive entities once — used on load and after world generation. */
export function computeWildlifeCounts(entities: Entity[]): WildlifeCounts {
  const counts: WildlifeCounts = {
    grass: 0, rabbits: 0, deer: 0, wolves: 0, foxes: 0, werewolves: 0, wildkin: 0,
  };
  for (const e of entities) {
    if (!e.alive) continue;
    if (e.type === EntityType.Grass) counts.grass++;
    else if (e.type === EntityType.Rabbit) counts.rabbits++;
    else if (e.type === EntityType.Deer) counts.deer++;
    else if (e.type === EntityType.Wolf) counts.wolves++;
    else if (e.type === EntityType.Fox) counts.foxes++;
    else if (isActiveMoonHowler(e)) counts.werewolves++;
    else if (e.type === EntityType.Wildkin) counts.wildkin++;
  }
  return counts;
}