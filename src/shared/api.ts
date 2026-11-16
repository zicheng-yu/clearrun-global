/** Types shared by the Worker API and the browser. */
import type { Market } from "./knowledge.ts";
import type { SignalId } from "./signals.ts";

/** A box on an image, as fractions of its width and height: [x, y, width, height]. */
export type Box = [number, number, number, number];

export interface DetectedSignal {
	signal: SignalId;
	/** The asset it was found in (an ID from the scan request). */
	asset: string;
	/** What the model saw, in a few words. This may be a paraphrase and is not assumed to be a substring. */
	evidence: string;
	/** Exact substrings copied from the asset. The UI highlights these and does not invent a match from evidence. */
	quotes?: string[];
	box?: Box;
	confidence: number;
}

export type AssetKind = "image" | "copy" | "page";

export interface ScanAsset {
	id: string;
	kind: AssetKind;
	label: string;
	/** image: a data: URL (PNG or JPEG) for the model; copy/page: the text. */
	content: string;
}

export interface ScanRequest {
	markets: Market[];
	/** A demo case and variant: answered from fixtures, with no model call (works offline). */
	demo?: { caseId: string; variant: "original" | "localized" };
	/** Your own material: needs the live model. */
	assets?: ScanAsset[];
}

/**
 * fixture: preset demo signals while live perception is configured; the model was not called.
 * model: a perception model analyzed this material.
 * offline: preset signals from the offline/mock demo, not a live analysis.
 * fallback: a non-live substitute after live analysis failed. Never a successful model read.
 */
export type ScanSource = "fixture" | "model" | "offline" | "fallback";

export interface ScanResponse {
	signals: DetectedSignal[];
	source: ScanSource;
	model?: string;
	/** True when a model other than the configured primary model produced a real analysis. */
	fallbackModel?: boolean;
}

export interface Health {
	name: string;
	/** Service availability only. "live" means a model can be called; it is not the source of any one result. */
	scan: "live" | "offline";
	model?: string;
	budget?: { todayUsd: number; dailyCapUsd: number };
}
