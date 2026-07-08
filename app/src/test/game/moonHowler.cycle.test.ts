import { describe, expect, it } from 'vitest';
import { createEntity } from '@/game/worldGen';
import { withLifeAge } from '@/test/fixtures/gameFixtures';
import {
  curseMoonHowler,
  isActiveMoonHowler,
  isMoonHowlerTransformTick,
  syncMoonHowlerForms,
  transformToWerewolfForm,
} from '@/game/moonHowler';
import {
  DAYS_PER_MOON_CYCLE,
  NIGHT_START,
  TICKS_PER_DAY,
  WORK_START,
} from '@/game/dayCycle';
import { EntityType } from '@/game/gameTypes';

describe('moon howler full-moon cycle', () => {
  it('cursed settler transforms every 14 colony days on 8pm ticks', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    const entities = [h];

    const huntDays: number[] = [];
    const totalTicks = TICKS_PER_DAY * 45;

    for (let tick = 1; tick <= totalTicks; tick++) {
      const colonyDay = Math.floor(tick / TICKS_PER_DAY);
      const hourOfDay = tick % TICKS_PER_DAY;
      syncMoonHowlerForms(entities, colonyDay, hourOfDay);

      if (isMoonHowlerTransformTick(colonyDay, hourOfDay) && isActiveMoonHowler(h)) {
        const last = huntDays[huntDays.length - 1];
        if (last !== colonyDay) huntDays.push(colonyDay);
      }
    }

    expect(huntDays).toEqual([0, 14, 28, 42]);
    expect(h.type).toBe(EntityType.Human);
    expect(h.moonHowlerCursed).toBe(true);
  });

  it('stays human between full moons after dawn revert', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    const entities = [h];

    syncMoonHowlerForms(entities, 0, NIGHT_START);
    expect(h.type).toBe(EntityType.Werewolf);

    syncMoonHowlerForms(entities, 1, WORK_START);
    expect(h.type).toBe(EntityType.Human);
    expect(h.moonHowlerCursed).toBe(true);

    for (let day = 2; day < DAYS_PER_MOON_CYCLE; day++) {
      syncMoonHowlerForms(entities, day, NIGHT_START);
      syncMoonHowlerForms(entities, day, WORK_START);
      expect(h.type).toBe(EntityType.Human);
    }
  });

  it('transformToWerewolfForm runs when cursed on an active full-moon night', () => {
    const h = createEntity(EntityType.Human, 0, 0, 1, 250, false);
    withLifeAge(h, 22);
    curseMoonHowler(h);
    transformToWerewolfForm(h);
    expect(h.type).toBe(EntityType.Werewolf);
    expect(h.moonHowlerCursed).toBe(true);
  });
});