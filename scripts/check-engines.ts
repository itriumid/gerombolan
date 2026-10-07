// Runs the known runs in V8 (this Node) and in JavaScriptCore (Safari's engine, the one the game
// uses on macOS), and fails if they disagree. macOS only: it uses the jsc shell that ships with
// the system. Run with `node scripts/check-engines.ts` after changing the simulation, and copy the
// hashes into tests/simulation.test.mjs if they changed on purpose.

import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs';
import { stripTypeScriptTypes } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { KNOWN_SEEDS, describeKnownRuns } from '../tests/known-runs.ts';

const JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/A/Helpers/jsc';
const simulation = stripTypeScriptTypes(readFileSync(new URL('../src/lib/game/simulation.ts', import.meta.url), 'utf8'));
const knownRuns = stripTypeScriptTypes(readFileSync(new URL('../tests/known-runs.ts', import.meta.url), 'utf8'));
const script = [
	simulation.replace(/^export /gm, ''),
	knownRuns.replace(/^import .*$/gm, '').replace(/^export /gm, ''),
	'print(JSON.stringify(describeKnownRuns()));'
].join('\n');
const file = join(mkdtempSync(join(tmpdir(), 'gerombolan-')), 'engines.js');
writeFileSync(file, script);

const v8 = describeKnownRuns();
const javascriptCore = JSON.parse(execFileSync(JSC, [file], { encoding: 'utf8' }));
console.log('world', 'seed', 'V8', 'JavaScriptCore');
KNOWN_SEEDS.forEach(([world, seed], index) => console.log(world, seed, v8[index].hash, javascriptCore[index].hash));
if (JSON.stringify(v8) !== JSON.stringify(javascriptCore)) {
	console.error('The engines disagree: the simulation uses something that isn\'t deterministic.');
	process.exit(1);
}
console.log('The engines agree.');
