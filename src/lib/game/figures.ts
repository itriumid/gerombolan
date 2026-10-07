// People, drawn as instanced meshes: one per body part, so thousands of runners cost nine draw
// calls. Each figure is posed from joint angles; the crowd, the raiders and the leader decide the
// angles (running, stamping, stretching, toppling) and this places the parts, each hanging from the
// end of the one before so the body stays in one piece.

import * as THREE from 'three';
import { BODY, humanoidParts } from './models';

/**
 * Joint angles in radians, in the figure's own frame: positive swings a limb forward, the way the
 * figure faces, and a positive lean tips the body backward.
 */
export interface Pose {
	lean: number;
	bob: number;
	thighs: [number, number];
	/** How far each knee bends: the shin swings back from the thigh by this much. */
	knees: [number, number];
	arms: [number, number];
	/** How far each elbow bends: the forearm swings forward from the upper arm by this much. */
	elbows: [number, number];
	/** Arms out to the side, for stretches: 0 hangs by the body. */
	spread?: number;
}

type Pair = [THREE.InstancedMesh, THREE.InstancedMesh];

export class Figures {
	private body: THREE.InstancedMesh;
	private upperArms: Pair;
	private forearms: Pair;
	private thighs: Pair;
	private shins: Pair;
	private meshes: THREE.InstancedMesh[];

	private matrix = new THREE.Matrix4();
	private position = new THREE.Vector3();
	private rotation = new THREE.Quaternion();
	private scale = new THREE.Vector3();
	private euler = new THREE.Euler(0, 0, 0, 'YXZ');

	constructor(
		private scene: THREE.Scene,
		material: THREE.Material,
		color: number,
		capacity: number,
		detailed = false
	) {
		const parts = humanoidParts(color, detailed);
		const make = (geometry: THREE.BufferGeometry) => {
			const mesh = new THREE.InstancedMesh(geometry, material, capacity);
			mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
			// Three.js works out an instanced mesh's bounds once, where it starts, and would hide the
			// whole crowd as soon as it ran past that point.
			mesh.frustumCulled = false;
			mesh.count = 0;
			scene.add(mesh);
			return mesh;
		};
		const pair = (geometry: THREE.BufferGeometry): Pair => [make(geometry), make(geometry)];
		this.body = make(parts.body);
		this.upperArms = pair(parts.upperArm);
		this.forearms = pair(parts.forearm);
		this.thighs = pair(parts.thigh);
		this.shins = pair(parts.shin);
		this.meshes = [this.body, ...this.upperArms, ...this.forearms, ...this.thighs, ...this.shins];
	}

	/** Places one part: its joint at an offset from the feet, in the figure's own frame. */
	private part(
		mesh: THREE.InstancedMesh,
		index: number,
		feetX: number,
		feetZ: number,
		facing: number,
		size: number,
		offsetX: number,
		offsetY: number,
		offsetZ: number,
		pitch: number,
		roll = 0
	) {
		const cos = Math.cos(facing);
		const sin = Math.sin(facing);
		this.position.set(
			feetX + size * (offsetX * cos + offsetZ * sin),
			size * offsetY,
			feetZ + size * (-offsetX * sin + offsetZ * cos)
		);
		this.euler.set(pitch, facing, roll);
		this.rotation.setFromEuler(this.euler);
		this.scale.setScalar(size);
		this.matrix.compose(this.position, this.rotation, this.scale);
		mesh.setMatrixAt(index, this.matrix);
	}

	/**
	 * Places figure `index` standing at (x, z), facing `facing` (0 is away from the camera, down
	 * the road), at `size`, in `pose`.
	 */
	pose(index: number, x: number, z: number, facing: number, size: number, pose: Pose) {
		const { hipHeight, hipOffset, shoulderHeight, shoulderOffset, thigh, upperArm } = BODY;
		const leanY = Math.cos(pose.lean);
		const leanZ = Math.sin(pose.lean);
		const spread = pose.spread ?? 0;
		this.part(this.body, index, x, z, facing, size, 0, pose.bob, 0, pose.lean);
		for (const side of [0, 1] as const) {
			const outward = side === 0 ? -1 : 1;

			// Legs: the thigh hangs from the hip, the shin from the end of the thigh.
			const hipX = outward * hipOffset;
			const hipY = hipHeight * leanY + pose.bob;
			const hipZ = hipHeight * leanZ;
			const thighAngle = pose.thighs[side];
			const shinAngle = thighAngle - pose.knees[side];
			this.part(this.thighs[side], index, x, z, facing, size, hipX, hipY, hipZ, thighAngle);
			this.part(
				this.shins[side],
				index,
				x,
				z,
				facing,
				size,
				hipX,
				hipY - thigh * Math.cos(thighAngle),
				hipZ - thigh * Math.sin(thighAngle),
				shinAngle
			);

			// Arms: the upper arm hangs from the shoulder, tipped out by `spread`; the forearm from
			// the elbow, at the end of the upper arm. A part pitched by p and rolled by r points its
			// length along (sin r, -cos r cos p, -cos r sin p).
			const roll = outward * spread;
			const armAngle = pose.arms[side];
			const shoulderX = outward * shoulderOffset;
			const shoulderY = shoulderHeight * leanY + pose.bob;
			const shoulderZ = shoulderHeight * leanZ;
			this.part(this.upperArms[side], index, x, z, facing, size, shoulderX, shoulderY, shoulderZ, armAngle, roll);
			this.part(
				this.forearms[side],
				index,
				x,
				z,
				facing,
				size,
				shoulderX + upperArm * Math.sin(roll),
				shoulderY - upperArm * Math.cos(roll) * Math.cos(armAngle),
				shoulderZ - upperArm * Math.cos(roll) * Math.sin(armAngle),
				armAngle + pose.elbows[side],
				roll
			);
		}
	}

	/** Hides a figure: posed at zero size. */
	hide(index: number) {
		this.scale.setScalar(0);
		this.matrix.compose(this.position.set(0, -10, 0), this.rotation.identity(), this.scale);
		for (const mesh of this.meshes) mesh.setMatrixAt(index, this.matrix);
	}

	/** Draws the first `count` figures posed since the last call. */
	finish(count: number) {
		for (const mesh of this.meshes) {
			mesh.count = count;
			mesh.instanceMatrix.needsUpdate = true;
		}
	}

	dispose() {
		for (const mesh of this.meshes) {
			this.scene.remove(mesh);
			mesh.geometry.dispose();
			mesh.dispose();
		}
	}
}

/** A running stride at `phase`: thighs swinging, knees folding as each leg comes through, elbows bent. */
export function runningPose(phase: number, stride = 0.95): Pose {
	const swing = Math.sin(phase);
	const knee = (side: number) => 0.3 + 1.5 * Math.max(0, -Math.cos(phase + side * Math.PI));
	return {
		lean: -0.18,
		bob: Math.abs(Math.sin(phase)) * 0.07,
		thighs: [stride * swing, -stride * swing],
		knees: [knee(0), knee(1)],
		arms: [-0.9 * swing + 0.2, 0.9 * swing + 0.2],
		elbows: [1.4, 1.4]
	};
}

/** Standing still, swaying a little, arms loose. */
export function standingPose(phase: number): Pose {
	return {
		lean: 0.04 * Math.sin(phase),
		bob: 0,
		thighs: [0, 0],
		knees: [0.05, 0.05],
		arms: [0.08, 0.08],
		elbows: [0.2, 0.2],
		spread: 0.08
	};
}

/** A pose toppling backward: `amount` runs from 0 (standing) to 1 (down), arms flung up. */
export function topple(pose: Pose, amount: number): Pose {
	return {
		...pose,
		lean: pose.lean + amount * 1.5,
		thighs: [pose.thighs[0] + amount * 0.9, pose.thighs[1] + amount * 0.9],
		arms: [1.2 + amount * 1.5, 1.2 + amount * 1.5],
		elbows: [0.3, 0.3]
	};
}
