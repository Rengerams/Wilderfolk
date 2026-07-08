# Changelog

## [Unreleased]

**Targeting v0.5.0** (end July 2026) — see [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md).

### Added — frontier raid response & balance (July 8, 2026)

- **Outgoing raid phase** — `launchRaidOnRival()` dispatches a war-band; rival may **offer tribute** or **choose to fight**; player always gets **Accept tribute** / **Decline — attack anyway** or **Press the attack** (`pendingOutgoingRaidEvents`, `respondToOutgoingRaidEvent`)
- **Raid vs counter-raid labels** — proactive strike = “Raid their camp”; retaliation after an incoming war-band = “Counter-raid their camp” (`isCounterRaidOnRival`, `getOutgoingRaidActionLabel`)
- **Population-scaled raid casualties** — victories and barricade holds always cost lives; tiers scale with village size (`getRaidCasualtyBounds`)
- **Raid loot bundles** — incoming defense can lose food/wood/stone/gold; outgoing wins grant multi-resource spoils (`RaidLootBundle`, `formatRaidLootSummary` on banners)
- **Peace + outgoing marches** — treaties recall in-flight player war-bands (`cancelPendingOutgoingRaidsForRival`)
- **Raid participant rewards** — everyone who fights earns **Guard** skill XP (`rewardRaidParticipants`, `getRaidParticipants`); tier scales with outcome (decisive win 1.1 → defeat 0.4 / outgoing success 1.0 → fail 0.45 / tribute march 0.3)
- **Leader raid glory** — sitting village head who was in the fight gets **+0.45** extra Guard XP; on a win they also gain **village reputation** (+1 meager / +2 narrow / +3 outgoing success / +4 decisive)
- **Raid XP → merit elections** (`villageLeadership.ts`, `skills.ts`):
  - **Personal merit (all candidates)** — each fighter's Guard XP stacks like any job skill; at election `getLeadershipScoreBreakdown()` adds `skillPoints = round(sum(all job skills) × 2)` — challengers and incumbent alike
  - **Incumbent record only** — raid rep bonuses feed `getIncumbentRecordAssessment()` economy/village-health thresholds; **recordPoints** capped at **+8** positive; challengers have no record score
  - **No XP without fighting** — incoming pay-off grants no Guard XP; barricade/defend/outgoing fights do
- **Vitest** — **358** tests, **67** files (`frontierCombat.test.ts` — outgoing tribute + raid XP/rep; `moonHowler.cycle.test.ts`; `entityLayer.test.ts` — outgoing raid cache key)
- **`RenderSnapshot`** — `pendingOutgoingRaidEvents` mirrored from `WorldState` (fixes `entityLayer.test.ts` / `tsc` typecheck)

### Changed — victory goals & trade empire (July 8, 2026)

- **Population victory targets raised** — Eco-Utopia **250** humans; Great City **400** humans + **60** buildings; challenge `great_city` **250** + **35** buildings; `thriving_town` **50** (`VICTORY_TARGETS` in `victory.ts`)
- **Harmony path fixed** — counts **untamed** wolves only (`tamedBy == null`); **8** wild wolves + **15** wildkin — coexistence, not taming
- **Walking trade caravans** — `tradeCaravans.ts`: merchants walk from Market/Store/Town Hall to partner edge and back; goods exchange at partner (export) and village (import); map **🚚** lines in `renderer.ts`; Progress tab status in `App.tsx`
- **Trade Empire victory harder** — all **7** routes (added Spice Coast, Granite Reach), **40** round-trips, **50,000** gold from caravan trade (`lifetimeStats.goldFromTradeRoutes`)
- **Instant abstract trade removed** — `updateTradeRoutes()` replaced by `tickTradeCaravans()` in `gameEngine.ts`
- **Tests** — `victory.test.ts`, `tradeCaravans.test.ts`

### Fixed — Moon Howler 14-day cycle & Church cure (July 8, 2026)

**Bug tracker:** [private/BUGS_TRACKER.md](private/BUGS_TRACKER.md) Batch N #1–#7

- **Recurring hunts** — uncured settlers now transform at **8pm** on full-moon colony days (0, 14, 28…) and revert at **7am** the next morning; no longer reverts on arbitrary daytime ticks (`isMoonHowlerTransformTick` / `isMoonHowlerRevertTick` in `moonHowler.ts`)
- **Calendar** — moon logic uses `getAbsoluteCalendarDay(state.tick)` so the 14-day cadence stays aligned with the sim clock
- **New curse** — when no active Moon Howler curse exists and population > 5, one settler is cursed on the next full moon (replaces 8% RNG); transforms the same night
- **Church cure** — staffed Church rolls **~18%** at **dawn (7am)** while the settler is still in werewolf form (after the hunt); village-wide, no proximity check (`tryMoonHowlerChurchCures`)
- **Alerts & debug** — “Full Moon!” fires when Moon Howlers are abroad at 8pm even if the transform tick was missed; debug spawn transforms on the current full-moon night
- **Tests** — `moonHowler.cycle.test.ts` (hunt days 0/14/28/42); `moonHowler.test.ts` (dawn cure RNG, new-curse gate)
- **UI** — Church panel, help tab, and building hints describe dawn (7am) exorcism in 🌝 form (~18%, village-wide), not “full-moon nights” proximity cure

### Fixed — orphaned marriages, vitest dialogue preload, prison flake (July 8, 2026)

**Bug tracker:** [private/BUGS_TRACKER.md](private/BUGS_TRACKER.md) Batch O #1–#3

- **Orphaned marriages** — end-of-tick `allAlive` prunes dead entities; survivors could keep `partnerId` pointing at a removed id (`human 285 married partner 831 missing or dead` on seed-42 day 29). `reconcileOrphanedMarriages()` in `dayCycle.ts` runs before `state.entities = allAlive` (accepts human **or** cursed 🌝 form as valid partner)
- **Vitest dialogue bank** — top-level `await preloadDialogueBank()` in `src/test/setup.ts` (disk load via dynamic `import()` like `nameLoader.ts`); fixes parallel-worker race with async `beforeAll`
- **Prison integration flake** — `lifeSimulation.prison.test.ts` uses `withSeededRandom(123)` and dynamic `nextEntityId++` fixture ids; reliably surfaces `Whispers spread` gossip over 120 days
- **Tests** — `lifeSimulation.mortality.test.ts` (`reconcileOrphanedMarriages` ×3); social integration seed-42 (30/60 day) green

### Fixed — scandal imprisonment (July 8, 2026)

- Only **married** affair offenders are imprisoned; single paramours are not jailed (`isMarriedScandalOffender`); arrest runs before divorce clears marital status

### Added — settler dialogue trees (July 8, 2026)

- **Dialogue-tree chat** — `sim_dialogue_trees.json` (95 trees, 3-line paired banter); `dialogueTrees.ts` + dialogue-first `humanChat.ts` with session advance and multiline bubbles
- **Legacy line migration** — old `humanChat` one-liners converted to `wf_*` trees (`migrate-legacy-dialogue.py`); Sims-style `dt_*` trees retained
- **Chat wiring** — `lifeSimulation.ts` partner-aware `settlerChat` / `settlerPairChat`; `foodLow` / juvenile `child` context; `resetDialogueSessions()` on render cache reset
- **Chat tests** — `humanChat.test.ts` (17), election gossip/winner in `villageLeadership.test.ts`, marriage `Yes!` in `lifeSimulation.courtship.test.ts`

### Added — scale, worker, quality (July 8, 2026)

- **Dual-layer spatial grid** (`spatialGrid.ts`) — grass + mobile cell indexes for graze, hunt, flee, wolf-pack queries; `USE_SPATIAL_GRID` on by default (`VITE_USE_SPATIAL_GRID=0` for A/B)
- **Web Worker simulation** (`simWorker/`) — optional `gameTick` off main thread (`VITE_USE_GAME_WORKER=1`); `GameWorkerHost`, render SoA ping-pong (`simBuffers/`), `WORKER_PROTO` negotiation, headless tick path
- **Entity catalog** (`entityCatalog.ts`) — O(1) citizen lookup; main-thread `catalog` state synced from `GameLoop.subscribe`
- **Save schema allow-list** (`saveSchema.ts`, `viewState.ts`) — `pickWorldFieldsForSave()` trims save bloat; camera pan preserved on load
- **Vitest suite** — **358** tests across 67 files (`npm test` / `npm run test:all`); helpers in `src/test/` (housing, social, worker parity, ecosystemPressure, packRenderSoA, protocol, dialogue chat, Moon Howler cycle)
- **Build catalog sidebar** — `BuildCatalogPanel.tsx` + `buildCatalog.ts` category rail (replaces deleted `BuildHotbar.tsx`)
- **Resource badges** — `ResourceIcons.tsx`, `ResourceBadge.tsx`, `resourceLabels.ts`
- **Citizen IDs** — `#id` search, death log age suffix (`citizenId.ts`)

### Fixed — comprehensive bug pass (July 7–8, 2026)

**226 tracker items closed** (130 master + 96 batches A–J, July 8 bug pass). Highlights:

- **Sim/UI:** ecosystemPressure shared thresholds (#3–7), viewState camera + save merge (#3/#5), packRenderSoA overflow top-k (#17), protocol feature handshake (#13)
- **Life/save:** `lastProcessedCalendarDay` on load, affair conception site (no hour gate), population snapshot single-pass, weather particles on canvas resize
- **Worker:** `GameWorkerHost` `commandChain`, headless `tickResult`, proto guards on all responses
- **Renderer:** SoA shim safety, night-glow cull, walk threshold, terrain dispose, rain batch, grid viewport
- **Tooling:** production `tsc -b` clean; **ESLint 0 errors** (was 70 — App.tsx ref/`useLayoutEffect` sync, test unused imports, React hooks rules)

### Fixed — marriage integrity + Moon Howler spouses (July 8, 2026)

**Bug tracker:** [private/BUGS_TRACKER.md](private/BUGS_TRACKER.md) Batch I #1–#3

- **`killHuman` / `finalizeHumanDeath` (`dayCycle.ts`)** — single death cleanup entry for player settlers (`isKillableSettlerEntity`: human **or** cursed full-moon werewolf): sets `alive = false`, strips building occupants (`homeBuildingId`, `residenceBuildingId`, prison fields), and **widows the survivor** — clears `partner.partnerId`, sets `relationshipStatus` to `single` (or `expecting` if pregnant)
- **Death paths unified** — all production human kills now call `killHuman(..., entityById)` instead of bare `alive = false`:
  - `tryDailyHumanMortality` — old age + sudden illness (`lifeSimulation.ts`)
  - exhaustion — active and off-screen throttled paths (`lifeSimulation.ts`)
  - childbirth energy depletion (`lifeSimulation.ts`)
  - predator kill — Moon Howler / wolf hunt on human prey (`lifeSimulation.ts`)
  - raid defense casualties (`frontierCombat.ts`)
  - disaster / plague (`worldEvents.ts`)
- **Moon Howler marriage false-negative (root cause of seed-42 social sim failure)** — on full moon, `transformToWerewolfForm` sets `type = EntityType.Werewolf` while marriage fields remain in `moonHowlerSaved`; `livingHumanAt` and `assertSimInvariants` only accepted `EntityType.Human`, so EOD day 29 reported `human 20 married partner 120 missing or dead` although id 120 was alive as a cursed werewolf with `partnerId: 20`
- **`isSettlerRelationshipEntity` (`moonHowler.ts`)** — returns true for alive humans **or** alive `EntityType.Werewolf` with `moonHowlerCursed`; wired into `livingHumanAt`, `resolveChatPartner`, and `assertSimInvariants`
- **Test fixture id collision** — `lifeSimulation.social.integration.test.ts` no longer hardcodes ids `20`/`120`/`121` (collided with `initGame` auto-spawn, e.g. tree id 120); lovers/spouses allocated via `state.nextEntityId++`
- **Werewolf-form deaths** — `tickWildlife` old-age and starvation paths call `markWildlifeDead` → `killHuman` for cursed settlers (not bare `alive = false`)
- **Tests** — `lifeSimulation.mortality.test.ts` (widow on human + werewolf-form death), `moonHowler.test.ts` (werewolf-form spouse valid), `lifeSimulation.social.integration.test.ts` (30-day seed 42 green)
- **Vitest typecheck** — 17 pre-existing `tsconfig.vitest.json` errors fixed in test helpers (`canvasPolyfill`, `gameLoopTestUtils`, `placementUtils`, `entityLayer`, `frontierCombat`, `contextualTutorial`, `lifeSimulation.wildlife`); now part of `npm test`

### Fixed — pairwise sim hotspots (July 8, 2026)

**Bug tracker:** [private/BUGS_TRACKER.md](private/BUGS_TRACKER.md) Batch I #4–#9 · details in [private/OPEN_PROBLEMS.md](private/OPEN_PROBLEMS.md)

- **`tickQueries.ts` (new)** — per-tick shared helpers: `getLivingEntity`, `buildResidenceOccupantIndex`, `getHousemates`, `findClosestEntityInRadius`, `forEachEntityInRadius`, `buildWildlifePopulationSnapshot`, `recordWildlifeBirth`, `buildGrassPopulationSnapshot`, `recordGrassBirth` / `recordGrassDeath`
- **Social scans → indexed queries** (`lifeSimulation.ts`):
  - housemate chat — `buildResidenceOccupantIndex` + `getHousemates` (was `playerHumans.filter` per settler)
  - courtship — `findCourtshipPartner` + spatial closest-single query
  - affair paramour — `findClosestEntityInRadius`; site checks use `entityById` / `buildingById` maps
  - idle socialize — `findClosestEntityInRadius` over map-span radius
- **Wildlife scans → built-once indexes** (`spatialGrid.ts`, `lifeSimulation.ts`):
  - `RoadAvoidanceIndex` — `isNearRoad` + `applyAvoidance` replaces per-entity `roadBuildings.some`; shared on `TickContext` for human road-speed mult
  - mate search — `findClosestEntityInRadius` on `mobileGrid`
  - population cap — `buildWildlifePopulationSnapshot` + `recordWildlifeBirth` (was per-animal `byType.filter`)
  - tamed hunt assist — grid sync + `findClosestEntityInRadius`
- **Edge scans** — idle tree wander (`buildTreeGrid` once per `tickHumans`); grass repro cap (`buildGrassPopulationSnapshot`)
- **`gameEngine.ts`** — `syncMobileSimGrid` reuses `state.mobileGrid` instead of allocating each tick
- **Affair / reproduction tests** — `lifeSimulation.affair.test.ts`, `lifeSimulation.reproduction.test.ts` updated for `entityById` maps and `tryDailyConception` signature
- **A/B flag** — `VITE_USE_SPATIAL_GRID=0` restores legacy full-list prey/predator scans for perf comparison only

### Changed — npm scripts & test gate (July 8, 2026)

**Bug tracker:** [private/BUGS_TRACKER.md](private/BUGS_TRACKER.md) Batch J

- **`npm test`** — `vitest run` (**358** tests, **67** files, **0 skipped**)
- **`npm run test:all`** — vitest + `tsc -p tsconfig.vitest.json --noEmit`; **`npm run test:types`** — typecheck only
- **Vitest default config** — browser Web Worker suites (`gameLoop.worker.test.ts`, `gameWorkerHost.test.ts`) excluded from default run (Node has no `globalThis.Worker`); optional `npx vitest run --config vitest.browser-worker.config.ts`
- **`npm run` shortened (app)** — 24 scripts → **8**: `dev`, `build`, `test`, `test:watch`, `lint`, `preview`, `sim`, `bench`
- **`sim` CLI** (`scripts/sim-cli.mjs`) — `npm run sim` lists profiles; `npm run sim -- <profile>` replaces `simulate`, `simulate:30min`, `simulate:20year`, `simulate:social`, `simulate:housing`, `simulate:housing:ticks`, `simulate:family`, `simulate:10year`, `simulate:10year:worker`, `simulate:20year:worker`, `balance:militia`, `benchmark:city`, `simulate:30min:city`, `sim:kill` (aliases: `simulate` → `5min`, `balance` → `militia`)
- **`bench`** — `npm run bench` replaces `npm run benchmark:gate` (CI benchmark gate)
- **Repo root** — forwards `test`, `sim`, `bench` into `app/`; dropped five `simulate:*` forwards

### Changed (July 8, 2026)

- **`App.tsx`** — `catalog` + `hasPlacedHouse` + `villageStats` state from loop subscribe; callback refs synced in `useLayoutEffect` (eslint `react-hooks/refs` compliant)
- **`useContextualTutorial`** — queue head = active tip; dismiss advances queue
- **`BuildCatalogPanel`** — category follows selected building without `useEffect` setState

### Added
- **Housing & population UI** — header + Village tab show **🛏️ beds** and open slots separately from **immigration cap** (`populationGrowth.ts`, `GameHeader.tsx`, `App.tsx`)
- **Housing assignment overhaul** (`dayCycle.ts`) — `buildHousingUnits`, custodian chain, shortage sharing, orphan adoption
  - **Cap vs beds** — recruitment/immigration uses `maxHumanPopulation` (houses + rep + base 5); physical slots = sum of completed House/Mansion capacity (upgrades included)
  - **Singles** — may share a house; stay until **marriage**, then `syncPartnerResidence` moves the couple to their own home (empty preferred)
  - **Children** — follow **mother** → **father**; **bastards** with no mother → **maternal grandma** → **paternal grandma**; then **father**
  - **Orphans** — no kin left → random **married couple** adopts; if none, placed in **any house with room**
  - **18+** — inspector button **Move to own home** when an empty house exists (`moveOutOfFamilyHome` in `buildingActions.ts`)
  - **Housing shortage** — when no empty homes (or all beds full), **families stay together** in shared houses instead of splitting
- **Election day ceremony** (`villageLeadership.ts`) — founding **first male** leads until Year 10; merit elections every 10 years; leader death → election **2 years later** (no instant succession); ceremony phases gather → gossip → tension → reveal + 3-day *Election Revelry* festival
- **Election buildup** — year-before notification (`tickElectionBuildup`); ongoing settler gossip during buildup, election year, and ceremony (`tickElectionGossip`)
- **Incumbent always runs** — `getElectionRaceCandidates()` keeps sitting head in race lineup, gossip, and Leadership standings even when merit rank drops below top 4
- **Incumbent record score** — modest election bonus/penalty for sitting head only: economy (+4/−5), clean record (+3) vs scandals (−5 each), village health (+3/−6); **+8 positive cap** so high-merit challengers can still win; penalties uncapped
- **Leadership UI** — `VillageLeadershipPanel` shows record breakdown; standings show record modifier; tutorial + focus hints updated

### Planned (remaining for v0.5.0 tag)
- **P0** — renderer cache reuse, settler count denorm, benchmark gate exit codes; incremental `entityById`, `buildingActions` scan cleanup, grass render buckets, App tab split, pooling; OffscreenCanvas terrain/entity layers; logical invariant checks; **`npm run sim -- 20year` full 172800-tick PASS**; `GAME_VERSION` **0.5.0** + save migration
- **Done in code (pre-tag):** spatial grid ✅, dead-entity compaction ✅, Web Worker `gameTick` ✅ (opt-in), big bug checkup ✅ (252 tracker items, Batch O), `npm run test:all` ✅ (358 + types)
- **P1** — election playtest at Year 10/20; counter-raid militia march visuals; large-map playtests; reputation arc UI; footstep SFX; one visitor quest chain; `npm run bench`

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

#### Frontier raid polish
- **Distance-scaled raid deadline** — incoming raids get **2–6 days** to respond based on camp distance (`expiresAtTick`, `marchDistanceTiles` on `RaidEvent`).
- **War-band march speed** — rival settlers march slower from farther camps (`lifeSimulation.ts`).
- **UI** — banner, alerts, Frontier/Village tabs show `formatRaidDeadline`; save migration backfills old raids.

#### Fixed / hygiene (July 2026)
- **Lint** — July 4: unused imports + inspector handlers; July 8: **70 ESLint errors → 0** (`App.tsx` ref sync, `BuildCatalogPanel`, `GameMenu`, tests, scripts); `argsIgnorePattern: '^_'` for intentional unused params.
- **Sanity check** — `npm run build` pass; `npm test` **317 passed** (3 skipped); `/check-work` PASS (July 8, 2026). July 4 headless baseline: avg **1.81 ms/tick**, p95 **4.83 ms/tick** @ ~557 entities.
- **Docs sync** — all project `*.md` files aligned with v0.4.2 + July 8 bug-pass status.

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
- **Roadmap tab** — eighth sidebar tab with read-only v0.4.1 slice: shipped features, open/partial P0–P2 items, next dev priorities (`RoadmapPanel.tsx`, `roadmapContent.ts`).
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
