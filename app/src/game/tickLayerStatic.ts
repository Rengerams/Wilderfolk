import type { Season, WorldState } from './gameTypes';
import { applyFoodSpoilage } from './economy';
import { tickElectionGossip } from './villageLeadership';

/**
 * Static / daily layer — calendar-day bookkeeping.
 *
 * Prefer calling once per new calendar day from `gameTick` (same moment as the
 * former `tick % TICKS_PER_DAY === 0` block), not only at `hourOfDay === 0`,
 * so load/reload day boundaries stay consistent with `isNewCalendarDayTick`.
 *
 * Population history sampling lives in `tickLayerStats` (every 10 ticks).
 */
export function tickLayerStatic(state: WorldState, season: Season = state.season): void {
  applyFoodSpoilage(state, season);
  tickElectionGossip(state);
}
