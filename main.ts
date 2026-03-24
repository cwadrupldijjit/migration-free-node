import { parseEnv } from 'node:util';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { glob } from 'node:fs/promises';
import { getMetaTableSeedQueries } from './db/db-shared.ts';

if (existsSync(join(import.meta.dirname, '.env'))) {
	Object.assign(process.env, parseEnv(join(import.meta.dirname, '.env')));
}

const db = new DatabaseSync(process.env.DATABASE_LOCATION ?? join(import.meta.dirname, 'sample.db'), { open: true });

let metaSeedQuery = '';

for (const sql of getMetaTableSeedQueries(db)) {
	metaSeedQuery += sql + '\n';
}

try {
	if (metaSeedQuery) {
		db.exec(metaSeedQuery);
	}
}
catch (e) {
	console.error(
		`META SEED QUERY:\n${metaSeedQuery}\n`,
		`Error during database load:`,
		(e as Error).stack,
	);
}

let fullSeedQuery = '';

const seedModuleReferences = glob(
	'**/*.seed.ts',
	{
		cwd: import.meta.dirname,
		withFileTypes: true,
		exclude: [ 'node_modules', '__tests__' ],
	},
);

for await (const seedModuleReference of seedModuleReferences) {
	let moduleReference = join(seedModuleReference.parentPath, seedModuleReference.name);
	
	if (process.platform == 'win32') {
		moduleReference = `${pathToFileURL(moduleReference)}`;
	}
	
	const seedModule = await import(moduleReference);
	
	for (const sql of seedModule.getSeedSql?.(db) ?? []) {
		fullSeedQuery += sql + '\n';
	}
	
	for (const sql of seedModule.getSeedDataSql?.(db) ?? []) {
		fullSeedQuery += sql + '\n';
	}
}

try {
	db.exec([
		'BEGIN TRANSACTION;',
		fullSeedQuery,
		'COMMIT;',
	].join('\n'));
	
	console.log('Database up to date');
}
catch (err) {
	console.error(
		`SEED QUERY:\n${fullSeedQuery
			
		}\n`,
		`Error during database load:`,
		(err as Error).stack,
	);
}
