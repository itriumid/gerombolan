// The leader: one runner in front of the crowd, bigger than the rest, in the outfit and headwear
// the player chose. On the menu they warm up alone on the road; on Play they turn and run, and
// they're the one who touches every gate first.

import * as THREE from 'three';
import { Figures, runningPose, standingPose, topple, type Pose } from './figures';
import { BODY, OUTFITS, headwear, type Headwear, type Outfit } from './models';

export const LEADER_SIZE = 1.2;
const TURN_SECONDS = 0.45;
const FALL_SECONDS = 0.8;

export type Activity = 'warming up' | 'running' | 'standing' | 'down';

/** Blends two poses: `amount` 0 is `from`, 1 is `to`. */
function blend(from: Pose, to: Pose, amount: number): Pose {
	const mix = (a: number, b: number) => a + (b - a) * amount;
	return {
		lean: mix(from.lean, to.lean),
		bob: mix(from.bob, to.bob),
		thighs: [mix(from.thighs[0], to.thighs[0]), mix(from.thighs[1], to.thighs[1])],
		knees: [mix(from.knees[0], to.knees[0]), mix(from.knees[1], to.knees[1])],
		arms: [mix(from.arms[0], to.arms[0]), mix(from.arms[1], to.arms[1])],
		elbows: [mix(from.elbows[0], to.elbows[0]), mix(from.elbows[1], to.elbows[1])],
		spread: mix(from.spread ?? 0, to.spread ?? 0)
	};
}

/** The warm-up routine, one move after another, twelve seconds round. */
const MOVES: ((t: number) => Pose)[] = [
	// Reach up and sway.
	(t) => ({
		lean: 0.06 * Math.sin(t * 2),
		bob: 0,
		thighs: [0, 0],
		knees: [0.05, 0.05],
		arms: [2.9 + 0.08 * Math.sin(t * 4), 2.9 - 0.08 * Math.sin(t * 4)],
		elbows: [0.05, 0.05],
		spread: 0.15
	}),
	// Arm circles, arms out to the sides.
	(t) => ({
		lean: 0,
		bob: 0,
		thighs: [0, 0],
		knees: [0.05, 0.05],
		arms: [0.6 * Math.sin(t * 7), 0.6 * Math.sin(t * 7)],
		elbows: [0.05, 0.05],
		spread: 1.45
	}),
	// High knees on the spot.
	(t) => {
		const swing = Math.sin(t * 9);
		return {
			lean: -0.05,
			bob: Math.abs(swing) * 0.08,
			thighs: [Math.max(0, swing) * 1.3, Math.max(0, -swing) * 1.3],
			knees: [0.2 + Math.max(0, swing) * 1.5, 0.2 + Math.max(0, -swing) * 1.5],
			arms: [-swing * 0.9 + 0.3, swing * 0.9 + 0.3],
			elbows: [1.5, 1.5]
		};
	},
	// Lunges, one side then the other, hands on hips.
	(t) => {
		const side = Math.sin(t * 1.6) > 0 ? 0 : 1;
		const depth = Math.abs(Math.sin(t * 1.6));
		const front = 0.9 * depth;
		const back = -0.45 * depth;
		return {
			lean: -0.12 * depth,
			bob: -0.12 * depth,
			thighs: side === 0 ? [front, back] : [back, front],
			knees: side === 0 ? [1.0 * depth, 0.15] : [0.15, 1.0 * depth],
			// Hands on hips: elbows out, forearms folded back in.
			arms: [-0.2, -0.2],
			elbows: [-1.9, -1.9],
			spread: 0.7
		};
	}
];
const MOVE_SECONDS = 3;
const BLEND_SECONDS = 0.4;

function warmUp(time: number): Pose {
	const move = Math.floor(time / MOVE_SECONDS) % MOVES.length;
	const into = (time % MOVE_SECONDS) / BLEND_SECONDS;
	const current = MOVES[move](time);
	if (into >= 1) return current;
	const previous = MOVES[(move + MOVES.length - 1) % MOVES.length](time);
	const eased = into * into * (3 - 2 * into);
	return blend(previous, current, eased);
}

export class Leader {
	private figures: Figures | undefined;
	private hat: THREE.Mesh | undefined;
	private hatMaterial: THREE.Material;
	private facing = Math.PI;
	private turnStart = Number.NaN;
	private downSince = Number.NaN;

	private position = new THREE.Vector3();
	private euler = new THREE.Euler(0, 0, 0, 'YXZ');

	constructor(
		private scene: THREE.Scene,
		private material: THREE.Material
	) {
		this.hatMaterial = material;
	}

	/** Dresses the leader. Rebuilds the figure, since its color is part of its shape. */
	dress(outfit: Outfit, wear: Headwear) {
		this.figures?.dispose();
		const color = OUTFITS.find((option) => option.id === outfit)?.color ?? OUTFITS[0].color;
		this.figures = new Figures(this.scene, this.material, color, 1, true);
		if (this.hat) {
			this.scene.remove(this.hat);
			this.hat.geometry.dispose();
			this.hat = undefined;
		}
		const geometry = headwear(wear);
		if (geometry) {
			this.hat = new THREE.Mesh(geometry, this.hatMaterial);
			this.scene.add(this.hat);
		}
	}

	/** Facing the camera for the warm-up, upright again. */
	resetForMenu() {
		this.facing = Math.PI;
		this.turnStart = Number.NaN;
		this.downSince = Number.NaN;
	}

	/** Turns from the camera to face down the road, starting now. */
	turnToRun(now: number) {
		this.turnStart = now;
		this.downSince = Number.NaN;
	}

	/** Facing down the road already, as when running again straight from the run-over screen. */
	faceRoad() {
		this.facing = 0;
		this.turnStart = Number.NaN;
		this.downSince = Number.NaN;
	}

	fallDown(now: number) {
		if (Number.isNaN(this.downSince)) this.downSince = now;
	}

	/** `sideways` runs from -1 (turning hard left) to 1 (hard right); the leader turns into it. */
	place(x: number, z: number, time: number, activity: Activity, sideways = 0) {
		if (!this.figures) return;
		if (!Number.isNaN(this.turnStart)) {
			const t = Math.min(1, (time - this.turnStart) / TURN_SECONDS);
			const eased = t * t * (3 - 2 * t);
			this.facing = Math.PI * (1 - eased);
			if (t >= 1) this.turnStart = Number.NaN;
		}

		let pose: Pose;
		if (activity === 'warming up') pose = warmUp(time);
		else if (activity === 'running') pose = runningPose(time * 12);
		else pose = standingPose(time * 2);
		let size = LEADER_SIZE;
		// Down from `downSince` on, which can be a moment ahead: until then, the leader stands.
		if (!Number.isNaN(this.downSince) && time >= this.downSince) {
			const t = Math.min(1, (time - this.downSince) / FALL_SECONDS);
			pose = topple(standingPose(0), t);
			if (t >= 1) size = LEADER_SIZE * 0.999;
		}
		// Into a turn: a figure facing f looks toward (-sin f, -cos f), so a turn right is a negative f.
		const facing = this.facing - (activity === 'running' ? sideways * 0.35 : 0);
		this.figures.pose(0, x, z, facing, size, pose);
		this.figures.finish(1);

		// The hat sits on the head: where the body's lean and bob put it, turned the way the leader faces.
		if (this.hat) {
			const headY = pose.bob + BODY.headHeight * Math.cos(pose.lean);
			const headZ = BODY.headHeight * Math.sin(pose.lean);
			this.position.set(x + size * headZ * Math.sin(facing), size * headY, z + size * headZ * Math.cos(facing));
			this.hat.position.copy(this.position);
			this.euler.set(pose.lean, facing, 0);
			this.hat.rotation.copy(this.euler);
			this.hat.scale.setScalar(size);
		}
	}
}
