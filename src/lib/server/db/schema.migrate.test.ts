import { describe, it, expect } from 'vitest';
import { eq } from 'drizzle-orm';
import { makeTestDb } from './test-db';
import { players, user } from './schema';

describe('schema migration', () => {
	it('applies auth tables and the new player columns', async () => {
		const db = await makeTestDb();
		// auth table exists and is empty
		expect(await db.select().from(user)).toEqual([]);
		// players carries email + is_admin (default false)
		await db.insert(players).values({ name: 'Jur', email: 'jur@example.com' });
		const [row] = await db.select().from(players).where(eq(players.name, 'Jur'));
		expect(row.email).toBe('jur@example.com');
		expect(row.isAdmin).toBe(false);
	});
});
