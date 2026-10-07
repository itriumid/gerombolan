// The Jakarta street: road, kerbs, shophouses, trees, power cables and carts, generated in chunks
// as the crowd runs, with the gates standing on it and the skyline on the horizon. Decoration
// only; the simulation decides where gates are and what they do.

import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import {
	CABLE_HEIGHT,
	COLORS,
	angkot,
	foodCart,
	gateLabel,
	grouped,
	highRise,
	kampungHouse,
	midRise,
	monas,
	mosque,
	shadeTree,
	shophouse,
	streetLight,
	tower,
	vertexColored
} from './models';
import { isGood, type Segment } from './simulation';

export const ROAD_HALF_WIDTH = 4.5;
/**
 * How far either side the leader can go: the simulation's x of ±1000 maps to ±LEADER_REACH meters.
 * The gates are drawn from the same number, so the lane boundaries the simulation uses (a third of
 * the way across) fall exactly on the gates' edges.
 */
export const LEADER_REACH = 4.2;
const GATE_WIDTH = (LEADER_REACH * 2) / 3;
export const CHUNK = 40; // meters: one simulation segment
const SIDEWALK_WIDTH = 3.6;
const CHUNKS_AHEAD = 5;
/** How long a passed gate stays, so its animation can play. */
const GATE_LINGER_SECONDS = 0.7;

export function seededRandom(seed: number) {
	let state = seed >>> 0;
	return () => {
		state = (state + 0x6d2b79f5) >>> 0;
		let value = Math.imul(state ^ (state >>> 15), state | 1);
		value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
		return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
	};
}

/** The road, sidewalks, striped kerbs and center line for one chunk: the same in every chunk. */
function streetGeometry() {
	const parts: THREE.BufferGeometry[] = [];
	const paint = (geometry: THREE.BufferGeometry, color: number) => {
		const tint = new THREE.Color(color);
		const count = geometry.getAttribute('position').count;
		const colors = new Float32Array(count * 3);
		for (let index = 0; index < count; index++) tint.toArray(colors, index * 3);
		geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
		return geometry.index ? geometry.toNonIndexed() : geometry;
	};
	const box = (width: number, height: number, depth: number, x: number, y: number, z: number, color: number) =>
		parts.push(paint(new THREE.BoxGeometry(width, height, depth).translate(x, y, z), color));

	box(ROAD_HALF_WIDTH * 2, 0.1, CHUNK, 0, -0.05, -CHUNK / 2, COLORS.asphalt);
	for (const side of [-1, 1]) {
		box(SIDEWALK_WIDTH, 0.25, CHUNK, side * (ROAD_HALF_WIDTH + SIDEWALK_WIDTH / 2 + 0.15), 0.12, -CHUNK / 2, COLORS.sidewalk);
		// Black and white kerbs, a meter each.
		for (let meter = 0; meter < CHUNK; meter++) {
			box(0.3, 0.3, 1, side * (ROAD_HALF_WIDTH + 0.15), 0.15, -meter - 0.5, meter % 2 === 0 ? 0x1d1d1d : 0xf2f2f2);
		}
	}
	for (let meter = 0; meter < CHUNK; meter += 6) box(0.15, 0.02, 3, 0, 0.01, -meter - 1.5, COLORS.paint);
	// The ground behind the buildings, out as far as a zoomed-out camera can see.
	box(200, 0.1, CHUNK, 0, -0.2, -CHUNK / 2, 0x8a8273);
	return mergeGeometries(parts)!;
}

interface Marker {
	group: THREE.Group;
	at: number;
	/** The three gate panels, left to right, for the pass animation. */
	panels?: THREE.Mesh[];
	passed?: { lane: number; time: number };
}

export class Street {
	private material = vertexColored();
	private road = streetGeometry();
	private chunks = new Map<number, THREE.Group>();
	private markers = new Map<number, Marker>();
	private skyline = new THREE.Group();

	constructor(private scene: THREE.Scene) {
		this.buildSkyline();
	}

	get sharedMaterial() {
		return this.material;
	}

	private buildSkyline() {
		// Far away and outside the fog, following the camera, so it always sits on the horizon.
		const hazy = vertexColored({ fog: false, transparent: true, opacity: 0.55 });
		const random = seededRandom(39);
		for (let index = 0; index < 16; index++) {
			const building = new THREE.Mesh(tower(random), hazy);
			building.position.set(-160 + index * 21 + random() * 8, -2, -random() * 40);
			this.skyline.add(building);
		}
		const monument = new THREE.Mesh(monas(), vertexColored({ fog: false, transparent: true, opacity: 0.8 }));
		monument.position.set(18, -2, 30);
		this.skyline.add(monument);
		this.scene.add(this.skyline);
	}

	/** The street for one chunk: buildings, trees, streetlights with cables, carts and angkot. */
	private buildChunk(index: number) {
		const group = new THREE.Group();
		group.position.z = -index * CHUNK;
		group.add(new THREE.Mesh(this.road, this.material));

		const random = seededRandom(index * 7919 + 13);
		const pieces: THREE.BufferGeometry[] = [];
		const place = (geometry: THREE.BufferGeometry, x: number, z: number, turn: number) => {
			geometry.rotateY(turn);
			geometry.translate(x, 0, z);
			pieces.push(geometry);
		};
		const frontage = ROAD_HALF_WIDTH + SIDEWALK_WIDTH + 0.4;
		for (const side of [-1, 1]) {
			// A row of shophouses, their fronts facing the road.
			let z = 0;
			while (z < CHUNK) {
				const width = 4 + random() * 2.5;
				place(shophouse(random, width), side * (frontage + 4.5), -z - width / 2, side === -1 ? Math.PI / 2 : -Math.PI / 2);
				z += width + 0.05;
			}
			const curb = ROAD_HALF_WIDTH + 0.9;
			for (let meter = 4 + random() * 6; meter < CHUNK; meter += 9 + random() * 8) {
				place(shadeTree(random), side * (curb + 0.6 + random() * 1.2), -meter, random() * Math.PI);
			}
			if (random() < 0.45) place(foodCart(random), side * (curb + 1.6), -(5 + random() * 30), (side * Math.PI) / 2);
			if (random() < 0.25) place(angkot(random), side * (ROAD_HALF_WIDTH + 2.2), -(5 + random() * 30), Math.PI / 2);
			for (const meter of [0, 20]) place(streetLight(), side * curb, -meter, side === -1 ? Math.PI : 0);

			// Behind the shophouses the city rises the further it is from the road: the kampung's low
			// roofs first, with trees and now and then a mosque; then blocks of flats among them; then
			// towers. Laid out on a loose grid of plots; towers take a double plot, so they never overlap.
			const from = frontage + 10;
			const farthest = 98;
			let hasMosque = random() < 0.12;
			// Plots a tower has already taken, as "row plot".
			const taken = new Set<string>();
			for (let row = 0, across = from + 3.5; across < farthest; row++, across += 7) {
				// 0 right behind the shophouses, 1 at the edge of the world.
				const out = (across - from) / (farthest - from);
				for (let plot = 0, along = 3.5; along < CHUNK; plot++, along += 7) {
					if (taken.has(`${row} ${plot}`)) continue;
					const roll = random();
					const x = side * (across + (random() - 0.5) * 1.6);
					const z = -(along + (random() - 0.5) * 1.6);
					const turn = Math.floor(random() * 4) * (Math.PI / 2) + (random() - 0.5) * 0.15;
					const doublePlot = row % 2 === 0 && plot % 2 === 0;
					if (hasMosque && out > 0.1 && out < 0.3) {
						place(mosque(), x + side * 3, z, 0);
						hasMosque = false;
						along += 7;
						plot++;
					} else if (out > 0.55 && doublePlot && roll < 0.55) {
						place(highRise(random), x + side * 3.5, z - 3.5, 0);
						for (const [nextRow, nextPlot] of [[row, plot + 1], [row + 1, plot], [row + 1, plot + 1]]) taken.add(`${nextRow} ${nextPlot}`);
					}
					else if (out > 0.25 && roll > 1 - (out > 0.55 ? 0.3 : 0.25)) place(midRise(random), x + side * 2, z, 0);
					else if (roll < 0.15) place(shadeTree(random), x, z, random() * Math.PI);
					else if (out < 0.85 || roll < 0.4) place(kampungHouse(random), x, z, turn);
				}
			}
		}
		group.add(new THREE.Mesh(mergeGeometries(pieces)!, this.material));

		// Power cables sagging between the poles: Jakarta's tangle, three wires per side.
		const cable = new THREE.LineBasicMaterial({ color: 0x1f1f1f });
		for (const side of [-1, 1]) {
			for (const [from, to] of [
				[0, -20],
				[-20, -40]
			]) {
				for (let wire = 0; wire < 3; wire++) {
					const points: THREE.Vector3[] = [];
					for (let step = 0; step <= 12; step++) {
						const along = step / 12;
						const sag = 0.9 + wire * 0.25;
						points.push(
							new THREE.Vector3(
								side * (ROAD_HALF_WIDTH + 0.9 + wire * 0.12),
								CABLE_HEIGHT - wire * 0.2 - sag * 4 * along * (1 - along),
								from + (to - from) * along
							)
						);
					}
					group.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(points), cable));
				}
			}
		}
		this.scene.add(group);
		this.chunks.set(index, group);
	}

	/** A row of three gates at its place on the road. Raids are crowds, drawn by the game. */
	private buildMarker(segmentIndex: number, segment: Segment) {
		const group = new THREE.Group();
		group.position.z = -segment.at / 1000;
		const marker: Marker = { group, at: segment.at };
		if (segment.kind === 'gates') {
			const panels = segment.gates.map((gate, lane) => {
				const center = (lane - 1) * GATE_WIDTH;
				const panel = new THREE.Mesh(
					new THREE.PlaneGeometry(GATE_WIDTH - 0.12, 2.4),
					new THREE.MeshBasicMaterial({
						map: gateLabel(`${gate.operation}${grouped(gate.amount)}`, isGood(gate)),
						transparent: true,
						side: THREE.DoubleSide
					})
				);
				panel.position.set(center, 1.85, 0);
				group.add(panel);
				return panel;
			});
			// Posts on the gates' edges: four for three gates.
			for (let edge = 0; edge <= 3; edge++) {
				const post = new THREE.Mesh(new THREE.BoxGeometry(0.16, 3.2, 0.16), new THREE.MeshLambertMaterial({ color: 0xf2f2f2 }));
				post.position.set(-LEADER_REACH + edge * GATE_WIDTH, 1.6, 0);
				group.add(post);
			}
			marker.panels = panels;
		}
		this.scene.add(group);
		this.markers.set(segmentIndex, marker);
	}

	/** The leader went through a gate: the chosen panel flashes and swells, the others fade. */
	passGate(segmentIndex: number, lane: number, now: number) {
		const marker = this.markers.get(segmentIndex);
		if (marker) marker.passed = { lane, time: now };
	}

	private dispose(object: THREE.Object3D) {
		object.traverse((child) => {
			if (child instanceof THREE.Mesh || child instanceof THREE.Line) {
				if (child.geometry !== this.road) child.geometry.dispose();
				const material = child.material as THREE.Material & { map?: THREE.Texture };
				if (material !== this.material) {
					material.map?.dispose();
					material.dispose();
				}
			}
		});
		this.scene.remove(object);
	}

	/** Brings the street up to date for the crowd's position, and plays gate animations. */
	update(meters: number, segmentAt: ((index: number) => Segment | undefined) | undefined, now: number, cameraX: number) {
		const current = Math.floor(meters / CHUNK);
		// One chunk behind the crowd too, under the camera; at the start that's chunk -1.
		for (let index = current - 1; index <= current + CHUNKS_AHEAD; index++) {
			if (!this.chunks.has(index)) this.buildChunk(index);
		}
		for (const [index, chunk] of this.chunks) {
			if (index < current - 1) {
				this.dispose(chunk);
				this.chunks.delete(index);
			}
		}
		// No gates on the menu: the road is empty until the run starts.
		if (segmentAt) {
			for (let index = current; index <= current + 3; index++) {
				// Only rows that exist yet: the next one ahead is decided when the crowd gets near it.
				const segment = segmentAt(index);
				if (segment && !this.markers.has(index)) this.buildMarker(index, segment);
			}
		}
		for (const [index, marker] of this.markers) {
			const gone = marker.passed
				? now - marker.passed.time > GATE_LINGER_SECONDS
				: marker.at / 1000 < meters - 2;
			if (gone) {
				this.dispose(marker.group);
				this.markers.delete(index);
			} else if (marker.passed && marker.panels) {
				const t = (now - marker.passed.time) / GATE_LINGER_SECONDS;
				marker.panels.forEach((panel, lane) => {
					const material = panel.material as THREE.MeshBasicMaterial;
					if (lane === marker.passed!.lane) {
						// A white flash, a swell, then gone.
						const swell = 1 + Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.35;
						panel.scale.set(swell, swell, 1);
						material.color.setScalar(1 + (1 - t) * 1.5);
						material.opacity = 1 - t;
					} else {
						material.opacity = Math.max(0, 1 - t * 2);
					}
				});
			}
		}
		this.skyline.position.set(cameraX * 0.9, 0, -meters - 300);
	}

	clear() {
		for (const chunk of this.chunks.values()) this.dispose(chunk);
		for (const marker of this.markers.values()) this.dispose(marker.group);
		this.chunks.clear();
		this.markers.clear();
	}
}
