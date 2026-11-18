import { describe, expect, it } from "vitest";
import { assess, cleanSignals } from "../src/engine/creative/assess.ts";
import { demoCase } from "../src/shared/demo.ts";

const byMarket = (demoId: string, variant: "original" | "localized") => {
	const demo = demoCase(demoId);
	if (!demo) throw new Error(demoId);
	return Object.fromEntries(assess(demo[variant].signals, ["US", "SG", "KR"]).markets.map((m) => [m.market, m]));
};

describe("creative assessment", () => {
	it("flags the pinch gesture in Korea only, with the Apple case attached", () => {
		const r = byMarket("kr-kv", "original");
		expect(r.KR?.level).toBe("red");
		expect(r.KR?.findings.map((f) => f.rule.id)).toEqual(["KR-G01"]);
		expect(r.KR?.findings.find((f) => f.rule.id === "KR-G01")?.cases.map((c) => c.id)).toContain("kr-apple-iphone-air-pinch");
		expect(r.US?.level).toBe("green");
		expect(r.SG?.level).toBe("green");
	});

	it("clears every market once the creative is localized", () => {
		for (const id of ["kr-kv", "us-copy", "sg-frame"]) {
			const r = byMarket(id, "localized");
			for (const m of Object.values(r)) expect(m.level, `${id} ${m.market}`).toBe("green");
		}
	});

	it("scores the US copy draft at zero: three high-risk rules and one medium", () => {
		const r = byMarket("us-copy", "original");
		expect(r.US?.findings.map((f) => f.rule.id).sort()).toEqual(["US-L01", "US-L02", "US-M01", "US-M02"]);
		expect(r.US?.score).toBe(0);
	});

	it("flags the pork photograph in Singapore without inventing a casting hit", () => {
		const r = byMarket("sg-frame", "original");
		expect(r.SG?.level).toBe("yellow");
		expect(r.SG?.findings.map((f) => f.rule.id)).toEqual(["SG-R02"]);
	});

	it("hands timing rules to the calendar instead of flagging them", () => {
		const result = assess([{ signal: "theme.halloween", asset: "kv", evidence: "南瓜和变装派对", confidence: 0.9 }], ["KR"]);
		expect(result.markets[0]?.findings).toEqual([]);
		expect(result.markets[0]?.timing.map((f) => f.rule.id)).toEqual(["KR-T01"]);
		expect(result.themes).toEqual(["theme.halloween"]);
	});

	it("ignores low-confidence signals", () => {
		const result = assess([{ signal: "gesture.pinch", asset: "kv", evidence: "?", confidence: 0.3 }], ["KR"]);
		expect(result.markets[0]?.level).toBe("green");
	});

	it("cleans model output: unknown signals dropped, boxes clamped, missing assets defaulted", () => {
		const out = cleanSignals(
			[
				{ signal: "gesture.pinch", asset: "kv", evidence: " 捏 ", box: [0.9, 0.9, 0.5, 0.5], confidence: 2 },
				{ signal: "made.up", asset: "kv", evidence: "x" },
				{ signal: "food.pork", asset: "nope", evidence: "肉骨茶" },
			],
			["kv", "copy"],
		);
		expect(out).toHaveLength(2);
		expect(out[0]).toMatchObject({ evidence: "捏", confidence: 1 });
		expect(out[0]?.box?.[2]).toBeCloseTo(0.1);
		expect(out[1]?.asset).toBe("kv");
	});
});
