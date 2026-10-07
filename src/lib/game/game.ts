// Runs and draws the game. On the menu the leader warms up alone on an empty road; on Play they
// turn and run, the camera swings in behind them, and the simulation starts stepping at a fixed
// rate. What happens in it becomes something to watch: the leader goes through a gate first,
// runners pour in or fall one by one, and a raid becomes a fight where the crowd presses into the
// raiders and protects its leader, who falls last. None of it feeds back into the simulation, so a
// run replays exactly.

import * as THREE from 'three';
import { Crowd, figuresFor } from './crowd';
import { Effects } from './effects';
import { Leader, LEADER_SIZE } from './leader';
import { COLORS, grouped, type Headwear, type Outfit } from './models';
import { COLUMNS as RAID_COLUMNS, RANK_GAP, Raiders } from './raiders';
import { STEPS_PER_SECOND, createRun, isGood, laneAt, speedAt, type Input, type Segment, type World } from './simulation';
import { CHUNK, LEADER_REACH, ROAD_HALF_WIDTH, Street } from './street';

const STEP_MS = 1000 / STEPS_PER_SECOND;
const RAID_NOTICE_METERS = 14;
const SWING_SECONDS = 1.3;
/** How far the player can zoom: the camera's distance from the crowd, as a share of the default. */
export const ZOOM_RANGE = { closest: 0.55, farthest: 3.5 } as const;
/**
 * Runners stepping in front of raiders each frame, at most: enough for the fastest fight's ranks at
 * 30 frames a second, without searching the crowd for thousands of runners in one frame.
 */
const STEP_INS_PER_FRAME = 48;
/**
 * How fast a fight sweeps through a raid, in meters a second: its depth over FIGHT_SECONDS, but
 * never so slow it drags or so fast the runners can't get there.
 */
const FIGHT_SECONDS = 2.5;
const FIGHT_PACE = { slowest: 8, fastest: 30 } as const;
/** How far ahead of the leader a fight's sweep may run, in seconds at its pace: about a lunge. */
const LUNGE_LEAD_SECONDS = 0.5;
/** A count label's size on screen, in pixels, give or take: one never sits on top of another. */
const LABEL_SIZE = { width: 110, height: 38 } as const;
/**
 * How far short of a raider in their way the leader stops, in meters: out of reach of the raiders'
 * raised arms, so the leader never looks to be standing among them.
 */
const STOP_SHORT = 0.9;
/**
 * Raiders this close ahead of the leader are met by runners stepping in: the rank in front of them
 * and the two behind it, so a big fight moves along instead of waiting on one rank at a time.
 */
const STEP_IN_METERS = STOP_SHORT + 2.5 * RANK_GAP;
/**
 * A raid starts the fight when the leader is this close to its front rank: a few meters before they
 * stop, so the runners are already sprinting in as the leader pulls up, instead of starting from a
 * standstill.
 */
const CONTACT_METERS = STOP_SHORT + 3;
/** A fight where nobody has fallen for this long is stuck; the runners left charge to settle it. */
const STUCK_SECONDS = 1.5;
/** After a fight, the crowd runs this much faster than the run to catch up with it. */
const CATCH_UP = 1.7;
/** The farthest the crowd on screen may fall behind the simulation, in meters. */
const MOST_BEHIND = 30;

/** A count pinned to the screen: the number, and where to draw it, in pixels from the top left. */
export interface Label {
	count: number;
	x: number;
	y: number;
}

export interface Frame {
	meters: number;
	/** The crowd's count, above the leader, kept on screen whatever the zoom. */
	crowd: Label;
	/** The raid's count, above the middle of its front rank, while one is in view. */
	raid?: Label;
}

/** How far a pinned label stays from the screen's edges, in pixels. */
const LABEL_MARGIN = 48;

export interface RunOver {
	seed: number;
	meters: number;
	inputs: Input[];
}

/** Something that happened in one simulation step, to animate. */
interface Happening {
	index: number;
	segment: Segment;
	before: number;
	after: number;
	x: number;
}

interface Fight {
	from: number;
	to: number;
	/**
	 * Runner figures the crowd loses. Each goes down together with a raider: on screen, as in the
	 * simulation, every raider takes one runner.
	 */
	pairs: number;
	paired: number;
	/**
	 * Raider figures that fall: one for each pair, and the leader's if the raid wins. Every person is
	 * a figure, so these match; if they ever don't, the extra raiders are trampled, falling alone.
	 */
	raiders: number;
	felled: number;
	/** When the last fall happened, when everything was settled, and when the leader goes down. */
	lastFall: number;
	settled: number;
	leaderDown: number;
	/** The raid's size, and how many of it this fight takes down. */
	enemies: number;
	killed: number;
	/** When the fight started, and how fast it sweeps back through the raid's ranks, in meters a second. */
	start: number;
	pace: number;
}

type Mode = 'menu' | 'running' | 'over';

const ease = (t: number) => t * t * (3 - 2 * t);

export class Game {
	private renderer: THREE.WebGLRenderer;
	private scene = new THREE.Scene();
	private camera = new THREE.PerspectiveCamera(55, 1, 0.1, 400);
	private street: Street;
	private effects: Effects;
	private crowd: Crowd;
	private raiders: Raiders;
	private leader: Leader;

	private mode: Mode = 'menu';
	private run = createRun(1);
	private seed = 1;
	private inputs: Input[] = [];
	private held = { left: false, right: false };
	private accumulator = 0;
	/** The previous frame's timestamp, from requestAnimationFrame's own clock only. */
	private last: number | undefined;
	private now = 0;
	private frameRequest = 0;
	private swingStart = Number.NaN;
	/** The zoom the player asked for, and the one shown, easing toward it. */
	private zoomWanted = 1;
	private zoomShown = 1;

	private happenings: Happening[] = [];
	private fight: Fight | undefined;
	private raidShown = -1;
	/** The segment whose raid the fight on screen is (or was) about, so it starts only once. */
	private raidFought = -1;
	private shownCount = 1;
	/**
	 * How far along the road the crowd on screen is. It follows the simulation, except in a fight:
	 * there it presses against the raid's front line instead of running through it, and afterwards
	 * it runs to catch up. Gates and raids play out when it reaches them.
	 */
	private shownMeters = 0;
	/** The crowd's size after the last gate or raid it has reached on screen. */
	private shownAfter = 1;
	/** Where the crowd's front is this frame: its leader. */
	private crowdFront = 0;
	/** How many raiders are left in the raid on screen: its size, less those beaten so far. */
	private raidLeft = 0;
	private reported = false;
	private projected = new THREE.Vector3();
	private menuCamera = new THREE.Vector3();
	private menuTarget = new THREE.Vector3();
	private playCamera = new THREE.Vector3();
	private playTarget = new THREE.Vector3();
	private target = new THREE.Vector3();

	constructor(
		private canvas: HTMLCanvasElement,
		private onFrame: (frame: Frame) => void,
		private onRunOver: (result: RunOver) => void
	) {
		this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
		this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
		this.scene.background = new THREE.Color(COLORS.sky);
		// Jakarta's afternoon haze.
		this.scene.fog = new THREE.Fog(COLORS.sky, 60, 170);
		this.scene.add(new THREE.HemisphereLight(0xfff4e6, 0x6b6257, 2.1));
		const sun = new THREE.DirectionalLight(0xfff0dd, 1.6);
		sun.position.set(-6, 14, 5);
		this.scene.add(sun);

		this.street = new Street(this.scene);
		this.effects = new Effects(this.scene);
		this.crowd = new Crowd(this.scene, this.street.sharedMaterial, ROAD_HALF_WIDTH);
		this.raiders = new Raiders(this.scene, this.street.sharedMaterial);
		this.leader = new Leader(this.scene, this.street.sharedMaterial);
		this.resize();
	}

	/** One simulation step, noting a gate or raid the leader reached. */
	private step(input: Input) {
		const state = this.run.state;
		const before = state.count;
		const passedBefore = Math.floor(state.distance / this.run.segmentLength);
		this.run.step(input);
		const passed = Math.floor(state.distance / this.run.segmentLength);
		if (passed > passedBefore) {
			const index = passed - 1;
			// A segment just passed always exists.
			this.happenings.push({ index, segment: this.run.segmentAt(index)!, before, after: state.count, x: state.x });
		}
	}

	/** Turns what happened into animations, once the crowd on screen gets there. */
	private react(time: number) {
		// Gates when the crowd reaches them; raids a little before, at contact distance, since the crowd
		// can't step into a raid's ranks.
		// A raid coming up that the simulation hasn't reached yet: its outcome is already certain (the
		// crowd's size can't change before it), so the fight starts on time instead of waiting.
		const state = this.run.state;
		const upcoming = Math.floor(state.distance / this.run.segmentLength);
		const next = this.run.segmentAt(upcoming);
		if (
			state.alive &&
			!this.fight &&
			this.happenings.length === 0 &&
			this.raidFought !== upcoming &&
			next?.kind === 'raid' &&
			next.at - CONTACT_METERS * 1000 <= this.shownMeters * 1000 + 1
		) {
			this.shownAfter = Math.max(0, state.count - next.enemies);
			this.startFight(upcoming, next, state.count, this.shownAfter, state.x, time);
		}

		const reached = this.happenings.filter(
			(happening) => happening.segment.at - (happening.segment.kind === 'raid' ? CONTACT_METERS * 1000 : 0) <= this.shownMeters * 1000 + 1
		);
		this.happenings = this.happenings.slice(reached.length);
		for (const { index, segment, before, after, x } of reached) {
			this.shownAfter = after;
			const leaderX = (x / 1000) * LEADER_REACH;
			const z = -segment.at / 1000;
			if (segment.kind === 'gates') {
				const lane = laneAt(x);
				const gate = segment.gates[lane];
				const good = isGood(gate);
				this.street.passGate(index, lane, time);
				this.effects.burst(
					((lane - 1) * LEADER_REACH * 2) / 3,
					1.85,
					z,
					good ? [COLORS.pink, 0xffffff, 0xe6cf98] : [0xf58c9d, COLORS.graphite],
					good ? 50 : 30,
					good ? 6 : 4
				);
				this.effects.floatText(`${gate.operation}${grouped(gate.amount)}`, leaderX, 3.6, z - 0.5, good ? '#febfca' : '#f58c9d', time);
				if (after === 0) this.leader.fallDown(time);
			} else if (this.raidFought !== index) {
				this.startFight(index, segment, before, after, x, time);
			}
		}
	}

	/** Raid `index` meets the crowd: `before` runners go in, `after` come out. */
	private startFight(index: number, segment: Segment & { kind: 'raid' }, before: number, after: number, x: number, time: number) {
		this.raidFought = index;
		const leaderX = (x / 1000) * LEADER_REACH;
		const z = -segment.at / 1000;
		if (this.raidShown !== index) {
			this.raidShown = index;
			this.raiders.reset(segment.enemies, z);
		}
		this.raidLeft = segment.enemies;
		const shown = this.raiders.drawnCount;
		// The runner figures the crowd loses, each paired with a raider; the raiders that fall:
		// all of them if the crowd wins, otherwise one for each runner and one for the leader.
		const runners = this.crowd.standing;
		const pairs = Math.min(shown, Math.max(0, runners - Math.max(0, figuresFor(after) - 1)));
		const falling = after > 0 ? shown : Math.min(shown, pairs + 1);
		const depth = Math.ceil(falling / RAID_COLUMNS) * RANK_GAP;
		this.fight = {
			from: before,
			to: after,
			pairs,
			paired: 0,
			raiders: falling,
			felled: 0,
			lastFall: time,
			settled: Number.NaN,
			leaderDown: Number.NaN,
			enemies: segment.enemies,
			killed: after > 0 ? segment.enemies : before,
			start: time,
			pace: Math.max(FIGHT_PACE.slowest, Math.min(FIGHT_PACE.fastest, depth / FIGHT_SECONDS))
		};
		this.effects.floatText(`−${grouped(before - after)}`, leaderX, 3.6, z - 1, '#f58c9d', time);
	}

	private draw(time: number, delta: number) {
		const state = this.run.state;
		const playing = this.mode !== 'menu';
		if (playing) this.advance(delta, time);
		const meters = playing ? this.shownMeters : 0;
		const leaderX = playing ? (state.x / 1000) * LEADER_REACH : 0;
		const leaderZ = -meters;
		if (playing) this.react(time);

		// The crowd behind the leader. In a raid it presses into the raiders and loses runners where it
		// meets them; otherwise it pours in, or loses runners from the back.
		let count = playing ? this.shownAfter : 1;
		const fight = this.fight;
		this.crowdFront = leaderZ;
		if (fight) {
			this.collide(fight, leaderX, leaderZ, time);
			const share = fight.pairs > 0 ? fight.paired / fight.pairs : fight.raiders > 0 ? fight.felled / fight.raiders : 1;
			count = Math.round(fight.from + (fight.to - fight.from) * share);
		} else {
			const followers = Math.max(0, figuresFor(count) - 1);
			if (followers !== this.crowd.standing) {
				// Popping in or falling one after another, but never taking more than about 0.6 seconds,
				// however many figures it is.
				const change = Math.abs(followers - this.crowd.standing);
				this.crowd.setStanding(followers, time, Math.min(followers > this.crowd.standing ? 0.015 : 0.008, 0.6 / change));
			}
		}
		this.shownCount = fight ? count : this.shownCount + (count - this.shownCount) * Math.min(1, delta * 12);
		if (!fight && Math.abs(this.shownCount - count) < 0.5) this.shownCount = count;
		const leaderDown = !!fight && !Number.isNaN(fight.leaderDown);
		const running = this.mode === 'running' && (state.alive || !!fight) && !leaderDown;
		this.leader.place(
			leaderX,
			leaderZ,
			time,
			this.mode === 'menu' ? 'warming up' : running ? 'running' : 'standing',
			playing ? state.sideways / 26 : 0
		);
		this.crowd.place(leaderX, leaderZ, time, running, delta);
		this.drawRaid(meters, leaderZ, time);

		// The camera: in front of the leader on the menu, behind the crowd in a run, and a smooth
		// swing from one to the other when the run starts.
		const drift = Math.sin(time * 0.25) * 0.6;
		// Looking past the leader's right side, so they stand in the right half of the screen, clear of
		// the menu on the left.
		this.menuCamera.set(leaderX + 0.6 + drift, 1.5, leaderZ + 4.2);
		this.menuTarget.set(leaderX - 1.6, 1.25, leaderZ);
		// The camera stays where the player zoomed it, however big the crowd gets.
		this.zoomShown += (this.zoomWanted - this.zoomShown) * Math.min(1, delta * 8);
		const zoom = this.zoomShown;
		this.playCamera.set(leaderX * 0.45, 1 + 6.6 * zoom, leaderZ + 11.5 * zoom);
		this.playTarget.set(leaderX * 0.45, 1, leaderZ - 9);
		let swing = this.mode === 'menu' ? 0 : 1;
		if (!Number.isNaN(this.swingStart)) {
			swing = ease(Math.min(1, (time - this.swingStart) / SWING_SECONDS));
			if (swing >= 1) this.swingStart = Number.NaN;
		}
		this.camera.position.lerpVectors(this.menuCamera, this.playCamera, swing);
		this.target.lerpVectors(this.menuTarget, this.playTarget, swing);
		this.camera.lookAt(this.target);

		this.street.update(meters, playing ? (index) => this.run.segmentAt(index) : undefined, time, this.camera.position.x);
		this.effects.update(delta, time);
		this.renderer.render(this.scene, this.camera);

		const crowd = this.pin(leaderX, 2.4 * LEADER_SIZE + 0.5, leaderZ, Math.round(this.shownCount))!;
		let raid: Label | undefined;
		// Over the raid's front line as it is now, so the count moves back with the fight.
		const raidFront = this.raiders.frontLine(time) ?? this.raiders.front;
		if (this.raidShown >= 0 && this.raidLeft > 0) raid = this.pin(0, 2.6, raidFront, this.raidLeft, true);
		// Two counts never overlap: the raid's moves up, above the crowd's.
		if (raid && Math.abs(raid.x - crowd.x) < LABEL_SIZE.width && Math.abs(raid.y - crowd.y) < LABEL_SIZE.height) {
			raid = { ...raid, y: crowd.y - LABEL_SIZE.height };
		}
		// The distance never reads past where the run ended, though a losing crowd presses on into the raid.
		this.onFrame({ meters: Math.floor(Math.min(meters, state.distance / 1000)), crowd, raid });
	}

	/**
	 * Moves the crowd on screen along the road. It runs with the simulation; in a fight it presses
	 * against the raid's front line, across the whole road, its leader stopped just short of it, so it
	 * pushes in rank by rank as they fall instead of running through them;
	 * afterwards it catches up. A crowd that loses keeps pressing in, past where the simulation
	 * stopped, until its leader is down.
	 */
	private advance(delta: number, time: number) {
		const state = this.run.state;
		const runMeters = state.distance / 1000;
		const speed = (speedAt(state.distance) * STEPS_PER_SECOND) / 1000;
		let target = runMeters;
		const fight = this.fight;
		if (fight) {
			const line = this.raiders.frontLine(time);
			// Up to the front-most rank still standing anywhere across the road, never past it: the
			// leader only steps forward once the whole rank in front of them is down.
			const pressed = line === undefined ? undefined : -line - STOP_SHORT;
			// A losing crowd keeps pressing in until its leader actually goes down.
			const leaderStanding = Number.isNaN(fight.leaderDown) || time < fight.leaderDown;
			if (fight.to === 0) target = leaderStanding && pressed !== undefined ? pressed : this.shownMeters;
			else if (pressed !== undefined) target = Math.min(runMeters, pressed);
		}
		// Before, during or after a fight: the leader never moves past a raider on their feet in
		// their way, stopping half a meter short.
		const leaderX = (state.x / 1000) * LEADER_REACH;
		const blocker = this.raiders.inTheWay(leaderX, -this.shownMeters, time);
		if (blocker !== undefined) target = Math.min(target, -blocker - STOP_SHORT);
		// In a fight, the leader keeps up with the fight as it sweeps through the raid.
		const pace = Math.max(speed * (this.shownMeters < runMeters - 0.5 ? CATCH_UP : 1), fight ? fight.pace * 1.2 : 0) * delta;
		if (target > this.shownMeters) this.shownMeters = Math.min(target, this.shownMeters + pace);
		// Never let the crowd fall too far behind the run, except while a raid holds it up: jumping
		// forward then would carry it straight through the raiders.
		if (!fight && blocker === undefined && runMeters - this.shownMeters > MOST_BEHIND) this.shownMeters = runMeters - MOST_BEHIND;
	}

	/**
	 * Raider `raider`, standing at (x, z), is met. While the crowd still owes the fight runners, one
	 * goes down with it: `runner` if it ran into the raider, otherwise the nearest one steps in.
	 * After that the raider is trampled, falling alone, as long as raiders are still owed. False when
	 * nothing more can happen to it.
	 */
	private meet(fight: Fight, raider: number, x: number, z: number, time: number, runner?: number) {
		if (fight.felled >= fight.raiders) return false;
		if (fight.paired < fight.pairs) {
			let at = time;
			if (runner === undefined) {
				const arrives = this.crowd.lungeAt(x, z, this.crowdFront, time);
				if (arrives === undefined) return false;
				at = arrives;
			} else {
				this.crowd.knockDown(runner, time);
			}
			this.raiders.fallAt(raider, at);
			fight.paired++;
			fight.lastFall = Math.max(fight.lastFall, at);
		} else {
			// Out of runners to give: only a crowd that's winning tramples the rest.
			if (fight.to === 0) return false;
			this.raiders.fallAt(raider, time);
			fight.lastFall = time;
		}
		fight.felled++;
		return true;
	}

	/**
	 * One frame of a fight. The crowd presses into the raid with its leader at the front:
	 *  - A runner that has run into a raider goes down with it, all along the crowd's front at once.
	 *  - A raider that reaches the leader, or that the crowd presses into without anyone running
	 *    straight at it, is met by the nearest runner, who throws itself in the way.
	 *  - When the raid wins, once every runner is down, the leader and the raider in front of them
	 *    go down together: the leader falls last.
	 */
	private collide(fight: Fight, leaderX: number, leaderZ: number, time: number) {
		let bursts = 0;
		this.crowd.forEachStanding(this.crowdFront, time, (index, x, z) => {
			const raider = this.raiders.struck(x, z);
			if (raider === undefined) return;
			if (this.meet(fight, raider, x, z, time, index) && bursts++ < 6) {
				this.effects.burst(x, 0.8, z - 0.2, [0xb9b2a8, COLORS.raider, COLORS.pink], 3, 2.5);
			}
		});
		// Raiders near the leader, or that the fight has swept back to: the nearest runner steps in.
		// The sweep moves at the fight's pace, so the runners set off for the next ranks before the
		// leader gets there, and the fight never waits on its slowest lunge.
		// The sweep never runs more than a lunge's worth ahead of the leader, so runners don't sprint
		// deep into a big raid, falling far from everyone else.
		const swept = Math.max(
			this.raiders.front - STEP_IN_METERS + STOP_SHORT - fight.pace * (time - fight.start),
			leaderZ - STEP_IN_METERS - fight.pace * LUNGE_LEAD_SECONDS
		);
		let steppedIn = 0;
		for (let index = 0; index < this.raiders.drawnCount && steppedIn < STEP_INS_PER_FRAME; index++) {
			if (!this.raiders.isStanding(index)) continue;
			const raider = this.raiders.positionOf(index);
			if (leaderZ > raider.z + STEP_IN_METERS && raider.z < swept) continue;
			if (!this.meet(fight, index, raider.x, raider.z, time)) break;
			steppedIn++;
		}

		const crowdLost = fight.to === 0;
		// A safety net, so no fight can hang: when nobody has fallen for a while, whatever the fight
		// still owes happens at once.
		if (time - fight.lastFall > STUCK_SECONDS && (fight.paired < fight.pairs || fight.felled < fight.raiders)) {
			let tries = this.raiders.drawnCount;
			while (fight.paired < fight.pairs && tries-- > 0) {
				const index = this.raiders.nextStanding();
				if (index === undefined) break;
				const raider = this.raiders.positionOf(index);
				if (!this.meet(fight, index, raider.x, raider.z, time)) break;
			}
			if (this.crowd.standing > 0 && crowdLost) this.crowd.knockDownFront(this.crowd.standing, time, 0.3 / this.crowd.standing);
			if (!crowdLost) {
				for (let index = 0; index < this.raiders.drawnCount; index++) {
					if (this.raiders.isStanding(index)) this.raiders.fallAt(index, time + Math.random() * 0.3);
				}
			}
			fight.paired = fight.pairs;
			fight.felled = Math.max(fight.felled, crowdLost ? fight.raiders - 1 : fight.raiders);
			fight.lastFall = time + 0.3;
		}

		// The leader falls last: with every runner down, they go down with the raider in front of them.
		const atTheRaid = leaderZ <= this.raiders.front + STOP_SHORT + 0.1;
		if (crowdLost && atTheRaid && this.crowd.standing === 0 && fight.paired >= fight.pairs && Number.isNaN(fight.leaderDown)) {
			fight.leaderDown = Math.max(time, fight.lastFall) + 0.25;
			this.leader.fallDown(fight.leaderDown);
			const facing = this.raiders.struck(leaderX, leaderZ - STOP_SHORT) ?? this.raiders.nextStanding();
			if (facing !== undefined && fight.felled < fight.raiders) {
				this.raiders.fallAt(facing, fight.leaderDown);
				fight.felled++;
			}
		}

		// The raid's count ticks down as its raiders fall.
		const share = fight.raiders > 0 ? fight.felled / fight.raiders : 1;
		this.raidLeft = fight.enemies - Math.round(fight.killed * Math.min(1, share));
		const settled = crowdLost ? !Number.isNaN(fight.leaderDown) : fight.paired >= fight.pairs && fight.felled >= fight.raiders;
		if (settled && Number.isNaN(fight.settled)) fight.settled = time;
		const done = crowdLost ? time > fight.leaderDown + 0.8 : time - Math.max(fight.settled, fight.lastFall) > 0.8;
		if (settled && done) this.fight = undefined;
	}

	/**
	 * Where a label for a point in the world goes on screen. Kept inside the screen's edges, so it
	 * never slides out of view; `onlyInView` drops it instead when the point is behind the camera
	 * or off screen.
	 */
	private pin(x: number, y: number, z: number, count: number, onlyInView = false): Label | undefined {
		this.projected.set(x, y, z).project(this.camera);
		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;
		const inView = this.projected.z < 1 && Math.abs(this.projected.x) <= 1 && Math.abs(this.projected.y) <= 1;
		if (onlyInView && !inView) return undefined;
		const clamp = (value: number, size: number) => Math.max(LABEL_MARGIN, Math.min(size - LABEL_MARGIN, value));
		// Behind the camera, the projection flips; pin the label to the bottom edge instead.
		if (this.projected.z >= 1) return { count, x: clamp(width / 2, width), y: height - LABEL_MARGIN };
		return {
			count,
			x: clamp(((this.projected.x + 1) / 2) * width, width),
			y: clamp(((1 - this.projected.y) / 2) * height, height)
		};
	}

	/** Raiders: waiting on the road ahead, bracing as the crowd closes in, holding their ground. */
	private drawRaid(meters: number, leaderZ: number, time: number) {
		if (this.fight) {
			this.raiders.place(time, 'bracing');
			return;
		}
		let nextRaid = -1;
		if (this.mode !== 'menu') {
			const current = Math.floor(meters / CHUNK);
			for (let index = current; index <= current + 2; index++) {
				const segment = this.run.segmentAt(index);
				if (segment?.kind === 'raid' && segment.at / 1000 > meters) {
					nextRaid = index;
					break;
				}
			}
		}
		if (nextRaid !== this.raidShown) {
			this.raidShown = nextRaid;
			const segment = nextRaid >= 0 ? this.run.segmentAt(nextRaid) : undefined;
			// The front rank stands exactly where the simulation resolves the raid, so the collision
			// starts the moment the leader gets there.
			this.raiders.reset(segment?.kind === 'raid' ? segment.enemies : 0, segment ? -segment.at / 1000 : 0);
			this.raidLeft = segment?.kind === 'raid' ? segment.enemies : 0;
		}
		const raid = nextRaid >= 0 ? this.run.segmentAt(nextRaid) : undefined;
		const close = !!raid && -raid.at / 1000 - leaderZ > -RAID_NOTICE_METERS;
		this.raiders.place(time, close ? 'bracing' : 'waiting');
	}

	private frame = (now: number) => {
		// Never negative, and capped, so a frame after a pause doesn't fast-forward the run.
		const delta = this.last === undefined ? 0 : Math.max(0, Math.min(now - this.last, 100));
		this.last = now;
		this.now = now / 1000;
		if (this.mode === 'running') {
			this.accumulator += delta;
			while (this.accumulator >= STEP_MS && this.run.state.alive) {
				const input: Input = this.held.left === this.held.right ? 0 : this.held.left ? -1 : 1;
				this.inputs.push(input);
				this.step(input);
				this.accumulator -= STEP_MS;
			}
			// The run ends once the last fight has played out on screen.
			if (!this.run.state.alive && !this.fight && this.happenings.length === 0 && !this.reported) {
				this.reported = true;
				this.mode = 'over';
				this.onRunOver({ seed: this.seed, meters: Math.floor(this.run.state.distance / 1000), inputs: this.inputs });
			}
		}
		this.draw(this.now, delta / 1000);
		this.frameRequest = requestAnimationFrame(this.frame);
	};

	private clear() {
		this.street.clear();
		this.effects.clear();
		this.inputs = [];
		this.accumulator = 0;
		this.happenings = [];
		this.fight = undefined;
		this.raidShown = -1;
		this.raidFought = -1;
		this.crowd.reset(0);
		this.raiders.reset(0);
		this.shownCount = 1;
		this.shownMeters = 0;
		this.raidLeft = 0;
		this.reported = false;
	}

	/** The menu: the leader alone on an empty road, warming up. */
	showMenu() {
		this.clear();
		this.mode = 'menu';
		this.swingStart = Number.NaN;
		this.leader.resetForMenu();
		if (this.last === undefined) this.frameRequest = requestAnimationFrame(this.frame);
	}

	/** Starts a run on this seed and world. From the menu, the leader turns and the camera swings in behind. */
	start(seed: number, world: World) {
		const fromMenu = this.mode === 'menu';
		this.clear();
		this.seed = seed;
		this.run = createRun(seed, world);
		this.shownAfter = this.run.state.count;
		this.mode = 'running';
		if (fromMenu) {
			this.leader.turnToRun(this.now);
			this.swingStart = this.now;
		} else {
			this.leader.faceRoad();
		}
	}

	/** Sets the zoom, within ZOOM_RANGE: 1 is the default distance, larger is farther out. */
	setZoom(zoom: number) {
		this.zoomWanted = Math.max(ZOOM_RANGE.closest, Math.min(ZOOM_RANGE.farthest, zoom));
		return this.zoomWanted;
	}

	dress(outfit: Outfit, wear: Headwear) {
		this.leader.dress(outfit, wear);
	}

	steer(direction: 'left' | 'right', held: boolean) {
		this.held[direction] = held;
	}

	resize() {
		const width = this.canvas.clientWidth;
		const height = this.canvas.clientHeight;
		this.renderer.setSize(width, height, false);
		this.camera.aspect = width / Math.max(height, 1);
		this.camera.updateProjectionMatrix();
	}

	destroy() {
		cancelAnimationFrame(this.frameRequest);
		this.street.clear();
		this.effects.clear();
		this.renderer.dispose();
	}
}
