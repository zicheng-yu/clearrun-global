/** D1 storage. For now only the model-spend ledger, checked before every model call. */

const SCHEMA = [`CREATE TABLE IF NOT EXISTS llm_spend (day TEXT PRIMARY KEY, cost_usd REAL NOT NULL DEFAULT 0, calls INTEGER NOT NULL DEFAULT 0, tokens INTEGER NOT NULL DEFAULT 0)`];

let ready: Promise<void> | undefined;

/** Creates the tables once per isolate. */
export function ensureSchema(db: D1Database): Promise<void> {
	if (!ready) ready = db.batch(SCHEMA.map((sql) => db.prepare(sql))).then(() => undefined);
	return ready;
}

export const dayKey = (now = new Date()) => now.toISOString().slice(0, 10);

export async function llmSpend(db: D1Database): Promise<{ today: number; total: number }> {
	await ensureSchema(db);
	const row = await db
		.prepare("SELECT (SELECT cost_usd FROM llm_spend WHERE day = ?1) AS today, (SELECT SUM(cost_usd) FROM llm_spend) AS total")
		.bind(dayKey())
		.first<{ today: number | null; total: number | null }>();
	return { today: row?.today ?? 0, total: row?.total ?? 0 };
}

export async function recordLlmSpend(db: D1Database, costUsd: number, tokens: number): Promise<void> {
	await ensureSchema(db);
	await db
		.prepare(
			`INSERT INTO llm_spend (day, cost_usd, calls, tokens) VALUES (?1, ?2, 1, ?3)
			 ON CONFLICT(day) DO UPDATE SET cost_usd = cost_usd + ?2, calls = calls + 1, tokens = tokens + ?3`,
		)
		.bind(dayKey(), costUsd, tokens)
		.run();
}
