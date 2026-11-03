# Food catalogue refresh

The world food catalogue in R2 (`src/world-foods.js`) gets the current Open Food
Facts products every 14 days: `.github/workflows/food-catalog-refresh.yml`
(Wednesdays 02:30 UTC, every second week; also by hand under Actions).

1. `scripts/export-off.py` reads the OFF Parquet export on Hugging Face
   (`openfoodfacts/product-database`, refreshed daily; downloaded whole, 8 GB) with DuckDB and keeps code,
   names (main, Czech, English), brand, quantity, serving, unit, sold in Czechia
   and energy and macros per 100 g. About 4.9 million products, 300 MB of gzip
   NDJSON, three to four minutes.
2. `scripts/refresh-world-foods.mjs` builds the new version from the live one:
   - OFF products come from the export. A product needs a name, energy, protein,
     carbs and fat per 100 g within plausible limits. Deleted products drop out.
   - USDA, Fineli, Ciqual and CoFID foods (and USDA Branded products) are carried
     over record by record, with the Czech names of the kCalori release. A
     barcode USDA Branded holds stays with it.
   - Czech and English names the export lacks stay from the live version.
   - Keys stay as they were (`gtin:<14 digits>`, `off:<code>`, `<source>:<id>`),
     so the vitamins and minerals and foods in users' diaries keep matching.
   - The build is refused when it has fewer than 90 % of the live version's foods
     or barcodes, 85 % of its Czech products, 97 % of any carried source, or when
     20 Czech barcodes are not found in it.
3. The files go to R2, `current.json` last. `scripts/build-micronutrients.mjs
   --catalogue out/<version>` then rebuilds the vitamins and minerals for it and
   switches `micros/current.json`.
4. The test server's bucket gets the same files when the `STAGING_R2_*` secrets
   are set.
5. After 15 minutes (the Worker keeps `current.json` for 10), every version
   but the new and the previous one is deleted, catalogue and micronutrients,
   so a bad version can be rolled back by writing the previous name into
   `current.json`.

A pull request that changes the build runs steps 1 and 2 without R2 (a build
from the export alone), so it shows the time, memory and counts on a real runner.

## Cost

- D1: nothing; the catalogue never touches D1.
- R2: about 300 objects written per run per bucket (Class A, free up to a
  million a month), reads only of the live version once per run. Two versions
  are kept at a time.
- The app: no change in speed. A barcode is still one ranged read, a name one
  index read plus one ranged read; the new version's slices fill the cache again.
- Actions minutes: free for a public repository.

## Secrets

Environment `food-catalog` (Settings → Environments; deployment branches: `main`
only, no reviewers):

- `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`: an R2 API token with **Object Read &
  Write** on the bucket `aurin-food-catalog` only (R2 → Overview → API Tokens →
  Manage → Create Account API token).
- `R2_ENDPOINT`: the bucket's S3 API address (bucket → Settings → S3 API), for
  example `https://<account id>.eu.r2.cloudflarestorage.com`; a trailing
  `/aurin-food-catalog` is fine.
- `STAGING_R2_ACCESS_KEY_ID`, `STAGING_R2_SECRET_ACCESS_KEY`, `STAGING_R2_ENDPOINT`:
  the same for the test account's `aurin-food-catalog` (optional).

The token can read and write only that bucket, not the backups, D1 or the
Worker.
