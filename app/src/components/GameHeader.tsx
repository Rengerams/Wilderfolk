import GameMenu from './GameMenu';
import type { Season, WeatherType, WorldState } from '../game/gameTypes';
import { isNightHour, getHourOfDay } from '../game/dayCycle';

const SEASON_ICONS: Record<Season, string> = {
  spring: '🌸', summer: '☀️', fall: '🍂', winter: '❄️',
};

const WEATHER_ICONS: Record<WeatherType, string> = {
  clear: '', rain: '🌧️', snow: '❄️', storm: '⛈️', fog: '🌫️', drought: '🌵',
};

function formatNumber(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return Math.floor(n).toString();
}

function formatHour(hour: number) {
  const h = hour % 24;
  return `${h.toString().padStart(2, '0')}:00`;
}

interface Props {
  world: WorldState;
  population: number;
  gameTitle: string;
  gameVersion: string;
  foodCritical: boolean;
  muted: boolean;
  volumePreset: 'soft' | 'normal' | 'loud';
  hasSavedGame: boolean;
  tutorialsEnabled: boolean;
  juiceEffectsEnabled: boolean;
  speedOptions: number[];
  onTogglePause: () => void;
  onSetSpeed: (speed: number) => void;
  onOpenTrade: () => void;
  onSave: () => void;
  onLoad: () => void;
  onToggleAutoSave: () => void;
  onToggleTutorials: () => void;
  onToggleJuiceEffects: () => void;
  onToggleMute: () => void;
  onVolumePreset: (v: 'soft' | 'normal' | 'loud') => void;
  onReset: () => void;
}

export default function GameHeader({
  world,
  population,
  gameTitle,
  gameVersion,
  foodCritical,
  muted,
  volumePreset,
  hasSavedGame,
  tutorialsEnabled,
  juiceEffectsEnabled,
  speedOptions,
  onTogglePause,
  onSetSpeed,
  onOpenTrade,
  onSave,
  onLoad,
  onToggleAutoSave,
  onToggleTutorials,
  onToggleJuiceEffects,
  onToggleMute,
  onVolumePreset,
  onReset,
}: Props) {
  const hour = getHourOfDay(world.tick);
  const isNight = isNightHour(hour);
  const popNearCap = population / Math.max(1, world.maxHumanPopulation) >= 0.9;
  const foodLow = world.resources.food < 20;

  return (
    <header className="flex items-center justify-between gap-3 border-b border-stone-700 bg-stone-800 px-3 py-1.5 shadow-lg">
      <div
        className="flex min-w-0 items-center gap-2"
        title={`${gameTitle} · v${gameVersion}`}
      >
        <img
          src="/logo.png"
          alt=""
          className="h-8 w-8 shrink-0 rounded-md object-contain ring-1 ring-amber-500/30"
        />
        <h1 className="truncate text-sm font-bold text-white">{world.villageName || gameTitle}</h1>
      </div>

      <div
        className="hidden shrink-0 items-center gap-1.5 rounded-md bg-stone-700/50 px-2.5 py-1 text-[11px] sm:flex"
        title={`${world.season} · Year ${world.year} · Day ${world.dayInYear}${world.weather !== 'clear' ? ` · ${world.weather}` : ''}${world.festival ? ` · ${world.festival.name}` : ''}`}
      >
        <span>{SEASON_ICONS[world.season]}</span>
        <span className="font-semibold capitalize text-emerald-400">{world.season.slice(0, 3)}</span>
        <span className="text-stone-500">·</span>
        <span className="text-stone-300">Y{world.year} D{world.dayInYear}</span>
        <span className="text-stone-500">·</span>
        <span>{isNight ? '🌙' : '☀️'}</span>
        <span className="font-mono text-white">{formatHour(hour)}</span>
        {world.weather !== 'clear' && <span>{WEATHER_ICONS[world.weather]}</span>}
        {world.festival && <span title={world.festival.name}>🎉</span>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onOpenTrade}
          className="flex items-center gap-0.5 rounded-md bg-violet-900/35 px-1.5 py-1 text-[11px] text-violet-200 hover:bg-violet-800/45"
          title={`Reputation ${world.villageReputation} — click for trade routes`}
        >
          <span>⭐</span>
          <span className="font-mono font-bold">{world.villageReputation}</span>
        </button>

        <span
          className={`flex items-center gap-0.5 rounded-md px-1.5 py-1 text-[11px] ${
            popNearCap ? 'bg-rose-900/40 text-rose-300' : 'bg-sky-900/40 text-sky-300'
          }`}
          title={`${population} settlers · cap ${world.maxHumanPopulation}`}
        >
          <span>👥</span>
          <span className="font-mono font-bold">{population}/{world.maxHumanPopulation}</span>
        </span>

        <div className="flex items-center gap-0.5 text-[11px] font-medium">
          <span
            className={`rounded-md px-1.5 py-1 ${foodCritical || foodLow ? 'bg-rose-900/50 text-rose-300 ring-1 ring-rose-500/50' : 'bg-green-900/40 text-green-400'}`}
            title={`Food ${world.resources.food} / ${world.storageMax.food}`}
          >
            🍖 <span className="font-mono font-bold">{formatNumber(world.resources.food)}</span>
          </span>
          <span
            className="rounded-md bg-amber-900/40 px-1.5 py-1 text-amber-400"
            title={`Wood ${world.resources.wood} / ${world.storageMax.wood}`}
          >
            🪵 <span className="font-mono font-bold">{formatNumber(world.resources.wood)}</span>
          </span>
          <span
            className="hidden rounded-md bg-stone-700/60 px-1.5 py-1 text-stone-300 md:inline"
            title={`Stone ${world.resources.stone} · Gold ${world.resources.gold}`}
          >
            🪨{formatNumber(world.resources.stone)} 💰{formatNumber(world.resources.gold)}
          </span>
        </div>

        <button
          type="button"
          onClick={onTogglePause}
          className={`rounded-md px-2 py-1 text-[11px] font-bold ${world.paused ? 'bg-emerald-600 text-white' : 'bg-amber-600/90 text-white'}`}
          title="Space — pause / resume"
        >
          {world.paused ? '▶' : '⏸'}
        </button>

        <div className="flex gap-0.5 rounded-md bg-stone-700 p-0.5">
          {speedOptions.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSetSpeed(s)}
              className={`rounded px-1 py-0.5 text-[9px] font-bold ${world.speed === s ? 'bg-stone-500 text-white' : 'text-stone-400 hover:text-white'}`}
            >
              {s}x
            </button>
          ))}
        </div>

        <GameMenu
          hasSavedGame={hasSavedGame}
          autoSave={world.autoSave}
          tutorialsEnabled={tutorialsEnabled}
          juiceEffectsEnabled={juiceEffectsEnabled}
          muted={muted}
          volumePreset={volumePreset}
          onSave={onSave}
          onLoad={onLoad}
          onToggleAutoSave={onToggleAutoSave}
          onToggleTutorials={onToggleTutorials}
          onToggleJuiceEffects={onToggleJuiceEffects}
          onToggleMute={onToggleMute}
          onVolumePreset={onVolumePreset}
          onReset={onReset}
        />
      </div>
    </header>
  );
}