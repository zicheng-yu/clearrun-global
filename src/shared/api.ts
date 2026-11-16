/** Types shared by the Worker API and the browser. */
import type { Market } from "./knowledge.ts";
import type { SignalId } from "./signals.ts";

/** A box on an image, as fractions of its width and height: [x, y, width, height]. */
export type Box = [number, number, number, number];

export interface DetectedSignal {
	signal: SignalId;
	/** The asset it was found in (an ID from the scan request). */
	asset: string;
	/** What the model saw or quoted, in a few words. */
	evidence: string;
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

export interface ScanResponse {
	signals: DetectedSignal[];
	/** "fixture" when the answer came from a demo case, "model" when the perception model looked. */
	source: "fixture" | "model";
	model?: string;
}

export interface Health {
	name: string;
	/** "live" when a perception model is configured, "offline" for the fixture-only demo. */
	scan: "live" | "offline";
	model?: string;
	budget?: { todayUsd: number; dailyCapUsd: number };
}
