# Food data sources

The app uses no external food database. Food values come from:

- **Package labels**: values per 100 g (or per portion) typed in or read from a
  photo in the browser (`food-label.js`), stored with `source="package_label"`.
- **Personal foods**: the user's own saved foods, a separate D1 table
  (`personal_foods`), searched by name or barcode in the app (`/app/api/food/search`)
  and by the MCP tools `resolveFood`, `getFoodProduct` and `logFoodProduct`.
  They are never shared with any provider.
- **Cookbook**: recipes with their nutrition values (`cookbook.js`).

NutriDatabaze.cz, OpenNutrition and Open Food Facts were removed; their data
went with `migrations/0004_drop_food_databases.sql`. A food that is not saved
yet is entered from its label once and saved for next time.
