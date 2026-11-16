/** The only table this app creates. Kept identical to migrations/0001_llm_spend.sql. */
export const LLM_SPEND_SCHEMA =
	"CREATE TABLE IF NOT EXISTS llm_spend (day TEXT PRIMARY KEY, cost_usd REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0)";
