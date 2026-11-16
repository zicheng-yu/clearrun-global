import type { MarketAssessment } from "../engine/creative/assess.ts";
import type { ScanSource } from "../shared/api.ts";
import { MARKET_LABEL, type Market, type Segment } from "../shared/knowledge.ts";
import type { SignalId } from "../shared/signals.ts";

/** One market that this precheck actually assessed. Counts come from that assessment's findings. */
export interface ReviewedMarket {
	market: Market;
	level: MarketAssessment["level"];
	score: number;
	remaining: number;
	high: number;
	medium: number;
	low: number;
}

export interface LaunchHandoff {
	/** Markets to schedule first. Only the reviewed market is included until the user adds more. */
	markets: Market[];
	segment: Segment;
	themes: SignalId[];
	/** Material title, including the variant label for a demo. */
	source: string;
	reviewed: ReviewedMarket[];
	origin: ScanSource;
	model?: string;
	fallbackModel?: boolean;
}

export function reviewOf(report: MarketAssessment): ReviewedMarket {
	const high = report.findings.filter((finding) => finding.rule.severity === "high").length;
	const medium = report.findings.filter((finding) => finding.rule.severity === "medium").length;
	const low = report.findings.length - high - medium;
	return { market: report.market, level: report.level, score: report.score, remaining: report.findings.length, high, medium, low };
}

export function buildLaunchHandoff(input: {
	segment: Segment;
	themes: SignalId[];
	material: string;
	report: MarketAssessment;
	origin: ScanSource;
	model?: string;
	fallbackModel?: boolean;
}): LaunchHandoff {
	const reviewed = reviewOf(input.report);
	return {
		markets: [reviewed.market],
		segment: input.segment,
		themes: input.themes,
		source: input.material,
		reviewed: [reviewed],
		origin: input.origin,
		...(input.model ? { model: input.model } : {}),
		...(input.fallbackModel ? { fallbackModel: true } : {}),
	};
}

export function reviewedRiskText(review: ReviewedMarket): string {
	const name = MARKET_LABEL[review.market];
	if (review.remaining === 0) {
		return `${name}：已预检，已命中 0 项，待处理 0 项。当前规则未命中已知风险，预检评分 ${review.score}。这不是合规认证。`;
	}
	const parts = [
		review.high ? `${review.high} 项高风险` : "",
		review.medium ? `${review.medium} 项需评估` : "",
		review.low ? `${review.low} 项注意` : "",
	].filter(Boolean);
	return `${name}：已预检，已命中 ${review.remaining} 项，待处理 ${review.remaining} 项（${parts.join("，")}），预检评分 ${review.score}`;
}

/** Markets with no assessment stay unscanned, including when they are added to the calendar. */
export function marketStatusText(market: Market, review: ReviewedMarket | undefined, scheduled: boolean): string {
	if (!review) {
		return `${MARKET_LABEL[market]}：尚未做素材预检${scheduled ? "，当前只给出档期建议，不代表审核通过" : "，未加入本次排期"}`;
	}
	return reviewedRiskText(review) + (scheduled ? "，已加入本次排期" : "，未加入本次排期");
}

export function marketActionLabel(market: Market, included: boolean, only: boolean, reviewed: boolean): string {
	const action = !included ? "添加" : only ? "已加入" : "移出排期";
	return `${action}${MARKET_LABEL[market]}，${reviewed ? "已做素材预检" : "尚未做素材预检"}`;
}
