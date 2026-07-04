import type { WorldState, Resources } from './gameTypes';

/** Add resources respecting storage caps (wood, stone, food). Gold uses the same helper for consistency. */
export function addCappedResource(state: WorldState, type: keyof Resources, amount: number): number {
  if (amount <= 0) return 0;
  const current = state.resources[type] as number;
  const max = state.storageMax[type] as number;
  const add = Math.min(amount, Math.max(0, max - current));
  (state.resources[type] as number) += add;
  return add;
}