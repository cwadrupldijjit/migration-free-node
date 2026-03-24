import type { DatabaseSync } from 'node:sqlite';
import { diffTableSchemas } from './db-diff.ts';
import type {
	ColumnMetaRecord,
	DbFieldObject,
	TrackedDbTableSetup,
	IndexMetaRecord,
	SqliteMasterRecord,
	TableMetaRecord,
	DbIndexObject,
	EntityReferrable,
	DbReferencesObject,
} from './db.types.d.ts';
import { parseCreateIndexSql, parseCreateTableSql } from './parse-sql.ts';

const metaTablesSetup: (TrackedDbTableSetup & { previousNames?: string[] })[] = [
	{
		name: '__table_meta',
		uuid: 'table_meta_uuid',
		fields: [
			{ name: 'uuid', type: 'TEXT', primaryKey: true, uuid: null },
			{ name: 'name', type: 'TEXT', notNull: true, unique: true, uuid: null },
		],
		constraints: [],
		indexes: [],
	},
	{
		name: '__column_meta',
		uuid: 'column_meta_uuid',
		fields: [
			{ name: 'uuid', type: 'TEXT', primaryKey: true, uuid: null },
			{ name: 'table_uuid', type: 'TEXT', notNull: true, uuid: null },
			{ name: 'name', type: 'TEXT', notNull: true, uuid: null },
		],
		constraints: [
			{
				type: 'FOREIGN KEY',
				fields: [ 'table_uuid' ],
				references: {
					table: '__table_meta',
					fields: [ 'uuid' ],
					onDelete: 'CASCADE',
				},
			},
			{
				type: 'UNIQUE',
				fields: [ 'table_uuid', 'name' ],
			},
		],
		indexes: [],
	},
	{
		name: '__index_meta',
		uuid: 'index_meta_uuid',
		fields: [
			{ name: 'uuid', type: 'TEXT', primaryKey: true, uuid: null },
			{ name: 'table_uuid', type: 'TEXT', notNull: true, uuid: null },
			{ name: 'name', type: 'TEXT', notNull: true, uuid: null },
		],
		constraints: [
			{
				type: 'FOREIGN KEY',
				fields: [ 'table_uuid' ],
				references: {
					table: '__table_meta',
					fields: [ 'uuid' ],
					onDelete: 'CASCADE',
				},
			},
			{
				type: 'UNIQUE',
				fields: [ 'table_uuid', 'name' ],
			},
		],
	},
];

export function *getMetaTableSeedQueries(db: DatabaseSync): Generator<string> {
	if (!db?.isOpen) {
		throw new Error('Database is not open; cannot seed meta data.');
	}
	
	const metaTables = db.prepare('SELECT * FROM sqlite_master WHERE type = \'table\' AND name like \'%_meta\'').all() as unknown[] as SqliteMasterRecord[];
	for (const table of metaTablesSetup) {
		const existingTable = metaTables.find(mt => mt.name == table.name || table.previousNames?.includes(mt.name));
		let setupFn: () => Generator<string>;
		if (!existingTable) {
			setupFn = setupToCreateSql.bind(null, table, true);
		}
		else {
			setupFn = setupToUpdateSql.bind(null, table, db, true);
		}
		
		for (const sql of setupFn()) {
			yield sql;
		}
	}
}

export function setupToSql(tableSetupObject: TrackedDbTableSetup, db: DatabaseSync, metaMode = false): Generator<string> {
	if (!db?.isOpen) {
		throw new Error('Database is not open; cannot setup tables.');
	}
	
	const matchingTable = db.prepare(`SELECT * FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tableSetupObject.name);
	
	if (!matchingTable) {
		return setupToCreateSql(tableSetupObject, metaMode);
	}
	else {
		return setupToUpdateSql(tableSetupObject, db, metaMode);
	}
}

/**
 * This turns a setup object into the necessary sql to add it to the database.  No DB connection is required
 * since no diff is needed.  If `skipMeta` is set to `true`, it will only yield the CREATE TABLE statement
 * without meta updates.
 * @param tableSetupObject The table setup object which is being used to generate the create table statement
 * @param skipMeta Used to suppress any "meta" inserts (such as if intending to create meta tables)
 */
export function *setupToCreateSql(tableSetupObject: TrackedDbTableSetup, skipMeta = false): Generator<string> {
	const createCKIClauses: string[] = [];
	const tableOptions: string[] = [];
	const metaColumnInserts: string[] = [];
	
	for (const field of tableSetupObject.fields) {
		createCKIClauses.push(createFieldClause(field));
		metaColumnInserts.push(`INSERT INTO __column_meta (uuid, table_uuid, name) VALUES ('${field.uuid ?? tableSetupObject.uuid + '_' + field.name}', '${tableSetupObject.uuid}', '${field.name}');`);
	}
	
	for (const constraint of tableSetupObject.constraints ?? []) {
		const constraintClause: string[] = [];
		
		if (constraint.name) {
			constraintClause.push(`CONSTRAINT ${constraint.name}`);
		}
		
		constraintClause.push(
			constraint.type,
			`(${constraint.fields.join(', ')})`,
		);
		
		if ((constraint.type == 'PRIMARY KEY' || constraint.type == 'UNIQUE') && constraint.onConflict) {
			constraintClause.push(`ON CONFLICT ${constraint.onConflict}`);
		}
		if (constraint.type == 'FOREIGN KEY') {
			if (!constraint.references?.table) {
				throw new TypeError('FOREIGN KEY constraints must have a references clause');
			}
			
			constraintClause.push(createReferencesClause(constraint.references));
		}
		createCKIClauses.push(constraintClause.join(' '));
	}
	
	if (tableSetupObject.options) {
		if (tableSetupObject.options.withoutRowId) {
			tableOptions.push('WITHOUT ROWID');
		}
		if (tableSetupObject.options.strict) {
			tableOptions.push('STRICT');
		}
	}
	
	// first statement:  create table clause
	yield `CREATE TABLE ${tableSetupObject.name} (
	${createCKIClauses.join(',\n\t')}
)${tableOptions.length ? '\n' + tableOptions.join(',\n') : ''};`;
	
	// next statements: any indexes
	for (const index of tableSetupObject.indexes ?? []) {
		yield indexToCreateSql(index, tableSetupObject.name);
	}
	
	// last statements: any meta table updates
	if (!skipMeta) {
		yield `INSERT INTO __table_meta (uuid, name) VALUES ('${tableSetupObject.uuid}', '${tableSetupObject.name}');`;
		
		for (const meta of metaColumnInserts) {
			yield meta;
		}
	}
}

function createReferencesClause(reference: DbReferencesObject) {
	let referenceString = `REFERENCES ${reference.table}`;
	
	if (reference.fields) {
		referenceString += ` (${reference.fields.join(', ')})`;
	}
	if (reference.onDelete) {
		referenceString += ` ON DELETE ${reference.onDelete}`;
	}
	if (reference.onUpdate) {
		referenceString += ` ON UPDATE ${reference.onUpdate}`;
	}
	
	return referenceString;
}

export function *setupToUpdateSql(tableSetupObject: TrackedDbTableSetup, db: DatabaseSync, skipMeta = false): Generator<string> {
	const tableMetaRecord = !skipMeta ?
		db.prepare(`SELECT * FROM __table_meta WHERE uuid = ?`).get(tableSetupObject.uuid) as unknown as TableMetaRecord :
		null;
	
	const columnMetaRecords = !skipMeta ?
		db.prepare(`SELECT * FROM __column_meta WHERE table_uuid = ?`).all(tableSetupObject.uuid) as unknown[] as ColumnMetaRecord[] :
		null;
	
	const indexMetaRecords = !skipMeta ?
		db.prepare(`SELECT * FROM __index_meta WHERE table_uuid = ?`).all(tableSetupObject.uuid) as unknown[] as IndexMetaRecord[] :
		null;
	
	const { sql: currentTableSql } = db.prepare(`select sql from sqlite_master where type = 'table' and name = ?`).get(tableMetaRecord?.name ?? tableSetupObject.name) as unknown as SqliteMasterRecord;
	
	const currentTableSchema = parseCreateTableSql(currentTableSql);
	
	const existingIndexes = (db.prepare(`SELECT * FROM sqlite_master WHERE type = 'index' AND tbl_name = ?`)
															// I know, I know, unknown cast is cringe; best I can do
		.all(tableMetaRecord?.name ?? tableSetupObject.name) as unknown[] as SqliteMasterRecord[])
		.filter(idx => !idx.name.startsWith('sqlite_autoindex_') || idx.sql)
		.map(idx => idx.sql ? parseCreateIndexSql(idx.sql as string) : null);
	
	const diffResult = diffTableSchemas(
		tableSetupObject,
		currentTableSchema,
		tableMetaRecord ?? undefined,
		existingIndexes ?? [],
		columnMetaRecords ?? [],
		indexMetaRecords ?? [],
		skipMeta,
	);
	
	if (
		diffResult.hasConstraintChanges ||
		diffResult.columnsWithOtherChanges?.length ||
		diffResult.tableOptionsToAdd?.length ||
		diffResult.tableOptionsToRemove?.length
	) {
		const tempTableName = `${tableSetupObject.name}__update_temp`;
		const newToOldColumnMap: Record<string, string> = {};
		for (const field of tableSetupObject.fields) {
			const columnMetaRecord = columnMetaRecords?.find(col => col.uuid == field.uuid);
			const existingColumn = currentTableSchema?.fields.find(col => columnMetaRecord?.name == col.name || col.name == field.name);
			
			if (existingColumn) {
				newToOldColumnMap[field.name] = existingColumn.name;
			}
		}
		
		// drop all existing indexes to prevent future name conflicts in the new table
		for (const index of existingIndexes) {
			yield `DROP INDEX IF EXISTS ${index.name};`;
		}
		
		yield 'PRAGMA foreign_keys=off;';
		
		const indexesToCreate: string[] = [];
		
		// the "for" unwraps the generator to be the desired string
		for (const setupString of setupToCreateSql(tableSetupObject, true)) {
			if (setupString.startsWith('CEATE TABLE')) {
				yield setupString.replace(`CREATE TABLE ${tableSetupObject.name}`, `CREATE TABLE ${tempTableName}`);
			}
			// create indexes after the table is created to avoid changing the table name in the string
			else if (/^CREATE(?: UNIQUE)? INDEX/.test(setupString)) {
				indexesToCreate.push(setupString);
			}
		}
		
		yield `INSERT INTO ${tempTableName} (${
			tableSetupObject.fields
				.filter(f => newToOldColumnMap[f.name])
				.map(f => f.name).join(', ')
		}) SELECT ${
			tableSetupObject.fields
				.filter(f => newToOldColumnMap[f.name])
				.map(f => newToOldColumnMap[f.name]).join(', ')
		} FROM ${tableSetupObject.name};`;
		
		yield `DROP TABLE ${tableSetupObject.name};`;
		
		yield `ALTER TABLE ${tempTableName} RENAME TO ${tableSetupObject.name};`;
		
		for (const indexString of indexesToCreate) {
			yield indexString;
		}
		
		yield 'PRAGMA foreign_keys=on;';
	}
	else {
		if (diffResult.tableRename) {
			yield `ALTER TABLE ${diffResult.tableRename[0]} RENAME TO ${diffResult.tableRename[1]};`;
		}
		
		for (const [ existingIndexName, index ] of Object.entries(diffResult.indexesToRefresh ?? {})) {
			yield `DROP INDEX IF EXISTS ${existingIndexName};`;
			yield indexToCreateSql(index, tableSetupObject.name);
		}
		
		for (const index of diffResult.newIndexes ?? []) {
			yield indexToCreateSql(index, tableSetupObject.name);
		}
		
		for (const indexName of diffResult.extraneousIndexes ?? []) {
			yield `DROP INDEX IF EXISTS ${indexName};`;
		}
		
		for (const [ oldName, [ newName ]] of Object.entries(diffResult.renamedColumns ?? {})) {
			yield `ALTER TABLE ${tableSetupObject.name} RENAME COLUMN ${oldName} TO ${newName};`;
		}
		
		for (const col of diffResult.newColumns ?? []) {
			yield `ALTER TABLE ${tableSetupObject.name} ADD COLUMN ${createFieldClause(col)};`;
		}
		
		for (const colName of diffResult.extraneousColumns ?? []) {
			yield `ALTER TABLE DROP COLUMN ${colName};`;
		}
		
		if (!skipMeta) {
			for (const update of diffResult.metaUpdates ?? []) {
				yield update;
			}
		}
	}
	
	if (!skipMeta && diffResult.metaUpdates) {
		for (const sql of diffResult.metaUpdates) {
			yield sql;
		}
	}
}

function createFieldClause(field: DbFieldObject) {
	const fieldClause: string[] = [
		field.name,
	];
	
	if (field.type) {
		fieldClause.push(field.type);
	}
	if (field.primaryKey) {
		fieldClause.push('PRIMARY KEY');
	}
	if (field.autoIncrement) {
		fieldClause.push('AUTOINCREMENT');
	}
	if (field.notNull) {
		fieldClause.push('NOT NULL');
	}
	if (field.unique) {
		fieldClause.push('UNIQUE');
	}
	if (field.collation) {
		fieldClause.push(`COLLATE ${field.collation}`);
	}
	if (field.default !== undefined) {
		if (field.default == null) {
			fieldClause.push('DEFAULT NULL');
		}
		else if (typeof field.default == 'string') {
			fieldClause.push(`DEFAULT '${field.default.replace(/'/g, "''")}'`);
		}
		else if ((typeof field.default == 'number' && !isNaN(field.default)) || typeof field.default == 'boolean') {
			fieldClause.push(`DEFAULT ${Number(field.default)}`);
		}
		else if (field.default instanceof Uint8Array || field.default instanceof Buffer) {
			const hexString = Array.from(field.default).map(byte => byte.toString(16).padStart(2, '0')).join('');
			fieldClause.push(`DEFAULT X'${hexString}'`);
		}
		else {
			throw new Error(`Unsupported default value type for field ${field.name}`);
		}
	}
	if (field.check) {
		fieldClause.push(`CHECK (${field.check})`);
	}
	if (field.references) {
		fieldClause.push(createReferencesClause(field.references));
	}
	if (field.generated) {
		fieldClause.push(`GENERATED ALWAYS AS (${field.generated.expression})`);
		if (field.generated.stored) {
			fieldClause.push('STORED');
		}
	}
	return fieldClause.join(' ');
}

function indexToCreateSql(index: DbIndexObject, tableName: string) {
	const indexClause: string[] = [];
	indexClause.push('CREATE');
	if (index.unique) {
		indexClause.push('UNIQUE');
	}
	indexClause.push(`INDEX ${index.name} ON ${tableName} (${index.fields.map(f => `${f.expression}${f.collate ? ' COLLATE ' + f.collate : ''}${f.order ? ' ' + f.order : ''}`).join(', ')})`);
	if (index.where) {
		indexClause.push(`WHERE ${index.where}`);
	}
	return indexClause.join(' ') + ';';
}

export function maybeHydrateEntity<
	IncomingType extends object,
	ExpectedType extends object & { entity?: any } = Record<string, any>
>(entity: IncomingType, db: DatabaseSync, depth?: number): ExpectedType | IncomingType {
	if (!entity || !('entity_type' in entity) || !('entity_value' in entity)) {
		return entity;
	}
	
	let referencedEntity = entity as unknown as IncomingType & EntityReferrable;
	
	const referencedTable = db.prepare(`SELECT * FROM sqlite_master WHERE type='table' AND name = ?`)
		.get(referencedEntity.entity_type) as unknown as SqliteMasterRecord | undefined;
	
	if (!referencedTable) {
		return entity;
	}
	
	const fetchedEntity = db.prepare(`SELECT * FROM ${referencedTable.name} WHERE id = ?`)
		.get(referencedEntity.entity_value) as unknown as ExpectedType | null;
	
	if (!fetchedEntity) {
		return entity;
	}
	
	if (depth) {
		fetchedEntity.entity = maybeHydrateEntity(fetchedEntity.entity, db, depth - 1);
	}
	
	return fetchedEntity;
}
