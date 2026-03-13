import { parseEnv } from 'node:util';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { join } from 'node:path';
import { glob } from 'node:fs/promises';
import { getMetaTableSeedQueries } from './db/db-shared.ts';

if (existsSync(join(import.meta.dirname, '.env'))) {
	Object.assign(process.env, parseEnv(join(import.meta.dirname, '.env')));
}

const db = new DatabaseSync(process.env.DATABASE_LOCATION ?? join(import.meta.dirname, 'sample.db'), { open: true });

db.exec(getMetaTableSeedQueries(db));

const seedStatements: string[] = [];

const seedModuleReferences = glob(
	'**/*.seed.ts',
	{
		cwd: import.meta.dirname,
		withFileTypes: true,
		exclude: [ 'node_modules', '__tests__' ],
	},
);

for await (const seedModuleReference of seedModuleReferences) {
	const seedModule = await import(join(seedModuleReference.parentPath, seedModuleReference.name));
	seedStatements.push(seedModule.getSeedSql?.(db));
	
	if (seedModule.getSeedDataSql) {
		seedStatements.push(seedModule.getSeedDataSql(db));
	}
}

const fullSeedQuery = seedStatements.filter(Boolean).join('\n');

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
		`SEED QUERY:\n${fullSeedQuery}\n`,
		`Error during database load:`,
		(err as Error).stack,
	);
}
