import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import {
  initGame, startBuilding, canPlaceBuilding, notifyBuildingLocked, assignIdleWorkerToBuilding, canAssignWorkerToBuilding,
  listAssignableWorkersForBuilding,
  removeWorkerFromBuilding, repairBuilding, upgradeBuilding, demolishBuilding, setWorkshopRecipe,
  recruitSettler, startResearch, establishTradeRoute, initTradeRoutes,
  EntityType, BuildingType, Season,
  BUILDING_CONFIGS, BUILDING_JOB_TYPES, WORKSHOP_RECIPES, getWorkshopRecipe, formatRecipeInputs,
  GAME_TITLE, GAME_SUBTITLE, GAME_VERSION, GAME_PHASE,
  ECOLOGICAL_FACTS, SPECIES_CONFIG, WeatherType, ResearchType,
  GRID_SIZE, snapToGrid,
  saveGame, loadGame, hasSave, deleteSave,
  getTerrainEfficiencyMultiplier, getAdjacencyMultiplier, getBuildingUpgradeCost, getTameFoodCost, tameEntity, spawnMoonHowlerDebug,
  sendRivalGift, establishRivalTradePact, showStrengthToRival, getArmamentSteps,
  getHumanArmamentLabel, hasIronSpears, hasStoneSpears, hasCompletedBlacksmith,
  estimateWorkshopGold,
} from './game/gameEngine';
import { MapSize, MapPreset } from './game/gameTypes';
import {
  formatHour, getHourOfDay, isNightHour, isResidenceBuildingType,
  hasResidenceAssignment, hasWorkAssignment, isImprisoned, getResidenceCapacity, getResidenceUpgradeSlotGain,
  NIGHT_START, PREGNANCY_TICKS, TICKS_PER_DAY,
} from './game/dayCycle';
import type { WorldState, Entity, Building } from './game/gameEngine';
import { getAgeInYears } from './game/gameEngine';
import { getBirthDateString } from './game/dayCycle';
import { screenToWorld } from './game/renderer';
import { GameLoop } from './game/gameLoop';
import {
  createInitialView,
  moveCameraView,
  zoomCameraView,
  focusCameraOn,
  clampCameraTarget,
  resolveEntity,
  resolveBuilding,
  type ViewState,
} from './game/viewState';
import { preloadAllSprites } from './game/spriteLoader';
import { getHumanVariantLabel, getHumanSelectionBounds } from './game/humanSprites';
import { isPlayerHuman } from './game/groupEvents';
import { loadNames, fixDefaultNames } from './game/nameLoader';
import IntroScreen from './game/IntroScreen';
import MapSetupScreen from './game/MapSetupScreen';
import StatisticsPanel from './game/StatisticsPanel';
import EventLogPanel from './game/EventLogPanel';
import FocusPanel from './game/FocusPanel';
import { downloadChronicleLog, loadExportChronicleOnSave } from './game/eventLogExport';
import { beginAudio, playClickSound, playFailSfx } from './audio';
import { useGameAudio } from './hooks/useGameAudio';
import { ACTIVE_VICTORY_PATHS, COMING_SOON_VICTORY_PATHS } from './game/victory';
import { saveAutoSavePreference } from './game/preferences';
import './App.css';

const SPEED_OPTIONS = [0.5, 1, 2, 3, 5, 10];

type SidebarTab = 'village' | 'nature' | 'research' | 'trade' | 'goals' | 'log' | 'guide';

const SIDEBAR_TABS: { id: SidebarTab; icon: string; label: string; hint: string }[] = [
  { id: 'village', icon: '🏘️', label: 'Village', hint: 'Population, recruit, challenges' },
  { id: 'nature', icon: '🌿', label: 'Nature', hint: 'Ecosystem health & wildlife' },
  { id: 'research', icon: '🔬', label: 'Research', hint: 'Unlock technologies' },
  { id: 'trade', icon: '🤝', label: 'Trade', hint: 'Establish trade routes' },
  { id: 'goals', icon: '🎯', label: 'Goals', hint: 'Statistics & victory paths' },
  { id: 'log', icon: '📜', label: 'Log', hint: 'Village event history' },
  { id: 'guide', icon: '❓', label: 'Guide', hint: 'How to play' },
];

const QUICK_BUILD_TYPES: BuildingType[] = [
  BuildingType.House,
  BuildingType.Farm,
  BuildingType.LumberMill,
  BuildingType.Quarry,
  BuildingType.Well,
];

const HOTKEY_BUILDINGS: Record<string, BuildingType> = {
  '1': BuildingType.House,
  '2': BuildingType.Farm,
  '3': BuildingType.LumberMill,
  '4': BuildingType.Quarry,
  '5': BuildingType.Barn,
  '6': BuildingType.Well,
  '7': BuildingType.Store,
  '8': BuildingType.Road,
  '9': BuildingType.Workshop,
};

const QUICK_START_STEPS = [
  { icon: '🏠', title: 'Build shelter before nightfall', detail: `Press 1 or pick House from the left panel, then click the map to place it before tick ${NIGHT_START} (8pm on day one). Assign your pioneers as workers to finish construction — settlers sleep at home once it is built.` },
  { icon: '👆', title: 'Inspect & manage', detail: 'Click people and buildings on the map — details always appear at the top of the right panel.' },
  { icon: '👷', title: 'Assign workers', detail: 'Select a finished building and press + Worker to put idle settlers to work.' },
  { icon: '🌿', title: 'Balance nature', detail: 'Open the Nature tab to watch ecosystem health. Wolves keep deer in check — don\'t wipe them out.' },
];

function formatNumber(n: number) {
  if (n >= 1000000) return (n / 1000000).toFixed(1) + 'M';
  if (n >= 1000) return (n / 1000).toFixed(1) + 'K';
  return Math.floor(n).toString();
}

const SEASON_ICONS: Record<Season, string> = {
  [Season.Spring]: '🌸', [Season.Summer]: '☀️', [Season.Fall]: '🍂', [Season.Winter]: '❄️',
};

const WEATHER_ICONS: Record<WeatherType, string> = {
  [WeatherType.Clear]: '', [WeatherType.Rain]: '🌧️', [WeatherType.Snow]: '❄️',
  [WeatherType.Storm]: '⛈️', [WeatherType.Fog]: '🌫️', [WeatherType.Drought]: '🌵',
};

const RESEARCH_COLORS: Record<ResearchType, string> = {
  [ResearchType.Agriculture]: '#22c55e', [ResearchType.Mining]: '#6b7280',
  [ResearchType.Forestry]: '#92400e', [ResearchType.Architecture]: '#3b82f6',
  [ResearchType.Medicine]: '#ec4899', [ResearchType.Trade]: '#f59e0b',
  [ResearchType.Education]: '#8b5cf6', [ResearchType.Defense]: '#ef4444',
};

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [world, setWorld] = useState<WorldState>(() => {
    const s = initGame();
    s.tradeRoutes = initTradeRoutes();
    return s;
  });
  const [view, setView] = useState<ViewState>(() => createInitialView(world.width, world.height));
  const [selectedMapSize, setSelectedMapSize] = useState<MapSize>(MapSize.Medium);
  const [selectedMapPreset, setSelectedMapPreset] = useState<MapPreset>(MapPreset.Verdant);
  const [selectedBuildingType, setSelectedBuildingType] = useState<BuildingType | null>(null);
  const [tipIndex, setTipIndex] = useState(() => Math.floor(Math.random() * ECOLOGICAL_FACTS.length));
  const [saveToast, setSaveToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [spritesLoaded, setSpritesLoaded] = useState(false);
  const [activeTab, setActiveTab] = useState<SidebarTab>('village');
  const [showTutorial, setShowTutorial] = useState(true);
  const [tutorialStep, setTutorialStep] = useState(0);
  const [showIntro, setShowIntro] = useState(true);
  const [showMapSetup, setShowMapSetup] = useState(false);
  const [hasSavedGame, setHasSavedGame] = useState(hasSave());
  const { muted, volumePreset, toggleMute: handleToggleMute, setVolumePreset: handleVolumePreset } = useGameAudio(world, !showIntro && !showMapSetup && spritesLoaded);
  const [buildPanelOpen, setBuildPanelOpen] = useState(() => {
    try {
      return localStorage.getItem('wilderfolk-build-panel') !== 'collapsed';
    } catch {
      return true;
    }
  });
  const [firstNightWarningDismissed, setFirstNightWarningDismissed] = useState(false);

  const worldRef = useRef(world);
  const viewRef = useRef(view);
  const loopRef = useRef<GameLoop | null>(null);

  useEffect(() => {
    worldRef.current = world;
    viewRef.current = view;
  });

  useEffect(() => {
    try {
      localStorage.setItem('wilderfolk-build-panel', buildPanelOpen ? 'open' : 'collapsed');
    } catch { /* ignore */ }
  }, [buildPanelOpen]);
  const isDraggingRef = useRef(false);
  const cameraDragStartRef = useRef<{ x: number; y: number } | null>(null);
  const cameraVelRef = useRef({ x: 0, y: 0 });
  const keysRef = useRef<Set<string>>(new Set());

  // Preload sprites and names
  useEffect(() => {
    Promise.all([preloadAllSprites(), loadNames()]).then(() => {
      fixDefaultNames(world);
      setSpritesLoaded(true);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!saveToast) return;
    const timer = setTimeout(() => setSaveToast(null), 4000);
    return () => clearTimeout(timer);
  }, [saveToast]);

  // Auto-save every 30 seconds (stable interval via ref)
  useEffect(() => {
    const interval = setInterval(() => {
      const session = loopRef.current?.getWorldAndView() ?? { world: worldRef.current, view: viewRef.current };
      if (!session.world.paused && session.world.autoSave) {
        const result = saveGame(session.world, session.view);
        if (!result.success) {
          setSaveToast({ message: result.error, type: 'error' });
        }
      }
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Auto-dismiss big news after 12 seconds and cap the list
  useEffect(() => {
    if (world.bigNews.length === 0) return;
    const timer = setInterval(() => {
      loopRef.current?.mutateWorld((prev) => {
        const now = prev.tick;
        const updated = prev.bigNews
          .map(n => ({ ...n, dismissed: n.dismissed || now - n.createdAt > 360 }))
          .filter(n => !n.dismissed || now - n.createdAt < 600);
        if (updated.length !== prev.bigNews.length) prev.bigNews = updated;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [world.bigNews.length, world.tick]);

  // Keep the sim frozen while Quick Start is open
  useEffect(() => {
    if (!spritesLoaded || showIntro || !showTutorial) return;
    loopRef.current?.mutateWorld((w) => { w.paused = true; });
  }, [showTutorial, spritesLoaded, showIntro]);

  const hasPlacedHouse = useMemo(
    () => world.buildings.some((b) => b.type === BuildingType.House),
    [world.buildings],
  );

  const isFirstGameDay = world.tick < TICKS_PER_DAY;

  // First-night shelter reminder on day one until a House is placed
  const showFirstNightWarning =
    !firstNightWarningDismissed &&
    !hasPlacedHouse &&
    world.tick < TICKS_PER_DAY * 2;

  const firstNightWarningMessage = isFirstGameDay && world.tick < NIGHT_START
    ? `Tick ${world.tick} — night begins at tick ${NIGHT_START} (8pm). Place a House on the map and assign workers!`
    : `Night has fallen — place a House and assign workers so your pioneers have somewhere to sleep.`;

  // Simulation + render loop (decoupled from React render cycle)
  useEffect(() => {
    if (!spritesLoaded || showIntro) {
      loopRef.current?.stop();
      loopRef.current = null;
      return;
    }
    const loop = new GameLoop(worldRef.current, viewRef.current, () => canvasRef.current);
    loopRef.current = loop;
    const unsub = loop.subscribe((nextWorld, nextView) => {
      worldRef.current = nextWorld;
      viewRef.current = nextView;
      setWorld(nextWorld);
      setView(nextView);
    });
    loop.start();
    return () => {
      unsub();
      loop.stop();
      loopRef.current = null;
    };
  }, [spritesLoaded, showIntro]);

  const togglePause = useCallback(() => {
    loopRef.current?.mutateWorld((w) => { w.paused = !w.paused; });
  }, []);

  const toggleGrid = useCallback(() => {
    const loop = loopRef.current;
    if (!loop) return;
    const next = !loop.getView().showGrid;
    loop.patchView({ showGrid: next });
  }, []);

  const cancelBuildMode = useCallback(() => {
    setSelectedBuildingType(null);
    loopRef.current?.patchView({ buildMode: null, buildGhost: null });
  }, []);

  const clearSelection = useCallback(() => {
    loopRef.current?.patchView({ selectedEntityId: null, selectedBuildingId: null });
  }, []);

  const selectBuildingType = useCallback((type: BuildingType) => {
    clearSelection();
    setSelectedBuildingType((prev) => {
      const next = prev === type ? null : type;
      loopRef.current?.patchView({
        buildMode: next,
        buildGhost: next ? loopRef.current.getView().buildGhost : null,
        ...(next ? { showGrid: true } : {}),
      });
      return next;
    });
  }, [clearSelection]);

  const applyGameAction = useCallback((fn: (w: WorldState) => WorldState) => {
    loopRef.current?.applyAction(fn);
  }, []);

  const getViewCamera = useCallback(() => {
    return loopRef.current?.getView().camera ?? viewRef.current.camera;
  }, []);

  const BUILDING_HOTKEYS: Record<string, string> = useMemo(() => {
    const map: Record<string, string> = {};
    for (const [key, val] of Object.entries(HOTKEY_BUILDINGS)) {
      map[val] = key;
    }
    return map;
  }, []);

  // Keyboard controls with WASD + momentum
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      keysRef.current.add(e.key.toLowerCase());
      if (e.key === ' ') { e.preventDefault(); togglePause(); }
      if (e.key === 'Escape') {
        if (selectedBuildingType) {
          cancelBuildMode();
        } else {
          loopRef.current?.patchView({ selectedEntityId: null, selectedBuildingId: null });
        }
      }
      if (e.key === '+' || e.key === '=') {
        const loop = loopRef.current;
        if (loop) loop.patchView(zoomCameraView(loop.getView(), 1.1));
      }
      if (e.key === '-') {
        const loop = loopRef.current;
        if (loop) loop.patchView(zoomCameraView(loop.getView(), 0.9));
      }
      // Building hotkeys
      if (HOTKEY_BUILDINGS[e.key]) {
        selectBuildingType(HOTKEY_BUILDINGS[e.key]);
      }
      if (e.key === 'b' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        setBuildPanelOpen((open) => !open);
      }
      if (e.key === 'g' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        toggleGrid();
      }
      if (e.key === 'h' && !e.ctrlKey && !e.metaKey && !e.altKey) {
        const loop = loopRef.current;
        if (loop) {
          const world = loop.getWorld();
          const settlers = world.entities.filter((ent) => ent.alive && isPlayerHuman(ent));
          if (settlers.length > 0) {
            const cx = settlers.reduce((sum, ent) => sum + ent.x, 0) / settlers.length;
            const cy = settlers.reduce((sum, ent) => sum + ent.y, 0) / settlers.length;
            const nextView = focusCameraOn(loop.getView(), cx, cy, 1.5);
            clampCameraTarget(nextView.camera, world.width, world.height);
            loop.patchView(nextView);
          }
        }
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      keysRef.current.delete(e.key.toLowerCase());
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);

    // Camera momentum loop
    let animId: number;
    const cameraLoop = () => {
      const keys = keysRef.current;
      const speed = 6;
      let dx = 0, dy = 0;
      if (keys.has('w') || keys.has('arrowup')) dy -= speed;
      if (keys.has('s') || keys.has('arrowdown')) dy += speed;
      if (keys.has('a') || keys.has('arrowleft')) dx -= speed;
      if (keys.has('d') || keys.has('arrowright')) dx += speed;

      if (dx !== 0 || dy !== 0) {
        cameraVelRef.current.x += dx * 0.3;
        cameraVelRef.current.y += dy * 0.3;
      }

      // Apply momentum with friction
      if (Math.abs(cameraVelRef.current.x) > 0.1 || Math.abs(cameraVelRef.current.y) > 0.1) {
        const loop = loopRef.current;
        if (loop) {
          const view = loop.getView();
          const cam = { ...view.camera };
          cam.targetX += cameraVelRef.current.x / cam.zoom;
          cam.targetY += cameraVelRef.current.y / cam.zoom;
          clampCameraTarget(cam, loop.getWorld().width, loop.getWorld().height);
          loop.patchView({ camera: cam }, true);
        }
        cameraVelRef.current.x *= 0.85;
        cameraVelRef.current.y *= 0.85;
      } else {
        cameraVelRef.current.x = 0;
        cameraVelRef.current.y = 0;
      }

      animId = requestAnimationFrame(cameraLoop);
    };
    animId = requestAnimationFrame(cameraLoop);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      cancelAnimationFrame(animId);
    };
  }, [togglePause, selectBuildingType, selectedBuildingType, cancelBuildMode, toggleGrid]);

  const handleCanvasClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasW = canvas.offsetWidth;
    const canvasH = canvas.offsetHeight;
    const scaleX = canvasW / rect.width;
    const scaleY = canvasH / rect.height;
    const screenX = (e.clientX - rect.left) * scaleX;
    const screenY = (e.clientY - rect.top) * scaleY;
    const [worldX, worldY] = screenToWorld(screenX, screenY, getViewCamera(), canvasW, canvasH);

    if (selectedBuildingType) {
      const snapX = snapToGrid(worldX, GRID_SIZE);
      const snapY = snapToGrid(worldY, GRID_SIZE);
      playClickSound();
      applyGameAction((prev) => startBuilding(prev, selectedBuildingType, snapX, snapY));
      return;
    }

    // Check building selection first so scenery inside the footprint doesn't steal clicks
    let clickedBuilding: Building | null = null;
    for (const b of world.buildings) {
      if (worldX >= b.x - b.width / 2 && worldX <= b.x + b.width / 2 &&
          worldY >= b.y - b.height / 2 && worldY <= b.y + b.height / 2) {
        clickedBuilding = b;
      }
    }

    // Check entity selection (humans still win over buildings; trees/grass do not)
    const camera = getViewCamera();
    let clickedEntity: Entity | null = null;
    for (const ent of world.entities) {
      if (!ent.alive) continue;
      if (clickedBuilding && (ent.type === EntityType.Tree || ent.type === EntityType.Grass)) {
        continue;
      }
      if (ent.type === EntityType.Human) {
        // Human sprites are much taller than their collision size, so use the rendered bounds.
        const bounds = getHumanSelectionBounds(ent, camera.zoom);
        const dx = worldX - bounds.cx;
        const dy = worldY - bounds.cy;
        if ((dx / bounds.rx) ** 2 + (dy / bounds.ry) ** 2 <= 1) {
          clickedEntity = ent;
        }
        continue;
      }
      const dx = ent.x - worldX;
      const dy = ent.y - worldY;
      if (dx * dx + dy * dy <= (ent.size * 1.2 + 6) ** 2) {
        clickedEntity = ent;
      }
    }

    loopRef.current?.patchView({
      selectedEntityId: clickedEntity?.id ?? null,
      selectedBuildingId: clickedBuilding?.id ?? null,
    });
  }, [selectedBuildingType, world.entities, world.buildings, getViewCamera, applyGameAction]);

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const canvasW = canvas.offsetWidth;
    const canvasH = canvas.offsetHeight;
    const screenX = (e.clientX - rect.left) * (canvasW / rect.width);
    const screenY = (e.clientY - rect.top) * (canvasH / rect.height);
    const [worldX, worldY] = screenToWorld(screenX, screenY, getViewCamera(), canvasW, canvasH);

    if (isDraggingRef.current && cameraDragStartRef.current) {
      const dx = e.clientX - cameraDragStartRef.current.x;
      const dy = e.clientY - cameraDragStartRef.current.y;
      const loop = loopRef.current;
        if (loop) {
          loop.patchView(moveCameraView(loop.getView(), loop.getWorld(), -dx / loop.getView().camera.zoom, -dy / loop.getView().camera.zoom), true);
        }
      cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
    }

    // Track hovered building for visual highlight
    let hovered: Building | null = null;
    if (!selectedBuildingType && !isDraggingRef.current) {
      for (const b of world.buildings) {
        if (worldX >= b.x - b.width / 2 && worldX <= b.x + b.width / 2 &&
            worldY >= b.y - b.height / 2 && worldY <= b.y + b.height / 2) {
          hovered = b;
        }
      }
    }

    if (selectedBuildingType) {
      const snapX = snapToGrid(worldX, GRID_SIZE);
      const snapY = snapToGrid(worldY, GRID_SIZE);
      const valid = canPlaceBuilding(world, selectedBuildingType, snapX, snapY);
      loopRef.current?.patchView({
        buildGhost: { x: snapX, y: snapY, valid },
        hoveredBuildingId: hovered?.id ?? null,
      }, true);
    } else {
      loopRef.current?.patchView({ hoveredBuildingId: hovered?.id ?? null }, true);
    }
  }, [selectedBuildingType, world, getViewCamera]);

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (e.button === 2 && selectedBuildingType) {
      cancelBuildMode();
      return;
    }
    if (e.button === 1 || e.button === 2 || (e.button === 0 && !selectedBuildingType)) {
      isDraggingRef.current = true;
      cameraDragStartRef.current = { x: e.clientX, y: e.clientY };
    }
  }, [selectedBuildingType, cancelBuildMode]);

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false;
    cameraDragStartRef.current = null;
  }, []);

  const handleMouseLeave = useCallback(() => {
    isDraggingRef.current = false;
    cameraDragStartRef.current = null;
    loopRef.current?.patchView({ hoveredBuildingId: null }, true);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const factor = e.deltaY > 0 ? 0.9 : 1.1;
    const loop = loopRef.current;
    if (loop) loop.patchView(zoomCameraView(loop.getView(), factor));
  }, []);

  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
  }, []);

  const setSpeed = (speed: number) => loopRef.current?.mutateWorld((w) => { w.speed = speed; });
  const resetGame = () => {
    deleteSave();
    const s = initGame({ size: selectedMapSize, preset: selectedMapPreset });
    s.paused = true;
    s.tradeRoutes = initTradeRoutes();
    const nextView = createInitialView(s.width, s.height);
    worldRef.current = s;
    viewRef.current = nextView;
    setWorld(s);
    setView(nextView);
    loopRef.current?.setSession(s, nextView);
    setSelectedBuildingType(null);
    setHasSavedGame(false);
    setFirstNightWarningDismissed(false);
    setShowTutorial(true);
    setTutorialStep(0);
  };

  const toggleAutoSave = () => {
    loopRef.current?.mutateWorld((w) => {
      w.autoSave = !w.autoSave;
      saveAutoSavePreference(w.autoSave);
    });
  };

  const handleSave = () => {
    const session = loopRef.current?.getWorldAndView() ?? { world: worldRef.current, view: viewRef.current };
    const result = saveGame(session.world, session.view);
    if (result.success) {
      if (loadExportChronicleOnSave()) {
        downloadChronicleLog(session.world.eventLog, {
          villageName: session.world.villageName,
          year: session.world.year,
          day: session.world.dayInYear,
          tick: session.world.tick,
          population: session.world.humanPopulation,
        });
      }
      loopRef.current?.mutateWorld((prev) => {
        const id = prev.nextFloatingTextId++;
        prev.floatingTexts.push({
          id,
          x: prev.width / 2, y: prev.height / 2 - 50,
          text: 'Game Saved! 💾',
          color: '#22c55e',
          life: 60, maxLife: 60, scale: 1.5,
        });
      });
      setHasSavedGame(true);
      setSaveToast({
        message: loadExportChronicleOnSave()
          ? 'Game saved · chronicle .txt downloaded'
          : 'Game saved successfully',
        type: 'success',
      });
    } else {
      setSaveToast({ message: result.error, type: 'error' });
    }
  };

  const handleLoad = () => {
    const loaded = loadGame();
    if (loaded) {
      loaded.world.tradeRoutes = loaded.world.tradeRoutes.length > 0 ? loaded.world.tradeRoutes : initTradeRoutes();
      fixDefaultNames(loaded.world);
      worldRef.current = loaded.world;
      viewRef.current = loaded.view;
      setWorld(loaded.world);
      setView(loaded.view);
      loopRef.current?.setSession(loaded.world, loaded.view);
      setHasSavedGame(true);
    }
  };

  const villageStats = useMemo(() => {
    const settlers = world.entities.filter((e) => e.alive && isPlayerHuman(e));
    return {
      total: settlers.length,
      adults: settlers.filter((e) => !e.isJuvenile).length,
      children: settlers.filter((e) => e.isJuvenile).length,
      working: settlers.filter((e) => {
        if (e.isJuvenile || isImprisoned(e)) return false;
        if (hasWorkAssignment(e)) return true;
        return world.buildings.some((b) => !b.completed && b.occupants.includes(e.id));
      }).length,
      idle: settlers.filter((e) => {
        if (e.isJuvenile || isImprisoned(e)) return false;
        if (hasWorkAssignment(e)) return false;
        return !world.buildings.some((b) => !b.completed && b.occupants.includes(e.id));
      }).length,
      imprisoned: settlers.filter((e) => !e.isJuvenile && isImprisoned(e)).length,
    };
  }, [world.entities, world.buildings]);

  const buildingCategories = [
    { label: 'Housing', types: [BuildingType.House, BuildingType.Mansion], color: 'bg-amber-500' },
    { label: 'Food', types: [BuildingType.Farm, BuildingType.Greenhouse, BuildingType.Barn, BuildingType.Silo, BuildingType.Mill], color: 'bg-green-500' },
    { label: 'Resources', types: [BuildingType.LumberMill, BuildingType.Quarry, BuildingType.Mine], color: 'bg-stone-500' },
    { label: 'Industry', types: [BuildingType.Blacksmith, BuildingType.Workshop, BuildingType.Store, BuildingType.Market], color: 'bg-orange-500' },
    { label: 'Community', types: [BuildingType.TownHall, BuildingType.Church, BuildingType.School, BuildingType.Hospital, BuildingType.Prison, BuildingType.Well, BuildingType.TamingPost], color: 'bg-amber-600' },
    { label: 'Infra', types: [BuildingType.Road], color: 'bg-gray-500' },
  ];

  if (!spritesLoaded) {
    return (
      <div className="flex h-screen w-screen items-center justify-center bg-stone-900">
        <div className="text-center">
          <img src="/logo.png" alt="Wilderfolk" className="mx-auto mb-4 h-32 w-32 animate-pulse" style={{ filter: 'drop-shadow(0 0 30px rgba(34,197,94,0.4))' }} />
          <h1 className="mb-2 text-2xl font-bold text-white">{GAME_TITLE}</h1>
          <p className="mb-4 text-stone-400">Loading pixel art assets...</p>
          <div className="mx-auto h-2 w-48 overflow-hidden rounded-full bg-stone-700">
            <div className="h-full animate-pulse rounded-full bg-emerald-500" style={{ width: '60%' }} />
          </div>
        </div>
      </div>
    );
  }

  if (showIntro) {
    return (
      <IntroScreen
        onContinue={() => {
          setShowIntro(false);
          setShowMapSetup(true);
        }}
      />
    );
  }

  if (showMapSetup) {
    return (
      <MapSetupScreen
        selectedSize={selectedMapSize}
        selectedPreset={selectedMapPreset}
        onSizeChange={setSelectedMapSize}
        onPresetChange={setSelectedMapPreset}
        onBack={() => {
          setShowMapSetup(false);
          setShowIntro(true);
        }}
        onStart={(villageName) => {
          void beginAudio();
          const s = initGame({ size: selectedMapSize, preset: selectedMapPreset, villageName });
          s.paused = true;
          s.tradeRoutes = initTradeRoutes();
          const nextView = createInitialView(s.width, s.height);
          worldRef.current = s;
          viewRef.current = nextView;
          setWorld(s);
          setView(nextView);
          setShowMapSetup(false);
        }}
        onLoad={() => {
          void beginAudio();
          const loaded = loadGame();
          if (loaded) {
            loaded.world.tradeRoutes = loaded.world.tradeRoutes.length > 0 ? loaded.world.tradeRoutes : initTradeRoutes();
            fixDefaultNames(loaded.world);
            worldRef.current = loaded.world;
            viewRef.current = loaded.view;
            setWorld(loaded.world);
            setView(loaded.view);
            setHasSavedGame(true);
            setShowMapSetup(false);
          }
        }}
        hasSave={hasSavedGame}
      />
    );
  }

  const selectedEntity = resolveEntity(world, view.selectedEntityId);
  const selectedBuilding = resolveBuilding(world, view.selectedBuildingId);
  const canvasCursor = selectedBuildingType
    ? 'crosshair'
    : view.hoveredBuildingId
      ? 'pointer'
      : 'default';

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-stone-900 text-stone-100">
      {/* Header */}
      <header className="flex items-center justify-between border-b border-stone-700 bg-stone-800 px-4 py-2 shadow-lg">
        {/* Left: Logo + Title */}
        <div className="flex items-center gap-3">
          <img
            src="/logo.png"
            alt="Wilderfolk"
            className="h-12 w-12 rounded-lg object-contain shadow-lg ring-2 ring-amber-500/40"
            style={{ filter: 'drop-shadow(0 0 8px rgba(217,119,6,0.4))' }}
          />
          <div className="flex flex-col">
            <h1 className="text-base font-bold leading-tight text-white">{world.villageName || GAME_TITLE}</h1>
            <div className="flex items-center gap-2">
              <p className="text-[10px] uppercase tracking-widest text-stone-400">{GAME_SUBTITLE}</p>
              <span className="rounded bg-amber-900/60 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-amber-400 ring-1 ring-amber-600/40">{GAME_PHASE}</span>
              <span className="rounded bg-stone-700 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-stone-500">v{GAME_VERSION}</span>
            </div>
          </div>
        </div>

        {/* Center: Season / Year */}
        <div className="flex items-center gap-3 rounded-lg bg-stone-700/50 px-4 py-1.5 text-sm backdrop-blur">
          <span className="text-lg">{SEASON_ICONS[world.season]}</span>
          <span className="min-w-[3rem] text-center font-semibold capitalize text-emerald-400">{world.season}</span>
          {world.weather !== WeatherType.Clear && (
            <span className="text-lg" title={world.weather}>{WEATHER_ICONS[world.weather]}</span>
          )}
          {world.festival && (
            <span className="text-lg" title={`${world.festival.name} — ${world.festival.daysLeft} days left`}>🎉</span>
          )}
          <div className="h-4 w-px bg-stone-600" />
          <span className="text-stone-400">Year</span>
          <strong className="min-w-[1.5rem] text-center text-white">{world.year}</strong>
          <div className="h-4 w-px bg-stone-600" />
          <span className="text-stone-400">Day</span>
          <strong className="min-w-[1.5rem] text-center text-white">{world.dayInYear}</strong>
          <div className="h-4 w-px bg-stone-600" />
          <span title={isNightHour(getHourOfDay(world.tick)) ? 'Night — settlers head home' : 'Daytime'}>
            {isNightHour(getHourOfDay(world.tick)) ? '🌙' : '☀️'}
          </span>
          <strong className="min-w-[2.5rem] text-center text-white">{formatHour(getHourOfDay(world.tick))}</strong>
        </div>

        {/* Right: Population + Resources + Controls */}
        <div className="flex items-center gap-2">
          <PopulationBadge
            total={villageStats.total}
            max={world.maxHumanPopulation}
            working={villageStats.working}
            idle={villageStats.idle}
            children={villageStats.children}
            imprisoned={villageStats.imprisoned}
          />
          <div className="mx-1 h-6 w-px bg-stone-600" />
          <div className="flex items-center gap-1.5 text-xs font-medium">
            <ResourceBadge icon="🪵" value={world.resources.wood} max={world.storageMax.wood} color="bg-amber-900/40 text-amber-400" />
            <ResourceBadge icon="🪨" value={world.resources.stone} max={world.storageMax.stone} color="bg-stone-700/60 text-stone-300" />
            <ResourceBadge icon="🍖" value={world.resources.food} max={world.storageMax.food} color="bg-green-900/40 text-green-400" />
            <ResourceBadge icon="💰" value={world.resources.gold} color="bg-yellow-900/40 text-yellow-400" />
          </div>
          
          <div className="mx-1 h-6 w-px bg-stone-600" />
          
          <button onClick={togglePause}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${world.paused ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-amber-600 text-white hover:bg-amber-500'}`}>
            {world.paused ? '▶ Play' : '⏸ Pause'}
          </button>
          
          <div className="flex gap-0.5 rounded-lg bg-stone-700 p-0.5">
            {SPEED_OPTIONS.map(s => (
              <button key={s} onClick={() => setSpeed(s)}
                className={`rounded-md px-2 py-1 text-[10px] font-bold transition-all ${world.speed === s ? 'bg-stone-500 text-white shadow' : 'text-stone-400 hover:text-white'}`}>
                {s}x
              </button>
            ))}
          </div>
          
          <div className="mx-1 h-6 w-px bg-stone-600" />
          
          {hasSavedGame && (
            <button onClick={handleLoad} className="rounded-lg bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-emerald-200 hover:bg-emerald-600 transition-all">
              📂 Load
            </button>
          )}
          <button onClick={handleSave} className="rounded-lg bg-stone-700 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-600 transition-all">
            💾 Save
          </button>
          <button
            onClick={toggleAutoSave}
            className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-all ${
              world.autoSave
                ? 'bg-emerald-900/50 text-emerald-300 hover:bg-emerald-800/60'
                : 'bg-stone-800 text-stone-500 hover:bg-stone-700 hover:text-stone-400'
            }`}
            title={world.autoSave ? 'Auto-save every 30s (click to turn off)' : 'Auto-save off (click to turn on)'}
          >
            {world.autoSave ? '⟳ Auto' : '⟳ Off'}
          </button>
          <div className="flex items-center gap-1 rounded-lg border border-stone-600 bg-stone-800/80 p-0.5">
            <button
              onClick={handleToggleMute}
              className={`rounded-md px-2 py-1 text-xs font-bold transition-all ${
                muted
                  ? 'bg-stone-700 text-stone-400 hover:bg-stone-600'
                  : 'bg-emerald-700 text-emerald-200 hover:bg-emerald-600'
              }`}
              title={muted ? 'Unmute' : 'Mute'}
            >
              {muted ? '🔇' : '🔊'}
            </button>
            {!muted && (
              <select
                value={volumePreset}
                onChange={(e) => handleVolumePreset(e.target.value as 'soft' | 'normal' | 'loud')}
                className="max-w-[5.5rem] rounded-md border-0 bg-stone-700/80 py-1 pl-1.5 pr-0.5 text-[10px] font-semibold text-stone-200 outline-none hover:bg-stone-600"
                title="Volume — soft, normal, or loud"
                aria-label="Volume preset"
              >
                <option value="soft">Soft</option>
                <option value="normal">Normal</option>
                <option value="loud">Loud</option>
              </select>
            )}
          </div>
          <button onClick={resetGame} className="rounded-lg bg-stone-700 px-3 py-1.5 text-xs font-semibold text-stone-300 hover:bg-stone-600 transition-all">
            ↺ Reset
          </button>
        </div>
      </header>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left sidebar — collapsible construction panel */}
        <aside
          className={`build-panel relative flex shrink-0 flex-col border-r border-stone-700 bg-stone-800/90 backdrop-blur transition-[width] duration-300 ease-in-out ${
            buildPanelOpen ? 'w-56' : 'w-12'
          }`}
        >
          <button
            onClick={() => setBuildPanelOpen((open) => !open)}
            className="build-panel-toggle absolute -right-3 top-5 z-20 flex h-6 w-6 items-center justify-center rounded-full border border-stone-600 bg-stone-800 text-xs font-bold text-stone-300 shadow-lg transition-all hover:border-emerald-500/50 hover:bg-stone-700 hover:text-emerald-300"
            title={buildPanelOpen ? 'Collapse build panel (B)' : 'Expand build panel (B)'}
          >
            {buildPanelOpen ? '‹' : '›'}
          </button>

          {buildPanelOpen ? (
            <div className="flex h-full flex-col overflow-y-auto p-2.5">
              <div className="mb-3 flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-wider text-stone-400">Construction</h2>
                {selectedBuildingType && (
                  <button onClick={cancelBuildMode} className="rounded bg-rose-900/40 px-2 py-0.5 text-[10px] font-semibold text-rose-300 hover:bg-rose-900/60">
                    ✕ Cancel
                  </button>
                )}
              </div>

              {buildingCategories.map(cat => (
                <div key={cat.label} className="mb-3">
                  <div className="mb-1 flex items-center gap-1.5">
                    <div className={`h-1.5 w-1.5 rounded-full ${cat.color}`} />
                    <h3 className="text-[10px] font-bold uppercase tracking-wider text-stone-500">{cat.label}</h3>
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    {cat.types.map(type => {
                      const config = BUILDING_CONFIGS[type];
                      const selected = selectedBuildingType === type;
                      const affordable = world.resources.wood >= config.cost.wood &&
                        world.resources.stone >= config.cost.stone &&
                        world.resources.gold >= config.cost.gold;
                      const locked = config.unlockRequirement && !world.unlockedTechs.includes(config.unlockRequirement);
                      const lockTech = locked && config.unlockRequirement
                        ? world.researchNodes.find((n) => n.id === config.unlockRequirement)
                        : undefined;

                      return (
                        <button key={type} onClick={() => {
                            if (locked) {
                              applyGameAction((prev) => notifyBuildingLocked(prev, type));
                            } else {
                              selectBuildingType(type);
                            }
                          }}
                          title={`${config.description} ${BUILDING_HOTKEYS[type] ? `[${BUILDING_HOTKEYS[type]}] ` : ''}${locked ? `(Research: ${lockTech?.name ?? config.unlockRequirement})` : ''}`}
                          className={`group relative flex flex-col items-center rounded-lg border p-1 text-center transition-all ${
                            selected ? 'border-emerald-500 bg-emerald-500/20 shadow-lg shadow-emerald-500/10' :
                            locked ? 'border-stone-700 bg-stone-800 opacity-40 cursor-pointer hover:border-amber-600/40' :
                            affordable ? 'border-stone-600 bg-stone-700/50 hover:border-emerald-500/50 hover:bg-emerald-500/10' :
                            'border-stone-700 bg-stone-800 opacity-50'
                          }`}>
                          <div className="mb-0.5 flex h-3.5 w-full items-center justify-between px-0.5">
                            {BUILDING_HOTKEYS[type] ? (
                              <span className="flex h-3.5 w-3.5 items-center justify-center rounded bg-stone-800 text-[7px] font-bold text-emerald-400 ring-1 ring-stone-600">
                                {BUILDING_HOTKEYS[type]}
                              </span>
                            ) : <span />}
                            {locked && <span className="text-[7px]">🔒</span>}
                          </div>
                          <img src={config.sprite} alt={config.label} className="mb-0.5 h-7 w-7 object-contain" />
                          <span className="text-[8px] font-bold leading-tight text-stone-200">{config.label}</span>
                          {locked && lockTech && (
                            <span className="text-[6px] leading-tight text-amber-500/90">🔒 {lockTech.name}</span>
                          )}
                          <span className="mt-0.5 inline-flex gap-1 text-[7px] text-stone-500">
                            {config.cost.wood > 0 && <span>{config.cost.wood}w</span>}
                            {config.cost.stone > 0 && <span>{config.cost.stone}s</span>}
                            {config.cost.gold > 0 && <span>{config.cost.gold}g</span>}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {selectedBuildingType && (
                <div className="mt-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-[10px] text-emerald-300">
                  <p className="font-semibold">Placing: {BUILDING_CONFIGS[selectedBuildingType].label}</p>
                  <p className="mt-1 text-stone-400">Click the map to place · ESC or right-click to cancel</p>
                  <p className="mt-1.5 leading-relaxed text-stone-500">
                    <span className="text-emerald-400">Green dots</span> = valid ·{' '}
                    <span className="text-red-400">Red tint</span> = blocked terrain ·{' '}
                    Water shows on the map (blue)
                  </p>
                </div>
              )}

              <div className="mt-auto space-y-2 pt-4">
                <button
                  onClick={toggleGrid}
                  className={`w-full rounded-lg border px-3 py-2 text-[10px] font-bold transition-all ${
                    view.showGrid
                      ? 'border-emerald-500/40 bg-emerald-500/20 text-emerald-300'
                      : 'border-stone-700 bg-stone-800 text-stone-400 hover:border-stone-600 hover:text-stone-300'
                  }`}
                  title="Toggle placement grid (G)"
                >
                  {view.showGrid ? '⊞ Grid ON' : '⊞ Grid off'}
                </button>
                <div className="rounded-lg border border-stone-700 bg-stone-800 p-2 text-[9px] text-stone-500">
                  <strong className="text-stone-400">Shortcuts:</strong><br />
                  B — Toggle this panel<br />
                  G — Toggle grid<br />
                  1–9 — Quick-build<br />
                  ESC — Cancel / clear
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full flex-col items-center gap-2 py-3">
              <span className="text-base" title="Construction">🏗️</span>

              <button
                onClick={toggleGrid}
                className={`flex h-9 w-9 items-center justify-center rounded-lg border text-sm transition-all ${
                  view.showGrid
                    ? 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300'
                    : 'border-stone-700 bg-stone-800/80 text-stone-500 hover:border-stone-600 hover:text-stone-300'
                }`}
                title="Toggle grid (G)"
              >
                ⊞
              </button>

              <div className="my-1 h-px w-7 bg-stone-700" />

              {QUICK_BUILD_TYPES.map((type) => {
                const config = BUILDING_CONFIGS[type];
                const selected = selectedBuildingType === type;
                const hotkey = BUILDING_HOTKEYS[type];
                return (
                  <button
                    key={type}
                    onClick={() => selectBuildingType(type)}
                    title={`${config.label}${hotkey ? ` (${hotkey})` : ''}`}
                    className={`relative flex h-9 w-9 items-center justify-center rounded-lg border transition-all ${
                      selected
                        ? 'border-emerald-500 bg-emerald-500/25 shadow-md shadow-emerald-500/20'
                        : 'border-stone-700 bg-stone-800/80 hover:border-emerald-500/40 hover:bg-emerald-500/10'
                    }`}
                  >
                    <img src={config.sprite} alt={config.label} className="h-6 w-6 object-contain" />
                    {hotkey && (
                      <span className="absolute -right-0.5 -top-0.5 flex h-3.5 w-3.5 items-center justify-center rounded-full bg-stone-900 text-[7px] font-bold text-emerald-400 ring-1 ring-stone-600">
                        {hotkey}
                      </span>
                    )}
                  </button>
                );
              })}

              {selectedBuildingType && (
                <button
                  onClick={cancelBuildMode}
                  className="mt-1 flex h-8 w-8 items-center justify-center rounded-lg border border-rose-800/50 bg-rose-950/40 text-[10px] text-rose-300 hover:bg-rose-900/50"
                  title="Cancel placement"
                >
                  ✕
                </button>
              )}

              <button
                onClick={() => setBuildPanelOpen(true)}
                className="mt-auto flex h-8 w-8 items-center justify-center rounded-lg border border-stone-700 bg-stone-800/80 text-stone-400 hover:border-emerald-500/40 hover:text-emerald-300"
                title="Expand full build menu (B)"
              >
                »
              </button>
            </div>
          )}
        </aside>

        {/* Center - Canvas */}
        <main ref={containerRef} className="relative bg-stone-900" style={{ flex: '1 1 0%', minHeight: 0, minWidth: 0 }}>
          <canvas
            ref={canvasRef}
            onClick={handleCanvasClick}
            onMouseMove={handleMouseMove}
            onMouseDown={handleMouseDown}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseLeave}
            onWheel={handleWheel}
            onContextMenu={handleContextMenu}
            style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%', imageRendering: 'pixelated', cursor: canvasCursor, display: 'block' }}
          />

          {/* Build mode banner */}
          {selectedBuildingType && (
            <div className="pointer-events-none absolute bottom-24 left-1/2 z-20 -translate-x-1/2">
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/90 px-5 py-2.5 text-center shadow-2xl backdrop-blur">
                <p className="text-sm font-bold text-emerald-200">
                  Placing {BUILDING_CONFIGS[selectedBuildingType].label}
                </p>
                <p className="text-[10px] text-stone-400">Click to place · ESC to cancel</p>
              </div>
            </div>
          )}
          
          {/* Floating notifications */}
          <div className="absolute left-4 top-4 flex max-w-xs flex-col gap-1">
            {world.notifications.slice(-3).map(n => (
              <div key={n.id} className={`rounded-lg border px-3 py-1.5 text-xs shadow-lg backdrop-blur transition-all animate-in slide-in-from-left ${
                n.type === 'success' ? 'border-emerald-500/30 bg-emerald-500/20 text-emerald-200' :
                n.type === 'warning' ? 'border-amber-500/30 bg-amber-500/20 text-amber-200' :
                n.type === 'event' ? 'border-amber-500/30 bg-amber-500/20 text-amber-200' :
                'border-stone-600 bg-stone-800/90 text-stone-200'
              }`}>
                <strong>{n.title}</strong> {n.message}
              </div>
            ))}
          </div>

          {/* Active event banner */}
          {world.activeEvent && (
            <div className="absolute left-1/2 top-4 w-full max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top">
              <div className={`rounded-xl border p-3 shadow-xl backdrop-blur ${
                world.activeEvent.type === 'positive' ? 'border-emerald-500/30 bg-emerald-900/80' :
                world.activeEvent.type === 'negative' ? 'border-rose-500/30 bg-rose-900/80' :
                'border-stone-500/30 bg-stone-800/90'
              }`}>
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{world.activeEvent.emoji}</span>
                  <div>
                    <h3 className="font-bold text-white">{world.activeEvent.title}</h3>
                    <p className="text-xs text-stone-300">{world.activeEvent.description}</p>
                    <p className={`mt-1 text-xs font-bold ${
                      world.activeEvent.type === 'positive' ? 'text-emerald-400' :
                      world.activeEvent.type === 'negative' ? 'text-rose-400' : 'text-amber-400'
                    }`}>{world.activeEvent.effect}</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* First-night shelter warning */}
          {showFirstNightWarning && (
            <div className="absolute left-1/2 top-16 z-20 w-full max-w-md -translate-x-1/2 animate-in fade-in slide-in-from-top">
              <div className="rounded-xl border border-amber-500/40 bg-amber-950/90 p-3 shadow-xl backdrop-blur">
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{isFirstGameDay && world.tick < NIGHT_START ? '🌅' : '🌙'}</span>
                  <div className="flex-1">
                    <h3 className="font-bold text-amber-200">
                      {isFirstGameDay && world.tick < NIGHT_START ? 'Sunset is approaching' : 'Your pioneers need shelter'}
                    </h3>
                    <p className="text-xs text-stone-300">
                      {firstNightWarningMessage}
                    </p>
                    <button
                      onClick={() => setFirstNightWarningDismissed(true)}
                      className="mt-2 rounded-lg bg-amber-700/60 px-3 py-1 text-[10px] font-semibold text-amber-100 hover:bg-amber-600/60"
                    >
                      Got it
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Big News banner */}
          {world.bigNews.filter(n => !n.dismissed).length > 0 && (
            <BigNewsBanner
              news={world.bigNews.filter(n => !n.dismissed)}
              onDismiss={() => loopRef.current?.mutateWorld((prev) => {
                prev.bigNews = prev.bigNews.map(n => ({ ...n, dismissed: true }));
              })}
            />
          )}

          {/* Minimap */}
          <MiniMap world={world} camera={view.camera} />

          {/* Save toast */}
          {saveToast && (
            <div className={`absolute bottom-20 left-1/2 z-30 -translate-x-1/2 rounded-lg border px-4 py-2 text-sm font-semibold shadow-2xl backdrop-blur ${
              saveToast.type === 'success'
                ? 'border-emerald-500/40 bg-emerald-950/90 text-emerald-200'
                : 'border-rose-500/40 bg-rose-950/90 text-rose-200'
            }`}>
              {saveToast.type === 'success' ? '💾 ' : '⚠️ '}{saveToast.message}
            </div>
          )}

          {/* Pause HUD — map stays clickable for inspect/build while frozen */}
          {world.paused && !showTutorial && (
            <>
              <div className="pointer-events-none absolute left-1/2 top-3 z-20 -translate-x-1/2 rounded-full border border-amber-500/40 bg-stone-900/85 px-4 py-1.5 text-xs font-bold tracking-wide text-amber-200 shadow-lg backdrop-blur">
                ⏸ PAUSED — click the map to inspect · Space to resume
              </div>
              <div className="absolute bottom-4 right-4 z-25 w-52 rounded-xl border border-stone-600 bg-stone-900/95 p-3 shadow-2xl backdrop-blur-sm">
                <h2 className="mb-0.5 text-sm font-bold text-white">Game Paused</h2>
                <p className="mb-2 text-[10px] text-stone-400">{world.villageName} · Year {world.year}</p>
                <div className="space-y-1.5">
                  <button onClick={togglePause} className="w-full rounded-lg bg-emerald-600 py-2 text-xs font-bold text-white hover:bg-emerald-500">
                    ▶ Resume
                  </button>
                  <button onClick={handleSave} className="w-full rounded-lg bg-stone-700 py-1.5 text-xs font-semibold text-stone-200 hover:bg-stone-600">
                    💾 Save Game
                  </button>
                  <button
                    onClick={toggleAutoSave}
                    className="w-full rounded-lg bg-stone-800 py-1.5 text-[11px] text-stone-300 hover:bg-stone-700"
                  >
                    {world.autoSave ? '✅ Auto-save ON' : '⬜ Auto-save OFF'}
                  </button>
                  <button
                    onClick={() => {
                      loopRef.current?.mutateWorld((w) => { w.paused = true; });
                      setShowIntro(true);
                    }}
                    className="w-full rounded-lg border border-stone-600 py-1.5 text-[11px] text-stone-400 hover:border-stone-500 hover:text-stone-200"
                  >
                    🏠 Main Menu
                  </button>
                </div>
                {world.victoryAchieved && (
                  <p className="mt-2 text-center text-[10px] font-bold text-amber-400">
                    🏆 Victory: {world.victories.find(v => v.path === world.victoryAchieved)?.label}
                  </p>
                )}
              </div>
            </>
          )}

          {/* Quick-start tutorial */}
          {showTutorial && (
            <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/65 backdrop-blur-sm">
              <div className="mx-4 w-full max-w-md rounded-2xl border border-stone-600 bg-stone-800 p-6 shadow-2xl" onClick={e => e.stopPropagation()}>
                <div className="mb-4 flex items-center gap-3">
                  <img src="/logo.png" alt="Wilderfolk" className="h-14 w-14 rounded-xl" />
                  <div>
                    <h2 className="text-xl font-bold text-white">Quick Start</h2>
                    <p className="text-xs text-stone-400">Step {tutorialStep + 1} of {QUICK_START_STEPS.length}</p>
                  </div>
                </div>

                <div className="mb-4 rounded-xl bg-stone-900/60 p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-2xl">{QUICK_START_STEPS[tutorialStep].icon}</span>
                    <h3 className="text-base font-bold text-emerald-300">{QUICK_START_STEPS[tutorialStep].title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-stone-300">{QUICK_START_STEPS[tutorialStep].detail}</p>
                </div>

                <div className="mb-4 flex justify-center gap-1.5">
                  {QUICK_START_STEPS.map((_, i) => (
                    <div
                      key={i}
                      className={`h-1.5 rounded-full transition-all ${i === tutorialStep ? 'w-6 bg-emerald-500' : 'w-1.5 bg-stone-600'}`}
                    />
                  ))}
                </div>

                <div className="flex gap-2">
                  {tutorialStep > 0 && (
                    <button
                      onClick={() => setTutorialStep((s) => s - 1)}
                      className="flex-1 rounded-lg border border-stone-600 py-2.5 text-sm font-semibold text-stone-300 hover:border-stone-500"
                    >
                      Back
                    </button>
                  )}
                  {tutorialStep < QUICK_START_STEPS.length - 1 ? (
                    <button
                      onClick={() => setTutorialStep((s) => s + 1)}
                      className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
                    >
                      Next →
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        void beginAudio();
                        setShowTutorial(false);
                        setTutorialStep(0);
                        const loop = loopRef.current;
                        if (loop) {
                          const w = loop.getWorld();
                          const settlers = w.entities.filter((ent) => ent.alive && isPlayerHuman(ent));
                          if (settlers.length > 0) {
                            const cx = settlers.reduce((sum, ent) => sum + ent.x, 0) / settlers.length;
                            const cy = settlers.reduce((sum, ent) => sum + ent.y, 0) / settlers.length;
                            const nextView = focusCameraOn(loop.getView(), cx, cy, 1.5);
                            clampCameraTarget(nextView.camera, w.width, w.height);
                            loop.patchView(nextView);
                          }
                          loop.mutateWorld((world) => { world.paused = false; });
                        }
                      }}
                      className="flex-1 rounded-lg bg-emerald-600 py-2.5 text-sm font-bold text-white hover:bg-emerald-500"
                    >
                      Start Playing 🎵
                    </button>
                  )}
                </div>
                <button
                  onClick={() => {
                    void beginAudio();
                    setShowTutorial(false);
                    const loop = loopRef.current;
                    if (loop) {
                      const w = loop.getWorld();
                      const settlers = w.entities.filter((ent) => ent.alive && isPlayerHuman(ent));
                      if (settlers.length > 0) {
                        const cx = settlers.reduce((sum, ent) => sum + ent.x, 0) / settlers.length;
                        const cy = settlers.reduce((sum, ent) => sum + ent.y, 0) / settlers.length;
                        const nextView = focusCameraOn(loop.getView(), cx, cy, 1.5);
                        clampCameraTarget(nextView.camera, w.width, w.height);
                        loop.patchView(nextView);
                      }
                      loop.mutateWorld((world) => { world.paused = false; });
                    }
                  }}
                  className="mt-2 w-full text-center text-[10px] text-stone-500 hover:text-stone-300"
                >
                  Skip tutorial
                </button>
              </div>
            </div>
          )}
        </main>

        {/* Right sidebar */}
        <aside className="flex w-72 flex-col border-l border-stone-700 bg-stone-800/80 backdrop-blur">
          {/* Sticky selection inspector — always visible */}
          <div className="shrink-0 border-b border-stone-700 bg-stone-900/50 p-3">
            <div className="mb-2 flex items-center justify-between">
              <h2 className="text-[10px] font-bold uppercase tracking-wider text-stone-400">Inspector</h2>
              {(selectedEntity || selectedBuilding) && (
                <button
                  onClick={clearSelection}
                  className="rounded px-1.5 py-0.5 text-[10px] text-stone-500 hover:bg-stone-700 hover:text-stone-200"
                  title="Clear selection (ESC)"
                >
                  ✕ Clear
                </button>
              )}
            </div>
            {selectedEntity ? (
              <SelectedEntityPanel
                entity={selectedEntity}
                allEntities={world.entities}
                state={world}
                onTame={(humanId: number) => {
                  playClickSound();
                  const entityId = selectedEntity.id;
                  applyGameAction((prev) => {
                    const before = prev.entities.find(e => e.id === entityId)?.tamedBy;
                    const next = tameEntity(prev, entityId, humanId);
                    const after = next.entities.find(e => e.id === entityId)?.tamedBy;
                    if (!before && !after) playFailSfx();
                    return next;
                  });
                }}
              />
            ) : selectedBuilding ? (
              <SelectedBuildingPanel
                building={selectedBuilding}
                state={world}
                onAssign={() => applyGameAction((prev) => assignIdleWorkerToBuilding(prev, selectedBuilding.id))}
                onAssignWorker={(humanId: number) => {
                  playClickSound();
                  applyGameAction((prev) => assignIdleWorkerToBuilding(prev, selectedBuilding.id, humanId));
                }}
                assignableWorkers={listAssignableWorkersForBuilding(world, selectedBuilding.id)}
                onRemove={(humanId: number) => applyGameAction((prev) => removeWorkerFromBuilding(prev, selectedBuilding.id, humanId))}
                onRepair={() => applyGameAction((prev) => repairBuilding(prev, selectedBuilding.id))}
                onUpgrade={() => applyGameAction((prev) => upgradeBuilding(prev, selectedBuilding.id))}
                onDemolish={() => applyGameAction((prev) => demolishBuilding(prev, selectedBuilding.id))}
                onSetWorkshopRecipe={(recipeId: string) => {
                  playClickSound();
                  applyGameAction((prev) => setWorkshopRecipe(prev, selectedBuilding.id, recipeId));
                }}
                idleWorkers={
                  !selectedBuilding.completed
                    ? world.entities.filter((e) => {
                        if (e.type !== EntityType.Human || !e.alive || e.isJuvenile || e.faction) return false;
                        return !world.buildings.some(
                          (b) => !b.completed && b.occupants.includes(e.id),
                        );
                      }).length
                    : world.entities.filter(
                        (e) => e.type === EntityType.Human && e.alive && !e.isJuvenile && e.homeBuildingId == null && !e.faction,
                      ).length
                }
                canAssignWorker={canAssignWorkerToBuilding(world, selectedBuilding.id)}
              />
            ) : (
              <div className="rounded-lg border border-dashed border-stone-600 bg-stone-800/60 p-3 text-center">
                <p className="text-[10px] leading-relaxed text-stone-400">
                  Click a <strong className="text-stone-200">person</strong>, <strong className="text-stone-200">animal</strong>, or <strong className="text-stone-200">building</strong> on the map to inspect it here.
                </p>
                <p className="mt-1.5 text-[9px] text-stone-500">Or choose a building on the left to start construction.</p>
              </div>
            )}
          </div>

          {/* Tabs */}
          <div className="sidebar-tabs shrink-0 flex border-b border-stone-700">
            {SIDEBAR_TABS.map(tab => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex min-w-0 flex-1 flex-col items-center gap-0.5 px-0.5 py-2 transition-all ${
                  activeTab === tab.id
                    ? 'border-b-2 border-emerald-500 bg-stone-800/80 text-emerald-400'
                    : 'text-stone-500 hover:bg-stone-800/40 hover:text-stone-300'
                }`}
                title={tab.hint}
              >
                <span className="text-sm leading-none">{tab.icon}</span>
                <span className="text-[8px] font-bold leading-tight">{tab.label}</span>
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {/* Village Tab */}
            {activeTab === 'village' && (
              <div className="space-y-3">
                <FocusPanel
                  state={world}
                  onOpenGoals={() => setActiveTab('goals')}
                />
                <div className="rounded-xl bg-stone-700/50 p-3">
                  <div className="mb-3 flex items-end justify-between gap-2">
                    <div>
                      <h3 className="text-xs font-bold text-stone-300">Population</h3>
                      <p className="text-[9px] text-stone-500">Your village settlers</p>
                    </div>
                    <div className="text-right">
                      <p className="text-2xl font-black leading-none text-emerald-300">
                        {villageStats.total}
                        <span className="text-sm font-bold text-stone-500"> / {world.maxHumanPopulation}</span>
                      </p>
                      <p className="text-[9px] text-stone-500">capacity</p>
                    </div>
                  </div>
                  <div className="mb-2 h-2 overflow-hidden rounded-full bg-stone-600">
                    <div className="h-full rounded-full bg-emerald-500 transition-all" 
                      style={{ width: `${Math.min(100, (villageStats.total / Math.max(1, world.maxHumanPopulation)) * 100)}%` }} />
                  </div>
                  <div className="mb-2 grid grid-cols-4 gap-1 text-[9px]">
                    <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
                      <div className="font-bold text-sky-300">{villageStats.working}</div>
                      <div className="text-stone-500">working</div>
                    </div>
                    <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
                      <div className="font-bold text-amber-300">{villageStats.idle}</div>
                      <div className="text-stone-500">idle</div>
                    </div>
                    <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
                      <div className="font-bold text-slate-300">{villageStats.imprisoned}</div>
                      <div className="text-stone-500">jailed</div>
                    </div>
                    <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
                      <div className="font-bold text-pink-300">{villageStats.children}</div>
                      <div className="text-stone-500">children</div>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-1.5 text-[10px]">
                    <StatBadge label="Adults" value={villageStats.adults} icon="👤" />
                    <StatBadge label="Reputation" value={world.villageReputation} icon="⭐" />
                    <StatBadge label="Buildings" value={world.buildings.filter(b => b.completed).length} icon="🏗️" />
                    <StatBadge label="Techs" value={world.unlockedTechs.length} icon="🔬" />
                  </div>
                  <button
                    onClick={() => applyGameAction(recruitSettler)}
                    disabled={villageStats.total >= world.maxHumanPopulation || world.resources.food < 30 || world.resources.gold < 20}
                    title={
                      villageStats.total >= world.maxHumanPopulation
                        ? 'Build more houses to increase population cap'
                        : world.resources.food < 30 || world.resources.gold < 20
                          ? 'Need 30 food and 20 gold'
                          : 'Recruit a new settler'
                    }
                    className="mt-2 w-full rounded-lg bg-emerald-600 py-1.5 text-[10px] font-bold text-white hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-stone-600 transition-all"
                  >
                    📯 Recruit Settler (30🍖 20💰)
                  </button>
                </div>

                <div className="rounded-xl border border-orange-800/30 bg-orange-950/20 p-3">
                  <h3 className="mb-1 text-xs font-bold text-orange-300">Village armament</h3>
                  <p className="mb-2 text-[9px] leading-relaxed text-stone-500">
                    Weapons are not crafted one-by-one — research Defense tech, then iron gear needs a Blacksmith.
                    {getHumanArmamentLabel(world) && (
                      <span className="text-orange-200"> Active now: <strong>{getHumanArmamentLabel(world)}</strong> (all settlers).</span>
                    )}
                  </p>
                  <div className="space-y-1">
                    {getArmamentSteps(world).map((step) => (
                      <div key={step.id} className={`rounded px-2 py-1 text-[9px] ${step.done ? 'bg-emerald-900/30 text-emerald-300' : 'bg-stone-800/50 text-stone-400'}`}>
                        <span>{step.done ? '✓' : '○'} {step.label}</span>
                        {!step.done && <p className="mt-0.5 text-[8px] text-stone-500">{step.detail}</p>}
                      </div>
                    ))}
                  </div>
                </div>

                {(world.visitorGroups.length > 0 || world.rivalSettlements.length > 0) && (
                  <div className="rounded-xl border border-cyan-800/30 bg-cyan-950/20 p-3">
                    <h3 className="mb-2 text-xs font-bold text-cyan-300">Frontier neighbors</h3>
                    <div className="space-y-2 text-[10px]">
                      {world.visitorGroups.map((g) => (
                        <div key={g.id} className="rounded-lg bg-stone-800/60 p-2">
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-cyan-200">🧳 {g.name}</span>
                            <span className="text-cyan-400">{g.daysLeft}d left</span>
                          </div>
                          <p className="mt-0.5 capitalize text-stone-500">{g.kind} · {g.entityIds.length} travelers · passive gifts while camped</p>
                        </div>
                      ))}
                      {world.rivalSettlements.map((r) => {
                        const canGift = world.resources.food >= 25 && r.relationship !== 'friendly';
                        const canPact = world.resources.gold >= 40 && r.relationship !== 'tense' && r.relationship !== 'friendly';
                        const canShowForce = (hasIronSpears(world) || hasStoneSpears(world))
                          && world.humanPopulation >= 6
                          && r.relationship !== 'friendly';
                        return (
                          <div key={r.id} className="rounded-lg bg-stone-800/60 p-2">
                            <div className="flex items-center justify-between">
                              <span className="font-bold text-amber-200">🏕️ {r.name}</span>
                              <span className="capitalize text-amber-400">{r.relationship}</span>
                            </div>
                            <p className="mt-0.5 text-stone-500">{r.population} settlers · camp on map · click their people to inspect</p>
                            <div className="mt-1.5 grid grid-cols-1 gap-1">
                              <button
                                type="button"
                                disabled={!canGift}
                                onClick={() => applyGameAction((prev) => sendRivalGift(prev, r.id))}
                                className="rounded bg-stone-700 px-2 py-1 text-[8px] font-bold text-stone-200 hover:bg-stone-600 disabled:opacity-40"
                              >
                                🎁 Send food gift (25🍖) — improve relations
                              </button>
                              <button
                                type="button"
                                disabled={!canPact}
                                onClick={() => applyGameAction((prev) => establishRivalTradePact(prev, r.id))}
                                className="rounded bg-cyan-900 px-2 py-1 text-[8px] font-bold text-cyan-100 hover:bg-cyan-800 disabled:opacity-40"
                              >
                                🤝 Trade pact (40💰) — friendly + gold gifts
                              </button>
                              <button
                                type="button"
                                disabled={!canShowForce}
                                onClick={() => applyGameAction((prev) => showStrengthToRival(prev, r.id))}
                                className="rounded bg-rose-900 px-2 py-1 text-[8px] font-bold text-rose-100 hover:bg-rose-800 disabled:opacity-40"
                                title={!hasCompletedBlacksmith(world) && !hasStoneSpears(world) ? 'Research Stone or Iron Spears first' : ''}
                              >
                                ⚔️ Show militia — ease tension (needs spears, 6+ pop)
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Challenges */}
                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-stone-300">Challenges</h3>
                  <div className="space-y-1.5">
                    {world.challenges.map(c => (
                      <div key={c.id} className={`flex items-start gap-2 rounded-lg p-1.5 text-[10px] ${
                        c.completed ? 'bg-emerald-500/10 text-emerald-400' : 'bg-stone-600/30 text-stone-400'
                      }`}>
                        <span className="mt-0.5">{c.completed ? '✅' : '⬜'}</span>
                        <div className="flex-1">
                          <div className="font-bold">{c.title}</div>
                          <div className="opacity-70">{c.description}</div>
                          {c.rewardText && (
                            <div className={`mt-0.5 text-[9px] font-semibold ${c.completed ? 'text-emerald-300' : 'text-amber-400'}`}>
                              🎁 {c.rewardText}
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Tip */}
                <div className="rounded-xl bg-emerald-900/30 p-3">
                  <div className="flex items-start gap-2">
                    <span className="text-sm">💡</span>
                    <p className="text-[10px] leading-relaxed text-emerald-300">{ECOLOGICAL_FACTS[tipIndex]}</p>
                  </div>
                  <button onClick={() => setTipIndex((tipIndex + 1) % ECOLOGICAL_FACTS.length)} className="mt-1 text-[9px] font-semibold text-emerald-500 hover:text-emerald-400">
                    Next tip →
                  </button>
                </div>
              </div>
            )}

            {/* Nature Tab */}
            {activeTab === 'nature' && (
              <div className="space-y-3">
                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-3 text-xs font-bold text-stone-300">Ecosystem Health</h3>
                  
                  <div className="mb-3 space-y-2">
                    <div>
                      <div className="mb-1 flex justify-between text-[10px]">
                        <span className="text-stone-400">Health</span>
                        <strong className={world.ecosystemHealth > 60 ? 'text-emerald-400' : world.ecosystemHealth > 30 ? 'text-amber-400' : 'text-rose-400'}>
                          {Math.round(world.ecosystemHealth)}%
                        </strong>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-stone-600">
                        <div className={`h-full rounded-full transition-all ${
                          world.ecosystemHealth > 60 ? 'bg-emerald-500' : world.ecosystemHealth > 30 ? 'bg-amber-500' : 'bg-rose-500'
                        }`} style={{ width: `${Math.max(0, world.ecosystemHealth)}%` }} />
                      </div>
                    </div>
                    
                    <div>
                      <div className="mb-1 flex justify-between text-[10px]">
                        <span className="text-stone-400">Pollution</span>
                        <strong className="text-rose-400">{Math.round(world.pollutionLevel)}%</strong>
                      </div>
                      <div className="h-2.5 overflow-hidden rounded-full bg-stone-600">
                        <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${Math.max(0, world.pollutionLevel)}%` }} />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-[10px]">
                    <div className="rounded bg-stone-600/30 p-2">
                      <div className="text-stone-500">Biodiversity</div>
                      <strong className="text-lg text-white">{world.biodiversityIndex.toFixed(2)}</strong>
                    </div>
                    <div className="rounded bg-stone-600/30 p-2">
                      <div className="text-stone-500">Weather</div>
                      <strong className="text-lg text-white">{world.weather}</strong>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-stone-300">Season Effects</h3>
                  <div className="space-y-1 text-[10px] text-stone-400">
                    <p>{SEASON_ICONS[world.season]} <strong className="text-stone-200 capitalize">{world.season}</strong> — Grass growth: {world.season === Season.Spring ? 'Fast' : world.season === Season.Winter ? 'Minimal' : 'Normal'}</p>
                    <p>🌡️ Reproduction: {world.season === Season.Spring ? 'High' : world.season === Season.Winter ? 'Low' : 'Normal'}</p>
                    {world.weather !== WeatherType.Clear && (
                      <p>{WEATHER_ICONS[world.weather]} <strong className="text-stone-200">{world.weather}</strong> — Affects farming and movement</p>
                    )}
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-stone-300">Wildlife Populations</h3>
                  <p className="mb-2 text-[9px] text-stone-500">Healthy numbers keep the food chain balanced.</p>
                  <div className="space-y-1 text-[10px]">
                    <WildlifeBar label="Rabbits" count={world.entities.filter(e => e.type === EntityType.Rabbit && e.alive).length} max={120} color="bg-amber-600" icon="🐰" />
                    <WildlifeBar label="Deer" count={world.entities.filter(e => e.type === EntityType.Deer && e.alive).length} max={60} color="bg-orange-700" icon="🦌" />
                    <WildlifeBar label="Wolves" count={world.entities.filter(e => e.type === EntityType.Wolf && e.alive).length} max={25} color="bg-stone-500" icon="🐺" />
                    <WildlifeBar label="Foxes" count={world.entities.filter(e => e.type === EntityType.Fox && e.alive).length} max={35} color="bg-orange-600" icon="🦊" />
                    <WildlifeBar label="Moon Howlers" count={world.entities.filter(e => e.type === EntityType.Werewolf && e.alive && e.moonHowlerCursed).length} max={10} color="bg-violet-700" icon="🌝" />
                    <WildlifeBar label="Wildkin" count={world.entities.filter(e => e.type === EntityType.Wildkin && e.alive).length} max={15} color="bg-lime-700" icon="🦌" />
                    <WildlifeBar label="Trees" count={world.entities.filter(e => e.type === EntityType.Tree && e.alive).length} max={200} color="bg-green-700" icon="🌲" />
                    <WildlifeBar label="Grass" count={world.entities.filter(e => e.type === EntityType.Grass && e.alive).length} max={500} color="bg-green-500" icon="🌿" />
                  </div>
                </div>

                {world.disasters.length > 0 && (
                  <div className="rounded-xl border border-rose-500/30 bg-rose-900/30 p-3">
                    <h3 className="mb-2 text-xs font-bold text-rose-400">Active Disasters</h3>
                    {world.disasters.map((d, i) => (
                      <div key={i} className="mb-1 text-[10px] text-rose-300">
                        ⚠️ {d.type.charAt(0).toUpperCase() + d.type.slice(1)} — {Math.round((1 - d.progress / d.duration) * 100)}% remaining
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Research Tab */}
            {activeTab === 'research' && (
              <div className="space-y-3">
                {world.activeResearch && (
                  <div className="rounded-xl border border-amber-600/30 bg-amber-900/30 p-3">
                    <h3 className="mb-1 text-xs font-bold text-amber-400">Researching</h3>
                    {(() => {
                      const node = world.researchNodes.find(n => n.id === world.activeResearch);
                      return node ? (
                        <div>
                          <div className="text-sm font-bold text-white">{node.name}</div>
                          <div className="mt-1 h-2 overflow-hidden rounded-full bg-stone-600">
                            <div className="h-full rounded-full bg-amber-500 transition-all" style={{ width: `${world.researchProgress}%` }} />
                          </div>
                          <div className="mt-1 text-[10px] text-amber-300">{Math.round(world.researchProgress)}% complete</div>
                        </div>
                      ) : null;
                    })()}
                  </div>
                )}

                {Object.values(ResearchType).map(rType => {
                  const nodes = world.researchNodes.filter(n => n.type === rType);
                  if (nodes.length === 0) return null;
                  const color = RESEARCH_COLORS[rType as ResearchType];
                  
                  return (
                    <div key={rType} className="rounded-xl bg-stone-700/50 p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <div className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
                        <h3 className="text-xs font-bold capitalize" style={{ color }}>{rType}</h3>
                      </div>
                      <div className="space-y-1.5">
                        {nodes.map(node => {
                          const canResearch = node.unlocked && !node.researched && !world.activeResearch &&
                            world.resources.wood >= node.cost.wood &&
                            world.resources.stone >= node.cost.stone &&
                            world.resources.gold >= node.cost.gold;
                          
                          return (
                            <div key={node.id} className={`rounded-lg border p-2 text-[10px] ${
                              node.researched ? 'border-emerald-500/30 bg-emerald-500/10' :
                              node.unlocked ? 'border-stone-600 bg-stone-600/20' :
                              'border-stone-700 bg-stone-800 opacity-50'
                            }`}>
                              <div className="flex items-center justify-between">
                                <span className="font-bold text-stone-200">{node.name}</span>
                                <span className="text-[8px] text-stone-500">T{node.tier}</span>
                              </div>
                              <p className="mt-0.5 text-stone-400">{node.description}</p>
                              {!node.researched && (
                                <>
                                  <div className="mt-1 text-stone-500">
                                    Cost: {node.cost.wood > 0 && `${node.cost.wood}w `}
                                    {node.cost.stone > 0 && `${node.cost.stone}s `}
                                    {node.cost.gold > 0 && `${node.cost.gold}g`}
                                  </div>
                                  {node.unlocked && (
                                    <button onClick={() => applyGameAction((prev) => startResearch(prev, node.id))}
                                      disabled={!canResearch}
                                      className={`mt-1 w-full rounded py-1 text-[9px] font-bold transition-all ${
                                        canResearch ? 'bg-amber-600 text-white hover:bg-amber-500' : 'bg-stone-600 text-stone-400 cursor-not-allowed'
                                      }`}>
                                      {world.activeResearch === node.id ? 'Researching...' : 'Research'}
                                    </button>
                                  )}
                                </>
                              )}
                              {node.researched && <span className="text-emerald-400">✓ Researched</span>}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Trade Tab */}
            {activeTab === 'trade' && (
              <div className="space-y-3">
                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-stone-300">Trade Routes</h3>
                  <p className="mb-2 text-[10px] text-stone-400">Reputation: <strong className="text-emerald-400">{world.villageReputation}</strong> / 100</p>
                  
                  <div className="space-y-2">
                    {world.tradeRoutes.map(route => (
                      <div key={route.id} className={`rounded-lg border p-2 text-[10px] ${
                        route.active ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-stone-600 bg-stone-600/20'
                      }`}>
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-stone-200">{route.targetName}</span>
                          <span className={route.active ? 'text-emerald-400' : 'text-stone-500'}>
                            {route.active ? 'Active' : `Need ${route.reputationRequired} rep`}
                          </span>
                        </div>
                        <p className="text-stone-400">Receive: +{route.resourcesReceived.gold > 0 ? `${route.resourcesReceived.gold}g` : `${route.resourcesReceived.stone}s`} / cycle</p>
                        {!route.active && (
                          <button onClick={() => applyGameAction((prev) => establishTradeRoute(prev, route.id))}
                            disabled={world.villageReputation < route.reputationRequired}
                            className={`mt-1 w-full rounded py-1 text-[9px] font-bold transition-all ${
                              world.villageReputation >= route.reputationRequired ? 'bg-emerald-600 text-white hover:bg-emerald-500' : 'bg-stone-600 text-stone-400 cursor-not-allowed'
                            }`}>
                            Establish Route
                          </button>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Goals Tab — stats + victory */}
            {activeTab === 'goals' && (
              <div className="space-y-3">
                {world.victoryAchieved && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-500/10 p-3 text-center">
                    <span className="text-2xl">🏆</span>
                    <h3 className="text-sm font-bold text-amber-300">Victory Achieved!</h3>
                    <p className="text-[10px] text-amber-200/80">
                      {world.victories.find(v => v.path === world.victoryAchieved)?.label}
                    </p>
                  </div>
                )}
                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-stone-300">Victory Paths</h3>
                  <p className="mb-3 text-[10px] text-stone-400 leading-relaxed">
                    Pursue one of two active legacies. Progress updates as your settlement grows.
                  </p>
                  <div className="space-y-2">
                    {world.victories.filter((v) => ACTIVE_VICTORY_PATHS.includes(v.path as typeof ACTIVE_VICTORY_PATHS[number])).map(v => (
                      <div key={v.path} className={`rounded-lg border p-2 ${
                        v.achieved ? 'border-amber-500/40 bg-amber-500/10' : 'border-stone-600 bg-stone-600/20'
                      }`}>
                        <div className="mb-1 flex items-center justify-between">
                          <span className="text-[10px] font-bold text-stone-200">{v.label}</span>
                          <span className={`text-[9px] font-bold ${v.achieved ? 'text-amber-400' : 'text-stone-500'}`}>
                            {v.achieved ? '✓ Won' : `${v.progress}%`}
                          </span>
                        </div>
                        <p className="mb-1.5 text-[9px] text-stone-400">{v.description}</p>
                        <div className="h-1.5 overflow-hidden rounded-full bg-stone-700">
                          <div
                            className={`h-full rounded-full transition-all ${v.achieved ? 'bg-amber-500' : 'bg-emerald-500'}`}
                            style={{ width: `${v.progress}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                  <details className="mt-3 rounded-lg border border-stone-600/60 bg-stone-800/40">
                    <summary className="cursor-pointer px-2 py-1.5 text-[10px] font-semibold text-stone-400 hover:text-stone-300">
                      Coming in v1.1
                    </summary>
                    <div className="space-y-2 border-t border-stone-600/40 p-2">
                      {world.victories.filter((v) => COMING_SOON_VICTORY_PATHS.includes(v.path as typeof COMING_SOON_VICTORY_PATHS[number])).map(v => (
                        <div key={v.path} className="rounded-lg border border-stone-700 bg-stone-700/20 p-2 opacity-70">
                          <div className="mb-1 flex items-center justify-between">
                            <span className="text-[10px] font-bold text-stone-300">{v.label}</span>
                            <span className="text-[9px] font-bold text-stone-500">Soon</span>
                          </div>
                          <p className="text-[9px] text-stone-500">{v.description}</p>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
                <StatisticsPanel state={world} />
              </div>
            )}

            {/* Log Tab */}
            {activeTab === 'log' && (
              <div>
                <h3 className="mb-2 text-xs font-bold text-amber-300">Village Chronicle</h3>
                <p className="mb-2 text-[9px] leading-relaxed text-stone-500">
                  Full history of your settlement — births, marriages, scandals, research, disasters, and more.
                  Scroll to read older entries, filter by type, or <strong className="text-stone-400">Copy log</strong> to save it in a note. Saved with your game.
                </p>
                <EventLogPanel
                  events={world.eventLog}
                  meta={{
                    villageName: world.villageName,
                    year: world.year,
                    day: world.dayInYear,
                    tick: world.tick,
                    population: world.humanPopulation,
                  }}
                />
              </div>
            )}

            {/* Guide Tab */}
            {activeTab === 'guide' && (
              <div className="space-y-3 text-[10px] text-stone-300">
                <div className="rounded-xl border border-amber-700/40 bg-amber-950/20 p-3">
                  <h3 className="mb-1 text-xs font-bold text-amber-300">⚠️ {GAME_PHASE} · v{GAME_VERSION}</h3>
                  <p className="text-stone-400">Playtest build — expect bugs, rough edges, and features that change. Saves may break between updates. Feedback helps shape the real release.</p>
                </div>

                <div className="rounded-xl border border-violet-700/30 bg-violet-950/20 p-3">
                  <h3 className="mb-2 text-xs font-bold text-violet-300">Why play? (honest answer)</h3>
                  <div className="space-y-1.5 text-stone-400">
                    <p>This is a <strong className="text-stone-200">sandbox frontier sim</strong>, not a campaign with one quest giver. Purpose comes from layers you choose:</p>
                    <p>• <strong className="text-stone-200">Challenges</strong> (Village tab) — stepped goals with resource rewards.</p>
                    <p>• <strong className="text-stone-200">Victory paths</strong> (Goals tab) — Eco-Utopia or Great City win conditions.</p>
                    <p>• <strong className="text-stone-200">Living drama</strong> — marriages, scandals, babies, moon howlers (Log / .txt chronicle).</p>
                    <p>• <strong className="text-stone-200">The wider world</strong> — pilgrims, performers, rival camps appear as you grow.</p>
                    <p>• <strong className="text-stone-200">Trade &amp; reputation</strong> — become a known township, link routes, unlock gold.</p>
                    <p className="text-stone-500 italic">v0.4 is a playtest — more scripted story and rivals are planned. For now, pick one legacy and watch your chronicle unfold.</p>
                  </div>
                </div>

                <div className="rounded-xl border border-emerald-700/30 bg-emerald-950/20 p-3">
                  <h3 className="mb-2 text-xs font-bold text-emerald-300">Getting Started</h3>
                  <p className="mb-2 text-stone-400">New here? Replay the step-by-step tutorial or jump to a topic below.</p>
                  <button
                    onClick={() => { setTutorialStep(0); setShowTutorial(true); }}
                    className="w-full rounded-lg bg-emerald-700 px-3 py-2 text-[10px] font-bold text-white hover:bg-emerald-600"
                  >
                    ↺ Replay Quick Start Tutorial
                  </button>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-blue-300">Interface Overview</h3>
                  <div className="space-y-1 text-stone-400">
                    <p><strong className="text-stone-200">Left panel</strong> — Pick buildings to construct. Press <strong className="text-stone-200">B</strong> to collapse/expand it; keys 1–9 quick-build.</p>
                    <p><strong className="text-stone-200">Grid</strong> — Press <strong className="text-stone-200">G</strong> to toggle the placement grid (auto-on when building).</p>
                    <p><strong className="text-stone-200">Inspector</strong> — Always at the top right. Click map objects to manage them.</p>
                    <p><strong className="text-stone-200">Village tab</strong> — Population, recruiting, and daily challenges.</p>
                    <p><strong className="text-stone-200">Nature tab</strong> — Ecosystem health and wildlife counts.</p>
                    <p><strong className="text-stone-200">Goals tab</strong> — Victory paths and lifetime statistics.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-cyan-300">🧳 Visitors & Rival Settlements</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-cyan-200">Traveling groups</strong> camp near your village — traders, pilgrims, scholars, performers, and more. They bring gifts and leave after a while.</p>
                    <p>• <strong className="text-amber-200">Rival settlements</strong> can appear on the same map with their own camp, people, and buildings (indigo markers).</p>
                    <p>• Relationships vary: <em>friendly</em> neighbors trade, <em>competitive</em> ones hunt your deer, <em>tense</em> ones grumble about borders.</p>
                    <p>• Check the <strong className="text-stone-200">Village tab</strong> to see who's currently on the map.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-emerald-300">🌍 Why Animals & Humans?</h3>
                  <p className="mb-2 text-stone-400 leading-relaxed">
                    This world is a living ecosystem. Humans cannot survive alone — they are part of the food chain.
                  </p>
                  <div className="space-y-1.5 rounded bg-stone-800/60 p-2">
                    <p><strong className="text-emerald-300">🌿 Producers:</strong> Grass and trees create food from sunlight.</p>
                    <p><strong className="text-amber-300">🐰 Prey:</strong> Rabbits and deer eat grass. They are the bridge between plants and predators.</p>
                    <p><strong className="text-rose-300">🐺 Predators:</strong> Wolves and foxes hunt prey to keep populations balanced.</p>
                    <p><strong className="text-cyan-300">👨 Humans:</strong> Hunt animals for food AND build farms. But overbuilding pollutes and destroys habitat.</p>
                  </div>
                  <p className="mt-2 text-stone-500 italic">
                    If wolves die out, deer overpopulate, eat all grass, rabbits starve, and humans have nothing to hunt. Balance is everything.
                  </p>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-amber-300">👨‍👩‍👧 Family & Relationships</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• Every human has a <strong className="text-amber-200">name and surname</strong> passed down generations.</p>
                    <p>• Single adults will <strong className="text-pink-300">court</strong> nearby singles (💕 hearts appear).</p>
                    <p>• At 100% courtship, they <strong className="text-yellow-300">marry</strong> (💍 golden ring connects them).</p>
                    <p>• Married couples can have <strong className="text-pink-300">babies</strong> (🤰 pregnant indicator).</p>
                    <p>• Settlers may pursue <strong className="text-rose-300">secret affairs</strong> in the evenings — spouses can catch them; a <strong className="text-violet-300">Church</strong> makes gossip travel faster.</p>
                    <p>• <strong className="text-violet-300">Bastards</strong> are born when the father isn't the mother's spouse — they take the mother's surname and village gossip spreads.</p>
                    <p>• Legitimate children inherit their <strong className="text-amber-200">father's surname</strong>.</p>
                    <p>• Click any person to see their <strong className="text-amber-200">full family tree</strong>.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-rose-300">⚔️ Hunting & Combat</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-orange-300">Food chain:</strong> Grass → rabbits/deer → foxes/wolves → humans. Everyone hunts someone.</p>
                    <p>• <strong className="text-cyan-300">Settlers hunt</strong> deer and rabbits when hungry and off-duty. Watch for orange <strong className="text-orange-300">🏹 chase lines</strong> and floating <em>Hunted!</em> text.</p>
                    <p>• <strong className="text-stone-300">Wolves & foxes</strong> chase prey with grey dashed lines. Prey flees when predators get close.</p>
                    <p>• <strong className="text-violet-300">Moon Howlers</strong> hunt settlers on full-moon nights — settlers flee home.</p>
                    <p>• <strong className="text-amber-300">Weapons:</strong> Research Defense tech — no manual crafting. Stone/Wood gear is automatic. <strong className="text-stone-200">Iron Spears & Shields</strong> also need a <strong className="text-stone-200">completed Blacksmith</strong> (check Village → Armament checklist).</p>
                    <p>• Click a settler to see <strong className="text-stone-200">Village gear</strong> once research (and Blacksmith for iron) is done.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-cyan-300">🏕️ Other tribes</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-stone-200">Visitors</strong> camp nearby (traders, pilgrims, refugees…) — passive bonuses while they stay.</p>
                    <p>• <strong className="text-stone-200">Rival settlements</strong> appear from ~6 population / yearly events — another camp on the map with its own houses.</p>
                    <p>• <strong className="text-stone-200">Diplomacy</strong> (Village tab → Frontier neighbors): send gifts, trade pacts, or show militia to change relations.</p>
                    <p className="text-stone-500 italic">Full raids & wars are not in v0.4 yet — relations affect gold gifts, hunting competition, and reputation.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-violet-300">🌝 Moon Howlers</h3>
                  <p className="text-stone-400 leading-relaxed">
                    Sometimes a grown settler is <strong className="text-violet-200">cursed as a Moon Howler</strong>.
                    Cursed settlers stay <strong className="text-violet-200">normal humans most nights</strong>. Only on a
                    <strong className="text-violet-200"> full moon</strong> (about every 2 weeks) do they transform and
                    <strong className="text-rose-300"> hunt settlers</strong>. Build a
                    <strong className="text-indigo-200"> Church</strong> nearby to break the curse.
                  </p>
                </div>

                <div className="rounded-xl border border-dashed border-violet-700/40 bg-violet-950/20 p-3">
                  <h3 className="mb-2 text-xs font-bold text-violet-300">🧪 Testing</h3>
                  <p className="mb-2 text-[9px] text-stone-500">Spawn a Moon Howler instantly for playtesting.</p>
                  <button
                    onClick={() => applyGameAction((prev) => spawnMoonHowlerDebug(prev))}
                    className="w-full rounded-lg bg-violet-800 px-3 py-2 text-[10px] font-bold text-violet-100 transition-all hover:bg-violet-700"
                  >
                    🌝 Spawn Moon Howler
                  </button>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-blue-300">🎮 Controls</h3>
                  <div className="grid grid-cols-2 gap-1 text-stone-400">
                    <span><strong className="text-stone-200">WASD / Arrows</strong></span><span>Pan camera</span>
                    <span><strong className="text-stone-200">Mouse drag</strong></span><span>Pan camera</span>
                    <span><strong className="text-stone-200">Scroll</strong></span><span>Zoom in/out</span>
                    <span><strong className="text-stone-200">Click</strong></span><span>Select / Build</span>
                    <span><strong className="text-stone-200">Space</strong></span><span>Pause/Play</span>
                    <span><strong className="text-stone-200">B</strong></span><span>Build panel</span>
                    <span><strong className="text-stone-200">G</strong></span><span>Toggle grid</span>
                    <span><strong className="text-stone-200">H</strong></span><span>Find settlers (center camera)</span>
                    <span><strong className="text-stone-200">ESC</strong></span><span>Cancel build</span>
                    <span><strong className="text-stone-200">+ / -</strong></span><span>Zoom</span>
                    <span><strong className="text-stone-200">🔊 / 🔇</strong></span><span>Mute sound — or pick Soft / Normal / Loud</span>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-emerald-300">🏗️ Buildings Guide</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-amber-200">House</strong> — Family home (6 slots). Click house → <strong className="text-stone-200">Expand</strong> for up to 10.</p>
                    <p>• <strong className="text-amber-200">Farm</strong> — Produces food every season.</p>
                    <p>• <strong className="text-amber-200">Lumber Mill</strong> — Produces wood. Needs workers.</p>
                    <p>• <strong className="text-amber-200">Quarry/Mine</strong> — Produces stone.</p>
                    <p>• <strong className="text-amber-200">Roads</strong> — Infra tab (key 8). Horizontal strips — zigzag them (step north/south each segment) for paths up hills. Boost nearby buildings +15%.</p>
                    <p>• <strong className="text-amber-200">Town Hall</strong> — Community tab after researching <strong className="text-stone-200">Urban Planning</strong> (Architecture tier 2). Staff it for +3 reputation every 3 days.</p>
                    <p>• <strong className="text-amber-200">Church</strong> — Community tab, no research needed. Faster marriages, breaks Moon Howler curses, stricter morals.</p>
                    <p>• <strong className="text-amber-200">Hospital</strong> — Staffed: +2 reputation every 5 days. Any hospital lowers energy drain.</p>
                    <p>• <strong className="text-amber-200">Demolish</strong> — Click any building → sidebar → <strong className="text-stone-200">🗑 Demolish</strong> (works on houses too; residents are reassigned).</p>
                    <p>• <strong className="text-amber-200">Reputation ⭐</strong> — Village header &amp; Trade tab. From Town Hall, Hospital, pilgrims, festivals, and avoiding scandals. Unlocks trade routes.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-emerald-300">🦌 What Does Wildlife Do?</h3>
                  <div className="space-y-1.5 text-stone-400">
                    <p>Every animal has a role in the ecosystem. Without balance, your village will starve.</p>
                    <div className="space-y-1 rounded bg-stone-800/60 p-2">
                      <p><strong className="text-green-300">🌿 Grass</strong> — Grows naturally. Rabbits and deer eat it. If grass dies, everything starves.</p>
                      <p><strong className="text-amber-300">🐰 Rabbits</strong> — Eat grass, reproduce fast. Foxes and wolves hunt them. Humans can hunt rabbits for food.</p>
                      <p><strong className="text-orange-300">🦌 Deer</strong> — Eat grass, move in herds. Wolves and humans hunt deer. More deer = more food for predators.</p>
                      <p><strong className="text-orange-500">🦊 Foxes</strong> — Hunt rabbits to keep their population in check. Without foxes, rabbits overpopulate and eat all the grass.</p>
                      <p><strong className="text-stone-300">🐺 Wolves</strong> — Hunt deer and rabbits. Apex predators. Without wolves, deer overpopulate and destroy grasslands.</p>
                      <p><strong className="text-cyan-300">👨 Humans</strong> — Hunt animals for food, build farms for stable food. Build too much and pollution rises, harming wildlife.</p>
                    </div>
                    <p className="text-stone-500 italic">If wolves die out, deer explode, eat all grass, rabbits starve, and your people have nothing to hunt. Balance is everything.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-amber-300">📜 Village Chronicle (Log tab)</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>Right sidebar → <strong className="text-stone-200">📜 Log</strong> — scrollable history of everything that happened (newest on top).</p>
                    <p>Filter by type, hit <strong className="text-stone-200">Download .txt</strong> for a text file (opens in Notepad), or enable export when you 💾 Save.</p>
                    <p className="text-stone-500">File name: <strong className="text-stone-400">wilderfolk-YourVillage-chronicle.txt</strong> in your Downloads folder.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-violet-300">🦴 Taming Animals</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>1. Build a <strong className="text-stone-200">Taming Post</strong> (Community tab).</p>
                    <p>2. Click a wild <strong className="text-stone-200">wolf, fox, deer, or rabbit</strong> within ~140px of the post.</p>
                    <p>3. Pick an adult settler — costs food: rabbit 10, fox 25, deer 30, wolf 40.</p>
                    <p>4. Tamed animals <strong className="text-stone-200">follow their owner</strong>. Wolves and foxes sometimes hunt nearby prey for them.</p>
                    <p className="text-stone-500 italic">Moon Howlers cannot be tamed — cure them at a staffed Church on a full-moon night.</p>
                  </div>
                </div>

                <div className="rounded-xl bg-stone-700/50 p-3">
                  <h3 className="mb-2 text-xs font-bold text-rose-300">⚠️ Disasters & Seasons</h3>
                  <div className="space-y-1 text-stone-400">
                    <p>• <strong className="text-rose-300">Fire/Flood/Tornado</strong> — Damage buildings and kill wildlife.</p>
                    <p>• <strong className="text-rose-300">Plague</strong> — Can be prevented with Medicine research.</p>
                    <p>• <strong className="text-amber-200">Winter</strong> — Grass stops growing, animals struggle.</p>
                    <p>• <strong className="text-emerald-300">Spring</strong> — Best season for growth and babies!</p>
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

// ============ SUB-COMPONENTS ============

function BigNewsBanner({ news, onDismiss }: { news: { id: string; title: string; message: string; type: 'positive' | 'negative' | 'neutral' }[]; onDismiss: () => void }) {
  const item = news[news.length - 1];
  return (
    <div className="absolute left-1/2 top-16 z-20 w-full max-w-lg -translate-x-1/2 animate-in fade-in slide-in-from-top">
      <div className={`relative rounded-xl border p-4 shadow-2xl backdrop-blur ${
        item.type === 'positive' ? 'border-emerald-400/50 bg-emerald-950/90' :
        item.type === 'negative' ? 'border-rose-400/50 bg-rose-950/90' :
        'border-amber-400/50 bg-amber-950/90'
      }`}>
        <button
          onClick={onDismiss}
          className="absolute right-2 top-1.5 text-lg leading-none text-stone-400 hover:text-white"
          title="Dismiss"
        >
          ×
        </button>
        <div className="flex items-start gap-3 pr-6">
          <span className="text-3xl">{item.type === 'positive' ? '✨' : item.type === 'negative' ? '⚠️' : '📜'}</span>
          <div>
            <h3 className={`text-sm font-bold ${
              item.type === 'positive' ? 'text-emerald-300' :
              item.type === 'negative' ? 'text-rose-300' : 'text-amber-300'
            }`}>{item.title}</h3>
            <p className="text-xs text-stone-200">{item.message}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function PopulationBadge({
  total, max, working, idle, children, imprisoned,
}: {
  total: number;
  max: number;
  working: number;
  idle: number;
  children: number;
  imprisoned: number;
}) {
  const nearCap = total / Math.max(1, max) >= 0.9;
  const parts = [
    `${total} settler${total === 1 ? '' : 's'}`,
    `${working} working`,
    `${idle} idle`,
  ];
  if (imprisoned > 0) parts.push(`${imprisoned} imprisoned`);
  if (children > 0) parts.push(`${children} child${children === 1 ? '' : 'ren'}`);
  parts.push(`max ${max}`);
  return (
    <span
      className={`flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium ${
        nearCap ? 'bg-rose-900/40 text-rose-300 ring-1 ring-rose-500/50' : 'bg-sky-900/40 text-sky-300'
      }`}
      title={parts.join(' · ')}
    >
      <span>👥</span>
      <span className="font-mono font-bold">
        {total}
        <span className="ml-0.5 text-[9px] opacity-70">/{max}</span>
      </span>
    </span>
  );
}

function ResourceBadge({ icon, value, max, color }: { icon: string; value: number; max?: number; color: string }) {
  const nearCap = max !== undefined && value / max > 0.85;
  return (
    <span className={`flex items-center gap-1 rounded-md px-2 py-1 ${color} ${nearCap ? 'ring-1 ring-rose-500/60' : ''}`} title={max !== undefined ? `${formatNumber(value)} / ${formatNumber(max)} storage` : undefined}>
      <span>{icon}</span>
      <span className="font-mono font-bold">{formatNumber(value)}{max !== undefined && <span className="ml-0.5 text-[9px] opacity-60">/{formatNumber(max)}</span>}</span>
    </span>
  );
}

function StatBadge({ label, value, icon }: { label: string; value: number; icon: string }) {
  return (
    <div className="flex items-center gap-1.5 rounded bg-stone-600/30 px-2 py-1">
      <span>{icon}</span>
      <span className="text-stone-400">{label}:</span>
      <strong className="text-white">{value}</strong>
    </div>
  );
}

function WildlifeBar({ label, count, max, color, icon }: { label: string; count: number; max: number; color: string; icon: string }) {
  const pct = Math.min(100, (count / max) * 100);
  return (
    <div>
      <div className="mb-0.5 flex justify-between">
        <span>{icon} {label}</span>
        <strong>{count}</strong>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-stone-600">
        <div className={`h-full rounded-full ${color} transition-all`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function getFamilyMembers(entity: Entity, allEntities: Entity[]): { label: string; name: string; relation: string }[] {
  const members: { label: string; name: string; relation: string }[] = [];
  const seen = new Set<number>();

  const add = (e: Entity, label: string, relation: string) => {
    if (!e.alive || e.type !== EntityType.Human || e.id === entity.id || seen.has(e.id)) return;
    seen.add(e.id);
    members.push({ label, name: e.name || 'Unknown', relation });
  };

  for (const e of allEntities) {
    if (!e.alive || e.type !== EntityType.Human) continue;
    if (e.id === entity.fatherId) add(e, '👨', 'Father');
    if (e.id === entity.motherId) add(e, '👩', 'Mother');
    if (e.partnerId === entity.id) add(e, e.gender === 'male' ? '👨' : '👩', 'Spouse');
    if (
      entity.childrenIds.includes(e.id)
      || e.motherId === entity.id
      || e.fatherId === entity.id
    ) {
      add(
        e,
        e.gender === 'male' ? '👦' : '👧',
        e.isBastard ? (e.isJuvenile ? 'Bastard child' : 'Bastard') : (e.isJuvenile ? 'Child' : 'Adult child'),
      );
    }
    if (entity.motherId && e.motherId === entity.motherId) {
      add(e, e.gender === 'male' ? '👦' : '👧', 'Sibling');
    }
    if (entity.fatherId && e.fatherId === entity.fatherId) {
      add(e, e.gender === 'male' ? '👦' : '👧', 'Sibling');
    }
  }
  return members;
}

function countLivingChildren(entity: Entity, allEntities: Entity[]): number {
  return allEntities.filter((e) =>
    e.alive
    && e.type === EntityType.Human
    && (entity.childrenIds.includes(e.id) || e.motherId === entity.id || e.fatherId === entity.id),
  ).length;
}

function SelectedEntityPanel({ entity, allEntities, state, onTame }: { entity: Entity; allEntities: Entity[]; state: WorldState; onTame?: (humanId: number) => void }) {
  const isHuman = entity.type === EntityType.Human;
  const isVisitor = entity.faction === 'visitor';
  const isRival = entity.faction === 'rival';
  const visitorGroup = isVisitor ? state.visitorGroups.find((g) => g.id === entity.groupId) : null;
  const rivalCamp = isRival ? state.rivalSettlements.find((r) => r.id === entity.groupId) : null;
  const family = isHuman && !isVisitor && !isRival ? getFamilyMembers(entity, allEntities) : [];
  const childCount = isHuman && !isVisitor && !isRival ? countLivingChildren(entity, allEntities) : 0;
  const foodChainInfo: Record<string, { role: string; eats: string; huntedBy: string }> = {
    grass: { role: 'Producer', eats: 'Sunlight (photosynthesis)', huntedBy: 'Rabbits, Deer, Foxes, Wildkin' },
    rabbit: { role: 'Prey', eats: 'Grass', huntedBy: 'Foxes, Wolves, Humans' },
    deer: { role: 'Prey', eats: 'Grass', huntedBy: 'Wolves, Humans, Moon Howlers' },
    fox: { role: 'Predator', eats: 'Rabbits, Grass', huntedBy: 'None' },
    wolf: { role: 'Apex Predator', eats: 'Deer, Rabbits', huntedBy: 'None' },
    werewolf: { role: 'Full-Moon Predator', eats: 'Settlers, Deer, Rabbits', huntedBy: 'Church (breaks the curse)' },
    wildkin: { role: 'Gentle Hybrid', eats: 'Grass, Farm Food', huntedBy: 'Wolves, Foxes' },
    human: { role: 'Civilization Builder', eats: 'Deer, Rabbits, Farm Food', huntedBy: 'Moon Howlers (~every 2 weeks)' },
    tree: { role: 'Environment', eats: 'CO2, Sunlight', huntedBy: 'None (provides habitat)' },
  };
  const ecology = foodChainInfo[entity.type] || { role: 'Unknown', eats: 'Unknown', huntedBy: 'Unknown' };

  const tameableTypes: EntityType[] = [EntityType.Wolf, EntityType.Fox, EntityType.Deer, EntityType.Rabbit];
  const isTameable = tameableTypes.includes(entity.type) && !entity.tamedBy;
  const isMoonHowler = entity.type === EntityType.Werewolf && !!entity.moonHowlerCursed;
  const tamer = entity.tamedBy ? allEntities.find(e => e.id === entity.tamedBy && e.alive) : null;
  const hasTamingPost = state.buildings.some(b => b.completed && b.type === BuildingType.TamingPost && Math.hypot(b.x - entity.x, b.y - entity.y) < 140);
  const canTameHere = hasTamingPost;
  const tameFoodCost = getTameFoodCost(entity.type);
  const availableHumans = allEntities.filter(e => e.type === EntityType.Human && e.alive && !e.isJuvenile);

  return (
    <div className="rounded-xl border border-amber-600/30 bg-amber-900/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <span className="text-lg">
          {entity.type === 'human' ? (entity.gender === 'male' ? '👨' : '👩') :
           entity.type === 'rabbit' ? '🐰' : entity.type === 'deer' ? '🦌' :
           entity.type === 'wolf' ? '🐺' : entity.type === 'fox' ? '🦊' :
           entity.type === 'werewolf' ? '🌝' : entity.type === 'wildkin' ? '🦌' :
           entity.type === 'tree' ? '🌲' : '🌿'}
        </span>
        <div>
          <h3 className="text-xs font-bold text-amber-200">
            {isHuman || entity.type === EntityType.Werewolf
              ? `${entity.name || 'Unnamed'} ${entity.surname || ''}${entity.type === EntityType.Werewolf ? ' (Moon Howler)' : ''}`
              : entity.type}
          </h3>
          {isMoonHowler && (
            <p className="text-[9px] text-rose-300">Full moon — hunting settlers tonight.</p>
          )}
          {isHuman && entity.moonHowlerCursed && (
            <p className="text-[9px] text-violet-300">Moon Howler curse — human until the next full moon (~2 weeks).</p>
          )}
          {isVisitor && visitorGroup && (
            <p className="text-[9px] text-cyan-300">Visiting — {visitorGroup.name} ({visitorGroup.daysLeft}d)</p>
          )}
          {isRival && rivalCamp && (
            <p className="text-[9px] text-amber-300">Settler of {rivalCamp.name} · {rivalCamp.relationship}</p>
          )}
          {isHuman && !isVisitor && !isRival && (
            <p className="text-[9px] text-amber-400">
              {entity.gender === 'male' ? '♂' : '♀'} {entity.relationshipStatus || 'child'}
              {entity.generation > 0 ? ` · Gen ${entity.generation}` : ''}
            </p>
          )}
        </div>
      </div>

      {/* Food Chain Role */}
      <div className="mb-2 rounded bg-stone-800/60 p-2 text-[9px]">
        <div className="grid grid-cols-[3rem_1fr] gap-y-0.5">
          <span className="text-stone-500">Role</span>
          <strong className="text-amber-300">{ecology.role}</strong>
          <span className="text-stone-500">Eats</span>
          <strong className="text-emerald-300">{ecology.eats}</strong>
          <span className="text-stone-500">Hunted</span>
          <strong className="text-rose-300">{ecology.huntedBy}</strong>
        </div>
      </div>

      <div className="space-y-0.5 text-[10px] text-amber-200">
        <p>Energy: {Math.round(entity.energy)} / {entity.maxEnergy}</p>
        <p>Age: {getAgeInYears(entity, state.year)} years{entity.isJuvenile && ' (child)'} — b. {getBirthDateString(entity)}</p>
        {entity.huntTargetId && (
          <p className="text-orange-300">🏹 Chasing prey — watch the dashed hunt line on the map</p>
        )}
        {entity.combatTicks && entity.combatTicks > 0 && (
          <p className="text-amber-300">⚔️ In combat</p>
        )}
        {isHuman && !isVisitor && !isRival && getHumanArmamentLabel(state) && (
          <p className="text-sky-300">⚔️ Village gear: {getHumanArmamentLabel(state)}</p>
        )}
        {entity.tamedBy && (
          <p className="text-emerald-400">🦴 Tamed by {tamer?.name || 'a settler'}</p>
        )}
        {isHuman && !isVisitor && !isRival && (
          <>
            {hasResidenceAssignment(entity) ? (() => {
              const home = state.buildings.find((b) => b.id === entity.residenceBuildingId);
              const label = home ? BUILDING_CONFIGS[home.type].label : 'Home';
              return <p className="text-sky-300">🏠 Lives in: {label}</p>;
            })() : (
              <p className="text-rose-300">🏠 No home yet — build a House (auto-assigned when ready)</p>
            )}
            {isImprisoned(entity) ? (() => {
              const prison = state.buildings.find((b) => b.id === entity.prisonBuildingId);
              const daysLeft = entity.prisonerUntilTick ? Math.max(0, Math.ceil((entity.prisonerUntilTick - state.tick) / 24)) : 0;
              return (
                <p className="text-slate-400">
                  ⛓️ Imprisoned{prison ? ` at ${BUILDING_CONFIGS[prison.type].label}` : ''} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                </p>
              );
            })() : hasWorkAssignment(entity) ? (() => {
              const jobSite = state.buildings.find((b) => b.id === entity.homeBuildingId);
              const label = jobSite ? BUILDING_CONFIGS[jobSite.type].label : 'Workplace';
              return <p className="text-emerald-300">🔨 Works at: {label}</p>;
            })() : !entity.isJuvenile && !entity.pregnant && (
              <p className="text-stone-400">🔨 No job yet — build a Farm, Mill, etc.</p>
            )}
            <p className="text-sky-300">👕 {getHumanVariantLabel(entity.gender, entity.spriteVariant ?? 0)}</p>
            {entity.occupation && entity.occupation !== 'settler' && <p>💼 {entity.occupation}</p>}
            {entity.job && (entity.skills?.[entity.job] ?? 0) > 0 && (
              <p className="text-emerald-400">⭐ {entity.job} skill: {Math.round(entity.skills?.[entity.job] ?? 0)}/100</p>
            )}
            {entity.pregnant && (
              <p className="font-bold text-pink-400">
                🤰 Pregnant! ({Math.round(((entity.pregnancyProgress || 0) / PREGNANCY_TICKS) * 100)}%)
              </p>
            )}
            {entity.partnerId && entity.relationshipStatus === 'married' && (() => {
              const spouse = allEntities.find((e) => e.id === entity.partnerId && e.alive);
              const spouseLabel = spouse
                ? `${spouse.name || 'Settler'}${spouse.surname ? ` ${spouse.surname}` : ''}`
                : 'partner';
              return <p className="text-amber-300">💍 Married to {spouseLabel}</p>;
            })()}
            {entity.affairPartnerId != null && (() => {
              const lover = allEntities.find((e) => e.id === entity.affairPartnerId && e.alive);
              return (
                <p className="text-rose-300/90">
                  💋 Secret affair{lover?.name ? ` with ${lover.name}` : ''}
                  {entity.affairProgress != null && entity.affairProgress < 100
                    ? ` (${Math.round(entity.affairProgress)}%)`
                    : ''}
                </p>
              );
            })()}
            {entity.isBastard && <p className="text-violet-300">⚜ Born outside wedlock</p>}
            {childCount > 0 && (
              <p className="text-pink-200">
                👶 {childCount} child{childCount === 1 ? '' : 'ren'}
              </p>
            )}
            {entity.courtshipProgress && entity.courtshipProgress > 0 && entity.relationshipStatus === 'single' && (
              <p className="text-pink-300">💕 Courting... {entity.courtshipProgress}%</p>
            )}
          </>
        )}
      </div>

      {isMoonHowler && (
        <p className="mt-2 text-[9px] text-rose-300">Build a Church nearby to break the curse — only on full-moon nights are they this dangerous.</p>
      )}

      {/* Taming */}
      {isTameable && (
        <div className="mt-2 space-y-1">
          {!canTameHere ? (
            <p className="text-[9px] text-rose-400">Build a Taming Post nearby to tame.</p>
          ) : availableHumans.length === 0 ? (
            <p className="text-[9px] text-stone-500">No adult settler available to tame.</p>
          ) : (
            <div className="space-y-1">
              <p className="text-[9px] text-stone-400">
                Assign a settler to tame{tameFoodCost != null ? ` (${tameFoodCost} food)` : ''}:
              </p>
              <div className="grid grid-cols-2 gap-1">
                {availableHumans.slice(0, 4).map(h => (
                  <button
                    key={h.id}
                    onClick={() => onTame?.(h.id)}
                    disabled={tameFoodCost != null && state.resources.food < tameFoodCost}
                    className="rounded bg-emerald-700 px-1.5 py-1 text-[8px] font-bold text-white hover:bg-emerald-600 transition-all disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    🦴 {h.name || 'Settler'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Family */}
      {family.length > 0 && (
        <div className="mt-2 border-t border-amber-600/20 pt-2">
          <h4 className="mb-1 text-[9px] font-bold uppercase tracking-wider text-amber-400">Family</h4>
          <div className="space-y-0.5">
            {family.map((m, i) => (
              <div key={i} className="flex items-center gap-1.5 text-[9px] text-amber-200">
                <span>{m.label}</span>
                <span className="font-semibold">{m.name}</span>
                <span className="text-stone-500">({m.relation})</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const BUILDING_OUTPUT_HINTS: Partial<Record<BuildingType, string>> = {
  [BuildingType.Farm]: 'Produces food — check the Food counter in the header.',
  [BuildingType.Greenhouse]: 'Produces food year-round — watch Food in the header.',
  [BuildingType.Silo]: 'Passive food every 2 days, +600 food storage, less spoilage — no workers.',
  [BuildingType.Mill]: 'Passive — standing mill boosts all food production +25%. No workers needed.',
  [BuildingType.Barn]: 'Boosts nearby Farms/Greenhouses +35% — place next to fields, not a farm itself.',
  [BuildingType.LumberMill]: 'Produces wood — watch Wood in the header.',
  [BuildingType.Quarry]: 'Produces stone — watch Stone in the header.',
  [BuildingType.Mine]: 'Produces stone — watch Stone in the header.',
  [BuildingType.Store]: 'Generates passive gold income.',
  [BuildingType.Market]: 'Trades goods for gold with assigned workers.',
  [BuildingType.Workshop]: 'Pick a recipe below — crafts every 2 days when staffed and stocked.',
  [BuildingType.Church]: 'Staffed church boosts courtship, cures Moon Howlers nearby, and catches affairs.',
  [BuildingType.School]: 'Staffed school doubles child aging — assign a teacher.',
  [BuildingType.Blacksmith]: 'Unlocks iron weapons (with Defense research). Staffed smith boosts lumber, quarry & mine (+25% per worker).',
  [BuildingType.Hospital]: 'Staffed hospital adds reputation every 5 days; any hospital lowers energy drain.',
  [BuildingType.Well]: 'Lowers settler energy drain for the whole village.',
  [BuildingType.Prison]: 'Staffed by a Guard. Caught adulterers may be sentenced here for a few days.',
};

function canAffordRecipe(resources: WorldState['resources'], recipe: ReturnType<typeof getWorkshopRecipe>): boolean {
  for (const key of Object.keys(recipe.inputs) as (keyof WorldState['resources'])[]) {
    const needed = recipe.inputs[key] ?? 0;
    if (needed > 0 && resources[key] < needed) return false;
  }
  return true;
}

function SelectedBuildingPanel({ building, state, onAssign, onAssignWorker, assignableWorkers, onRemove, onRepair, onUpgrade, onDemolish, onSetWorkshopRecipe, idleWorkers, canAssignWorker }: {
  building: Building; state: WorldState; onAssign: () => void; onAssignWorker: (humanId: number) => void;
  assignableWorkers: Entity[]; onRemove: (id: number) => void;
  onRepair: () => void; onUpgrade: () => void; onDemolish: () => void;
  onSetWorkshopRecipe?: (recipeId: string) => void;
  idleWorkers: number;
  canAssignWorker: boolean;
}) {
  if (building.faction === 'rival') {
    const rival = state.rivalSettlements.find((r) => r.id === building.groupId);
    const config = BUILDING_CONFIGS[building.type];
    return (
      <div className="rounded-xl border border-indigo-600/40 bg-indigo-950/30 p-3">
        <div className="mb-2 flex items-center gap-2">
          <img src={config.sprite} alt={config.label} className="h-8 w-8 object-contain opacity-90" />
          <div>
            <h3 className="text-xs font-bold text-indigo-200">{rival?.name ?? building.campLabel ?? 'Rival Camp'}</h3>
            <p className="text-[9px] text-indigo-300/80">{config.label} · foreign settlement</p>
          </div>
        </div>
        <p className="text-[10px] leading-relaxed text-stone-400">
          This structure belongs to another group on the frontier.
          {rival && <> Relationship: <strong className="capitalize text-amber-300">{rival.relationship}</strong>.</>}
        </p>
      </div>
    );
  }

  const config = BUILDING_CONFIGS[building.type];
  const isHousing = isResidenceBuildingType(building.type);
  const residenceCap = isHousing ? getResidenceCapacity(building) : config.maxOccupants;
  const upgradeCost = building.completed && building.level < 3 ? getBuildingUpgradeCost(building) : null;
  const residents = isHousing
    ? state.entities.filter((e) => e.alive && e.residenceBuildingId === building.id)
    : [];
  const prisoners = building.type === BuildingType.Prison
    ? state.entities.filter((e) => e.alive && e.type === EntityType.Human && e.prisonBuildingId === building.id)
    : [];
  const builders = !building.completed
    ? state.entities.filter((e) => building.occupants.includes(e.id))
    : [];
  const terrainMult = getTerrainEfficiencyMultiplier(state, building);
  const adjacencyMult = getAdjacencyMultiplier(state, building);
  const totalEff = Math.round(terrainMult * adjacencyMult * 100);
  return (
    <div className="rounded-xl border border-amber-600/30 bg-amber-900/20 p-3">
      <div className="mb-2 flex items-center gap-2">
        <img src={config.sprite} alt={config.label} className="h-8 w-8 object-contain" />
        <div>
          <h3 className="text-xs font-bold text-amber-200">{config.label} {building.level > 1 && `(Lv.${building.level})`}</h3>
          <p className="text-[9px] text-amber-400">{config.description}</p>
        </div>
      </div>

      <div className="mb-2 space-y-0.5 text-[10px] text-amber-200">
        <p>Health: {Math.round(building.health)} / {building.maxHealth}</p>
        {isHousing && building.completed ? (
          <p>Residents: {residents.length} / {residenceCap}</p>
        ) : building.completed && !BUILDING_JOB_TYPES[building.type] && building.type === BuildingType.Mill ? (
          <p className="text-emerald-300">Passive — boosts all food +25% (no workers)</p>
        ) : (
          <p>{!building.completed ? 'Builders' : 'Workers'}: {building.occupants.length} / {config.maxOccupants}</p>
        )}
        {!building.completed && (
          <p>Progress: {Math.round(building.constructionProgress)}% · ~{config.buildTime} work-day{config.buildTime === 1 ? '' : 's'}</p>
        )}
        {isHousing && building.completed && (
          <p className="text-[9px] text-sky-300">
            Families live here automatically.
            {building.level < 3
              ? ` Upgrade below for +${getResidenceUpgradeSlotGain(building.type)} slots (max ${config.maxOccupants + getResidenceUpgradeSlotGain(building.type) * 2} at Lv.3).`
              : ' Fully expanded.'}
          </p>
        )}
        {!building.completed && isHousing && (
          <p className="text-[9px] text-stone-400">Assign builders to speed up construction.</p>
        )}
        {building.completed && (config.category === 'Food' || config.category === 'Resources' || config.category === 'Industry') && (
          <>
            <p>Placement bonus: <span className={totalEff >= 130 ? 'text-emerald-400' : totalEff >= 100 ? 'text-amber-400' : 'text-rose-400'}>{totalEff}%</span></p>
            <p className="text-[8px] text-stone-500">Terrain + nearby buildings (not worker skill)</p>
          </>
        )}
        {building.completed && BUILDING_JOB_TYPES[building.type] && building.type !== BuildingType.Church && (
          <p className="text-[9px] text-sky-300">Workers are assigned here automatically (7am–7pm).</p>
        )}
        {building.completed && building.type === BuildingType.Church && (
          <p className="text-[9px] text-violet-300">Priest is manual only — pick below, or leave empty (no curse cures).</p>
        )}
        {building.completed && building.type === BuildingType.Prison && (
          <p className="text-[9px] text-violet-300">Guard is manual only — assign one below, or the cells stay empty.</p>
        )}
        {!building.completed && (
          <p className="text-[9px] text-sky-300">Builders work 7am–7pm only — auto-assigned each morning.</p>
        )}
        {building.completed && BUILDING_OUTPUT_HINTS[building.type] && (
          <p className="text-[9px] text-stone-400">{BUILDING_OUTPUT_HINTS[building.type]}</p>
        )}
        {building.completed && building.type === BuildingType.Church && building.occupants.length === 0 && (
          <p className="text-[9px] text-amber-400">⚠️ No priest — Taylor keeps hunting; courtship/morals bonuses reduced.</p>
        )}
        {building.completed && (building.type === BuildingType.School || building.type === BuildingType.Blacksmith || building.type === BuildingType.Hospital) && building.occupants.length === 0 && (
          <p className="text-[9px] text-amber-400">⚠️ Unstaffed — bonuses are reduced or inactive until a worker is assigned.</p>
        )}
        {building.completed && building.type === BuildingType.Workshop && (() => {
          const recipe = getWorkshopRecipe(building.workshopRecipeId);
          const workers = building.occupants.length;
          const estGold = estimateWorkshopGold(state, building);
          const stocked = canAffordRecipe(state.resources, recipe);
          return (
            <div className="mt-2 space-y-1.5 rounded-lg border border-orange-700/40 bg-orange-950/30 p-2">
              <p className="text-[9px] font-semibold uppercase tracking-wider text-orange-300">Crafting recipe</p>
              <p className="text-[10px] text-amber-100">
                {recipe.emoji} <strong>{recipe.label}</strong> — {recipe.description}
              </p>
              <p className="text-[9px] text-stone-300">
                Uses: {formatRecipeInputs(recipe.inputs)} → ~{estGold} gold / 2 days
                {workers > 0 && <span className="text-stone-500"> (with {workers} worker{workers === 1 ? '' : 's'})</span>}
              </p>
              {!stocked && (
                <p className="text-[9px] text-rose-400">Not enough materials in storage — craft pauses until stocked.</p>
              )}
              {onSetWorkshopRecipe && (
                <div className="grid grid-cols-2 gap-1">
                  {WORKSHOP_RECIPES.map((r) => {
                    const active = r.id === recipe.id;
                    const affordable = canAffordRecipe(state.resources, r);
                    return (
                      <button
                        key={r.id}
                        type="button"
                        onClick={() => onSetWorkshopRecipe(r.id)}
                        className={`rounded px-1.5 py-1 text-left text-[8px] transition-all ${
                          active
                            ? 'bg-orange-600 text-white ring-1 ring-amber-300'
                            : affordable
                              ? 'bg-stone-800/80 text-stone-200 hover:bg-stone-700'
                              : 'bg-stone-900/60 text-stone-500 hover:bg-stone-800'
                        }`}
                      >
                        <span className="font-bold">{r.emoji} {r.label}</span>
                        <span className="block text-[7px] opacity-80">{formatRecipeInputs(r.inputs)} → {r.baseGold}g</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })()}
        {terrainMult !== 1 && <p className="text-[9px] text-stone-400">Terrain: {Math.round(terrainMult * 100)}%</p>}
        {adjacencyMult !== 1 && <p className="text-[9px] text-stone-400">Adjacency: {Math.round(adjacencyMult * 100)}%</p>}
        {building.occupants.length > 0 && BUILDING_JOB_TYPES[building.type] && (() => {
          const job = BUILDING_JOB_TYPES[building.type];
          if (!job) return null;
          const workers = state.entities.filter(e => building.occupants.includes(e.id));
          const avgSkill = workers.reduce((s, w) => s + (w.skills?.[job] ?? 0), 0) / Math.max(1, workers.length);
          return (
            <p className="text-[9px] text-emerald-400">
              Worker skill: {Math.round(avgSkill)}/100 (+{Math.round(avgSkill * 2)}% output)
              {avgSkill < 1 && <span className="text-stone-500"> · gains XP each production tick</span>}
            </p>
          );
        })()}
        {isHousing && building.completed && residents.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {residents.map((r) => (
              <p key={r.id} className="text-[9px] text-amber-100">🏠 {r.name || 'Settler'}{r.surname ? ` ${r.surname}` : ''}</p>
            ))}
          </div>
        )}
        {!building.completed && builders.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {builders.map((b) => (
              <p key={b.id} className="text-[9px] text-amber-100">🔨 {b.name || 'Settler'}{b.surname ? ` ${b.surname}` : ''}</p>
            ))}
          </div>
        )}
        {building.type === BuildingType.Prison && prisoners.length > 0 && (
          <div className="mt-2 space-y-0.5 rounded border border-slate-600/40 bg-slate-900/40 p-2">
            <p className="text-[9px] font-semibold uppercase tracking-wider text-slate-400">Prisoners</p>
            {prisoners.map((p) => {
              const daysLeft = p.prisonerUntilTick ? Math.max(0, Math.ceil((p.prisonerUntilTick - state.tick) / 24)) : 0;
              return (
                <p key={p.id} className="text-[9px] text-slate-300">
                  ⛓️ {p.name || 'Settler'}{p.surname ? ` ${p.surname}` : ''} · {daysLeft} day{daysLeft === 1 ? '' : 's'} left
                </p>
              );
            })}
          </div>
        )}
        {building.completed && BUILDING_JOB_TYPES[building.type] && building.occupants.length > 0 && (
          <div className="mt-1 space-y-0.5">
            {state.entities.filter((e) => building.occupants.includes(e.id)).map((w) => (
              <p key={w.id} className="text-[9px] text-emerald-200">
                👷 {w.name || 'Settler'}{w.surname ? ` ${w.surname}` : ''}
                {w.job ? ` · ${w.job}` : ''}
              </p>
            ))}
          </div>
        )}
      </div>

      {((!building.completed && config.maxOccupants > 0) || (building.completed && BUILDING_JOB_TYPES[building.type])) && (
        <div className="mt-1 space-y-1">
          <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-500">
            {!building.completed ? 'Construction' : 'Workers'}
          </p>
          {building.completed && BUILDING_JOB_TYPES[building.type] && assignableWorkers.length > 0 && building.occupants.length < config.maxOccupants && (
            <div className="mb-1 max-h-28 space-y-1 overflow-y-auto">
              <p className="text-[8px] text-stone-500">
                {building.type === BuildingType.Church ? 'Choose priest:' : 'Choose worker:'}
              </p>
              {assignableWorkers.map((h) => (
                <button
                  key={h.id}
                  onClick={() => onAssignWorker(h.id)}
                  className={`block w-full rounded px-2 py-1 text-left text-[9px] font-semibold text-white ${
                    building.type === BuildingType.Church
                      ? 'bg-violet-700/80 hover:bg-violet-600'
                      : 'bg-emerald-700/80 hover:bg-emerald-600'
                  }`}
                >
                  {building.type === BuildingType.Church ? '⛪ ' : '👷 '}
                  {h.name || 'Settler'}{h.surname ? ` ${h.surname}` : ''}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-2 gap-1">
          {canAssignWorker && building.occupants.length < config.maxOccupants && assignableWorkers.length === 0 && (
            <button onClick={onAssign} className="rounded bg-emerald-600 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-emerald-500 transition-all">
              + {!building.completed ? 'Assign builder' : idleWorkers > 0 ? `Assign worker (${idleWorkers})` : 'Reassign worker'}
            </button>
          )}
          {!canAssignWorker && building.occupants.length < config.maxOccupants && (
            <p className="col-span-2 text-[9px] text-stone-500">
              No idle settlers — recruit or free up workers.
            </p>
          )}
          {!isHousing && building.occupants.length > 0 && (
            <button onClick={() => onRemove(building.occupants[building.occupants.length - 1])} className="rounded bg-amber-600 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-amber-500">
              − Remove {!building.completed ? 'builder' : 'worker'}
            </button>
          )}
          </div>
        </div>
      )}
      <div className="mt-1 space-y-1">
        <p className="text-[9px] font-semibold uppercase tracking-wider text-stone-500">Building actions</p>
        <div className="grid grid-cols-2 gap-1">
          {building.health < building.maxHealth && (
            <button onClick={onRepair} className="rounded bg-amber-700 px-2 py-1 text-[9px] font-bold text-white hover:bg-amber-600">
              🔧 Repair
            </button>
          )}
          {building.completed && building.level < 3 && upgradeCost && (
            <button onClick={onUpgrade} className="rounded bg-purple-600 px-2 py-1 text-[9px] font-bold text-white hover:bg-purple-500"
              title={`${upgradeCost.wood}w ${upgradeCost.stone}s ${upgradeCost.gold}g`}>
              {isHousing
                ? `⬆ Expand (+${getResidenceUpgradeSlotGain(building.type)})`
                : '⬆ Upgrade'}
            </button>
          )}
          <button onClick={onDemolish} className="col-span-full rounded bg-rose-700 px-2 py-1.5 text-[9px] font-bold text-white hover:bg-rose-600">
            🗑 Demolish{isHousing && residents.length > 0 ? ' (evicts residents)' : ''}
          </button>
        </div>
      </div>
    </div>
  );
}

function MiniMap({ world, camera }: { world: WorldState; camera: ViewState['camera'] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const frameCounter = useRef(0);

  useEffect(() => {
    // Throttle: only render minimap every 5 frames (saves ~80% of minimap CPU)
    frameCounter.current++;
    if (frameCounter.current % 5 !== 0) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = 140, h = 100;
    // Background — matches flat meadow / winter snow on main map
    ctx.fillStyle = world.season === Season.Winter ? '#ffffff' : '#72a85c';
    ctx.fillRect(0, 0, w, h);

    const scaleX = w / world.width;
    const scaleY = h / world.height;

    // Only draw non-grass entities (grass is too dense and adds no info)
    for (const e of world.entities) {
      if (!e.alive || e.type === EntityType.Grass) continue;
      const sx = e.x * scaleX;
      const sy = e.y * scaleY;
      if (e.type === EntityType.Tree) {
        ctx.fillStyle = '#166534';
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      } else if (e.type === EntityType.Human) {
        ctx.fillStyle = '#fbbf24';
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      } else {
        ctx.fillStyle = SPECIES_CONFIG[e.type].color;
        ctx.fillRect(sx - 1, sy - 1, 2, 2);
      }
    }

    // Buildings
    for (const b of world.buildings) {
      if (!b.completed) continue;
      const sx = b.x * scaleX;
      const sy = b.y * scaleY;
      ctx.fillStyle = BUILDING_CONFIGS[b.type].backgroundColor;
      ctx.fillRect(sx - 2, sy - 2, 4, 3);
    }

    // Camera viewport
    const camW = (world.width / camera.zoom) * scaleX * 0.5;
    const camH = (world.height / camera.zoom) * scaleY * 0.5;
    const camX = camera.x * scaleX - camW / 2;
    const camY = camera.y * scaleY - camH / 2;
    ctx.strokeStyle = '#fbbf24';
    ctx.lineWidth = 1;
    ctx.strokeRect(camX, camY, camW, camH);

  }, [world, camera]);

  return (
    <div className="absolute bottom-4 left-4 overflow-hidden rounded-lg border border-stone-600 bg-stone-800/80 shadow-xl backdrop-blur">
      <canvas ref={canvasRef} width={140} height={100} className="block" />
    </div>
  );
}
