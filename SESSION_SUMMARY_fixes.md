# Session Summary — Sprite, Interaction & Performance Fixes

**July 4, 2026 addendum (v0.4.2 polish):** Road/wall/gate rotation (**R**), juice pass (night glow, build confetti, camera nudge), intro screen refine (~20s timeline). Docs synced in `README.md`, `app/README.md`, `ROADMAP.md`, `CHANGELOG.md`. See [SESSION_SUMMARY.md](SESSION_SUMMARY.md) for full dev log.

**July 4, 2026 addendum (bug-fix pass):** ~40 fixes across four review rounds — map setup loop, faction ages, refugees, diplomacy/raids/trade, save migrations, challenges, stats, forge, moon howler. Verified with build, lint (0 errors), 5-min + 30-min sim, `/check-work` PASS. Full list → [app/CHANGELOG.md](app/CHANGELOG.md) → *Bug fixes — comprehensive pass*.

---

**Date:** 2026-06-24

## Tests Run

All checks passed:

```bash
cd /c/Kimi_Agent_Update_Building_Background_Colors
npm run build   # tsc -b && vite build — 85 modules, production build OK
npm run lint    # eslint . — 0 errors
npx tsc --noEmit -p app/tsconfig.app.json  # strict TypeScript check — no errors
```

## Findings

1. **Human sprites looked like “only heads”**
   - The renderer was using blocky procedural walk frames for all settlers.
   - Detailed PNG sprites (`human_male.png`, `human_female.png`) existed but were not preloaded or rendered.

2. **Sprite style suddenly switched while playing**
   - After a partial fix, idle settlers showed the nice PNG but moving settlers still switched back to procedural frames, creating a jarring “correct → very general” effect.

3. **Settlers were gigantic compared to the world**
   - `HUMAN_DRAW_SCALE = 5.5` and `HUMAN_SPRITE_HEIGHT_MULT = 3.2` made humans tower over houses and trees.

4. **Clicking a settler did not select them**
   - Selection used the human collision radius (`size = 10`), while the rendered sprite was forced to a much larger screen height, so clicks on the head/torso missed.

5. **Houses showed a “+ Assign worker” button**
   - Houses are residences, not production buildings, yet the UI allowed assigning workers to them and produced confusing “Worker Assigned → House” notifications.

6. **Game speed options above 2x felt ineffective**
   - The base simulation rate was `1 tick/sec`, so even 5x was only 5 ticks/sec. With large populations the CPU could not keep up, making 3x/5x feel no faster than 2x.

7. **Large populations (450 humans) caused severe lag**
   - `gameTick` processed every human every tick, including expensive pathfinding, hunting, farm scanning, courtship, and social scanning.
   - Rendering already culled off-screen humans; the bottleneck was simulation, not drawing.

8. **Population growth was unchecked**
   - Women could get pregnant from age 16 up to age 119, causing exponential growth on a small map.

9. **Everyone died at exactly 200 days**
   - Death was a hard `if (age >= maxAge)` check, so all settlers dropped dead at the same age with no variety.

10. **Names bugged — everyone was John/Mary Smith**
    - `initGame()` created the world before `loadNames()` finished fetching the text files, so all fallback defaults were used. Existing saves kept the bad names.

11. **Trade routes gave free resources**
    - `updateTradeRoutes()` added received goods but never deducted the `resourcesGiven` cost, so routes were free income.

12. **Reputation was too hard to earn**
    - With only Hospital/TownHall generating slow passive rep and scandals draining it, players could build everything and still be stuck at low reputation.

## Fixes Applied

| Area | Change | Files |
|------|--------|-------|
| Preload human PNGs | Added `/sprites/human_male.png` and `/sprites/human_female.png` to the preload list. | `app/src/game/spriteLoader.ts` |
| Render PNGs always | Settlers now render the full-body gender PNG for both idle and moving states, with a small walk bob. Procedural frames remain only as a fallback if the PNG is not loaded. | `app/src/game/renderer.ts` |
| Scale humans to world | Reduced `HUMAN_DRAW_SCALE` (5.5 → 2.8), `HUMAN_SPRITE_HEIGHT_MULT` (3.2 → 2.5), and `HUMAN_MIN_SCREEN_PX` (80 → 55). | `app/src/game/humanSprites.ts` |
| Click selection | Added `getHumanSelectionBounds()` using the actual rendered sprite bounds and PNG aspect ratio (`27/72`). | `app/src/game/humanSprites.ts`, `app/src/App.tsx` |
| Culling | Updated human cull padding to use the real sprite height so settlers near screen edges are not clipped. | `app/src/game/renderer.ts` |
| House worker confusion | Hid the worker section for housing buildings in the selected-building panel and added a guard in `assignIdleWorkerToBuilding()` so houses/mansions cannot receive assigned workers. | `app/src/App.tsx`, `app/src/game/gameEngine.ts` |
| Shared constants | Moved human sizing constants to `humanSprites.ts` so renderer and input handling stay in sync. | `app/src/game/humanSprites.ts`, `app/src/game/renderer.ts` |
| Game speed | Doubled `BASE_TICKS_PER_SECOND` (`1` → `2`) and added a `10x` speed option. | `app/src/game/gameLoop.ts`, `app/src/App.tsx` |
| Population performance | Added `SimulationFocus`: off-screen humans run full AI/movement only every 5th tick; on other ticks they still age, eat, work, reproduce, and die, but skip pathfinding/hunting/social movement. Pregnant humans always run full AI. | `app/src/game/gameEngine.ts`, `app/src/game/gameLoop.ts` |
| Fertility decline | Added `getFemaleFertility()`: women are fully fertile 16–35, fertility declines 35–50, and infertility after 50. Applied to both married and affair pregnancies. | `app/src/game/dayCycle.ts`, `app/src/game/gameEngine.ts` |
| Varied lifespans | Replaced hard max-age death with `getOldAgeDeathChance()`: no death before 60, rising chance 60–95, guaranteed by 95. Added a small daily illness/accident chance for adults. | `app/src/game/dayCycle.ts`, `app/src/game/gameEngine.ts` |
| Names bug | Moved name lists into `src/game/data/` and load them synchronously via dynamic `?raw` imports. Added `fixDefaultNames()` to repair John/Mary/Smith defaults in existing saves. Trimmed last-names list from 88k to 5k entries to keep bundle size reasonable. | `app/src/game/nameLoader.ts`, `app/src/game/data/`, `app/src/App.tsx` |
| Trade routes | Fixed `updateTradeRoutes()` to deduct `resourcesGiven` each production tick. If the village can't pay the trade cost, the route stalls with a warning. | `app/src/game/gameEngine.ts` |
| Reputation sources | Added reputation gains: +2 per completed building, +10 when a festival starts, +3 per completed research. | `app/src/game/gameEngine.ts` |

## Notes

- Houses provide shelter automatically via `residenceBuildingId` / `assignMissingResidences()`. Workers should be assigned to production buildings (Farm, Lumber Mill, Quarry, Blacksmith, Store, etc.).
- The lint error about unused `_variant` in `getHumanWalkSheetPath()` was also fixed by making the function return the variant-specific walk sheet path.
- Removed an unused `BUILDING_CONFIGS` import in `app/scripts/simulate-30min.ts` to keep lint clean.

---

## July 4, 2026 — Lint hygiene (v0.4.2)

```bash
cd D:\Kimi_Agent_Update_Building_Background_Colors\app
npm run build   # pass
npm run lint    # 0 errors (2 pre-existing react-hooks/exhaustive-deps warnings)
```

| Issue | Fix |
|-------|-----|
| Unused `countByType` in `simulate-30min.ts` | Removed dead helper |
| `setInspectorCollapsed` in `useEffect` (`react-hooks/set-state-in-effect`) | Auto-expand now in `focusCampOnMap` + `handleCanvasClick` selection paths |

**Sanity sim:** 72,000 ticks (~8 game years), ~557 entities — avg **1.81 ms/tick**, p95 **4.83 ms/tick**, no crashes.

---

## July 4, 2026 — P1 defense & combat log (v0.4.2)

| Area | Shipped |
|------|---------|
| Defense buildings | Wall, Wall Corner, Wall Gate, Watchtower, Barracks (`gameTypes.ts`, `defenseStructures.ts`) |
| Combat integration | Barricade + militia bonuses in `frontierCombat.ts`; iron replaces stone in preview breakdown |
| Guard patrols | Barracks guards orbit village anchor during work hours (`lifeSimulation.ts`) |
| UI | Defense build category; `CombatLogPanel` (Log → Combat); barracks manual-staff hints |
| Map | Raid march lines (`drawRaidMarchLines` in `renderer.ts`); 🪖 guard icon |
| Sprites | `wall_straight`, `wall_corner`, `wall_gate`, `watchtower`, `barracks` → `app/public/sprites/` |

`npm run build` + `npm run lint` — pass (0 errors).
