# Wilderfolk

**Where Beasts and Kin Unite** · *Early Alpha · **v0.4.2 shipped** (July 5, 2026) · targeting v0.4.3*

### Build your village inside a living food chain — or watch it collapse.

You are not conquering nature. You are **moving into it**. Grass, rabbits, deer, wolves, foxes, Moon Howlers, rival camps, and winter all have opinions about your town hall.

```
🌿 → 🐰 🦌 → 🐺 🦊 → 🏹 → 🏘️
```

**Don't kill all the wolves.** That's not a cute tagline — it's a warning. Wipe out the predators and your village starves two seasons later.

> **Early alpha** — bugs, rough edges, and features in flux. You're playtesting the trail before installer / Steam.

| Doc | For |
|-----|-----|
| **[app/README.md](app/README.md)** | Players — how to play, tips, controls |
| **[TECHNICAL.md](TECHNICAL.md)** | Developers — architecture, tick model, file map |
| **[ROADMAP.md](ROADMAP.md)** | Plan — alpha → v1 → Steam |
| **[ROADMAP_0.4.3.md](ROADMAP_0.4.3.md)** | v0.4.3 — scale & perf (Sep 2026) |
| **[ROADMAP_0.4.4.md](ROADMAP_0.4.4.md)** | v0.4.4 — perf Phase 2 + UI split (Nov 2026) |
| **[SESSION_SUMMARY.md](SESSION_SUMMARY.md)** | Dev log — what shipped, when |
| **[app/AUDIO_CREDITS.md](app/AUDIO_CREDITS.md)** | Music & SFX — OpenGameArt sources and licenses |

## What's in v0.4.1

- **PNG walk-sheet settlers** — 4-frame animation, 4 outfit variants per gender
- **First-night tutorial** — Quick Start walks you through building a house before 8pm
- **Visible hunting** — chase lines, floating hunt/combat text, predator prey dynamics on the map
- **Weapons & shields** — Defense research (stone spears → iron gear at the Blacksmith)
- **Frontier raids** — defend, barricade, pay tribute, counter-raid; combat preview with distance-scaled provisions
- **Tribe diplomacy v2** — map camp panels, rival events, visitor trade, refugee negotiate, peace treaties, talk to visitor leaders
- **Village leadership** — merit-based elections every 10 years (👑 village head)
- **Day/night schedule** — settlers sleep at home, work during the day
- **Food chain sim** — wolves, deer, grass, pollution, seasons
- **Visitors & rival camps** on the same map
- **Moon Howlers**, festivals, disasters
- **Four active victory paths** — Eco-Utopia, Great City, Trade Empire, Harmony
- **Terrain-aware building** — can't place on water, mountains, or snow

## What's in v0.4.2 (shipped July 5, 2026)

`GAME_VERSION` is **0.4.2**. `0.4.1` saves migrate on load.

- **6-tab UI** — alert strip, map build hotbar, tab hotkeys V/F/N/P/L/M
- **Blacksmith forge** — iron spears/shields after research + staffed smith
- **Defense** — walls, towers, barracks, guard patrols; **Log → Combat**
- **Frontier raids = preparation** — combat preview, readiness card; no battle screen
- **Road rotation (R)**, juice pass (toggle in ☰ menu), intro screen refine
- **10-year balance PASS** · **10-user beta** — [app/docs/PLAYTEST_BETA_10_USERS.md](app/docs/PLAYTEST_BETA_10_USERS.md)
- **~40 bug fixes** (July 4) + beta UX — [app/CHANGELOG.md](app/CHANGELOG.md) `[0.4.2]`

## What's coming

Release chain after v0.4.2 — full plans in [ROADMAP.md](ROADMAP.md).

| Version | When (target) | Theme | Highlights |
|---------|---------------|-------|------------|
| **0.4.2** | **Shipped** Jul 2026 | Craft, defense, juice | [app/CHANGELOG.md](app/CHANGELOG.md) `[0.4.2]` |
| **0.4.3** | Sep 2026 | Scale & perf | Spatial grid, large-map stability, 100+ settlers without hitch → [ROADMAP_0.4.3.md](ROADMAP_0.4.3.md) |
| **0.4.4** | Nov 2026 | Perf Phase 2 + UI | Faster sidebar at city size, grass render polish, App tab split → [ROADMAP_0.4.4.md](ROADMAP_0.4.4.md) |
| **0.5.0** | Q1 2027 | Architecture | Web Worker simulation, canvas layers — see [ROADMAP.md](ROADMAP.md) Phase 4 |
| **1.0 / Steam** | TBD | Real release | Installer or Steam — no Node.js, no terminal |

**Not on the near-term list:** real-time tactical battles on the map, multiplayer, fog of war, hospital disease loop — tracked in [ROADMAP.md](ROADMAP.md).

## Coming soon: install & play (or Steam)

The goal is a **normal game release** — download an installer or grab it on **Steam**, launch it, done. No Node.js, no command line.

That's the target. This repo is the **early alpha playtest** while we get there.

## Play the alpha now

*For testers only — temporary setup.*

1. Install [Node.js 20+](https://nodejs.org)
2. Open a terminal in this folder
3. Run:

```bash
npm install
npm start
```

4. Open **http://localhost:5173** (or the port shown in the terminal)

### Optional (developers)

```bash
npm run build      # production build
npm run lint       # ESLint
npm run sprites:humans   # regenerate human outfit variant PNGs
```
