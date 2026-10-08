# Food data sources

The app uses no external food database. Food values come from:

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

NutriDatabaze.cz, OpenNutrition and Open Food Facts were removed; their data
went with `migrations/0004_drop_food_databases.sql`. A food that is not saved
yet is entered from its label once and saved for next time.

Barcodes: a photo is decoded straight and turned by 90°, 180° and 270°
(the live ZXing scanner tries harder as well); when the bars cannot be read,
AI reads the printed digits and only a code with a valid check digit is used.
A scanned or typed code searches the saved foods first and, when nothing is
found, starts the AI web lookup on its own.

