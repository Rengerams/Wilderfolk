import { GAME_PHASE, GAME_VERSION } from './version';
import {
  ROADMAP_NORTH_STAR,
  ROADMAP_SECTIONS,
  ROADMAP_TARGET_VERSION,
  ROADMAP_WINNING_MOMENT,
  type RoadmapItem,
} from './roadmapContent';

function RoadmapItemRow({ item }: { item: RoadmapItem }) {
  return (
    <div className="rounded-lg bg-stone-900/40 px-2 py-1.5">
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 shrink-0 text-[10px]" title="Shipped">✅</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] leading-snug text-stone-300">{item.label}</p>
          {item.note && (
            <p className="mt-0.5 text-[9px] leading-relaxed text-stone-500">{item.note}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RoadmapPanel() {
  return (
    <div className="space-y-3 text-[10px] text-stone-300">
      <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/25 p-3">
        <h3 className="mb-1 text-xs font-bold text-indigo-300">🗺️ Roadmap</h3>
        <p className="text-[9px] text-stone-500">
          {GAME_PHASE} · playing v{GAME_VERSION} · next tag v{ROADMAP_TARGET_VERSION}
        </p>
        <p className="mt-2 leading-relaxed text-stone-400">{ROADMAP_NORTH_STAR}</p>
        <p className="mt-2 rounded-lg bg-stone-900/50 px-2 py-1.5 text-[9px] italic text-amber-200/90">
          Winning moment: “{ROADMAP_WINNING_MOMENT}”
        </p>
      </div>

      {ROADMAP_SECTIONS.map((section) => (
        <div key={section.id} className="rounded-xl bg-stone-700/50 p-3">
          <h4 className="mb-0.5 text-xs font-bold text-stone-200">{section.title}</h4>
          {section.subtitle && (
            <p className="mb-2 text-[9px] text-stone-500">{section.subtitle}</p>
          )}
          <div className="space-y-1">
            {section.items.map((item) => (
              <RoadmapItemRow key={item.label} item={item} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}