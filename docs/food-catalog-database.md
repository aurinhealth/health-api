# Separate food catalogue

Production uses EU D1 database `petrfitness-foods` with binding `FOODS`.
Staging uses `petrfitness-foods-staging`, with its own database and contents.
The catalogue is shared across accounts and independent of personal data shards.
No external food datasets or R2 bucket are created by this change.

The food database holds `shared_foods`, `shared_recipes`, `food_contributions`,
`recipe_contributions` and `food_reports`. Contribution/report rows have a
user_id guard and are included in account export/deletion. Only public label or
recipe fields appear in search results. Personal foods/recipes, amounts eaten,
dates, preferences and diary notes stay in the assigned personal database.
The private cookbook remains on the central database.

Barcode lookup uses an expression index on the stored product barcode. Name
search retains the existing normalized Czech/fuzzy matching behavior. Catalogue
IDs are content-derived; saving an already present shared ID does not rewrite
the catalogue row just to advance its timestamp. Large multilingual datasets
and FTS/search infrastructure can be added separately after validating sources.

## Deployment

After provisioning user shards, `scripts/provision-food-catalog.mjs` creates or
reuses the separately named EU database, applies `food-migrations`, and appends
its binding and ID to `wrangler.runtime.jsonc`. Every generated database ID must
be distinct; an unexpected existing database/jurisdiction causes a failure.
The jobs deploy this config and wait for `X-Food-Catalog-Routing: 1` on the
anonymous API response before running `--migrate`.

The directory keys are on central `schema_meta`:

| Key | Purpose |
| --- | --- |
| `food_catalog_state` | `legacy`, `copying`, or `ready` |
| `food_catalog_database_id` | UUID of this environment's bound food DB |
| `food_catalog_cleanup_done` | Old catalogue copies were retired |
| `food_catalog_maintenance` | Cleanup bypass used only inside an atomic batch |

Migration 0018 installs guards on all legacy catalogue writes. During copying,
food API requests and account export/deletion return HTTP 503 with Retry-After;
other requests and health sync remain available. The guards also stop writers
already in flight on an older Worker. The deployment copies only the five
catalogue tables in bounded parameterized batches (default 100 rows; at most
50,000 source rows per automatic cutover), retaining IDs, values and timestamps.
No copied contents, credentials or parameter values enter public Actions logs
or artifacts; only table names and counts are logged.

Before activation, row counts and SHA-256 fingerprints of every ordered field
are compared. A synthetic barcode canary is also verified and exactly removed.
Only then does the central state become `ready`. Requests read the state afresh
and use FOODS; a missing/mismatched binding never falls back to the old copy.
The verified old copies, including author/report metadata, are deleted in
bounded batches. The old empty tables and guards remain to block stale writers.
The cleanup bypass is set/deleted inside the same atomic batch as each DELETE.
Health history and personal diary rows are untouched by this migration.

A failed copy before activation restores legacy when the state is known and
leaves all source contents intact. If connectivity makes state unknown, it stays
frozen; rerun the serialized deployment to resume. After activation there is no
automatic rollback to stale data, even if the activation response was lost.
A later run verifies the active directory and resumes pending cleanup, but does
not copy old data over the live catalogue. Do not run cutovers concurrently.

Staging owner-history refreshes preserve a separate active food catalogue.
Migration copies the staging catalogue, not production food/report data.

## Operations

Deploy using the generated config; plain `wrangler deploy` lacks the bindings.
Rollback must retain food routing and FOODS once activated. Do not turn routing
off or set `food_catalog_state` back to legacy: the old tables are retired.
Restore a routing-aware Worker with the same database binding instead.

Before importing licensed external datasets, measure projected table/index size
and writes, design idempotent imports and provenance, and check the billing
budget. The copy has a bounded write cost, plus index maintenance and retirement
deletes. It does not reset account-wide D1 usage or add a separate included quota.
R2 archives, external imports and expanded multilingual search are subsequent
work; they are not enabled by merely creating this database.
