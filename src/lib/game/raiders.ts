// A raid: red raiders in ranks across the road, facing the crowd. They hold their ground: they
// wait, brace as the crowd closes in, and the crowd runs into them. Where a runner meets a raider,
// both go down, rank after rank as the crowd pushes through. The fallen stay on the road, briefly.
// Decoration only; the simulation already knows the outcome.

import * as THREE from 'three';
import { Figures, runningPose, standingPose, topple, type Pose } from './figures';
import { COLORS } from './models';
import { MOST_DRAWN as CROWD_MOST_DRAWN, figuresFor } from './crowd';

/** As many as a crowd, so a fight can always pair one raider with one runner. */
const MOST_DRAWN = CROWD_MOST_DRAWN;
export const COLUMNS = 16;
const COLUMN_GAP = 0.52;
export const RANK_GAP = 0.55;
const FALL_SECONDS = 0.6;
/** How far to either side a raider stands in someone's way: a body's width, give or take. */
const REACH = 0.55;
/** Raiders face the camera: toward the crowd coming down the road. */
const FACING = Math.PI;

export type Mood = 'waiting' | 'bracing';

export class Raiders {
	private figures: Figures;
	private count = 0;
	/** When each raider goes down: NaN while it stands. */
	private fell = new Float64Array(MOST_DRAWN).fill(Number.NaN);
	/** Each raider's own little offset, so the ranks don't look drilled. */
	private jitter = Float32Array.from({ length: MOST_DRAWN * 2 }, () => (Math.random() - 0.5) * 0.18);
	private frontZ = 0;
	/** For each column, the front-most rank still standing: where the next runner meets it. */
	private nextRank = new Int32Array(COLUMNS);
	private ranks = 0;

	constructor(scene: THREE.Scene, material: THREE.Material) {
		this.figures = new Figures(scene, material, COLORS.raider, MOST_DRAWN);
	}

	/** A new raid of `enemies`, all standing, its front rank at `frontZ` on the road. */
	reset(enemies: number, frontZ = 0) {
		this.count = Math.min(MOST_DRAWN, figuresFor(enemies));
		this.fell.fill(Number.NaN);
		this.frontZ = frontZ;
		this.nextRank.fill(0);
		this.ranks = Math.ceil(this.count / COLUMNS);
	}

	get drawnCount() {
		return this.count;
	}

	/** Where raider `index` stands. Index 0 is in the front rank; ranks go back from there. */
	positionOf(index: number) {
		const column = index % COLUMNS;
		const rank = Math.floor(index / COLUMNS);
		return {
			x: (column - (COLUMNS - 1) / 2) * COLUMN_GAP + this.jitter[index * 2],
			z: this.frontZ - rank * RANK_GAP + this.jitter[index * 2 + 1]
		};
	}

	isStanding(index: number) {
		return Number.isNaN(this.fell[index]);
	}

	/** Where the front rank stands. */
	get front() {
		return this.frontZ;
	}

	/** The back of the raid: where its last rank stands. */
	get backZ() {
		return this.frontZ - Math.max(0, this.ranks - 1) * RANK_GAP;
	}

	/**
	 * The raider someone at (x, z) has just run into: the front-most one still standing in their
	 * column or the one beside it, if they've reached it. Undefined when there's no one there.
	 */
	struck(x: number, z: number): number | undefined {
		const column = Math.round(x / COLUMN_GAP + (COLUMNS - 1) / 2);
		let best: number | undefined;
		let bestGap = 0.5;
		for (let nearby = column - 1; nearby <= column + 1; nearby++) {
			if (nearby < 0 || nearby >= COLUMNS) continue;
			// Skip past ranks already down in this column.
			while (this.nextRank[nearby] * COLUMNS + nearby < this.count && !this.isStanding(this.nextRank[nearby] * COLUMNS + nearby)) {
				this.nextRank[nearby]++;
			}
			const index = this.nextRank[nearby] * COLUMNS + nearby;
			if (index >= this.count) continue;
			const raider = this.positionOf(index);
			const gap = Math.abs(raider.x - x);
			if (gap < bestGap && z <= raider.z + 0.35) {
				best = index;
				bestGap = gap;
			}
		}
		return best;
	}

	/**
	 * The raid's front line across the whole road: where the front-most raider still on their feet
	 * at `time` is. A raider someone is running at still blocks until they actually fall, so the
	 * crowd can't push past them early. Undefined when the raid is down.
	 */
	frontLine(time: number): number | undefined {
		let line: number | undefined;
		for (let index = 0; index < this.count; index++) {
			const fell = this.fell[index];
			if (!Number.isNaN(fell) && fell <= time) continue;
			const { z } = this.positionOf(index);
			if (line === undefined || z > line) line = z;
		}
		return line;
	}

	/**
	 * The nearest raider on their feet at `time` in the way of someone at (x, z): ahead of them and
	 * within reach to either side. Returns where that raider stands, or undefined when the way is
	 * clear. Raiders someone is running at still count until they actually fall.
	 */
	inTheWay(x: number, z: number, time: number): number | undefined {
		let nearest: number | undefined;
		for (let index = 0; index < this.count; index++) {
			const fell = this.fell[index];
			if (!Number.isNaN(fell) && fell <= time) continue;
			const raider = this.positionOf(index);
			if (raider.z > z + 0.2 || Math.abs(raider.x - x) > REACH) continue;
			if (nearest === undefined || raider.z > nearest) nearest = raider.z;
		}
		return nearest;
	}

	/** The front-most raider still standing, if any. */
	nextStanding() {
		for (let index = 0; index < this.count; index++) if (this.isStanding(index)) return index;
		return undefined;
	}

	/** Raider `index` goes down at `at`, where it stands. */
	fallAt(index: number, at: number) {
		if (this.isStanding(index)) this.fell[index] = at;
	}

	place(time: number, mood: Mood) {
		for (let index = 0; index < this.count; index++) {
			const { x, z } = this.positionOf(index);
			const phase = time * (mood === 'waiting' ? 2 : 10) + index * 1.3;
			// Bracing: feet planted, bouncing on the spot, arms up.
			const pose: Pose = mood === 'waiting' ? standingPose(phase) : { ...runningPose(phase, 0.3), lean: -0.05, arms: [0.9, 0.9] };
			const fell = this.fell[index];
			if (Number.isNaN(fell) || time < fell) {
				this.figures.pose(index, x, z, FACING, 1, pose);
				continue;
			}
			const t = Math.min(1, (time - fell) / FALL_SECONDS);
			const size = t < 0.7 ? 1 : 1 - (t - 0.7) / 0.3;
			if (size <= 0) this.figures.hide(index);
			else this.figures.pose(index, x, z, FACING, size, topple(standingPose(0), t));
		}
		this.figures.finish(this.count);
	}
}
