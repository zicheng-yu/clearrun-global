// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/client/App.tsx";
import { LaunchView } from "../../src/client/LaunchView.tsx";
import { MaterialImport } from "../../src/client/MaterialImport.tsx";
import { ScanView } from "../../src/client/ScanView.tsx";
import { marketStatusText, reviewOf } from "../../src/client/handoff.ts";
import { assess } from "../../src/engine/creative/assess.ts";
import type { DetectedSignal, ScanSource } from "../../src/shared/api.ts";
import { DEMO_CASES, demoCase, type DemoCase } from "../../src/shared/demo.ts";
import { MARKET_LABEL, type Market } from "../../src/shared/knowledge.ts";

function json(body: unknown, status = 200): Response {
	return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

function installFetch(scan: "live" | "offline", options?: { failScans?: boolean }) {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
			const url = String(input);
			if (url.includes("/api/health")) {
				return json({
					name: "ClearRun Global",
					scan,
					...(scan === "live" ? { model: "anthropic/claude-sonnet-5.5" } : {}),
				});
			}
			if (!url.includes("/api/scan")) return json({ message: "not found" }, 404);
			if (options?.failScans) return json({ error: "model_unavailable", message: "The perception model didn't answer." }, 502);
			const body = JSON.parse(String(init?.body ?? "{}")) as {
				demo?: { caseId?: string; variant?: string };
				assets?: unknown[];
			};
			if (body.assets) {
				return json({
					signals: [{ signal: "claim.absolute_accuracy", asset: "copy", evidence: "100% accurate", confidence: 0.95 }],
					source: "model",
					model: "anthropic/claude-sonnet-5.5",
				});
			}
			const demo = demoCase(body.demo?.caseId ?? "");
			if (!demo) return json({ error: "bad_request", message: "Unknown demo case" }, 400);
			const variant = body.demo?.variant === "localized" ? demo.localized : demo.original;
			const source: ScanSource = scan === "live" ? "fixture" : "offline";
			return json({ signals: variant.signals, source });
		}),
	);
}

async function settle(demoId: string, market: Market, variant: "original" | "localized" = "original") {
	const demo = demoCase(demoId);
	if (!demo) throw new Error(demoId);
	const report = assess(demo[variant].signals, [market]).markets[0];
	if (!report) throw new Error("report");
	const list = await screen.findByLabelText("风险清单");
	await waitFor(() => {
		if (report.findings.length === 0) expect(list.textContent).toContain("未命中" + MARKET_LABEL[market]);
		else expect(list.querySelectorAll(".issue-row")).toHaveLength(report.findings.length);
	});
	for (const finding of report.findings) {
		expect(list.textContent).toContain(finding.rule.id);
		const evidence = finding.signals[0]?.evidence;
		if (evidence) expect(list.textContent).toContain(evidence);
	}
	expect(document.querySelector(".score-number strong")?.textContent).toBe(String(report.score));
	expect((screen.getByLabelText("目标市场") as HTMLSelectElement).value).toBe(market);
	return report;
}

beforeEach(() => {
	history.replaceState(null, "", "/");
});

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

describe("example market sync", () => {
	it("starts on WorkflowView at /, then follows each example focus and keeps a market the user picks afterwards", async () => {
		installFetch("live");
		render(<App />);
		expect(screen.getByRole("heading", { name: "出海宣发预检" })).toBeTruthy();
		expect(new URL(location.href).searchParams.get("view")).toBeNull();
		fireEvent.click(screen.getByRole("button", { name: "素材预检" }));
		expect(new URL(location.href).searchParams.get("view")).toBe("creative");
		await settle("kr-kv", "KR");
		expect(screen.getByLabelText("本次检测来源：预置示例")).toBeTruthy();
		expect(screen.queryByText("实时检测")).toBeNull();
		expect(screen.getByText("服务可用")).toBeTruthy();
		expect(screen.getByRole("button", { name: "比较原版与修订示例" })).toBeTruthy();
		expect(screen.queryByRole("button", { name: "对照修订版" })).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "美国宣称文案" }));
		const us = await settle("us-copy", "US");
		expect(us.findings.length).toBeGreaterThan(0);
		expect(screen.getByLabelText("本次检测来源：预置示例")).toBeTruthy();

		fireEvent.change(screen.getByLabelText("目标市场"), { target: { value: "KR" } });
		await settle("us-copy", "KR");
		expect((screen.getByLabelText("目标市场") as HTMLSelectElement).value).toBe("KR");

		fireEvent.click(screen.getByRole("button", { name: "美国宣称文案" }));
		await settle("us-copy", "US");

		fireEvent.click(screen.getByRole("button", { name: "比较原版与修订示例" }));
		const board = await screen.findByRole("region", { name: "原版与修订示例对照" });
		expect(board.textContent).toContain("项已知风险");
		expect(board.textContent).toContain("项已命中风险");
		expect(board.textContent).toContain("不是保证通过");
		expect(board.textContent).not.toMatch(/100% 通过/);
		expect(within(board).getByRole("heading", { name: /原版/ })).toBeTruthy();
		expect(within(board).getByRole("heading", { name: /本地化修订示例/ })).toBeTruthy();
		expect(screen.getByLabelText("本次检测来源：预置示例")).toBeTruthy();
		expect(screen.queryByLabelText("本次检测来源：实时分析")).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "新加坡宣传片" }));
		await settle("sg-frame", "SG");
		expect(screen.getByRole("button", { name: "初版" }).getAttribute("aria-pressed")).toBe("true");

		fireEvent.change(screen.getByLabelText("目标市场"), { target: { value: "US" } });
		await settle("sg-frame", "US");
		expect((screen.getByLabelText("目标市场") as HTMLSelectElement).value).toBe("US");
	});

	it("lets the import dialog move to an example focus and then honor a different market", async () => {
		installFetch("offline");
		render(<App />);
		fireEvent.click(screen.getByRole("button", { name: "素材预检" }));
		await screen.findByLabelText("本次检测来源：离线演示");
		fireEvent.click(screen.getByRole("button", { name: "新建预检" }));
		const dialog = await screen.findByRole("dialog", { name: "新建素材预检" });
		fireEvent.click(within(dialog).getByRole("radio", { name: "产品发布文案与用户推荐语" }));
		const select = within(dialog).getByLabelText("目标市场") as HTMLSelectElement;
		expect(select.value).toBe("US");
		fireEvent.change(select, { target: { value: "KR" } });
		fireEvent.click(within(dialog).getByRole("button", { name: "开始示例预检" }));
		await settle("us-copy", "KR");
		expect(screen.getAllByText("离线演示").length).toBeGreaterThan(0);
		expect(screen.queryByLabelText("本次检测来源：实时分析")).toBeNull();
		expect(screen.queryByText("实时检测")).toBeNull();
	});
});

describe("result origin", () => {
	it("shows a failed scan as a failure and recovers without inventing a live result", async () => {
		installFetch("live", { failScans: true });
		render(<App />);
		fireEvent.click(screen.getByRole("button", { name: "素材预检" }));
		expect(await screen.findByLabelText("本次检测来源：检测失败")).toBeTruthy();
		expect(screen.getAllByText(/没有可用结论/).length).toBeGreaterThan(0);
		expect(screen.queryByLabelText("本次检测来源：实时分析")).toBeNull();
		expect(document.querySelector(".score-number")).toBeNull();

		installFetch("live");
		fireEvent.click(screen.getByRole("button", { name: "重试" }));
		await settle("kr-kv", "KR");
		expect(screen.getByLabelText("本次检测来源：预置示例")).toBeTruthy();
	});

	it("labels an uploaded model result, a backup model, and a failure fallback separately", () => {
		const own = (source: ScanSource, extra?: { model?: string; fallbackModel?: boolean }) => ({
			title: "notes.txt",
			market: "US" as const,
			assets: [{ id: "copy", kind: "copy" as const, label: "文案", content: "100% accurate" }],
			signals: [{ signal: "claim.absolute_accuracy", asset: "copy", evidence: "100% accurate", confidence: 0.95 }] satisfies DetectedSignal[],
			source,
			...extra,
		});
		const props = {
			demo: DEMO_CASES[1] as DemoCase,
			market: "US" as const,
			onMarketChange: () => undefined,
			onImport: () => undefined,
			onRevise: () => undefined,
			onPlanLaunch: () => undefined,
		};
		const { rerender } = render(<ScanView {...props} own={own("model", { model: "anthropic/claude-sonnet-5.5" })} />);
		expect(screen.getByLabelText("本次检测来源：实时分析")).toBeTruthy();
		expect(screen.getByText(/实时模型分析/)).toBeTruthy();

		rerender(<ScanView {...props} own={own("model", { model: "anthropic/claude-haiku-5.5", fallbackModel: true })} />);
		expect(screen.getByText(/备用模型/)).toBeTruthy();
		expect(screen.queryByLabelText("本次检测来源：离线演示")).toBeNull();

		rerender(<ScanView {...props} own={own("fallback")} />);
		expect(screen.getByLabelText("本次检测来源：检测回退")).toBeTruthy();
		expect(screen.queryByLabelText("本次检测来源：实时分析")).toBeNull();
	});

	it("stores the scan source from a real upload instead of dropping it", async () => {
		installFetch("live");
		const onResult = vi.fn();
		render(<MaterialImport market="US" mode="live" demoId="us-copy" onDemo={() => undefined} onClose={() => undefined} onResult={onResult} />);
		fireEvent.change(await screen.findByPlaceholderText("粘贴广告语或发布稿"), { target: { value: "100% accurate" } });
		fireEvent.click(screen.getByRole("button", { name: "开始预检" }));
		await screen.findByRole("button", { name: "开始预检" });
		await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
		expect(onResult.mock.calls[0]?.[0]).toMatchObject({ source: "model", market: "US", model: "anthropic/claude-sonnet-5.5" });
		expect(onResult.mock.calls[0]?.[1]).toBe("US");
	});
});

describe("precheck to schedule", () => {
	it("keeps Korea's remaining risks, adds unscanned markets, and returns to the same material", async () => {
		installFetch("live");
		render(<App />);
		fireEvent.click(screen.getByRole("button", { name: "素材预检" }));
		const report = await settle("kr-kv", "KR");
		const review = reviewOf(report);
		fireEvent.click(screen.getByRole("button", { name: "查看发布排期" }));
		expect(await screen.findByText(marketStatusText("KR", review, true))).toBeTruthy();
		expect(screen.getByText(marketStatusText("US", undefined, false))).toBeTruthy();
		expect(screen.getByText(marketStatusText("SG", undefined, false))).toBeTruthy();
		const bridge = screen.getByRole("region", { name: "素材预检与上线市场" });
		expect(within(bridge).getByRole("button", { name: "返回修改素材" })).toBeTruthy();
		expect(within(bridge).getByLabelText("本次检测来源：预置示例")).toBeTruthy();
		expect(screen.queryByText(/风险全消除/)).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "添加美国，尚未做素材预检" }));
		fireEvent.click(screen.getByRole("button", { name: "添加新加坡，尚未做素材预检" }));
		expect(screen.getByText(marketStatusText("US", undefined, true))).toBeTruthy();
		expect(screen.getByText(marketStatusText("SG", undefined, true))).toBeTruthy();
		expect(screen.getByText(marketStatusText("KR", review, true))).toBeTruthy();
		const rollout = screen.getByLabelText("推荐发布周");
		expect(rollout.textContent).toContain("韩国");
		expect(rollout.textContent).toContain("美国");
		expect(rollout.textContent).toContain("新加坡");

		fireEvent.click(screen.getByRole("button", { name: "返回修改素材" }));
		await settle("kr-kv", "KR");
		expect(new URL(location.href).searchParams.get("view")).toBe("creative");
		expect(screen.getByRole("heading", { name: "iPhone Air 官网主视觉" })).toBeTruthy();
	});

	it("opens WorkflowView case shortcuts and passes the 2027-01-18 Singapore handoff", async () => {
		installFetch("offline");
		render(<App />);
		fireEvent.click(screen.getByRole("button", { name: /韩国.*iPhone Air/ }));
		await settle("kr-kv", "KR");
		expect(new URL(location.href).searchParams.get("view")).toBe("creative");

		fireEvent.click(screen.getByRole("button", { name: "宣发流程" }));
		expect(new URL(location.href).searchParams.get("view")).toBeNull();
		expect(screen.getByRole("heading", { name: "出海宣发预检" })).toBeTruthy();

		fireEvent.click(screen.getByRole("button", { name: /新加坡.*农历新年/ }));
		expect(new URL(location.href).searchParams.get("view")).toBe("launch");
		expect(screen.getByText("春节前消费产品发布")).toBeTruthy();
		expect(screen.getByText("2027-01-18")).toBeTruthy();
		expect(screen.getByText(marketStatusText("US", undefined, true))).toBeTruthy();
		expect(screen.getByText(marketStatusText("SG", undefined, true))).toBeTruthy();
		expect(screen.getByText(marketStatusText("KR", undefined, false))).toBeTruthy();
	});

	it("does not describe an unreviewed calendar as already checked", () => {
		render(<LaunchView />);
		expect(screen.getByText(marketStatusText("US", undefined, true))).toBeTruthy();
		expect(screen.getByText(marketStatusText("SG", undefined, true))).toBeTruthy();
		expect(screen.getByText(marketStatusText("KR", undefined, true))).toBeTruthy();
		expect(screen.queryByText(/已预检/)).toBeNull();
		expect(screen.queryByText(/没有剩余风险/)).toBeNull();
		expect(screen.queryByRole("button", { name: "返回修改素材" })).toBeNull();
	});
});
