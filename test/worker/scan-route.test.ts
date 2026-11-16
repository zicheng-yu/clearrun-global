import { describe, expect, it } from "vitest";
import { demoCase } from "../../src/shared/demo.ts";
import { api } from "../../src/worker/index.ts";

const post = (body: unknown, env: Record<string, string>) =>
	api.request(
		"/api/scan",
		{ method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) },
		env,
	);

describe("scan route source", () => {
	it("returns preset signals as offline in mock mode and as fixture when live is configured", async () => {
		const demo = demoCase("sg-frame");
		if (!demo) throw new Error("sg");
		const request = { markets: ["SG"], demo: { caseId: "sg-frame", variant: "original" } };
		const offline = await post(request, { SCAN_MODE: "mock" });
		const live = await post(request, { SCAN_MODE: "live" });
		expect(offline.status).toBe(200);
		expect(live.status).toBe(200);
		const offlineBody = (await offline.json()) as { source: string; signals: unknown };
		const liveBody = (await live.json()) as { source: string; signals: unknown };
		expect(offlineBody.source).toBe("offline");
		expect(liveBody.source).toBe("fixture");
		expect(offlineBody.signals).toEqual(demo.original.signals);
		expect(liveBody.signals).toEqual(demo.original.signals);
		expect(JSON.stringify(offlineBody)).not.toContain("OPENROUTER");
	});

	it("does not turn a missing model into a live or empty green result", async () => {
		const response = await post(
			{ markets: ["US"], assets: [{ id: "copy", kind: "copy", label: "文案", content: "Hello from the test." }] },
			{ SCAN_MODE: "mock" },
		);
		expect(response.status).toBe(503);
		const body = (await response.json()) as { source?: string; signals?: unknown; error?: string };
		expect(body.error).toBe("offline");
		expect(body.source).toBeUndefined();
		expect(body.signals).toBeUndefined();
	});
});
