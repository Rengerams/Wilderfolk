import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { initGame } from '@/game/gameEngine';
import { createInitialView } from '@/game/viewState';
import { saveGame, loadGame, hasSave, readSavePayload } from '@/game/saveLoad';

describe('saveLoad', () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    storage.clear();
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => { storage.set(key, value); },
      removeItem: (key: string) => { storage.delete(key); },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('round-trips world + view through localStorage', () => {
    const world = initGame({ villageName: 'Testville' });
    world.tick = 120;
    world.humanPopulation = 4;
    const view = createInitialView(world.width, world.height);
    view.camera.targetX = 400;
    view.selectedEntityId = null;

    const result = saveGame(world, view);
    expect(result.success).toBe(true);
    expect(hasSave()).toBe(true);

    const loaded = loadGame();
    expect(loaded).not.toBeNull();
    expect(loaded!.world.villageName).toBe('Testville');
    expect(loaded!.world.tick).toBe(120);
    expect(loaded!.view.camera.targetX).toBe(400);
  });

  it('strips runtime spatial indexes before stringify', () => {
    const world = initGame();
    world.mobileGrid = { insert: () => {}, remove: () => {}, update: () => {}, forEachInRect: () => {} } as never;
    world.treeGrid = { rebuild: () => {} } as never;
    world.treeGridAlive = 12;
    world.roadAvoidance = { isNearRoad: () => false } as never;
    world.roadAvoidanceStamp = 3;
    const view = createInitialView(world.width, world.height);

    const result = saveGame(world, view);
    expect(result.success).toBe(true);

    const raw = readSavePayload();
    expect(raw.valid).toBe(true);
    if (!raw.valid) return;
    expect('mobileGrid' in raw.parsed).toBe(false);
    expect('treeGrid' in raw.parsed).toBe(false);
    expect('treeGridAlive' in raw.parsed).toBe(false);
    expect('roadAvoidance' in raw.parsed).toBe(false);
    expect('roadAvoidanceStamp' in raw.parsed).toBe(false);
  });
});