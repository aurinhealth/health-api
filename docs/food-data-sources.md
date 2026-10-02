# Food data sources

Search by name: personal foods, then NutriDatabaze.cz, then the OpenNutrition
reference subset, then Open Food Facts. A barcode goes to Open Food Facts first.

## NutriDatabaze.cz (primary for generic foods)

Czech Food Composition Database, ÚZEI (Institute of Agricultural Economics and
Information), https://www.nutridatabaze.cz/. Values per 100 g of the edible
portion; carbohydrates are available carbohydrates [CHO]. Licence terms:
https://www.nutridatabaze.cz/licencni-podminky-a-zpracovani-osobnich-udaju/.

- The export ("Výběr z NutriDatabaze.cz") is free but only for registered users.
- The data file must not be passed on to anyone, in whole or in part. It is
  therefore not in this public repository, not in `/app/api/food/reference-data`,
  and lives only in the D1 table `nutridatabaze_foods`.
- Wherever the data is shown, cite „Na základě dat z NutriDatabaze.cz, verze X.X,
  ÚZEI, Praha“ with a link to http://www.nutridatabaze.cz/. Every product carries
  this text in `attribution`; the food editor shows it.

Loading or updating (the table comes from `migrations/0003_nutridatabaze.sql`):
in the app, Settings → "Databáze potravin NutriDatabaze" (admins only), choose
the downloaded export and press "Nahrát". `POST /app/api/admin/nutridatabaze`
takes the raw file, parses it in the Worker (`src/nutridatabaze-import.js`) and
stores only the values; the file itself is not kept. The same import from the
command line:

```sh
node scripts/import-nutridatabaze.mjs ~/Downloads/<export>.xlsx   # or .csv
npx --yes wrangler@4 d1 execute health-data --remote --file=data/private/nutridatabaze-<verze>.sql
```

The parser reads XLSX or CSV (also Czech Excel CSV: semicolons, decimal commas,
windows-1250), finds columns by EuroFIR code (`OrigFdCd`, `OrigFdNm`, `ENERC [kcal]`,
`PROT [g]`, `FAT [g]`, `CHO [g]`, `FIBT [g]`, `NACL [g]`, as in the export, or in
brackets) or Czech name, and tells kJ from kcal by the values. The export has no
version inside, so the form asks for it (default 11.26; the CLI takes `--version`). The import is one D1 transaction: a new version
replaces the old rows, a bad file changes nothing. The command-line SQL goes to
`data/private/`, which git ignores. Workers pick up new data within 10 minutes.

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

FÉR potravina (ferpotravina.cz) sells its branded-product database as CSV/API
by agreement; copying its site is forbidden. NutriData.cz (NutriPro) and
STOBklub publish no data licence. Kalorické Tabulky and YAZIO do
not publish a database-licensing price/API offer we could verify. Their app
subscriptions do not constitute permission to copy their food catalogs.
