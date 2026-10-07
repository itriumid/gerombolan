// The deterministic part of the game: the same seed and the same inputs give the same run, on any
// JavaScript engine. Only integers and the four basic operations, which IEEE 754 defines exactly,
// so the result can't depend on the engine's Math.sin or Math.exp. Positions are fixed-point:
// thousandths of the road's half width, millimeters of distance.
//
// What makes it hard, by design: the run speeds up, every gate row has at least one bad gate,
// multipliers are rare, bad gates grow with distance, and raids grow by about a fifth each time,
// faster than careful gate choices can keep up with for long. The crowd caps at MOST_RUNNERS, so
// multiplying can't outrun the raids forever.
//
// The cap is the same in every mode, and so is the largest raid: every person on screen is one
// figure, so what the player sees is always exactly the count. No gate ever offers more than the
// crowd has room for: each gate row is generated when the crowd reaches the segment before it, its
// size known, and its gates are fitted to the room left (see fitGate). Only the next segment exists
// ahead of the crowd at any time.

export const STEPS_PER_SECOND = 60;
/**
 * The largest crowd, and the largest raid, in every mode: as many as can be drawn one figure per
 * person. In Endless and Daily it's the wall that eventually ends every good run.
 */
export const MOST_RUNNERS = 5000;
/** A run starts with the leader alone; the first gates build the crowd. */
export const START_RUNNERS = 1;
const ROAD_LIMIT = 1000; // x runs from -1000 (left edge) to 1000 (right edge)
const LANE_EDGE = 333; // three lanes: left of -333, between, right of 333
// Steering has momentum: the leader speeds up into a turn, tops out, and slows to a stop when let
// go or steered the other way. A full sweep across the road takes about 1.3 seconds.
const STEER_ACCELERATION = 3; // per step, while steering
const STEER_FRICTION = 4; // per step, when not steering that way
const STEER_TOP_SPEED = 26; // thousandths of the half width, per step
const START_SPEED = 200; // millimeters a step: 12 meters a second
const TOP_SPEED = 334; // 20 meters a second
const SPEEDUP_EVERY = 20_000; // a millimeter a step faster every 20 meters
const SEGMENT_LENGTH = 40_000; // a gate row or a raid every 40 meters
const RAID_EVERY = 3; // every third segment is a raid

/** mulberry32: a small seeded random number generator built only on 32-bit integer math. */
function random(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let t = state;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return (t ^ (t >>> 14)) >>> 0;
	};
}

export type Operation = '+' | '-' | '×' | '÷';
export type Gate = { operation: Operation; amount: number };
export type Segment =
	| { kind: 'gates'; at: number; gates: [Gate, Gate, Gate] }
	| { kind: 'raid'; at: number; enemies: number };

export const isGood = (gate: Gate) => gate.operation === '+' || gate.operation === '×';

/**
 * Which kind of world a run is generated as. Balanced (Endless and Daily) gets harder steadily and
 * always offers a way through a gate row; chaos (WNI) is anything at any moment, survivable or not.
 */
export type World = 'balanced' | 'chaos';

/** The balanced track, generated from the seed one segment at a time, as the crowd reaches each. */
function balancedGenerator(seed: number) {
	const next = random(seed);
	const below = (limit: number) => next() % limit;
	let raids = 0;

	return (index: number): Segment => {
		const at = (index + 1) * SEGMENT_LENGTH;
		if (index % RAID_EVERY === RAID_EVERY - 1) {
			// Each raid is about a fifth bigger than the last.
			let enemies = 8 + below(6);
			for (let raid = 0; raid < raids; raid++) enemies = Math.floor((enemies * 122) / 100) + 2;
			raids++;
			return { kind: 'raid', at, enemies: Math.min(enemies, MOST_RUNNERS) };
		}
		const depth = index; // how far along: bad gates grow with it
		const good = (): Gate =>
			below(100) < 16
				? { operation: '×', amount: depth > 12 && below(100) < 25 ? 3 : 2 }
				: { operation: '+', amount: 6 + below(8 + depth) };
		const bad = (): Gate =>
			below(100) < 25
				? { operation: '÷', amount: depth > 15 && below(100) < 30 ? 3 : 2 }
				: { operation: '-', amount: 5 + below(10 + depth * 3) };
		// At least one bad gate, often two, and at most one multiplier, in a shuffled order.
		const gates: Gate[] = [good(), bad(), below(100) < 45 ? bad() : good()];
		if (gates[0].operation === '×' && gates[2].operation === '×') gates[2] = { operation: '+', amount: 3 + below(8) };
		for (let swap = 2; swap > 0; swap--) {
			const other = below(swap + 1);
			[gates[swap], gates[other]] = [gates[other], gates[swap]];
		}
		return { kind: 'gates', at, gates: gates as [Gate, Gate, Gate] };
	};
}

/**
 * The chaos track: no difficulty curve and no guarantees. Any segment can be a raid, from a single
 * raider to the cap, and any gate can be anything from +1 to −10,000, ×10 or ÷10, so a run can end
 * in seconds or reach the cap. Still deterministic: a seed replays exactly.
 */
function chaosGenerator(seed: number) {
	const next = random(seed);
	const below = (limit: number) => next() % limit;
	// From 1 to 10,000, with every order of magnitude about as likely as the others: as likely to be
	// 7 as 7,000.
	const magnitude = () => 1 + below([10, 100, 1_000, 10_000][below(4)]);
	const gate = (): Gate => {
		switch (below(4)) {
			case 0:
				return { operation: '+', amount: magnitude() };
			case 1:
				return { operation: '-', amount: magnitude() };
			case 2:
				return { operation: '×', amount: 2 + below(9) };
			default:
				return { operation: '÷', amount: 2 + below(9) };
		}
	};
	return (index: number): Segment => {
		const at = (index + 1) * SEGMENT_LENGTH;
		// One raid in fifty is an apocalypse: exactly the cap, so it ends any run. Without it, a crowd
		// at the cap could avoid every gate that hurts it and run forever.
		if (below(100) < 30) {
			const enemies = below(100) < 2 ? MOST_RUNNERS : Math.min(MOST_RUNNERS, magnitude());
			return { kind: 'raid', at, enemies };
		}
		return { kind: 'gates', at, gates: [gate(), gate(), gate()] };
	};
}

/**
 * A gate fitted to a crowd of `count`, so it never offers more than the room left under the cap: a
 * + gate gives at most the room left, a × gate the biggest multiplier that fits (and, if not even
 * ×2 fits, becomes a + gate for what's left), and at the cap the good gates read +0. Bad gates are
 * left as they are.
 */
export function fitGate(gate: Gate, count: number): Gate {
	const room = MOST_RUNNERS - count;
	if (gate.operation === '+') return { operation: '+', amount: Math.max(0, Math.min(gate.amount, room)) };
	if (gate.operation === '×') {
		let multiplier = gate.amount;
		while (multiplier >= 2 && count * multiplier > MOST_RUNNERS) multiplier--;
		if (multiplier >= 2) return { operation: '×', amount: multiplier };
		return { operation: '+', amount: Math.max(0, Math.min(room, count)) };
	}
	return gate;
}

/** A segment as the crowd will meet it: gate rows fitted to its size, raids as they are. */
function fitSegment(segment: Segment, count: number): Segment {
	if (segment.kind !== 'gates') return segment;
	const [left, middle, right] = segment.gates;
	return { ...segment, gates: [fitGate(left, count), fitGate(middle, count), fitGate(right, count)] };
}

export function apply(count: number, gate: Gate, most = MOST_RUNNERS) {
	switch (gate.operation) {
		case '+':
			return Math.min(most, count + gate.amount);
		case '-':
			return Math.max(0, count - gate.amount);
		case '×':
			return Math.min(most, count * gate.amount);
		case '÷':
			return Math.floor(count / gate.amount);
	}
}

/** Which of the three gates is at this x: 0 left, 1 middle, 2 right. */
export const laneAt = (x: number) => (x < -LANE_EDGE ? 0 : x > LANE_EDGE ? 2 : 1);
/** The middle of each lane, for steering toward one. */
export const LANE_CENTERS = [-667, 0, 667] as const;

/** How far the run moves in one step at this distance, in millimeters: it speeds up as it goes. */
export function speedAt(distance: number) {
	return Math.min(TOP_SPEED, START_SPEED + Math.floor(distance / SPEEDUP_EVERY));
}

/** Sideways speed after one step of `input`: speeding up that way, or slowing toward a stop. */
function nextSideways(speed: number, input: Input) {
	if (input !== 0 && Math.sign(speed) !== -input) {
		return Math.max(-STEER_TOP_SPEED, Math.min(STEER_TOP_SPEED, speed + input * STEER_ACCELERATION));
	}
	// Letting go slows the leader down; steering the other way slows them down faster, then turns.
	const braking = STEER_FRICTION + (input === 0 ? 0 : STEER_ACCELERATION);
	if (Math.abs(speed) <= braking) return input === 0 ? 0 : input * (braking - Math.abs(speed));
	return speed - Math.sign(speed) * braking;
}

export interface State {
	step: number;
	x: number;
	/** Sideways speed: how far x moves each step. */
	sideways: number;
	distance: number;
	count: number;
	alive: boolean;
}

/** -1 steers left, 0 goes straight, 1 steers right. One input per step. */
export type Input = -1 | 0 | 1;

export function createRun(seed: number, world: World = 'balanced') {
	const generate = world === 'chaos' ? chaosGenerator(seed) : balancedGenerator(seed);
	const most = MOST_RUNNERS;
	const state: State = { step: 0, x: 0, sideways: 0, distance: 0, count: START_RUNNERS, alive: true };
	// Only segments the crowd has reached, and the one it's heading for, exist: each is generated
	// when the one before it is passed, fitted to the crowd's size at that moment.
	const segments: Segment[] = [fitSegment(generate(0), state.count)];
	let passed = 0;

	/** Segment `index`, if it exists yet: every segment up to the next one does. */
	const segmentAt = (index: number): Segment | undefined => segments[index];

	function step(input: Input) {
		if (!state.alive) return;
		state.step++;
		state.sideways = nextSideways(state.sideways, input);
		state.x += state.sideways;
		// The kerb stops the leader dead.
		if (state.x > ROAD_LIMIT || state.x < -ROAD_LIMIT) {
			state.x = Math.max(-ROAD_LIMIT, Math.min(ROAD_LIMIT, state.x));
			state.sideways = 0;
		}
		state.distance += speedAt(state.distance);
		const segment = segments[passed];
		if (state.distance >= segment.at) {
			if (segment.kind === 'gates') {
				state.count = apply(state.count, segment.gates[laneAt(state.x)], most);
			} else {
				state.count = Math.max(0, state.count - segment.enemies);
			}
			passed++;
			if (state.count === 0) state.alive = false;
			// The next segment, fitted to the crowd as it is now.
			else segments.push(fitSegment(generate(passed), state.count));
		}
	}

	return { state, step, segmentAt, segmentLength: SEGMENT_LENGTH, most };
}

/** FNV-1a over the state after every step: one number that changes if anything differs. */
export function hashRun(seed: number, inputs: Input[], world: World = 'balanced') {
	const run = createRun(seed, world);
	let hash = 0x811c9dc5;
	const mix = (value: number) => {
		hash = Math.imul(hash ^ (value >>> 0), 0x01000193) >>> 0;
	};
	for (const input of inputs) {
		run.step(input);
		mix(run.state.x);
		mix(run.state.sideways);
		mix(run.state.distance);
		mix(run.state.count);
	}
	return { hash: hash.toString(16), ...run.state };
}

/**
 * Steering that heads for a lane and stops in it: push toward the lane's center, and brake once
 * the leader would otherwise slide past it.
 */
export function steerToward(x: number, sideways: number, lane: 0 | 1 | 2): Input {
	const remaining = LANE_CENTERS[lane] - x;
	const braking = STEER_FRICTION + STEER_ACCELERATION;
	const stopping = (sideways * sideways) / (2 * braking);
	if (Math.abs(remaining) < 30 && Math.abs(sideways) <= braking) return sideways === 0 ? 0 : (-Math.sign(sideways) as Input);
	if (Math.sign(sideways) === Math.sign(remaining) && stopping >= Math.abs(remaining)) return -Math.sign(sideways) as Input;
	return Math.sign(remaining) as Input;
}

/**
 * A player that always takes the gate leaving the biggest crowd: the best a careful human can do
 * without planning ahead. For tests and balancing.
 */
export function carefulInputs(seed: number, steps: number, world: World = 'balanced'): Input[] {
	const run = createRun(seed, world);
	const inputs: Input[] = [];
	for (let index = 0; index < steps && run.state.alive; index++) {
		const segment = run.segmentAt(Math.floor(run.state.distance / SEGMENT_LENGTH));
		let lane: 0 | 1 | 2 = laneAt(run.state.x);
		if (segment?.kind === 'gates') {
			const outcomes = segment.gates.map((gate) => apply(run.state.count, gate, run.most));
			lane = outcomes.indexOf(Math.max(...outcomes)) as 0 | 1 | 2;
		}
		const input = steerToward(run.state.x, run.state.sideways, lane);
		inputs.push(input);
		run.step(input);
	}
	return inputs;
}

/** The same scripted inputs everywhere: a player weaving left and right, built from the seed. */
export function scriptedInputs(seed: number, steps: number): Input[] {
	const next = random(seed ^ 0x9e3779b9);
	const inputs: Input[] = [];
	let current: Input = 0;
	for (let index = 0; index < steps; index++) {
		if (index % 30 === 0) current = ((next() % 3) - 1) as Input;
		inputs.push(current);
	}
	return inputs;
}
