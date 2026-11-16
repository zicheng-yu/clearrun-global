import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
	DEMO_D1,
	DEMO_HOSTNAME,
	LIVE_D1_PLACEHOLDER,
	ORIGINAL_HOSTNAME,
	ORIGINAL_WORKER_NAME,
	WORKER_NAME,
	modeTarget,
} from "../src/shared/deploy-target.ts";

describe("deploy target", () => {
	it("keeps mock opt-in and points only that mode at the demo hostname and empty database", () => {
		const mock = modeTarget("mock");
		expect(mock.workerName).toBe(WORKER_NAME);
		expect(mock.workerName).not.toBe(ORIGINAL_WORKER_NAME);
		expect(mock.scanMode).toBe("mock");
		expect(mock.d1).toEqual(DEMO_D1);
		expect(mock.domains).toEqual([DEMO_HOSTNAME]);
		expect(mock.domains).not.toContain("clearrun-global.zichengyu.com");
		expect(mock.domains).not.toContain(ORIGINAL_HOSTNAME);
		expect(mock.requiresOpenRouterSecret).toBe(false);

		for (const mode of [undefined, "production", "development", "live"]) {
			const live = modeTarget(mode);
			expect(live.mock, mode ?? "undefined").toBe(false);
			expect(live.scanMode).toBe("live");
			expect(live.d1).toEqual(LIVE_D1_PLACEHOLDER);
			expect(live.d1.id).not.toBe(DEMO_D1.id);
			expect(live.domains).toEqual([]);
			expect(live.requiresOpenRouterSecret).toBe(true);
		}
	});

	it("does not hard-code the rejected hostname or the original worker into the cf config", () => {
		const source = readFileSync(new URL("../cloudflare.config.ts", import.meta.url), "utf8");
		expect(source).toContain("modeTarget");
		expect(source).not.toContain("clearrun-global.zichengyu.com");
		expect(source).not.toContain(ORIGINAL_HOSTNAME);
		expect(source).not.toContain("00000000-0000-4000-8000-000000000de0");
		expect(source).not.toMatch(/name:\s*"clearrun"/);
	});

	it("keeps the checked mock build pointed at the demo worker, database, and hostname", () => {
		const config = JSON.parse(readFileSync(new URL("../deploy/mock/output/v0/workers/default/worker.config.json", import.meta.url), "utf8")) as {
			name: string;
			domains?: string[];
			triggers?: unknown;
			env: Record<string, { type?: string; value?: string; id?: string; name?: string }>;
		};
		expect(config.name).toBe(WORKER_NAME);
		expect(config.domains).toEqual([DEMO_HOSTNAME]);
		expect(config.triggers).toBeUndefined();
		expect(config.env.SCAN_MODE).toEqual({ type: "text", value: "mock" });
		expect(config.env.DB).toMatchObject(DEMO_D1);
		expect(config.env.OPENROUTER_API_KEY).toBeUndefined();
		const manifest = readFileSync(new URL("../deploy/mock/manifest.sha256", import.meta.url), "utf8").trim().split("\n");
		expect(manifest.length).toBeGreaterThan(0);
		for (const line of manifest) {
			const [hash, file] = line.split(/\s+/, 2);
			const body = readFileSync(new URL("../deploy/mock/output/" + file, import.meta.url));
			expect(createHash("sha256").update(body).digest("hex"), file).toBe(hash);
			expect(body.includes(Buffer.from("OPENROUTER_API_KEY=")), file).toBe(false);
		}
	});
});
