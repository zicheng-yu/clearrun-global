/**
 * The creative check's judgment layer. The perception model reports signals (what it sees, where, with
 * what evidence); this module decides what they mean in each market, using only knowledge/rules.yaml.
 * A signal no rule covers is listed as "seen, no known risk" rather than guessed at.
 */
import type { Box, DetectedSignal } from "../../shared/api.ts";
import { caseById, knowledge, type Case, type Market, type Rule, type Severity } from "../../shared/knowledge.ts";
import { isSignalId, SIGNALS, type SignalId } from "../../shared/signals.ts";

export type { Box, DetectedSignal };

export interface Finding {
	rule: Rule;
	signals: DetectedSignal[];
	cases: Case[];
}

export type Level = "red" | "yellow" | "green";

export interface MarketAssessment {
	market: Market;
	level: Level;
	/** 100 minus the weight of each distinct rule hit; higher is safer. */
	score: number;
	findings: Finding[];
	/** Timing rules this creative would trip, handed to the launch calendar rather than flagged here. */
	timing: Finding[];
}

export interface Assessment {
	markets: MarketAssessment[];
	/** Signals the launch calendar should block on (everything detected with enough confidence). */
	themes: SignalId[];
	/** Signals seen that no rule in the selected markets covers. */
	unmatched: DetectedSignal[];
}

/** Signals below this confidence are shown but never trigger a rule. */
export const MIN_CONFIDENCE = 0.5;
export const SEVERITY_WEIGHT: Record<Severity, number> = { high: 35, medium: 15, low: 5 };

const clamp01 = (n: number) => Math.max(0, Math.min(1, n));

/** Validates signals from the model (or a fixture): unknown IDs are dropped, boxes clamped, text trimmed. */
export function cleanSignals(raw: unknown, assets: string[]): DetectedSignal[] {
	if (!Array.isArray(raw)) return [];
	const known = new Set(assets);
	const out: DetectedSignal[] = [];
	for (const item of raw as Record<string, unknown>[]) {
		if (!item || !isSignalId(item.signal)) continue;
		const asset = typeof item.asset === "string" && known.has(item.asset) ? item.asset : assets[0];
		if (!asset) continue;
		const confidence = typeof item.confidence === "number" ? clamp01(item.confidence) : 0.7;
		const evidence = typeof item.evidence === "string" ? item.evidence.trim().slice(0, 200) : "";
		const quotes = Array.isArray(item.quotes)
			? item.quotes
					.filter((quote): quote is string => typeof quote === "string")
					.map((quote) => quote.trim().slice(0, 240))
					.filter((quote) => quote.length >= 2)
					.slice(0, 8)
			: [];
		let box: Box | undefined;
		if (Array.isArray(item.box) && item.box.length === 4 && item.box.every((n) => typeof n === "number" && Number.isFinite(n))) {
			const [x, y, w, h] = (item.box as number[]).map(clamp01) as Box;
			if (w > 0 && h > 0) box = [x, y, Math.min(w, 1 - x), Math.min(h, 1 - y)];
		}
		out.push({ signal: item.signal, asset, evidence, confidence, ...(quotes.length ? { quotes } : {}), ...(box ? { box } : {}) });
	}
	return out;
}

const levelOf = (findings: Finding[]): Level =>
	findings.some((f) => f.rule.severity === "high") ? "red" : findings.some((f) => f.rule.severity === "medium") ? "yellow" : "green";

export function assess(signals: DetectedSignal[], markets: Market[], rules: Rule[] = knowledge.rules): Assessment {
	const confident = signals.filter((s) => s.confidence >= MIN_CONFIDENCE);
	const covered = new Set<SignalId>();
	const results = markets.map((market): MarketAssessment => {
		const findings: Finding[] = [];
		const timing: Finding[] = [];
		for (const rule of rules) {
			if (rule.market !== market) continue;
			const hits = confident.filter((s) => rule.signals.includes(s.signal));
			if (!hits.length) continue;
			for (const s of hits) covered.add(s.signal);
			const finding = { rule, signals: hits, cases: rule.cases.map(caseById).filter((c): c is Case => !!c) };
			(rule.stage === "timing" ? timing : findings).push(finding);
		}
		// Worst first; at equal severity, what is visible in the creative before claims and data practices.
		const order: Record<Severity, number> = { high: 0, medium: 1, low: 2 };
		const stage: Record<Rule["stage"], number> = { creative: 0, claims: 1, trust: 2, timing: 3 };
		findings.sort((a, b) => order[a.rule.severity] - order[b.rule.severity] || stage[a.rule.stage] - stage[b.rule.stage] || a.rule.id.localeCompare(b.rule.id));
		const score = Math.max(0, 100 - findings.reduce((sum, f) => sum + SEVERITY_WEIGHT[f.rule.severity], 0));
		return { market, level: levelOf(findings), score, findings, timing };
	});
	return {
		markets: results,
		themes: [...new Set(confident.map((s) => s.signal))],
		unmatched: confident.filter((s) => !covered.has(s.signal) && SIGNALS[s.signal].channel !== "theme"),
	};
}
