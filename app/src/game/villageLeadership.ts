import type { Entity, WorldState } from './gameTypes';
import { BuildingType, EntityType, JobType } from './gameTypes';
import { isImprisoned } from './dayCycle';
import { logEvent } from './eventLog';
import { isPlayerHuman } from './groupEvents';
import { ensureEntitySkills, readSkill } from './skills';

export const ELECTION_INTERVAL_YEARS = 10;

export type LeadershipElectionReason = 'founding' | 'decennial' | 'succession';

export interface LeadershipScoreBreakdown {
  entityId: number;
  name: string;
  totalScore: number;
  skillPoints: number;
  experiencePoints: number;
  servicePoints: number;
  communityPoints: number;
}

export interface ElectionAnnouncement {
  title: string;
  message: string;
  leaderName: string;
  changed: boolean;
  reason: LeadershipElectionReason;
}

export function formatSettlerName(entity: Entity): string {
  const base = entity.name || 'Unknown';
  return entity.surname ? `${base} ${entity.surname}` : base;
}

export function isEligibleForLeadership(entity: Entity): boolean {
  return (
    entity.alive
    && entity.type === EntityType.Human
    && isPlayerHuman(entity)
    && !entity.isJuvenile
    && !isImprisoned(entity)
  );
}

/** Merit score — highest wins; ties broken by age, then lower entity id (founders first). */
export function getLeadershipScoreBreakdown(state: WorldState, entity: Entity): LeadershipScoreBreakdown {
  ensureEntitySkills(entity);
  const skillSum = Object.values(JobType).reduce(
    (sum, job) => sum + readSkill(entity, job),
    0,
  );
  const skillPoints = Math.round(skillSum * 2);
  const experiencePoints = Math.round(Math.min(Math.max(0, entity.age - 16), 200) * 0.25);

  const townHall = state.buildings.find(
    (b) => b.completed && b.type === BuildingType.TownHall && b.faction !== 'rival',
  );
  const servicePoints = townHall?.occupants.includes(entity.id) ? 15 : 0;
  const communityPoints = entity.relationshipStatus === 'married' ? 5 : 0;

  return {
    entityId: entity.id,
    name: formatSettlerName(entity),
    skillPoints,
    experiencePoints,
    servicePoints,
    communityPoints,
    totalScore: skillPoints + experiencePoints + servicePoints + communityPoints,
  };
}

export function rankLeadershipCandidates(state: WorldState): LeadershipScoreBreakdown[] {
  const candidates = state.entities
    .filter(isEligibleForLeadership)
    .map((e) => getLeadershipScoreBreakdown(state, e));

  candidates.sort((a, b) => {
    if (b.totalScore !== a.totalScore) return b.totalScore - a.totalScore;
    const entA = state.entities.find((e) => e.id === a.entityId);
    const entB = state.entities.find((e) => e.id === b.entityId);
    const ageA = entA?.age ?? 0;
    const ageB = entB?.age ?? 0;
    if (ageB !== ageA) return ageB - ageA;
    return a.entityId - b.entityId;
  });

  return candidates;
}

export function getVillageLeader(state: WorldState): Entity | null {
  if (state.villageLeaderId == null) return null;
  const leader = state.entities.find((e) => e.id === state.villageLeaderId);
  if (!leader?.alive || !isEligibleForLeadership(leader)) return null;
  return leader;
}

export function isVillageLeader(state: WorldState, entityId: number): boolean {
  return state.villageLeaderId === entityId && getVillageLeader(state) != null;
}

export function getYearsUntilElection(state: WorldState): number {
  if (state.year <= 0) return ELECTION_INTERVAL_YEARS;
  const mod = state.year % ELECTION_INTERVAL_YEARS;
  if (mod === 0 && state.lastElectionYear === state.year) return ELECTION_INTERVAL_YEARS;
  return mod === 0 ? 0 : ELECTION_INTERVAL_YEARS - mod;
}

function scoreSummary(b: LeadershipScoreBreakdown): string {
  return `merit ${b.totalScore} (skills ${b.skillPoints}, experience ${b.experiencePoints}${b.servicePoints ? `, Town Hall +${b.servicePoints}` : ''})`;
}

export function runVillageElection(
  state: WorldState,
  year: number,
  reason: LeadershipElectionReason,
): { leaderId: number | null; changed: boolean; leaderName: string; breakdown: LeadershipScoreBreakdown | null } {
  const ranked = rankLeadershipCandidates(state);
  if (ranked.length === 0) {
    const changed = state.villageLeaderId != null;
    state.villageLeaderId = null;
    return { leaderId: null, changed, leaderName: '', breakdown: null };
  }

  const winner = ranked[0];
  const prevId = state.villageLeaderId;
  const changed = prevId !== winner.entityId;

  state.villageLeaderId = winner.entityId;
  state.leaderSinceYear = year;
  if (reason === 'decennial' || reason === 'founding') {
    state.lastElectionYear = year;
  }

  if (reason === 'founding') {
    logEvent(
      state,
      'event',
      `${winner.name} elected founding village head — ${scoreSummary(winner)}`,
      winner.name,
    );
  } else if (reason === 'decennial') {
    logEvent(
      state,
      'event',
      changed
        ? `${winner.name} elected village head (Year ${year}) — ${scoreSummary(winner)}`
        : `${winner.name} re-elected village head (Year ${year}) — ${scoreSummary(winner)}`,
      winner.name,
    );
  } else {
    logEvent(
      state,
      'event',
      `${winner.name} succeeded as village head — ${scoreSummary(winner)}`,
      winner.name,
    );
  }

  return { leaderId: winner.entityId, changed, leaderName: winner.name, breakdown: winner };
}

export function runFoundingElection(state: WorldState): void {
  runVillageElection(state, state.year, 'founding');
}

function buildAnnouncement(
  result: ReturnType<typeof runVillageElection>,
  reason: LeadershipElectionReason,
  year: number,
): ElectionAnnouncement | null {
  if (!result.leaderName) return null;
  const title = reason === 'decennial'
    ? (result.changed ? '🗳️ New village head' : '🗳️ Head re-elected')
    : '👑 New village head';
  const verb = reason === 'decennial' && !result.changed ? 're-elected' : 'is now village head';
  const merit = result.breakdown ? scoreSummary(result.breakdown) : '';
  return {
    title,
    message: `${result.leaderName} ${verb} (Year ${year}). Elected by merit — ${merit}.`,
    leaderName: result.leaderName,
    changed: result.changed,
    reason,
  };
}

/** If the current head died, was jailed, etc. — elect by merit immediately (once per vacancy). */
export function trySuccessionElection(state: WorldState, year: number): ElectionAnnouncement | null {
  if (state.villageLeaderId == null) return null;

  const leader = state.entities.find((e) => e.id === state.villageLeaderId);
  if (leader?.alive && isEligibleForLeadership(leader)) return null;

  if (!state.entities.some(isEligibleForLeadership)) {
    state.villageLeaderId = null;
    return null;
  }

  const result = runVillageElection(state, year, 'succession');
  return buildAnnouncement(result, 'succession', year);
}

/** Decennial election — call on calendar day 0 only. */
export function tickDecennialElection(
  state: WorldState,
  year: number,
  dayInYear: number,
): ElectionAnnouncement | null {
  if (
    dayInYear !== 0
    || year <= 0
    || year % ELECTION_INTERVAL_YEARS !== 0
    || state.lastElectionYear === year
  ) {
    return null;
  }

  const result = runVillageElection(state, year, 'decennial');
  return buildAnnouncement(result, 'decennial', year);
}

export function validateVillageLeaderOnLoad(state: WorldState): void {
  const leader = getVillageLeader(state);
  if (leader) return;
  if (state.entities.some(isEligibleForLeadership)) {
    runVillageElection(state, state.year, state.villageLeaderId == null ? 'founding' : 'succession');
  }
}