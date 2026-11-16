import { bindings, defineConfig } from "cf/config";
import * as entrypoint from "./src/worker/index.ts" with { type: "cf-worker" };
import { CLOUDFLARE_ACCOUNT_ID, modeTarget } from "./src/shared/deploy-target.ts";

export default defineConfig(({ mode }) => {
	// Default mode is live. Mock is opt-in (`cf dev|build|deploy --mode mock`) and is the only
	// mode that names the demo hostname or the empty demo D1. Declaring them here does not deploy
	// or create DNS. Never point this Worker at the original `clearrun` Worker or its database.
	const target = modeTarget(mode);
	return {
		accountId: CLOUDFLARE_ACCOUNT_ID,
		worker: {
			name: target.workerName,
			compatibilityDate: "2026-10-06",
			compatibilityFlags: ["nodejs_compat"],
			entrypoint,
			assets: {
				notFoundHandling: "single-page-application",
				runWorkerFirst: ["/api/*"],
			},
			// Custom domain only for the mock demo. A string domain is production traffic on that hostname.
			...(target.domains.length ? { domains: target.domains } : {}),
			observability: {
				enabled: true,
				logs: { enabled: true, headSamplingRate: 1 },
			},
			env: {
				SCAN_MODE: bindings.text<"mock" | "live">(target.scanMode),
				// OpenRouter model IDs for the perception step (needs vision), and fallbacks. Check the IDs on openrouter.ai before going live.
				VISION_MODEL: bindings.text("anthropic/claude-sonnet-5.5"),
				VISION_FALLBACK_MODELS: bindings.text("anthropic/claude-haiku-5.5"),
				// Spending caps in US dollars, enforced before every model call (ledger in D1).
				LLM_DAILY_USD: bindings.text("1"),
				LLM_TOTAL_USD: bindings.text("10"),
				...(target.requiresOpenRouterSecret ? { OPENROUTER_API_KEY: bindings.secret() } : {}),
				ASSETS: bindings.assets(),
				DB: bindings.d1({ id: target.d1.id, name: target.d1.name }),
				// Per-IP limit on model calls.
				RATE_LIMITER: bindings.rateLimit({ namespace: "7312", simple: { limit: 10, period: 60 } }),
			},
		},
	};
});
