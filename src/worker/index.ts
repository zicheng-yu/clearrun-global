import { Hono, type Context } from "hono";
import { LaunchInputError, normalizeLaunchRequest, planLaunch } from "../engine/launch/plan.ts";
import type { Health, ScanResponse } from "../shared/api.ts";
import { isoDay } from "../shared/dates.ts";
import { demoCase } from "../shared/demo.ts";
import { knowledge, MARKETS, type Market } from "../shared/knowledge.ts";
import { BudgetExhaustedError, DEFAULT_MODEL, LlmError, type LlmConfig } from "./openrouter.ts";
import { checkAssets, perceive, PerceiveInputError } from "./perceive.ts";
import { llmSpend } from "./store.ts";

type AppContext = Context<{ Bindings: Env }>;
const app = new Hono<{ Bindings: Env }>().basePath("/api");

function numberOr(value: string | undefined, fallback: number): number {
	const n = Number(value);
	return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/** The perception model's settings, when live scanning is on and its key is present. */
function llmFor(env: Env): LlmConfig | undefined {
	if (env.SCAN_MODE !== "live") return undefined;
	const apiKey = env.OPENROUTER_API_KEY?.trim();
	if (!apiKey) return undefined;
	return {
		apiKey,
		model: env.VISION_MODEL || DEFAULT_MODEL,
		fallbackModels: (env.VISION_FALLBACK_MODELS ?? "")
			.split(",")
			.map((m) => m.trim())
			.filter(Boolean),
		maxTokens: 2000,
		dailyUsd: numberOr(env.LLM_DAILY_USD, 1),
		totalUsd: numberOr(env.LLM_TOTAL_USD, 10),
	};
}

const rateLimited = async (c: AppContext) => !(await c.env.RATE_LIMITER.limit({ key: c.req.header("cf-connecting-ip") ?? "local" })).success;

function log(message: string, fields: Record<string, unknown> = {}): void {
	console.log(JSON.stringify({ message, ...fields }));
}

const marketsOf = (raw: unknown): Market[] => (Array.isArray(raw) ? [...new Set(raw.filter((m): m is Market => MARKETS.includes(m as Market)))] : []);

app.get("/health", async (c) => {
	const llm = llmFor(c.env);
	const body: Health = { name: "ClearRun Global", scan: llm ? "live" : "offline", ...(llm ? { model: llm.model } : {}) };
	if (llm) {
		const spend = await llmSpend(c.env.DB);
		body.budget = { todayUsd: Math.round(spend.today * 1e4) / 1e4, dailyCapUsd: llm.dailyUsd };
	}
	return c.json(body, 200, { "Cache-Control": "no-store" });
});

/** The whole knowledge base (cases, rules, calendar), for tools and agents. The browser bundles its own copy. */
app.get("/knowledge", (c) => c.json(knowledge, 200, { "Cache-Control": "public, max-age=300" }));

/** The launch-pressure calendar for one request (the browser computes the same thing locally for what-ifs). */
app.post("/launch", async (c) => {
	const body = await c.req.json().catch(() => undefined);
	try {
		return c.json(planLaunch(normalizeLaunchRequest(body, isoDay(new Date()))), 200, { "Cache-Control": "no-store" });
	} catch (error) {
		if (error instanceof LaunchInputError) return c.json({ error: "bad_request", message: error.message }, 400);
		throw error;
	}
});

/**
 * The perception step. A demo case answers from its fixture (no model, works offline); your own
 * assets go to the multimodal model. Either way the browser judges the signals against the rules.
 */
app.post("/scan", async (c) => {
	const body = await c.req.json<{ markets?: unknown; demo?: { caseId?: unknown; variant?: unknown }; assets?: unknown }>().catch(() => undefined);
	if (!body) return c.json({ error: "bad_request", message: "Expected a JSON body" }, 400);
	if (!marketsOf(body.markets).length) return c.json({ error: "bad_request", message: "markets must list at least one of KR, US, SG" }, 400);

	if (body.demo) {
		const demo = typeof body.demo.caseId === "string" ? demoCase(body.demo.caseId) : undefined;
		if (!demo) return c.json({ error: "bad_request", message: "Unknown demo case" }, 400);
		const variant = body.demo.variant === "localized" ? demo.localized : demo.original;
		const response: ScanResponse = { signals: variant.signals, source: "fixture" };
		return c.json(response, 200, { "Cache-Control": "no-store" });
	}

	const llm = llmFor(c.env);
	if (!llm) return c.json({ error: "offline", message: "This deployment has no perception model configured; try a demo case, or add OPENROUTER_API_KEY and run in live mode." }, 503);
	if (await rateLimited(c)) return c.json({ error: "rate_limited", message: "Too many checks from this address. Try again in a minute." }, 429);
	try {
		const assets = checkAssets(body.assets);
		const { signals, model } = await perceive(c.env.DB, llm, assets);
		log("scan", { assets: assets.length, signals: signals.length, model });
		const response: ScanResponse = { signals, source: "model", ...(model ? { model } : {}) };
		return c.json(response, 200, { "Cache-Control": "no-store" });
	} catch (error) {
		if (error instanceof PerceiveInputError) return c.json({ error: "bad_request", message: error.message }, 400);
		if (error instanceof BudgetExhaustedError) return c.json({ error: "budget", message: error.message }, 503);
		if (error instanceof LlmError) {
			log("llm error", { status: error.status });
			return c.json({ error: "model_unavailable", message: "The perception model didn't answer. Try again in a moment." }, 502);
		}
		throw error;
	}
});

export default {
	fetch: (request, env, ctx) => app.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>;
