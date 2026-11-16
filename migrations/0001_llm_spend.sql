-- Spend ledger for clearrun-global-demo (1537b307-566a-40fc-8bf9-04ae80dac074) only.
-- Do not apply this to the original ClearRun database, and do not run it from CI.
CREATE TABLE IF NOT EXISTS llm_spend (day TEXT PRIMARY KEY, cost_usd REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0);
