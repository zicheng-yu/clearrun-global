import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DEMO_CASES } from "../src/shared/demo.ts";

const branded = ["b-hero.svg", "b-hero-fixed.svg", "c-frame.svg", "c-frame-fixed.svg", "a-kv-global.svg", "a-kv-kr.svg"];

describe("demo material brand", () => {
	it("keeps original and revised attachments paired by id", () => {
		for (const demo of DEMO_CASES) {
			expect(demo.original.assets.map((asset) => asset.id)).toEqual(demo.localized.assets.map((asset) => asset.id));
			expect(demo.original.assets.map((asset) => asset.kind)).toEqual(demo.localized.assets.map((asset) => asset.kind));
		}
	});

	it("marks the shared Mira demo art as illustrative, not a real advertisement", () => {
		for (const name of branded) {
			const svg = readFileSync(new URL("../public/demo/" + name, import.meta.url), "utf8");
			expect(svg).toContain("Mira Agent");
			expect(svg).toContain("演示素材");
			expect(svg).not.toContain("Georgia");
			expect(svg).toContain("#140e3a");
		}
	});
});
