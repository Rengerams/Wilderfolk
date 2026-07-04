import { BuildingType, BUILDING_CONFIGS } from '../game/gameEngine';
import type { WorldState } from '../game/gameTypes';

const HOTBAR_TYPES: BuildingType[] = [
  BuildingType.House,
  BuildingType.Farm,
  BuildingType.LumberMill,
  BuildingType.Quarry,
  BuildingType.Well,
  BuildingType.Road,
];

const HOTKEYS: Partial<Record<BuildingType, string>> = {
  [BuildingType.House]: '1',
  [BuildingType.Farm]: '2',
  [BuildingType.LumberMill]: '3',
  [BuildingType.Quarry]: '4',
  [BuildingType.Well]: '6',
  [BuildingType.Road]: '8',
};

interface Props {
  world: WorldState;
  selected: BuildingType | null;
  panelOpen: boolean;
  onSelect: (type: BuildingType) => void;
  onExpandPanel: () => void;
  onCancel: () => void;
}

/** Banished-style bottom build strip — map stays visible, one-click common buildings. */
export default function BuildHotbar({
  world,
  selected,
  panelOpen,
  onSelect,
  onExpandPanel,
  onCancel,
}: Props) {
  return (
    <div className="pointer-events-auto absolute bottom-3 left-1/2 z-20 flex -translate-x-1/2 items-center gap-1 rounded-xl border border-stone-600/80 bg-stone-900/92 px-1.5 py-1 shadow-2xl backdrop-blur-md">
      {!panelOpen && (
        <button
          type="button"
          onClick={onExpandPanel}
          className="flex h-9 w-9 items-center justify-center rounded-lg border border-stone-600 text-sm text-stone-400 hover:border-emerald-500/40 hover:text-emerald-300"
          title="Full build menu (B)"
        >
          🏗️
        </button>
      )}
      {HOTBAR_TYPES.map((type) => {
        const config = BUILDING_CONFIGS[type];
        const isSelected = selected === type;
        const locked = config.unlockRequirement && !world.unlockedTechs.includes(config.unlockRequirement);
        const affordable = world.resources.wood >= config.cost.wood
          && world.resources.stone >= config.cost.stone
          && world.resources.gold >= config.cost.gold;
        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelect(type)}
            title={`${config.label}${HOTKEYS[type] ? ` [${HOTKEYS[type]}]` : ''}`}
            className={`relative flex h-9 w-9 flex-col items-center justify-center rounded-lg border transition-all ${
              isSelected
                ? 'border-emerald-500 bg-emerald-500/25 shadow-md shadow-emerald-500/20'
                : locked
                  ? 'border-stone-700 bg-stone-800/60 opacity-40'
                  : affordable
                    ? 'border-stone-600 bg-stone-800/80 hover:border-emerald-500/40'
                    : 'border-stone-700 bg-stone-800/50 opacity-60'
            }`}
          >
            {HOTKEYS[type] && (
              <span className="absolute left-0.5 top-0.5 text-[7px] font-bold text-stone-500">{HOTKEYS[type]}</span>
            )}
            <img src={config.sprite} alt="" className="h-5 w-5 object-contain" />
          </button>
        );
      })}
      {selected && (
        <button
          type="button"
          onClick={onCancel}
          className="ml-0.5 flex h-9 items-center rounded-lg bg-rose-900/50 px-2 text-[10px] font-bold text-rose-200 hover:bg-rose-800/60"
          title="Cancel (ESC)"
        >
          ✕
        </button>
      )}
    </div>
  );
}