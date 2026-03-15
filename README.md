# Migration-free:  Approaching DB Alterations Differently

This repo is created as a resource to review for the UtahJS Lehi presentation given on 2026-03-12 with the above title.

This is an early attempt to avoid many of the difficulties for a unique kind of application.  More of an outline for it will be provided further in the README.  In this case, migrations weren't a great fit for the application.  This approach is one that allows the database to be automatically upgraded without having to make specialized scripts for the update.  It has its own drawbacks just like migration systems do.  Some will be ironed out more as the application (and underlying code) matures.

As a quick overview, this project requires only the following to run (though it might be best for editing reasons to install dependencies):
- Node v24+

The highlights are:
- `main.ts` is the executable for the example
- `db/` contains the bulk of the code powering the example
  - `db-shared.ts` and `db-diff.ts` are where the updates are calculated and generated
  - `parse-sql.ts` is used to help review the existing schema in the database which is used in the diffing
- `*.seed.ts` are files containing schemas for the database

<u>_I want to make it clear that the way things are implemented likely can be improved--made clearer, simplified, and so forth._</u>  As this presentation was prepared in only a handful of days, much of the simplifying of this code has been stalled pending other preparations.  Feel free to go ham on it to discover (or critique) more about it.  Feel free to create an issue to ask questions or make suggestions on how to make it better.

## To use this repo:

Observe the relationship between the table setup/schema found in the `*.seed.ts` files and adjust it--add columns, delete columns, change the data types or constraints, and maybe add a few files of your own (they should automatically be picked up by the glob found in `main.ts`).  Then see how, when you run `main.ts`, the sqlite database updates to match your changes.

**As a note:**  the `uuid`s that are found in the setup is necessary for the changes to be tracked and enables for even renaming columns or tables to work.  The `uuid`s can be any unique string, but if you want ones as are seen in the sample, I suggest using:
```
node -e 'console.log(crypto.randomUUID())'
```

## Why this approach?

This stems from an application which:
- Is designed to run on a person's computer, not explicitly in the cloud.
- Seeks to create a database backing each creative project; these databases are designed to be portable.
- Is designed to be as small as possible and limit as much maintenance code as possible.

These are some of the limitations that makes the conventional migration pattern difficult to sell.  Consequently, using a different approach to database alterations was needed.  Migrations work when all databases are more or less guaranteed to be consistent and requires keeping a track record of every change to the database.  The approach I have put together here allows you to only mark what it should look like and then the database will be updated when the application loads it.  This helps with upgrading from any previous version or possibly downgrading a newer database for an older version of the application.

## How this approach works

1. The application pulls in all `getSeedSql` functions in the `*.seed.ts` files (if one file depends on another, it will call that file inside that file).
2. Inside each `getSeedSql`, it compares the table definition(s) in the file with the table(s) in the database if it/they exist(s).
3. It generates the sql to bring each table into conformity with the table specifications in the application.
4. All of the generated sql is put into a transaction and committed

## Structure of a seed file

Seed files generally follow this format:

```ts
// ... imports

// table definitions
export const tableName = '';
const tableSetup = {
	name: tableName,
	uuid: '...',
	fields: [
		// ...
	],
	// other possible configurations ...
};

// other objects related to the current table may be done here

// references to dependent seed functions
const dependencySeedFunctions = [
	// ... imported getSeedSql functions, aliased to prevent naming conflicts
]

// exported function which runs everything for the current entity
export function getSeedSql(db: DatabaseSync) {
	// invokes the dependency seed functions
	// runs `setupToSql` (from `db/db-shared.ts`) for each of the table definitions in this file
	// compiles them into a single string (which will probably change in future iterations) and returns it
}

// exported interfaces that can be used in other parts of the application (schemas and interfaces should correlate, so putting them in the same place makes sense to me)
```

The table definitions can have the following (though for greater detail and documentation, you should refer to `db/db.types.d.ts`):

```ts
const setup = {
	// The name of the table (often used in a variable so that the name can be used in references clauses)
	name: 'some_name',
	// this uuid tracks the table so that even if you change the table's name, the sql generator will generate the sql to update it;
	// it doesn't require a `uuid` proper, but it doesn't hurt to have an opaque value you don't care to change so you're not tempted to do it later
	uuid: 'foo-bar-baz-quux',
	// field definitions
	fields: [
		{
			// the name of the column
			name: 'some_column',
			// similar uuid situation for columns as with tables
			uuid: '...',
			// type is optional in sqlite and is pared down from where it could be
			type: 'TEXT',
			// fields for various 
		}
	],
	constraints: [
		// objects describing constraints; these currently aren't tracked, though they likely will in future
	],
	indexes: [
		// objects describing indexes; these are currently tracked
	],
}
```

## What can you do with this?

Feel free to play with the files that are there--create your own, modify column names or definitions, add or remove them, etc.  Watch the database and see how it updates when you run `main.ts`.

NOTE:  Even as I write this README, there are a few tweaks that I want to make to the process to streamline and simplify it.  Any future readme will point to the current point in time which is what the codebase looked like at the time of the presentation.
