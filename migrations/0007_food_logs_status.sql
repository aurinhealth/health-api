-- One food diary: ChatGPT (MCP) and the coach inbox log into food_logs too.
-- A meal planned there has status 'planned', a cancelled one 'cancelled';
-- eaten food keeps status NULL like every meal logged in the app, so the
-- app's totals read "status IS NULL OR status='eaten'". The old food_log table
-- was never written in production and is no longer used.
ALTER TABLE food_logs ADD COLUMN status TEXT;
