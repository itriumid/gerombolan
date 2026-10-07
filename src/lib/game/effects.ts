// Short-lived flourishes: confetti and dust bursts, and the numbers that float up from a gate or a
// raid. All of it fades out on its own; nothing here affects the run.

import * as THREE from 'three';
import { fitText } from './models';

const MOST_PARTICLES = 600;
const GRAVITY = -14;

interface FloatingText {
	sprite: THREE.Sprite;
	born: number;
}

export class Effects {
	private particles: THREE.InstancedMesh;
	private positions = new Float32Array(MOST_PARTICLES * 3);
	private velocities = new Float32Array(MOST_PARTICLES * 3);
	private spin = new Float32Array(MOST_PARTICLES);
	private life = new Float32Array(MOST_PARTICLES);
	private next = 0;
	private texts: FloatingText[] = [];

	private matrix = new THREE.Matrix4();
	private position = new THREE.Vector3();
	private rotation = new THREE.Quaternion();
	private scale = new THREE.Vector3();
	private euler = new THREE.Euler();
	private color = new THREE.Color();

	constructor(private scene: THREE.Scene) {
		this.particles = new THREE.InstancedMesh(
			new THREE.BoxGeometry(0.14, 0.14, 0.03),
			new THREE.MeshBasicMaterial(),
			MOST_PARTICLES
		);
		this.particles.frustumCulled = false;
		this.particles.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
		this.particles.setColorAt(0, this.color.set(0xffffff));
		this.scene.add(this.particles);
	}

	/** Throws `count` particles of `colors` out of a point, upward and outward. */
	burst(x: number, y: number, z: number, colors: number[], count: number, speed = 5) {
		for (let made = 0; made < count; made++) {
			const index = this.next;
			this.next = (this.next + 1) % MOST_PARTICLES;
			const angle = Math.random() * Math.PI * 2;
			const outward = speed * (0.4 + Math.random() * 0.6);
			this.positions.set([x, y, z], index * 3);
			this.velocities.set(
				[Math.cos(angle) * outward, speed * (0.6 + Math.random() * 0.8), Math.sin(angle) * outward * 0.6],
				index * 3
			);
			this.spin[index] = (Math.random() - 0.5) * 20;
			this.life[index] = 0.8 + Math.random() * 0.5;
			this.particles.setColorAt(index, this.color.set(colors[made % colors.length]));
		}
		if (this.particles.instanceColor) this.particles.instanceColor.needsUpdate = true;
	}

	/** A number that floats up and fades, like "+12" over a gate. */
	floatText(text: string, x: number, y: number, z: number, color: string, now: number) {
		const canvas = document.createElement('canvas');
		canvas.width = 512;
		canvas.height = 128;
		const context = canvas.getContext('2d')!;
		fitText(context, text, 480, 88);
		context.textAlign = 'center';
		context.textBaseline = 'middle';
		context.lineWidth = 10;
		context.strokeStyle = 'rgba(43, 43, 43, 0.9)';
		context.strokeText(text, 256, 66);
		context.fillStyle = color;
		context.fillText(text, 256, 66);
		const texture = new THREE.CanvasTexture(canvas);
		texture.colorSpace = THREE.SRGBColorSpace;
		const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthTest: false }));
		sprite.position.set(x, y, z);
		sprite.scale.set(6.4, 1.6, 1);
		sprite.renderOrder = 10;
		this.scene.add(sprite);
		this.texts.push({ sprite, born: now });
	}

	update(delta: number, now: number) {
		for (let index = 0; index < MOST_PARTICLES; index++) {
			let size = 0;
			if (this.life[index] > 0) {
				this.life[index] -= delta;
				const base = index * 3;
				this.velocities[base + 1] += GRAVITY * delta;
				for (let axis = 0; axis < 3; axis++) this.positions[base + axis] += this.velocities[base + axis] * delta;
				size = Math.min(1, this.life[index] * 3);
			}
			this.position.fromArray(this.positions, index * 3);
			this.euler.set(now * this.spin[index], now * this.spin[index] * 0.7, 0);
			this.rotation.setFromEuler(this.euler);
			this.scale.setScalar(size);
			this.matrix.compose(this.position, this.rotation, this.scale);
			this.particles.setMatrixAt(index, this.matrix);
		}
		this.particles.instanceMatrix.needsUpdate = true;

		this.texts = this.texts.filter(({ sprite, born }) => {
			const age = now - born;
			if (age > 1.2) {
				this.scene.remove(sprite);
				sprite.material.map?.dispose();
				sprite.material.dispose();
				return false;
			}
			sprite.position.y += delta * 2.2;
			sprite.material.opacity = age < 0.8 ? 1 : 1 - (age - 0.8) / 0.4;
			const pop = age < 0.15 ? 0.6 + (age / 0.15) * 0.5 : 1.1 - Math.min(0.1, age - 0.15);
			sprite.scale.set(6.4 * pop, 1.6 * pop, 1);
			return true;
		});
	}

	clear() {
		this.life.fill(0);
		for (const { sprite } of this.texts) {
			this.scene.remove(sprite);
			sprite.material.map?.dispose();
			sprite.material.dispose();
		}
		this.texts = [];
	}
}
