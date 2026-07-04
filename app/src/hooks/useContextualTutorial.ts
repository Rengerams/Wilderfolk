import { useCallback, useEffect, useRef, useState } from 'react';
import type { WorldState } from '../game/gameEngine';
import {
  detectContextualTutorials,
  type ContextualTutorialTip,
} from '../game/contextualTutorial';

/**
 * Watches sim state and surfaces one contextual tutorial tip at a time
 * when a mechanic appears for the first time this playthrough.
 */
export function useContextualTutorial(world: WorldState, enabled: boolean) {
  const prevRef = useRef<WorldState | null>(null);
  const [queue, setQueue] = useState<ContextualTutorialTip[]>([]);
  const [active, setActive] = useState<ContextualTutorialTip | null>(null);
  const seededRef = useRef(false);

  useEffect(() => {
    if (!enabled) {
      prevRef.current = null;
      seededRef.current = false;
      setQueue([]);
      setActive(null);
      return;
    }

    if (!seededRef.current) {
      prevRef.current = world;
      seededRef.current = true;
      return;
    }

    const discovered = detectContextualTutorials(prevRef.current!, world);
    if (discovered.length > 0) {
      setQueue((q) => {
        const seen = new Set([
          ...(world.tutorialSeen ?? []),
          ...q.map((t) => t.id),
          ...(active ? [active.id] : []),
        ]);
        const fresh = discovered.filter((t) => !seen.has(t.id));
        return fresh.length > 0 ? [...q, ...fresh] : q;
      });
    }

    prevRef.current = world;
  }, [
    world,
    enabled,
    world.tick,
    world.tutorialSeen,
    world.visitorGroups,
    world.rivalSettlements,
    world.pendingDiplomacyEvents,
    world.pendingRaidEvents,
    world.season,
    world.activeResearch,
    world.researchNodes,
    world.tradeRoutes,
    world.entities,
    world.buildings,
    world.challenges,
    world.victories,
    world.festival,
    active,
  ]);

  useEffect(() => {
    if (!active && queue.length > 0) {
      setActive(queue[0]);
      setQueue((q) => q.slice(1));
    }
  }, [active, queue]);

  const dismissActive = useCallback(() => {
    setActive(null);
  }, []);

  return { active, dismissActive };
}