/** In-game slice of repo-root ROADMAP.md — update when shipping. Plans: ../../ROADMAP_0.4.3.md · ../../ROADMAP_0.4.4.md */

export type RoadmapItemStatus = 'done' | 'partial' | 'open' | 'deferred';

export interface RoadmapItem {
  label: string;
  status: RoadmapItemStatus;
  note?: string;
}

export interface RoadmapSection {
  id: string;
  title: string;
  subtitle?: string;
  items: RoadmapItem[];
}

export const ROADMAP_TARGET_VERSION = '0.4.3';

export const ROADMAP_NORTH_STAR =
  'A cozy frontier eco-sim where settlers live on a schedule, the food chain matters, the valley feels alive with other people and tribes — and you always know what to do next.';

export const ROADMAP_WINNING_MOMENT =
  'I built a house, assigned workers, met a neighbor tribe, armed my village, and everyone came home at night.';

export const ROADMAP_SECTIONS: RoadmapSection[] = [
  {
    id: 'shipped-041',
    title: 'Shipped in v0.4.1',
    subtitle: 'Base frontier alpha',
    items: [
      { label: 'Guaranteed first-week visitor (pilgrims or performers)', status: 'done' },
      { label: 'road_bonus → reputation + floating +rep (roads) text', status: 'done' },
      { label: 'Tribe diplomacy v2 — map camp panel, event cards, respond choices', status: 'done' },
      { label: 'Visitor trade at camps + refugee negotiate screen', status: 'done' },
      { label: 'Nature tab grazing pressure warning (deer vs grass)', status: 'done' },
      { label: 'Challenge progress bars + active 🎯 highlight', status: 'done' },
      { label: 'Population & families panel', status: 'done' },
      { label: 'Reputation explainer (Village tab)', status: 'done' },
      { label: 'Focus panel — what to do next', status: 'done' },
      { label: 'Prison + Guard job + prisoner UI', status: 'done' },
      { label: 'Chronicle export (.txt / .json / .csv)', status: 'done' },
      { label: 'Building foundation pads (category colors)', status: 'done' },
      { label: 'Combat status icons on settlers (map)', status: 'done' },
      { label: 'Roads 1.5× walk speed in simulation', status: 'done' },
      { label: 'Frontier raids — defend, barricade, pay off; counter-raid', status: 'done' },
      { label: 'Combat preview — distance, provisions, defend & raid forecasts', status: 'done' },
      { label: 'Raid balance — home-turf +25%, distance food 22–50🍖, gated forecast', status: 'done' },
      { label: 'In-game Roadmap tab', status: 'done' },
      { label: 'Peace treaties — sign with rivals; diplomacy events; raids blocked', status: 'done' },
      { label: 'Visitor leader talk — per-kind rewards at visitor camps', status: 'done' },
      { label: 'Trade Empire + Harmony victories (4 active paths)', status: 'done' },
      { label: 'Village leadership — merit elections every 10 years', status: 'done' },
    ],
  },
  {
    id: 'shipped-042',
    title: 'Shipped in v0.4.2',
    subtitle: 'GAME_VERSION 0.4.2 · July 5, 2026',
    items: [
      { label: 'UI/UX — 6-tab sidebar, alert strip, map build hotbar, tab hotkeys V/F/N/P/L/M', status: 'done' },
      { label: 'Focus Go → actions, Frontier/Progress badges, collapsible inspector', status: 'done' },
      { label: 'Blacksmith forge queue — iron spears & shields after research + staffed smith', status: 'done' },
      { label: 'Forge alerts + Open Blacksmith → (armament checklist, priority alerts)', status: 'done' },
      { label: 'Frontier raid polish — 2–6 day deadline by camp distance, slower distant march', status: 'done' },
      { label: 'Village + Frontier raid respond UI; pay-off vs counter-raid hint in preview', status: 'done' },
      { label: 'Raid prep UX — readiness card, no battle screen (preparation-focused)', status: 'done' },
      { label: 'Header ⭐ reputation badge — click opens Progress → Trade', status: 'done' },
      { label: 'Roads benefit copy — Infra hint in build catalog + Guide', status: 'done' },
      {
        label: 'Simulation perf — throttles, entity maps, wildlife byType, wildlifeCounts',
        status: 'done',
        note: 'Headless ~1.8 ms/tick avg @ ~550 entities',
      },
      { label: 'Walls, Watchtowers, Barracks — barricade & militia bonuses', status: 'done' },
      { label: 'Barracks guard patrols around village core (work hours)', status: 'done' },
      { label: 'Combat log panel — Log → Combat sub-tab with export', status: 'done' },
      { label: 'Raid march lines on map (pending incoming raids)', status: 'done' },
      { label: 'Road / wall / gate rotation (R while placing)', status: 'done' },
      { label: 'Juice — night glow, build confetti, camera nudge (toggle in ☰ menu)', status: 'done' },
      { label: 'Intro screen refine — ~20s timeline, skip after logo', status: 'done' },
      { label: '10-year balance pass — town PASS 9/9 gates (2026-07-04)', status: 'done' },
      { label: 'Spear / militia balance — iron replaces stone/wooden (militiaBalance.ts)', status: 'done' },
      { label: 'External playtests — 10 power users (PLAYTEST_BETA_10_USERS.md)', status: 'done' },
      { label: 'Eco breakdown + population growth report (beta feedback)', status: 'done' },
      { label: '~40 bug fixes (July 4 comprehensive pass)', status: 'done' },
    ],
  },
  {
    id: 'p2-world',
    title: 'P2 — Next up (v0.4.3)',
    items: [
      {
        label: 'Perf at 500+ entities — spatial grid',
        status: 'open',
        note: 'Target Sep 2026 — see ROADMAP_0.4.3.md',
      },
      { label: 'Counter-raid militia march visuals (optional polish)', status: 'deferred', note: 'Prep-focused combat stays abstract' },
      { label: 'Real-time tactical battles', status: 'deferred' },
    ],
  },
];

export const ROADMAP_NEXT_ACTIONS: string[] = [
  'v0.4.3 (Sep 2026) — spatial grid, dead-entity compaction, benchmark gate (ROADMAP_0.4.3.md)',
  'v0.4.4 (Nov 2026) — incremental maps, App tab split, grass buckets, pooling',
  'Perf v0.5.0 (Q1 2027) — Web Worker gameTick, canvas layers',
];

/** Open fixes — mirrors app/TODO.md for in-game roadmap visibility */
export const ROADMAP_OPEN_FIXES: string[] = [
  'v0.4.3 — spatial grid for graze/hunt/flee at 100+ entities',
  'Player militia march on counter-raid — optional polish; instant resolve today',
  'Real-time tactical battles on map — deferred (abstract strength ratios)',
  'Event log uncapped in saves by design — full chronicle kept forever',
];

export const ROADMAP_DEFERRED: string[] = [
  'Full tribal wars, sieges, embassies, player caravans',
  'Leader perks / government decisions beyond ceremonial head',
  'Fog of war / map expansion',
  'Hospital disease loop, wardogs',
  'Multiplayer',
];