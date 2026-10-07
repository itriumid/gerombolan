// The three modes, where each run's seed comes from, and the short codes that let a player share a
// seed. Endless and Daily play the balanced world; WNI plays chaos. Daily's seed comes from the
// date in Jakarta, so everyone gets the same world all day and a new one at midnight WIB.

import type { World } from './simulation';

export type Mode = 'endless' | 'daily' | 'wni';

export const MODES: { id: Mode; name: string; world: World; summary: string; prefix: string }[] = [
	{
		id: 'endless',
		name: 'Endless',
		world: 'balanced',
		summary: 'A new street every run, harder the further you get.',
		prefix: 'E'
	},
	{
		id: 'daily',
		name: 'Daily',
		world: 'balanced',
		summary: 'The same street for everyone today. A new one at midnight in Jakarta.',
		prefix: 'D'
	},
	{
		id: 'wni',
		name: 'WNI',
		world: 'chaos',
		summary: 'Anything, at any moment. Dead in seconds, or a crowd of thousands.',
		prefix: 'W'
	}
];

export const modeOf = (id: Mode) => MODES.find((mode) => mode.id === id)!;

/** Jakarta's time zone, Western Indonesian Time: seven hours ahead of UTC, all year. */
const WIB_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Today's date in Jakarta, as YYYY-MM-DD. */
export function jakartaDate(now = new Date()) {
	return new Date(now.getTime() + WIB_OFFSET_MS).toISOString().slice(0, 10);
}

/** FNV-1a over a string: the same 32-bit seed for the same text, on any engine. */
function hash(text: string) {
	let value = 0x811c9dc5;
	for (let index = 0; index < text.length; index++) {
		value = Math.imul(value ^ text.charCodeAt(index), 0x01000193) >>> 0;
	}
	return value;
}

/** The Daily seed for a date in Jakarta. */
export const dailySeed = (date: string) => hash(`gerombolan daily ${date}`);

export const randomSeed = () => crypto.getRandomValues(new Uint32Array(1))[0];

/** A short code for a seed in a mode, like E-1A2B3C or W-ZZ9: the mode's letter, then the seed in base 36. */
export const seedCode = (mode: Mode, seed: number) => `${modeOf(mode).prefix}-${seed.toString(36).toUpperCase()}`;

/** Reads a seed code back, forgiving spaces, case and a missing dash. Undefined when it isn't one. */
export function readSeedCode(text: string): { mode: Mode; seed: number } | undefined {
	const match = /^\s*([EDW])\s*-?\s*([0-9A-Z]{1,7})\s*$/i.exec(text);
	if (!match) return undefined;
	const mode = MODES.find((option) => option.prefix === match[1].toUpperCase())!.id;
	const seed = parseInt(match[2], 36);
	if (!Number.isSafeInteger(seed) || seed > 0xffffffff) return undefined;
	return { mode, seed };
}
