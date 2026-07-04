import type { WorldState, Entity } from './gameTypes';
import { EntityType, BUILDING_CONFIGS } from './gameTypes';
import { isPlayerHuman } from './groupEvents';
import { buildFamilyGroups, hasWorkAssignment, isImprisoned } from './dayCycle';
import { isVillageLeader } from './villageLeadership';
import { getPopulationGrowthReport } from './populationGrowth';

function formatName(e: Entity): string {
  const base = e.name || 'Unknown';
  const surname = e.surname || '';
  return `${base}${surname ? ` ${surname}` : ''}`;
}

function relationIcon(e: Entity): string {
  if (e.isJuvenile) return e.gender === 'male' ? '👦' : '👧';
  return e.gender === 'male' ? '👨' : e.gender === 'female' ? '👩' : '👤';
}

export default function PopulationPanel({ state }: { state: WorldState }) {
  const playerHumans = state.entities.filter(
    (e) => e.alive && e.type === EntityType.Human && isPlayerHuman(e),
  );
  const adults = playerHumans.filter((e) => !e.isJuvenile);
  const children = playerHumans.filter((e) => e.isJuvenile);
  const working = playerHumans.filter((e) => hasWorkAssignment(e)).length;
  const idle = adults.length - working;
  const imprisoned = playerHumans.filter((e) => isImprisoned(e)).length;
  const capacity = state.maxHumanPopulation;

  const familyGroups = buildFamilyGroups(playerHumans);
  const growth = getPopulationGrowthReport(state);
  const growthToneClass = growth.tone === 'blocked'
    ? 'border-rose-500/30 bg-rose-950/30 text-rose-200'
    : growth.tone === 'warn'
      ? 'border-amber-500/30 bg-amber-950/30 text-amber-200'
      : 'border-emerald-500/30 bg-emerald-950/25 text-emerald-200';

  const getResidenceLabel = (id?: number) => {
    if (id == null) return 'Unhoused';
    const b = state.buildings.find((b) => b.id === id);
    if (!b) return 'Unknown';
    return BUILDING_CONFIGS[b.type]?.label || 'House';
  };

  return (
    <div className="rounded-xl bg-stone-700/50 p-3">
      <div className="mb-3 flex items-end justify-between gap-2">
        <div>
          <h3 className="text-xs font-bold text-stone-300">Population & Families</h3>
          <p className="text-[9px] text-stone-500">{familyGroups.length} family units · {capacity} max</p>
        </div>
        <div className="text-right">
          <p className="text-2xl font-black leading-none text-emerald-300">
            {playerHumans.length}
            <span className="text-sm font-bold text-stone-500"> / {capacity}</span>
          </p>
        </div>
      </div>

      <div className={`mb-3 rounded-lg border px-2.5 py-2 text-[9px] ${growthToneClass}`}>
        <p className="font-bold">{growth.headline}</p>
        <p className="mt-0.5 text-[8px] opacity-90">{growth.detail}</p>
        <ul className="mt-1 list-inside list-disc text-[8px] opacity-80">
          {growth.reasons.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      </div>

      <div className="mb-3 grid grid-cols-3 gap-1 text-[9px]">
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-sky-300">{adults.length}</div>
          <div className="text-stone-500">adults</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-pink-300">{children.length}</div>
          <div className="text-stone-500">children</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-amber-300">{imprisoned}</div>
          <div className="text-stone-500">jailed</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-emerald-300">{working}</div>
          <div className="text-stone-500">working</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-stone-300">{idle}</div>
          <div className="text-stone-500">idle</div>
        </div>
        <div className="rounded bg-stone-600/30 px-2 py-1 text-center">
          <div className="font-bold text-purple-300">{state.unlockedTechs.length}</div>
          <div className="text-stone-500">techs</div>
        </div>
      </div>

      <div className="max-h-60 overflow-y-auto pr-1">
        <div className="space-y-1.5">
          {familyGroups.length === 0 && (
            <p className="text-[10px] text-stone-500">No families yet.</p>
          )}
          {familyGroups.map((family, idx) => {
            const parents = family.filter((e) => !e.isJuvenile);
            const kids = family.filter((e) => e.isJuvenile);
            const residenceId = family[0]?.residenceBuildingId;
            const residenceLabel = getResidenceLabel(residenceId);
            const surname = family[0]?.surname;
            return (
              <div
                key={idx}
                className="rounded bg-stone-800/50 px-2 py-1.5 text-[10px]"
              >
                <div className="mb-0.5 flex items-center justify-between">
                  <span className="font-bold text-stone-200">
                    {surname ? `${surname} household` : `Family ${idx + 1}`}
                  </span>
                  <span className="text-[9px] text-stone-500" title="Home">
                    🏠 {residenceLabel}
                  </span>
                </div>
                <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-stone-300">
                  {parents.map((p) => (
                    <span key={p.id} title={p.occupation || 'settler'}>
                      {relationIcon(p)} {formatName(p)}
                      {isVillageLeader(state, p.id) ? ' 👑' : ''}
                      {hasWorkAssignment(p) ? ' 🔨' : ''}
                      {isImprisoned(p) ? ' 🔒' : ''}
                    </span>
                  ))}
                  {kids.length > 0 && (
                    <span className="text-stone-400">
                      {kids[0].gender === 'male' ? '👦' : '👧'} {kids.length} child{kids.length === 1 ? '' : 'ren'}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
