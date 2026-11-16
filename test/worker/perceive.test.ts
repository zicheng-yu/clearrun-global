import { describe, expect, it } from "vitest";
import { checkAssets, parseSignalsReply, PERCEIVE_SYSTEM, PerceiveInputError } from "../../src/worker/perceive.ts";

describe("perception step", () => {
	it("lists every vocabulary signal in the prompt and asks the model not to judge", () => {
		expect(PERCEIVE_SYSTEM).toContain("- gesture.pinch [vision]");
		expect(PERCEIVE_SYSTEM).toContain("Do not judge");
	});

	it("parses JSON wrapped in code fences or prose", () => {
		const reply = 'Here you go:\n```json\n{"signals":[{"signal":"gesture.pinch","asset":"kv","evidence":"捏住手机","box":[0.5,0.3,0.3,0.5],"confidence":0.9}]}\n```';
		expect(parseSignalsReply(reply, ["kv"])).toEqual([{ signal: "gesture.pinch", asset: "kv", evidence: "捏住手机", box: [0.5, 0.3, 0.3, 0.5], confidence: 0.9 }]);
	});

	it("accepts an explicit empty result and rejects unreadable or unknown signals", () => {
		expect(parseSignalsReply('{"signals":[]}', ["kv"])).toEqual([]);
		for (const reply of [null, "no json here", "{broken", "{}", '{"signals":[{"signal":"unknown"}]}']) {
			expect(() => parseSignalsReply(reply, ["kv"])).toThrow("Invalid perception response");
		}
	});

	it("rejects bad assets before any model call", () => {
		expect(() => checkAssets([])).toThrow(PerceiveInputError);
		expect(() => checkAssets([{ id: "a", kind: "image", content: "https://example.com/x.png" }])).toThrow(PerceiveInputError);
		expect(() => checkAssets([{ id: "a", kind: "copy", content: "  " }])).toThrow(PerceiveInputError);
		expect(checkAssets([{ id: "a", kind: "copy", label: "文案", content: "Hello" }])).toEqual([{ id: "a", kind: "copy", label: "文案", content: "Hello" }]);
		expect(checkAssets([{ id: "img", kind: "image", content: "data:image/png;base64,iVBORw0KGgo=" }])[0]?.kind).toBe("image");
	});
});
