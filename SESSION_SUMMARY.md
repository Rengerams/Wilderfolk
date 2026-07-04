# Wilderfolk — Session Summary

**Project:** `D:\Kimi_Agent_Update_Building_Background_Colors`  
**Current version:** Early Alpha **v0.4.2 shipped** (`GAME_VERSION = '0.4.2'`, July 5, 2026) · Next **v0.4.3** (Sep 2026)  
**Stack:** React + TypeScript + Vite + Canvas 2D  
**Last updated:** 2026-07-05

Single consolidated log. See also [SESSION_SUMMARY_fixes.md](SESSION_SUMMARY_fixes.md) for detailed fix notes from June 2026 sprite pass.

| Doc | Purpose |
|-----|---------|
| [README.md](README.md) | Landing page, what's in v0.4 |
| [app/README.md](app/README.md) | Player guide |
| [TECHNICAL.md](TECHNICAL.md) | Architecture & file map |
| [ROADMAP.md](ROADMAP.md) | Plan, half-done registry, backlog |
| [app/CHANGELOG.md](app/CHANGELOG.md) | Detailed change log by feature |

---

## North star

Ship a cozy frontier eco-sim where settlers live on a schedule, the food chain matters, and the valley feels alive — **without asking players to touch a terminal**.

**Winning moment for a new player:** *"I built a house, assigned workers, didn't kill all the wolves, and everyone came home at night."*

---

## Timeline

### June 21 — Early alpha foundation

**Goal:** Take the ecosystem settlement sim from prototype toward a playtestable early alpha.

| Area | What shipped |
|------|----------------|
| **Branding** | `GAME_PHASE = 'Early Alpha'`; badges in header, intro, Guide |
| **Humans** | Movement fixes (no ice-skating); procedural 4-frame walk sheets (`humanSprites.ts`) |
| **Social** | Speech bubbles (`humanChat.ts`); day/night schedule (`dayCycle.ts`) — 24 ticks = 1 day |
| **Housing** | `residenceBuildingId` for sleep; `homeBuildingId` = workplace (legacy name) |
| **World** | Visitor caravans + rival camps (`groupEvents.ts`); Moon Howlers + Church cure |
| **UX** | Collapsible build panel, Inspector, Guide tab, `IntroScreen.tsx` |
| **Audio** | Procedural music/SFX rewrite; `beginAudio()` unlock on user gesture; mute persists |
| **Docs** | `README.md`, `app/README.md`, `TECHNICAL.md`, `ROADMAP.md` split |
| **Dev** | Root `package.json` — `npm start` / `npm run build` from repo root |

**Assessment (end of day):** ~6.5/10 playtest alpha — strong vision, polish still catching up.

---

### June 24 — v2.2 playtest pass (session eecca284)

| Item | Change |
|------|--------|
| **First-night tutorial** | Quick Start warns build House before tick 24; amber banner ticks 18–30 |
| **Save migration** | `GAME_VERSION` → `2.2`; calendar normalization on load |
| **Terrain placement** | Block water, mountains, snow; allow grass, forest, hills, etc. |
| **Victory scope** | Goals tab: Eco-Utopia + Great City active; Trade + Harmony "coming soon" |
| **Balance** | Starting food 530; 1 wolf; `foodSpoilageRate` 0.03 |
| **Human sprites** | PNG preload; idle = static PNG, moving = walk frames |
| **Desktop** | `desktop:note` stub only (no full Tauri yet) |

**Build:** `npm run build` + `npm run lint` — pass.

---

### June 24 — Sprite & interaction fixes

| Problem | Fix |
|---------|-----|
| Humans looked like "only heads" | Full-body PNG for idle + moving; procedural fallback only |
| Style switched while walking | Same PNG path for both states |
| Settlers gigantic vs world | Reduced `HUMAN_DRAW_SCALE`, `HUMAN_SPRITE_HEIGHT_MULT`, `HUMAN_MIN_SCREEN_PX` |
| Clicks missed settlers | `getHumanSelectionBounds()` from real sprite bounds |
| Houses showed "+ Worker" | Hidden for residences; guard in `assignIdleWorkerToBuilding()` |
| Speed 3x/5x felt weak | Added 10x speed option (`SPEED_OPTIONS` in `App.tsx`) |

**Files:** `humanSprites.ts`, `renderer.ts`, `spriteLoader.ts`, `App.tsx`, `gameEngine.ts`, `gameLoop.ts`

---

### June 25 — Event log overhaul + Prison building + terrain fix

| Area | Change |
|------|--------|
| **Event log storage** | Removed the 500-entry cap; the save now keeps **all** events forever |
| **Event log UI** | In-game panel still shows the latest 500 for performance; footer shows total stored count |
| **Event log exports** | Added **.json** and **.csv** raw-data exports alongside the existing readable **.txt** chronicle; exports include the full history |
| **Prison building** | New Community building (unlocks with Architecture research); uses custom `jail.png` sprite; requires a manually assigned **Guard** |
| **Arrests** | Caught adulterers can be arrested and sentenced to 2.5–6 in-game days per staffed Prison |
| **Prisoners** | Can't work, move, have affairs, or be reassigned while imprisoned; released automatically when sentence ends |
| **Prison UI** | Prison panel lists current prisoners + days left; entity panel shows imprisonment status; population badge/overview show "jailed" count |
| **Terrain rendering** | Fixed terrain cache size mismatch that made maps look "mangled" and blurry; tiles now render 1:1 with the world grid |
| **Terrain presets** | Increased differences between Verdant / Mountainous / Coastal / Arid / Harsh so maps actually look distinct |

**Build:** `npm run build` + `npm run lint` — pass.

---

### June 24 → v0.4 — Playtest & logic audit (multi-session)

Major gameplay fixes from extended playtesting (~200 pop sims, 30-min runs):

| Area | Fixes |
|------|-------|
| **Buildings** | Falsy `buildingId === 0` checks → `hasWorkAssignment` / `hasResidenceAssignment` |
| **Food** | Meals at 8am & 6pm only; pregnancy 5 days / cooldown 8 days |
| **Workshop** | Recipes, staffing, calendar timers, challenge AND logic |
| **Town Hall** | `architecture_2` unlock chain; research sync on load; Community tab first |
| **Housing** | Cap 6 slots; Expand (+2); family stays with parents; mansion 8 |
| **Commute** | Worker snap at 7am/7pm + distance-scaled rush |
| **Event log** | 500 cap; scrollable Log tab; filters, copy, Download .txt; export on Save |
| **Purpose UX** | `focusHints.ts`, `FocusPanel.tsx`; guide + diplomacy button updates |
| **Weapons** | Defense research + Blacksmith for iron; armament checklist in Village tab |
| **Rivals** | Basic diplomacy: gift, trade pact, show strength (`groupEvents.ts`) |
| **Other** | Demolish completed houses; married-to label; barn vs silo clarity |

**Sims:** `npm run simulate:30min` from repo root.

---

### July 4, 2026 — v0.4.1 shipped

| Area | What shipped |
|------|----------------|
| **Tribes** | Diplomacy v2, visitor trade/refugees, peace treaties, visitor leader talk |
| **Combat** | Frontier raids MVP, combat preview, distance-scaled provisions, home-turf +25% |
| **Victory** | Trade Empire + Harmony active; Silkmarket route |
| **Leadership** | Merit elections (founding, decennial, succession) |
| **Docs** | `GAME_VERSION` 0.4.1, save migration, in-game Roadmap tab |

**Build:** `npm run build` + `npm run lint` — pass.

---

### July 2026 — v0.4.2 feature work (shipped July 5)

| Area | What shipped |
|------|----------------|
| **UI/UX** | 6-tab sidebar, `AlertBar`, `BuildHotbar`, `FrontierPanel`, `ChallengesPanel`, tab hotkeys, focus Go → |
| **Forge** | `villageForge` queue — iron spears/shields need staffed Blacksmith forge run |
| **Raids** | Distance-scaled deadline (2–6 days), slower distant war-band march, UI deadline copy |
| **Perf** | Off-screen throttles, `entityById`/`buildingById`, wildlife `byType`, `wildlifeCounts`, UI memo |
| **Benchmark** | `simulate:30min` ms/tick metrics; `combatTech.ts` breaks circular import |

**P1 defense & combat (July 4):** walls/towers/barracks, guard patrols, `CombatLogPanel`, raid march lines, defense sprites.

**P2 polish (July 4):** road/wall/gate rotation (`buildingRotation.ts`, **R** key); juice pass (`juiceEffects.ts` — night glow, build confetti, sprite pop); camera nudge (`nudgeCameraToward` in `viewState.ts`); intro screen refine (`IntroScreen.tsx` — ~20s timeline, skip after logo).

### July 5, 2026 — v0.4.2 shipped

| Area | Shipped |
|------|---------|
| **Version** | `GAME_VERSION` 0.4.2, save migration, package.json |
| **Balance** | 10-year town PASS (9/9 gates) |
| **Playtests** | 10-user beta — `app/docs/PLAYTEST_BETA_10_USERS.md` |
| **Beta UX** | Eco breakdown, growth report, Frontier readiness, juice toggle, raid-prep copy |
| **Docs** | CHANGELOG `[0.4.2]`, README, ROADMAP, `roadmapContent.ts` → target v0.4.3 |

---

### July 4, 2026 — Sanity check + lint hygiene

| Check | Result |
|-------|--------|
| `npm run build` | Pass |
| `npm run lint` | **0 errors** (2 pre-existing `world` dep warnings) |
| Headless sim (72k ticks) | Pass — avg **1.81 ms/tick**, ~557 entities, ~8 game years |

**Lint fixes:** removed unused `countByType` in `simulate-30min.ts`; inspector auto-expand moved from `useEffect` to selection handlers in `App.tsx`.

---

### July 4, 2026 — Comprehensive bug-fix pass (~40 fixes)

Four code-review rounds across `app/src/` (game, components, `App.tsx`). Full table in [app/CHANGELOG.md](app/CHANGELOG.md) → **Bug fixes — comprehensive pass**.

| Round | Focus | Highlights |
|-------|-------|------------|
| **1** | Core sim + loop | Map setup GameLoop sync; faction ages; double aging; winter heating; prison demolish; challenges/eco timing; placement; raid defend; guard constant |
| **2** | Frontier + economy | Diplomacy event loss; peace vs raids; rival pop; workshop gold cap; `great_city`; victory buildings; prison ghost workers; eco health |
| **3** | Calendar + save | Eco 24×/year; age display; raid tick timing; save year sync; trade storage cap; forge tick; leadership XP |
| **4** | Visitors + stats | Refugees killed on departure; pop-cap food charge; save migrations; stats births/disasters; diplomacy/trade/forge UI feedback; moon howler hunt leak |

**Verification (`/check-work`):**

| Check | Result |
|-------|--------|
| `npm run build` | Pass |
| `npm run lint` | **0 errors** (3 pre-existing hook warnings in `App.tsx`) |
| `npm run simulate` | Pass |
| `npm run simulate:30min` | Pass (~102s) |

**Post-check-work fixes:** `getAgeInYears(entity)` signature cleanup; yearly `humanBirths` uses `birthYear === state.year`.

---

### June 24 — Code cleanup (hygiene only)

No intended gameplay changes. See [app/CHANGELOG.md](app/CHANGELOG.md) for detail.

| Change | Files |
|--------|-------|
| Shared event log module | **New** `eventLog.ts` — `logEvent`, `EVENT_LOG_MAX`, `syncEventLogIdFromState` |
| Deduped visitor/rival logging | `groupEvents.ts` dropped `pushLog` / `logSeq` |
| Victory constants together | `COMING_SOON_VICTORY_PATHS` moved to `victory.ts` |
| Consolidated imports | `App.tsx` combat helpers via `gameEngine` re-exports |

**Deferred:** split `gameEngine.ts` (~3,700 lines); unify `pushNews`/`addBigNews`; prune unused shadcn UI scaffold.

---

## Key source files

| File | Role |
|------|------|
| `app/src/game/gameEngine.ts` | Tick loop, save/load, build, research, tame |
| `app/src/game/dayCycle.ts` | Calendar, housing, families, commute |
| `app/src/game/groupEvents.ts` | Visitors, rivals, diplomacy, world events |
| `app/src/game/combat.ts` | Weapons, armament checklist |
| `app/src/game/forge.ts` | Blacksmith forge queue, `villageForge` |
| `app/src/game/frontierCombat.ts` | Raids, combat preview, distance-scaled deadline |
| `app/src/game/defenseStructures.ts` | Wall/tower/barracks defense bonuses |
| `app/src/game/buildingRotation.ts` | Road/wall/gate footprint swap; R key while placing |
| `app/src/game/juiceEffects.ts` | Night glow helpers, build-complete confetti |
| `app/src/game/viewState.ts` | `nudgeCameraToward()` — 28% pan on map select |
| `app/src/game/IntroScreen.tsx` | ~20s opening sequence before village setup |
| `app/src/components/CombatLogPanel.tsx` | Combat chronicle sub-tab |
| `app/src/game/priorityAlerts.ts` | Clickable priority alert strip |
| `app/scripts/simulate-30min.ts` | Headless sim + perf metrics |
| `app/src/game/victory.ts` | Victory paths (active + coming soon) |
| `app/src/game/eventLog.ts` | Shared event log helpers (no storage cap) |
| `app/src/game/eventLogExport.ts` | `.txt`, `.json`, `.csv` chronicle exporters |
| `app/src/game/focusHints.ts` | "What to do next" hints |
| `app/src/game/EventLogPanel.tsx` | Chronicle UI with full-history exports |
| `app/public/sprites/prison.png` | Custom Prison building sprite |
| `app/src/game/humanSprites.ts` | Human sizing, selection bounds, sprites |
| `app/src/game/renderer.ts` | Draw pass, building pads, bubbles |
| `app/src/App.tsx` | Main UI shell (~2,500 lines) |
| `app/src/audio/` | Procedural music, SFX, unlock flow |

---

## Build status

```bash
cd D:\Kimi_Agent_Update_Building_Background_Colors
npm start              # dev server → http://127.0.0.1:5173
npm run build          # tsc + vite — passes
npm run lint           # ESLint — 0 errors, 3 hook warnings (July 2026)
npm run simulate:30min # headless sim — env SIM_MINUTES, PERF_SAMPLE_EVERY
```

---

## Architecture notes

- `homeBuildingId` = **workplace**; `residenceBuildingId` = house/mansion for sleep
- `RenderSnapshot` separates sim from view; renderer is read-only
- Save versions: `COMPATIBLE_SAVE_VERSIONS` includes `2.0`–`2.2`, `0.4`, `0.4.1`, `0.4.2`
- Multiplayer later: `faction`, `groupId` on entities prototyped for visitors/rivals
- Iron spears/shields need Defense research **and** `villageForge` forge run at staffed Blacksmith
- Event log uncapped in saves; UI shows latest 500 entries

---

## What's not done (see ROADMAP)

Half-done items tracked in [ROADMAP.md](ROADMAP.md) with FINISH / CUT / DEFER rule. **v0.4.2 remaining:**

- ~~10-year balance pass~~ **Done** (2026-07-04) · ~~external playtests~~ **Done** · ~~v0.4.2 ship~~ **Done** (2026-07-05)
- Version bump to `0.4.2` + save migration on ship
- Perf Phase 1 (spatial grid) → **v0.4.3** Sep 2026 (not a v0.4.2 ship blocker)
- Desktop installer (Tauri/Electron) — post-alpha

---

<p align="center"><em>Consolidated summary · Early Alpha v0.4.2 shipped · July 2026</em></p>