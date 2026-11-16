/**
 * Knowledge base types and lookups. The source of truth is knowledge/*.yaml; `node scripts/build-knowledge.ts`
 * validates it and writes knowledge.gen.ts, which both the Worker and the browser import.
 */
import { KNOWLEDGE } from "./knowledge.gen.ts";
import type { SignalId } from "./signals.ts";

export type Market = "KR" | "US" | "SG";
export const MARKETS: readonly Market[] = ["US", "SG", "KR"];
export const MARKET_LABEL: Record<Market, string> = { KR: "韩国", US: "美国", SG: "新加坡" };
export const MARKET_FLAG: Record<Market, string> = { KR: "🇰🇷", US: "🇺🇸", SG: "🇸🇬" };

export type Segment = "developer" | "prosumer" | "consumer" | "enterprise" | "student";
export const SEGMENTS: readonly Segment[] = ["developer", "prosumer", "consumer", "enterprise", "student"];
export const SEGMENT_LABEL: Record<Segment, string> = {
	developer: "开发者",
	prosumer: "专业用户",
	consumer: "大众消费者",
	enterprise: "企业客户",
	student: "学生",
};

export type Stage = "creative" | "claims" | "trust" | "timing";
export const STAGE_LABEL: Record<Stage, string> = { creative: "素材", claims: "宣称", trust: "数据与信任", timing: "档期" };

export type Severity = "high" | "medium" | "low";
export const SEVERITY_LABEL: Record<Severity, string> = { high: "高风险", medium: "需评估", low: "注意" };

/** true = checked against the original report; "partial" = some details still to source; false = not yet sourced. */
export type Verified = true | false | "partial";

export interface Case {
	id: string;
	market: Market;
	stage: Stage;
	date: string;
	brand: string;
	title: string;
	summary: string;
	lesson: string;
	sources: string[];
	verified: Verified;
}

export interface Rule {
	id: string;
	market: Market;
	stage: Stage;
	category: string;
	severity: Severity;
	detect: string;
	looks_for: string;
	signals: SignalId[];
	why: string;
	fix: string;
	cases: string[];
	verified: Verified;
}

export type EventKind = "holiday" | "rival" | "sensitive" | "opportunity";
export const EVENT_KIND_LABEL: Record<EventKind, string> = { holiday: "假期", rival: "撞档", sensitive: "敏感期", opportunity: "顺势" };

export type Confidence = "confirmed" | "rule" | "estimated";

export interface CalendarEvent {
	id: string;
	market: Market;
	name: string;
	kind: EventKind;
	/** Inclusive YYYY-MM-DD range. */
	start: string;
	end: string;
	attention: number;
	/** Effect on each segment, 0–1; `all` is the default for segments not listed. */
	audience: Partial<Record<Segment | "all", number>>;
	confidence: Confidence;
	note?: string;
	rules: string[];
	blocks: SignalId[];
}

export interface Knowledge {
	cases: Case[];
	rules: Rule[];
	calendar: CalendarEvent[];
}

export const knowledge: Knowledge = KNOWLEDGE;

const byId = <T extends { id: string }>(items: T[]) => new Map(items.map((item) => [item.id, item]));
const CASES = byId(knowledge.cases);
const RULES = byId(knowledge.rules);
const EVENTS = byId(knowledge.calendar);

export const caseById = (id: string): Case | undefined => CASES.get(id);
export const ruleById = (id: string): Rule | undefined => RULES.get(id);
export const eventById = (id: string): CalendarEvent | undefined => EVENTS.get(id);

/** An event's effect on one segment. */
export const audienceOf = (event: CalendarEvent, segment: Segment): number => event.audience[segment] ?? event.audience.all ?? 0;
