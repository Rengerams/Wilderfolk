import { useEffect, useRef, useState } from 'react';

interface Props {
  hasSavedGame: boolean;
  autoSave: boolean;
  tutorialsEnabled: boolean;
  juiceEffectsEnabled: boolean;
  muted: boolean;
  volumePreset: 'soft' | 'normal' | 'loud';
  onSave: () => void;
  onLoad: () => void;
  onToggleAutoSave: () => void;
  onToggleTutorials: () => void;
  onToggleJuiceEffects: () => void;
  onToggleMute: () => void;
  onVolumePreset: (v: 'soft' | 'normal' | 'loud') => void;
  onReset: () => void;
}

export default function GameMenu({
  hasSavedGame,
  autoSave,
  tutorialsEnabled,
  juiceEffectsEnabled,
  muted,
  volumePreset,
  onSave,
  onLoad,
  onToggleAutoSave,
  onToggleTutorials,
  onToggleJuiceEffects,
  onToggleMute,
  onVolumePreset,
  onReset,
}: Props) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="rounded-lg bg-stone-700 px-2.5 py-1.5 text-xs font-bold text-stone-300 hover:bg-stone-600"
        title="Game menu — save, audio, reset"
        aria-expanded={open}
      >
        ☰
      </button>
      {open && (
        <div className="absolute right-0 top-full z-50 mt-1 min-w-[11rem] rounded-xl border border-stone-600 bg-stone-800 py-1 shadow-xl">
          <button type="button" onClick={() => { onSave(); setOpen(false); }} className="menu-item">
            💾 Save game
          </button>
          {hasSavedGame && (
            <button type="button" onClick={() => { onLoad(); setOpen(false); }} className="menu-item">
              📂 Load game
            </button>
          )}
          <button type="button" onClick={onToggleAutoSave} className="menu-item">
            {autoSave ? '⟳ Auto-save on' : '⟳ Auto-save off'}
          </button>
          <button type="button" onClick={onToggleTutorials} className="menu-item">
            {tutorialsEnabled ? '💡 Tutorials on' : '💡 Tutorials off'}
          </button>
          <button type="button" onClick={onToggleJuiceEffects} className="menu-item">
            {juiceEffectsEnabled ? '✨ Juice on' : '✨ Juice off'}
          </button>
          <div className="my-1 h-px bg-stone-700" />
          <button type="button" onClick={onToggleMute} className="menu-item">
            {muted ? '🔇 Unmute' : '🔊 Mute'}
          </button>
          {!muted && (
            <div className="px-3 py-1.5">
              <label className="mb-1 block text-[9px] text-stone-500">Volume</label>
              <select
                value={volumePreset}
                onChange={(e) => onVolumePreset(e.target.value as 'soft' | 'normal' | 'loud')}
                className="w-full rounded-md border-0 bg-stone-700 py-1 text-[10px] text-stone-200"
              >
                <option value="soft">Soft</option>
                <option value="normal">Normal</option>
                <option value="loud">Loud</option>
              </select>
            </div>
          )}
          <div className="my-1 h-px bg-stone-700" />
          <button
            type="button"
            onClick={() => { onReset(); setOpen(false); }}
            className="menu-item text-rose-300 hover:bg-rose-950/40"
          >
            ↺ Reset game
          </button>
        </div>
      )}
    </div>
  );
}