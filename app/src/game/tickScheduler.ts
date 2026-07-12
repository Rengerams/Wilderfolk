/**
 * Tick layer barrel + shared focus helpers.
 *
 * Cadence/orchestration lives in `gameEngine.gameTick`. This module re-exports
 * the layer entrypoints and provides focus iterators that match
 * `computeSimulationFocus` / `isInFocus` (margin applied once when building focus).
 */

import type { EntityType } from './gameTypes';
import type { SimulationFocus } from './gameEngine';

export type { SimulationFocus } from './gameEngine';

export { tickLayerStatic } from './tickLayerStatic';
export { tickLayerSocial, LAYER_SOCIAL_INTERVAL } from './tickLayerSocial';
export { tickLayerEcological, LAYER_ECO_INTERVAL } from './tickLayerEcological';
export { tickLayerActive } from './tickLayerActive';
export {
  tickLayerStats,
  STATS_SAMPLE_INTERVAL_TICKS,
  POPULATION_HISTORY_MAX,
} from './tickLayerStats';

/** Entity-like record for focus / throttle iteration. */
export interface FocusableEntity {
  id: number;
  x: number;
  y: number;
  alive: boolean;
  type?: EntityType | string;
}

/**
 * Point-in-box test. `focus` is assumed already padded by
 * `computeSimulationFocus` — do **not** add a second margin here.
 */
export function isEntityInFocus(
  entity: Pick<FocusableEntity, 'x' | 'y'>,
  focus: SimulationFocus,
): boolean {
  return (
    entity.x >= focus.minX
    && entity.x <= focus.maxX
    && entity.y >= focus.minY
    && entity.y <= focus.maxY
  );
}

export function* iterateEntitiesInFocus<T extends FocusableEntity>(
  entities: readonly T[],
  focus?: SimulationFocus,
  typeFilter?: ReadonlySet<EntityType | string> | readonly (EntityType | string)[],
): Generator<T> {
  const types = typeFilter
    ? (typeFilter instanceof Set ? typeFilter : new Set(typeFilter))
    : null;

  for (const entity of entities) {
    if (!entity.alive) continue;
    if (types && (entity.type === undefined || !types.has(entity.type))) continue;
    if (focus && !isEntityInFocus(entity, focus)) continue;
    yield entity;
  }
}

/**
 * Full AI for on-screen entities every tick; off-screen entities only when
 * `(tick + id) % throttle === 0` (same pattern as lifeSimulation).
 */
export function* iterateEntitiesThrottled<T extends FocusableEntity>(
  entities: readonly T[],
  tick: number,
  throttle: number,
  focus?: SimulationFocus,
  typeFilter?: ReadonlySet<EntityType | string> | readonly (EntityType | string)[],
): Generator<T> {
  const types = typeFilter
    ? (typeFilter instanceof Set ? typeFilter : new Set(typeFilter))
    : null;
  const period = Math.max(1, throttle | 0);

  for (const entity of entities) {
    if (!entity.alive) continue;
    if (types && (entity.type === undefined || !types.has(entity.type))) continue;
    const inFocus = !focus || isEntityInFocus(entity, focus);
    if (!inFocus && (tick + entity.id) % period !== 0) continue;
    yield entity;
  }
}
