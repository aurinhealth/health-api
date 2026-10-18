-- Corrections of catalogue foods that users send for everyone (Upravit produkt →
-- Navrhnout opravu pro všechny, src/food-suggestions.js). The owner approves or
-- rejects them in the app; an approved one enters shared_foods as checked.
CREATE TABLE IF NOT EXISTS food_suggestions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  barcode TEXT,
  name TEXT NOT NULL,
  before_json TEXT NOT NULL,
  after_json TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  decided_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_food_suggestions_status ON food_suggestions(status, created_at DESC);
