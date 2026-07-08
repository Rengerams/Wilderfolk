import { describe, expect, it } from 'vitest';
import { assignAllWorkers, gameTick, BuildingType } from '@/game/gameEngine';
import { TICKS_PER_DAY } from '@/game/dayCycle';
import { isPlayerHuman } from '@/game/groupEvents';
import { createBuilding, createEntity, initGame } from '@/game/worldGen';
import { EntityType, JobType } from '@/game/gameTypes';
import { withSeededRandom } from '@/test/helpers/seededRandom';

function buildPrisonVillageState() {
  const state = initGame();
  state.entities = state.entities.filter((e) => e.type !== EntityType.Human);

  const prison = createBuilding(BuildingType.Prison, 400, 400, state.nextBuildingId++, 0);
  prison.completed = true;
  const church = createBuilding(BuildingType.Church, 380, 380, state.nextBuildingId++, 0);
  church.completed = true;
  state.buildings.push(prison, church);

  const guardId = state.nextEntityId++;
  const priestId = state.nextEntityId++;
  const guard = createEntity(EntityType.Human, 400, 400, guardId, 400, false, {
    gender: 'male', surname: 'Test', ageYears: 30,
  });
  guard.isJuvenile = false;
  guard.homeBuildingId = prison.id;
  guard.job = JobType.Guard;
  prison.occupants = [guard.id];

  const priest = createEntity(EntityType.Human, 380, 380, priestId, 400, false, {
    gender: 'male', surname: 'Test', ageYears: 30,
  });
  priest.isJuvenile = false;
  priest.homeBuildingId = church.id;
  priest.job = JobType.Priest;
  church.occupants = [priest.id];

  function addMarriedAffair(
    id: number,
    gender: 'male' | 'female',
    x: number,
    y: number,
    partnerId: number,
    spouseId: number,
    spouseX: number,
    spouseY: number,
    spouseGender: 'male' | 'female',
  ) {
    const e = createEntity(EntityType.Human, x, y, id, 400, false, {
      gender, surname: 'Test', ageYears: 30,
    });
    e.isJuvenile = false;
    e.relationshipStatus = 'married';
    e.partnerId = spouseId;
    e.affairProgress = 100;
    e.affairPartnerId = partnerId;
    const spouse = createEntity(EntityType.Human, spouseX, spouseY, spouseId, 400, false, {
      gender: spouseGender, surname: 'Test', ageYears: 30,
    });
    spouse.isJuvenile = false;
    spouse.relationshipStatus = 'married';
    spouse.partnerId = id;
    return [e, spouse] as const;
  }

  const loverAId = state.nextEntityId++;
  const loverBId = state.nextEntityId++;
  const loverCId = state.nextEntityId++;
  const loverDId = state.nextEntityId++;
  const spouseAId = state.nextEntityId++;
  const spouseBId = state.nextEntityId++;
  const spouseCId = state.nextEntityId++;
  const spouseDId = state.nextEntityId++;

  const pairs = [
    addMarriedAffair(loverAId, 'male', 408, 402, loverBId, spouseAId, 620, 600, 'female'),
    addMarriedAffair(loverBId, 'female', 415, 406, loverAId, spouseBId, 630, 610, 'male'),
    addMarriedAffair(loverCId, 'male', 402, 408, loverDId, spouseCId, 700, 650, 'female'),
    addMarriedAffair(loverDId, 'female', 410, 412, loverCId, spouseDId, 710, 660, 'male'),
  ];
  for (const [a, b] of pairs) state.entities.push(a, b);
  state.entities.push(guard, priest);

  const loverPins = new Map([
    [loverAId, { x: 408, y: 402 }],
    [loverBId, { x: 415, y: 406 }],
    [loverCId, { x: 402, y: 408 }],
    [loverDId, { x: 410, y: 412 }],
  ]);
  return { state, loverPins };
}

/**
 * Integration smoke — full gameTick with seeded RNG.
 * Caught/imprison/divorce paths are covered deterministically in lifeSimulation.affair.test.ts.
 * Seed 123 reliably surfaces both rumor gossip and caught scandals over 120 days.
 */
describe('prison pipeline', () => {
  it('120-day gameTick can surface scandal gossip near staffed prison', () => {
    withSeededRandom(123, () => {
      const { state: initial, loverPins } = buildPrisonVillageState();
      let state = initial;
      const loverIds = new Set(loverPins.keys());
      const players = () => state.entities.filter(isPlayerHuman);

      for (let t = 0; t < 120 * TICKS_PER_DAY; t++) {
        if (t % TICKS_PER_DAY === 0) {
          for (const entity of state.entities) {
            if (!loverIds.has(entity.id)) continue;
            const pin = loverPins.get(entity.id);
            if (pin) {
              entity.x = pin.x;
              entity.y = pin.y;
            }
          }
        }
        assignAllWorkers(players(), state.buildings);
        state = gameTick(state);
      }

      const scandals = state.eventLog.filter((e) => e.type === 'scandal');
      const rumorScandals = scandals.filter((e) => e.message.includes('Whispers spread'));
      expect(scandals.length).toBeGreaterThanOrEqual(1);
      expect(rumorScandals.length).toBeGreaterThanOrEqual(1);
    });
  }, 60_000);
});