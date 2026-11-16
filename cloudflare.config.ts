import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };

export default defineConfig(({ mode }) => {
	// `cf dev --mode mock` is the offline demo: the three demo cases answer from fixtures, with no keys and
	// no network. Live mode adds the multimodal perception model over OpenRouter for your own material.
	// Secrets are uploaded separately and never committed.
	const mock = mode === "mock";
	return {
		worker: {
			// A new Worker: never "clearrun", which would overwrite the original ClearRun deployment.
			name: "clearrun-global",
			compatibilityDate: "2026-10-06",
			compatibilityFlags: ["nodejs_compat"],
			entrypoint,
			assets: {
				notFoundHandling: "single-page-application",
				runWorkerFirst: ["/api/*"],
			},
			observability: {
				enabled: true,
				logs: { enabled: true, headSamplingRate: 1 },
			},
			env: {
				SCAN_MODE: bindings.text<"mock" | "live">(mock ? "mock" : "live"),
				// OpenRouter model IDs for the perception step (needs vision), and fallbacks. Check the IDs on openrouter.ai before going live.
				VISION_MODEL: bindings.text("anthropic/claude-sonnet-5.5"),
				VISION_FALLBACK_MODELS: bindings.text("anthropic/claude-haiku-5.5"),
				// Spending caps in US dollars, enforced before every model call (ledger in D1).
				LLM_DAILY_USD: bindings.text("1"),
				LLM_TOTAL_USD: bindings.text("10"),
				...(mock ? {} : { OPENROUTER_API_KEY: bindings.secret() }),
				ASSETS: bindings.assets(),
				// The offline demo keeps its own local database. Before the first live deploy, create a D1 database
				// for this app and put its ID here (the placeholder is not a real database).
				DB: bindings.d1(
					mock ? { id: "00000000-0000-4000-8000-000000000de0", name: "clearrun-global-demo" } : { id: "00000000-0000-4000-8000-00000000c1a0", name: "clearrun-global-db" },
				),
				// Per-IP limit on model calls.
				RATE_LIMITER: bindings.rateLimit({ namespace: "7312", simple: { limit: 10, period: 60 } }),
			},
		},
	};
});
