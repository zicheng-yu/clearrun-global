import { describe, expect, it } from "vitest";
import { cleanSignals } from "../src/engine/creative/assess.ts";
import { highlightParts, signalNeedles } from "../src/client/ui.tsx";
import { DEMO_CASES } from "../src/shared/demo.ts";

describe("text location", () => {
	it("highlights exact quotes and refuses a paraphrase that is not a substring", () => {
		const page = "没有写明用户数据存储在哪个地区、是否跨境传输。";
		const paraphrase = "没有写明数据存储地区与跨境传输";
		expect(page.includes(paraphrase)).toBe(false);
		const missed = highlightParts(page, [paraphrase]);
		expect(missed.missed).toEqual([paraphrase]);
		expect(missed.parts.every((part) => !part.mark)).toBe(true);

		const quote = "没有写明用户数据存储在哪个地区、是否跨境传输";
		const hit = highlightParts(page, [quote]);
		expect(hit.missed).toEqual([]);
		expect(hit.parts.filter((part) => part.mark).map((part) => part.text)).toEqual([quote]);
	});

	it("uses quotes instead of a shorter evidence string, including several fragments", () => {
		const copy = "“Mira wrote my wedding vows in 30 seconds.” — Jamie R., Austin";
		const needles = signalNeedles({ evidence: "Mira wrote my wedding vows", quotes: ["Mira wrote my wedding vows in 30 seconds."] });
		expect(highlightParts(copy, needles).parts.filter((part) => part.mark).map((part) => part.text)).toEqual(["Mira wrote my wedding vows in 30 seconds."]);

		const page = "首屏的三条用户推荐语由 AI 生成，用来“示意效果”，不是真实用户。";
		const parts = highlightParts(page, ["用户推荐语由 AI 生成", "不是真实用户"]);
		expect(parts.missed).toEqual([]);
		expect(parts.parts.filter((part) => part.mark).map((part) => part.text)).toEqual(["用户推荐语由 AI 生成", "不是真实用户"]);
	});

	it("locates every preset text signal, and keeps image signals on a box", () => {
		for (const demo of DEMO_CASES) {
			for (const variant of [demo.original, demo.localized]) {
				for (const signal of variant.signals) {
					const asset = variant.assets.find((item) => item.id === signal.asset);
					expect(asset, demo.id + " " + signal.signal).toBeTruthy();
					if (!asset || asset.kind === "image") {
						expect(signal.box, demo.id + " " + signal.signal).toBeTruthy();
						continue;
					}
					const located = highlightParts(asset.content, signalNeedles(signal));
					expect(located.missed, demo.id + " " + signal.signal).toEqual([]);
					expect(located.parts.some((part) => part.mark), demo.id + " " + signal.signal).toBe(true);
				}
			}
		}
	});

	it("keeps exact quotes when cleaning model output", () => {
		const [signal] = cleanSignals(
			[{ signal: "privacy.no_data_residency", asset: "page", evidence: "意译", quotes: [" 没有写明用户数据存储在哪个地区、是否跨境传输 ", ""], confidence: 0.9 }],
			["page"],
		);
		expect(signal?.quotes).toEqual(["没有写明用户数据存储在哪个地区、是否跨境传输"]);
	});
});
