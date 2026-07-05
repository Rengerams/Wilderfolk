# Changelog

## [Unreleased]

**Targeting v0.5.0** (end July 2026) — see [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md).

### Added
- **Election day ceremony** (`villageLeadership.ts`) — founding **first male** leads until Year 10; merit elections every 10 years; leader death → election **2 years later** (no instant succession); ceremony phases gather → gossip → tension → reveal + 3-day *Election Revelry* festival
- **Election buildup** — year-before notification (`tickElectionBuildup`); ongoing settler gossip during buildup, election year, and ceremony (`tickElectionGossip`)
- **Incumbent always runs** — `getElectionRaceCandidates()` keeps sitting head in race lineup, gossip, and Leadership standings even when merit rank drops below top 4
- **Incumbent record score** — modest election bonus/penalty for sitting head only: economy (+4/−5), clean record (+3) vs scandals (−5 each), village health (+3/−6); **+8 positive cap** so high-merit challengers can still win; penalties uncapped
- **Leadership UI** — `VillageLeadershipPanel` shows record breakdown; standings show record modifier; tutorial + focus hints updated

### Planned
- **P0** — spatial grid, dead-entity compaction, renderer cache reuse, settler count denorm, benchmark gate; incremental `entityById`, `buildingActions` scan cleanup, grass buckets, App tab split, pooling; Web Worker `gameTick`, OffscreenCanvas terrain/entity layers; big bug checkup; logical invariant checks; `npm run simulate:20year` gatekeeper; simulation battery; `GAME_VERSION` **0.5.0** + save migration
- **P1** — election playtest at Year 10/20; counter-raid militia march visuals; large-map playtests; reputation arc UI; footstep SFX; one visitor quest chain; `npm run benchmark:gate`

## [0.4.2] - 2026-07-05

**Early Alpha v0.4.2** — 6-tab UI, Blacksmith forge, walls/towers/barracks, frontier raid prep UX, 10-year balance pass, 10-user beta playtest. `GAME_VERSION` and save format bumped; `0.4.1` saves migrate on load.

### Added

#### Beta playtest follow-up (July 5, 2026)
- **Raid prep copy** — raids test preparation, not a battle screen (`RAID_PREPARATION_HINT`, Frontier readiness card, README)
- **Eco breakdown** — Nature tab “Why this score” (`ecoBreakdown.ts`)
- **Population growth report** — Village tab cap/food/rep messaging (`populationGrowth.ts`)
- **Rival labels** — “Distant camp” when on-map pop is 0 (`rivalDisplay.ts`)
- **Juice toggle** — Game menu ✨ Juice on/off (confetti, camera nudge, night glow)
- **Chronicle / combat log** — death filter hints; larger combat log text

### UI / UX overhaul (settlement-sim patterns)

Inspired by **RimWorld** (priority alerts, contextual inspector), **Banished** (bottom build hotbar), and **Frostpunk** (resource urgency). Goal: lower cognitive load, faster routing to urgent issues, map stays visible while building.

- **`AlertBar`** — clickable priority strip under header (raids, diplomacy, low food, shelter warning, trade ready, active challenge); capped at 4 alerts (`priorityAlerts.ts`, `AlertBar.tsx`).
- **`BuildHotbar`** — Banished-style bottom map strip: House, Farm, Lumber Mill, Quarry, Well, Road with hotkey badges (`BuildHotbar.tsx`).
- **`GameMenu`** — ☰ header menu for save, load, auto-save, audio, reset (`GameMenu.tsx`).
- **`FrontierPanel`** — visitors, rivals, raids moved out of overcrowded Village tab (`FrontierPanel.tsx`).
- **`ChallengesPanel`** — daily challenges under Progress → Goals (`ChallengesPanel.tsx`).
- **`CollapsibleSection`** — reusable accordion for dense sidebar panels (`CollapsibleSection.tsx`).
- **Tab hotkeys** — `V` Village · `F` Frontier · `N` Nature · `P` Progress · `L` Log · `M` More.
- **Focus hint actions** — `Go →` buttons on key hints (open Goals, Frontier, Trade, Research, build house/farm) (`focusHints.ts`, `FocusPanel.tsx`).
- **Progress subnav badges** — amber dot when research active; cyan count when trade routes are ready to establish.
- **Frontier tab badge** — count of pending raids + diplomacy events on sidebar tab.

#### Changed
- **Sidebar tabs** — 8 → **6**: Village, Frontier, Nature, Progress (Research / Trade / Goals sub-tabs), Log, More (Guide / Roadmap sub-tabs).
- **Inspector** — collapsible; auto-expands when you click the map; slimmer when collapsed.
- **Header** — save/audio/reset moved into ☰ menu; food badge **pulses** when critically low.
- **Village tab** — decluttered: focus hints, population, leadership, armament only (frontier/diplomacy → Frontier; challenges → Progress → Goals).
- **Collapsed build rail** — duplicate quick-build buttons removed; bottom hotbar handles common placement; collapsed left rail = grid toggle, cancel (when placing), expand full catalog (`B`).
- **Right sidebar** — widened to `22rem` for readability.
- **In-game Guide** — Interface Overview and Controls updated for new layout, alert strip, hotbar, and tab hotkeys.

#### Blacksmith forge / visible crafting queue
- **`villageForge` state** — iron spears & shields require Defense research **and** a staffed Blacksmith forge run (`forge.ts`).
- **Forge orders** — Iron Spears (35🪵 25🪨 40💰) · Iron Shields (40🪵 30🪨 45💰); ~6 in-game days with staffed smith; progress bar + map float text.
- **`BlacksmithForgePanel`** — queue orders in Blacksmith inspector; armament checklist shows forge %.
- **Save migration** — existing saves with iron tech + Blacksmith keep forged status; new games must forge.
- **Combat** — `hasIronSpears` / `hasIronShields` now require `villageForge.spearsReady` / `shieldsReady`.
- **Forge UX polish** — `AlertBar` + focus hints jump to Blacksmith (`focus_building`); “Forge paused” when unstaffed; research complete notification says **queue forge** (not “armament upgraded”); Armament checklist **Open Blacksmith →** buttons; Defense/Iron copy updated.

#### UX polish (first-priority follow-up)
- **Quick Start tutorial** — 5 steps: bottom hotbar, alerts, tab hotkeys, `?` shortcuts overlay
- **Header ⭐ reputation badge** — clickable tooltip; opens Progress → Trade
- **Focus hints** — **Go →** on challenges, victory paths, visitors, rivals, elections, armament, research
- **Progress tab badge** — trade-ready count or research dot on main sidebar tab
- **Frontier raid button** — `🏹 Raid` on each rival card in Frontier tab (`canLaunchRaidOnRival`)
- **Pay-off vs counter-raid hint** — combat preview when tribute &lt; march provisions
- **Roads + armament copy** — Infra category hint in build catalog; armament explainer in Village tab
- **`?` keyboard overlay** — full shortcut reference (ESC to close)

#### Performance (simulation + UI)
- **Duplicate work removed** — `byType` built once per tick; entity array compacted in one pass (no triple `.filter()`).
- **Off-screen throttling** — humans every 8 ticks; wildlife AI every 8 ticks; grass growth/repro every 4 ticks off-screen. Viewport entities still run full sim every tick (`OFFSCREEN_HUMAN_THROTTLE`, `OFFSCREEN_WILDLIFE_THROTTLE`, `OFFSCREEN_GRASS_THROTTLE`).
- **O(1) lookups** — per-tick `entityById` and `buildingById` maps for hunt targets, prison, tamed-owner resolution.
- **Wildlife simulation** — `tickWildlife` iterates `byType` buckets instead of all `state.entities`; predator list hoisted once per tick for flee logic.
- **Denormalized counts** — `world.wildlifeCounts` updated each tick; Nature tab reads counts without scanning entities (`entityCounts.ts`).
- **React UI** — single-pass `villageStats`; narrowed `priorityAlerts` memo deps; `React.memo` on `WildlifeBar`, `StatBadge`, `FrontierPanel`, `ChallengesPanel`.
- **Headless benchmark** — `simulate:30min` logs avg/p50/p95/max ms per tick + entity samples (`SIM_MINUTES`, `PERF_SAMPLE_EVERY` env vars).
- **Module fix** — `combatTech.ts` extracts `COMBAT_TECH` to break forge ↔ combat circular import (headless sim runner).
- **Event log unchanged** — full chronicle kept in saves (no cap).

#### Technical (new / touched files)
- `app/src/game/priorityAlerts.ts` — alert derivation + click routing actions
- `app/src/components/AlertBar.tsx`, `BuildHotbar.tsx`, `GameMenu.tsx`, `FrontierPanel.tsx`, `ChallengesPanel.tsx`, `CollapsibleSection.tsx`
- `app/src/App.tsx`, `app/src/App.css` — shell wiring, sidebar tab grid, progress subnav styles
- `app/src/game/focusHints.ts`, `app/src/game/FocusPanel.tsx` — actionable hints
- `app/src/game/frontierCombat.ts` — `canLaunchRaidOnRival()`
- `app/src/game/entityCounts.ts`, `app/src/game/combatTech.ts` — wildlife counts helper; combat tech constants
- `app/src/game/gameEngine.ts`, `app/src/game/lifeSimulation.ts` — tick perf (maps, throttles, wildlife loop)
- `app/scripts/simulate-30min.ts` — perf metrics output
- `app/README.md`, `TECHNICAL.md`, `roadmapContent.ts` — player + dev docs

#### Future performance optimizations (not yet implemented)

| Phase | Version | Finish by |
|-------|---------|-----------|
| All open perf + UI + architecture | **v0.5.0** | End July 2026 |

- **v0.5.0 (consolidated):** spatial grid, compaction, benchmark gate, incremental maps, `buildingActions` cleanup, grass buckets, App tab split, pooling, Web Worker `gameTick`, OffscreenCanvas layers — see [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md).

#### Frontier raid polish
- **Distance-scaled raid deadline** — incoming raids get **2–6 days** to respond based on camp distance (`expiresAtTick`, `marchDistanceTiles` on `RaidEvent`).
- **War-band march speed** — rival settlers march slower from farther camps (`lifeSimulation.ts`).
- **UI** — banner, alerts, Frontier/Village tabs show `formatRaidDeadline`; save migration backfills old raids.

#### Fixed / hygiene (July 2026)
- **Lint** — removed unused `countByType` in `simulate-30min.ts`; inspector auto-expand moved from `useEffect` into map selection handlers (`focusCampOnMap`, `handleCanvasClick`); `IntroScreen` `useRef` init — `npm run lint` → **0 errors** (3 pre-existing hook warnings in `App.tsx`).
- **Sanity check** — `npm run build` pass; headless 72k-tick sim (~8 game years, ~557 entities): avg **1.81 ms/tick**, p95 **4.83 ms/tick**; `simulate:30min` pass; `/check-work` PASS (July 4, 2026).
- **Docs sync** — all project `*.md` files + `roadmapContent.ts` aligned with v0.4.2 status (July 4, 2026).

#### P1 defense & combat log (July 2026)
- **Defense buildings** — Wall, Wall Corner, Wall Gate (+8 barricade/segment, cap +72), Watchtower (+15), Barracks (manual Guards, +12 militia each); unlocked via Fortification / Stone Spears research.
- **Guard patrols** — staffed Barracks guards orbit the village core during work hours; 🪖 icon on map.
- **Combat log panel** — Log tab **Combat** sub-tab with raid stats and .txt/.json/.csv export.
- **Raid map overlay** — dashed red march lines from rival camp to village when raids are pending.
- **Sprites** — `barracks`, `watchtower`, `wall_straight`, `wall_corner`, `wall_gate` processed to RGBA.
- **Spear tiers** — combat preview breakdown aligned with militia math: iron replaces stone (not stacked).

#### Juice pass (July 2026)
- **Night glow** — warm windows + chimney ember/smoke on houses/mansions when residents are home; staffed Church/Blacksmith/Hospital get door glow.
- **Build complete** — confetti burst (stars/sparkles), `✨ Built!` float text, sprite scale pop, screen shake.
- **Camera nudge** — clicking settlers/buildings gently pans the camera toward them (28% lerp).

#### Road rotation (July 2026)
- **R key** while placing rotates Road, Wall, and Wall Gate horizontal ↔ vertical.

#### Intro screen refine (July 2026)
- **`IntroScreen.tsx`** — ~20s unhurried timeline (aurora → logo → title → subtitle → hook → food chain → ready).
- **Skip** — click or press any key after the logo appears to jump to village setup.
- **Progress bar** — subtle fill along the bottom during the opening beat.
- **No hidden pops** — sections fade in on schedule instead of toggling `hidden` mid-animation.
- **`App.css`** — slower intro keyframes (`intro-*` classes) for logo float, chain reveal, aurora drift.

#### Spear / militia balance (July 2026)
- **`militiaBalance.ts`** — single source for militia & barricade strength; tuned constants (`MILITIA_BALANCE`).
- **Iron replaces stone** spears (×1.52, not stacked on ×1.3).
- **Iron replaces wooden** shields (+9/adult, not +9+4).
- **Barracks guards** — +14 per staffed guard (was +12).
- **Barricade fix** — `respondToRaidEvent` barricade now uses `getBarricadeStrength` (walls/towers were missing in resolve).
- **Combat preview** — armament label, tier hint, breakdown matches resolve math.
- **`npm run balance:militia`** — scenario table for playtest review.

#### Bug fixes — comprehensive pass (July 4, 2026)

Four code-review rounds (~40 fixes). Verified: `npm run build`, `npm run lint` (0 errors), `npm run simulate`, `npm run simulate:30min`, `/check-work` PASS.

##### P0 — Critical
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Map setup / GameLoop desync | `App.tsx` | New game from map setup never called `setSession`; sim ran throwaway world while setup open |
| Faction human ages | `groupEvents.ts` | Visitors/rivals spawned at ~7k–14k “days”; died instantly vs 400-day lifespan cap |
| Welcomed refugees killed on departure | `groupEvents.ts` | Admitted settlers stayed in `group.entityIds`; camp leave set `alive = false` for all IDs |
| Eco Master 24× per year | `gameEngine.ts` | `ecoHealthYearsAbove80` incremented every tick of calendar day 0 (~24×/year) |

##### P1 — High
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Off-screen double aging | `lifeSimulation.ts` | Inactive humans aged twice per calendar day |
| Winter heating | `gameEngine.ts` | Wood cost counted visitors/rivals, not player settlers only |
| Prison demolish | `buildingActions.ts` | Demolishing prison left `prisonBuildingId` / prisoners stuck |
| Challenge timing | `gameEngine.ts`, `challengeProgress.ts` | `eco_master` / year challenges evaluated before year rollover + eco streak update |
| `growing_village` UI | `challengeProgress.ts` | Progress showed year only, not building requirement |
| `great_city` challenge | `gameTypes.ts`, `saveLoad.ts` | Missing `targetBuildings: 20` — completed at 100 pop alone |
| Diplomacy event loss | `groupEvents.ts` | Failed choices (insufficient resources) still removed pending event |
| Peace vs active raids | `groupEvents.ts`, `frontierCombat.ts` | Peace treaty did not cancel in-flight `pendingRaidEvents` |
| Rival raid strength | `groupEvents.ts` | `rival.population` never decremented on deaths; strength stayed inflated |
| Workshop at gold cap | `gameEngine.ts` | Consumed inputs when gold storage full |
| Trade at storage cap | `economy.ts` | Deducted exports when receives added 0 |
| Raid deadline lag | `gameEngine.ts` | `tickPendingRaidEvents` only on calendar-day ticks (up to ~24 tick delay) |
| Save year desync | `saveLoad.ts` | `year` from save could disagree with `tick`-derived calendar |
| Save migrations | `saveLoad.ts` | Missing defaults for `challenges`, `yearlyStats`, `lifetimeStats` on old saves |
| Refugee food at cap | `groupEvents.ts`, `App.tsx` | Welcome charged 40🍖 even when nobody could join |

##### P2 — Medium (UI, stats, edge cases)
| Fix | Files | What was wrong |
|-----|-------|----------------|
| Placement footprint | `buildingActions.ts`, `placementUtils.ts` | Center could be on-map while footprint extended off-map |
| Build ghost stale | `App.tsx` | Placement preview used stale React `world` instead of loop world |
| Raid defend no-op | `App.tsx`, `frontierCombat.ts` | Defend/payoff/barricade failed silently; buttons now disabled + float text |
| Guard bonus constant | `defenseStructures.ts` | Hardcoded ×12 vs `militiaBalance` ×14 |
| Rival diplomacy silent | `groupEvents.ts` | Gift/pact/militia/peace returned unchanged state with no feedback |
| Diplomacy banner UX | `groupEvents.ts`, `App.tsx` | `getDiplomacyChoiceEligibility()` — disable + tooltips in banner and rival inspector |
| Visitor trade silent | `groupEvents.ts` | Insufficient gold/food returned with no float text |
| Victory Great City buildings | `victory.ts` | Counted rival camp structures toward 50-building leg |
| Eco health penalty | `gameEngine.ts` | Rival/incomplete buildings lowered player eco score |
| Prison ghost workers | `lifeSimulation.ts`, `gameEngine.ts` | Imprisoned settlers kept job assignments; still counted as staffed |
| Forge queue silent | `forge.ts` | Blocked queue returned state with no notification |
| Forge production tick | `forge.ts` | Local midnight tick vs shared `isProductionTick` (7am) |
| Moon howler hunt leak | `moonHowler.ts`, `gameTypes.ts` | `huntTargetId` / `combatTicks` not cleared on revert |
| Age display | `worldGen.ts` | `getAgeInYears` used wrong birth-year math; pioneers now age 30/28 |
| Leadership experience | `villageLeadership.ts` | Day-based age treated as years; all adults maxed by day 60 |
| Yearly stats humans | `stats.ts` | Population history counted visitors/rivals |
| Yearly births stat | `stats.ts` | Broken ternary; now `birthYear === state.year` |
| `disastersSurvived` stat | `stats.ts`, `worldEvents.ts` | Was set to `state.year`, not disaster count |
| FrontierPanel | `FrontierPanel.tsx` | Fragile non-null assertion on pending raid lookup |
| IntroScreen lint | `IntroScreen.tsx` | `useRef(Date.now())` → init in `useEffect` |

##### Intentional (not changed)
- **School juvenile `age++`** at staffed school — accelerates childhood; not the off-screen duplicate bug.

### Ship checklist (closed)
- [x] 10-year balance pass — town PASS 2026-07-04 (`npm run simulate:10year`, 9/9 gates)
- [x] Spear / militia balance review (`militiaBalance.ts`, `balance:militia`)
- [x] External playtests — 10 sessions ([TECHNICAL.md](TECHNICAL.md#playtest-report))
- [x] `GAME_VERSION` **0.4.2** + `COMPATIBLE_SAVE_VERSIONS` migration
- [x] Docs + in-game Roadmap sync

## [0.4.1] - 2026-07-04

**Early Alpha v0.4.1** — tribes, raids, diplomacy, four victory paths, village leadership. `GAME_VERSION` and save format bumped; `0.4` saves migrate on load.

### Added
- Tribe diplomacy v2, frontier raids + combat preview, peace treaties, visitor leader talk
- Trade Empire + Harmony victories active; Silkmarket trade route
- Village head merit elections (founding election at start, decennial, succession on death) — *superseded in [Unreleased] by founding male + Year 10 ceremony + 2-year vacancy*
- In-game Roadmap tab, Nature grazing warning, Prison + Guard, chronicle export

## [0.4.1] - Village leadership & merit elections (2026-07-04)

*Historical — leadership rules superseded in **[Unreleased]** (founding male until Year 10, ceremony, 2-year vacancy, record score).*

### Added
- **Village head elections** (`villageLeadership.ts`) — merit score from job skills (×2), experience, Town Hall service (+15), married (+5); ties break on age, then entity id.
- **Founding election** at game start; **decennial elections** every 10 years (years 10, 20, …); **succession** on leader death or imprisonment.
- **State fields** — `villageLeaderId`, `leaderSinceYear`, `lastElectionYear` on `WorldState`; save migration in `saveLoad.ts`.
- **Village Leadership panel** — Village tab shows 👑 leader, years until next election, ranked candidates (`VillageLeadershipPanel.tsx`).
- **Map & UI** — 👑 on leader in header, map icon, Population panel, and entity inspector; focus hints mention leadership.

### Technical
- `tickDecennialElection` in `gameEngine.ts`; `validateVillageLeaderOnLoad` on load. *(Ceremony / vacancy flow → `villageLeadership.ts` in [Unreleased].)*

## [0.4.1] - Peace treaties, visitor leader talk & four victory paths (2026-07-04)

### Added
- **Peace treaties** — `signPeaceTreaty()` halts raids for 60 days (30💰 + 20🍖); `peaceTreatyDays` on rivals; `peace_treaty` diplomacy event choices; 🕊️ button in rival inspector; raids blocked while at peace (`isRivalAtPeace`, `frontierCombat.ts`).
- **Visitor leader talk** — `talkToVisitorLeader()` per caravan kind (traders, pilgrims, scholars, hunters, nomads, performers, refugees); `leaderTalked` on `VisitorGroup`; UI in visitor camp panel (`getVisitorLeaderTalkMeta`).
- **Trade Empire + Harmony victories** — moved to `ACTIVE_VICTORY_PATHS` (4 active paths in Goals tab); 5th trade route **Silkmarket** in `economy.ts`; `ensureFullTradeRoutes()` on load.

### Changed
- **Goals tab** — Eco-Utopia, Great City, Trade Empire, and Harmony all trackable; `COMING_SOON_VICTORY_PATHS` empty.

## [0.4.1] - Frontier raid balance & combat preview (2026-07-04)

### Added
- **Combat preview panel** (`CombatPreviewPanel.tsx`, `getCombatPreview()`) — militia breakdown, rival strength, defend/barricade/pay-off forecasts, and outgoing raid forecast in raid banner, Village tab, and rival inspector.
- **Distance to rival camps** — tiles from village anchor (Town Hall → House → settlers); shown in preview, Village tab rival list, incoming raid banner, and rival inspector.
- **Distance-scaled raid provisions** — `getOutgoingRaidFoodCost()` (22–50🍖 by march distance); raid button and preview show exact cost per rival.
- **Home-turf defense** — `getRivalDefenseStrength()` (+25% when you raid their camp); outgoing thresholds **≥135%** full spoils, **≥100%** meager, below = repelled (+15🍖 extra on fail).
- **Split ratio hints** — `DEFENSE_RATIO_HINT` vs `COUNTER_RAID_RATIO_HINT` in preview (no longer one misleading footer).

### Changed
- **Incoming vs outgoing clarity** — UI labels: “If they raid your village” vs “If you raid their camp”; pay-off tribute amount shown in preview; incoming banner does not show counter-raid section.
- **Counter-raid forecast gated** — preview shows outcome only when spears, 8+ pop, enough food, and non-friendly relations; otherwise a specific blocker message.
- **Stable village anchor** — `getPlayerCampCenter()` prefers Town Hall / House over wandering settler centroid (shared with `groupEvents.ts` spawn distance).
- **Focus hint** — counter-raid note mentions distance-scaled food (not flat 30🍖).

### Deferred to v0.5.0 (see [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md))
- Village tab raid shortcut, distance-based raid deadline/march, spear tier stacking review, dedicated combat log panel, walls/guards, Blacksmith forge queue.

## [0.4.1] - Frontier raids & militia combat (2026-07-04)

### Added
- **Incoming raids** from tense/competitive rivals (`maybeQueueRaid` in `frontierCombat.ts`) — red banner + rival inspector with 3-day deadline.
- **Defend choices**: militia fight (stone/iron spears), barricade (20 wood + 10 stone), or pay food tribute.
- **Combat resolution** — militia vs raid strength (population, spears, shields); outcomes from decisive victory to defeat with loot, building damage, casualties.
- **Counter-raid** — `launchRaidOnRival()` from rival inspector (provisions + spears + 8+ pop); seize supplies or risk repelled raid + counter-attack.
- **Visible war-bands** — rival settlers march toward your village while a raid is pending; combat flashes on map.
- **Combat chronicle** — new `combat` event-log type + Log tab filter.

### Technical
- `pendingRaidEvents` on `WorldState`; `raidCooldownDays` on `RivalSettlement`.
- `frontierCombat.ts` — strength helpers, raid tick/expiry, response handlers.

## [0.4.1] - Docs: TODO + roadmap sync (2026-07-04)

### Added
- **`ROADMAP_0.5.0.md`** — open work checklist (frontier raid polish, perf, architecture).
- **In-game roadmap** — `ROADMAP_OPEN_FIXES` section in Roadmap tab (“Still to fix / implement”).

### Changed
- **`CHANGELOG.md`**, **`ROADMAP.md`**, **`roadmapContent.ts`**, **`TECHNICAL.md`** — frontier raids MVP + combat preview marked shipped; remaining combat/craft/polish items listed.

## [0.4.1] - In-game roadmap tab (2026-07-04)

### Added
- **Roadmap tab** — eighth sidebar tab with read-only v0.4.1 slice: shipped features, open/partial P0–P2 items, next dev priorities, deferred backlog (`RoadmapPanel.tsx`, `roadmapContent.ts`).
- **Guide → Roadmap** shortcut button at top of Guide tab.

### Technical
- `roadmapContent.ts` mirrors `ROADMAP.md` priorities; update when shipping v0.4.1 items.

## [0.4.1] - Tribe interaction v2 + Nature grazing warning (2026-07-04)

v0.4.1 partial — deeper frontier diplomacy and ecosystem coaching.

### Added
- **Rival diplomacy event cards**: `DiplomacyEvent` queue on `WorldState.pendingDiplomacyEvents` — tribute demands, border disputes, and alliance offers spawned from `tickRivalSettlements()`. Players respond via top-of-map banner (2–3 choices) or rival inspector panel (`respondToDiplomacyEvent()` in `groupEvents.ts`).
- **Rival map diplomacy panel**: Click a rival **camp marker** or **rival building** on the map to open the inspector with gifts, trade pact, militia, pending events, and **Ping camp on map** (camera focus + pulsing ring).
- **Visitor camp diplomacy**: Click visitor **camp markers** for trade UI (`tradeWithVisitors()` — buy food/wood, sell food) on traders, nomads, and hunters.
- **Refugee negotiate screen**: Refugee caravans no longer auto-join; player chooses welcome (40🍖), screen (20🍖), or turn away (`negotiateRefugees()`). Visitor entity inspector links to camp panel.
- **Camp hit-testing**: `hitTestCamp()` in `groupEvents.ts`; canvas click handler in `App.tsx` focuses camera and sets `highlightedCampKey` / `selectedCampKey` on `ViewState`.
- **Nature tab grazing pressure warning**: `ecosystemPressure.ts` computes deer grazing demand vs grass recovery (season/weather aware). Amber/rose alert card when pressure is **caution** or **critical**, with actionable advice (wolves, overgrazing, drought/winter).

### Changed
- **VisitorGroup** fields: `tradesCompleted`, `refugeeResolved` (save/load migrated in `saveLoad.ts`).
- **Frontier neighbors** (Village tab): Focus camp buttons; diplomacy hints when events are pending.
- **Guide tab**: Documents map-click diplomacy and visitor trade/refugee negotiate (no longer Village-tab-only).
- **Active event banner**: Yields to pending diplomacy cards when rivals need a response.

### Technical
- New types in `gameTypes.ts`: `DiplomacyEvent`, `DiplomacyChoice`, `DiplomacyEventKind`; `pendingDiplomacyEvents` on `WorldState`.
- `viewState.ts`: `highlightedCampKey`, `selectedCampKey` for camp selection and map ping.
- `renderSnapshot.ts` / `renderer.ts`: Pulsing highlight ring on focused rival/visitor camps.
- `gameEngine.ts` re-exports: `respondToDiplomacyEvent`, `tradeWithVisitors`, `negotiateRefugees`, `hitTestCamp`, `getGrazingPressureReport`.
- `worldGen.ts` initializes `pendingDiplomacyEvents: []`.
- Pending diplomacy events expire after 14 in-game days if unanswered (`tickPendingDiplomacyEvents`).

## [0.4] - Early alpha (June 2026) ✅

Verified in codebase — all shipped before **v0.4.1** (2026-07-04). Verbose dev-log entries removed; only the top `## [Unreleased]` section tracks in-flight **v0.5.0** work.

- [x] **Event log** — uncapped saves, 500-entry UI cap, `.txt`/`.json`/`.csv` export (`eventLog.ts`, `eventLogExport.ts`, `EventLogPanel.tsx`)
- [x] **Prison + Guard** — arrest on caught affairs, prisoner state, `isImprisoned()` (`BuildingType.Prison`, `lifeSimulation.ts`, `dayCycle.ts`)
- [x] **Terrain** — real terrain render, tile-sized cache, preset variety, coastal camp clearing (`renderer.ts`, `terrainGen.ts`)
- [x] **Audio credits** — [TECHNICAL.md](TECHNICAL.md#audio-credits)
- [x] **Shared event log module** — `logEvent()`, `syncEventLogIdFromState()` (`eventLog.ts`)
- [x] **Building foundation pads** — category colors, pad shapes, season tint, hover/selection (`renderer.ts`, `BUILDING_CONFIGS`)
- [x] **Simulation upgrade** — storage caps, food spoilage, terrain/adjacency efficiency, wolf pack bonuses (`economy.ts`, `gameEngine.ts`, `lifeSimulation.ts`)
- [x] **Werewolf + Wildkin + Big News** — moon howler, wildkin births, dismissible banner (`moonHowler.ts`, `lifeSimulation.ts`, `gameEngine.ts`)
- [x] **Taming, visitors, festivals** — Taming Post, caravans, `festival` state, economic rebalance (`buildingActions.ts`, `groupEvents.ts`, `worldGen.ts`)
