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
import { charactersTableName } from '../characters.seed.ts';
import { itemsTableName } from '../items.seed.ts';
import { locationsTableName } from '../locations.seed.ts';

// TODO:  Make this more automatic rather than explicit and, ideally, not here
export const referenceableTables = {
	[charactersTableName]: 'id',
	[itemsTableName]: 'id',
	[locationsTableName]: 'id',
} as const;

export const referencingTables: [string, string][] = [
	// this irrelevant to this example
];

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

export function getMetaTableSeedQueries(db: DatabaseSync) {
	if (!db?.isOpen) {
		throw new Error('Database is not open; cannot seed meta data.');
	}
	
	const seedSqlStatements = [];
	
	const metaTables = db.prepare('SELECT * FROM sqlite_master WHERE type = \'table\' AND name like \'%_meta\'').all() as unknown[] as SqliteMasterRecord[];
	for (const table of metaTablesSetup) {
		const existingTable = metaTables.find(mt => mt.name == table.name || table.previousNames?.includes(mt.name));
		if (!existingTable) {
			seedSqlStatements.push(setupToCreateSql(table, true));
		}
		else {
			seedSqlStatements.push(setupToUpdateSql(table, db, true));
		}
	}
	
	return seedSqlStatements.join('\n');
}

export function setupToSql(tableSetupObject: TrackedDbTableSetup, db: DatabaseSync, metaMode = false) {
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

export function setupToCreateSql(tableSetupObject: TrackedDbTableSetup, metaMode = false) {
	const statements: string[] = [];
	const createCKIClauses: string[] = [];
	const tableOptions: string[] = [];
	const createIndexClauses: string[] = [];
	const metaInserts: string[] = [
		`INSERT INTO __table_meta (uuid, name) VALUES ('${tableSetupObject.uuid}', '${tableSetupObject.name}');`,
	];
	
	for (const field of tableSetupObject.fields) {
		createCKIClauses.push(createFieldClause(field));
		metaInserts.push(`INSERT INTO __column_meta (uuid, table_uuid, name) VALUES ('${field.uuid ?? tableSetupObject.uuid + '_' + field.name}', '${tableSetupObject.uuid}', '${field.name}');`);
	}
	
	if (tableSetupObject.constraints) {
		for (const constraint of tableSetupObject.constraints) {
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
	}
	
	if (tableSetupObject.options) {
		if (tableSetupObject.options.withoutRowId) {
			tableOptions.push('WITHOUT ROWID');
		}
		if (tableSetupObject.options.strict) {
			tableOptions.push('STRICT');
		}
	}
	
	if (tableSetupObject.indexes) {
		for (const index of tableSetupObject.indexes) {
			createIndexClauses.push(indexToCreateSql(index, tableSetupObject.name));
		}
	}
	statements.push(`CREATE TABLE ${tableSetupObject.name} (
	${createCKIClauses.join(',\n\t')}
)${tableOptions.length ? '\n' + tableOptions.join(',\n') : ''};`);
	
	if (createIndexClauses.length) {
		statements.push(createIndexClauses.join(';\n') + ';');
	}
	
	if (!metaMode) {
		statements.push(...metaInserts);
	}
	
	return statements.join('\n');
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

export function setupToUpdateSql(tableSetupObject: TrackedDbTableSetup, db: DatabaseSync, metaMode = false) {
	const tableMetaRecord = !metaMode ?
		db.prepare(`SELECT * FROM __table_meta WHERE uuid = ?`).get(tableSetupObject.uuid) as unknown as TableMetaRecord :
		null;
	
	const columnMetaRecords = !metaMode ?
		db.prepare(`SELECT * FROM __column_meta WHERE table_uuid = ?`).all(tableSetupObject.uuid) as unknown[] as ColumnMetaRecord[] :
		null;
	
	const indexMetaRecords = !metaMode ?
		db.prepare(`SELECT * FROM __index_meta WHERE table_uuid = ?`).all(tableSetupObject.uuid) as unknown[] as IndexMetaRecord[] :
		null;
	
	const { sql: currentTableSql } = db.prepare(`select sql from sqlite_master where type = 'table' and name = ?`).get(tableMetaRecord?.name ?? tableSetupObject.name) as unknown as SqliteMasterRecord;
	
	const currentTableSchema = parseCreateTableSql(currentTableSql);
	
	const existingIndexes = (db.prepare(`SELECT * FROM sqlite_master WHERE type = 'index' AND tbl_name = ?`)
		.all(tableMetaRecord?.name ?? tableSetupObject.name) as unknown[] as SqliteMasterRecord[])
		.filter(idx => !idx.name.startsWith('sqlite_autoindex_') || idx.sql)
		.map(idx => idx.sql ? parseCreateIndexSql(idx.sql as string) : null)
	
	const diffResult = diffTableSchemas(
		tableSetupObject,
		currentTableSchema,
		tableMetaRecord ?? undefined,
		existingIndexes ?? [],
		columnMetaRecords ?? [],
		indexMetaRecords ?? [],
		metaMode,
	);
	
	const metaUpdates: string[] = [];
	const renameReferencesUpdates: string[] = [];
	
	if (!metaMode) {
		if (diffResult.tableRename) {
			renameReferencesUpdates.push(
				...referencingTables
					.map(([ refTable, refField ]) => `UPDATE ${refTable} SET ${refField} = '${diffResult.tableRename[1]}' WHERE ${refField} = '${diffResult.tableRename[0]}'`)
			);
			metaUpdates.push(`UPDATE __table_meta SET name = '${diffResult.tableRename[1]}' WHERE uuid = '${tableSetupObject.uuid}'`);
		}
		
		// *sigh*, I guess we'll handle the following loops twice.  It shouldn't be that large of a cost.
		for (const column of diffResult.newColumns ?? []) {
			metaUpdates.push(`INSERT INTO __column_meta (uuid, table_uuid, name) VALUES ('${column.uuid}', '${tableSetupObject.uuid}', '${column.name}')`);
		}
		
		for (const [ oldName, [ newName, uuid ] ] of Object.entries(diffResult.renamedColumns ?? {})) {
			metaUpdates.push(`UPDATE __column_meta SET name = '${newName}' WHERE uuid = '${uuid}'`);
		}
		
		for (const columnName of diffResult.extraneousColumns ?? []) {
			const columnMetaRecord = columnMetaRecords?.find(col => col.name == columnName);
			if (columnMetaRecord) {
				metaUpdates.push(`DELETE FROM __column_meta WHERE uuid = '${columnMetaRecord.uuid}'`);
			}
		}
		
		for (const index of diffResult.newIndexes ?? []) {
			metaUpdates.push(`INSERT INTO __index_meta (uuid, table_uuid, name) VALUES ('${index.uuid}', '${tableSetupObject.uuid}', '${index.name}')`);
		}
		
		for (const [ existingIndexName, index ] of Object.entries(diffResult.indexesToRefresh ?? {})) {
			// the only need for meta updates would be a renaming of the index
			if (existingIndexName == index.name) {
				continue;
			}
			const indexMetaRecord = indexMetaRecords?.find(idx => idx.name == existingIndexName);
			if (indexMetaRecord) {
				metaUpdates.push(`UPDATE __index_meta SET name = '${index.name}' WHERE uuid = '${indexMetaRecord.uuid}'`);
			}
		}
		
		for (const indexName of diffResult.extraneousIndexes ?? []) {
			const indexMetaRecord = indexMetaRecords?.find(idx => idx.name == indexName);
			if (indexMetaRecord) {
				metaUpdates.push(`DELETE FROM __index_meta WHERE uuid = '${indexMetaRecord.uuid}'`);
			}
		}
	}
	
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
		
		return [
			...existingIndexes.map(idx => `DROP INDEX IF EXISTS ${idx.name}`),
			'PRAGMA foreign_keys=off',
			setupToCreateSql(tableSetupObject, true)
				.replace(`CREATE TABLE ${tableSetupObject.name}`, `CREATE TABLE ${tempTableName}`)
				// this is to remove the extra semicolon at the end; likely isn't an issue, but is at least a little cleaner
				.slice(0, -1),
			`INSERT INTO ${tempTableName} (${
				tableSetupObject.fields
					.filter(f => newToOldColumnMap[f.name])
					.map(f => f.name).join(', ')
			}) SELECT ${
				tableSetupObject.fields
					.filter(f => newToOldColumnMap[f.name])
					.map(f => newToOldColumnMap[f.name]).join(', ')
			} FROM ${tableSetupObject.name}`,
			`DROP TABLE ${tableSetupObject.name}`,
			`ALTER TABLE ${tempTableName} RENAME TO ${tableSetupObject.name}`,
			'PRAGMA foreign_keys=on',
			...(metaMode ? [] : metaUpdates ?? []),
		].join(';\n') + ';';
	}
	
	return [
		...(diffResult.tableRename ? [ `ALTER TABLE ${diffResult.tableRename[0]} RENAME TO ${diffResult.tableRename[1]}` ] : []),
		...(diffResult.indexesToRefresh ?
				Object.entries(diffResult.indexesToRefresh)
					.flatMap(([ existingIndexName, index ]) => [
						'DROP INDEX IF EXISTS ' + existingIndexName,
						indexToCreateSql(index, tableSetupObject.name),
					]) :
				[]),
		...(diffResult.newIndexes ? diffResult.newIndexes.map(index => indexToCreateSql(index, tableSetupObject.name)) : []),
		...(diffResult.extraneousIndexes ? diffResult.extraneousIndexes.map(indexName => `DROP INDEX IF EXISTS ${indexName}`) : []),
		...(diffResult.renamedColumns ? Object.entries(diffResult.renamedColumns).map(([ oldName, [ newName ] ]) => `ALTER TABLE ${tableSetupObject.name} RENAME COLUMN ${oldName} TO ${newName}`) : []),
		...(diffResult.newColumns ? diffResult.newColumns.map(col => `ALTER TABLE ${tableSetupObject.name} ADD COLUMN ${createFieldClause(col)}`) : []),
		...(diffResult.extraneousColumns ? diffResult.extraneousColumns.map(colName => `ALTER TABLE DROP COLUMN ${colName}`) : []),
		...(metaMode ? [] : metaUpdates ?? []),
	].join(';\n') + ';';
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
	return indexClause.join(' ');
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
