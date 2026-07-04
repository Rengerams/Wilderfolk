/**
 * Run headless sims with a valid Node 25+ localStorage file (avoids startup warning).
 * tsx spawns a child Node process — NODE_OPTIONS must include --localstorage-file.
 * Usage: node scripts/run-sim.mjs scripts/simulate-30min.ts
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const appRoot = resolve(here, '..');
const cacheDir = join(appRoot, 'node_modules', '.cache');
const storageFile = resolve(cacheDir, 'wilderfolk-sim-localstorage.json');
const tsxCli = join(appRoot, 'node_modules', 'tsx', 'dist', 'cli.mjs');
const script = process.argv[2];

if (!script) {
  console.error('Usage: node scripts/run-sim.mjs <script.ts>');
  process.exit(1);
}

mkdirSync(cacheDir, { recursive: true });
if (!existsSync(storageFile)) {
  writeFileSync(storageFile, '{}', 'utf8');
}

const storageFlag = `--localstorage-file=${storageFile}`;
const prior = process.env.NODE_OPTIONS?.trim();
const nodeOptions = prior?.includes('--localstorage-file')
  ? prior
  : prior
    ? `${storageFlag} ${prior}`
    : storageFlag;

const result = spawnSync(process.execPath, [tsxCli, script], {
  cwd: appRoot,
  stdio: 'inherit',
  env: { ...process.env, NODE_OPTIONS: nodeOptions },
});

process.exit(result.status ?? 1);