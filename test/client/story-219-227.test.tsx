// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "../../src/client/App.tsx";
import { LaunchView } from "../../src/client/LaunchView.tsx";
import { MaterialImport } from "../../src/client/MaterialImport.tsx";
import { ReviewPanel } from "../../src/client/ReviewPanel.tsx";
import { ScanView } from "../../src/client/ScanView.tsx";
import { buildLaunchHandoff } from "../../src/client/handoff.ts";
import { assess } from "../../src/engine/creative/assess.ts";
import { demoCase } from "../../src/shared/demo.ts";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
	history.replaceState(null, "", "/");
});

function installFetch() {
	vi.stubGlobal(
		"fetch",
		vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
			const body = JSON.parse(String(init?.body ?? "{}")) as { demo?: { caseId?: string; variant?: string } };
			const demo = demoCase(body.demo?.caseId ?? "");
			const variant = body.demo?.variant === "localized" ? demo?.localized : demo?.original;
			return new Response(JSON.stringify({ signals: variant?.signals ?? [], source: "fixture" }), {
				status: 200,
				headers: { "Content-Type": "application/json" },
			});
		}),
	);
}

describe("first screen and risk story", () => {
	it("shows three markets, the demo boundary, and a cross-market label without using the dropdown", async () => {
		installFetch();
		const demo = demoCase("kr-kv");
		if (!demo) throw new Error("kr");
		const onMarket = (market: "KR" | "US" | "SG") => {
			rerender(
				<ScanView
					demo={demo}
					market={market}
					onMarketChange={onMarket}
					onImport={() => undefined}
					onRevise={() => undefined}
					onPlanLaunch={() => undefined}
				/>,
			);
		};
		const { rerender } = render(
			<ScanView demo={demo} market="KR" onMarketChange={onMarket} onImport={() => undefined} onRevise={() => undefined} onPlanLaunch={() => undefined} />,
		);
		expect(screen.getByText(/iPhone Air 主视觉/)).toBeTruthy();
		expect(screen.getByRole("button", { name: /韩国市场/ })).toBeTruthy();
		expect(screen.getByRole("button", { name: /美国市场/ })).toBeTruthy();
		expect(screen.getByRole("button", { name: /新加坡市场/ })).toBeTruthy();
		expect(screen.getByText(/示例焦点韩国/)).toBeTruthy();
		fireEvent.click(screen.getByRole("button", { name: /美国市场/ }));
		expect(await screen.findByText(/同批信号的跨市场规则评估/)).toBeTruthy();
		expect(screen.getByText(/不是对美国重新做了一次完整感知/)).toBeTruthy();
	});

	it("explains the selected risk and moves the text evidence without opening the dialog", () => {
		const demo = demoCase("kr-kv");
		if (!demo) throw new Error("kr");
		const result = assess(demo.original.signals, ["KR"]);
		const report = result.markets[0];
		if (!report) throw new Error("report");
		render(<ReviewPanel assets={demo.original.assets} signals={demo.original.signals} result={result} report={report} market="KR" />);
		const list = screen.getByLabelText("风险清单");
		expect(list.textContent).toContain("原因");
		expect(list.textContent).toContain("修改建议");
		expect(list.textContent).toContain("已核实");
		expect(list.textContent).toContain("不是法律禁令");
		expect(within(list).getByText("KR-G01")).toBeTruthy();
		expect(screen.queryByRole("dialog")).toBeNull();
		expect(document.querySelector(".annotation button")?.textContent).toContain("手势");
		expect(screen.getByText(/Apple 官网产品图/)).toBeTruthy();
	});
});

describe("theme what-if and planned week", () => {
	it("recomputes the same Ramadan week when the pork theme is removed and restored", () => {
		const demo = demoCase("sg-frame");
		if (!demo) throw new Error("sg");
		const result = assess(demo.original.signals, ["SG"]);
		const report = result.markets[0];
		if (!report) throw new Error("report");
		render(
			<LaunchView
				handoff={buildLaunchHandoff({
					segment: demo.segment,
					themes: result.themes,
					material: demo.title,
					report,
					origin: "fixture",
				})}
			/>,
		);
		const panel = screen.getByRole("region", { name: "主题与档期假设" });
		expect(panel.textContent).toContain("感知结果");
		expect(panel.textContent).toContain("猪肉或猪肉菜肴");
		expect(panel.textContent).toContain("斋月");
		expect(panel.textContent).toContain("SG-R02");
		expect(panel.textContent).toContain("sg-ramadan-2027");
		expect(panel.textContent).toContain("主题阻断");
		expect(panel.textContent).toContain("2027-02-08");

		fireEvent.click(within(panel).getByRole("button", { name: "去掉猪肉主题，重算同一周" }));
		expect(panel.textContent).toContain("未阻断");
		expect(panel.textContent).toContain("已修改");
		expect(panel.textContent).toContain("同一周由主题阻断变为未阻断");
		expect(panel.textContent).toContain("档期分没有变化");
		expect(within(panel).getByRole("button", { name: "恢复检测条件" })).toBeTruthy();
		const current = within(panel).getByText("当前模拟条件").parentElement?.textContent ?? "";
		expect(current).not.toContain("猪肉或猪肉菜肴");
		expect(within(panel).getByText("感知结果").parentElement?.textContent).toContain("猪肉或猪肉菜肴");

		fireEvent.click(within(panel).getByRole("button", { name: "恢复检测条件" }));
		expect(panel.textContent).toContain("主题阻断周");
		expect(panel.textContent).toContain("与感知结果一致");
	});

	it("says the schedule did not change when a theme cannot affect the scripted week", () => {
		render(<LaunchView />);
		fireEvent.click(screen.getByRole("button", { name: "排期条件" }));
		fireEvent.change(screen.getByLabelText("最早上线日期"), { target: { value: "2027-02-01" } });
		fireEvent.click(screen.getByRole("button", { name: "万圣节元素（南瓜、鬼怪、变装派对）" }));
		expect(screen.getByText("排期结果未变化")).toBeTruthy();
	});

	it("compares a planned week and updates the selected week explanation", () => {
		render(<LaunchView />);
		fireEvent.click(screen.getByRole("button", { name: "排期条件" }));
		fireEvent.change(screen.getByLabelText("最早上线日期"), { target: { value: "2027-02-01" } });
		const calendar = screen.getByRole("region", { name: "档期压力日历" });
		fireEvent.click(within(calendar).getByRole("button", { name: /新加坡 发布周起始 2027-02-08/ }));
		fireEvent.change(screen.getByLabelText("原定上线日期"), { target: { value: "2027-02-08" } });
		expect(screen.getByText(/建议保留原定周|建议调整原定周/)).toBeTruthy();
		const before = screen.getByLabelText("所选周解释").textContent;
		fireEvent.click(within(calendar).getByRole("button", { name: /新加坡 发布周起始 2027-02-15/ }));
		expect(screen.getByLabelText("所选周解释").textContent).not.toBe(before);
		expect(screen.getAllByText(/模型计算的档期压力指数/).length).toBeGreaterThan(0);
		expect(screen.queryByText(/注意力占用/)).toBeNull();

		fireEvent.click(screen.getByRole("button", { name: "加上猪肉主题，重算同一周" }));
		fireEvent.click(within(calendar).getByRole("button", { name: /新加坡 发布周起始 2027-02-08/ }));
		expect(screen.getByText("建议调整原定周")).toBeTruthy();
		expect(within(screen.getByLabelText("当前格图例")).getByText("主题阻断周").getAttribute("aria-current")).toBe("true");
	});
});

describe("expo booth principle visibility and shortcuts", () => {
	it("shows the 4-node architecture strip on WorkflowView and links directly to sg-frame", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
				const url = String(input);
				if (url.includes("/api/health")) {
					return new Response(JSON.stringify({ name: "ClearRun Global", scan: "offline" }), {
						status: 200,
						headers: { "Content-Type": "application/json" },
					});
				}
				const body = JSON.parse(String(init?.body ?? "{}")) as { demo?: { caseId?: string; variant?: string } };
				const demo = demoCase(body.demo?.caseId ?? "");
				const variant = body.demo?.variant === "localized" ? demo?.localized : demo?.original;
				return new Response(JSON.stringify({ signals: variant?.signals ?? [], source: "offline" }), {
					status: 200,
					headers: { "Content-Type": "application/json" },
				});
			}),
		);
		render(<App />);
		const arch = screen.getByRole("list", { name: "核心工作原理" });
		expect(arch.textContent).toContain("受控感知");
		expect(arch.textContent).toContain("确定性规则库");
		expect(arch.textContent).toContain("档期压力引擎");

		fireEvent.click(screen.getByRole("button", { name: /新加坡.*肉骨茶/ }));
		expect(new URL(location.href).searchParams.get("view")).toBe("creative");
		expect(await screen.findByRole("heading", { name: "多语言宣传片关键帧" })).toBeTruthy();
		expect((await screen.findAllByText(/桌上的肉骨茶/)).length).toBeGreaterThan(0);
	});

	it("surfaces the signal-to-rule trace and visible unmatched signals across markets", () => {
		const demo = demoCase("kr-kv");
		if (!demo) throw new Error("kr");
		const krResult = assess(demo.original.signals, ["KR"]);
		const { rerender } = render(
			<ReviewPanel assets={demo.original.assets} signals={demo.original.signals} result={krResult} report={krResult.markets[0]} market="KR" />,
		);
		const trace = screen.getByLabelText("信号到规则推理链");
		expect(trace.textContent).toContain("[vision] gesture.pinch");
		expect(trace.textContent).toContain("规则 KR-G01");

		const usResult = assess(demo.original.signals, ["US"]);
		rerender(
			<ReviewPanel assets={demo.original.assets} signals={demo.original.signals} result={usResult} report={usResult.markets[0]} market="US" />,
		);
		const unmatched = screen.getByLabelText("已识别但当前市场未命中规则的信号");
		expect(unmatched.textContent).toContain("gesture.pinch");
		expect(unmatched.textContent).toContain("美国规则库 0 命中");
	});

	it("exposes audience pills, planned week rank, and math breakdown without banned wording", () => {
		render(<LaunchView />);
		const audienceBar = screen.getByRole("group", { name: "目标受众快捷切换" });
		const devBtn = within(audienceBar).getByRole("button", { name: "开发者" });
		fireEvent.click(devBtn);
		expect(devBtn.getAttribute("aria-pressed")).toBe("true");

		fireEvent.change(screen.getByLabelText("原定上线日期"), { target: { value: "2026-11-23" } });
		expect(screen.getByText(/排第 \d+ 位/)).toBeTruthy();

		const breakdown = screen.getByText(/算法拆解/).closest("details");
		expect(breakdown?.textContent).toContain("LAUNCH_RUN");
		expect(screen.queryByText(/注意力占用/)).toBeNull();
	});

	it("fills live preset copy and submits a live scan from MaterialImport", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () =>
				new Response(
					JSON.stringify({
						signals: [{ signal: "claim.absolute_accuracy", asset: "copy", evidence: "100% accurate", confidence: 0.95 }],
						source: "model",
						model: "anthropic/claude-sonnet-5.5",
					}),
					{ status: 200, headers: { "Content-Type": "application/json" } },
				),
			),
		);
		const onResult = vi.fn();
		render(<MaterialImport market="KR" mode="live" demoId="kr-kv" onDemo={() => undefined} onClose={() => undefined} onResult={onResult} />);
		fireEvent.click(screen.getByRole("button", { name: /美区夸大宣称/ }));
		expect((screen.getByLabelText("目标市场") as HTMLSelectElement).value).toBe("US");
		expect((screen.getByPlaceholderText("粘贴广告语或发布稿") as HTMLTextAreaElement).value).toContain("100% accurate");

		fireEvent.click(screen.getByRole("button", { name: "开始预检" }));
		await vi.waitFor(() => expect(onResult).toHaveBeenCalled());
		expect(onResult.mock.calls[0]?.[1]).toBe("US");
	});
});
