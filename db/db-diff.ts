import type {
	ColumnMetaRecord,
	DbFieldObject,
	DbIndexObject,
	DbTableSetup,
	IndexMetaRecord,
	TableMetaRecord,
	TrackedDbFieldObject,
	TrackedDbIndexObject,
	TrackedDbTableSetup,
} from './db.types.d.ts';

export function diffTableSchemas(
	tableSetupObject: TrackedDbTableSetup,
	currentTableSchema?: DbTableSetup,
	tableMetaRecord?: TableMetaRecord,
	currentIndexes: DbIndexObject[] = [],
	columnMetaRecords: ColumnMetaRecord[] = [],
	indexMetaRecords: IndexMetaRecord[] = [],
	metaMode = false
) {
	const result = {} as DiffTableSchemasResult;
	
	const unaccountedForFields = currentTableSchema?.fields.slice(0) ?? [];
	const newColumns: TrackedDbFieldObject[] = [];
	const renamedColumns: Record<string, [ newName: string, uuid?: string ]> = {};
	const columnsWithOtherChanges: DbFieldObject[] = [];
	let hasConstraintChanges = false;
	const newIndexes: TrackedDbIndexObject[] = [];
	const indexesToRefresh: Record<string, TrackedDbIndexObject> = {};
	const metaUpdates: string[] = [];
	
	if (!metaMode && !tableMetaRecord) {
		metaUpdates.push(`INSERT INTO __table_meta (uuid, name) VALUES ('${tableSetupObject.uuid}', '${tableSetupObject.name}');`);
	}
	
	if (tableSetupObject.name != currentTableSchema?.name) {
		result.tableRename = [ currentTableSchema!.name, tableSetupObject.name ];
	}
	
	for (const field of tableSetupObject.fields) {
		const columnMetaRecord = columnMetaRecords.find(col => col.uuid == field.uuid);
		const existingColumn = currentTableSchema?.fields.find(col => columnMetaRecord?.name == col.name || col.name == field.name);
		
		if (!existingColumn) {
			newColumns.push(field);
			!metaMode && metaUpdates.push(`INSERT INTO __column_meta (uuid, table_uuid, name) VALUES ('${field.uuid}', '${tableSetupObject.uuid}', '${field.name}');`);
		}
		else {
			if (field.name != existingColumn.name) {
				renamedColumns[existingColumn.name] = [ field.name, field.uuid ];
				!metaMode && metaUpdates.push(`UPDATE __column_meta SET name = '${field.name}' WHERE uuid = '${field.uuid}';`);
			}
			
			if (
				field.autoIncrement != existingColumn.autoIncrement ||
				field.collation != existingColumn.collation ||
				field.default != existingColumn.default ||
				field.notNull != existingColumn.notNull ||
				typeof field.primaryKey != typeof existingColumn.primaryKey ||
				(typeof field.primaryKey == 'boolean' || typeof field.primaryKey == 'undefined' ?
					field.primaryKey != existingColumn.primaryKey :
					field.primaryKey.onConflict != (existingColumn.primaryKey as { onConflict: string }).onConflict ||
						field.primaryKey.order != (existingColumn.primaryKey as { order: string }).order) ||
				field.type != existingColumn.type ||
				field.unique != existingColumn.unique ||
				field.check != existingColumn.check
			) {
				columnsWithOtherChanges.push(field);
			}
			
			unaccountedForFields.splice(unaccountedForFields.indexOf(existingColumn), 1);
		}
	}
	
	if (newColumns.length) {
		result.newColumns = newColumns;
	}
	
	if (Object.keys(renamedColumns).length) {
		result.renamedColumns = renamedColumns;
	}
	
	if (unaccountedForFields.length) {
		result.extraneousColumns = unaccountedForFields.map(f => f.name);
	}
	
	if (columnsWithOtherChanges.length) {
		result.columnsWithOtherChanges = columnsWithOtherChanges;
	}
	
	let remainingConstraints = currentTableSchema?.constraints?.slice(0) ?? [];
	
	for (const constraint of currentTableSchema?.constraints ?? []) {
		const matchingConstraint = tableSetupObject.constraints?.find(c => {
			return c.type == constraint.type &&	 
				c.fields.every((field) => constraint.fields.includes(field)) &&
				c.name == constraint.name &&
				c.onConflict == constraint.onConflict &&
				c.references?.table == constraint.references?.table &&
				c.references?.fields?.every((field) => constraint.references?.fields?.includes(field)) &&
				c.references?.onDelete == constraint.references?.onDelete &&
				c.references?.onUpdate == constraint.references?.onUpdate;
		});
		
		if (!matchingConstraint) {
			hasConstraintChanges = true;
			break;
		}
		
		remainingConstraints.splice(remainingConstraints.indexOf(constraint), 1);
	}
	
	if (!hasConstraintChanges && remainingConstraints.length > 0) {
		hasConstraintChanges = true;
	}
	
	if (hasConstraintChanges) {
		result.hasConstraintChanges = true;
	}
	
	if (tableSetupObject.options) {
		const tableOptionsToAdd: string[] = [];
		const tableOptionsToRemove: string[] = [];
		
		if (tableSetupObject.options.withoutRowId && !(currentTableSchema?.options?.withoutRowId)) {
			tableOptionsToAdd.push('WITHOUT ROWID');
		}
		else if (!tableSetupObject.options.withoutRowId && currentTableSchema?.options?.withoutRowId) {
			tableOptionsToRemove.push('WITHOUT ROWID');
		}
		
		if (tableSetupObject.options.strict && !(currentTableSchema?.options?.strict)) {
			tableOptionsToAdd.push('STRICT');
		}
		else if (!tableSetupObject.options.strict && currentTableSchema?.options?.strict) {
			tableOptionsToRemove.push('STRICT');
		}
		
		if (tableOptionsToAdd.length) {
			result.tableOptionsToAdd = tableOptionsToAdd;
		}
		
		if (tableOptionsToRemove.length) {
			result.tableOptionsToRemove = tableOptionsToRemove;
		}
	}
	
	const remainingIndexes = currentIndexes.slice(0) ?? [];
	
	for (const index of tableSetupObject.indexes ?? []) {
		const indexMetaRecord = indexMetaRecords.find(idx => idx.uuid == index.uuid);
		const existingIndex = currentIndexes.find(idx => indexMetaRecord?.name == idx.name || idx.name == index.name);
		
		if (!existingIndex) {
			newIndexes.push(index);
			!metaMode && metaUpdates.push(`INSERT INTO __index_meta (uuid, table_uuid, name) VALUES ('${index.uuid}', '${tableSetupObject.uuid}', '${index.name}');`);
		}
		else {
			if (index.name != existingIndex.name) {
				!metaMode && metaUpdates.push(`UPDATE __index_meta SET name = '${index.name}' WHERE uuid = '${index.uuid}';`);
			}
			
			if (
				index.name != existingIndex.name ||
				existingIndex.fields.length != index.fields.length ||
				!existingIndex.fields.every(field => index.fields.some(indexField => {
					if (typeof field == 'string' && typeof indexField == 'string') {
						return field == indexField;
					}
					else if (typeof field == 'object' && typeof indexField == 'object') {
						return field.expression == indexField.expression && field.order == indexField.order;
					}
					return false;
				})) ||
				existingIndex.unique != index.unique ||
				existingIndex.where != index.where
			) {
				indexesToRefresh[existingIndex.name] = index;
			}
			
			remainingIndexes.splice(remainingIndexes.indexOf(existingIndex), 1);
		}
	}
	
	if (newIndexes.length) {
		result.newIndexes = newIndexes;
	}
	
	if (Object.keys(indexesToRefresh).length) {
		result.indexesToRefresh = indexesToRefresh;
	}
	
	if (remainingIndexes.length) {
		result.extraneousIndexes = remainingIndexes.map(i => i.name);
	}
	
	if (metaUpdates.length) {
		result.metaUpdates = metaUpdates;
	}
	
	return result;
}

export interface DiffTableSchemasResult {
	tableRename?: [ currentName: string, newName: string ];
	newColumns?: TrackedDbFieldObject[];
	renamedColumns?: Record<string, [ newName: string, uuid?: string ]>;
	extraneousColumns?: string[];
	columnsWithOtherChanges?: DbFieldObject[];
	hasConstraintChanges?: boolean;
	extraneousIndexes?: string[];
	newIndexes?: TrackedDbIndexObject[];
	indexesToRefresh?: Record<string, DbIndexObject>;
	metaUpdates?: string[];
	tableOptionsToAdd?: string[];
	tableOptionsToRemove?: string[];
}
