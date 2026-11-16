/**
 * Parses and validates knowledge/*.yaml and renders src/shared/knowledge.gen.ts. Pure apart from reading
 * files, so the test suite can check that the generated module is valid and in sync with the YAML.
 * Depends only on the signal vocabulary (never on the generated module), so it can always bootstrap.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import YAML from "yaml";
import type { CalendarEvent, Case, Confidence, EventKind, Knowledge, Market, Rule, Segment, Severity, Stage } from "../src/shared/knowledge.ts";
import { isSignalId, type SignalId } from "../src/shared/signals.ts";

const MARKETS = ["KR", "US", "SG"] as const satisfies readonly Market[];
const STAGES = ["creative", "claims", "trust", "timing"] as const satisfies readonly Stage[];
const SEVERITIES = ["high", "medium", "low"] as const satisfies readonly Severity[];
const KINDS = ["holiday", "rival", "sensitive", "opportunity"] as const satisfies readonly EventKind[];
const CONFIDENCES = ["confirmed", "rule", "estimated"] as const satisfies readonly Confidence[];
const AUDIENCE_KEYS = ["developer", "prosumer", "consumer", "enterprise", "student", "all"] as const satisfies readonly (Segment | "all")[];

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9][A-Za-z0-9-]*$/;

export class KnowledgeError extends Error {
	readonly problems: string[];
	constructor(problems: string[]) {
		super(`knowledge/*.yaml has ${problems.length} problem(s):\n- ${problems.join("\n- ")}`);
		this.name = "KnowledgeError";
		this.problems = problems;
	}
}

type Raw = Record<string, unknown>;

class Checker {
	readonly problems: string[] = [];
	private readonly where: string;
	constructor(where: string) {
		this.where = where;
	}
	fail(message: string) {
		this.problems.push(`${this.where}: ${message}`);
	}
	str(o: Raw, key: string, optional = false): string {
		const v = o[key];
		if (v === undefined && optional) return "";
		if (typeof v !== "string" || !v.trim()) this.fail(`${key} must be a non-empty string`);
		// Folded YAML (>) joins lines with a space; drop it between CJK characters, where it reads as a stray gap.
		return typeof v === "string" ? v.trim().replace(/(?<=[　-鿿＀-￯])\s+(?=[　-鿿＀-￯])/g, "") : "";
	}
	oneOf<T extends string>(o: Raw, key: string, allowed: readonly T[]): T {
		const v = o[key];
		if (!allowed.includes(v as T)) this.fail(`${key} must be one of ${allowed.join(" | ")} (got ${JSON.stringify(v)})`);
		return v as T;
	}
	list(o: Raw, key: string): string[] {
		const v = o[key] ?? [];
		if (!Array.isArray(v) || v.some((x) => typeof x !== "string")) {
			this.fail(`${key} must be a list of strings`);
			return [];
		}
		return v as string[];
	}
	unit(o: Raw, key: string): number {
		const v = o[key];
		if (typeof v !== "number" || v < 0 || v > 1) this.fail(`${key} must be a number from 0 to 1`);
		return typeof v === "number" ? v : 0;
	}
	verified(o: Raw): true | false | "partial" {
		const v = o.verified;
		if (v !== true && v !== false && v !== "partial") this.fail(`verified must be true, false or partial`);
		return v as true | false | "partial";
	}
	signals(o: Raw, key: string): SignalId[] {
		const ids = this.list(o, key);
		for (const id of ids) if (!isSignalId(id)) this.fail(`${key}: unknown signal "${id}" (add it to src/shared/signals.ts first)`);
		return ids.filter(isSignalId);
	}
}

function load(dir: string, file: string): unknown {
	return YAML.parse(readFileSync(join(dir, file), "utf8"));
}

function parseCases(raw: unknown, problems: string[]): Case[] {
	const list = (raw as { cases?: unknown })?.cases;
	if (!Array.isArray(list)) {
		problems.push("cases.yaml: expected a top-level `cases:` list");
		return [];
	}
	return list.map((item: Raw, i) => {
		const c = new Checker(`cases.yaml #${i + 1} (${String(item?.id ?? "?")})`);
		const out: Case = {
			id: c.str(item, "id"),
			market: c.oneOf(item, "market", MARKETS),
			stage: c.oneOf(item, "stage", STAGES),
			date: String(item.date ?? ""),
			brand: c.str(item, "brand"),
			title: c.str(item, "title"),
			summary: c.str(item, "summary"),
			lesson: c.str(item, "lesson"),
			sources: c.list(item, "sources"),
			verified: c.verified(item),
		};
		if (!out.date) c.fail("date is required");
		if (!out.sources.length) c.fail("at least one source is required");
		for (const s of out.sources) if (!s.startsWith("https://")) c.fail(`source must be an https URL: ${s}`);
		problems.push(...c.problems);
		return out;
	});
}

function parseRules(raw: unknown, problems: string[]): Rule[] {
	const list = (raw as { rules?: unknown })?.rules;
	if (!Array.isArray(list)) {
		problems.push("rules.yaml: expected a top-level `rules:` list");
		return [];
	}
	return list.map((item: Raw, i) => {
		const c = new Checker(`rules.yaml #${i + 1} (${String(item?.id ?? "?")})`);
		const out: Rule = {
			id: c.str(item, "id"),
			market: c.oneOf(item, "market", MARKETS),
			stage: c.oneOf(item, "stage", STAGES),
			category: c.str(item, "category"),
			severity: c.oneOf(item, "severity", SEVERITIES),
			detect: c.str(item, "detect"),
			looks_for: c.str(item, "looks_for"),
			signals: c.signals(item, "signals"),
			why: c.str(item, "why"),
			fix: c.str(item, "fix"),
			cases: c.list(item, "cases"),
			verified: c.verified(item),
		};
		if (out.stage !== "timing" && !out.signals.length) c.fail("a non-timing rule needs at least one signal, or it can never fire");
		problems.push(...c.problems);
		return out;
	});
}

function parseCalendar(raw: unknown, problems: string[]): CalendarEvent[] {
	if (!raw || typeof raw !== "object") {
		problems.push("calendar.yaml: expected one list per market (KR:, US:, SG:)");
		return [];
	}
	const out: CalendarEvent[] = [];
	for (const [market, list] of Object.entries(raw as Raw)) {
		if (!MARKETS.includes(market as Market)) {
			problems.push(`calendar.yaml: unknown market "${market}"`);
			continue;
		}
		if (!Array.isArray(list)) {
			problems.push(`calendar.yaml: ${market} must be a list`);
			continue;
		}
		list.forEach((item: Raw, i) => {
			const c = new Checker(`calendar.yaml ${market} #${i + 1} (${String(item?.id ?? "?")})`);
			const audienceRaw = (item.audience ?? {}) as Raw;
			const audience: CalendarEvent["audience"] = {};
			for (const [key, value] of Object.entries(audienceRaw)) {
				if (!AUDIENCE_KEYS.includes(key as Segment | "all")) c.fail(`audience: unknown segment "${key}"`);
				else if (typeof value !== "number" || value < 0 || value > 1) c.fail(`audience.${key} must be 0–1`);
				else audience[key as Segment | "all"] = value;
			}
			if (!Object.keys(audience).length) c.fail("audience needs at least one segment (or all)");
			const event: CalendarEvent = {
				id: c.str(item, "id"),
				market: market as Market,
				name: c.str(item, "name"),
				kind: c.oneOf(item, "kind", KINDS),
				start: String(item.start ?? ""),
				end: String(item.end ?? ""),
				attention: c.unit(item, "attention"),
				audience,
				confidence: c.oneOf(item, "confidence", CONFIDENCES),
				...(typeof item.note === "string" && item.note.trim() ? { note: item.note.trim() } : {}),
				rules: c.list(item, "rules"),
				blocks: c.signals(item, "blocks"),
			};
			if (!DAY.test(event.start) || !DAY.test(event.end)) c.fail("start and end must be YYYY-MM-DD");
			else if (event.start > event.end) c.fail("start is after end");
			problems.push(...c.problems);
			out.push(event);
		});
	}
	return out;
}

function crossCheck(k: Knowledge, problems: string[]) {
	for (const [name, items] of [
		["case", k.cases],
		["rule", k.rules],
		["event", k.calendar],
	] as const) {
		const seen = new Set<string>();
		for (const item of items) {
			if (!ID.test(item.id)) problems.push(`${name} id "${item.id}" has unexpected characters`);
			if (seen.has(item.id)) problems.push(`duplicate ${name} id "${item.id}"`);
			seen.add(item.id);
		}
	}
	const cases = new Set(k.cases.map((c) => c.id));
	const rules = new Set(k.rules.map((r) => r.id));
	for (const r of k.rules) for (const id of r.cases) if (!cases.has(id)) problems.push(`rule ${r.id}: unknown case "${id}"`);
	for (const e of k.calendar) for (const id of e.rules) if (!rules.has(id)) problems.push(`event ${e.id}: unknown rule "${id}"`);
}

/** Reads, validates and returns the knowledge base; throws KnowledgeError listing every problem. */
export function readKnowledge(dir: string): Knowledge {
	const problems: string[] = [];
	const knowledge: Knowledge = {
		cases: parseCases(load(dir, "cases.yaml"), problems),
		rules: parseRules(load(dir, "rules.yaml"), problems),
		calendar: parseCalendar(load(dir, "calendar.yaml"), problems).sort((a, b) => a.start.localeCompare(b.start) || a.id.localeCompare(b.id)),
	};
	crossCheck(knowledge, problems);
	if (problems.length) throw new KnowledgeError(problems);
	return knowledge;
}

export function renderKnowledge(knowledge: Knowledge): string {
	return [
		"// Generated by scripts/build-knowledge.ts from knowledge/*.yaml. Do not edit; run `npm run knowledge`.",
		'import type { Knowledge } from "./knowledge.ts";',
		"",
		`export const KNOWLEDGE: Knowledge = ${JSON.stringify(knowledge, null, "\t")};`,
		"",
	].join("\n");
}
