import { setupToSql } from './db/db-shared.ts';
import type { TrackedDbTableSetup } from './db/db.types.d.ts';
import { locationsTableName, getSeedSql as seedLocations } from './locations.seed.ts'
import { itemsTableName, getSeedSql as seedItems } from './items.seed.ts';
import { DatabaseSync } from 'node:sqlite';

export const charactersTableName = 'characters';
const characterTableSetup: TrackedDbTableSetup = {
	name: charactersTableName,
	uuid: '33c45d27-3534-4b50-8b3f-f2ad74aa12c9',
	fields: [
		{
			name: 'id',
			uuid: '14e3b19e-c996-46b1-a4ea-91d77ce843cb',
			type: 'INTEGER',
			primaryKey: true,
			autoIncrement: true,
		},
		{
			name: 'name',
			uuid: 'e2a247fe-b22b-4cc3-ad6c-654c97150cb8',
			type: 'TEXT',
			notNull: true,
		},
		{
			name: 'icon',
			uuid: '82ca3e79-fb2f-4eb3-9d44-2c4b7bc4977b',
			type: 'TEXT',
		},
		{
			name: 'description',
			uuid: 'd3037d04-40e0-4537-8948-433bc46b93bd',
			type: 'TEXT',
		},
		{
			name: 'created_at',
			uuid: 'cfa19c0c-2602-49ea-9bc5-96117580c4cc',
			type: 'TEXT',
			notNull: true,
			default: 'CURRENT_TIMESTAMP',
		},
		{
			name: 'updated_at',
			uuid: 'e90a3272-855e-40c4-8830-2e0ed8865389',
			type: 'TEXT',
			notNull: true,
			default: 'CURRENT_TIMESTAMP',
		},
	],
};

const characterRelationshipTableSetup: TrackedDbTableSetup = {
	name: 'character_relationships',
	uuid: 'e26ffb28-7d70-4df8-8fe1-9fe086064ab3',
	fields: [
		{
			name: 'perspective_character_id',
			uuid: 'fed7f52b-63fe-40ff-b7e0-7d017046d294',
			type: 'INTEGER',
			notNull: true,
			references: {
				table: charactersTableName,
				fields: [ 'id' ],
				onDelete: 'CASCADE',
			},
		},
		{
			name: 'related_character_id',
			uuid: '6958cb43-64a4-4f2c-9442-8f0640e0b2d6',
			type: 'INTEGER',
			notNull: true,
			references: {
				table: charactersTableName,
				fields: [ 'id' ],
				onDelete: 'CASCADE',
			},
		},
		{
			name: 'relationship_type',
			uuid: '711c06f2-3ea4-4110-80a6-a95039b59484',
			type: 'TEXT',
		},
		{
			name: 'notes',
			uuid: '1a458d58-fcd5-4a07-ad66-e173238d21ae',
			type: 'TEXT',
		},
	],
};

const characterGroupsTableName = 'character_groups';
const characterGroupsTableSetup: TrackedDbTableSetup = {
	name: characterGroupsTableName,
	uuid: 'e0ac532a-f3b1-4b7e-bbbb-1b9d93bf8201',
	fields: [
		{
			name: 'id',
			uuid: '2f3e1f4c-B7e1-4d2e-8f4a-3c3f5e6d7a8b',
			type: 'INTEGER',
			primaryKey: true,
			autoIncrement: true,
		},
		{
			name: 'name',
			uuid: '2072d403-f630-4c3c-ad9d-f1e189cb21cb',
			type: 'TEXT',
			notNull: true,
		},
		{
			name: 'description',
			uuid: '01bfe98f-2ddd-4439-bd1d-950af57854fe',
			type: 'TEXT',
		},
		{
			name: 'icon',
			uuid: '3d409401-3b3a-464c-8866-9d2a1a0a10ed',
			type: 'TEXT',
		},
		{
			name: 'created_at',
			uuid: '80864f9b-ae8a-4a0f-a7b6-5fab37997c3b',
			type: 'TEXT',
			notNull: true,
			default: 'CURRENT_TIMESTAMP',
		},
		{
			name: 'updated_at',
			uuid: '72a8578a-7788-400c-968a-71be3761b0a8',
			type: 'TEXT',
			notNull: true,
			default: 'CURRENT_TIMESTAMP',
		},
	],
};

const characterGroupAffiliationTableSetup: TrackedDbTableSetup = {
	name: 'character_group_affiliations',
	uuid: '79edc6d2-a929-4c3e-9e95-d9f096b74207',
	fields: [
		{
			name: 'character_id',
			uuid: '41ff7350-a6b7-4d1a-929a-7e022dfbdccb',
			type: 'INTEGER',
			notNull: true,
			references: {
				table: charactersTableName,
				fields: [ 'id' ],
				onDelete: 'CASCADE',
			},
		},
		{
			name: 'group_id',
			uuid: '9eee404c-d3d0-4185-8e5b-17b257588e09',
			type: 'INTEGER',
			notNull: true,
			references: {
				table: characterGroupsTableName,
				fields: [ 'id' ],
				onDelete: 'CASCADE',
			},
		},
		{
			name: 'role',
			uuid: '6505eb99-36b1-4919-b69a-f2bc0962d238',
			type: 'TEXT',
		},
		{
			name: 'notes',
			uuid: '27fba572-294e-4889-9fd3-b6b2dc10428f',
			type: 'TEXT',
		},
	],
};

const characterLocationTableSetup: TrackedDbTableSetup = {
	name: 'character_locations',
	uuid: '3f036391-f48a-41f8-93cf-1d84352f26cc',
	fields: [
		{
			name: 'id',
			uuid: '6d962255-2f43-4993-ac22-bb0ea08c018f',
			type: 'INTEGER',
			primaryKey: true,
			autoIncrement: true,
		},
		{
			name: 'character_id',
			uuid: '5958180e-5761-4813-97e4-7fea37c736bc',
			type: 'INTEGER',
			notNull: true,
			references: {
				table: charactersTableName,
				fields: [ 'id' ],
				onDelete: 'CASCADE',
			},
		},
		{
			name: 'location_id',
			uuid: 'f5205efd-4bc2-456b-96a6-2eed02c9e324',
			type: 'INTEGER',
			notNull: true,
			references: {
				table: locationsTableName,
				fields: [ 'id' ],
				onDelete: 'CASCADE',
			},
		},
		{
			name: 'nickname',
			uuid: 'a4daa552-bbbb-4a60-b0cf-8b8471dc3010',
			type: 'TEXT',
		},
		{
			name: 'alternative_icon',
			uuid: '0d62baf1-52c1-43e0-85c0-2a83552907fb',
			type: 'TEXT',
		},
		{
			name: 'type',
			uuid: '874d852b-43ce-4c0d-870a-8daf12fc4e6e',
			type: 'TEXT',
		},
	],
};

const characterItemTableSetup: TrackedDbTableSetup = {
	name: 'character_items',
	uuid: 'f71c5577-0606-491e-9e28-5d5d49df7587',
	fields: [
		{
			name: 'id',
			uuid: 'd8dae7f5-15e0-46ec-bd24-f77f1f053825',
			type: 'INTEGER',
			primaryKey: true,
			autoIncrement: true,
		},
		{
			name: 'character_id',
			uuid: 'fc9832c9-c98a-4a79-8bf0-e6c5c1cc2bad',
			type: 'INTEGER',
			notNull: true,
			references: {
				table: charactersTableName,
				fields: [ 'id' ],
				onDelete: 'CASCADE',
			},
		},
		{
			name: 'item_id',
			uuid: 'fee90a6a-e628-4718-8352-3895c88032da',
			type: 'INTEGER',
			notNull: true,
			references: {
				table: itemsTableName,
				fields: [ 'id' ],
				onDelete: 'CASCADE',
			},
		},
		{
			name: 'nickname',
			uuid: '146f8683-37d6-4497-a3f8-6775c6c4ddd7',
			type: 'TEXT',
		},
		{
			name: 'notes',
			uuid: 'd7f1979d-8ec9-4279-b412-cf8e5531d635',
			type: 'TEXT',
		},
	],
};

const dependencySeedFunctions: typeof getSeedSql[] = [
	seedLocations,
	seedItems,
];

let initialized = false;

export function *getSeedSql(db: DatabaseSync): Generator<string> {
	if (!db?.isOpen) {
		throw new Error('Database is not open; cannot seed navigation data.');
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
	
	yield '--- Seeding characters tables (characters.seed.ts) ---';
	for (const sql of setupToSql(characterTableSetup, db)) {
		yield sql;
	}
	
	for (const sql of setupToSql(characterRelationshipTableSetup, db)) {
		yield sql;
	}
	
	for (const sql of setupToSql(characterGroupsTableSetup, db)) {
		yield sql;
	}
	
	for (const sql of setupToSql(characterGroupAffiliationTableSetup, db)) {
		yield sql;
	}
	
	for (const sql of setupToSql(characterLocationTableSetup, db)) {
		yield sql;
	}
	
	for (const sql of setupToSql(characterItemTableSetup, db)) {
		yield sql;
	}
	
	initialized = true;
}


export interface Character {
	id: number;
	name: string;
	description?: string;
	created_at: string;
	updated_at: string;
}

export interface CharacterRelationship {
	perspective_character_id: number;
	related_character_id: number;
	relationship_type?: string;
	notes?: string;
}

export interface CharacterGroup {
	id: number;
	name: string;
	description?: string;
	icon?: string;
	created_at: string;
	updated_at: string;
}

export interface CharacterGroupAffiliation {
	character_id: number;
	group_id: number;
	role?: string;
	notes?: string;
}

export interface CharacterLocation {
	id: number;
	character_id: number;
	location_id: number;
	nickname?: string;
	alternative_icon?: string;
	type?: string;
}

export interface CharacterItem {
	id: number;
	character_id: number;
	item_id: number;
	nickname?: string;
	notes?: string;
}
