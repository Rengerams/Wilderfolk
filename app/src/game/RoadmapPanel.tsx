import { GAME_PHASE, GAME_VERSION } from './version';
import {
  ROADMAP_DEFERRED,
  ROADMAP_NORTH_STAR,
  ROADMAP_NEXT_ACTIONS,
  ROADMAP_OPEN_FIXES,
  ROADMAP_SECTIONS,
  ROADMAP_TARGET_VERSION,
  ROADMAP_WINNING_MOMENT,
  type RoadmapItem,
  type RoadmapItemStatus,
} from './roadmapContent';

const STATUS_META: Record<RoadmapItemStatus, { icon: string; label: string; className: string }> = {
  done: { icon: '✅', label: 'Done', className: 'text-emerald-400' },
  partial: { icon: '🟡', label: 'Partial', className: 'text-amber-400' },
  open: { icon: '⬜', label: 'Open', className: 'text-stone-400' },
  deferred: { icon: '🔮', label: 'Later', className: 'text-violet-400' },
};

function RoadmapItemRow({ item }: { item: RoadmapItem }) {
  const meta = STATUS_META[item.status];
  return (
    <div className="rounded-lg bg-stone-900/40 px-2 py-1.5">
      <div className="flex items-start gap-1.5">
        <span className="mt-0.5 shrink-0 text-[10px]" title={meta.label}>{meta.icon}</span>
        <div className="min-w-0 flex-1">
          <p className={`text-[10px] leading-snug ${item.status === 'done' ? 'text-stone-400' : 'text-stone-200'}`}>
            {item.label}
          </p>
          {item.note && (
            <p className="mt-0.5 text-[9px] leading-relaxed text-stone-500">{item.note}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default function RoadmapPanel() {
  const openCount = ROADMAP_SECTIONS.flatMap((s) => s.items).filter((i) => i.status === 'open').length;
  const partialCount = ROADMAP_SECTIONS.flatMap((s) => s.items).filter((i) => i.status === 'partial').length;

  return (
    <div className="space-y-3 text-[10px] text-stone-300">
      <div className="rounded-xl border border-indigo-700/40 bg-indigo-950/25 p-3">
        <h3 className="mb-1 text-xs font-bold text-indigo-300">🗺️ Development roadmap</h3>
        <p className="text-[9px] text-stone-500">
          {GAME_PHASE} · playing v{GAME_VERSION} · targeting v{ROADMAP_TARGET_VERSION}
        </p>
        <p className="mt-2 leading-relaxed text-stone-400">{ROADMAP_NORTH_STAR}</p>
        <p className="mt-2 rounded-lg bg-stone-900/50 px-2 py-1.5 text-[9px] italic text-amber-200/90">
          Winning moment: “{ROADMAP_WINNING_MOMENT}”
        </p>
        <p className="mt-2 text-[9px] text-stone-500">
          {openCount} open · {partialCount} partial — read-only slice of the dev roadmap.
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

      <div className="rounded-xl border border-rose-700/30 bg-rose-950/20 p-3">
        <h4 className="mb-2 text-xs font-bold text-rose-300">Still to fix / implement</h4>
        <ul className="space-y-1 text-[9px] text-stone-400">
          {ROADMAP_OPEN_FIXES.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </div>

      <div className="rounded-xl border border-amber-700/30 bg-amber-950/20 p-3">
        <h4 className="mb-2 text-xs font-bold text-amber-300">Next dev priorities</h4>
        <ol className="list-decimal space-y-1 pl-4 text-[9px] text-stone-400">
          {ROADMAP_NEXT_ACTIONS.map((action) => (
            <li key={action}>{action}</li>
          ))}
        </ol>
      </div>

      <div className="rounded-xl bg-stone-800/40 p-3">
        <h4 className="mb-2 text-xs font-bold text-violet-300">After v{ROADMAP_TARGET_VERSION}</h4>
        <ul className="space-y-1 text-[9px] text-stone-500">
          {ROADMAP_DEFERRED.map((item) => (
            <li key={item}>· {item}</li>
          ))}
        </ul>
      </div>
    </div>
  );
}