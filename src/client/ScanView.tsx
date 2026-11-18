import { useEffect, useState, type ReactNode } from "react";
import { assess, type MarketAssessment } from "../engine/creative/assess.ts";
import type { DetectedSignal, ScanSource } from "../shared/api.ts";
import { PRODUCT, type DemoCase } from "../shared/demo.ts";
import { MARKET_LABEL, type Market } from "../shared/knowledge.ts";
import { scan } from "./api.ts";
import { buildLaunchHandoff, type LaunchHandoff } from "./handoff.ts";
import { Icon } from "./Icon.tsx";
import type { UploadedMaterial } from "./MaterialImport.tsx";
import { OriginNote } from "./OriginNote.tsx";
import { knownScanSource, preferScanSource } from "./origin.ts";
import { CompareBoard, ReviewPanel } from "./ReviewPanel.tsx";
import { LEVEL_LABEL, MarketSelect } from "./ui.tsx";

export type { LaunchHandoff };

type Variant = "original" | "localized";
interface FixtureState {
	scope: string;
	signals?: Record<Variant, DetectedSignal[]>;
	source?: ScanSource;
	model?: string;
	fallbackModel?: boolean;
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

function Verdict({ report, before, market, error, retry, origin, children }: VerdictProps & { origin: ReactNode }) {
	if (!report) {
		return (
			<div className="verdict pending" role="status">
				<Icon name={error ? "alert" : "scan"} size={20} />
				<div>
					<div className="minor-label">{MARKET_LABEL[market]} · 预检结论</div>
					{origin}
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
	const hits = report.findings.length;
	const headline = hits === 0 ? "当前规则未命中已知风险" : report.level === "green" && low ? "可考虑使用，留意下列提示" : LEVEL_LABEL[report.level];
	return (
		<section className={"verdict " + report.level} aria-label="预检结论" aria-live="polite">
			<div className="decision">
				<div className="decision-icon">
					<Icon name={report.level === "green" ? "shield" : "alert"} size={22} />
				</div>
				<div>
					<p className="minor-label">{MARKET_LABEL[market]}市场 · 预检结论</p>
					<h2>{headline}</h2>
					<p className="hit-line">
						已命中 {hits} 项 · 待处理 {hits} 项
					</p>
					{origin}
				</div>
			</div>
			<div className="risk-breakdown">
				<p className="minor-label">严重度</p>
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
					{!hits && (
						<span>
							<i className="dot green" />
							当前规则未命中
						</span>
					)}
				</div>
			</div>
			<div className="score">
				<div className="minor-label">基于当前知识库规则的预检评分</div>
				<div className="score-number">
					{before && before.score !== report.score && <small>{before.score} → </small>}
					<strong>{report.score}</strong>
					<span> / 100</span>
				</div>
				<p className="score-note">
					{report.score === 100 ? "100 表示当前规则未命中已知风险，不是合规认证，也不保证通过。" : "分数只反映已收录规则的扣分，不是投放许可。"}
				</p>
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
	const [compare, setCompare] = useState(false);
	const [attempt, setAttempt] = useState(0);
	const [state, setState] = useState<FixtureState>();
	const scope = [demo.id, market, attempt].join("/");
	useEffect(() => {
		if (own) return;
		const controller = new AbortController();
		const fetchVariant = (v: Variant) => scan({ markets: [market], demo: { caseId: demo.id, variant: v } }, controller.signal);
		Promise.all([fetchVariant("original"), fetchVariant("localized")])
			.then(([original, localized]) => {
				if (controller.signal.aborted) return;
				setState({
					scope,
					signals: { original: original.signals, localized: localized.signals },
					source: preferScanSource([knownScanSource(original.source), knownScanSource(localized.source)]),
					model: original.model ?? localized.model,
					fallbackModel: Boolean(original.fallbackModel || localized.fallbackModel),
				});
			})
			.catch((e: unknown) => {
				if (!controller.signal.aborted) setState({ scope, error: e instanceof Error ? e.message : "读取检测结果失败。" });
			});
		return () => controller.abort();
	}, [demo.id, market, scope, own]);

	const fixture = state?.scope === scope ? state : undefined;
	const signals = own?.signals ?? fixture?.signals?.[variant];
	const scanError = own ? undefined : fixture?.error;
	const result = signals && assess(signals, [market]);
	const report = result?.markets[0];
	const marketReports = signals ? assess(signals, ["KR", "US", "SG"]).markets : undefined;
	const before = !own && variant === "localized" && fixture?.signals ? assess(fixture.signals.original, [market]).markets[0] : undefined;
	const assets = own?.assets ?? demo[variant].assets;
	const title = own?.title ?? demo.title;
	const source = own?.source ?? fixture?.source;
	const model = own?.model ?? fixture?.model;
	const fallbackModel = own?.fallbackModel ?? fixture?.fallbackModel;
	const phase = signals ? "ready" : scanError ? "error" : "pending";
	const origin = <OriginNote phase={phase} source={source} model={model} fallbackModel={fallbackModel} />;
	const showRevision = report && report.level !== "green" && (Boolean(own) || variant === "original");
	const originalSignals = own ? undefined : (fixture?.signals?.original ?? demo.original.signals);
	const localizedSignals = own ? undefined : (fixture?.signals?.localized ?? demo.localized.signals);
	const compared =
		compare && originalSignals && localizedSignals
			? {
					before: assess(originalSignals, [market]).markets[0],
					after: assess(localizedSignals, [market]).markets[0],
				}
			: undefined;
	const plan = () => {
		if (!result || !report) return;
		onPlanLaunch(
			buildLaunchHandoff({
				segment: own ? "prosumer" : demo.segment,
				themes: result.themes,
				material: own?.title ?? title + "（" + demo[variant].label + "）",
				report,
				origin: source ?? "fallback",
				model,
				fallbackModel,
			}),
		);
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
					<p className="purpose-line">
						ClearRun 检查同一份素材在韩国、美国、新加坡可能碰到的不同规则。
						{own
							? "下面是你上传的素材。"
							: demo.id === "kr-kv"
								? "这一例是 Apple 官网的 iPhone Air 主视觉，用来检查韩国手势。Mira Agent 仍是另外两个示例里的虚构产品。"
								: `${PRODUCT} 是被检查的演示项目，不是这个工具。`}
					</p>
				</div>
				<button className="button" onClick={onImport}>
					<Icon name="plus" />
					新建预检
				</button>
			</div>
			<section className="market-cards" aria-label="三市场规则评估">
				{(["KR", "US", "SG"] as const).map((code) => {
					const card = marketReports?.find((item) => item.market === code);
					const count = card ? `已命中 ${card.findings.length} 项` : "读取中";
					return (
						<button
							key={code}
							type="button"
							className="market-card"
							aria-pressed={market === code}
							aria-label={`${MARKET_LABEL[code]}市场，${count}`}
							onClick={() => onMarketChange(code)}
						>
							<strong>
								{MARKET_LABEL[code]} · {code}
							</strong>
							<span>{count}</span>
							{card && <span>待处理 {card.findings.length} 项</span>}
						</button>
					);
				})}
			</section>
			<p className="cross-market-note">
				{signals && market !== (own?.market ?? demo.focus)
					? `同批信号的跨市场规则评估：下面把当前素材已识别的信号套用到${MARKET_LABEL[market]}规则，不是对${MARKET_LABEL[market]}重新做了一次完整感知。`
					: `三张卡使用同一批已识别信号，分别套用韩国、美国、新加坡的规则。当前是${own ? "这次检测选定的市场" : "示例焦点"}${MARKET_LABEL[own?.market ?? demo.focus]}。换市场只换规则，不重新感知。`}
			</p>
			<div className="review-toolbar">
				<div className="review-properties">
					<MarketSelect value={market} onChange={onMarketChange} />
					{!own && !compare && (
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
					{!own && compare && (
						<button type="button" className="button" onClick={() => setCompare(false)}>
							返回单版预检
						</button>
					)}
				</div>
			</div>
			{compared?.before && compared.after ? (
				<section className={"verdict " + compared.after.level} aria-label="预检结论" aria-live="polite">
					<div className="decision">
						<div className="decision-icon">
							<Icon name={compared.after.findings.length ? "alert" : "shield"} size={22} />
						</div>
						<div>
							<p className="minor-label">{MARKET_LABEL[market]}市场 · 原版与本地化修订示例</p>
							<h2>
								{compared.before.findings.length} 项已知风险 → {compared.after.findings.length} 项已命中风险
							</h2>
							<p className="hit-line">
								原版已命中 {compared.before.findings.length} 项 · 修订示例待处理 {compared.after.findings.length} 项
							</p>
							{origin}
							<p className="scope-note">
								这是预置的本地化修订示例，不会自动改写素材，也不是现场生成。
								{compared.after.findings.length === 0
									? " 0 项表示当前规则未命中已知风险，不是保证通过。"
									: " 变化只统计当前知识库规则。"}
							</p>
						</div>
					</div>
					<div className="score">
						<div className="minor-label">基于当前知识库规则的预检评分</div>
						<div className="score-number">
							<small>{compared.before.score} → </small>
							<strong>{compared.after.score}</strong>
							<span> / 100</span>
						</div>
						<p className="score-note">
							{compared.after.score === 100
								? "100 表示当前规则未命中已知风险，不是合规认证，也不保证通过。"
								: "分数只反映已收录规则的扣分，不是投放许可。"}
						</p>
					</div>
					<div className="verdict-actions">
						<button className="button primary" onClick={plan}>
							查看发布排期
							<Icon name="arrow" size={14} />
						</button>
					</div>
				</section>
			) : (
			<Verdict report={report} before={before} market={market} error={scanError} origin={origin} retry={() => setAttempt((n) => n + 1)}>
				{showRevision && !compare && (
					<button
						className="button primary"
						title={own ? undefined : "打开预置的本地化修订示例。这不会自动改写素材，也不是现场生成。"}
						onClick={own ? onRevise : () => setCompare(true)}
					>
						<Icon name="version" size={15} />
						{own ? "修改并复检" : "比较原版与修订示例"}
						<Icon name="arrow" size={14} />
					</button>
				)}
				<button className={showRevision && !compare ? "plan-link" : "button primary"} onClick={plan}>
					查看发布排期
					<Icon name="arrow" size={14} />
				</button>
				{own && !showRevision && (
					<button className="plan-link" onClick={onRevise}>
						编辑并复检
					</button>
				)}
			</Verdict>
			)}
			{compare && !own && (
				<CompareBoard
					demo={demo}
					market={market}
					originalSignals={fixture?.signals?.original ?? demo.original.signals}
					localizedSignals={fixture?.signals?.localized ?? demo.localized.signals}
				/>
			)}
			{!compare && (
				<ReviewPanel
					key={market + "/" + variant}
					assets={assets}
					signals={signals ?? []}
					before={before}
					report={report}
					result={result}
					market={market}
					error={scanError}
					illustrative={!own}
				/>
			)}
		</div>
	);
}
