/** How a scan should be labeled. Demo fixtures never call the model. */
import type { ScanSource } from "./api.ts";

/**
 * A demo case is preset signals either way. On a live deployment that is a fixture
 * (the model was available and was not called). Anywhere else it is the offline demo,
 * which must not be reported as a live or fixture-on-live result.
 */
export function demoScanSource(scanMode: string | undefined): Extract<ScanSource, "fixture" | "offline"> {
	return scanMode === "live" ? "fixture" : "offline";
}

/** A model answer stays a model answer. A different model id means a backup model, not an offline fallback. */
export function modelAnswerMeta(answered: string | undefined, primary: string): { model?: string; fallbackModel: boolean } {
	const model = answered?.trim() || undefined;
	return { ...(model ? { model } : {}), fallbackModel: Boolean(model && model !== primary) };
}
