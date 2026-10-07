// Everything in the world, built from simple shapes in code: the people in the crowds and a Jakarta
// street around them. No downloaded models, so nothing to license and a tiny download. Sizes are
// in meters.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

export const COLORS = {
	pink: 0xfebfca,
	graphite: 0x2b2b2b,
	raider: 0xc8423b,
	asphalt: 0x4a4a4c,
	sidewalk: 0xb9b2a8,
	paint: 0xf2f2f2,
	sky: 0xe8dccf
};

/** A shape painted one color through its vertices, so many shapes can share one material. */
function painted(geometry: THREE.BufferGeometry, color: number) {
	const tint = new THREE.Color(color);
	const count = geometry.getAttribute('position').count;
	const colors = new Float32Array(count * 3);
	for (let index = 0; index < count; index++) tint.toArray(colors, index * 3);
	geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
	return geometry.index ? geometry.toNonIndexed() : geometry;
}

function at(geometry: THREE.BufferGeometry, x: number, y: number, z: number) {
	geometry.translate(x, y, z);
	return geometry;
}

/**
 * A simple person, built so every part meets the next at a joint: a pelvis, a tapered chest and a
 * shoulder line in one piece with the neck and head; then upper arms, forearms with hands, thighs,
 * and shins with feet, each a separate part so it can swing. Every part's origin is the joint it
 * hangs from, so rotating it swings it around that joint. One color, so a crowd reads as one mass.
 */
export const BODY = {
	hipHeight: 0.7,
	hipOffset: 0.085,
	shoulderHeight: 1.1,
	shoulderOffset: 0.17,
	thigh: 0.34,
	shin: 0.34,
	upperArm: 0.27,
	forearm: 0.25,
	headHeight: 1.33,
	headRadius: 0.15
};

/**
 * `detailed` is for the leader, seen up close. Crowds and raids use the plain version: about a
 * sixth of the triangles, so thousands of figures stay cheap to draw, and at crowd distance it
 * looks the same.
 */
export function humanoidParts(color: number, detailed = true) {
	const round = detailed ? 1 : 0.5;
	const segments = (count: number) => Math.max(4, Math.round(count * round));
	/** A limb hanging from its joint: rounded at both ends, so it meets the next part smoothly. */
	const limb = (length: number, radius: number, tipRadius = radius) => {
		const geometry = new THREE.CapsuleGeometry(radius, length, detailed ? 4 : 1, segments(10));
		// The capsule's top rounding sits on the joint; its bottom rounding is the next joint.
		geometry.translate(0, -length / 2, 0);
		const parts = [painted(geometry, color)];
		if (tipRadius > radius) parts.push(painted(at(new THREE.SphereGeometry(tipRadius, segments(8), segments(6)), 0, -length, 0), color));
		return mergeGeometries(parts)!;
	};
	const { hipHeight, shoulderHeight, shoulderOffset, headHeight, headRadius } = BODY;
	const chest = new THREE.CylinderGeometry(0.135, 0.105, shoulderHeight - hipHeight - 0.06, segments(16));
	return {
		body: mergeGeometries([
			// Pelvis, chest and the line of the shoulders.
			painted(at(new THREE.SphereGeometry(0.115, segments(16), segments(12)).scale(1.05, 0.8, 0.85), 0, hipHeight + 0.03, 0), color),
			painted(at(chest.scale(1, 1, 0.75), 0, (hipHeight + shoulderHeight) / 2 + 0.01, 0), color),
			painted(at(new THREE.CapsuleGeometry(0.06, shoulderOffset * 2, detailed ? 4 : 1, segments(12)).rotateZ(Math.PI / 2), 0, shoulderHeight, 0), color),
			// Neck and head.
			painted(at(new THREE.CylinderGeometry(0.05, 0.06, 0.12, segments(8)), 0, shoulderHeight + 0.08, 0), color),
			painted(at(new THREE.SphereGeometry(headRadius, segments(14), segments(12)), 0, headHeight, 0), color)
		])!,
		upperArm: limb(BODY.upperArm, 0.055),
		forearm: limb(BODY.forearm, 0.047, 0.06),
		thigh: limb(BODY.thigh, 0.07),
		// The shin ends in a foot, pointing forward.
		shin: mergeGeometries([
			limb(BODY.shin, 0.058),
			painted(at(new THREE.BoxGeometry(0.1, 0.06, 0.2), 0, -BODY.shin - 0.02, -0.05), color)
		])!
	};
}

// --- The leader --------------------------------------------------------------------------------

/** What the leader can wear on their head: all from Indonesian streets and fields. */
export const HEADWEAR = [
	{ id: 'peci', name: 'Peci' },
	{ id: 'caping', name: 'Caping' },
	{ id: 'helmet', name: 'Ojek helmet' },
	{ id: 'blangkon', name: 'Blangkon' },
	{ id: 'headband', name: 'Ikat kepala' },
	{ id: 'none', name: 'Nothing' }
] as const;
export type Headwear = (typeof HEADWEAR)[number]['id'];

/** The leader's outfit colors. The crowd behind always wears pink. */
export const OUTFITS = [
	{ id: 'white', name: 'Off-white', color: 0xf2f2f2 },
	{ id: 'graphite', name: 'Graphite', color: 0x3a3a3a },
	{ id: 'gold', name: 'Gold', color: 0xe0b44c },
	{ id: 'sage', name: 'Sage', color: 0x7fa874 },
	{ id: 'blue', name: 'Blue', color: 0x4f7fb5 },
	{ id: 'rose', name: 'Rose', color: 0xd0596b }
] as const;
export type Outfit = (typeof OUTFITS)[number]['id'];

/**
 * Headwear, built around the center of the head (the origin), for a head of radius 0.16 facing
 * -z. Returns undefined for nothing.
 */
export function headwear(kind: Headwear): THREE.BufferGeometry | undefined {
	switch (kind) {
		case 'peci':
			// The black velvet cap: low, close-fitting and slightly oval, sitting on the crown.
			return mergeGeometries([
				painted(at(new THREE.CylinderGeometry(0.148, 0.152, 0.085, 20).scale(1, 1, 0.9), 0, 0.105, 0), 0x1d1d1d)
			])!;
		case 'caping':
			// The farmer's conical bamboo hat, wide enough to shade the shoulders.
			return mergeGeometries([
				painted(at(new THREE.ConeGeometry(0.44, 0.22, 20, 1, true), 0, 0.16, 0), 0xd9b26a),
				painted(at(new THREE.ConeGeometry(0.43, 0.215, 20), 0, 0.155, 0), 0xc9a25a)
			])!;
		case 'helmet':
			// An ojek driver's green helmet with a dark visor.
			return mergeGeometries([
				painted(at(new THREE.SphereGeometry(0.2, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 0.02, 0), 0x2e9e4f),
				painted(at(new THREE.BoxGeometry(0.26, 0.08, 0.05), 0, 0.02, -0.18), 0x1d1d1d),
				painted(at(new THREE.BoxGeometry(0.03, 0.2, 0.36), 0, 0.12, 0), 0xf2f2f2)
			])!;
		case 'blangkon':
			// The Javanese batik head wrap, with its knot at the back.
			return mergeGeometries([
				painted(at(new THREE.CylinderGeometry(0.172, 0.175, 0.12, 16), 0, 0.07, 0), 0x6b4226),
				painted(at(new THREE.TorusGeometry(0.172, 0.02, 6, 20).rotateX(Math.PI / 2), 0, 0.03, 0), 0xc89b5a),
				painted(at(new THREE.SphereGeometry(0.07, 10, 8), 0, 0.02, 0.17), 0x6b4226)
			])!;
		case 'headband':
			// A red ikat kepala, its two ends flying behind.
			return mergeGeometries([
				painted(at(new THREE.TorusGeometry(0.162, 0.03, 6, 24).rotateX(Math.PI / 2), 0, 0.04, 0), 0xd23b3b),
				painted(at(new THREE.BoxGeometry(0.04, 0.03, 0.16).rotateX(-0.5), -0.04, 0.0, 0.22), 0xd23b3b),
				painted(at(new THREE.BoxGeometry(0.04, 0.03, 0.14).rotateX(-0.2), 0.05, 0.01, 0.21), 0xd23b3b)
			])!;
		case 'none':
			return undefined;
	}
}

export const vertexColored = (options: THREE.MeshLambertMaterialParameters = {}) =>
	new THREE.MeshLambertMaterial({ vertexColors: true, ...options });

// --- The street ---------------------------------------------------------------------------------

/** Faded shophouse colors, the way Jakarta's ruko look after a few rainy seasons. */
const FACADES = [0xd9c6a5, 0xc9d4c5, 0xe2c2b0, 0xb8c7d1, 0xe6dcc3, 0xd4b8b8, 0xc2c9a8, 0xf0e2d0];
const SIGNS = [0xd64545, 0x2f6fb5, 0xf2b705, 0x2e8b57, 0xe86f2c, 0xfebfca];

/**
 * A ruko: a two or three story shophouse, with a rolling shutter on the ground floor, a colored
 * signboard above it, and windows and a small balcony upstairs. `random` returns 0 to 1.
 */
export function shophouse(random: () => number, width: number) {
	const floors = random() < 0.6 ? 2 : 3;
	const height = floors * 3.2;
	const depth = 9;
	const facade = FACADES[Math.floor(random() * FACADES.length)];
	const parts = [
		painted(at(new THREE.BoxGeometry(width, height, depth), 0, height / 2, 0), facade),
		// Rolling shutter, half open sometimes.
		painted(at(new THREE.BoxGeometry(width * 0.8, 2.4, 0.1), 0, 1.4, depth / 2 + 0.05), random() < 0.5 ? 0x8c8c8c : 0x3a3a3a),
		// Signboard.
		painted(
			at(new THREE.BoxGeometry(width * 0.9, 0.9, 0.15), 0, 3.0, depth / 2 + 0.12),
			SIGNS[Math.floor(random() * SIGNS.length)]
		),
		// A flat roof edge.
		painted(at(new THREE.BoxGeometry(width + 0.2, 0.25, depth + 0.2), 0, height + 0.12, 0), 0x7a7066)
	];
	for (let floor = 1; floor < floors; floor++) {
		const y = floor * 3.2 + 1.6;
		for (const side of [-1, 1]) {
			parts.push(painted(at(new THREE.BoxGeometry(width * 0.28, 1.4, 0.1), side * width * 0.24, y, depth / 2 + 0.05), 0x3d4a52));
		}
		if (random() < 0.5) {
			parts.push(painted(at(new THREE.BoxGeometry(width * 0.8, 0.12, 0.8), 0, y - 0.9, depth / 2 + 0.4), facade));
		}
	}
	return mergeGeometries(parts)!;
}

/** A shade tree: a short trunk and a wide, flat canopy, like the angsana trees along Jakarta's roads. */
export function shadeTree(random: () => number) {
	const size = 1.5 + random() * 0.8;
	const green = [0x4f7942, 0x5b8a4a, 0x3f6b3a][Math.floor(random() * 3)];
	return mergeGeometries([
		painted(at(new THREE.CylinderGeometry(0.18, 0.26, 3, 6), 0, 1.5, 0), 0x5a4636),
		painted(at(new THREE.IcosahedronGeometry(size, 0).scale(1, 0.6, 1), 0, 3.6, 0), green),
		painted(at(new THREE.IcosahedronGeometry(size * 0.7, 0).scale(1, 0.6, 1), size * 0.5, 3.3, 0.4), green)
	])!;
}

/** A street light pole, which also carries the power cables. Its cable hook is at 6.4 meters. */
export function streetLight() {
	return mergeGeometries([
		painted(at(new THREE.CylinderGeometry(0.08, 0.1, 7, 6), 0, 3.5, 0), 0x6b6b6b),
		painted(at(new THREE.BoxGeometry(1.4, 0.08, 0.08), -0.7, 6.9, 0), 0x6b6b6b),
		painted(at(new THREE.BoxGeometry(0.5, 0.12, 0.25), -1.35, 6.82, 0), 0xf2f2f2)
	])!;
}
export const CABLE_HEIGHT = 6.4;

/** A gerobak: a street food cart with two wheels and a small roof. */
export function foodCart(random: () => number) {
	const color = [0x2f6fb5, 0xd64545, 0xf2b705, 0x2e8b57][Math.floor(random() * 4)];
	return mergeGeometries([
		painted(at(new THREE.BoxGeometry(1.6, 0.9, 0.7), 0, 0.85, 0), color),
		painted(at(new THREE.BoxGeometry(1.5, 0.5, 0.6), 0, 1.55, 0), 0xdde6e8),
		painted(at(new THREE.BoxGeometry(1.8, 0.06, 0.9), 0, 2.0, 0), color),
		painted(at(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10).rotateX(Math.PI / 2), -0.5, 0.28, 0.38), 0x222222),
		painted(at(new THREE.CylinderGeometry(0.28, 0.28, 0.08, 10).rotateX(Math.PI / 2), 0.5, 0.28, 0.38), 0x222222)
	])!;
}

/** An angkot: Jakarta's shared minibus, in one of its route colors. */
export function angkot(random: () => number) {
	const color = [0x2a7fb8, 0xd64545, 0xe8b923, 0x3c9a5f][Math.floor(random() * 4)];
	const wheels = [-1.1, 1.1].flatMap((x) =>
		[-0.75, 0.75].map((z) =>
			painted(at(new THREE.CylinderGeometry(0.32, 0.32, 0.2, 10).rotateX(Math.PI / 2), x, 0.32, z), 0x1d1d1d)
		)
	);
	return mergeGeometries([
		painted(at(new THREE.BoxGeometry(3.6, 1.6, 1.6), 0, 1.25, 0), color),
		painted(at(new THREE.BoxGeometry(2.6, 0.5, 1.62), -0.3, 1.7, 0), 0x2c3e4a),
		painted(at(new THREE.BoxGeometry(0.1, 0.6, 1.4), 1.81, 1.6, 0), 0x2c3e4a),
		...wheels
	])!;
}

// --- Behind the shophouses: the kampung, seen from above when zoomed out ------------------------

const WALLS = [0xf2ede4, 0xe8e0d0, 0xdfe6e3, 0xefe2cf, 0xe4d6d6, 0xd9e2d0];
const ROOFS = [0xb5562f, 0xa44a2a, 0xc0653a, 0xb86a45, 0x8a7f74];

/** A kampung house: one or two stories under a hip roof, mostly terracotta, sometimes zinc. */
export function kampungHouse(random: () => number) {
	const width = 4 + random() * 2.5;
	const depth = 5 + random() * 2.5;
	const height = random() < 0.25 ? 5.6 : 3.1;
	const roofHeight = 1.4 + random() * 0.6;
	// A square-based cone, turned so its sides face the axes, then stretched to the house.
	const roof = new THREE.ConeGeometry(1, roofHeight, 4).rotateY(Math.PI / 4);
	roof.scale((width + 0.5) / Math.SQRT2, 1, (depth + 0.5) / Math.SQRT2);
	return mergeGeometries([
		painted(at(new THREE.BoxGeometry(width, height, depth), 0, height / 2, 0), WALLS[Math.floor(random() * WALLS.length)]),
		painted(at(roof, 0, height + roofHeight / 2, 0), ROOFS[Math.floor(random() * ROOFS.length)])
	])!;
}

/** A mid-rise block of flats or offices, with darker bands where its windows are. */
export function midRise(random: () => number) {
	const width = 9 + random() * 5;
	const depth = 9 + random() * 5;
	const floors = 5 + Math.floor(random() * 8);
	const height = floors * 3;
	const parts = [painted(at(new THREE.BoxGeometry(width, height, depth), 0, height / 2, 0), [0xd8d4cc, 0xc9cfd3, 0xe0d6c4][Math.floor(random() * 3)])];
	for (let floor = 1; floor < floors; floor++) {
		parts.push(painted(at(new THREE.BoxGeometry(width + 0.05, 0.9, depth + 0.05), 0, floor * 3 + 0.2, 0), 0x56626b));
	}
	parts.push(painted(at(new THREE.BoxGeometry(width + 0.3, 0.4, depth + 0.3), 0, height + 0.2, 0), 0x8c857b));
	return mergeGeometries(parts)!;
}

/** A high-rise tower, out where the city gets tall: glass-gray, banded with windows, with a crown. */
export function highRise(random: () => number) {
	const width = 11 + random() * 5;
	const depth = 11 + random() * 5;
	const floors = 14 + Math.floor(random() * 16);
	const height = floors * 3.4;
	const glass = [0x9fb0bd, 0xb3bcc2, 0x8d9ca8, 0xc2c6c4][Math.floor(random() * 4)];
	const parts = [painted(at(new THREE.BoxGeometry(width, height, depth), 0, height / 2, 0), glass)];
	for (let floor = 1; floor < floors; floor++) {
		parts.push(painted(at(new THREE.BoxGeometry(width + 0.05, 1.3, depth + 0.05), 0, floor * 3.4 + 0.4, 0), 0x4c5964));
	}
	// The crown: a narrower top, and sometimes a mast.
	parts.push(painted(at(new THREE.BoxGeometry(width * 0.7, 3, depth * 0.7), 0, height + 1.5, 0), glass));
	if (random() < 0.5) parts.push(painted(at(new THREE.CylinderGeometry(0.15, 0.2, 8, 6), 0, height + 7, 0), 0xb0b0b0));
	return mergeGeometries(parts)!;
}

/** A neighborhood mosque: a white hall under a green dome, with a slender minaret. */
export function mosque() {
	return mergeGeometries([
		painted(at(new THREE.BoxGeometry(10, 5, 10), 0, 2.5, 0), 0xf2efe8),
		painted(at(new THREE.CylinderGeometry(3.6, 3.6, 1.2, 16), 0, 5.6, 0), 0xf2efe8),
		painted(at(new THREE.SphereGeometry(3.6, 18, 10, 0, Math.PI * 2, 0, Math.PI / 2), 0, 6.2, 0), 0x2e8b57),
		painted(at(new THREE.ConeGeometry(0.25, 1.2, 8), 0, 10.2, 0), 0xd4a937),
		painted(at(new THREE.CylinderGeometry(0.55, 0.65, 15, 10), 6.5, 7.5, 6.5), 0xf2efe8),
		painted(at(new THREE.SphereGeometry(0.75, 10, 8, 0, Math.PI * 2, 0, Math.PI / 2), 6.5, 15, 6.5), 0x2e8b57)
	])!;
}

/** Monas, the National Monument: a tall tapering obelisk on a wide base, with a golden flame. */
export function monas() {
	return mergeGeometries([
		painted(at(new THREE.BoxGeometry(18, 4, 18), 0, 2, 0), 0xe6e1d8),
		painted(at(new THREE.CylinderGeometry(1.6, 3.2, 70, 4).rotateY(Math.PI / 4), 0, 39, 0), 0xf0ece4),
		painted(at(new THREE.CylinderGeometry(3.4, 3.4, 1.2, 4).rotateY(Math.PI / 4), 0, 74.6, 0), 0xe6e1d8),
		painted(at(new THREE.ConeGeometry(1.4, 6, 8), 0, 78.5, 0), 0xd4a937)
	])!;
}

/** An office tower for the hazy skyline. */
export function tower(random: () => number) {
	const width = 8 + random() * 10;
	const height = 30 + random() * 70;
	return painted(at(new THREE.BoxGeometry(width, height, width), 0, height / 2, 0), [0xb7bec4, 0xa9b3ba, 0xc4c0b8][Math.floor(random() * 3)]);
}

/** Sets the largest bold font, up to `largest` pixels, that fits `text` within `width`. */
export function fitText(context: CanvasRenderingContext2D, text: string, width: number, largest: number) {
	let size = largest;
	context.font = `bold ${size}px system-ui, sans-serif`;
	while (size > 18 && context.measureText(text).width > width) {
		size -= 4;
		context.font = `bold ${size}px system-ui, sans-serif`;
	}
}

/** A number for reading: with commas, like 1,234,567. */
export const grouped = (value: number) => value.toLocaleString('en-US');

/** A gate's label: the operation and amount, drawn on a canvas shaped like the gate's panel. */
export function gateLabel(text: string, good: boolean) {
	const canvas = document.createElement('canvas');
	canvas.width = 288;
	canvas.height = 256;
	const context = canvas.getContext('2d')!;
	context.fillStyle = good ? 'rgba(80, 140, 210, 0.6)' : 'rgba(214, 69, 69, 0.6)';
	context.fillRect(0, 0, 288, 256);
	context.strokeStyle = 'rgba(255, 255, 255, 0.9)';
	context.lineWidth = 10;
	context.strokeRect(5, 5, 278, 246);
	context.fillStyle = '#ffffff';
	context.textAlign = 'center';
	context.textBaseline = 'middle';
	fitText(context, text, 250, 112);
	context.fillText(text, 144, 134);
	const texture = new THREE.CanvasTexture(canvas);
	texture.colorSpace = THREE.SRGBColorSpace;
	return texture;
}
