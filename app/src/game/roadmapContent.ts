/** In-game roadmap — one table per version. Dev checklist: ../../ROADMAP_0.5.0.md */

export interface RoadmapVersion {
  version: string;
  theme: string;
  shipDate: string;
  features: string[];
}

export const ROADMAP_TARGET_VERSION = '0.5.0';

export const ROADMAP_NORTH_STAR =
  'A cozy frontier eco-sim where settlers live on a schedule, the food chain matters, the valley feels alive with other people and tribes — and you always know what to do next.';

/** Newest first. All listed features are shipped (🟢). */
export const ROADMAP_VERSIONS: RoadmapVersion[] = [
  {
    version: '0.5.0',
    theme: 'Scale + architecture',
    shipDate: '2026-07-05 (in code · pre-tag)',
    features: [
      'Election ceremony — gather, gossip, tension, reveal, 3-day Election Revelry',
      'Election buildup — year-before notify + settler gossip',
      'Incumbent always in race',
      'Incumbent record score — economy, scandals, village health (+8 positive cap)',
      'Leadership panel, focus hints, contextual tutorial synced',
    ],
  },
  {
    version: '0.4.2',
    theme: 'Craft, walls/guards, juice, UI/UX',
    shipDate: '2026-07-05',
    features: [
      '6-tab sidebar, alert strip, map build hotbar, tab hotkeys V/F/N/P/L/M',
      'Focus Go → actions, Frontier/Progress badges, collapsible inspector',
      'Blacksmith forge queue — iron spears & shields',
      'Forge alerts + Open Blacksmith →',
      'Frontier raid polish — 2–6 day deadline by distance, slower distant march',
      'Village + Frontier raid respond UI; combat preview hints',
      'Walls, watchtowers, barracks; guard patrols; combat log + export',
      'Incoming raid march lines on map',
      'Header ⭐ reputation badge → Trade',
      'Simulation perf — throttles, entity maps, wildlifeCounts',
      'Road / wall / gate rotation (R while placing)',
      'Night glow, build confetti, camera nudge, intro screen',
      '10-year balance PASS — town 9/9 gates',
      '10 external playtests',
      '~40 bug fixes (July 4 comprehensive pass)',
      'Worker commute snap (7am/7pm)',
      'Roads benefit copy in Guide',
      'Reputation — Village explainer + header ⭐',
      'Rival diplomacy — peace, raids, preview, show-militia parade',
      'Visitor tribes — 7 kinds, caravan, refugee negotiate, leader talk',
      'Spear / militia balance',
    ],
  },
  {
    version: '0.4.1',
    theme: 'Tribes, raids, victories, leadership',
    shipDate: '2026-07-04',
    features: [
      'Tribe diplomacy v2 — map camp panel, event cards, respond choices',
      'Frontier raids — defend, barricade, pay off, counter-raid',
      'Combat preview — distance, provisions, defend & raid forecasts',
      'Raid balance — home-turf +25%, distance food 22–50🍖',
      'Peace treaties — sign with rivals; raids blocked at peace',
      'Visitor leader talk — per-kind rewards at camps',
      'Visitor trade + refugee negotiate',
      'Guaranteed first-week visitor (days 4–7)',
      'Trade Empire + Harmony victories (4 active paths)',
      'Village leadership — merit elections every 10 years',
      'Population & families panel',
      'Challenge progress bars + active 🎯 highlight',
      'Nature tab grazing pressure warning',
      'Chronicle export (.txt / .json / .csv)',
      'Focus panel — what to do next',
      'Reputation explainer (Village tab)',
      'Combat status icons on settlers (map)',
      'Prison + Guard job + prisoner UI',
      'Building foundation pads (category colors)',
      'Roads 1.5× walk speed; road_bonus → reputation',
      'In-game Roadmap tab',
      'Eco Master yearly tracking',
    ],
  },
  {
    version: '0.4',
    theme: 'Clarity, chronicle, housing, tutorial',
    shipDate: 'June 2026',
    features: [
      'PNG walk-sheet settlers; Quick Start tutorial',
      'Terrain-aware placement; seasons, weather, pollution, research',
      'Food at meals (8am & 6pm); workshop recipes',
      'Defense research tiers; visitors, rivals, festivals, Moon Howlers',
      'Eco-Utopia + Great City victories',
      'Village chronicle + export on save',
      'Sidebar → 6 tabs; alert strip; map hotbar',
      'Focus hints; armament checklist',
      'House expand (+2 slots); demolish always visible',
      'npm run simulate:30min headless sim',
    ],
  },
];