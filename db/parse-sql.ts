import type { DbConstraintObject, DbFieldObject, DbIndexObject, DbReferencesObject, DbTableSetup } from './db.types.d.ts';

export function parseCreateTableSql(sql: string) {
	sql = sql.trim();
	
	const result = {} as DbTableSetup;
	
	if (!/^CREATE\s+(?:TEMP(?:ORARY)?\s+)?TABLE\s+/i.test(sql)) {
		throw new Error('Only CREATE TABLE statements can be parsed.');
	}
	
	let remainingSql = sql.trim().replace(/^create\s+/i, '');
	
	let currentStatementArea: 'createTableClause' | 'columnAndConstraintClauses' | 'tableOptions' = 'createTableClause';
	let currentSubType: 'fieldDefinition' | 'constraintDefinition';
	let currentField = {} as DbFieldObject;
	let currentConstraint = {} as DbConstraintObject;
	
	let expressionMatch: RegExpExecArray | null;
	
	while (remainingSql) {
		if (currentStatementArea == 'createTableClause') {
			// statement area termination checks
			if (remainingSql.startsWith('(')) {
				currentStatementArea = 'columnAndConstraintClauses';
				remainingSql = remainingSql.slice(1).trimStart();
				continue;
			}
			
			// skipping over irrelevant expressions
			if (expressionMatch = /^(?:TABLE|IF\s+NOT\s+EXISTS)\s+/i.exec(remainingSql)) {
				remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
				continue;
			}
			
			// setting options
			if (expressionMatch = /^TEMP(?:ORARY)?\s+/i.exec(remainingSql)) {
				result.temporary = true;
				result.schema = 'temp';
				remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
				continue;
			}
			
			if (expressionMatch = /^AS\s+/i.exec(remainingSql)) {
				remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
				result.as = remainingSql;
				// for now, this is a stub; also avoids the type error for assigning an empty field list
				Reflect.defineProperty(result, 'fields', { value: [] });
				// TODO: properly parse the AS query to extract fields
				break;
			}
			
			if (!result.name) {
				// the following regex allows for wrapped identifiers with "", ``, or [], but mostly is there to extract the table name
				const [ fullSegment, , schema, , tableName ] = /(?:(["`])|\[)?(?:([a-z0-9_]+)(?:\1|\])\.)?(?:(["`])|\[)?([a-z0-9_]+)(?:\3|\])\s+/i.exec(remainingSql);
				
				result.name = tableName;
				if (schema) {
					result.schema = schema;
				}
				
				remainingSql = remainingSql.slice(fullSegment.length).trimStart();
				continue;
			}
			
			throw new SyntaxError(`Unexpected syntax in CREATE TABLE statement near "${remainingSql.slice(0, 20)}".`);
		}
		else if (currentStatementArea == 'columnAndConstraintClauses') {
			// statement area termination checks
			if (remainingSql.startsWith(')') || remainingSql.startsWith(',')) {
				if (
					!currentSubType ||
					(currentSubType == 'fieldDefinition' && !Object.keys(currentField).length) ||
					(currentSubType == 'constraintDefinition' && !Object.keys(currentConstraint).length)
				) {
					throw new SyntaxError(`Unexpected syntax in CREATE TABLE statement near "${remainingSql.slice(0, 20)}".`);
				}
				
				if (currentSubType == 'fieldDefinition') {
					if (!('fields' in result)) {
						Reflect.defineProperty(result, 'fields', { value: [] });
					}
					result.fields.push(currentField as DbFieldObject);
					currentField = {} as DbFieldObject;
				}
				else {
					if (!('constraints' in result)) {
						Reflect.defineProperty(result, 'constraints', { value: [] });
					}
					result.constraints.push(currentConstraint as DbConstraintObject);
					currentConstraint = {} as DbConstraintObject;
				}
				if (remainingSql.startsWith(')')) {
					currentStatementArea = 'tableOptions';
				}
				else {
					currentSubType = null;
				}
				remainingSql = remainingSql.slice(1).trimStart();
				continue;
			}
			
			if (!currentSubType) {
				if (/^(?:CONSTRAINT|PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s+KEY)\b/i.test(remainingSql)) {
					currentSubType = 'constraintDefinition';
				}
				else {
					currentSubType = 'fieldDefinition';
				}
			}
			
			// setting options
			if (currentSubType == 'fieldDefinition') {
				if (!currentField.name) {
					// the following regex allows for wrapped identifiers with "", ``, or []
					const [ fullSegment, , fieldName ] = /(?:(["`])|\[)?([a-z0-9_]+)(?:\1|\])\s+/i.exec(remainingSql);
					
					currentField.name = fieldName;
					remainingSql = remainingSql.slice(fullSegment.length).trimStart();
					continue;
				}
				if (expressionMatch = /^(NUMERIC|INTEGER|REAL|TEXT|BLOB)\b/i.exec(remainingSql)) {
					currentField.type = expressionMatch[1].toUpperCase() as DbFieldObject['type'];
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					continue;
				}
				if (expressionMatch = /^DEFAULT\s/i.exec(remainingSql)) {
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					let { expression, remainingSql: newRemainingSql } = parseSubExpression(remainingSql);
					
					if (/^[+-]?[0-9.]/.test(expression)) {
						if (expression.startsWith('+')) {
							expression = expression.slice(1);
						}
						
						currentField.default = Number(expression);
					}
					else if (/^true|false/i.test(expression)) {
						currentField.default = expression.toUpperCase() == 'TRUE';
					}
					else if (/^X'/i.test(expression)) {
						currentField.default = new Uint8Array(expression.slice(2, -1).match(/.{1,2}/g).map(byte => parseInt(byte, 16)));
					}
					else {
						currentField.default = expression.trim();
					}
					
					remainingSql = newRemainingSql;
					continue;
				}
				if (expressionMatch = /^PRIMARY\s+KEY(?:\s+(ASC|DESC))?(?:\s+ON\s+CONFLICT\s+(ROLLBACK|ABORT|FAIL|IGNORE|REPLACE))?(\s+AUTOINCREMENT)?/i.exec(remainingSql)) {
					currentField.primaryKey = (!expressionMatch[1] && !expressionMatch[2]) || {};
					
					if (typeof currentField.primaryKey == 'object' && expressionMatch[1]) {
						currentField.primaryKey.order = expressionMatch[1].toUpperCase() as 'ASC' | 'DESC';
					}
					if (typeof currentField.primaryKey == 'object' && expressionMatch[2]) {
						currentField.primaryKey.onConflict = expressionMatch[2].toUpperCase() as 'ROLLBACK' | 'ABORT' | 'FAIL' | 'IGNORE' | 'REPLACE';
					}
					if (expressionMatch[3]) {
						currentField.autoIncrement = true;
					}
					
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();;
					continue;
				}
				if (expressionMatch = /^UNIQUE\b/i.exec(remainingSql)) {
					currentField.unique = true;
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					continue;
				}
				if (expressionMatch = /^(NOT\s+)?NULL\b/i.exec(remainingSql)) {
					currentField.notNull = Boolean(expressionMatch[1]);
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					continue;
				}
				if (expressionMatch = /^COLLATE\s+([a-z0-9_]+)\b/i.exec(remainingSql)) {
					currentField.collation = expressionMatch[1];
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					continue;
				}
				if (expressionMatch = /^CHECK\s*\((.*?)\)/i.exec(remainingSql)) {
					currentField.check = expressionMatch[1].trim();
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					continue;
				}
				if (expressionMatch = /^REFERENCES\s+/i.exec(remainingSql)) {
					const result = parseForeignKeyClause(remainingSql);
					currentField.references = result.references;
					remainingSql = result.remainingSql;
					continue;
				}
				if (expressionMatch = /^(?:GENERATED\s+ALWAYS\s+)AS\b/i.exec(remainingSql)) {
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					const { expression, remainingSql: newRemainingSql } = parseSubExpression(remainingSql);
					currentField.generated = {
						expression
					};
					remainingSql = newRemainingSql;
					
					if (expressionMatch = /^(STORED|VIRTUAL)\b/i.exec(remainingSql)) {
						currentField.generated.stored = expressionMatch[1].toUpperCase() == 'STORED';
						remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					}
					continue;
				}
				
				throw new SyntaxError(`Unexpected syntax in CREATE TABLE statement near "${remainingSql.slice(0, 20)}".`);
			}
			else {
				if (expressionMatch = /^CONSTRAINT\s+(?:(["`])|\[)([a-z0-9_]+)(?:\1|\]|\b)/i.exec(remainingSql)) {
					currentConstraint.name = expressionMatch[2];
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					continue;
				}
				
				if (expressionMatch = /^(PRIMARY\s+KEY|UNIQUE)\s+\(([^)]+)\)(?:\s+ON\s+CONFLICT\s+(ROLLBACK|ABORT|FAIL|IGNORE|REPLACE))?(?=\s|,|\b)/i.exec(remainingSql)) {
					const type = /^PRIMARY/i.test(expressionMatch[1]) ? 'PRIMARY KEY' : 'UNIQUE';
					const fields = expressionMatch[2].split(',').map(f => unquote(f.trim()));
					
					currentConstraint.type = type;
					currentConstraint.fields = fields;
					
					if (expressionMatch[3]) {
						currentConstraint.onConflict = expressionMatch[3].toUpperCase() as 'ROLLBACK' | 'ABORT' | 'FAIL' | 'IGNORE' | 'REPLACE';
					}
					
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();;
					continue;
				}
				
				if (expressionMatch = /^CHECK\s*/i.exec(remainingSql)) {
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					const { expression, remainingSql: newRemainingSql } = parseSubExpression(remainingSql);
					
					currentConstraint.type = 'CHECK';
					currentConstraint.fields = [ expression ];
					
					remainingSql = newRemainingSql;
					continue;
				}
				
				if (expressionMatch = /^FOREIGN\s+KEY\s*\(([^)]+)\)/i.exec(remainingSql)) {
					const fields = expressionMatch[1].split(',').map(f => unquote(f.trim()));
					
					currentConstraint.type = 'FOREIGN KEY';
					currentConstraint.fields = fields;
					
					remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
					
					if (remainingSql.startsWith('REFERENCES')) {
						const result = parseForeignKeyClause(remainingSql);
						currentConstraint.references = result.references;
						remainingSql = result.remainingSql;
					}
					continue;
				}
				
				throw new SyntaxError(`Unexpected syntax in CREATE TABLE statement near "${remainingSql.slice(0, 20)}".`);
			}
		}
		else {
			if (remainingSql.startsWith(';')) {
				// for now, just ignore anything following a semicolon
				remainingSql = '';
				continue;
			}
			if (remainingSql.startsWith(',')) {
				remainingSql = remainingSql.slice(1).trimStart();
				continue;
			}
			if (!('options' in result)) {
				result.options = {};
			}
			if (expressionMatch = /^WITHOUT\s+ROWID/i.exec(remainingSql)) {
				result.options.withoutRowId = true;
				remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
				continue;
			}
			if (expressionMatch = /^STRICT/i.exec(remainingSql)) {
				result.options.strict = true;
				remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
				continue;
			}
			
			throw new SyntaxError(`Unexpected syntax in CREATE TABLE statement near "${remainingSql.slice(0, 20)}".`);
		}
	}
	
	return result;
}

export function parseCreateIndexSql(sql: string) {
	sql = sql.trim();
	
	if (!/^CREATE\s+(?:UNIQUE\s+)?INDEX\s+/i.test(sql)) {
		throw new Error('Only CREATE INDEX statements can be parsed.');
	}
	
	const result = {} as DbIndexObject;
	
	let remainingSql = sql.trim().replace(/^CREATE\s+/i, '');
	
	let expressionMatch: RegExpExecArray | null;
	
	if (expressionMatch = /^(?:UNIQUE\s+)?INDEX\s+/i.exec(remainingSql)) {
		result.unique = true;
		remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
	}
	
	if (expressionMatch = /^IF\s+NOT\s+EXISTS\s+/i.exec(remainingSql)) {
		result.ifNotExists = true;
		remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
	}
	
	let [ fullSegment, , schema, , indexName ] = /(?:(["`])|\[)?(?:([a-z0-9_]+)(?:\1|\])\.)?(?:(["`])|\[)?([a-z0-9_]+)(?:\3|\])\s+/i.exec(remainingSql) ?? [];
	
	if (!fullSegment) {
		throw new SyntaxError(`Unable to parse CREATE INDEX statement: missing or invalid index name near "${remainingSql.slice(0, 20)}".`);
	}
	
	result.name = indexName;
	
	if (schema) {
		result.schema = schema;
	}
	
	remainingSql = remainingSql.slice(fullSegment.length).trimStart();
	
	if (!/^ON\s+/i.test(remainingSql)) {
		throw new SyntaxError(`Unable to parse CREATE INDEX statement: missing ON clause near "${remainingSql.slice(0, 20)}".`);
	}
	
	remainingSql = remainingSql.replace(/^ON\s+/i, '');
	
	let tableName: string;
	[ fullSegment, , tableName ] = /(?:(["`])|\[)?([a-z0-9_]+)(?:\1|\])\s*/i.exec(remainingSql) ?? [];
	
	if (!fullSegment) {
		throw new SyntaxError(`Unable to parse CREATE INDEX statement: missing or invalid table name near "${remainingSql.slice(0, 20)}".`);
	}
	
	result.table = tableName;
	remainingSql = remainingSql.slice(fullSegment.length).trimStart();
	
	if (!remainingSql.startsWith('(')) {
		throw new SyntaxError(`Unable to parse CREATE INDEX statement: missing field list near "${remainingSql.slice(0, 20)}".`);
	}
	
	remainingSql = remainingSql.slice(1).trimStart();
	
	if (remainingSql.startsWith(')')) {
		throw new SyntaxError(`Unable to parse CREATE INDEX statement: empty field list near "${remainingSql.slice(0, 20)}".`);
	}
	
	let currentIndexField: DbIndexObject['fields'][number] = {} as typeof currentIndexField;
	do {
		if (remainingSql.startsWith(',')) {
			remainingSql = remainingSql.slice(1).trimStart();
		}
		
		const { expression, remainingSql: newRemainingSql } = parseSubExpression(remainingSql);
		remainingSql = newRemainingSql.trimStart();
		
		currentIndexField.expression = expression;
		if (expressionMatch = /^COLLATE\s+(?:(['"])\[)([a-z0-9_]+)(?:\1|\]|\b)/i.exec(remainingSql)) {
			currentIndexField.collate = expressionMatch[2];
			remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
		}
		
		if (expressionMatch = /^(ASC|DESC)\b/i.exec(remainingSql)) {
			currentIndexField.order = expressionMatch[1].toUpperCase() as 'ASC' | 'DESC';
			remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
		}
		
		if (!result.fields) {
			result.fields = [];
		}
		result.fields.push(currentIndexField);
		currentIndexField = {} as typeof currentIndexField;
	} while (remainingSql.startsWith(','));
	
	if (!remainingSql.startsWith(')')) {
		throw new SyntaxError(`Unable to parse CREATE INDEX statement: unterminated field list near "${remainingSql.slice(0, 20)}".`);
	}
	
	if (remainingSql.startsWith('WHERE')) {
		remainingSql = remainingSql.slice('WHERE'.length).trimStart();
		result.where = parseSubExpression(remainingSql).expression;
	}
	
	return result;
}

/**
 * This only parses as a full string the sub-expression, ensuring that the parentheses or quotes are properly handled.
 * @param sql whatever remaining sql you want to parse for a sub-expression
 */
function parseSubExpression(sql: string) {
	let remainingSql = sql.trimStart();
	
	let expression = '';
	let wrappingChars = '';
	let escapeNext = false;
	let charIndex = 0;
	let currentChar = remainingSql[charIndex];
	
	while (wrappingChars || !/\s|,/.test(currentChar)) {
		testWrappingChars:
		if ((!wrappingChars && /\[|\(|'|"/.test(currentChar)) || (!/'|"/.test(wrappingChars.at(-1)) && /\[|\(|'|"/.test(currentChar))) {
			wrappingChars += currentChar;
		}
		else if (!wrappingChars && /\)|\]|,/.test(currentChar)) {
			break;
		}
		else if (wrappingChars && /\]|\)|"|'/.test(currentChar)) {
			if (escapeNext) {
				escapeNext = false;
				break testWrappingChars;
			}
			if (/'|"/.test(wrappingChars.at(-1)) && currentChar == wrappingChars.at(-1) && currentChar == remainingSql[charIndex + 1]) {
				escapeNext = true;
			}
			else if (
				(wrappingChars.at(-1) == '(' && currentChar == ')') ||
				(wrappingChars.at(-1) == '[' && currentChar == ']') ||
				(/'|"/.test(wrappingChars.at(-1)) && currentChar == wrappingChars.at(-1))
			) {
				wrappingChars = wrappingChars.slice(0, -1);
			}
		}
		
		expression += currentChar;
		
		charIndex++;
		currentChar = remainingSql[charIndex];
	}
	
	const originalExpressionLength = expression.length;
	
	let wasWrappedWith: '[' | '(' | '"' | "'";
	if (expression.startsWith('(') && expression.endsWith(')')) {
		wasWrappedWith = '(';
	}
	else if (expression.startsWith('[') && expression.endsWith(']')) {
		wasWrappedWith = '[';
	}
	else if (/^(['"])(.*)(\1)$/.test(expression)) {
		wasWrappedWith = expression[0] as '"' | "'";
		expression = unquote(expression);
	}
	
	if (wasWrappedWith == '(' || wasWrappedWith == '[') {
		expression = expression.slice(1, -1).trim();
	}
	
	remainingSql = remainingSql.slice(originalExpressionLength).trimStart();
	
	return {
		wasWrappedWith,
		expression,
		remainingSql,
	};
}

function parseForeignKeyClause(sql: string) {
	const preamble = /^REFERENCES\s+/i.exec(sql);
	if (!preamble) {
		throw new Error('Unable to parse foreign key clause: SQL does not start with the REFERENCES keyword.');
	}
	
	let remainingSql = sql.slice(preamble[0].length).trimStart();
	const references = {} as DbReferencesObject;
	
	let expressionMatch: RegExpExecArray;
	
	// DANGER! the exit conditions need to be implemented and foolproof
	while (true) {
		if (!references.table) {
			const [ fullSegment, , referencedTable ] = /(?:(["`])|\[)?([a-z0-9_]+)(?:\1|\])\s*/i.exec(remainingSql);
			
			references.table = referencedTable;
			remainingSql = remainingSql.slice(fullSegment.length).trimStart();
			continue;
		}
		
		if (remainingSql.startsWith('(') && !references.fields) {
			remainingSql = remainingSql.slice(1).trimStart();
			references.fields = remainingSql.slice(0, remainingSql.indexOf(')'))
				.split(',')
				.map(f => unquote(f.trim()));
			remainingSql = remainingSql.slice(remainingSql.indexOf(')') + 1).trimStart();
			continue;
		}
		
		if (expressionMatch = /^ON\s+(DELETE|UPDATE)\s+(CASCADE|RESTRICT|NO\s+(ACTION)|SET\s+(NULL|DEFAULT))\b/i.exec(remainingSql)) {
			const actionType = expressionMatch[1].toUpperCase() as 'DELETE' | 'UPDATE';
			let actionValue: 'CASCADE' | 'SET NULL' | 'SET DEFAULT' | 'RESTRICT' | 'NO ACTION';
			
			if (/CASCADE|RESTRICT/i.test(expressionMatch[2])) {
				actionValue = expressionMatch[2].toUpperCase() as 'CASCADE' | 'RESTRICT';
			}
			else if (/NO\s+ACTION/i.test(expressionMatch[2])) {
				actionValue = 'NO ACTION';
			}
			else if (/SET\s+NULL/i.test(expressionMatch[2])) {
				actionValue = 'SET NULL';
			}
			else {
				actionValue = 'SET DEFAULT';
			}
			
			if (actionType == 'DELETE') {
				references.onDelete = actionValue;
			}
			else {
				references.onUpdate = actionValue;
			}
			
			remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
			continue;
		}
		
		if (expressionMatch = /^MATCH\s+(?:(["`])|\[)?([a-z0-9_]+)(?:\1|\]|\b)/i.exec(remainingSql)) {
			references.match = expressionMatch[2];
			remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
			continue;
		}
		
		if (expressionMatch = /^(?:(NOT)\s+)?DEFERRABLE(?:\s+INITIALLY\s+(DEFERRED|IMMEDIATE))?\b/i.exec(remainingSql)) {
			references.deferrable = {};
			if (expressionMatch[1]) {
				references.deferrable.negated = true;
			}
			if (expressionMatch[2]) {
				references.deferrable.type = expressionMatch[2].toUpperCase() as 'DEFERRED' | 'IMMEDIATE';
			}
			remainingSql = remainingSql.slice(expressionMatch[0].length).trimStart();
			continue;
		}
		
		break;
	}
	
	return {
		references,
		remainingSql,
	};
}

function unquote(str: string) {
	if (!/^['"`]/.test(str) || str[0] != str.slice(-1)) {
		return str;
	}
	return str.slice(1, -1).replace(new RegExp(str[0].repeat(2), 'g'), str[0]);
}
