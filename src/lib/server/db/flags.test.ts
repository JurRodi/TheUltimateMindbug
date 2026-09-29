import { describe, it, expect, beforeEach } from 'vitest';
import { makeTestDb } from './test-db';
import { getFlags, setFlag } from './queries';

let db: Awaited<ReturnType<typeof makeTestDb>>;

beforeEach(async () => {
	db = await makeTestDb();
});

describe('feature flags', () => {
	it('returns defaults when nothing is stored', async () => {
		expect(await getFlags(db)).toEqual({ mvp: false });
	});

	it('turns a flag on and reads it back', async () => {
		await setFlag(db, 'mvp', true);
		expect((await getFlags(db)).mvp).toBe(true);
	});

	it('turns a flag back off (upsert overwrites)', async () => {
		await setFlag(db, 'mvp', true);
		await setFlag(db, 'mvp', false);
		expect((await getFlags(db)).mvp).toBe(false);
	});
});
