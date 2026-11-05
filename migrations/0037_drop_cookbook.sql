-- The owner's uploaded copy of a printed cookbook (table from 0013) is deleted
-- completely: nothing reads or uploads it any more (security audit 2026-11-04,
-- point 42). Meals already logged from it stay in the diary (food_logs).
DROP TABLE IF EXISTS cookbook;
