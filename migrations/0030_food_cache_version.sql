-- A second counter for food and drinks: logging a meal or a glass of water
-- makes outdated only what shows food (Today, the coach's inputs, the food
-- week), not the 90 days of fitness, the zones or a workout's detail
-- (api-cache.js FOOD_FREE).
ALTER TABLE api_cache_versions ADD COLUMN food INTEGER NOT NULL DEFAULT 0;
