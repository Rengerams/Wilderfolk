/**
 * Quick family sim — courtship, marriage, and births.
 * Run: npx tsx scripts/simulate-family.ts
 */
import { initGame, gameTick, startBuilding, recruitSettler, BuildingType, snapToGrid, canPlaceBuilding } from '../src/game/gameEngine';
import { isPlayerHuman } from '../src/game/groupEvents';

function findSpot(state: ReturnType<typeof initGame>, type: BuildingType, cx: number, cy: number) {
  for (let ring = 0; ring < 10; ring++) {
    const r = 60 + ring * 35;
    for (let i = 0; i < 10; i++) {
      const a = (i / 10) * Math.PI * 2;
      const x = snapToGrid(cx + Math.cos(a) * r);
      const y = snapToGrid(cy + Math.sin(a) * r);
      if (canPlaceBuilding(state, type, x, y)) return [x, y] as const;
    }
  }
  return null;
}

let state = initGame();
state.resources.wood = 3000;
state.resources.stone = 1500;
state.resources.food = 1000;
const cx = state.width / 2;
const cy = state.height / 2;

const houseSpot = findSpot(state, BuildingType.House, cx, cy);
if (houseSpot) state = startBuilding(state, BuildingType.House, houseSpot[0], houseSpot[1]);
for (let i = 0; i < 3; i++) state = recruitSettler(state);

let marriages = 0;
let births = 0;
let scandals = 0;
let bastards = 0;

for (let t = 1; t <= 720; t++) {
  state = gameTick(state);
  for (const e of state.eventLog) {
    if (e.tick !== state.tick) continue;
    if (e.type === 'marriage') marriages++;
    if (e.type === 'birth') births++;
    if (e.type === 'scandal') scandals++;
    if (e.type === 'birth' && e.message.includes('bastard')) bastards++;
  }
}

const humans = state.entities.filter((e) => e.alive && isPlayerHuman(e));
const married = humans.filter((h) => h.relationshipStatus === 'married' || h.relationshipStatus === 'expecting').length;
const children = humans.filter((h) => h.isJuvenile).length;
const singles = humans.filter((h) => h.relationshipStatus === 'single' && !h.isJuvenile).length;

console.log('\n=== Family sim (30 game-days) ===');
console.log(`Humans: ${humans.length} | married pairs: ~${Math.floor(married / 2)} | singles: ${singles} | children: ${children}`);
const bastardChildren = humans.filter((h) => h.isBastard).length;
console.log(`Event log: ${marriages} marriages, ${births} births, ${bastards} bastard births, ${scandals} scandals`);
console.log(`Living bastards: ${bastardChildren}`);
console.log(marriages > 0 && births > 0 ? 'PASS — families forming' : 'FAIL — no marriages or births yet');

if (marriages === 0 || births === 0) process.exitCode = 1;