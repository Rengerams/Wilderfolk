import type { WorldState } from './gameTypes';
import type { TickContext } from './lifeSimulation';
import { tickHumans, tickWildlife } from './lifeSimulation';

/**
 * Active layer — every tick.
 *
 * Movement, AI, hunting, and per-entity social beats live in lifeSimulation.
 * Chat countdown/dialogue advance runs inside `tickHumans` (do not call
 * `tickHumanChat` again here or speech bubbles expire twice as fast).
 */
export function tickLayerActive(world: WorldState, ctx: TickContext): void {
  tickHumans(world, ctx);
  tickWildlife(world, ctx);
}
