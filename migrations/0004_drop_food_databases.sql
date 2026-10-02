-- The app no longer uses external food databases: foods come from package
-- labels, the user's saved foods (personal_foods) and the cookbook. Drops the
-- NutriDatabaze.cz import and the cache of Open Food Facts products.

DROP TABLE IF EXISTS nutridatabaze_foods;
DROP INDEX IF EXISTS idx_food_products_name;
DROP TABLE IF EXISTS food_products;
