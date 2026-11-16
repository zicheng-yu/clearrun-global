import { describe, expect, it } from "vitest";
import { intensity, LaunchInputError, normalizeLaunchRequest, planLaunch, planMarket, weekAssessmentLabel, type LaunchRequest } from "../src/engine/launch/plan.ts";
import { launchDay, launchDayText, listMondays, mondayOf, overlapDays } from "../src/shared/dates.ts";
import { eventById } from "../src/shared/knowledge.ts";

const base: LaunchRequest = { markets: ["KR"], segment: "consumer", themes: [], from: "2026-11-23", weeks: 52 };
const week = (plan: ReturnType<typeof planMarket>, day: string) => plan.weeks.find((w) => w.week === mondayOf(day));

describe("dates", () => {
	it("finds Mondays and counts overlapping days", () => {
		expect(mondayOf("2026-11-11")).toBe("2026-11-09");
		expect(mondayOf("2026-11-15")).toBe("2026-11-09");
		expect(listMondays("2026-11-11", 2)).toEqual(["2026-11-09", "2026-11-16"]);
		expect(overlapDays("2027-02-06", "2027-02-09", "2027-02-01")).toBe(2);
		expect(overlapDays("2027-02-06", "2027-02-09", "2027-02-08")).toBe(2);
	});
});

describe("launch calendar", () => {
	it("spills a keynote's attention into the week before it", () => {
		const wwdc = eventById("us-wwdc-2027");
		if (!wwdc) throw new Error("missing event");
		expect(intensity(wwdc, "2027-06-07")).toBe(1);
		expect(intensity(wwdc, "2027-05-31")).toBe(0.3);
		expect(intensity(wwdc, "2027-06-14")).toBe(0.4);
	});

	it("rates Seollal week as heavy pressure in Korea and a quiet week as clear", () => {
		const kr = planMarket("KR", base);
		expect(week(kr, "2027-02-08")?.p).toBeGreaterThan(0.6);
		// Late March: no holiday, keynote or sensitive date across the three-week run.
		expect(week(kr, "2027-03-22")?.p).toBeLessThan(0.2);
		// The week before May's holidays still feels them, through the second and third weeks of the run.
		expect(week(kr, "2027-04-26")?.p).toBeGreaterThan(0.3);
		expect(kr.best.every((w) => !kr.danger.includes(w))).toBe(true);
	});

	it("blocks Korea's Halloween weeks only when the creative carries a Halloween theme", () => {
		const plain = planMarket("KR", base);
		expect(week(plain, "2027-10-27")?.blocks).toEqual([]);
		const themed = planMarket("KR", { ...base, themes: ["theme.halloween"] });
		const blocked = week(themed, "2027-10-27");
		expect(blocked?.blocks.map((b) => b.eventId)).toEqual(["kr-halloween-2027"]);
		expect(blocked?.blocks[0]?.rules).toEqual(["KR-T01"]);
		expect(themed.best).not.toContain(mondayOf("2027-10-27"));
	});

	it("weighs the same event differently by audience segment", () => {
		const dev = planMarket("US", { ...base, markets: ["US"], segment: "developer" });
		const consumer = planMarket("US", { ...base, markets: ["US"], segment: "consumer" });
		// Raw pressure, since both segments can hit the display cap of p = 1 in the heaviest weeks.
		const raw = (plan: typeof dev, day: string) => week(plan, day)?.pressure ?? Number.NaN;
		expect(raw(dev, "2027-06-07")).toBeGreaterThan(raw(consumer, "2027-06-07"));
		expect(raw(consumer, "2026-11-23")).toBeGreaterThan(raw(dev, "2026-11-23"));
	});

	it("lifts opportunity windows for matching segments", () => {
		const students = planMarket("KR", { ...base, segment: "student" });
		expect(week(students, "2027-03-02")?.opportunities).toContain("kr-semester-2027");
		expect(week(students, "2027-03-02")?.bonus).toBeGreaterThan(0);
	});

	it("rolls out in the requested order without going back in time", () => {
		const plan = planLaunch({ ...base, markets: ["US", "SG", "KR"], segment: "prosumer", weeks: 26 });
		expect(plan.rollout.map((s) => s.market)).toEqual(["US", "SG", "KR"]);
		const weeks = plan.rollout.map((s) => s.week);
		expect([...weeks].sort()).toEqual(weeks);
	});

	it("marks weeks whose run passes the end of the calendar data", () => {
		const kr = planMarket("KR", base);
		expect(kr.weeks.at(-1)?.covered).toBe(false);
		expect(kr.best.every((w) => kr.weeks.find((x) => x.week === w)?.covered)).toBe(true);
	});

	it("does not recommend a day before 2026-12-02, and shows that day the same way in every market", () => {
		expect(mondayOf("2026-12-02")).toBe("2026-11-30");
		expect(launchDay("2026-11-30", "2026-12-02")).toBe("2026-12-02");
		const plan = planLaunch({ markets: ["US", "SG", "KR"], segment: "prosumer", themes: [], from: "2026-12-02", weeks: 26 });
		expect(plan.markets.map((market) => market.weeks[0]?.week)).toEqual(["2026-11-30", "2026-11-30", "2026-11-30"]);
		const labels = plan.markets.map((market) => launchDayText(market.weeks[0]?.week ?? "", plan.request.from));
		expect(new Set(labels).size).toBe(1);
		expect(labels[0]).toContain("最早可上线");
		expect(labels[0]).toContain("12月2日");
		for (const step of plan.rollout) expect(launchDay(step.week, "2026-12-02") >= "2026-12-02").toBe(true);
		for (const market of plan.markets) {
			for (const picked of market.best) expect(launchDay(picked, "2026-12-02") >= "2026-12-02").toBe(true);
		}
	});

	it("does not give a full-score recommendation outside the calendar, including 2020-01-01 and the coverage edges", () => {
		const inside = planLaunch({ markets: ["KR"], segment: "consumer", themes: [], from: "2026-11-10", weeks: 60 });
		expect(inside.coverage).toEqual({ start: "2026-11-16", end: "2027-10-31" });
		const before = inside.markets[0]?.weeks.find((item) => item.week < inside.coverage.start);
		const firstCovered = inside.markets[0]?.weeks.find((item) => item.week >= inside.coverage.start && item.covered);
		const lastCovered = [...(inside.markets[0]?.weeks ?? [])].reverse().find((item) => item.covered);
		const after = inside.markets[0]?.weeks.find((item) => item.week > (lastCovered?.week ?? ""));
		expect(before?.covered).toBe(false);
		expect(firstCovered?.covered).toBe(true);
		expect(lastCovered?.covered).toBe(true);
		expect(after?.covered).toBe(false);
		expect(weekAssessmentLabel({ covered: false, clear: 1 })).toBe("超出数据范围，不足以评估");
		expect(weekAssessmentLabel({ covered: false, clear: 1 })).not.toContain("100");

		const outside = planLaunch({ markets: ["KR", "US", "SG"], segment: "consumer", themes: [], from: "2020-01-01", weeks: 13 });
		expect(outside.rollout).toEqual([]);
		for (const market of outside.markets) {
			expect(market.weeks.every((item) => !item.covered)).toBe(true);
			expect(market.best).toEqual([]);
			expect(market.weeks.some((item) => item.clear === 1)).toBe(true);
			expect(market.weeks.every((item) => !market.best.includes(item.week))).toBe(true);
		}
	});

	it("validates requests", () => {
		expect(() => normalizeLaunchRequest({ markets: [], segment: "consumer" }, "2026-11-11")).toThrow(LaunchInputError);
		expect(() => normalizeLaunchRequest({ markets: ["KR"], segment: "aliens" }, "2026-11-11")).toThrow(LaunchInputError);
		const r = normalizeLaunchRequest({ markets: ["KR", "XX", "KR"], segment: "student", themes: ["theme.halloween", "nope"], weeks: 999 }, "2026-11-11");
		expect(r).toEqual({ markets: ["KR"], segment: "student", themes: ["theme.halloween"], from: "2026-11-25", weeks: 52 });
	});
});
