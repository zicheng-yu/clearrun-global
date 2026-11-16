// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LaunchView } from "../../src/client/LaunchView.tsx";
import { ReviewPanel } from "../../src/client/ReviewPanel.tsx";
import { ScanView } from "../../src/client/ScanView.tsx";
import { buildLaunchHandoff } from "../../src/client/handoff.ts";
import { assess } from "../../src/engine/creative/assess.ts";
import { demoCase } from "../../src/shared/demo.ts";

afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
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
		expect(screen.getByText(/Mira Agent 是被检查的演示项目/)).toBeTruthy();
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

		fireEvent.click(screen.getByRole("button", { name: /隐私政策只有英文版/ }));
		expect(document.querySelector("mark")?.textContent).toContain("隐私政策只有英文版");
		expect(screen.queryByRole("dialog")).toBeNull();
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
