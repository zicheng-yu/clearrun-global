import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { readKnowledge, renderKnowledge } from "../scripts/knowledge-lib.ts";
import { DEMO_CASES } from "../src/shared/demo.ts";
import { knowledge } from "../src/shared/knowledge.ts";
import { SIGNALS } from "../src/shared/signals.ts";

const root = join(import.meta.dirname, "..");

describe("knowledge base", () => {
	it("validates, and the generated module is in sync with the YAML", () => {
		const fresh = readKnowledge(join(root, "knowledge"));
		expect(readFileSync(join(root, "src/shared/knowledge.gen.ts"), "utf8")).toBe(renderKnowledge(fresh));
	});

	it("gives every verified case a source", () => {
		for (const c of knowledge.cases) expect(c.sources.length, c.id).toBeGreaterThan(0);
	});

	it("only blocks on signals some rule also explains", () => {
		for (const event of knowledge.calendar) {
			for (const id of event.rules) expect(knowledge.rules.some((r) => r.id === id), `${event.id} → ${id}`).toBe(true);
		}
	});

	it("uses only vocabulary signals in the demo fixtures, on assets that exist", () => {
		for (const demo of DEMO_CASES) {
			for (const variant of [demo.original, demo.localized]) {
				const assets = new Set(variant.assets.map((a) => a.id));
				for (const s of variant.signals) {
					expect(Object.hasOwn(SIGNALS, s.signal), `${demo.id}: ${s.signal}`).toBe(true);
					expect(assets.has(s.asset), `${demo.id}: ${s.asset}`).toBe(true);
				}
			}
		}
	});
});
