// The known runs both the tests and scripts/check-engines.ts replay: a careful player on a few
// seeds in each world, for up to ten minutes each. Kept free of imports from Node, so it runs in
// jsc too.

import { STEPS_PER_SECOND, carefulInputs, hashRun, type World } from '../src/lib/game/simulation.ts';

export const KNOWN_SEEDS: [World, number][] = [
	['balanced', 1],
	['balanced', 42],
	['balanced', 20261007],
	['balanced', 39],
	['chaos', 7],
	['chaos', 1913],
	['chaos', 4242]
];

export function describeKnownRuns() {
	return KNOWN_SEEDS.map(([world, seed]) => {
		const result = hashRun(seed, carefulInputs(seed, STEPS_PER_SECOND * 600, world), world);
		return { world, seed, hash: result.hash, meters: result.distance / 1000 };
	});
}
