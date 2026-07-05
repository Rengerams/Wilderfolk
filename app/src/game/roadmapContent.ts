/** In-game roadmap — shipped work per version only. Dev checklist: ../../ROADMAP_0.5.0.md */

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

export const ROADMAP_TARGET_VERSION = '0.5.0';

export const ROADMAP_NORTH_STAR =
  'A cozy frontier eco-sim where settlers live on a schedule, the food chain matters, the valley feels alive with other people and tribes — and you always know what to do next.';

export const ROADMAP_WINNING_MOMENT =
  'I hit 300 people on a large map, opened every sidebar tab at 10×, and the valley still felt alive — no stutter.';

/** Player-facing sections — done items only. */
export const ROADMAP_SECTIONS: RoadmapSection[] = [
  {
    id: 'version-chain',
    title: 'Versions',
    subtitle: 'Newest first',
    items: [
      {
        label: 'v0.5.0 — Scale + architecture',
        status: 'done',
        note: 'End July 2026 — election ceremony on main',
      },
      { label: 'v0.4.2 — Craft, walls/guards, juice, UI/UX', status: 'done', note: '2026-07-05' },
      { label: 'v0.4.1 — Tribes, raids, victories, leadership', status: 'done', note: 'July 2026' },
      { label: 'v0.4 — Clarity, tutorial, chronicle', status: 'done', note: 'June 2026' },
    ],
  },
  {
    id: 'shipped-050',
    title: 'v0.5.0 (on main — pre-tag)',
    subtitle: 'Shipped in code before GAME_VERSION bump',
    items: [
      { label: 'Election ceremony — gather, gossip, tension, reveal, 3-day Election Revelry', status: 'done' },
      { label: 'Election buildup — year-before notify + settler gossip', status: 'done' },
      { label: 'Incumbent always in race (getElectionRaceCandidates)', status: 'done' },
      { label: 'Incumbent record score — economy, scandals, village health (+8 positive cap)', status: 'done' },
      { label: 'Leadership panel, focus hints, contextual tutorial synced', status: 'done' },
    ],
  },
  {
    id: 'top-10-shipped',
    title: 'Feature tracks (shipped)',
    subtitle: 'Major systems in the game today',
    items: [
      { label: 'Defense — stone/wood/iron gear, forge queue, raids, walls, guards, combat log', status: 'done' },
      { label: 'Health — Hospital, Doctor job, Medicine research, plague events', status: 'done' },
      { label: 'Farming — farms, greenhouse, silo, mill, barn daily production', status: 'done' },
      { label: 'Production — Workshop recipes, Blacksmith iron spears & shields', status: 'done' },
      { label: 'Skills — per-job XP 0–100, School juvenile aging', status: 'done' },
      { label: 'Diplomacy — visitors, rivals, peace, raids, leader talk', status: 'done' },
      { label: 'Map — Small/Medium/Large sizes, five terrain presets', status: 'done' },
      { label: 'Wildlife — food chain, grazing pressure, taming, Moon Howlers', status: 'done' },
      { label: 'Culture — festivals, Church, Renffr, election ceremony', status: 'done' },
      { label: 'Victory — four paths, challenges, chronicle export', status: 'done' },
    ],
  },
  {
    id: 'shipped-042',
    title: 'v0.4.2',
    subtitle: 'GAME_VERSION 0.4.2 · 2026-07-05',
    items: [
      { label: 'UI/UX — 6-tab sidebar, alert strip, map build hotbar, tab hotkeys V/F/N/P/L/M', status: 'done' },
      { label: 'Focus Go → actions, Frontier/Progress badges, collapsible inspector', status: 'done' },
      { label: 'Blacksmith forge queue — iron spears & shields after research + staffed smith', status: 'done' },
      { label: 'Forge alerts + Open Blacksmith → (armament checklist, priority alerts)', status: 'done' },
      { label: 'Frontier raid polish — 2–6 day deadline by camp distance, slower distant march', status: 'done' },
      { label: 'Village + Frontier raid respond UI; pay-off vs counter-raid hint in preview', status: 'done' },
      { label: 'Raid prep UX — readiness card, preparation-focused combat', status: 'done' },
      { label: 'Header ⭐ reputation badge — click opens Progress → Trade', status: 'done' },
      { label: 'Roads benefit copy — Infra hint in build catalog + Guide', status: 'done' },
      { label: 'Simulation perf — throttles, entity maps, wildlife byType, wildlifeCounts', status: 'done' },
      { label: 'Walls, Watchtowers, Barracks — barricade & militia bonuses', status: 'done' },
      { label: 'Barracks guard patrols around village core (work hours)', status: 'done' },
      { label: 'Combat log panel — Log → Combat sub-tab with export', status: 'done' },
      { label: 'Raid march lines on map (pending incoming raids)', status: 'done' },
      { label: 'Road / wall / gate rotation (R while placing)', status: 'done' },
      { label: 'Juice — night glow, build confetti, camera nudge (toggle in ☰ menu)', status: 'done' },
      { label: 'Intro screen refine — ~20s timeline, skip after logo', status: 'done' },
      { label: '10-year balance pass — town PASS 9/9 gates (2026-07-04)', status: 'done' },
      { label: 'Spear / militia balance — iron replaces stone/wooden (militiaBalance.ts)', status: 'done' },
      { label: 'External playtests — 10 power users (TECHNICAL.md playtest report)', status: 'done' },
      { label: 'Eco breakdown + population growth report (beta feedback)', status: 'done' },
      { label: '~40 bug fixes (July 4 comprehensive pass)', status: 'done' },
      { label: 'Worker commute — 7am/7pm snap when far from job', status: 'done' },
      { label: 'Rival diplomacy — peace, raids, preview, show-militia parade', status: 'done' },
      { label: 'Visitor tribes — 7 kinds, caravan, refugee negotiate, leader talk', status: 'done' },
      { label: 'Roads — walk speed, adjacency, rotation', status: 'done' },
      { label: 'Reputation — Village explainer + header ⭐', status: 'done' },
    ],
  },
  {
    id: 'shipped-041',
    title: 'v0.4.1',
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
];