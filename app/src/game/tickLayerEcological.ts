import type { WorldState } from './gameTypes';
import type { TickContext } from './lifeSimulation';
import { updateWeather, updateDisasters } from './worldEvents';
import { updateResearch } from './research';
import { tickTradeCaravans } from './tradeCaravans';

/**
 * Ecological / systems layer interval (ticks).
 * Host may also gate on this; the layer itself does not re-check the modulo
 * so cadence lives in one place (`gameTick`).
 */
export const LAYER_ECO_INTERVAL = 4;

/**
 * Ecological layer — world systems that are not per-entity AI.
 *
 * Weather, disasters, research progress, trade caravans.
 * Raid marches stay in `gameTick` post-layer next to incoming raids
 * (single `tickPendingOutgoingRaidEvents` call — do not duplicate here).
 *
 * Call when `world.tick % LAYER_ECO_INTERVAL === 0`.
 */
export function tickLayerEcological(world: WorldState, _ctx: TickContext): void {
  updateWeather(world);
  updateDisasters(world);
  updateResearch(world);
  tickTradeCaravans(world);
}
