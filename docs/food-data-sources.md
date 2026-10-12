# Food data sources

The common label/recipe catalogue is stored in the separate `petrfitness-foods`
D1 database. Personal saved foods and
the diary stay in each user's assigned data database. Contribution links and
reports follow the shared catalogue with user_id filtering; account export and
deletion include them. See [catalogue operations](food-catalog-database.md).

Food values come from:

- **Package labels**: values per 100 g (or per portion) typed in or read from a
  photo, stored with `source="package_label"`. A photo goes to AI vision first
  (`food-photo.js`, `/app/api/food/photo`): a label, a portion summary or a meal
  on a plate (an estimate). Without `OPENAI_API_KEY` the browser reads it with
  OCR and `food-label.js`. Both paths warn when energy does not match
  4/4/9 kcal per gram of protein, carbs and fat.
- **Personal foods**: the user's own saved foods, a separate D1 table
  (`personal_foods`), searched by name or barcode in the app (`/app/api/food/search`).
  They are never shared with any provider.
- **Cookbook**: recipes with their nutrition values (`cookbook.js`).
- **World catalogue** (`world-foods.js`): about 3.4 million foods from the
  kCalori release (Open Food Facts ODbL, USDA FoodData Central, Fineli, Ciqual,
  CoFID), read only from the R2 bucket `loadwise-foods`, listed after saved and
  shared foods. Built with `scripts/build-world-foods.mjs <foods.sqlite> <out>`
  and uploaded with `scripts/upload-world-foods.mjs <out>/<version>`; the
  upload writes `current.json` last, so a new version switches over at once.
  Sources without a licence to pass data on (the uploaded kCalori list,
  NutriDatabaze) are left out. Attributions are on the privacy page.

The earlier D1 copies of NutriDatabaze.cz, OpenNutrition and Open Food Facts
went with `migrations/0004_drop_food_databases.sql`. A food in neither the
saved foods nor the world catalogue is entered from its label once and saved
for next time.

Barcodes: a photo is decoded straight and turned by 90°, 180° and 270°
(the live ZXing scanner tries harder as well); when the bars cannot be read,
AI reads the printed digits and only a code with a valid check digit is used.
A scanned or typed code searches the saved foods and the world catalogue and,
when nothing is found, starts the AI web lookup on its own.

