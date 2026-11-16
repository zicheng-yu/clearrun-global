import { useEffect, useState, type ReactNode } from "react";
import { assess, type MarketAssessment } from "../engine/creative/assess.ts";
import type { DetectedSignal } from "../shared/api.ts";
import { PRODUCT, type DemoCase } from "../shared/demo.ts";
import { MARKET_LABEL, type Market, type Segment } from "../shared/knowledge.ts";
import type { SignalId } from "../shared/signals.ts";
import { scan } from "./api.ts";
import { Icon } from "./Icon.tsx";
import type { UploadedMaterial } from "./MaterialImport.tsx";
import { ReviewPanel } from "./ReviewPanel.tsx";
import { LEVEL_LABEL, MarketSelect } from "./ui.tsx";

export interface LaunchHandoff {
	markets: Market[];
	segment: Segment;
	themes: SignalId[];
	source: string;
}

type Variant = "original" | "localized";
interface FixtureState {
	scope: string;
	signals?: Record<Variant, DetectedSignal[]>;
	error?: string;
}

interface VerdictProps {
	report?: MarketAssessment;
	before?: MarketAssessment;
	market: Market;
	error?: string;
	retry: () => void;
	children: ReactNode;
}

function Verdict({ report, before, market, error, retry, children }: VerdictProps) {
	if (!report) {
		return (
			<div className="verdict pending" role="status">
				<Icon name={error ? "alert" : "scan"} size={20} />
				<div>
					<div className="minor-label">{MARKET_LABEL[market]} · 预检结论</div>
					<p>{error || "正在检查素材…"}</p>
				</div>
				{error && (
					<button className="button" onClick={retry}>
						重试
					</button>
				)}
			</div>
		);
	}
	const high = report.findings.filter((f) => f.rule.severity === "high").length;
	const medium = report.findings.filter((f) => f.rule.severity === "medium").length;
	const low = report.findings.length - high - medium;
	return (
		<section className={"verdict " + report.level} aria-label="预检结论" aria-live="polite">
			<div className="decision">
				<div className="decision-icon">
					<Icon name={report.level === "green" ? "shield" : "alert"} size={22} />
				</div>
				<div>
					<p className="minor-label">{MARKET_LABEL[market]}市场 · 预检结论</p>
					<h2>{report.level === "green" && low ? "可考虑使用，留意下列提示" : LEVEL_LABEL[report.level]}</h2>
				</div>
			</div>
			<div className="risk-breakdown">
				<p className="minor-label">命中风险</p>
				<div>
					{!!high && (
						<span>
							<i className="dot high" />
							{high} 项高风险
						</span>
					)}
					{!!medium && (
						<span>
							<i className="dot medium" />
							{medium} 项需评估
						</span>
					)}
					{!!low && (
						<span>
							<i className="dot low" />
							{low} 项注意
						</span>
					)}
					{!report.findings.length && (
						<span>
							<i className="dot green" />0 项
						</span>
					)}
				</div>
			</div>
			<div className="score">
				<div className="minor-label">预检分</div>
				<div className="score-number">
					{before && before.score !== report.score && <small>{before.score} → </small>}
					<strong>{report.score}</strong>
					<span> / 100</span>
				</div>
			</div>
			<div className="verdict-actions">{children}</div>
		</section>
	);
}

interface ScanProps {
	demo: DemoCase;
	own?: UploadedMaterial;
	market: Market;
	onMarketChange: (market: Market) => void;
	onImport: () => void;
	onRevise: () => void;
	onPlanLaunch: (handoff: LaunchHandoff) => void;
}

export function ScanView({ demo, own, market, onMarketChange, onImport, onRevise, onPlanLaunch }: ScanProps) {
	const [variant, setVariant] = useState<Variant>("original");
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<FixtureState>();
	const scope = [demo.id, market, attempt].join("/");
	useEffect(() => {
		if (own) return;
		const controller = new AbortController();
		const fetchVariant = (v: Variant) => scan({ markets: [market], demo: { caseId: demo.id, variant: v } }, controller.signal);
		Promise.all([fetchVariant("original"), fetchVariant("localized")])
			.then(([original, localized]) => {
				if (!controller.signal.aborted) setState({ scope, signals: { original: original.signals, localized: localized.signals } });
			})
			.catch((e: unknown) => {
				if (!controller.signal.aborted) setState({ scope, error: e instanceof Error ? e.message : "读取检测结果失败。" });
			});
		return () => controller.abort();
	}, [demo.id, market, scope, own]);

	const fixture = state?.scope === scope ? state : undefined;
	const signals = own?.signals ?? fixture?.signals?.[variant];
	const result = signals && assess(signals, [market]);
	const report = result?.markets[0];
	const before = !own && variant === "localized" && fixture?.signals ? assess(fixture.signals.original, [market]).markets[0] : undefined;
	const assets = own?.assets ?? demo[variant].assets;
	const title = own?.title ?? demo.title;
	const showRevision = report && report.level !== "green" && (Boolean(own) || variant === "original");
	const plan = () => {
		if (!result) return;
		onPlanLaunch({
			markets: [market],
			segment: own ? "prosumer" : demo.segment,
			themes: result.themes,
			source: own?.title ?? title + "（" + demo[variant].label + "）",
		});
	};
	return (
		<div className="workspace-page">
			<div className="page-heading">
				<div className="heading-copy">
					<p className="context-line">
						<Icon name={own ? "upload" : "stack"} size={14} />
						{own ? "本次上传" : PRODUCT}
						<span className="context-divider" />
						{own ? "自有素材" : "示例素材"}
					</p>
					<h1>{title}</h1>
				</div>
				<button className="button" onClick={onImport}>
					<Icon name="plus" />
					新建预检
				</button>
			</div>
			<div className="review-toolbar">
				<div className="review-properties">
					<MarketSelect value={market} onChange={onMarketChange} />
					{!own && (
						<div className="property">
							<span>版本</span>
							<div className="segmented" role="group" aria-label="素材版本">
								{(["original", "localized"] as const).map((v) => (
									<button key={v} aria-pressed={variant === v} onClick={() => setVariant(v)}>
										{demo[v].label}
									</button>
								))}
							</div>
						</div>
					)}
				</div>
			</div>
			<Verdict report={report} before={before} market={market} error={fixture?.error} retry={() => setAttempt((n) => n + 1)}>
				{showRevision && (
					<button className="button primary" onClick={own ? onRevise : () => setVariant("localized")}>
						<Icon name="version" size={15} />
						{own ? "修改并复检" : "对照修订版"}
						<Icon name="arrow" size={14} />
					</button>
				)}
				<button className={showRevision ? "plan-link" : "button primary"} onClick={plan}>
					查看发布排期
					<Icon name="arrow" size={14} />
				</button>
				{own && !showRevision && (
					<button className="plan-link" onClick={onRevise}>
						编辑并复检
					</button>
				)}
			</Verdict>
			<ReviewPanel
				key={market + "/" + variant}
				assets={assets}
				signals={signals ?? []}
				before={before}
				report={report}
				result={result}
				market={market}
				error={fixture?.error}
			/>
		</div>
	);
}
