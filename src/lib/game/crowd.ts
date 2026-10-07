// The crowd that follows the leader: a wedge behind them that widens into a block filling the road
// and then just gets longer, packing the road from the front back, so a big crowd is a wall of
// people with its tail running out of view behind the camera. Every runner has a spot of its own, fixed
// by its number, so growing only adds rows at the back; each eases toward its spot, so the crowd
// lags behind the leader's turns and sways after them. A fall leaves a gap rather than reshuffling everyone;
// the crowd then closes up from the outside in, a few runners at a time stepping into the gaps,
// so it stays one tight mass and new runners arrive in it. Runners pour in one by one when the
// crowd grows, fall from the back when a gate takes them, and in a raid go down wherever they run
// into a raider. The fallen stay on the road, briefly. Every person is a figure: the crowd on
// screen is exactly its count.

import * as THREE from 'three';
import { Figures, runningPose, standingPose, topple } from './figures';
import { COLORS } from './models';
import { MOST_RUNNERS } from './simulation';

/** Figures drawn at most: the cap, so every person in a crowd is a figure of their own. */
export const MOST_DRAWN = MOST_RUNNERS;

/** How many figures to draw for a crowd of `count`: exactly one each. */
export const figuresFor = (count: number) => Math.min(MOST_DRAWN, count);

/** Across a row, and from one row to the next, in meters. */
const COLUMN_GAP = 0.42;
const ROW_GAP = 0.45;
/** How far the first row runs behind the leader. */
const FRONT_GAP = 0.8;
const POP_SECONDS = 0.25;
const FALL_SECONDS = 0.6;
/** How quickly runners close on their places: higher is tighter, lower is floatier. */
const FOLLOW = 5;
/** The mass's center follows the leader sideways more slowly still, so turns ripple back. */
const CENTER_FOLLOW = 3;
/** How fast a runner sprints at a raider beside it, in meters a second. */
const SPRINT = 12;
/** The longest a lunge takes, in seconds: a runner far back dashes rather than jogging for ages. */
const LONGEST_LUNGE = 0.6;
/**
 * Runners stepping into gaps each frame: at least a few, and an eighth of the gaps there are,
 * so even a crowd with a thousand holes after a big fight closes up in under half a second,
 * quickly at first and gently at the end, without the whole mass swirling.
 */
const CLOSING_UP_AT_LEAST = 3;
const CLOSING_UP_SHARE = 1 / 8;

export class Crowd {
	private figures: Figures;
	private alive = new Uint8Array(MOST_DRAWN);
	private standingCount = 0;
	private born = new Float64Array(MOST_DRAWN).fill(-Infinity);
	/** When a runner goes down: NaN while it stands. It may be in the future, for a raider still on its way. */
	private fell = new Float64Array(MOST_DRAWN).fill(Number.NaN);
	private placed = new Uint8Array(MOST_DRAWN);
	private x = new Float32Array(MOST_DRAWN);
	private behind = new Float32Array(MOST_DRAWN);
	private turn = new Float32Array(MOST_DRAWN);
	private fellX = new Float32Array(MOST_DRAWN);
	private fellZ = new Float32Array(MOST_DRAWN);
	/** The fall each resting place was recorded for. */
	private recorded = new Float64Array(MOST_DRAWN).fill(Number.NaN);
	/** A runner stepping into a raider: when it set off, and the raider's spot it goes down in. */
	private lungeStart = new Float64Array(MOST_DRAWN).fill(Number.NaN);
	private lungeX = new Float32Array(MOST_DRAWN);
	private lungeZ = new Float32Array(MOST_DRAWN);

	private length = 0;
	private width = 0;
	/** Each spot's row, its place across that row, and how many fit in that row. */
	private slotRow = new Int16Array(MOST_DRAWN);
	private slotColumn = new Int16Array(MOST_DRAWN);
	private slotWidth = new Int16Array(MOST_DRAWN);
	/** Each runner's own small offset, so the rows don't look drilled. */
	private jitter = Float32Array.from({ length: MOST_DRAWN * 2 }, () => (Math.random() - 0.5) * 0.16);
	private centerX = 0;

	constructor(
		scene: THREE.Scene,
		material: THREE.Material,
		/** How far either side of the road's center the crowd may reach. */
		private roadHalfWidth: number
	) {
		this.figures = new Figures(scene, material, COLORS.pink, MOST_DRAWN);
		// The shape, row by row from the front: a wedge (1, 3, 5, … across) until it's as wide as the
		// road, then rows that wide for as long as it takes.
		const road = Math.floor(((roadHalfWidth - 0.4) * 2) / COLUMN_GAP) + 1;
		let slot = 0;
		let width = 1;
		for (let row = 0; slot < MOST_DRAWN; row++) {
			for (let column = 0; column < width && slot < MOST_DRAWN; column++, slot++) {
				this.slotRow[slot] = row;
				this.slotColumn[slot] = column;
				this.slotWidth[slot] = width;
			}
			width = Math.min(road, width + 2);
		}
	}

	get standing() {
		return this.standingCount;
	}

	/** Where the middle of the crowd is across the road, and how far it reaches either side. */
	get frontX() {
		return this.centerX;
	}

	get halfWidth() {
		return this.width / 2;
	}

	/** How far the crowd reaches behind its leader. */
	get depth() {
		return this.length + 0.8;
	}

	private down(index: number, at: number) {
		this.alive[index] = 0;
		this.fell[index] = at;
		this.standingCount--;
	}

	/**
	 * Grows the crowd to `target` figures, new ones popping in `pace` seconds apart, or shrinks it
	 * from the back, the newest first.
	 */
	setStanding(target: number, now: number, pace = 0) {
		target = Math.max(0, Math.min(MOST_DRAWN, Math.round(target)));
		let delay = 0;
		for (let index = 0; index < MOST_DRAWN && this.standingCount < target; index++) {
			// A free spot: never used, or its last runner has finished falling.
			if (this.alive[index] || (!Number.isNaN(this.fell[index]) && now - this.fell[index] < FALL_SECONDS)) continue;
			this.alive[index] = 1;
			this.placed[index] = 0;
			this.lungeStart[index] = Number.NaN;
			this.born[index] = now + delay;
			this.fell[index] = Number.NaN;
			this.standingCount++;
			delay += pace;
		}
		for (let index = MOST_DRAWN - 1; index >= 0 && this.standingCount > target; index--) {
			if (!this.alive[index]) continue;
			this.down(index, now + delay);
			delay += pace;
		}
	}

	/** Calls `visit` with every runner standing now, where it is on the road. */
	forEachStanding(leaderZ: number, now: number, visit: (index: number, x: number, z: number) => void) {
		for (let index = 0; index < MOST_DRAWN; index++) {
			if (this.alive[index] && this.born[index] <= now && this.placed[index]) visit(index, this.x[index], leaderZ + this.behind[index]);
		}
	}

	/**
	 * The standing runner nearest (x, z) runs into a raider there, from `now`, at a sprint, and goes
	 * down in its spot when it arrives. Returns when that is, or undefined when no one is left.
	 */
	lungeAt(x: number, z: number, front: number, now: number): number | undefined {
		let chosen = -1;
		let nearest = Infinity;
		for (let index = 0; index < MOST_DRAWN; index++) {
			if (!this.alive[index] || this.born[index] > now) continue;
			const distance = (this.x[index] - x) ** 2 + (front + this.behind[index] - z) ** 2;
			if (distance < nearest) {
				nearest = distance;
				chosen = index;
			}
		}
		if (chosen < 0) return undefined;
		// A sprint, so a runner two steps away arrives at once and one across the crowd visibly runs.
		const at = now + Math.min(LONGEST_LUNGE, Math.max(0.1, Math.sqrt(nearest) / SPRINT));
		this.down(chosen, at);
		this.lungeStart[chosen] = now;
		this.lungeX[chosen] = x;
		this.lungeZ[chosen] = z;
		return at;
	}

	/** Runner `index` goes down now, where it is: it ran into a raider. */
	knockDown(index: number, now: number) {
		if (this.alive[index]) this.down(index, now);
	}

	/** The `count` runners nearest the front go down, front first, `pace` seconds apart. */
	knockDownFront(count: number, now: number, pace: number) {
		const standing: number[] = [];
		for (let index = 0; index < MOST_DRAWN; index++) if (this.alive[index]) standing.push(index);
		standing.sort((a, b) => this.behind[a] - this.behind[b]);
		standing.slice(0, count).forEach((index, order) => this.down(index, now + order * pace));
	}

	/** Puts back `count` figures at once, with no animation, as at the start of a run. */
	reset(count: number) {
		this.alive.fill(0);
		this.placed.fill(0);
		this.lungeStart.fill(Number.NaN);
		this.born.fill(-Infinity);
		this.fell.fill(Number.NaN);
		this.standingCount = 0;
		this.setStanding(count, -Infinity);
	}

	/** A spot no runner is in or falling from. */
	private free(index: number, time: number) {
		return !this.alive[index] && (Number.isNaN(this.fell[index]) || time - this.fell[index] >= FALL_SECONDS);
	}

	/**
	 * Closes the crowd up: the runner in the outermost spot moves into the innermost empty one,
	 * keeping where it stands, so it walks there. A few a frame, from the outside in.
	 */
	private closeUp(time: number) {
		let inner = 0;
		let outer = MOST_DRAWN - 1;
		while (outer >= 0 && !this.alive[outer]) outer--;
		const gaps = outer + 1 - this.standingCount;
		const moves = Math.max(CLOSING_UP_AT_LEAST, Math.ceil(gaps * CLOSING_UP_SHARE));
		for (let moved = 0; moved < moves; moved++) {
			while (inner < MOST_DRAWN && !this.free(inner, time)) inner++;
			while (outer >= 0 && !(this.alive[outer] && this.born[outer] <= time)) outer--;
			if (inner >= outer) return;
			this.alive[inner] = 1;
			this.placed[inner] = 1;
			this.born[inner] = -Infinity;
			this.fell[inner] = Number.NaN;
			this.x[inner] = this.x[outer];
			this.behind[inner] = this.behind[outer];
			this.turn[inner] = this.turn[outer];
			// The old spot is simply empty now: nobody fell there.
			this.alive[outer] = 0;
			this.placed[outer] = 0;
			this.fell[outer] = Number.NaN;
		}
	}

	/** Draws the crowd behind a leader at (leaderX, leaderZ). */
	place(leaderX: number, leaderZ: number, time: number, running: boolean, delta: number) {
		this.closeUp(time);
		const follow = 1 - Math.exp(-delta * FOLLOW);
		// The crowd reaches as far back as its furthest occupied spot.
		let furthest = -1;
		for (let index = MOST_DRAWN - 1; index >= 0; index--) {
			if (this.alive[index]) {
				furthest = index;
				break;
			}
		}
		const lastRow = furthest < 0 ? 0 : this.slotRow[furthest];
		this.length += ((lastRow + 1) * ROW_GAP - this.length) * Math.min(1, delta * 6);
		const widestRow = furthest < 0 ? 1 : this.slotWidth[furthest];
		this.width = (widestRow - 1) * COLUMN_GAP;
		// The crowd's middle follows the leader across the road, a beat behind; each row stays on the
		// road, the wide ones near its middle.
		this.centerX += (leaderX - this.centerX) * (1 - Math.exp(-delta * CENTER_FOLLOW));

		let drawn = 0;
		for (let index = 0; index < MOST_DRAWN; index++) {
			const falling = !Number.isNaN(this.fell[index]);
			if (!this.alive[index] && !(falling && time - this.fell[index] < FALL_SECONDS)) continue;
			drawn = index + 1;

			// Each runner keeps its own spot: its row and its place across it, from its number.
			if (!falling || time < this.fell[index]) {
				const rowWidth = this.slotWidth[index];
				const rowHalf = ((rowWidth - 1) * COLUMN_GAP) / 2;
				const limit = this.roadHalfWidth - 0.4 - rowHalf;
				const rowCenter = Math.max(-limit, Math.min(limit, this.centerX));
				const targetX = rowCenter - rowHalf + this.slotColumn[index] * COLUMN_GAP + this.jitter[index * 2];
				const targetBehind = FRONT_GAP + this.slotRow[index] * ROW_GAP + this.jitter[index * 2 + 1];
				if (!this.placed[index]) {
					this.x[index] = targetX;
					this.behind[index] = targetBehind;
					this.placed[index] = 1;
				}
				const lastX = this.x[index];
				this.x[index] += (targetX - this.x[index]) * follow;
				this.behind[index] += (targetBehind - this.behind[index]) * follow;
				// Turned a little the way it's drifting.
				const drift = delta > 0 ? (this.x[index] - lastX) / delta : 0;
				this.turn[index] += (-Math.max(-0.5, Math.min(0.5, drift * 0.12)) - this.turn[index]) * Math.min(1, delta * 8);
			}

			let size = 1;
			let downAmount = 0;
			const sinceBorn = time - this.born[index];
			if (sinceBorn < 0) size = 0;
			else if (sinceBorn < POP_SECONDS) {
				// Popping in: a quick overshoot.
				const t = sinceBorn / POP_SECONDS;
				size = t < 0.7 ? (t / 0.7) * 1.25 : 1.25 - ((t - 0.7) / 0.3) * 0.25;
			}
			let worldX = this.x[index];
			let worldZ = leaderZ + this.behind[index];
			// Stepping into a raider: from its spot into the raider's, then down there.
			const lunge = this.lungeStart[index];
			if (!Number.isNaN(lunge)) {
				const t = Math.max(0, Math.min(1, (time - lunge) / Math.max(0.01, this.fell[index] - lunge)));
				worldX += (this.lungeX[index] - worldX) * t;
				worldZ += (this.lungeZ[index] - worldZ) * t;
			}
			if (falling && time >= this.fell[index]) {
				// Down: left behind on the road where it fell, recorded on its first frame down.
				if (this.recorded[index] !== this.fell[index]) {
					this.recorded[index] = this.fell[index];
					this.fellX[index] = worldX;
					this.fellZ[index] = worldZ;
				}
				worldX = this.fellX[index];
				worldZ = this.fellZ[index];
				const t = Math.min(1, (time - this.fell[index]) / FALL_SECONDS);
				downAmount = t;
				size = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
			}
			if (size <= 0) {
				this.figures.hide(index);
				continue;
			}
			const moving = running && !downAmount;
			const phase = time * (moving ? 12 : 2) + index * 1.7;
			const pose = moving ? runningPose(phase) : standingPose(phase);
			this.figures.pose(index, worldX, worldZ, downAmount ? 0 : this.turn[index], size, downAmount ? topple(pose, downAmount) : pose);
		}
		this.figures.finish(drawn);
	}
}
