import { BuildingType, BUILDING_CONFIGS, EntityType } from './gameTypes';
import type { Building, Entity } from './gameTypes';

/** 24 ticks = one in-game day. At 1× speed (~1 tick/s) a day lasts ~24 real seconds. */
export const TICKS_PER_DAY = 24;
export const DAYS_PER_YEAR = 360;
/** Full moon hits every ~2 in-game weeks */
export const DAYS_PER_MOON_CYCLE = 14;

export const GAME_YEAR_OFFSET = 1700;
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export function ticksForDays(days: number): number {
  return Math.round(days * TICKS_PER_DAY);
}

/** Life stages — age advances once per game-day, not per tick. */
export const HUMAN_CHILDHOOD_DAYS = 12;
export const HUMAN_ADULT_MIN_AGE = 16;
export const HUMAN_ADULT_MAX_AGE = 120;

/** Female fertility window. Fertility is 1.0 until peak end, then linearly declines to 0. */
export const HUMAN_FERTILITY_START = 16;
export const HUMAN_FERTILITY_PEAK_END = 35;
export const HUMAN_FERTILITY_END = 50;

export function getFemaleFertility(age: number): number {
  if (age < HUMAN_FERTILITY_START || age >= HUMAN_FERTILITY_END) return 0;
  if (age <= HUMAN_FERTILITY_PEAK_END) return 1;
  return 1 - (age - HUMAN_FERTILITY_PEAK_END) / (HUMAN_FERTILITY_END - HUMAN_FERTILITY_PEAK_END);
}

/**
 * Old-age death thresholds, in game-days.
 *
 * These are intentionally compressed from real-world years so a full lifespan
 * is observable during a play session. A settler becomes elderly around day 250
 * and will rarely live past day 400, preventing the v0.4 bug where "60 days"
 * was treated as a 60-year lifespan and wiped out the village in year one.
 */
export const HUMAN_VENERABLE_AGE = 250;
export const HUMAN_MAX_LIFESPAN_DAYS = 400;

export function getOldAgeDeathChance(age: number): number {
  if (age < HUMAN_VENERABLE_AGE) return 0;
  if (age >= HUMAN_MAX_LIFESPAN_DAYS) return 1;
  // Linear rise from ~2% at venerable age to guaranteed at max lifespan.
  return 0.02 + (age - HUMAN_VENERABLE_AGE) / (HUMAN_MAX_LIFESPAN_DAYS - HUMAN_VENERABLE_AGE) * 0.98;
}

/** Small daily chance for an adult to die from illness or accident regardless of age. */
export const HUMAN_DAILY_ILLNESS_CHANCE = 0.0005;

export const PREGNANCY_TICKS = ticksForDays(5);
export const REPRODUCTION_COOLDOWN_TICKS = ticksForDays(8);

/** Building output intervals tied to the day/night calendar. */
export const PRODUCTION_INTERVAL = {
  farm: ticksForDays(1),
  greenhouse: ticksForDays(1),
  lumber: ticksForDays(1),
  quarry: ticksForDays(1),
  mine: ticksForDays(1),
  store: ticksForDays(2),
  market: ticksForDays(2),
  workshop: ticksForDays(2),
  silo: ticksForDays(2),
  townHall: ticksForDays(3),
  hospital: ticksForDays(5),
} as const;

export const IMMIGRATION_CHECK_TICKS = ticksForDays(2);
export const FESTIVAL_CHECK_TICKS = ticksForDays(50);

/** Calendar-aligned event intervals (replace legacy raw tick modulo). */
export const EVENT_INTERVAL = {
  disaster: ticksForDays(40),
  tradeRoute: ticksForDays(8),
  churchCure: ticksForDays(1),
  wolfRecruit: ticksForDays(21),
  tamedHuntAssist: ticksForDays(3),
} as const;

export const NIGHT_START = 20;
export const NIGHT_END = 6;
export const WORK_START = 7;
export const WORK_END = 19;
export const EVENING_START = 19;

/** Work hours per game-day (7am–7pm) — construction only advances during these ticks. */
export const WORK_HOURS_PER_DAY = WORK_END - WORK_START;

/** Total on-site work ticks to finish a building (buildTime in config = game-days). */
export function buildWorkTicks(buildDays: number): number {
  return Math.max(WORK_HOURS_PER_DAY, Math.round(buildDays * WORK_HOURS_PER_DAY));
}

/** Production fires at the start of the work-day, every `interval` ticks. */
export function isProductionTick(tick: number, interval: number): boolean {
  return tick > 0 && tick % interval === WORK_START;
}

export function getHourOfDay(tick: number): number {
  return ((tick % TICKS_PER_DAY) + TICKS_PER_DAY) % TICKS_PER_DAY;
}

export function getCalendarDay(tick: number): number {
  if (tick <= 0) return 0;
  return Math.floor(tick / TICKS_PER_DAY) % 360;
}

/** Get birth date string from entity birth fields */
export function getBirthDateString(entity: { birthYear: number; birthMonth: number; birthDay: number }): string {
  const realYear = GAME_YEAR_OFFSET + entity.birthYear;
  return `${MONTH_NAMES[entity.birthMonth]} ${entity.birthDay + 1}, ${realYear}`;
}

export function isFullMoonDay(calendarDay: number): boolean {
  return calendarDay % DAYS_PER_MOON_CYCLE === 0;
}

/** Full-moon night spans 8pm on a full-moon day through 6am the next morning. */
export function isFullMoonNight(calendarDay: number, hourOfDay: number): boolean {
  if (!isNightHour(hourOfDay)) return false;
  if (isFullMoonDay(calendarDay)) return true;
  if (hourOfDay < NIGHT_END) {
    const prevDay = calendarDay === 0 ? 359 : calendarDay - 1;
    return isFullMoonDay(prevDay);
  }
  return false;
}

export function isNightHour(hour: number): boolean {
  return hour >= NIGHT_START || hour < NIGHT_END;
}

export function isWorkHour(hour: number): boolean {
  return hour >= WORK_START && hour < WORK_END;
}

export function shouldBeAtHome(hour: number): boolean {
  return isNightHour(hour) || hour >= EVENING_START || hour < WORK_START;
}

export function formatHour(hour: number): string {
  const h = ((hour % 24) + 24) % 24;
  const suffix = h < 12 ? 'am' : 'pm';
  const display = h % 12 === 0 ? 12 : h % 12;
  return `${display}${suffix}`;
}

export function isResidenceBuilding(b: Building): boolean {
  return b.completed && (b.type === BuildingType.House || b.type === BuildingType.Mansion);
}

export function isResidenceBuildingType(type: BuildingType): boolean {
  return type === BuildingType.House || type === BuildingType.Mansion;
}

/** Base occupants + bonus from house/mansion upgrades (+2 slots per level above 1). */
export function getResidenceCapacity(residence: Building): number {
  const base = BUILDING_CONFIGS[residence.type].maxOccupants;
  if (!isResidenceBuildingType(residence.type)) return base;
  const level = residence.level || 1;
  return base + (level - 1) * 2;
}

export function getResidenceUpgradeSlotGain(type: BuildingType): number {
  return isResidenceBuildingType(type) ? 2 : 0;
}

/** Building id 0 is valid — never use bare `!id` for assignment checks. */
export function hasWorkAssignment(human: Entity): boolean {
  return human.homeBuildingId != null;
}

export function hasResidenceAssignment(human: Entity): boolean {
  return human.residenceBuildingId != null;
}

export function isImprisoned(human: Entity): boolean {
  return human.prisonBuildingId != null;
}

export function shareResidence(a: Entity, b: Entity): boolean {
  return (
    hasResidenceAssignment(a)
    && hasResidenceAssignment(b)
    && a.residenceBuildingId === b.residenceBuildingId
  );
}

export function isNearResidence(
  human: Entity,
  buildings: Building[],
  maxDist = 55,
): boolean {
  if (!hasResidenceAssignment(human)) return false;
  const residence = buildings.find(
    (b) => b.id === human.residenceBuildingId && isResidenceBuilding(b),
  );
  if (!residence) return false;
  const cx = residence.x + residence.width / 2;
  const cy = residence.y + residence.height / 2;
  return Math.hypot(human.x - cx, human.y - cy) <= maxDist;
}

/** Evening/night/morning or unemployed — not while on a workplace commute. */
export function allowSocialLife(hour: number, hasWorkplace: boolean): boolean {
  return !(isWorkHour(hour) && hasWorkplace);
}

export function countResidentsInBuilding(humans: Entity[], buildingId: number): number {
  return humans.filter((h) => h.alive && h.residenceBuildingId === buildingId).length;
}

export function residenceHasCapacity(
  residence: Building,
  humans: Entity[],
): boolean {
  const cap = getResidenceCapacity(residence);
  return countResidentsInBuilding(humans, residence.id) < cap;
}

/** Whether this human can occupy the residence (accounts for them already holding a slot). */
export function residenceRoomFor(
  human: Entity,
  residence: Building,
  humans: Entity[],
): boolean {
  const cap = getResidenceCapacity(residence);
  let count = countResidentsInBuilding(humans, residence.id);
  if (human.residenceBuildingId === residence.id) count--;
  return count < cap;
}

function pickLeastCrowdedResidence(
  humans: Entity[],
  residences: Building[],
  extraSlots = 1,
): number | undefined {
  let best: Building | undefined;
  let bestCount = Infinity;
  for (const residence of residences) {
    const cap = getResidenceCapacity(residence);
    const count = countResidentsInBuilding(humans, residence.id);
    if (count + extraSlots > cap) continue;
    if (count < bestCount || (count === bestCount && residence.id < (best?.id ?? Infinity))) {
      bestCount = count;
      best = residence;
    }
  }
  return best?.id;
}

function livingHuman(humans: Entity[], id: number | undefined): Entity | undefined {
  if (id === undefined) return undefined;
  return humans.find((h) => h.id === id && h.alive);
}

/** Married couples + children form one household; lone settlers are a household of one. */
export function collectFamilyMembers(
  seed: Entity,
  humans: Entity[],
  visited: Set<number>,
): Entity[] {
  const family: Entity[] = [];
  const queue: Entity[] = [seed];

  while (queue.length > 0) {
    const human = queue.pop()!;
    if (visited.has(human.id)) continue;
    visited.add(human.id);
    family.push(human);

    const partner = livingHuman(humans, human.partnerId);
    if (partner && !visited.has(partner.id)) queue.push(partner);

    const mother = livingHuman(humans, human.motherId);
    if (mother && !visited.has(mother.id)) queue.push(mother);

    const father = livingHuman(humans, human.fatherId);
    if (father && !visited.has(father.id)) queue.push(father);

    for (const childId of human.childrenIds) {
      const child = livingHuman(humans, childId);
      if (child && !visited.has(child.id)) queue.push(child);
    }

    for (const other of humans) {
      if (other.motherId === human.id || other.fatherId === human.id) {
        if (!visited.has(other.id)) queue.push(other);
      }
    }
  }

  return family;
}

/** Keep parent childrenIds in sync with motherId/fatherId on each child. */
/** Rescale legacy per-tick/year ages to the v0.4 day-based calendar. */
export function migrateHumanAges(humans: Entity[], options?: { forceCalendar?: boolean }): void {
  for (const human of humans) {
    if (human.type !== EntityType.Human || human.faction) continue;
    const looksLikeTickAge = human.age > HUMAN_MAX_LIFESPAN_DAYS;
    if (options?.forceCalendar || looksLikeTickAge) {
      if (options?.forceCalendar && human.age > HUMAN_CHILDHOOD_DAYS) {
        human.age = Math.min(
          HUMAN_MAX_LIFESPAN_DAYS - 1,
          Math.max(1, Math.floor(human.age / TICKS_PER_DAY)),
        );
      } else if (looksLikeTickAge) {
        human.age = Math.min(
          HUMAN_MAX_LIFESPAN_DAYS - 1,
          Math.max(HUMAN_ADULT_MIN_AGE, Math.floor(human.age / TICKS_PER_DAY)),
        );
      }
    }
    human.maxAge = HUMAN_MAX_LIFESPAN_DAYS;
    if (human.isJuvenile && human.age >= HUMAN_CHILDHOOD_DAYS) {
      human.isJuvenile = false;
    }
  }
}

export function rebuildChildrenIds(humans: Entity[]): void {
  for (const human of humans) {
    if (human.type !== EntityType.Human) continue;
    human.childrenIds = [];
  }

  for (const child of humans) {
    if (!child.alive || child.type !== EntityType.Human) continue;
    const mother = child.motherId ? humans.find((h) => h.id === child.motherId) : undefined;
    if (mother && !mother.childrenIds.includes(child.id)) {
      mother.childrenIds.push(child.id);
    }
    const father = child.fatherId ? humans.find((h) => h.id === child.fatherId) : undefined;
    if (father && !father.childrenIds.includes(child.id)) {
      father.childrenIds.push(child.id);
    }
  }
}

export function buildFamilyGroups(humans: Entity[]): Entity[][] {
  const visited = new Set<number>();
  const families: Entity[][] = [];

  const sorted = [...humans].sort((a, b) => a.id - b.id);
  for (const human of sorted) {
    if (visited.has(human.id)) continue;
    const family = collectFamilyMembers(human, humans, visited);
    families.push(family);
  }

  return families.sort((a, b) => {
    if (b.length !== a.length) return b.length - a.length;
    return Math.min(...a.map((m) => m.id)) - Math.min(...b.map((m) => m.id));
  });
}

function familyAlreadyInResidence(family: Entity[], residenceId: number): number {
  return family.filter((m) => m.residenceBuildingId === residenceId).length;
}

function familyFitsInResidence(
  family: Entity[],
  residence: Building,
  humans: Entity[],
): boolean {
  const cap = getResidenceCapacity(residence);
  const count = countResidentsInBuilding(humans, residence.id);
  const alreadyHere = familyAlreadyInResidence(family, residence.id);
  const outsiders = count - alreadyHere;
  return outsiders + family.length <= cap;
}

/** Prefer an empty house for each family so separate families don't share a home. */
export function pickResidenceForFamily(
  family: Entity[],
  humans: Entity[],
  residences: Building[],
): number | undefined {
  if (residences.length === 0 || family.length === 0) return undefined;

  let best: Building | undefined;
  let bestScore = Infinity;
  for (const residence of residences) {
    if (!familyFitsInResidence(family, residence, humans)) continue;

    const count = countResidentsInBuilding(humans, residence.id);
    const alreadyHere = familyAlreadyInResidence(family, residence.id);
    const outsiders = count - alreadyHere;
    const cap = getResidenceCapacity(residence);
    const largeFamilyBonus = family.length > 4 ? cap * 10 : 0;
    const score = outsiders * 1000 + count - largeFamilyBonus;

    if (score < bestScore || (score === bestScore && residence.id < (best?.id ?? Infinity))) {
      bestScore = score;
      best = residence;
    }
  }
  return best?.id;
}

function isFamilyHousingValid(
  family: Entity[],
  residences: Building[],
  humans: Entity[],
): boolean {
  const assigned = family.filter((m) => m.residenceBuildingId !== undefined);
  if (assigned.length === 0) return false;
  if (assigned.length !== family.length) return false;

  const houseId = assigned[0].residenceBuildingId!;
  if (!assigned.every((m) => m.residenceBuildingId === houseId)) return false;

  const residence = residences.find((b) => b.id === houseId);
  if (!residence) return false;

  return familyFitsInResidence(family, residence, humans);
}

export function pickResidenceForHuman(
  human: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  if (residences.length === 0) return undefined;

  const visited = new Set<number>();
  const family = collectFamilyMembers(human, humans, visited);
  const familyHouse = pickResidenceForFamily(family, humans, residences);
  if (familyHouse !== undefined) return familyHouse;

  if (human.partnerId) {
    const partner = humans.find((h) => h.id === human.partnerId && h.alive);
    if (partner && hasResidenceAssignment(partner)) {
      const partnerResidence = residences.find((b) => b.id === partner.residenceBuildingId);
      if (partnerResidence && residenceRoomFor(human, partnerResidence, humans)) {
        return partner.residenceBuildingId;
      }
    }
  }

  if (human.motherId && human.isJuvenile) {
    const mother = humans.find((h) => h.id === human.motherId && h.alive);
    if (mother && hasResidenceAssignment(mother)) {
      const motherResidence = residences.find((b) => b.id === mother.residenceBuildingId);
      if (motherResidence && residenceRoomFor(human, motherResidence, humans)) {
        return mother.residenceBuildingId;
      }
    }
  }

  return pickLeastCrowdedResidence(humans, residences);
}

function pickSharedResidence(
  human: Entity,
  partner: Entity,
  humans: Entity[],
  residences: Building[],
): number | undefined {
  const needed = 2;
  let best: Building | undefined;
  let bestCount = Infinity;
  for (const residence of residences) {
    const cap = getResidenceCapacity(residence);
    let count = countResidentsInBuilding(humans, residence.id);
    let slots = needed;
    if (human.residenceBuildingId === residence.id) {
      count--;
      slots--;
    }
    if (partner.residenceBuildingId === residence.id) {
      count--;
      slots--;
    }
    if (count + slots > cap) continue;
    if (count < bestCount || (count === bestCount && residence.id < (best?.id ?? Infinity))) {
      bestCount = count;
      best = residence;
    }
  }
  return best?.id;
}

/** Evict whole families from overcrowded houses (keeps households together). */
export function rebalanceOvercrowdedResidences(
  humans: Entity[],
  residences: Building[],
): void {
  for (const residence of residences) {
    const cap = getResidenceCapacity(residence);
    const occupants = humans.filter(
      (h) => h.alive && !h.faction && h.residenceBuildingId === residence.id,
    );
    if (occupants.length <= cap) continue;

    const visited = new Set<number>();
    const familiesInHouse: Entity[][] = [];
    for (const occupant of occupants.sort((a, b) => a.id - b.id)) {
      if (visited.has(occupant.id)) continue;
      familiesInHouse.push(collectFamilyMembers(occupant, occupants, visited));
    }

    familiesInHouse.sort((a, b) => a.length - b.length);

    const kept = new Set<number>();
    let count = 0;
    for (const family of familiesInHouse) {
      if (count + family.length > cap) continue;
      for (const member of family) kept.add(member.id);
      count += family.length;
    }

    for (const occupant of occupants) {
      if (!kept.has(occupant.id)) occupant.residenceBuildingId = undefined;
    }
  }
}

/** Keep house/mansion occupants in sync with residenceBuildingId for the UI. */
export function syncResidenceOccupants(humans: Entity[], buildings: Building[]): void {
  for (const building of buildings) {
    if (!isResidenceBuilding(building)) continue;
    building.occupants = humans
      .filter((h) => h.alive && h.residenceBuildingId === building.id)
      .map((h) => h.id);
  }
}

/** Place a family — keeps children with parents; only splits when no home fits everyone. */
function assignFamilyToResidence(
  family: Entity[],
  alive: Entity[],
  residences: Building[],
): void {
  const picked = pickResidenceForFamily(family, alive, residences);
  if (picked !== undefined) {
    for (const member of family) member.residenceBuildingId = picked;
    return;
  }

  const adults = family.filter((m) => !m.isJuvenile).sort((a, b) => a.id - b.id);
  const juveniles = family.filter((m) => m.isJuvenile).sort((a, b) => a.id - b.id);

  for (const adult of adults) {
    const house = pickResidenceForHuman(adult, alive, residences);
    if (house !== undefined) adult.residenceBuildingId = house;
  }

  for (const child of juveniles) {
    const mother = child.motherId
      ? alive.find((h) => h.id === child.motherId && h.alive)
      : undefined;
    const father = child.fatherId
      ? alive.find((h) => h.id === child.fatherId && h.alive)
      : undefined;
    const parent = mother ?? father;
    if (parent?.residenceBuildingId != null) {
      const parentRes = residences.find((b) => b.id === parent.residenceBuildingId);
      if (parentRes && residenceRoomFor(child, parentRes, alive)) {
        child.residenceBuildingId = parent.residenceBuildingId;
        continue;
      }
    }
    const house = pickResidenceForHuman(child, alive, residences);
    if (house !== undefined) child.residenceBuildingId = house;
  }
}

export function assignMissingResidences(humans: Entity[], buildings: Building[]): void {
  const residences = buildings.filter(isResidenceBuilding);
  if (residences.length === 0) return;

  const alive = humans.filter((h) => h.alive && !h.faction);

  rebuildChildrenIds(alive);

  for (const human of alive) {
    if (
      hasResidenceAssignment(human)
      && !residences.some((b) => b.id === human.residenceBuildingId)
    ) {
      human.residenceBuildingId = undefined;
    }
  }

  rebalanceOvercrowdedResidences(alive, residences);

  const families = buildFamilyGroups(alive);
  for (const family of families) {
    if (isFamilyHousingValid(family, residences, alive)) continue;

    for (const member of family) member.residenceBuildingId = undefined;
    assignFamilyToResidence(family, alive, residences);
  }

  rebalanceOvercrowdedResidences(alive, residences);
  syncResidenceOccupants(humans, buildings);
}

export function syncPartnerResidence(
  human: Entity,
  partner: Entity,
  residences: Building[],
  humans: Entity[],
): void {
  if (residences.length === 0) return;

  const humanResidence = hasResidenceAssignment(human)
    ? residences.find((b) => b.id === human.residenceBuildingId)
    : undefined;
  const partnerResidence = hasResidenceAssignment(partner)
    ? residences.find((b) => b.id === partner.residenceBuildingId)
    : undefined;

  if (
    humanResidence
    && residenceRoomFor(human, humanResidence, humans)
    && residenceRoomFor(partner, humanResidence, humans)
  ) {
    human.residenceBuildingId = humanResidence.id;
    partner.residenceBuildingId = humanResidence.id;
    return;
  }

  if (
    partnerResidence
    && residenceRoomFor(human, partnerResidence, humans)
    && residenceRoomFor(partner, partnerResidence, humans)
  ) {
    human.residenceBuildingId = partnerResidence.id;
    partner.residenceBuildingId = partnerResidence.id;
    return;
  }

  const family = [human, partner];
  const shared = pickResidenceForFamily(family, humans, residences)
    ?? pickSharedResidence(human, partner, humans, residences);
  if (shared !== undefined) {
    human.residenceBuildingId = shared;
    partner.residenceBuildingId = shared;
  }
}