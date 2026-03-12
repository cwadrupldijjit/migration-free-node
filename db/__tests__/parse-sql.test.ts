import test, { describe } from 'node:test';
import { parseCreateIndexSql, parseCreateTableSql } from '../parse-sql.ts';
import { equal } from 'assert';

describe('parseCreateTableSql | columns', () => {
	test('given a simple CREATE TABLE statement, it parses correctly', () => {
		const sql = `CREATE TABLE test_table (
	id INTEGER,
	name TEXT,
	age real,
	arbitrary_data BLOB
)`;
		
		const tableSetup = parseCreateTableSql(sql);
		
		equal(tableSetup.name, 'test_table');
		equal(tableSetup.fields.length, 4);
		
		const idField = tableSetup.fields[0];
		equal(idField.type, 'INTEGER');
		
		const nameField = tableSetup.fields[1];
		equal(nameField.type, 'TEXT');
		
		const ageField = tableSetup.fields[2];
		equal(ageField.type, 'REAL');
		
		const arbitraryDataField = tableSetup.fields[3];
		equal(arbitraryDataField.type, 'BLOB');
	});
	
	test('given a CREATE TABLE statement with a default value, it parses correctly', () => {
		const sql = `CREATE TABLE test_table (
	created_at TEXT DEFAULT CURRENT_TIMESTAMP,
	is_active INTEGER DEFAULT 1,
	name TEXT DEFAULT 'Unnamed',
	score REAL DEFAULT 0.0,
	positive INTEGER DEFAULT +100,
	negative INTEGER DEFAULT -50,
	expression TEXT DEFAULT (LOWER('DEFAULT')),
	blob_data BLOB DEFAULT X'48656C6C6F',
	empty_string text DEFAULT '',
	null_field TEXT DEFAULT NULL,
	boolean_true INTEGER DEFAULT TRUE,
	boolean_false INTEGER DEFAULT FALSE,
	extreme_quote text default ''''
)`;
		
		const tableSetup = parseCreateTableSql(sql);
		
		equal(tableSetup.name, 'test_table');
		equal(tableSetup.fields.length, 13);
		
		const createdAtField = tableSetup.fields[0];
		equal(createdAtField.name, 'created_at');
		equal(createdAtField.type, 'TEXT');
		equal(createdAtField.default, 'CURRENT_TIMESTAMP');
		
		const isActiveField = tableSetup.fields[1];
		equal(isActiveField.name, 'is_active');
		equal(isActiveField.type, 'INTEGER');
		equal(isActiveField.default, 1);
		
		const nameField = tableSetup.fields[2];
		equal(nameField.name, 'name');
		equal(nameField.type, 'TEXT');
		equal(nameField.default, 'Unnamed');
		
		const scoreField = tableSetup.fields[3];
		equal(scoreField.name, 'score');
		equal(scoreField.type, 'REAL');
		equal(scoreField.default, 0);
		
		const positiveField = tableSetup.fields[4];
		equal(positiveField.name, 'positive');
		equal(positiveField.type, 'INTEGER');
		equal(positiveField.default, 100);
		
		const negativeField = tableSetup.fields[5];
		equal(negativeField.name, 'negative');
		equal(negativeField.type, 'INTEGER');
		equal(negativeField.default, -50);
		
		const expressionField = tableSetup.fields[6];
		equal(expressionField.name, 'expression');
		equal(expressionField.type, 'TEXT');
		equal(expressionField.default, 'LOWER(\'DEFAULT\')');
		
		const blobDataField = tableSetup.fields[7];
		equal(blobDataField.name, 'blob_data');
		equal(blobDataField.type, 'BLOB');
		equal(blobDataField.default instanceof Uint8Array, true);
		
		const emptyStringField = tableSetup.fields[8];
		equal(emptyStringField.name, 'empty_string');
		equal(emptyStringField.type, 'TEXT');
		equal(emptyStringField.default, '');
		
		const nullField = tableSetup.fields[9];
		equal(nullField.name, 'null_field');
		equal(nullField.type, 'TEXT');
		equal(nullField.default, 'NULL');
		
		const booleanTrueField = tableSetup.fields[10];
		equal(booleanTrueField.name, 'boolean_true');
		equal(booleanTrueField.type, 'INTEGER');
		equal(booleanTrueField.default, true);
		
		const booleanFalseField = tableSetup.fields[11];
		equal(booleanFalseField.name, 'boolean_false');
		equal(booleanFalseField.type, 'INTEGER');
		equal(booleanFalseField.default, false);
		
		const extremeQuoteField = tableSetup.fields[12];
		equal(extremeQuoteField.name, 'extreme_quote');
		equal(extremeQuoteField.type, 'TEXT');
		equal(extremeQuoteField.default, "'");
	});
	
	test('given a CREATE TABLE statement with columns having various constraints, it parses correctly', () => {
		const sql = `CREATE TABLE test_table (
	id INTEGER PRIMARY KEY on conflict ignore AUTOINCREMENT,
	username TEXT UNIQUE NOT NULL,
	age INTEGER CHECK (age >= 0),
	email TEXT COLLATE NOCASE,
	bio TEXT DEFAULT 'Hello!' NOT NULL
)`;
		
		const tableSetup = parseCreateTableSql(sql);
		
		equal(tableSetup.name, 'test_table');
		equal(tableSetup.fields.length, 5);
		
		const idField = tableSetup.fields[0];
		equal(idField.name, 'id');
		equal(idField.type, 'INTEGER');
		equal(typeof idField.primaryKey, 'object');
		equal((idField.primaryKey as { onConflict: string }).onConflict, 'IGNORE');
		equal(idField.autoIncrement, true);
		
		const usernameField = tableSetup.fields[1];
		equal(usernameField.name, 'username');
		equal(usernameField.type, 'TEXT');
		equal(usernameField.unique, true);
		equal(usernameField.notNull, true);
		
		const ageField = tableSetup.fields[2];
		equal(ageField.name, 'age');
		equal(ageField.type, 'INTEGER');
		equal(ageField.check, 'age >= 0');
		
		const emailField = tableSetup.fields[3];
		equal(emailField.name, 'email');
		equal(emailField.type, 'TEXT');
		equal(emailField.collation, 'NOCASE');
		
		const bioField = tableSetup.fields[4];
		equal(bioField.name, 'bio');
		equal(bioField.type, 'TEXT');
		equal(bioField.default, 'Hello!');
		equal(bioField.notNull, true);
	});
	
	test('given a CREATE TABLE statement with columns having various different kinds of foreign key references, it parses correctly', () => {
		const sql = `CREATE TABLE test_table (
	table_only INTEGER REFERENCES other_table,
	specific_column INTEGER REFERENCES another_table(id),
	multiple_columns INTEGER REFERENCES some_table(col1, col2),
	on_update INTEGER REFERENCES foo_table on update set null,
	on_delete INTEGER REFERENCES bar_table on delete restrict,
	match_clause INTEGER REFERENCES baz_table match foo,
	deferrable_clause INTEGER REFERENCES quux_table not deferrable initially deferred,
	mother_of_all_clauses integer references blah_table(id) on update set null ON DELETE CASCADE match \`foo\` deferrable INITIALLY deferred
)`;
		
		const tableSetup = parseCreateTableSql(sql);
		
		equal(tableSetup.name, 'test_table');
		equal(tableSetup.fields.length, 8);
		
		const tableOnlyField = tableSetup.fields[0];
		equal(tableOnlyField.name, 'table_only');
		equal(typeof tableOnlyField.references, 'object');
		equal(tableOnlyField.references.table, 'other_table');
		
		const specificColumnField = tableSetup.fields[1];
		equal(specificColumnField.name, 'specific_column');
		equal(specificColumnField.references.table, 'another_table');
		equal(specificColumnField.references.fields.length, 1);
		equal(specificColumnField.references.fields[0], 'id');
		
		const multipleColumnsField = tableSetup.fields[2];
		equal(multipleColumnsField.name, 'multiple_columns');
		equal(multipleColumnsField.references.table, 'some_table');
		equal(multipleColumnsField.references.fields.length, 2);
		equal(multipleColumnsField.references.fields[0], 'col1');
		equal(multipleColumnsField.references.fields[1], 'col2');
		
		const onUpdateField = tableSetup.fields[3];
		equal(onUpdateField.name, 'on_update');
		equal(onUpdateField.references.table, 'foo_table');
		equal(onUpdateField.references.onUpdate, 'SET NULL');
		
		const onDeleteField = tableSetup.fields[4];
		equal(onDeleteField.name, 'on_delete');
		equal(onDeleteField.references.table, 'bar_table');
		equal(onDeleteField.references.onDelete, 'RESTRICT');
		
		const matchClauseField = tableSetup.fields[5];
		equal(matchClauseField.name, 'match_clause');
		equal(matchClauseField.references.table, 'baz_table');
		equal(matchClauseField.references.match, 'foo');
		
		const deferrableClauseField = tableSetup.fields[6];
		equal(deferrableClauseField.name, 'deferrable_clause');
		equal(deferrableClauseField.references.table, 'quux_table');
		equal(deferrableClauseField.references.deferrable.negated, true);
		equal(deferrableClauseField.references.deferrable.type, 'DEFERRED');
		
		const motherOfAllClausesField = tableSetup.fields[7];
		equal(motherOfAllClausesField.name, 'mother_of_all_clauses');
		equal(motherOfAllClausesField.references.table, 'blah_table');
		equal(motherOfAllClausesField.references.fields.length, 1);
		equal(motherOfAllClausesField.references.fields[0], 'id');
		equal(motherOfAllClausesField.references.onUpdate, 'SET NULL');
		equal(motherOfAllClausesField.references.onDelete, 'CASCADE');
		equal(motherOfAllClausesField.references.match, 'foo');
		equal(motherOfAllClausesField.references.deferrable.type, 'DEFERRED');
	});
	
	test('given a CREATE TABLE statement with a column that has a generated expression, it parses correctly', () => {
		const sql = `CREATE TABLE test_table (
	id INTEGER GENERATED ALWAYS AS (ABS(random() % 100)) STORED,
	name TEXT GENERATED ALWAYS AS (UPPER(name)) VIRTUAL
)`;
		
		const tableSetup = parseCreateTableSql(sql);
		
		equal(tableSetup.name, 'test_table');
		equal(tableSetup.fields.length, 2);
		
		const idField = tableSetup.fields[0];
		equal(idField.name, 'id');
		equal(idField.type, 'INTEGER');
		equal(typeof idField.generated, 'object');
		equal(idField.generated.expression, 'ABS(random() % 100)');
		equal(idField.generated.stored, true);
		
		const nameField = tableSetup.fields[1];
		equal(nameField.name, 'name');
		equal(nameField.type, 'TEXT');
		equal(typeof nameField.generated, 'object');
		equal(nameField.generated.expression, 'UPPER(name)');
		equal(nameField.generated.stored, false);
	});
});

describe('parseCreateTableSql | constraints', () => {
	test('given a CREATE TABLE statement with various table-level constraints, it parses correctly', () => {
		const sql = `CREATE TABLE test_table (
	id INTEGER,
	PRIMARY KEY (id),
	UNIQUE (id),
	CHECK (id > 0),
	FOREIGN KEY (id) REFERENCES other_table(id) on delete cascade on update set null
)`;
		
		const tableSetup = parseCreateTableSql(sql);
		
		equal(tableSetup.name, 'test_table');
		equal(tableSetup.constraints.length, 4);
		
		const primaryKeyConstraint = tableSetup.constraints[0];
		equal(primaryKeyConstraint.type, 'PRIMARY KEY');
		equal(primaryKeyConstraint.fields.length, 1);
		equal(primaryKeyConstraint.fields[0], 'id');
		
		const uniqueConstraint = tableSetup.constraints[1];
		equal(uniqueConstraint.type, 'UNIQUE');
		equal(uniqueConstraint.fields.length, 1);
		equal(uniqueConstraint.fields[0], 'id');
		
		const checkConstraint = tableSetup.constraints[2];
		equal(checkConstraint.type, 'CHECK');
		equal(checkConstraint.fields.length, 1);
		equal(checkConstraint.fields[0], 'id > 0');
		
		const foreignKeyConstraint = tableSetup.constraints[3];
		equal(foreignKeyConstraint.type, 'FOREIGN KEY');
		equal(foreignKeyConstraint.fields.length, 1);
		equal(foreignKeyConstraint.fields[0], 'id');
		equal(foreignKeyConstraint.references.table, 'other_table');
		equal(foreignKeyConstraint.references.fields.length, 1);
		equal(foreignKeyConstraint.references.fields[0], 'id');
		equal(foreignKeyConstraint.references.onDelete, 'CASCADE');
		equal(foreignKeyConstraint.references.onUpdate, 'SET NULL');
	});
});

describe('parseCreateTableSql | table options', () => {
	test('given a CREATE TABLE statement with table options, it parses correctly', () => {
		const sql = `CREATE TABLE test_table (
	id INTEGER
) WITHOUT ROWID, STRICT`;
		
		const tableSetup = parseCreateTableSql(sql);
		
		equal(tableSetup.name, 'test_table');
		equal(typeof tableSetup.options, 'object');
		equal(tableSetup.options.withoutRowId, true);
		equal(tableSetup.options.strict, true);
	});
});

describe('parseCreateIndexSql', () => {
	test('given a simple CREATE INDEX statement, it parses correctly', () => {
		const sql = `CREATE INDEX idx_name ON test_table (name)`;
		
		const indexSetup = parseCreateIndexSql(sql);
		
		equal(indexSetup.name, 'idx_name');
		equal(indexSetup.table, 'test_table');
		equal(indexSetup.fields.length, 1);
		equal(typeof indexSetup.fields[0], 'object');
		equal(indexSetup.fields[0].expression, 'name');
	});
	
	test('given a CREATE INDEX statement with multiple fields and IF NOT EXISTS clause, it parses correctly', () => {
		const sql = `CREATE INDEX IF NOT EXISTS idx_multi ON test_table (age, score DESC, name ASC)`;
		
		const indexSetup = parseCreateIndexSql(sql);
		
		equal(indexSetup.name, 'idx_multi');
		equal(indexSetup.table, 'test_table');
		equal(indexSetup.ifNotExists, true);
		equal(indexSetup.fields.length, 3);
		equal(indexSetup.fields[0].expression, 'age');
		equal(indexSetup.fields[1].expression, 'score');
		equal(indexSetup.fields[1].order, 'DESC');
		equal(indexSetup.fields[2].expression, 'name');
		equal(indexSetup.fields[2].order, 'ASC');
	});
});
