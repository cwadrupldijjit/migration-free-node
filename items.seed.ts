import type { DatabaseSync } from 'node:sqlite';
import { setupToSql } from './db/db-shared.ts';
import type { TrackedDbTableSetup } from './db/db.types.d.ts';

export const itemsTableName = 'items';
const itemsTableSetup: TrackedDbTableSetup = {
	name: itemsTableName,
	uuid: '481172e1-367b-4f09-9d18-1bda7d04b765',
	fields: [
		{
			name: 'id',
			uuid: '6e4b3c85-2401-4cbd-8e37-0774597aa890',
			type: 'INTEGER',
			primaryKey: true,
			autoIncrement: true,
		},
		{
			name: 'name',
			uuid: '89d31464-aa45-41a2-ab47-a4003d2ff479',
			type: 'TEXT',
			notNull: true,
		},
		{
			name: 'description',
			uuid: '93848ecb-bec9-4ad8-9865-496a0b788710',
			type: 'TEXT',
		},
		{
			name: 'main_image',
			uuid: 'a7d88e28-aafd-4102-a248-92a23c0201a3',
			type: 'TEXT',
		},
		{
			name: 'created_at',
			uuid: '9f13535d-0a30-41c9-89c5-f1af9a3e98ce',
			type: 'TEXT',
			notNull: true,
			default: 'CURRENT_TIMESTAMP',
		},
		{
			name: 'updated_at',
			uuid: '0917935f-d262-4aa8-98f8-e3dd57b4bbde',
			type: 'TEXT',
			notNull: true,
			default: 'CURRENT_TIMESTAMP',
		}
	],
};

const dependencySeedFunctions: typeof getSeedSql[] = [];

let initialized = false;

export function getSeedSql(db: DatabaseSync): string {
	if (!db) {
		throw new Error('Database is not initialized; cannot seed navigation data.');
	}
	
	// this prevents duplication during generation
	if (initialized) {
		return '';
	}
	
	const seedSqlStatements: string[] = [];
	
	for (const depSeedSqlMethod of dependencySeedFunctions) {
		seedSqlStatements.push(depSeedSqlMethod(db));
	}
	
	seedSqlStatements.push(
		'--- Seeding items tables (items.seed.ts) ---',
		setupToSql(itemsTableSetup, db),
	);
	
	initialized = true;
	
	return seedSqlStatements.filter(Boolean).join('\n');
}

export interface DbItem {
	id: number;
	name: string;
	description?: string;
	main_image?: string;
	created_at: string;
	updated_at: string;
}
