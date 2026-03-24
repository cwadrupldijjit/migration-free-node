import type { DatabaseSync } from 'node:sqlite';
import { setupToSql } from './db/db-shared.ts';
import type { TrackedDbTableSetup } from './db/db.types.d.ts';

export const locationsTableName = 'locations';
const locationsTableSetup: TrackedDbTableSetup = {
	name: locationsTableName,
	uuid: '8394b1e2-cff4-4cf3-ae13-c191e0ac2a58',
	fields: [
		{
			name: 'id',
			uuid: 'a10821dc-bb10-4cc9-ac3d-166d23c5581a',
			type: 'INTEGER',
			primaryKey: true,
			autoIncrement: true,
		},
		{
			name: 'name',
			uuid: '1d75350c-9585-4d01-9e71-d086d3d36b9c',
			type: 'TEXT',
			notNull: true,
		},
		{
			name: 'description',
			uuid: '0230ec59-cd12-4921-86fe-e6e52590035d',
			type: 'TEXT',
		},
		{
			name: 'created_at',
			uuid: '6a0a128a-d111-4f62-812c-ad80e517b733',
			type: 'TEXT',
			notNull: true,
			default: 'CURRENT_TIMESTAMP',
		},
		{
			name: 'updated_at',
			uuid: '8c6c6c35-df0f-4706-a113-c0ac5fc827a3',
			type: 'TEXT',
			notNull: true,
			default: 'CURRENT_TIMESTAMP',
		},
	],
};

const dependencySeedFunctions: typeof getSeedSql[] = [];

let initialized = false;

export function *getSeedSql(db: DatabaseSync): Generator<string> {
	if (!db) {
		throw new Error('Database is not initialized; cannot seed navigation data.');
	}
	
	// this prevents duplication during generation
	if (initialized) {
		return;
	}
	
	for (const depSeedSqlMethod of dependencySeedFunctions) {
		for (const sql of depSeedSqlMethod(db)) {
			yield sql;
		}
	}
	
	yield '--- Seeding locations tables (locations.seed.ts) ---';
	for (const sql of setupToSql(locationsTableSetup, db)) {
		yield sql;
	}
	
	initialized = true;
}
