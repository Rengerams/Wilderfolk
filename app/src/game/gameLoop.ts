import type { WorldState } from './gameTypes';
import { gameTick, computeSimulationFocus, type SimulationFocus } from './gameEngine';
import { renderGame } from './renderer';
import { buildRenderSnapshot } from './renderSnapshot';
import {
  clearScreenShakeImpulse,
  createInitialView,
  syncScreenShakeFromWorld,
  updateView,
  type ViewState,
} from './viewState';

/** 2 ticks/s at 1× — one game-day (24 ticks) ≈ 12 real seconds. */
const BASE_TICKS_PER_SECOND = 2;
const UI_UPDATE_MS = 100;
const MAX_CATCHUP_STEPS = 12;

export type SessionListener = (world: WorldState, view: ViewState, tickChanged: boolean) => void;

export class GameLoop {
  private world: WorldState;
  private view: ViewState;
  private rafId = 0;
  private running = false;
  private tickAccumulator = 0;
  private lastFrameTime = 0;
  private lastUiUpdate = 0;
  private lastNotifiedTick = -1;
  private listeners = new Set<SessionListener>();
  private getCanvas: () => HTMLCanvasElement | null;

  constructor(world: WorldState, view: ViewState, getCanvas: () => HTMLCanvasElement | null) {
    this.world = world;
    this.view = view;
    this.getCanvas = getCanvas;
  }

  getWorld(): WorldState {
    return this.world;
  }

  getView(): ViewState {
    return this.view;
  }

  /** Replace simulation + view state (new game, load, reset). */
  setSession(world: WorldState, view: ViewState): void {
    this.world = world;
    this.view = view;
    this.lastNotifiedTick = world.tick;
    this.notify(true);
  }

  setWorld(world: WorldState): void {
    this.world = world;
    this.view = createInitialView(world.width, world.height);
    this.lastNotifiedTick = world.tick;
    this.notify(true);
  }

  setView(view: ViewState): void {
    this.view = view;
  }

  /** @param silent Skip React notification (use for per-frame hover/ghost/camera drag). */
  patchView(patch: Partial<ViewState>, silent = false): void {
    this.view = { ...this.view, ...patch };
    if (!silent) this.notify(false);
  }

  /** Run a player action that may return a new world reference. */
  applyAction(mutator: (world: WorldState) => WorldState): void {
    const next = mutator(this.world);
    if (next !== this.world) {
      this.world = next;
    }
    this.pruneStaleSelection();
    this.notify(true);
  }

  /** Mutate world in place. */
  mutateWorld(mutator: (world: WorldState) => void): void {
    mutator(this.world);
    this.notify(true);
  }

  subscribe(listener: SessionListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  start(): void {
    if (this.running) return;
    this.running = true;
    this.lastFrameTime = 0;
    this.tickAccumulator = 0;
    this.rafId = requestAnimationFrame(this.frame);
  }

  stop(): void {
    this.running = false;
    if (this.rafId) cancelAnimationFrame(this.rafId);
    this.rafId = 0;
  }

  getWorldAndView(): { world: WorldState; view: ViewState } {
    return { world: this.world, view: this.view };
  }

  private frame = (time: number) => {
    if (!this.running) return;

    if (!this.lastFrameTime) this.lastFrameTime = time;
    const dtMs = Math.min(time - this.lastFrameTime, 100);
    this.lastFrameTime = time;

    let tickChanged = false;

    if (!this.world.paused) {
      this.tickAccumulator += dtMs;
      const msPerTick = 1000 / (BASE_TICKS_PER_SECOND * this.world.speed);
      let steps = 0;
      const canvas = this.getCanvas();
      const focus: SimulationFocus | undefined = canvas
        ? computeSimulationFocus(this.view.camera, canvas.offsetWidth, canvas.offsetHeight)
        : undefined;
      while (this.tickAccumulator >= msPerTick && steps < MAX_CATCHUP_STEPS) {
        gameTick(this.world, focus);
        this.view = syncScreenShakeFromWorld(this.view, this.world);
        clearScreenShakeImpulse(this.world);
        this.tickAccumulator -= msPerTick;
        steps++;
        tickChanged = true;
      }
    } else {
      this.tickAccumulator = 0;
    }

    this.view = updateView(this.view, dtMs);
    this.draw();

    const now = performance.now();
    if (tickChanged || now - this.lastUiUpdate >= UI_UPDATE_MS) {
      this.lastUiUpdate = now;
      this.notify(tickChanged);
    }

    this.rafId = requestAnimationFrame(this.frame);
  };

  private draw(): void {
    const canvas = this.getCanvas();
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const targetW = Math.floor(canvas.offsetWidth * dpr);
    const targetH = Math.floor(canvas.offsetHeight * dpr);
    if (canvas.width !== targetW || canvas.height !== targetH) {
      canvas.width = targetW;
      canvas.height = targetH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = false;

    const snapshot = buildRenderSnapshot(this.world, this.view);
    renderGame(ctx, snapshot, canvas.offsetWidth, canvas.offsetHeight);
  }

  private pruneStaleSelection(): void {
    const buildingId = this.view.selectedBuildingId;
    if (buildingId != null && !this.world.buildings.some((b) => b.id === buildingId)) {
      this.view = { ...this.view, selectedBuildingId: null };
    }
    const entityId = this.view.selectedEntityId;
    if (entityId != null && !this.world.entities.some((e) => e.id === entityId && e.alive)) {
      this.view = { ...this.view, selectedEntityId: null };
    }
  }

  private notify(tickChanged: boolean): void {
    const tick = this.world.tick;
    const changed = tickChanged || tick !== this.lastNotifiedTick;
    if (tickChanged) this.lastNotifiedTick = tick;
    for (const listener of this.listeners) {
      listener(this.world, this.view, changed);
    }
  }
}