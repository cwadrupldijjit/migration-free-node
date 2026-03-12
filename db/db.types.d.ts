export interface DbTableSetup {
	/** This is if a schema is specified for the table */
	schema?: string;
	/** This had been kept separate, but the utility is too great to leave off */
	name: string;
	/** This generally should only exist when parsing sql; the practicality of temporary tables is moot for general application use */
	temporary?: boolean;
	/** @todo This is the "AS" clause for creating a table from a query; when this is specified, the fields will be derived from the query (eventually) */
	as?: string;
	/** These are the fields and their associated constraints, if specified */
	fields: [ DbFieldObject, ...DbFieldObject[] ];
	/** These are the keys not desired to be defined on the fields */
	constraints?: DbConstraintObject[];
	/** These are the indexes not added elsewhere */
	indexes?: DbIndexObject[];
	/** These are the table-level options */
	options?: {
		withoutRowId?: boolean;
		strict?: boolean;
	};
	seedData?: any[];
}

export interface TrackedDbTableSetup extends DbTableSetup {
	/** This is any kind of globally-unique identifier for the table; it will not change, but can be used to track table renames */
	uuid: string;
	fields: [ TrackedDbFieldObject, ...TrackedDbFieldObject[] ];
	indexes?: TrackedDbIndexObject[];
}

export interface DbReferencesObject {
	table: string;
	fields?: string[];
	onDelete?: 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';
	onUpdate?: 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';
	match?: string;
	deferrable?: {
		negated?: boolean
		type?: 'DEFERRED' | 'IMMEDIATE';
	};
}

export interface DbFieldObject {
	name: string;
	type?: 'TEXT' | 'INTEGER' | 'REAL' | 'BLOB' | 'NUMERIC';
	unique?: boolean;
	primaryKey?: boolean | {
		order?: 'ASC' | 'DESC';
		onConflict?: 'ROLLBACK' | 'ABORT' | 'FAIL' | 'IGNORE' | 'REPLACE';
	};
	autoIncrement?: boolean;
	notNull?: boolean;
	generated?: {
		expression: string;
		stored?: boolean;
	};
	/** This contains the check constraint expression for the field if one exists */
	check?: string;
	default?: string | number | boolean | TypedArray | DataView | null;
	collation?: 'BINARY' | 'NOCASE' | 'RTRIM' | string;
	references?: DbReferencesObject;
}

export interface DbConstraintObject {
	name?: string;
	type: 'PRIMARY KEY' | 'UNIQUE' | 'CHECK' | 'FOREIGN KEY';
	/** In "CHECK" type constraints, it will only have a single element, which is not a "field" but the check expression */
	fields: string[];
	/** This only applies to primary key or unique constraints; ignored otherwise */
	onConflict?: 'ROLLBACK' | 'ABORT' | 'FAIL' | 'IGNORE' | 'REPLACE';
	references?: DbReferencesObject;
}

export interface TrackedDbFieldObject extends DbFieldObject {
	/**
	 * This is a globally-unique identifier for this field that will not change, which
	 * means that any time a field is renamed or any other changes are required, this
	 * identifier remains constant;
	 * it is stored and the name is tracked in the `column_meta` table
	 */
	uuid: string;
}

export interface DbIndexObject {
	schema?: string;
	name: string;
	/** ideally, this should only be used while parsing create index expressions */
	table?: string;
	/** This should only really be used while parsing create index expressions */
	ifNotExists?: boolean;
	fields: {
		/** This expression can either be a column name or some other kind of expression */
		expression: string;
		collate?: string;
		order?: 'ASC' | 'DESC';
	}[];
	unique?: boolean;
	where?: string;
}

export interface TrackedDbIndexObject extends DbIndexObject {
	/**
	 * This is a globally-unique identifier for this index that will not change, which
	 * means that any time an index is renamed or any other changes are required, this
	 * identifier remains constant;
	 * it is stored and the name is tracked in the `index_meta` table
	 */
	uuid: string;
}

export interface TableMetaRecord {
	uuid: string;
	schema?: string;
	name: string;
}

export interface ColumnMetaRecord {
	uuid: string;
	table_uuid: string;
	name: string;
}

export interface IndexMetaRecord {
	uuid: string;
	table_uuid: string;
	name: string;
}

export interface SqliteMasterRecord {
	type: 'table' | 'index' | 'view' | 'trigger';
	name: string;
	tbl_name: string;
	rootpage: number;
	sql: string;
}

export interface SqliteTableInfoRecord {
	name: string;
	type: string;
	notnull: 0 | 1;
	dflt_value: string | null;
	pk: 0 | 1;
}

export type TypedArray<SubType extends ArrayBufferLike = ArrayBufferLike> = Int8Array<SubType> |
	Uint8Array<SubType> |
	Uint8ClampedArray<SubType> |
	Int16Array<SubType> |
	Uint16Array<SubType> |
	Int32Array<SubType> |
	Uint32Array<SubType> |
	Float16Array<SubType> |
	Float32Array<SubType> |
	Float64Array<SubType> |
	BigInt64Array<SubType> |
	BigUint64Array<SubType>;

export interface EntityReferrable {
	entity_type: string;
	entity_value?: string;
}
