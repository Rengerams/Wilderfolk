import type { GameEventLog, WorldState } from './gameTypes';

let nextEventLogId = 1;

/** Restore monotonic ids after loading a save. */
export function syncEventLogIdFromState(state: Pick<WorldState, 'eventLog'>): void {
  if (state.eventLog.length > 0) {
    nextEventLogId = Math.max(...state.eventLog.map((e) => e.id)) + 1;
  }
}

export function logEvent(
  state: WorldState,
  type: GameEventLog['type'],
  message: string,
  entityName?: string,
): void {
  state.eventLog.unshift({
    id: nextEventLogId++,
    tick: state.tick,
    year: state.year,
    day: state.dayInYear,
    type,
    message,
    entityName,
  });
}