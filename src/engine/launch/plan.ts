/**
 * The launch-pressure calendar: ClearRun's release engine, re-aimed at product launches abroad.
 * Rivals are the events in knowledge/calendar.yaml (tech keynotes, shopping festivals, long holidays,
 * national moments); overlap is how much each event takes from your audience segment; and sensitive
 * dates don't just add pressure, they block a week when your creative carries a theme they clash with.
 * Pure functions shared by the Worker and the browser, so what-ifs recompute instantly.
 */
import { addDays, daysBetween, listMondays, mondayOf, overlapDays } from "../../shared/dates.ts";
import {
	audienceOf,
	CONFIDENCE_LABEL,
	knowledge,
	MARKETS,
	SEGMENTS,
	type CalendarEvent,
	type EventKind,
	type Market,
	type Segment,
} from "../../shared/knowledge.ts";
import { isSignalId, type SignalId } from "../../shared/signals.ts";

/** Weight of each week of your launch's buzz: launch week, then the two after it (an AI launch fades fast). */
export const LAUNCH_RUN: readonly number[] = [1, 0.5, 0.25];
const RUN_TOTAL = LAUNCH_RUN.reduce((a, b) => a + b, 0);

/** How strongly each kind of event takes attention, and how much spills into the week before and after it. */
export const KIND_EFFECT: Record<EventKind, { weight: number; before: number; after: number }> = {
	rival: { weight: 1, before: 0.3, after: 0.4 },
	holiday: { weight: 1, before: 0.2, after: 0.1 },
	sensitive: { weight: 0.4, before: 0, after: 0 },
	opportunity: { weight: 0, before: 0, after: 0 },
};

/** Roughly a full national holiday in your launch week. Pressure is shown relative to it, so markets compare. */
export const PRESSURE_REF = 0.6;
/** Events spanning more than two weeks are diffuse (an uncertain keynote window, a month-long period). */
const DIFFUSE_DAYS = 14;
const OPPORTUNITY_GAIN = 0.5;
const MAX_BONUS = 0.25;
/** Blocks apply when a clashing event falls in your launch week or the week after. */
const BLOCK_WEEKS = 2;
/**
 * What each week of waiting costs when picking weeks: a launch that slips has a price, so among weeks
 * about as clear, the earlier one wins (26 weeks out costs 0.26 of clear). Clear itself is unaffected.
 */
export const DELAY_COST = 0.01;
/** In a rollout, each week a later market trails the one before it costs more: the launch's momentum fades. */
export const FOLLOW_COST = 0.03;

export interface Contributor {
	eventId: string;
	pressure: number;
}

export interface Block {
	eventId: string;
	/** The creative's signals that clash with this event. */
	signals: SignalId[];
	rules: string[];
}

export interface WeekScore {
	/** Monday of the launch week. */
	week: string;
	/** Run-weighted attention already spoken for, before scaling. */
	pressure: number;
	/** Pressure relative to PRESSURE_REF, capped at 1. */
	p: number;
	/** Lift from opportunity windows that match your segment, 0–MAX_BONUS. */
	bonus: number;
	/** 1 − p + bonus, clamped to 0–1. Higher is better. */
	clear: number;
	blocks: Block[];
	/** Events taking your audience's attention across the run, strongest first. */
	contributors: Contributor[];
	opportunities: string[];
	/** True when an estimated (not yet announced) event is among the top contributors. */
	estimated: boolean;
	/** False when the launch week or its two follow-on weeks fall outside the calendar data. */
	covered: boolean;
}

export interface Verdict {
	week: string;
	rank: number;
	of: number;
	/** Keep your week: it isn't blocked and is within 10% of the clearest week. */
	hold: boolean;
	best: string;
}

export interface MarketPlan {
	market: Market;
	weeks: WeekScore[];
	/** Clearest unblocked weeks, best first, at least two weeks apart. */
	best: string[];
	/** Highest-pressure weeks, worst first. */
	danger: string[];
	verdict?: Verdict;
}

export interface RolloutStep {
	market: Market;
	week: string;
	clear: number;
}

export interface LaunchRequest {
	/** In rollout order: the first market launches first. */
	markets: Market[];
	segment: Segment;
	/** Signals the creative carries (from the creative check, or picked by hand). */
	themes: SignalId[];
	/** Any day in the first candidate week. */
	from: string;
	weeks: number;
	/** Weeks you have already pencilled in, per market (any day in the week). */
	yours?: Partial<Record<Market, string>>;
}

export interface LaunchPlan {
	request: LaunchRequest;
	markets: MarketPlan[];
	rollout: RolloutStep[];
	/** The calendar data's date range. */
	coverage: { start: string; end: string };
}

export class LaunchInputError extends Error {
	constructor(message: string) {
		super(message);
		this.name = "LaunchInputError";
	}
}

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Validates a request from the network or the URL. `today` sets the default first week (two weeks out). */
export function normalizeLaunchRequest(body: unknown, today: string): LaunchRequest {
	const raw = (body ?? {}) as Record<string, unknown>;
	const markets = Array.isArray(raw.markets) ? [...new Set(raw.markets.filter((m): m is Market => MARKETS.includes(m as Market)))] : [];
	if (!markets.length) throw new LaunchInputError("markets must list at least one of KR, US, SG");
	const segment = SEGMENTS.includes(raw.segment as Segment) ? (raw.segment as Segment) : undefined;
	if (!segment) throw new LaunchInputError(`segment must be one of ${SEGMENTS.join(", ")}`);
	const themes = Array.isArray(raw.themes) ? [...new Set(raw.themes.filter(isSignalId))] : [];
	const from = typeof raw.from === "string" && DAY.test(raw.from) ? raw.from : addDays(today, 14);
	const weeks = Math.min(52, Math.max(4, Math.round(Number(raw.weeks) || 26)));
	const yours: Partial<Record<Market, string>> = {};
	if (raw.yours && typeof raw.yours === "object") {
		for (const [market, day] of Object.entries(raw.yours as Record<string, unknown>)) {
			if (markets.includes(market as Market) && typeof day === "string" && DAY.test(day)) yours[market as Market] = day;
		}
	}
	return { markets, segment, themes, from, weeks, ...(Object.keys(yours).length ? { yours } : {}) };
}

/** How much of an event lands in the week starting `monday`, 0–1, including spill into the weeks either side. */
export function intensity(event: CalendarEvent, monday: string): number {
	const span = daysBetween(event.start, event.end) + 1;
	const diffuse = span > DIFFUSE_DAYS ? 0.5 : 1;
	const days = overlapDays(event.start, event.end, monday);
	// One day of a holiday or keynote already takes most of the week's attention; two or more take all of it.
	if (days > 0) return diffuse * Math.min(1, (days + 1) / 3);
	const effect = KIND_EFFECT[event.kind];
	const next = addDays(monday, 7);
	if (overlapDays(event.start, event.end, next) > 0 && event.start >= next) return diffuse * effect.before;
	if (event.end < monday && event.end >= addDays(monday, -7)) return diffuse * effect.after;
	return 0;
}

/** Pressure on one calendar week (not a launch run) for a segment, with each event's part. */
export function weekPressure(events: CalendarEvent[], monday: string, segment: Segment): { total: number; parts: Map<string, number> } {
	const parts = new Map<string, number>();
	let total = 0;
	for (const event of events) {
		const weight = KIND_EFFECT[event.kind].weight;
		if (!weight) continue;
		const value = weight * event.attention * audienceOf(event, segment) * intensity(event, monday);
		if (value <= 0) continue;
		parts.set(event.id, value);
		total += value;
	}
	return { total, parts };
}

function scoreWeek(events: CalendarEvent[], week: string, request: LaunchRequest, coverageStart: string, coverageEnd: string): WeekScore {
	const byEvent = new Map<string, number>();
	let pressure = 0;
	LAUNCH_RUN.forEach((weight, j) => {
		const { total, parts } = weekPressure(events, addDays(week, 7 * j), request.segment);
		pressure += (weight * total) / RUN_TOTAL;
		for (const [id, value] of parts) byEvent.set(id, (byEvent.get(id) ?? 0) + (weight * value) / RUN_TOTAL);
	});

	let bonus = 0;
	const opportunities: string[] = [];
	for (const event of events) {
		if (event.kind !== "opportunity") continue;
		const lift = OPPORTUNITY_GAIN * event.attention * audienceOf(event, request.segment) * intensity(event, week);
		if (lift > 0.02) {
			bonus += lift;
			opportunities.push(event.id);
		}
	}
	bonus = Math.min(MAX_BONUS, bonus);

	const themes = new Set(request.themes);
	const blocks: Block[] = [];
	for (const event of events) {
		const clash = event.blocks.filter((s) => themes.has(s));
		if (!clash.length) continue;
		const hit = Array.from({ length: BLOCK_WEEKS }, (_, j) => overlapDays(event.start, event.end, addDays(week, 7 * j))).some((d) => d > 0);
		if (hit) blocks.push({ eventId: event.id, signals: clash, rules: event.rules });
	}

	const contributors = [...byEvent.entries()].map(([eventId, value]) => ({ eventId, pressure: value })).sort((a, b) => b.pressure - a.pressure);
	const top = contributors.slice(0, 3).map((c) => events.find((e) => e.id === c.eventId));
	const p = Math.min(1, pressure / PRESSURE_REF);
	return {
		week,
		pressure,
		p,
		bonus,
		clear: Math.max(0, Math.min(1, 1 - p + bonus)),
		blocks,
		contributors,
		opportunities,
		estimated: top.some((e) => e?.confidence === "estimated"),
		covered: coverageStart !== "" && week >= coverageStart && addDays(week, 7 * LAUNCH_RUN.length - 1) <= coverageEnd,
	};
}

/** Shown instead of a score when the week is outside the calendar. Uncovered weeks are never recommendations. */
export function weekAssessmentLabel(week: Pick<WeekScore, "covered" | "clear">): string {
	if (!week.covered) return "超出数据范围，不足以评估";
	return "档期分 " + Math.round(week.clear * 100);
}

function eventOf(events: CalendarEvent[], id: string): CalendarEvent | undefined {
	return events.find((event) => event.id === id);
}

/** Conflicts on other weeks that this week does not carry. Empty when this week is itself blocked or uncovered. */
export function avoidedConflicts(week: WeekScore, peers: WeekScore[], events: CalendarEvent[] = knowledge.calendar): string[] {
	if (!week.covered || week.blocks.length) return [];
	const lines: string[] = [];
	const seen = new Set<string>();
	for (const other of peers) {
		for (const block of other.blocks) {
			if (seen.has(block.eventId) || week.blocks.some((item) => item.eventId === block.eventId)) continue;
			seen.add(block.eventId);
			const event = eventOf(events, block.eventId);
			if (!event) continue;
			lines.push(`避开「${event.name}」（${event.start} 至 ${event.end}，规则 ${block.rules.join("、")}）`);
			if (lines.length >= 2) return lines;
		}
	}
	return lines;
}

/**
 * At most two reasons for a week: a block, the main pressure source, or a conflict this week avoids.
 * Pressure here is the model's index, not a measured share of market attention.
 */
export function recommendationLines(week: WeekScore, peers: WeekScore[], events: CalendarEvent[] = knowledge.calendar): string[] {
	if (!week.covered) return ["超出知识库覆盖范围，这一周不会被推荐。"];
	const block = week.blocks[0];
	const blockedBy = block ? eventOf(events, block.eventId) : undefined;
	if (block && blockedBy) {
		return [
			`不推荐：被「${blockedBy.name}」阻断（${blockedBy.start} 至 ${blockedBy.end}，${CONFIDENCE_LABEL[blockedBy.confidence]}，规则 ${block.rules.join("、")}）。`,
		];
	}
	const lines: string[] = [];
	const avoided = avoidedConflicts(week, peers, events);
	if (avoided[0]) lines.push(avoided[0]);
	const top = week.contributors[0];
	const source = top ? eventOf(events, top.eventId) : undefined;
	if (source) {
		const when = source.start === source.end ? source.start : `${source.start} 至 ${source.end}`;
		lines.push(`压力主要来自「${source.name}」（${CONFIDENCE_LABEL[source.confidence]}，${when}）。这是模型计算的档期压力指数。`);
	} else if (!lines.length) {
		lines.push("已收录事件里，没有会抬高这一周压力指数的撞档。");
	}
	return lines.slice(0, 2);
}

/** Top weeks by score, at least `gap` weeks apart. Ties keep calendar order. */
function topSpaced(weeks: WeekScore[], score: (w: WeekScore) => number, count: number, gap = 2): string[] {
	const picked: WeekScore[] = [];
	for (const w of [...weeks].sort((a, b) => score(b) - score(a) || a.week.localeCompare(b.week))) {
		if (picked.length >= count) break;
		if (picked.every((p) => Math.abs(daysBetween(p.week, w.week)) >= gap * 7)) picked.push(w);
	}
	return picked.map((w) => w.week);
}

const eligible = (w: WeekScore) => w.covered && w.blocks.length === 0;

/** Clear, less the cost of waiting since `first` (the earliest candidate week). Used to pick weeks, never shown as clear. */
const pickScore = (w: WeekScore, first: string, cost = DELAY_COST) => w.clear - cost * (daysBetween(first, w.week) / 7);

export function verdict(weeks: WeekScore[], yourWeek: string): Verdict | undefined {
	const week = mondayOf(yourWeek);
	const mine = weeks.find((w) => w.week === week);
	const ranked = [...weeks].sort((a, b) => b.clear - a.clear || a.week.localeCompare(b.week));
	const best = ranked.find((w) => w.week !== week && eligible(w));
	if (!mine || !best) return undefined;
	return { week, rank: ranked.indexOf(mine) + 1, of: ranked.length, hold: eligible(mine) && mine.clear >= 0.9 * best.clear, best: best.week };
}

export function planMarket(market: Market, request: LaunchRequest, events: CalendarEvent[] = knowledge.calendar): MarketPlan {
	const mine = events.filter((e) => e.market === market);
	const coverageStart = events.reduce((min, e) => (min === "" || e.start < min ? e.start : min), "");
	const coverageEnd = events.reduce((max, e) => (e.end > max ? e.end : max), "");
	const weeks = listMondays(request.from, request.weeks).map((week) => scoreWeek(mine, week, request, coverageStart, coverageEnd));
	const yours = request.yours?.[market];
	const first = weeks[0]?.week ?? request.from;
	return {
		market,
		weeks,
		best: topSpaced(weeks.filter(eligible), (w) => pickScore(w, first), 3),
		danger: topSpaced(
			weeks.filter((w) => w.p >= 0.5),
			(w) => w.p,
			3,
		),
		...(yours ? { verdict: verdict(weeks, yours) } : {}),
	};
}

/**
 * A staggered rollout in the requested market order. The first market takes its best eligible week
 * (clear, less the cost of waiting); each later market takes its best week no earlier than the one
 * before it, paying FOLLOW_COST for every week it trails (launching together is allowed).
 */
export function rollout(plans: MarketPlan[]): RolloutStep[] {
	const steps: RolloutStep[] = [];
	let after = "";
	for (const plan of plans) {
		const first = after || plan.weeks[0]?.week || "";
		const cost = after ? FOLLOW_COST : DELAY_COST;
		const pick = [...plan.weeks]
			.filter((w) => eligible(w) && w.week >= after)
			.sort((a, b) => pickScore(b, first, cost) - pickScore(a, first, cost) || a.week.localeCompare(b.week))[0];
		if (!pick) continue;
		steps.push({ market: plan.market, week: pick.week, clear: pick.clear });
		after = pick.week;
	}
	return steps;
}

export function planLaunch(request: LaunchRequest, events: CalendarEvent[] = knowledge.calendar): LaunchPlan {
	const markets = request.markets.map((market) => planMarket(market, request, events));
	const days = events.flatMap((e) => [e.start, e.end]).sort();
	return { request, markets, rollout: rollout(markets), coverage: { start: days[0] ?? "", end: days[days.length - 1] ?? "" } };
}
