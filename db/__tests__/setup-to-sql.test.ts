import { afterEach, beforeEach, describe, test } from 'node:test';
import { equal, match, notEqual } from 'node:assert';
import { DatabaseSync } from 'node:sqlite';
import { getMetaTableSeedQueries, setupToCreateSql, setupToUpdateSql } from '../db-shared.ts';
import type { TrackedDbTableSetup } from '../db.types.d.ts';

describe('setupToCreateSql', () => {
	test('A setup object provided to the setupToCreateSql function results in the correct CREATE TABLE statement', () => {
		const tableSetup: TrackedDbTableSetup = {
			uuid: 'some-unique-identifier',
			name: 'test_table',
			fields: [
				{ name: 'foo', uuid: 'foo' },
				{ name: 'bar', type: 'INTEGER', uuid: 'bar' },
				{ name: 'baz', type: 'TEXT', notNull: true, uuid: 'baz' },
				{ name: 'quux', type: 'REAL', unique: true, uuid: 'quux' },
				{ name: 'blah', type: 'BLOB', default: Buffer.from('🥧', 'utf-8'), uuid: 'blah' },
				{ name: 'yo', type: 'TEXT', generated: { expression: 'UPPER(baz)' }, uuid: 'yo' },
			],
			constraints: [
				{
					type: 'CHECK',
					fields: [ 'bar >= 0' ],
				},
				{
					type: 'FOREIGN KEY',
					fields: [ 'foo' ],
					references: {
						table: 'other_table',
						fields: [ 'id' ],
						onDelete: 'CASCADE',
						onUpdate: 'CASCADE',
					},
				},
				{
					type: 'UNIQUE',
					fields: [ 'baz' ],
				},
			],
			indexes: [
				{
					name: 'idx_bar',
					uuid: 'idx_bar_uuid',
					fields: [ { expression: 'bar' } ],
				},
			],
			options: {
				withoutRowId: true,
				strict: true,
			},
		};
		
		const expectedFieldListEntries = [
			...tableSetup.fields.map(f => ({ type: 'column' as const, data: f })),
			...tableSetup.constraints.map(c => ({ type: 'constraint' as const, data: c })),
		];
		
		const result = setupToCreateSql(tableSetup);
		
		const [ firstStatement, secondStatement, ...rest ] = Array.from(result)
			.map(s => s.trim())
			.filter(Boolean);
		equal(firstStatement.startsWith('CREATE TABLE test_table ('), true);
		
		const fieldList = firstStatement
			.slice(firstStatement.indexOf('(') + 1, firstStatement.lastIndexOf(')')).trim()
			.split(',\n\t')
			.map(s => s.trim());
		
		for (const field of fieldList) {
			const matchingEntry = expectedFieldListEntries.find(e => field.startsWith(e.type == 'column' ? e.data.name : e.data.type));
			notEqual(matchingEntry, null, `Field list entry "${field}" does not match any expected entry.`);
			
			if (matchingEntry.type == 'column') {
				if (matchingEntry.data.type) {
					equal(new RegExp(`\\b${matchingEntry.data.type}\\b`).test(field), true, `Field "${matchingEntry.data.name}" does not include type "${matchingEntry.data.type}".`);
				}
				if (matchingEntry.data.notNull) {
					equal(/\bNOT NULL\b/.test(field), true, `Field "${matchingEntry.data.name}" is missing NOT NULL constraint.`);
				}
				if (matchingEntry.data.unique) {
					equal(/\bUNIQUE\b/.test(field), true, `Field "${matchingEntry.data.name}" is missing UNIQUE constraint.`);
				}
				if (matchingEntry.data.default !== undefined) {
					if (typeof matchingEntry.data.default === 'string') {
						equal(new RegExp(`\\bDEFAULT '${matchingEntry.data.default.replace("'", "''")}'\\b`).test(field), true, `Field "${matchingEntry.data.name}" is missing DEFAULT value "${matchingEntry.data.default}".`);
					}
					else if (matchingEntry.data.default instanceof Buffer) {
						const hex = matchingEntry.data.default.toString('hex');
						equal(new RegExp(`\\bDEFAULT X'${hex}'`).test(field), true, `Field "${matchingEntry.data.name}" is missing DEFAULT BLOB value "X'${hex}'"; got "${field}".`);
					}
				}
				if (matchingEntry.data.generated) {
					equal(new RegExp(`\\bGENERATED ALWAYS AS \\(${matchingEntry.data.generated.expression.replace('(', '\\(').replace(')', '\\)')}\\)`).test(field), true, `Field "${matchingEntry.data.name}" is missing GENERATED ALWAYS AS clause with expression "${matchingEntry.data.generated.expression}"; got "${field}".`);
				}
			}
			else if (matchingEntry.type == 'constraint') {
				if (matchingEntry.data.type === 'CHECK') {
					equal(new RegExp(`\\bCHECK \\(${matchingEntry.data.fields[0]}\\)`).test(field), true, `Constraint CHECK is missing or incorrect; got "${field}".`);
				}
				else if (matchingEntry.data.type === 'FOREIGN KEY') {
					equal(new RegExp(`\\bFOREIGN KEY \\(${matchingEntry.data.fields.join(', ')}\\)`).test(field), true, `Constraint FOREIGN KEY is missing or incorrect; got "${field}".`);
					equal(new RegExp(`\\bREFERENCES ${matchingEntry.data.references!.table}\\s*\\(${matchingEntry.data.references!.fields!.join(', ')}\\)`).test(field), true, `Constraint FOREIGN KEY REFERENCES clause is missing or incorrect; got "${field}".`);
				}
				else if (matchingEntry.data.type === 'UNIQUE') {
					equal(new RegExp(`\\bUNIQUE \\(${matchingEntry.data.fields.join(', ')}\\)`).test(field), true, `Constraint UNIQUE is missing or incorrect; got "${field}".`);
				}
			}
		}
		
		const generatedTableOptions = firstStatement.slice(firstStatement.lastIndexOf(')') + 1).trim()
			.split(/,[\n\s]+/)
			.map(s => s.trim());
		
		equal(generatedTableOptions.includes('WITHOUT ROWID'), true, 'Table options missing WITHOUT ROWID.');
		equal(generatedTableOptions.includes('STRICT'), true, 'Table options missing STRICT.');
		
		equal(secondStatement, 'CREATE INDEX idx_bar ON test_table (bar)');
		
		// the rest should be meta inserts; if that is not true, we need to address it
		for (const statement of rest) {
			match(statement, /^INSERT INTO __(?:column|table|index)_meta/);
		}
	});
});

describe('setupToUpdateSql', () => {
	let db: DatabaseSync;
	
	beforeEach(() => {
		db = new DatabaseSync(':memory:');
		let metaSeedQuery = '';
		
		for (const sql of getMetaTableSeedQueries(db)) {
			metaSeedQuery += sql + '\n';
		}
		db.exec(metaSeedQuery);
	});
	
	afterEach(() => {
		db.isOpen && db.close();
		db = null;
	});
	
	test('Given a column not currently present in the table, it will generate sql to add it', () => {
		const tableSetup: TrackedDbTableSetup = {
			uuid: 'some-unique-identifier',
			name: 'test_table',
			fields: [
				{ name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true, uuid: 'id' },
				{ name: 'name', type: 'TEXT', notNull: true, uuid: 'name' },
			],
			constraints: [],
			indexes: [],
		};
		
		const createSql = Array.from(setupToCreateSql(tableSetup)).join('\n');
		db.exec(createSql);
		
		tableSetup.fields.push({ name: 'description', type: 'TEXT', uuid: 'description' });
		
		const alterSql = Array.from(setupToUpdateSql(tableSetup, db)).join('\n');
		
		equal(alterSql.includes('ALTER TABLE test_table ADD COLUMN description TEXT;'), true);
		// This must not fail
		db.exec(alterSql);
	});
	
	test('Given a column that should have a name change, it will generate sql to rename the column', () => {
		const tableSetup: TrackedDbTableSetup = {
			uuid: 'some-unique-identifier',
			name: 'test_table',
			fields: [
				{ name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true, uuid: 'id' },
				{ name: 'name', type: 'TEXT', uuid: 'name' },
			],
		};
		
		db.exec(Array.from(setupToCreateSql(tableSetup)).join('\n'));
		
		// rename 'name' to 'full_name'
		tableSetup.fields[1].name = 'full_name';
		
		const alterStatements = Array.from(setupToUpdateSql(tableSetup, db)).join('\n');
		
		console.log('ALTER STATEMENTS:', alterStatements);
		
		equal(alterStatements.startsWith(`ALTER TABLE ${tableSetup.name}`), true);
		equal(alterStatements.includes(`RENAME COLUMN name TO full_name`), true);
		// This must not fail
		db.exec(alterStatements);
	});
	
	test('Given a column that has no constraint but the config has one, it will generate sql to add the constraint', () => {
		const tableSetup: TrackedDbTableSetup = {
			uuid: 'some-unique-identifier',
			name: 'test_table',
			fields: [
				{ name: 'id', type: 'INTEGER', primaryKey: true, autoIncrement: true, uuid: 'id' },
				{ name: 'name', type: 'TEXT', uuid: 'name' },
			],
		};
		
		db.exec(Array.from(setupToCreateSql(tableSetup)).join('\n'));
		
		// new constraint now exists
		tableSetup.fields[1].notNull = true;
		
		const alterStatements = Array.from(setupToUpdateSql(tableSetup, db)).join('\n');
		
		equal(alterStatements.includes(`CREATE TABLE ${tableSetup.name}`), true);
		equal(alterStatements.includes(`NOT NULL`), true);
		// This must not fail
		db.exec(alterStatements);
	});
});
