# Migration-free:  Approaching DB Alterations Differently

This repo is created as a resource to review for the UtahJS Lehi presentation given on 2026-03-12 with the above title.

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
