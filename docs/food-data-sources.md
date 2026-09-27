# Food data sources

## Free reference subset

130 everyday foods selected from OpenNutrition dataset 2025.1, downloaded from
https://downloads.opennutrition.app/opennutrition-dataset-2025.1.zip.
Original nutrition values and source citations are retained. Names and search
aliases are translated to Czech; USDA-style total carbohydrates are converted to
available carbohydrates by subtracting dietary fiber; sodium is converted to salt.
These are reference foods, not verified Czech branded products. Raw, cooked and
dry food entries are distinct. All values are per 100 g, including reference liquids;
volume-to-weight conversion requires a density, not an implicit 1 ml = 1 g rule.

The derived reference database is licensed under ODbL 1.0 and OpenNutrition's
modified DbCL 1.0. Attribution: OpenNutrition, https://www.opennutrition.app.
ODbL: https://opendatacommons.org/licenses/odbl/1-0/.
Contents terms and original download: https://www.opennutrition.app/download.
The unchanged licence texts are included under `data/licenses/`.
The whole derived reference database is available free as a machine-readable
download at `/app/api/food/reference-data` (without personal foods or diary data).
Rebuild: `node scripts/build-food-reference.mjs <opennutrition_foods.tsv>`.

## Packaged products

Open Food Facts, https://world.openfoodfacts.org/, ODbL 1.0.
Search Czech-market products first, then broaden to global results. Country tags
are incomplete, and database nutrition values are not a verified package label.
Do not use a serving-based energy value with per-100g macros.

## Personal foods

Separate D1 table. User-entered foods are prioritized in search and are NOT part
of the public reference download. These are not silently shared with any provider.

## Deferred sources

NutriDatabaze export requires registration and clarification of redistribution
rights before importing it into this public app. Kalorické Tabulky and YAZIO do
not publish a database-licensing price/API offer we could verify. Their app
subscriptions do not constitute permission to copy their food catalogs.
