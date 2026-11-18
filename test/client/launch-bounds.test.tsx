// @vitest-environment happy-dom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LaunchView } from "../../src/client/LaunchView.tsx";
import { ReviewPanel } from "../../src/client/ReviewPanel.tsx";
import { Highlight } from "../../src/client/ui.tsx";
import { assess } from "../../src/engine/creative/assess.ts";
import { demoCase } from "../../src/shared/demo.ts";

afterEach(() => cleanup());

function openDate(value: string) {
	render(<LaunchView />);
	fireEvent.click(screen.getByRole("button", { name: "排期条件" }));
	fireEvent.change(screen.getByLabelText("最早上线日期"), { target: { value } });
}

describe("launch bounds in the calendar", () => {
	it("shows 2026-12-02 as the earliest launch day in the week that starts on 2026-11-30", () => {
		openDate("2026-12-02");
		expect(screen.getByText(/最早上线日是 2026-12-02/)).toBeTruthy();
		expect(screen.getByText(/推荐日是 2026-12-02/)).toBeTruthy();
		const recommended = screen.getAllByRole("button", { name: /最早可上线 \d{4}-\d{2}-\d{2}/ });
		expect(recommended.length).toBeGreaterThan(0);
		for (const button of recommended) {
			const day = button.getAttribute("aria-label")?.match(/最早可上线 (\d{4}-\d{2}-\d{2})/)?.[1];
			expect(day && day >= "2026-12-02").toBe(true);
		}
		expect(screen.queryByRole("button", { name: /最早可上线 2026-11-30/ })).toBeNull();
	});

	it("does not present 2020-01-01 as a verified full-score week", () => {
		openDate("2020-01-01");
		expect(screen.getAllByText(/不足以评估/).length).toBeGreaterThan(0);
		expect(screen.queryByText("档期分 100")).toBeNull();
		expect(screen.getAllByText(/当前条件下没有可推荐的周/).length).toBe(3);
	});
});

describe("preset evidence on the page", () => {
	it("highlights the Korea storage sentence and the US testimonial in the original text", () => {
		const kr = demoCase("kr-kv");
		if (!kr) throw new Error("kr");
		const krResult = assess(kr.original.signals, ["KR"]);
		const { unmount } = render(
			<ReviewPanel assets={kr.original.assets} signals={kr.original.signals} result={krResult} report={krResult.markets[0]} market="KR" />,
		);
		expect(screen.getByRole("button", { name: /捏住机身一端/ })).toBeTruthy();
		expect(screen.getByText(/Apple 官网产品图/)).toBeTruthy();
		expect(screen.queryByText("隐私政策只有英文版")).toBeNull();
		unmount();

		const us = demoCase("us-copy");
		if (!us) throw new Error("us");
		const usResult = assess(us.original.signals, ["US"]);
		render(<ReviewPanel assets={us.original.assets} signals={us.original.signals} result={usResult} report={usResult.markets[0]} market="US" />);
		fireEvent.click(screen.getByRole("button", { name: /Mira wrote my wedding vows/ }));
		expect(document.querySelector("mark")?.textContent).toBe("Mira wrote my wedding vows in 30 seconds.");
		fireEvent.click(screen.getByRole("button", { name: /推荐语由 AI 生成/ }));
		const marks = [...document.querySelectorAll("mark")].map((mark) => mark.textContent);
		expect(marks).toEqual(["用户推荐语由 AI 生成", "不是真实用户"]);
	});

	it("says when a needle is not in the text and does not draw a mark", () => {
		render(<Highlight text="原文没有这段" needles={["意译证据不是子串"]} />);
		expect(screen.getByText("无法在当前文本中精确定位")).toBeTruthy();
		expect(document.querySelector("mark")).toBeNull();
	});
});
