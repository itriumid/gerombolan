// The simulation has to give the same run for the same seed and inputs, on every JavaScript
// engine: the game runs it in the webview (JavaScriptCore on macOS), and the leaderboard will
// replay submitted runs on Cloudflare Workers (V8). These tests run in Node (V8); the known runs
// below were measured in both engines.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { MOST_RUNNERS, STEPS_PER_SECOND, apply, carefulInputs, createRun, fitGate, hashRun, laneAt, scriptedInputs } from '../src/lib/game/simulation.ts';
import { describeKnownRuns } from './known-runs.ts';

const TEN_MINUTES = STEPS_PER_SECOND * 600;

// A careful player on seeds in both worlds, identical in V8 (Node) and JavaScriptCore (macOS's jsc), measured
// with scripts/check-engines.ts. A change to the simulation that changes these changes every
// recorded run, so it's a decision, not a side effect: update them on purpose, check both engines
// again, and say so in the pull request.
const KNOWN_RUNS = [
	{ world: 'balanced', seed: 1, hash: '774fa2fc', meters: 3120.277 },
	{ world: 'balanced', seed: 42, hash: '90678260', meters: 840.197 },
	{ world: 'balanced', seed: 20261007, hash: 'ed2d05ae', meters: 3120.277 },
	{ world: 'balanced', seed: 39, hash: '469838ea', meters: 1200.009 },
	{ world: 'chaos', seed: 7, hash: '2742a5bb', meters: 1040.082 },
	{ world: 'chaos', seed: 1913, hash: '21af40ca', meters: 40.1 },
	{ world: 'chaos', seed: 4242, hash: '9f628a13', meters: 1160.2 }
];

test('known runs give the same result they gave when measured', () => {
	assert.deepEqual(describeKnownRuns(), KNOWN_RUNS);
});

test('the same seed and inputs give the same run twice', () => {
	const inputs = scriptedInputs(7, TEN_MINUTES);
	assert.deepEqual(hashRun(7, inputs), hashRun(7, inputs));
});

test('a different seed gives a different world', () => {
	const layout = (seed) => JSON.stringify(createRun(seed).segmentAt(0));
	assert.notEqual(layout(1), layout(2));
});

test('only the next segment exists ahead of the crowd', () => {
	const run = createRun(99);
	assert.ok(run.segmentAt(0));
	assert.equal(run.segmentAt(1), undefined);
	while (run.state.alive && run.state.distance < run.segmentLength) run.step(0);
	if (run.state.alive) {
		assert.ok(run.segmentAt(1));
		assert.equal(run.segmentAt(2), undefined);
	}
});

test('the simulation uses no math that differs between engines', () => {
	// Only the operations IEEE 754 defines exactly. Math.sin, Math.exp, Math.pow and friends may
	// round differently on different engines, and Math.random isn't seeded at all.
	// Comments are left out: the file explains in one why these functions are off limits.
	const source = readFileSync(new URL('../src/lib/game/simulation.ts', import.meta.url), 'utf8')
		.replace(/\/\*[\s\S]*?\*\//g, '')
		.replace(/\/\/.*$/gm, '');
	const allowed = new Set(['imul', 'max', 'min', 'floor', 'abs', 'trunc', 'sign']);
	const used = [...source.matchAll(/Math\.([a-zA-Z0-9]+)/g)].map((match) => match[1]);
	assert.deepEqual(
		used.filter((name) => !allowed.has(name)),
		[],
		'Math functions outside the allowed set'
	);
});

test('every gate row has three gates, at least one of them bad', () => {
	for (let seed = 1; seed <= 100; seed++) {
		meetEverySegment(seed, 'balanced', (segment, count, index) => {
			if (segment.kind !== 'gates') return;
			assert.equal(segment.gates.length, 3);
			assert.ok(segment.gates.some((gate) => gate.operation === '-' || gate.operation === '÷'), `seed ${seed}, segment ${index}`);
			assert.ok(segment.gates.filter((gate) => gate.operation === '×').length <= 1, `seed ${seed}, segment ${index}`);
		});
	}
});

test('no gate ever offers more than the room left under the cap', () => {
	for (const world of ['balanced', 'chaos']) {
		for (let seed = 1; seed <= 150; seed++) {
			meetEverySegment(seed, world, (segment, count, index) => {
				if (segment.kind !== 'gates') return;
				for (const gate of segment.gates) {
					if (gate.operation === '+') assert.ok(count + gate.amount <= MOST_RUNNERS, `${world} ${seed} ${index}: +${gate.amount} at ${count}`);
					if (gate.operation === '×') assert.ok(count * gate.amount <= MOST_RUNNERS, `${world} ${seed} ${index}: ×${gate.amount} at ${count}`);
				}
			});
		}
	}
});

test('fitting a gate: the room left, the biggest multiplier that fits, and +0 at the cap', () => {
	assert.deepEqual(fitGate({ operation: '+', amount: 500 }, 4800), { operation: '+', amount: 200 });
	assert.deepEqual(fitGate({ operation: '×', amount: 4 }, 2000), { operation: '×', amount: 2 });
	assert.deepEqual(fitGate({ operation: '×', amount: 3 }, 3000), { operation: '+', amount: 2000 });
	assert.deepEqual(fitGate({ operation: '+', amount: 30 }, MOST_RUNNERS), { operation: '+', amount: 0 });
	assert.deepEqual(fitGate({ operation: '÷', amount: 2 }, 4999), { operation: '÷', amount: 2 });
	assert.deepEqual(fitGate({ operation: '-', amount: 80 }, 10), { operation: '-', amount: 80 });
});

test('the crowd never goes over the cap', () => {
	assert.equal(apply(MOST_RUNNERS - 1, { operation: '×', amount: 3 }), MOST_RUNNERS);
	assert.equal(apply(MOST_RUNNERS, { operation: '+', amount: 20 }), MOST_RUNNERS);
});

test('the three lanes split the road into thirds', () => {
	assert.deepEqual([-1000, -334, -333, 0, 333, 334, 1000].map(laneAt), [0, 0, 1, 1, 1, 2, 2]);
});

test('a run starts with the leader alone', () => {
	assert.equal(createRun(5).state.count, 1);
});

test('steering has momentum: it speeds up, tops out, and slows to a stop', () => {
	const run = createRun(3);
	run.step(1);
	assert.equal(run.state.sideways, 3, 'speeds up gradually');
	for (let step = 0; step < 30; step++) run.step(1);
	assert.equal(run.state.sideways, 26, 'tops out');
	const moving = run.state.sideways;
	run.step(0);
	assert.ok(run.state.sideways < moving && run.state.sideways > 0, 'letting go slows it down');
	for (let step = 0; step < 30; step++) run.step(0);
	assert.equal(run.state.sideways, 0, 'and stops');
});

test('every count stays a whole number within the cap, in both worlds', () => {
	for (const world of ['balanced', 'chaos']) {
		for (const seed of [7, 4242, 31, 77]) {
			const run = createRun(seed, world);
			for (const input of carefulInputs(seed, STEPS_PER_SECOND * 300, world)) {
				run.step(input);
				assert.ok(Number.isInteger(run.state.count) && run.state.count >= 0 && run.state.count <= MOST_RUNNERS, `${world} ${seed}: ${run.state.count}`);
			}
		}
	}
});

test('no raid is bigger than the cap, so every raider can be drawn', () => {
	for (const world of ['balanced', 'chaos']) {
		for (let seed = 1; seed <= 150; seed++) {
			meetEverySegment(seed, world, (segment, count, index) => {
				if (segment.kind === 'raid') assert.ok(segment.enemies <= MOST_RUNNERS, `${world} ${seed} ${index}`);
			});
		}
	}
});

test('the balanced world caps the crowd at 5,000', () => {
	const run = createRun(1);
	for (const input of carefulInputs(1, STEPS_PER_SECOND * 600)) {
		run.step(input);
		assert.ok(run.state.count <= MOST_RUNNERS);
	}
});

test('WNI has apocalypse raids, big enough to end any run', () => {
	let apocalypses = 0;
	for (let seed = 1; seed <= 400; seed++) {
		meetEverySegment(seed, 'chaos', (segment) => {
			if (segment.kind === 'raid' && segment.enemies === MOST_RUNNERS) apocalypses++;
		});
	}
	assert.ok(apocalypses > 0)
});

/** Plays a careful run and calls `visit` with every segment as the crowd meets it, and its size then. */
function meetEverySegment(seed, world, visit) {
	const run = createRun(seed, world);
	let met = -1;
	for (const input of carefulInputs(seed, STEPS_PER_SECOND * 300, world)) {
		const index = Math.floor(run.state.distance / run.segmentLength);
		if (index !== met) {
			met = index;
			visit(run.segmentAt(index), run.state.count, index);
		}
		run.step(input);
	}
}
