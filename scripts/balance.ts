// How hard is a run? Plays many seeds with three kinds of player and prints how far they get:
//   careful   always takes the gate that leaves the biggest crowd
//   sloppy    careful, but takes a random gate a quarter of the time
//   careless  takes a random gate every time
// Run with `node scripts/balance.ts` after changing anything in the simulation's numbers. It
// measures both worlds: balanced (Endless and Daily) and chaos (WNI).

import { STEPS_PER_SECOND, apply, createRun, steerToward, type World } from '../src/lib/game/simulation.ts';

const SEEDS = 2000;
const MOST_STEPS = STEPS_PER_SECOND * 60 * 60; // an hour

function play(seed: number, mistakes: number, world: World) {
	const run = createRun(seed, world);
	let chance = (seed * 2654435761) >>> 0;
	const roll = () => ((chance = (Math.imul(chance ^ (chance >>> 13), 0x5bd1e995) + 1) >>> 0) % 1000) / 1000;
	let decided = -1;
	let lane: 0 | 1 | 2 = 1;
	let peak = run.state.count;
	for (let step = 0; step < MOST_STEPS && run.state.alive; step++) {
		const index = Math.floor(run.state.distance / run.segmentLength);
		const segment = run.segmentAt(index);
		if (segment.kind === 'gates' && decided !== index) {
			decided = index;
			const outcomes = segment.gates.map((gate) => apply(run.state.count, gate, run.most));
			lane = roll() < mistakes ? (Math.floor(roll() * 3) as 0 | 1 | 2) : (outcomes.indexOf(Math.max(...outcomes)) as 0 | 1 | 2);
		}
		run.step(steerToward(run.state.x, run.state.sideways, lane));
		peak = Math.max(peak, run.state.count);
	}
	return { meters: Math.floor(run.state.distance / 1000), seconds: Math.round(run.state.step / STEPS_PER_SECOND), peak };
}

const percentile = (values: number[], share: number) => [...values].sort((a, b) => a - b)[Math.floor((values.length - 1) * share)];

for (const world of ['balanced', 'chaos'] as const) {
console.log(`== ${world}`);
for (const [name, mistakes] of [['careful', 0], ['sloppy', 0.25], ['careless', 1]] as const) {
	const runs = Array.from({ length: SEEDS }, (_, seed) => play(seed + 1, mistakes, world));
	const meters = runs.map((run) => run.meters);
	const seconds = runs.map((run) => run.seconds);
	const peaks = runs.map((run) => run.peak);
	console.log(
		`${name.padEnd(9)} meters: median ${percentile(meters, 0.5)}, 10% ${percentile(meters, 0.1)}, 90% ${percentile(meters, 0.9)}, best ${Math.max(...meters)}` +
			` | minutes: median ${(percentile(seconds, 0.5) / 60).toFixed(1)}, 90% ${(percentile(seconds, 0.9) / 60).toFixed(1)}` +
			` | peak crowd: median ${percentile(peaks, 0.5)}, 90% ${percentile(peaks, 0.9)}`
	);
}
}
