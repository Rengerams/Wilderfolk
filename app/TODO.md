# Wilderfolk — Open work (v0.4.2)

Living checklist for fixes and features **not yet done**.  
Shipped work → [CHANGELOG.md](CHANGELOG.md) · Priorities → [../ROADMAP.md](../ROADMAP.md) · In-game slice → `src/game/roadmapContent.ts`

*Last updated: July 5, 2026 · **v0.4.2 shipped** (`GAME_VERSION = 0.4.2`) · Next target **v0.4.3** (Sep 2026) · perf Phases 1–3 → **Q1 2027***

---

## v0.4.2 — ship checklist ✅ (closed 2026-07-05)

| # | Item | Priority | Status | Notes |
|---|------|----------|--------|-------|
| 1 | **Bump `GAME_VERSION` to `0.4.2`** + save migration | P0 | **Done** | `version.ts` `0.4.2`; `COMPATIBLE_SAVE_VERSIONS` includes `0.4.2`; load migration log for `0.4.1` |
| 2 | **10-year balance pass** | P0 | **Done** | **PASS** 2026-07-04 — town profile, 86400 ticks, 9/9 gates (`sim-10year-town-2026-07-04T21-23-57-948Z.txt`) |
| 3 | **External playtests (5–10 sessions)** | P0 | **Done** | [docs/PLAYTEST_BETA_10_USERS.md](docs/PLAYTEST_BETA_10_USERS.md) |
| 4 | **Spear / militia balance review** | P0 | **Done** | `militiaBalance.ts` · `npm run balance:militia` |
| 5 | **CHANGELOG + docs sync** on ship | P0 | **Done** | `[0.4.2]` in CHANGELOG; README, ROADMAP, `roadmapContent.ts` |
| 6 | **In-game Roadmap tab** | P0 | **Done** | `ROADMAP_TARGET_VERSION = '0.4.3'`; v0.4.2 slice under Shipped |

**Exit:** Tag `v0.4.2` · saves migrate · playtests signed off · balance pass documented.

---

## Shipped in v0.4.2 (in this build)

*Full notes → [CHANGELOG.md](CHANGELOG.md) `[0.4.2]`*

| Item | Status |
|------|--------|
| 6-tab sidebar + Progress/More sub-tabs | ✅ |
| Alert strip (`AlertBar` + `priorityAlerts`) | ✅ |
| 10-year balance pass |✅ |
| Map build hotbar + deduped collapsed left rail | ✅ |
| Collapsible inspector, GameMenu, Frontier/Challenges panels | ✅ |
| Tab hotkeys V/F/N/P/L/M, focus Go → actions | ✅ |
| Progress subnav badges, Frontier tab badge | ✅ |
| Guide + README + TECHNICAL docs updated | ✅ |
| Quick Start + ? shortcuts overlay | ✅ |
| Header ⭐ reputation badge (click → Trade) | ✅ |
| Focus Go → for challenges, visitors, rivals, elections | ✅ |
| Progress tab badge + Frontier raid button | ✅ |
| Pay-off vs counter-raid hint in combat preview | ✅ |
| Roads Infra hint + armament copy | ✅ |
| Blacksmith forge / visible crafting queue | ✅ |
| Simulation perf pass (entity maps, wildlife throttle, UI memo) | ✅ |
| Headless sim perf metrics (`simulate:30min`) | ✅ |
| Sanity check (build + 72k-tick sim + lint 0 errors) | ✅ |
| Lint hygiene (`countByType`, inspector `setState` in effect) | ✅ |
| Walls / Watchtowers / Barracks + guard patrols | ✅ |
| Combat log panel (Log → Combat sub-tab) | ✅ |
| Raid march lines on map | ✅ |
| Defense sprites (walls, tower, barracks) | ✅ |
| Road / wall / gate rotation (R while placing) | ✅ |
| Juice — night glow, build confetti, camera nudge | ✅ |
| Intro screen refine (~20s timeline, skip after logo) | ✅ |
| **Bug-fix pass (~40 fixes, 4 rounds)** | ✅ | See [CHANGELOG.md](CHANGELOG.md) → Bug fixes — comprehensive pass |

---

## Bug fixes — comprehensive pass (July 4, 2026) ✅

*Verified: build, lint (0 errors), 5-min + 30-min headless sim, `/check-work` PASS.*

| Area | Fixes |
|------|-------|
| **Session / loop** | Map setup `setSession`; loop paused during map setup |
| **Humans** | Faction ages; off-screen double aging; age display; pioneer ages; prison ghost workers |
| **Frontier** | Diplomacy event loss; peace cancels raids; rival pop sync; raid tick timing; silent raid/diplomacy/trade feedback; UI disables |
| **Economy** | Winter heating (player only); workshop/trade at storage cap |
| **Buildings** | Prison demolish; placement footprint; build ghost world; forge tick + notifications |
| **Challenges / victory** | `eco_master` timing; `growing_village` UI; `great_city` buildings; victory rival buildings |
| **Save / stats** | Year from tick; challenges/yearlyStats/lifetimeStats defaults; yearly pop filter; births; disastersSurvived |
| **Visitors** | Refugees not killed on departure; food not charged at pop cap |
| **Moon howler** | Hunt/combat state cleared on revert |
| **Eco** | Year rollover once; player-only building impact |

Full table → [CHANGELOG.md](CHANGELOG.md) `[Unreleased]` → Bug fixes.

---

## Frontier combat — polish & gaps

Player guide → [README.md](README.md#frontier-raids--militia) · Code → `frontierCombat.ts`, `defenseStructures.ts`, `CombatLogPanel.tsx`, `CombatPreviewPanel.tsx`

| Item | Priority | Status | Notes |
|------|----------|--------|-------|
| **Village tab raid shortcut** | — | Done | Incoming raid card + Frontier `🏹 Raid` + map banner + alert strip |
| **Raid deadline vs distance** | — | Done | `expiresAtTick` 2–6 days; `marchDistanceTiles`; slower rival march in `lifeSimulation.ts` |
| **Pay-off vs raid tooltip** | — | Done | `CombatPreviewPanel` cyan hint when `incomingPayoffFood` &lt; `outgoingRaidFoodCost` |
| **Combat preview panel** | — | Done | Militia vs rival, defend/barricade/counter tiers, block reasons |
| **Dedicated combat log panel** | — | Done | Log → **Combat** — stats, scroll, .txt/.json/.csv export |
| **Walls / Watchtowers / Barracks** | — | Done | `defenseStructures.ts`; guard patrols in `lifeSimulation.ts` |
| **Raid march map overlay** | — | Done | `drawRaidMarchLines` — dashed red line + ⚔️ midpoint |
| **Rival war-band march** | — | Done | Rival settlers path to village while raid pending; ⚔️ badge when close |
| **Weapon / status map icons** | Low | Partial | Settler badges: 🏹 hunt, 🛡️ shields, 🪖 guard, ⚔️ `combatTicks` ✅ · **Missing:** player militia march line/sprites on **outgoing** counter-raid (instant `flashMilitia` only) |
| **Spear tier stacking** | — | Done | `militiaBalance.ts` — iron replaces stone; iron shields replace wooden |
| **Real-time map battles** | — | Deferred | Abstract `resolveDefenseRatio` / `launchRaidOnRival` — no tactical combat (post-0.4.2) |

---

## v0.4.2 — feature checklist (code in repo)

| Item | In repo | Shipped as v0.4.2 |
|------|---------|-------------------|
| Juice — night glow, build confetti, camera nudge | ✅ | ✅ |
| Road / wall / gate rotation (**R**) | ✅ | ✅ |
| Blacksmith forge queue | ✅ | ✅ |
| Walls / towers / barracks + guard patrols | ✅ | ✅ |
| Combat log, raid polish, 6-tab UI, intro | ✅ | ✅ |
| Header ⭐ → Trade | ✅ | ✅ |
| Perf throttles + entity maps | ✅ | ✅ |
| Perf at 500+ entities (spatial grid) | Partial | → **v0.4.3** (not a v0.4.2 blocker) |

### Perf — version & finish targets

| Phase | Target version | Finish by | Goal |
|-------|----------------|-----------|------|
| **Shipped** | **v0.4.2** | July 2026 | Throttles, entity maps, UI memo, headless ms/tick metrics |
| **Phase 1** | **v0.4.3** | **Sep 2026** | Close “perf at 500+ entities” — spatial grid, compaction, shared render cache, benchmark CI gate |
| **Phase 2** | **v0.4.4** | **Nov 2026** | Polish remaining O(n) scans, render buckets, App tab split, object pooling |
| **Phase 3** | **v0.5.0** | **Q1 2027** | Architecture for large maps / 100+ humans — Web Worker sim, canvas layers, adaptive catch-up |

*Stretch for v0.4.2 ship (if time): `buildingById` for human go-home path (deferred → **v0.4.4**).*

**Informal budget (headless, ~700 alive entities):** p95 &lt; 16 ms/tick · avg &lt; 8 ms/tick. Gate in Phase 1.

**Event log:** uncapped in saves by design. Phase 3 may add append-only indexing *only if* save size becomes a problem — not a v0.4.x default.

### Perf — shipped (v0.4.2)

- Remove duplicate `byType` build per tick
- Wildlife iterates `byType` + off-screen AI throttle (8 ticks)
- Off-screen grass growth decimation (every 4 ticks)
- `entityById` / `buildingById` maps (O(1) lookups)
- Hoisted predator list for flee logic
- `world.wildlifeCounts` — no Nature-tab entity scans
- Single-pass `villageStats` + narrowed `priorityAlerts` deps
- `React.memo` on WildlifeBar, StatBadge, Frontier/Challenges panels
- `simulate:30min` reports ms/tick (avg/p50/p95/max)
- `combatTech.ts` — breaks forge ↔ combat circular import for headless sim

### Perf — future optimizations

#### Phase 1 → v0.4.3 (finish Sep 2026)

| Item | Hotspot | Priority |
|------|---------|----------|
| Spatial grid for graze / hunt / flee / wolf pack | `lifeSimulation.ts` — grass scan ~L1426, predator–prey loops | P1 |
| Dead-entity compaction | `gameEngine.ts` — drop `alive: false` from `state.entities` | P1 |
| Renderer entity cache reuse | `renderer.ts` `updateCachedEntities()` — reuse sim `byType` | P1 |
| Denormalize settler working/idle counts | `App.tsx` — extend `wildlifeCounts` pattern on `WorldState` | P1 |
| Benchmark gate at population milestones | `simulate-30min.ts` — 50/100/200 humans; fail if p95 &gt; budget | P1 |

#### Phase 2 → v0.4.4 (finish Nov 2026)

| Item | Hotspot | Priority |
|------|---------|----------|
| Incremental `entityById` updates | `gameEngine.ts` — update on birth/death only | P2 |
| `buildingActions.ts` entity scans | ~20 `filter`/`find` on assign/recruit flows | P2 |
| `buildingById` for human go-home | `lifeSimulation.ts` `updatedBuildings.find` | P2 |
| Grass render spatial buckets | `renderer.ts` `drawGrass` — grid buckets for large maps | P2 |
| Partner id map for relationship lines | `renderer.ts` `_cachedHumans.find` ~L1290 | P2 |
| Particle / floating-text pooling | `gameEngine.ts` death/float arrays | P2 |
| Memoize Village / Nature / Progress tab bodies | `App.tsx` — cut 100 ms UI re-renders | P2 |

#### Phase 3 → v0.5.0 (finish Q1 2027)

| Item | Hotspot | Priority |
|------|---------|----------|
| Web Worker `gameTick` | `gameEngine.ts` + `gameLoop.ts` — serializable state | P3 |
| Save load / size (optional append-only log index) | `eventLog.ts`, `saveLoad.ts` — **no cap**; index if needed | P3 |
| Adaptive catch-up / sim decimation at 10× | `gameLoop.ts` `MAX_CATCHUP_STEPS` | P3 |
| Canvas LOD for trees / animals / sprites | `renderer.ts` — extend low-zoom grass skip | P3 |
| OffscreenCanvas terrain vs entity layers | `renderer.ts` — split static/dynamic redraw | P3 |

**Tooling:** `npm run simulate:30min` · env `SIM_MINUTES`, `PERF_SAMPLE_EVERY`

---

## v0.4.3 — preview (not started)

Full plan → [../ROADMAP_0.4.3.md](../ROADMAP_0.4.3.md) · Target **Sep 2026** after v0.4.2 ships.

| P0 (perf Phase 1) | P1 (polish) |
|-------------------|-------------|
| Spatial grid (`lifeSimulation.ts`) | v0.4.3 perf (10-year balance pass done 2026-07-04) |
| Dead-entity compaction (`gameEngine.ts`) | External playtests on large-map builds |
| Renderer cache reuse (`renderer.ts`) | Counter-raid militia march visuals |
| Settler count denorm (`WorldState`) | Spear tier balance validation |
| Benchmark gate — 50/100/200 human profiles | |
| `GAME_VERSION` 0.4.3 + save migration | |

**Defer to v0.4.4:** see [../ROADMAP_0.4.4.md](../ROADMAP_0.4.4.md)

---

## v0.4.4 — preview (not started)

Full plan → [../ROADMAP_0.4.4.md](../ROADMAP_0.4.4.md) · Target **Nov 2026** after v0.4.3 ships.

| P0 (perf Phase 2) | P1 (UX / content) |
|-------------------|-------------------|
| Incremental `entityById` (birth/death only) | Reputation arc UI |
| `buildingActions.ts` entity scan cleanup | Footstep / work SFX by surface |
| `buildingById` go-home in `lifeSimulation.ts` | One visitor multi-step quest chain |
| Grass render spatial buckets (`drawGrass`) | `npm run benchmark:gate` (if not in v0.4.3) |
| Partner id map for relationship lines | |
| Particle / floating-text pooling | |
| App tab split + memo (Village / Nature / Progress) | |
| `GAME_VERSION` 0.4.4 + save migration | |

**Defer to v0.5.0:** Web Worker `gameTick`, OffscreenCanvas layers, adaptive 10× catch-up.

---

## Diplomacy & tribes — still open

| Item | Priority | Notes |
|------|----------|-------|
| Full war / embassy tree | Deferred | Peace treaties + raids MVP ✅; no embassies or sieges |
| Player caravans | Deferred | post-0.4.2 |

---

## Deferred (explicitly not v0.4.2)

- Hospital disease / heal loop
- Wardogs from tamed wolves
- Fog of war / map expansion
- Leader perks / government decisions beyond ceremonial head
- Multiplayer

---

## When closing an item

1. Mark done in this file (or delete the row).
2. Add a bullet under [CHANGELOG.md](CHANGELOG.md) `[Unreleased]` or the shipping version section.
3. Update [../ROADMAP.md](../ROADMAP.md) half-done registry + `roadmapContent.ts` if player-facing.