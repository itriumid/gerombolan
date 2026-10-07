// Seeds: the Daily seed changes at midnight in Jakarta, and seed codes read back what they wrote.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { dailySeed, jakartaDate, readSeedCode, seedCode } from '../src/lib/game/seeds.ts';

test('the Daily date turns over at midnight in Jakarta, not UTC', () => {
	assert.equal(jakartaDate(new Date('2026-10-07T16:59:59Z')), '2026-10-07'); // 23:59:59 WIB
	assert.equal(jakartaDate(new Date('2026-10-07T17:00:00Z')), '2026-10-08'); // 00:00 WIB
});

test('everyone gets the same Daily seed on the same date, and a new one the next day', () => {
	assert.equal(dailySeed('2026-10-07'), dailySeed('2026-10-07'));
	assert.notEqual(dailySeed('2026-10-07'), dailySeed('2026-10-08'));
});

test('a seed code reads back as the same mode and seed', () => {
	for (const mode of ['endless', 'daily', 'wni']) {
		for (const seed of [0, 1, 39, 20261007, 0xffffffff]) {
			assert.deepEqual(readSeedCode(seedCode(mode, seed)), { mode, seed });
		}
	}
});

test('seed codes forgive case, spaces and a missing dash, and refuse anything else', () => {
	assert.deepEqual(readSeedCode(' w zz9 '), { mode: 'wni', seed: parseInt('ZZ9', 36) });
	assert.deepEqual(readSeedCode('e-1a2b'), { mode: 'endless', seed: parseInt('1A2B', 36) });
	assert.equal(readSeedCode('X-123'), undefined);
	assert.equal(readSeedCode('E-'), undefined);
	assert.equal(readSeedCode('E-ZZZZZZZ'), undefined); // larger than 32 bits
});
