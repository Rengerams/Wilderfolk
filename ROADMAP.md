# Wilderfolk Roadmap

*Last updated: **July 5, 2026** · playing **v0.4.2** · next tag **[v0.5.0](ROADMAP_0.5.0.md)** (end July 2026)*

Shipped work only — newest release first. Open dev checklist → [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md) *(not player-facing)*. Detail → [CHANGELOG.md](CHANGELOG.md).

| Doc | Purpose |
|-----|---------|
| [app/README.md](app/README.md) | How to play |
| [CHANGELOG.md](CHANGELOG.md) | Full change log by version |
| [TECHNICAL.md](TECHNICAL.md) | Architecture, playtests, dev log |
| [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md) | v0.5.0 developer checklist |
| `app/src/game/roadmapContent.ts` | In-game **More → Roadmap** |

---

## North star

Cozy frontier eco-sim — settlers on a schedule, food chain matters, valley alive with tribes, player always knows **what to do next**.

---

## Versions (newest first)

| Version | Date | Theme | Status |
|---------|------|-------|--------|
| **0.5.0** | End Jul 2026 | Scale + architecture | In progress — [dev plan](ROADMAP_0.5.0.md) |
| **0.4.2** | 2026-07-05 | Craft, walls/guards, juice, UI/UX | **Shipped** |
| **0.4.1** | Jul 2026 | Tribes, raids, victories, leadership | **Shipped** |
| **0.4** | Jun 2026 | Clarity, chronicle, housing, tutorial | **Shipped** |

---

## v0.5.0 — shipped in code *(pre-tag)*

*`GAME_VERSION` still `0.4.2` until v0.5.0 exit criteria · [CHANGELOG `[Unreleased]`](CHANGELOG.md)*

**Election & leadership** (`villageLeadership.ts`)
- Election ceremony — gather, gossip, tension, reveal, 3-day Election Revelry
- Year-before buildup — notify + settler gossip (`tickElectionBuildup`, `tickElectionGossip`)
- Incumbent always in race — `getElectionRaceCandidates()`
- Incumbent record score — economy, scandals, village health; +8 positive cap
- Leadership panel, focus hints, contextual tutorial synced

**v0.5.0 theme (on tag):** spatial grid, UI split @ 300 pop, Web Worker, canvas layers, sim gates — see [ROADMAP_0.5.0.md](ROADMAP_0.5.0.md).

---

## v0.4.2 — shipped *(2026-07-05)*

[CHANGELOG `[0.4.2]`](CHANGELOG.md) · tag `v0.4.2`

**UI / UX**
- 6-tab sidebar (Village, Frontier, Nature, Progress, Log, More) + sub-tabs
- Alert strip, map build hotbar, collapsible inspector, ☰ game menu
- Tab hotkeys `V/F/N/P/L/M`, focus **Go →**, Frontier/Progress badges
- Header ⭐ → Trade; Quick Start + `?` shortcuts overlay

**Combat / craft**
- Blacksmith forge queue — iron spears & shields (`villageForge`)
- Walls, watchtowers, barracks; guard patrols; combat log panel + export
- Frontier raid polish — 2–6 day deadline by distance, slower distant march
- Incoming raid march lines on map; forge + raid alerts

**Performance**
- Off-screen throttles; per-tick `entityById` / `buildingById`; `wildlifeCounts`
- React memo on heavy panels; `simulate:30min` perf metrics

**Polish**
- Road / wall / gate rotation (**R** while placing)
- Night glow, build confetti, camera nudge, intro screen (~20s, skip after logo)

**Quality**
- 10-year balance PASS (town, 9/9 gates, 2026-07-04)
- 10 external playtests — [report](TECHNICAL.md#playtest-report)
- ~40 bug fixes (July 4 comprehensive pass) — [CHANGELOG](CHANGELOG.md)

**Also in 0.4.2 ship**
- Worker commute snap (7am/7pm); roads benefit copy in Guide
- Reputation — Village explainer + header ⭐
- Rival diplomacy — peace, raids, preview, show-militia parade
- Visitor tribes — 7 kinds, caravan, refugee negotiate, leader talk
- Spear / militia balance (`militiaBalance.ts`)

---

## v0.4.1 — shipped

**Tribes & frontier**
- Tribe diplomacy v2 — map camp panel, event cards, respond choices
- Frontier raids — defend, barricade, pay off, counter-raid
- Combat preview — distance, provisions, defend & raid forecasts
- Peace treaties; visitor leader talk; refugee negotiate
- Guaranteed first-week visitor (days 4–7)

**Victory & leadership**
- Trade Empire + Harmony victories (4 active paths)
- Village leadership — merit elections every 10 years, founding leader, vacancy delay

**UI & clarity**
- Population & families panel; challenge progress bars + 🎯 highlight
- Nature tab grazing pressure warning; chronicle export (.txt / .json / .csv)
- Focus panel; reputation explainer; combat status icons on map
- In-game Roadmap tab (`RoadmapPanel.tsx`, `roadmapContent.ts`)

**World**
- Roads 1.5× walk speed; `road_bonus` → reputation
- Prison + Guard job; building foundation pads
- Visitor camp trade; Eco Master yearly tracking

---

## v0.4 — shipped

**Core**
- PNG walk-sheet settlers; Quick Start tutorial; terrain-aware placement
- Food at meals (8am & 6pm); seasons, weather, pollution, research
- Workshop recipes; Defense research tiers; visitors, rivals, festivals, Moon Howlers
- Eco-Utopia + Great City victories; Village chronicle + export on save

**UI pass**
- Sidebar → 6 tabs; alert strip; map hotbar; focus hints; armament checklist
- House expand (+2 slots); worker commute snap; demolish always visible

*Full v0.4 list → [CHANGELOG.md](CHANGELOG.md) `[0.4]` archive.*

---

## Feature tracks (what ships today)

| # | Track | In the game |
|---|-------|-------------|
| 1 | Defense & combat | Stone/wood/iron gear; forge; raids; walls/towers/barracks; guards; combat log |
| 2 | Health & medicine | Hospital + Doctor; rep/energy buffs; Medicine research; plague events |
| 3 | Farming | Farm, greenhouse, silo, mill, barn — daily production |
| 4 | Production & crafting | Workshop recipes; Blacksmith iron spears & shields |
| 5 | Skills | Per-job XP 0–100; School juvenile aging |
| 6 | Diplomacy & tribes | Visitors, rivals, peace, raids, leader talk |
| 7 | Map | Small / Medium / Large; five terrain presets |
| 8 | Wildlife | Food chain; grazing pressure; taming; Moon Howlers |
| 9 | Culture & events | Church; festivals; Renffr; disasters; election ceremony |
| 10 | Victory & endgame | Four paths; challenges; chronicle; Roadmap tab |

---

## Timeline (newest first)

| When | Release |
|------|---------|
| End Jul 2026 | **v0.5.0** — scale + architecture |
| 2026-07-05 | **v0.4.2** — craft, walls/guards, juice, balance |
| Jul 2026 | **v0.4.1** — tribes, diplomacy, raids, victories |
| Jun 2026 | **v0.4** — clarity, tutorial, chronicle |

---

<p align="center"><em><strong>v0.4.2 shipped</strong> → <a href="ROADMAP_0.5.0.md">v0.5.0</a> (end July 2026)</em></p>