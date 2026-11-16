import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assess } from "../src/engine/creative/assess.ts";
import { buildLaunchHandoff, marketStatusText, reviewOf } from "../src/client/handoff.ts";
import { DEMO_CASES, demoCase } from "../src/shared/demo.ts";
import { LLM_SPEND_SCHEMA } from "../src/shared/ledger.ts";

describe("launch handoff", () => {
	it("carries the assessed market's remaining findings and no other market", () => {
		for (const demo of DEMO_CASES) {
			const result = assess(demo.original.signals, [demo.focus]);
			const report = result.markets[0];
			if (!report) throw new Error(demo.id);
			const handoff = buildLaunchHandoff({
				segment: demo.segment,
				themes: result.themes,
				material: demo.title + "（" + demo.original.label + "）",
				report,
				origin: "fixture",
			});
			expect(handoff.markets).toEqual([demo.focus]);
			expect(handoff.reviewed.map((review) => review.market)).toEqual([demo.focus]);
			expect(handoff.reviewed[0]).toMatchObject(reviewOf(report));
			expect(handoff.reviewed[0]?.remaining).toBe(report.findings.length);
			expect(handoff.themes).toEqual(result.themes);
			for (const market of ["US", "SG", "KR"] as const) {
				if (market === demo.focus) continue;
				expect(marketStatusText(market, undefined, false)).not.toMatch(/已预检|已审|风险全消除|没有剩余风险/);
			}
		}
	});

	it("keeps an unscanned market unscanned after it is added to the calendar", () => {
		const kr = demoCase("kr-kv");
		if (!kr) throw new Error("kr");
		const report = assess(kr.original.signals, ["KR"]).markets[0];
		if (!report) throw new Error("report");
		const review = reviewOf(report);
		expect(review.remaining).toBeGreaterThan(0);
		expect(marketStatusText("KR", review, true)).toContain("已预检");
		expect(marketStatusText("KR", review, true)).toContain("剩余");
		expect(marketStatusText("US", undefined, true)).toContain("尚未做素材预检");
		expect(marketStatusText("US", undefined, true)).toContain("不代表审核通过");
		expect(marketStatusText("SG", undefined, true)).not.toMatch(/已预检|没有剩余风险|风险全消除/);
	});

	it("can say a reviewed market has no remaining risk only after assessment", () => {
		const kr = demoCase("kr-kv");
		if (!kr) throw new Error("kr");
		const report = assess(kr.localized.signals, ["KR"]).markets[0];
		if (!report) throw new Error("report");
		expect(marketStatusText("KR", reviewOf(report), true)).toContain("已预检，当前规则下没有剩余风险");
		expect(marketStatusText("US", undefined, false)).not.toContain("没有剩余风险");
	});
});

describe("demo database migration", () => {
	it("matches the ledger statement the worker creates", () => {
		const sql = readFileSync(new URL("../migrations/0001_llm_spend.sql", import.meta.url), "utf8");
		expect(sql).toContain(LLM_SPEND_SCHEMA);
		expect(sql).toContain("clearrun-global-demo");
		expect(sql).not.toMatch(/clearrun\.zichengyu\.com|OPENROUTER|api[_-]?key/i);
	});
});
