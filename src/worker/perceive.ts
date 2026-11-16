/**
 * The perception step of the creative check: one multimodal model call that reports which vocabulary
 * signals appear in the material, where, and with what evidence. It is told not to judge; judgment is
 * engine/creative/assess.ts over knowledge/rules.yaml.
 */
import { cleanSignals } from "../engine/creative/assess.ts";
import type { DetectedSignal, ScanAsset } from "../shared/api.ts";
import { SIGNAL_IDS, SIGNALS } from "../shared/signals.ts";
import { chat, LlmError, type ContentPart, type LlmConfig } from "./openrouter.ts";

export class PerceiveInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "PerceiveInputError";
	}
}

const MAX_ASSETS = 6;
const MAX_TEXT = 4000;
/** About 3 MB of base64 per image keeps a request well inside the model's limits. */
const MAX_IMAGE_CHARS = 4_000_000;
const IMAGE_URL = /^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/;

export const PERCEIVE_SYSTEM = [
	"You are the perception step of a pre-launch creative check for products launching in South Korea, Singapore and the United States.",
	"Report only what you can actually see or read in the material, using ONLY the signal IDs listed below.",
	"Do not judge whether anything is offensive, risky or legal: a separate rulebook decides that. Never invent signals that are not listed.",
	"Page signals come only from the page notes. Theme signals describe the creative's overall theme or tone.",
	"For images, give box as [x, y, width, height] in fractions of the image (0–1), tight around what you saw. Omit box for text.",
	"evidence: a short description, in Chinese, of what you saw. It does not have to be a verbatim substring.",
	"quotes: for text, exact substrings copied from that asset, which the UI highlights. Omit quotes when you cannot copy one. confidence: 0–1.",
	'Reply with JSON only, no prose: {"signals":[{"signal":"…","asset":"…","evidence":"…","quotes":["exact words"],"box":[0,0,0,0],"confidence":0.9}]}. Reply {"signals":[]} when nothing applies.',
	"",
	"Signals:",
	...SIGNAL_IDS.map((id) => `- ${id} [${SIGNALS[id].channel}]: ${SIGNALS[id].hint}`),
].join("\n");

/** Validates assets from the browser before any model call. */
export function checkAssets(raw: unknown): ScanAsset[] {
	if (!Array.isArray(raw) || !raw.length) throw new PerceiveInputError("assets must be a non-empty list");
	if (raw.length > MAX_ASSETS) throw new PerceiveInputError(`at most ${MAX_ASSETS} assets per check`);
	const seen = new Set<string>();
	return raw.map((item: Record<string, unknown>, i) => {
		const id = typeof item?.id === "string" && /^[\w-]{1,32}$/.test(item.id) ? item.id : `asset${i + 1}`;
		if (seen.has(id)) throw new PerceiveInputError(`duplicate asset id ${id}`);
		seen.add(id);
		const kind = item?.kind === "image" || item?.kind === "copy" || item?.kind === "page" ? item.kind : undefined;
		if (!kind) throw new PerceiveInputError(`asset ${id}: kind must be image, copy or page`);
		const content = typeof item.content === "string" ? item.content : "";
		if (kind === "image" && (!IMAGE_URL.test(content.slice(0, 64) + content.slice(-8)) || content.length > MAX_IMAGE_CHARS))
			throw new PerceiveInputError(`asset ${id}: image must be a PNG, JPEG, WebP or GIF data: URL under 3 MB`);
		if (kind !== "image" && (!content.trim() || content.length > MAX_TEXT)) throw new PerceiveInputError(`asset ${id}: text must be 1–${MAX_TEXT} characters`);
		const label = typeof item.label === "string" ? item.label.slice(0, 60) : id;
		return { id, kind, label, content };
	});
}

/** The JSON object in a model reply, tolerating code fences or a stray sentence around it. */
export function parseSignalsReply(text: string | null, assetIds: string[]): DetectedSignal[] {
	const start = text?.indexOf("{") ?? -1;
	const end = text?.lastIndexOf("}") ?? -1;
	if (text && start >= 0 && end > start) {
		try {
			const parsed = JSON.parse(text.slice(start, end + 1));
			if (Array.isArray(parsed?.signals)) {
				const signals = cleanSignals(parsed.signals, assetIds);
				if (signals.length === parsed.signals.length) return signals;
			}
		} catch {
			// Incomplete model responses cannot support a usage recommendation.
		}
	}
	throw new LlmError(502, "Invalid perception response");
}

export async function perceive(db: D1Database, llm: LlmConfig, assets: ScanAsset[]): Promise<{ signals: DetectedSignal[]; model?: string }> {
	const content: ContentPart[] = [];
	for (const asset of assets) {
		content.push({ type: "text", text: `Asset "${asset.id}" (${asset.kind}: ${asset.label}):` });
		content.push(asset.kind === "image" ? { type: "image_url", image_url: { url: asset.content } } : { type: "text", text: asset.content });
	}
	content.push({ type: "text", text: "List the signals you find, as JSON." });
	const result = await chat(db, llm, {
		messages: [
			{ role: "system", content: PERCEIVE_SYSTEM },
			{ role: "user", content },
		],
		maxTokens: 1500,
	});
	return {
		signals: parseSignalsReply(
			result.message.content,
			assets.map((a) => a.id),
		),
		model: result.model,
	};
}
