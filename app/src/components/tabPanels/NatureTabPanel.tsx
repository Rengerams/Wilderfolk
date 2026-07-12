import { memo } from 'react';
import type { WorldState } from '../../game/gameEngine';
import type { GrazingPressureReport, EcosystemBreakdown } from '../../game/gameEngine';
import { SEASON_LABELS, seasonTextClass, formatTemperatureC, computeDailyTemperatureC } from '../../game/temperature';
import { Season, WeatherType } from '../../game/gameTypes';

const WEATHER_ICONS: Record<WeatherType, string> = {
  [WeatherType.Clear]: '',
  [WeatherType.Rain]: '🌧️',
  [WeatherType.Storm]: '⛈️',
  [WeatherType.Snow]: '❄️',
  [WeatherType.Fog]: '🌫️',
  [WeatherType.Drought]: '🌵',
};

interface WildlifeBarProps {
  label: string;
  count: number;
  max: number;
  color: string;
  icon: string;
}

const WildlifeBar = memo(function WildlifeBar({ label, count, max, color, icon }: WildlifeBarProps) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-5 text-center text-[11px]">{icon}</span>
      <div className="flex-1">
        <div className="mb-0.5 flex justify-between text-[11px]">
          <span className="text-stone-400">{label}</span>
          <span className="text-stone-300">{count}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-stone-600">
          <div
            className={`h-full rounded-full transition-all ${color}`}
            style={{ width: `${Math.min(100, (count / max) * 100)}%` }}
          />
        </div>
      </div>
    </div>
  );
});

export interface NatureTabPanelProps {
  state: WorldState;
  grazingPressure: GrazingPressureReport;
  ecoBreakdown: EcosystemBreakdown;
}

export default function NatureTabPanel({ state, grazingPressure, ecoBreakdown }: NatureTabPanelProps) {
  return (
    <div className="space-y-3">
      {grazingPressure.level !== 'stable' && (
        <div className={`rounded-xl border p-3 ${
          grazingPressure.level === 'critical'
            ? 'border-rose-500/40 bg-rose-950/40'
            : 'border-amber-500/40 bg-amber-950/30'
        }`}>
          <h3 className={`mb-1 text-xs font-bold ${
            grazingPressure.level === 'critical' ? 'text-rose-300' : 'text-amber-300'
          }`}>
            {grazingPressure.level === 'critical' ? '⚠️ Overgrazing warning' : '🦌 Grazing pressure rising'}
          </h3>
          <p className="text-[11px] leading-relaxed text-stone-300">{grazingPressure.headline}</p>
          <p className="mt-1.5 text-[11px] text-stone-400">{grazingPressure.advice}</p>
          <div className="mt-2 grid grid-cols-2 gap-1 text-[11px] text-stone-500">
            <span>🦌 Deer: {grazingPressure.deerCount}</span>
            <span>🌿 Grass: {grazingPressure.grassCount}</span>
            <span>Demand/day: {grazingPressure.grazingDemandPerDay}</span>
            <span>Recovery/day: {grazingPressure.grassRecoveryPerDay}</span>
          </div>
        </div>
      )}

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-3 text-sm font-bold text-stone-300">Ecosystem Health</h3>

        <div className="mb-3 space-y-2">
          <div>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-stone-400">Health</span>
              <strong className={state.ecosystemHealth > 60 ? 'text-emerald-400' : state.ecosystemHealth > 30 ? 'text-amber-400' : 'text-rose-400'}>
                {Math.round(state.ecosystemHealth)}%
              </strong>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-stone-600">
              <div className={`h-full rounded-full transition-all ${
                state.ecosystemHealth > 60 ? 'bg-emerald-500' : state.ecosystemHealth > 30 ? 'bg-amber-500' : 'bg-rose-500'
              }`} style={{ width: `${Math.max(0, state.ecosystemHealth)}%` }} />
            </div>
          </div>

          <div>
            <div className="mb-1 flex justify-between text-[11px]">
              <span className="text-stone-400">Pollution</span>
              <strong className="text-rose-400">{Math.round(state.pollutionLevel)}%</strong>
            </div>
            <div className="h-2.5 overflow-hidden rounded-full bg-stone-600">
              <div className="h-full rounded-full bg-rose-500 transition-all" style={{ width: `${Math.max(0, state.pollutionLevel)}%` }} />
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2 text-[11px]">
          <div className="rounded bg-stone-600/30 p-2">
            <div className="text-stone-500">Biodiversity</div>
            <strong className="text-lg text-white">{state.biodiversityIndex.toFixed(2)}</strong>
          </div>
          <div className="rounded bg-stone-600/30 p-2">
            <div className="text-stone-500">Weather</div>
            <strong className="text-lg text-white">{state.weather}</strong>
          </div>
        </div>

        <div className="mt-3 rounded-lg border border-stone-600/40 bg-stone-800/40 p-2.5">
          <h4 className="mb-1 text-[11px] font-bold uppercase tracking-wider text-stone-400">Why this score</h4>
          <p className="mb-2 text-[11px] leading-relaxed text-stone-400">{ecoBreakdown.summary}</p>
          <div className="space-y-1 text-[11px]">
            {ecoBreakdown.lines.map((line) => (
              <div key={line.label} className="flex items-start justify-between gap-2">
                <span className="text-stone-500">{line.label}</span>
                <span className="text-right">
                  <strong className={line.delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}>
                    {line.delta >= 0 ? '+' : ''}{Math.round(line.delta)}
                  </strong>
                  <span className="block text-[8px] text-stone-600">{line.detail}</span>
                </span>
              </div>
            ))}
            <div className="flex justify-between border-t border-stone-700/60 pt-1 font-bold">
              <span className="text-stone-400">Health</span>
              <span className="text-stone-200">{Math.round(ecoBreakdown.health)}%</span>
            </div>
          </div>
          <p className="mt-2 text-[8px] text-stone-600">
            Growing towns shed pristine wilderness — there is no player tree planting yet. Early food-chain balance still matters for hunting.
          </p>
        </div>
      </div>

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-sm font-bold text-stone-300">Season & Climate</h3>
        <div className="space-y-1 text-[11px] text-stone-400">
          <p>
            <strong className={seasonTextClass(state.season)}>{SEASON_LABELS[state.season]}</strong>
            {' · '}
            <span className="font-mono text-stone-200">
              {formatTemperatureC(computeDailyTemperatureC(state.season, state.weather, state.dayInYear, state.year))}
            </span>
            {' today'}
          </p>
          {state.season === Season.Winter && (
            <p className="text-sky-300/90">
              Winter (days 270–359) — settlers burn wood for heat; grass and babies slow down.
            </p>
          )}
          {state.weather !== WeatherType.Clear && (
            <p>{WEATHER_ICONS[state.weather]} <strong className="text-stone-200">{state.weather}</strong> — shifts today&apos;s temperature and farming</p>
          )}
        </div>
      </div>

      <div className="rounded-xl bg-stone-700/50 p-3">
        <h3 className="mb-2 text-sm font-bold text-stone-300">Wildlife Populations</h3>
        <p className="mb-2 text-[11px] text-stone-500">Healthy numbers keep the food chain balanced.</p>
        <div className="space-y-1 text-[11px]">
          <WildlifeBar label="Rabbits" count={state.wildlifeCounts.rabbits} max={120} color="bg-amber-600" icon="🐰" />
          <WildlifeBar label="Deer" count={state.wildlifeCounts.deer} max={60} color="bg-orange-700" icon="🦌" />
          <WildlifeBar label="Wolves" count={state.wildlifeCounts.wolves} max={25} color="bg-stone-500" icon="🐺" />
          <WildlifeBar label="Foxes" count={state.wildlifeCounts.foxes} max={35} color="bg-orange-600" icon="🦊" />
          <WildlifeBar label="Moon Howlers" count={state.wildlifeCounts.werewolves} max={10} color="bg-violet-700" icon="🌝" />
          <WildlifeBar label="Wildkin" count={state.wildlifeCounts.wildkin} max={15} color="bg-lime-700" icon="🦌" />
          <WildlifeBar label="Trees" count={state.wildlifeCounts.trees} max={200} color="bg-green-700" icon="🌲" />
          <WildlifeBar label="Grass" count={state.wildlifeCounts.grass} max={500} color="bg-green-500" icon="🌿" />
        </div>
      </div>

      {state.disasters.length > 0 && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-900/30 p-3">
          <h3 className="mb-2 text-sm font-bold text-rose-400">Active Disasters</h3>
          {state.disasters.map((d, i) => (
            <div key={i} className="mb-1 text-[11px] text-rose-300">
              ⚠️ {d.type.charAt(0).toUpperCase() + d.type.slice(1)} — {Math.round((1 - d.progress / d.duration) * 100)}% remaining
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
