import { describe, expect, it } from "vitest";
import { knownScanSource, originCopy, preferScanSource } from "../src/client/origin.ts";
import { demoScanSource, modelAnswerMeta } from "../src/shared/scan-source.ts";

describe("scan source", () => {
	it("keeps live demo reads as fixtures and every other mode as offline", () => {
		expect(demoScanSource("live")).toBe("fixture");
		expect(demoScanSource("mock")).toBe("offline");
		expect(demoScanSource("production")).toBe("offline");
		expect(demoScanSource(undefined)).toBe("offline");
	});

	it("marks a different model id as a backup model without calling it offline", () => {
		expect(modelAnswerMeta("anthropic/claude-sonnet-5.5", "anthropic/claude-sonnet-5.5")).toEqual({
			model: "anthropic/claude-sonnet-5.5",
			fallbackModel: false,
		});
		expect(modelAnswerMeta("anthropic/claude-haiku-5.5", "anthropic/claude-sonnet-5.5")).toEqual({
			model: "anthropic/claude-haiku-5.5",
			fallbackModel: true,
		});
		expect(modelAnswerMeta("  ", "anthropic/claude-sonnet-5.5").fallbackModel).toBe(false);
	});

	it("never treats an unknown payload as a live model result", () => {
		expect(knownScanSource("model")).toBe("model");
		expect(knownScanSource("fixture")).toBe("fixture");
		expect(knownScanSource("offline")).toBe("offline");
		expect(knownScanSource(undefined)).toBe("fallback");
		expect(knownScanSource("live")).toBe("fallback");
	});

	it("prefers the more cautious source when two reads disagree", () => {
		expect(preferScanSource(["model", "fixture"])).toBe("fixture");
		expect(preferScanSource(["fixture", "offline"])).toBe("offline");
		expect(preferScanSource(["model", "fallback"])).toBe("fallback");
	});
});

describe("origin copy", () => {
	it("names preset, live, and offline results differently from the service banner", () => {
		expect(originCopy({ phase: "ready", source: "fixture" })).toMatchObject({
			label: "预置示例",
			detail: expect.stringContaining("预置示例结果"),
		});
		expect(originCopy({ phase: "ready", source: "model", model: "anthropic/claude-sonnet-5.5" }).detail).toContain("实时模型分析");
		expect(originCopy({ phase: "ready", source: "model" }).label).toBe("实时分析");
		expect(originCopy({ phase: "ready", source: "offline" })).toMatchObject({
			label: "离线演示",
			detail: expect.stringContaining("离线模拟"),
		});
		expect(originCopy({ phase: "ready", source: "offline" }).detail).toContain("不是实时分析");
	});

	it("labels backup models and failure fallbacks without pretending the primary model answered", () => {
		const backup = originCopy({ phase: "ready", source: "model", fallbackModel: true, model: "anthropic/claude-haiku-5.5" });
		expect(backup.label).toBe("实时分析");
		expect(backup.detail).toContain("备用模型");
		expect(backup.detail).toContain("不是离线演示");
		const failed = originCopy({ phase: "ready", source: "fallback" });
		expect(failed.label).toBe("检测回退");
		expect(failed.detail).toContain("失败回退");
		expect(originCopy({ phase: "error" }).label).toBe("检测失败");
		expect(originCopy({ phase: "pending" }).label).toBe("尚未检测");
		expect(originCopy({ phase: "ready" }).label).toBe("来源不明");
	});
});
