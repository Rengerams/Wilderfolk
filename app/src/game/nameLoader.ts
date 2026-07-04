import { EntityType, type WorldState } from './gameTypes';

let maleNames: string[] = [];
let femaleNames: string[] = [];
let lastNames: string[] = [];
let loaded = false;

function parseNames(text: string): string[] {
  return text
    .split('\n')
    .map((n) => n.trim())
    .filter((n) => n.length > 0)
    .map(capitalize);
}

function capitalize(s: string): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

export async function loadNames(): Promise<void> {
  if (loaded) return;
  const [male, female, last] = await Promise.all([
    import('./data/male-first-names.txt?raw').then((m) => m.default),
    import('./data/female-first-names.txt?raw').then((m) => m.default),
    import('./data/last-names.txt?raw').then((m) => m.default),
  ]);
  maleNames = parseNames(male);
  femaleNames = parseNames(female);
  lastNames = parseNames(last);
  loaded = true;
}

export function getRandomMaleName(): string {
  return maleNames[Math.floor(Math.random() * maleNames.length)] || 'John';
}

export function getRandomFemaleName(): string {
  return femaleNames[Math.floor(Math.random() * femaleNames.length)] || 'Mary';
}

export function getRandomSurname(): string {
  return lastNames[Math.floor(Math.random() * lastNames.length)] || 'Smith';
}

export function getRandomName(gender: 'male' | 'female'): string {
  return gender === 'male' ? getRandomMaleName() : getRandomFemaleName();
}

export function areNamesLoaded(): boolean {
  return loaded;
}

/** Regenerate names for humans that still have the default fallback names. */
export function fixDefaultNames(state: WorldState): void {
  if (!loaded) return;
  for (const entity of state.entities) {
    if (!entity.alive || entity.type !== EntityType.Human) continue;
    const isDefaultFirst = entity.name === 'John' || entity.name === 'Mary';
    const isDefaultLast = entity.surname === 'Smith' || entity.surname === undefined || entity.surname === '';
    if (isDefaultFirst || isDefaultLast) {
      entity.name = getRandomName(entity.gender === 'male' ? 'male' : 'female');
      entity.surname = getRandomSurname();
    }
  }
}
