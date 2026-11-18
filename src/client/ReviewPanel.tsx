import { useRef, useState } from "react";
import { assess, type Assessment, type Finding, type MarketAssessment } from "../engine/creative/assess.ts";
import type { DetectedSignal } from "../shared/api.ts";
import type { DemoAsset, DemoCase } from "../shared/demo.ts";
import { MARKET_LABEL, STAGE_LABEL, type Market } from "../shared/knowledge.ts";
import { signalLabel, type SignalId } from "../shared/signals.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Dialog, Highlight, SeverityLabel, VerifiedLabel, signalNeedles } from "./ui.tsx";

const ASSET_ICON: Record<DemoAsset["kind"], IconName> = { image: "image", copy: "text", page: "page" };
const MARKS = "①②③④⑤⑥⑦⑧⑨⑩";
const SHORT_SIGNAL: Partial<Record<SignalId, string>> = {
	"gesture.pinch": "手势",
	"people.one_actor_many_races": "选角",
	"people.altered_skin_tone": "肤色",
	"food.pork": "猪肉",
	"food.alcohol": "酒精",
	"claim.replace_humans": "取代",
	"claim.absolute_accuracy": "绝对宣称",
	"claim.emotional_ghostwriting": "情感代笔",
	"claim.ai_testimonial": "推荐语",
	"privacy.no_local_policy": "隐私语言",
	"privacy.no_data_residency": "数据驻留",
	"ai.no_disclosure": "AI 标识",
};

function annotationMark(index: number, signal: SignalId): string {
	const mark = MARKS[index] ?? String(index + 1);
	return `${mark} ${SHORT_SIGNAL[signal] ?? signalLabel(signal).slice(0, 4)}`;
}

function sourceHost(url: string): string {
	try {
		return new URL(url).hostname.replace(/^www\./, "");
	} catch {
		return url;
	}
}

function RuleDetails({ finding, assets, onClose }: { finding: Finding; assets: DemoAsset[]; onClose: () => void }) {
	const { rule } = finding;
	return (
		<Dialog title="规则依据与案例" onClose={onClose}>
			<div className="dialog-body rule-detail">
				<div className="meta-line">
					<span className="mono">{rule.id}</span>
					<span>
						{MARKET_LABEL[rule.market]} · {STAGE_LABEL[rule.stage]}
					</span>
					<VerifiedLabel value={rule.verified} />
				</div>
				<h3>{rule.looks_for}</h3>
				<dl className="facts">
					<dt>素材证据</dt>
					<dd>
						{finding.signals.map((s, i) => (
							<p key={i}>
								{assets.find((a) => a.id === s.asset)?.label} · {s.evidence || signalLabel(s.signal)}{" "}
								<span className="confidence">置信度 {Math.round(s.confidence * 100)}%</span>
							</p>
						))}
					</dd>
					<dt>触发原因</dt>
					<dd>{rule.why}</dd>
					<dt>修改建议</dt>
					<dd>{rule.fix}</dd>
				</dl>
				<h3 className="section-title">
					关联案例 <span className="count">{finding.cases.length}</span>
				</h3>
				{!finding.cases.length && <p className="muted">这条规则尚未关联案例。</p>}
				{finding.cases.map((c) => (
					<article key={c.id} className="case-entry">
						<div className="meta-line">
							<span>
								{c.brand} · {c.date}
							</span>
							<VerifiedLabel value={c.verified} />
						</div>
						<h4>{c.title}</h4>
						<p>{c.lesson}</p>
						<div className="source-links">
							{c.sources.map((url) => (
								<a key={url} href={url} target="_blank" rel="noreferrer">
									{new URL(url).hostname.replace(/^www\./, "")}
									<Icon name="external" size={12} />
								</a>
							))}
						</div>
					</article>
				))}
			</div>
		</Dialog>
	);
}

interface PreviewProps {
	asset: DemoAsset;
	signals: DetectedSignal[];
	findings: Finding[];
	active?: Finding;
	illustrative?: boolean;
	onFinding: (finding: Finding) => void;
}

function AssetContent({ asset, signals, findings, active, illustrative, onFinding }: PreviewProps) {
	const mine = signals.filter((s) => s.asset === asset.id);
	if (asset.kind !== "image") {
		const selected = active?.signals.filter((s) => s.asset === asset.id) ?? [];
		const shown = selected.length ? selected : mine;
		return (
			<div className="document-preview">
				<div className="document-label">{asset.label}</div>
				<p>
					<Highlight text={asset.content} needles={shown.flatMap(signalNeedles)} severity={selected.length ? active?.rule.severity : undefined} />
				</p>
			</div>
		);
	}
	return (
		<div className="artboard">
			{(asset.note || illustrative) && <p className="demo-asset-note">{asset.note || "演示素材，不是真实广告"}</p>}
			<div className="artwork">
				<img src={asset.content} alt={asset.note || asset.label} />
				{mine.map((s, i) => {
					if (!s.box) return null;
					const [x, y, w, h] = s.box;
					const finding = active?.signals.includes(s) ? active : findings.find((f) => f.signals.includes(s));
					const chosen = Boolean(active?.signals.includes(s));
					const boxed = mine.filter((item) => item.box);
					const mark = annotationMark(Math.max(0, boxed.indexOf(s)), s.signal);
					return (
						<div
							key={i}
							className={"annotation " + (finding?.rule.severity ?? "unmatched") + (active ? (chosen ? " selected" : " idle") : "")}
							style={{ left: x * 100 + "%", top: y * 100 + "%", width: w * 100 + "%", height: h * 100 + "%" }}
						>
							{finding ? (
								<button onClick={() => onFinding(finding)} title={s.evidence} aria-label={mark + "，规则 " + finding.rule.id}>
									{mark}
								</button>
							) : (
								<span>{mark}</span>
							)}
						</div>
					);
				})}
			</div>
		</div>
	);
}

interface ReviewProps {
	assets: DemoAsset[];
	signals: DetectedSignal[];
	result?: Assessment;
	report?: MarketAssessment;
	before?: MarketAssessment;
	market: Market;
	error?: string;
	illustrative?: boolean;
}

export function ReviewPanel({ assets, signals, result, report, before, market, error, illustrative }: ReviewProps) {
	const [selection, setSelection] = useState<{ asset: string; rule?: string }>();
	const [dialog, setDialog] = useState<"rule" | "preview" | null>(null);
	const previewSection = useRef<HTMLElement>(null);
	const findings = report?.findings ?? [];
	const resolved = before?.findings.filter((old) => !findings.some((f) => f.rule.id === old.rule.id)) ?? [];
	const selectedId = selection?.asset ?? findings[0]?.signals[0]?.asset;
	const asset = assets.find((a) => a.id === selectedId) ?? assets[0];
	const forAsset = findings.filter((f) => f.signals.some((s) => s.asset === asset.id));
	const active = forAsset.find((f) => f.rule.id === selection?.rule) ?? forAsset[0];
	const selectFinding = (f: Finding) => {
		const nextAsset = f.signals.some((s) => s.asset === asset.id) ? asset.id : f.signals[0].asset;
		setSelection({ asset: nextAsset, rule: f.rule.id });
	};
	const previewProps: PreviewProps = { asset, signals, findings, active, illustrative, onFinding: selectFinding };
	const evidence = active?.signals.filter((s) => s.asset === asset.id) ?? [];
	return (
		<div className="review-grid">
			<section className="preview-section" aria-label="素材预览" ref={previewSection} tabIndex={-1}>
				<div className="section-head">
					<h2 className="section-title">素材预览</h2>
					<button className="icon-button" title="放大素材预览" aria-label="放大素材预览" onClick={() => setDialog("preview")}>
						<Icon name="expand" />
					</button>
				</div>
				<div className="preview-panel">
					<AssetContent {...previewProps} />
					<div className="attachment-tabs" role="group" aria-label="素材附件">
						{assets.map((a) => (
							<button key={a.id} aria-pressed={asset.id === a.id} onClick={() => setSelection({ asset: a.id })}>
								<Icon name={ASSET_ICON[a.kind]} size={14} />
								<span>{a.label}</span>
							</button>
						))}
					</div>
				</div>
				{evidence.length > 0 && (
					<p className="evidence-foot">
						<span>素材证据</span>
						{evidence.map((s) => s.evidence || signalLabel(s.signal)).join(" · ")}
					</p>
				)}
				{!!result?.unmatched.length && (
					<details className="extra-signals">
						<summary>已识别、未命中规则的信号（{result.unmatched.length}）</summary>
						<p>{result.unmatched.map((s) => signalLabel(s.signal)).join("、")}</p>
					</details>
				)}
			</section>
			<section className="issues-section" aria-label="风险清单">
				<div className="section-head">
					<h2 className="section-title">
						风险清单 {report && <span className="count">{findings.length}</span>}
					</h2>
					{findings.length > 1 && <span className="section-meta">按严重度排列</span>}
				</div>
				{findings.length > 0 ? (
					<div className="issue-list">
						{findings.map((f) => {
							const evidence = f.signals.map((s) => s.evidence || signalLabel(s.signal)).join("；");
							const story = active?.rule.id === f.rule.id;
							const example = f.cases[0];
							return (
								<article className="risk-card" key={f.rule.id}>
									<button
										className="issue-row"
										aria-pressed={story}
										aria-label={f.rule.looks_for + "。素材证据：" + evidence}
										onClick={() => selectFinding(f)}
									>
										<span className="issue-copy">
											<span className="issue-title">{f.rule.looks_for}</span>
											<span className="issue-meta">
												<span>素材证据</span>
												<span>{evidence}</span>
											</span>
										</span>
										<SeverityLabel severity={f.rule.severity} />
										<Icon name="chevron" size={13} />
									</button>
									{story && (
										<div className="risk-story">
											<p>
												<span className="story-label">素材证据</span>
												{evidence}
											</p>
											<p>
												<span className="story-label">原因</span>
												{f.rule.why}
											</p>
											<p>
												<span className="story-label">修改建议</span>
												{f.rule.fix}
											</p>
											{example ? (
												<p>
													<span className="story-label">关联案例</span>
													{example.brand} · {example.summary.trim()}
													<span className="case-source">
														来源 {example.sources[0] ? sourceHost(example.sources[0]) : "未附链接"}
														<VerifiedLabel value={example.verified} />
													</span>
												</p>
											) : (
												<p>
													<span className="story-label">关联案例</span>
													这条规则尚未关联案例。
												</p>
											)}
											<p className="scope-note">以上是知识库规则对当前素材的解释和改法，不是法律禁令，也不是投放许可。</p>
											<div className="fix-actions">
												<button className="text-button" onClick={() => setDialog("rule")}>
													完整案例与来源{f.cases.length ? " (" + f.cases.length + ")" : ""}
													<Icon name="arrow" size={14} />
												</button>
												<button
													className="text-button mobile-jump"
													onClick={() => {
														previewSection.current?.focus({ preventScroll: true });
														previewSection.current?.scrollIntoView({ block: "start" });
													}}
												>
													定位素材
												</button>
											</div>
										</div>
									)}
									<details className="tech-details">
										<summary>技术详情</summary>
										<p>
											<span className="mono">{f.rule.id}</span>
											<VerifiedLabel value={f.rule.verified} />
											<span>{f.rule.category}</span>
										</p>
									</details>
								</article>
							);
						})}
					</div>
				) : (
					<div className={"empty-panel" + (report ? " clear" : "")}>
						<p>
							{report
								? "当前规则未命中" + MARKET_LABEL[market] + "已收录的素材风险。这不是合规认证。"
								: error
									? "检测失败，暂时没有可用结论。"
									: "正在读取素材检测结果…"}
						</p>
					</div>
				)}
				{resolved.length > 0 && (
					<div className="resolved-issues">
						<h3>对照原版，{resolved.length} 项风险在本版未再命中</h3>
						<ul>
							{resolved.map((f) => (
								<li key={f.rule.id}>
									<Icon name="check" size={13} />
									<span>
										{f.rule.looks_for}
										<small>原版证据：{f.signals[0].evidence || signalLabel(f.signals[0].signal)}</small>
									</span>
								</li>
							))}
						</ul>
					</div>
				)}
				{!!report?.timing.length && (
					<div className="timing-note">
						<h3>档期提醒</h3>
						{report.timing.map((f) => (
							<p key={f.rule.id}>
								<span className="mono">{f.rule.id}</span> {f.rule.looks_for}。该主题会带入发布排期。
							</p>
						))}
					</div>
				)}
			</section>
			{dialog === "rule" && active && <RuleDetails finding={active} assets={assets} onClose={() => setDialog(null)} />}
			{dialog === "preview" && (
				<Dialog title={asset.label} wide onClose={() => setDialog(null)}>
					<div className="expanded-asset">
						<AssetContent {...previewProps} />
					</div>
				</Dialog>
			)}
		</div>
	);
}

function ComparePane({
	title,
	assets,
	signals,
	report,
}: {
	title: string;
	assets: DemoAsset[];
	signals: DetectedSignal[];
	report: MarketAssessment;
}) {
	const [rule, setRule] = useState<string>();
	const findings = report.findings;
	return (
		<article className="compare-pane">
			<h3>{title}</h3>
			<p className="compare-count">已命中 {findings.length} 项 · 待处理 {findings.length} 项</p>
			{assets.map((asset) => {
				const onAsset = findings.filter((finding) => finding.signals.some((signal) => signal.asset === asset.id));
				const active = onAsset.find((finding) => finding.rule.id === rule) ?? onAsset[0];
				return (
					<div key={asset.id} className="compare-asset">
						<AssetContent
							asset={asset}
							signals={signals}
							findings={findings}
							active={active}
							illustrative
							onFinding={(finding) => setRule(finding.rule.id)}
						/>
					</div>
				);
			})}
		</article>
	);
}

export function CompareBoard({
	demo,
	market,
	originalSignals,
	localizedSignals,
}: {
	demo: DemoCase;
	market: Market;
	originalSignals: DetectedSignal[];
	localizedSignals: DetectedSignal[];
}) {
	const [pane, setPane] = useState<"both" | "original" | "localized">("both");
	const before = assess(originalSignals, [market]).markets[0];
	const after = assess(localizedSignals, [market]).markets[0];
	if (!before || !after) return null;
	const resolved = before.findings.filter((old) => !after.findings.some((finding) => finding.rule.id === old.rule.id));
	const ids = [...new Set([...demo.original.assets, ...demo.localized.assets].map((asset) => asset.id))];
	const paired = (assets: DemoAsset[]) => ids.map((id) => assets.find((asset) => asset.id === id)).filter((asset): asset is DemoAsset => !!asset);
	return (
		<section className="compare-board-wrap" aria-label="原版与修订示例对照">
			<div className="compare-delta">
				<p>
					{before.findings.length} 项已知风险 → {after.findings.length} 项已命中风险
				</p>
				<p className="scope-note">
					这是预置的本地化修订示例，不会自动改写素材，也不是现场生成。
					{after.findings.length === 0 ? " 0 项表示当前规则未命中已知风险，不是保证通过。" : " 变化只统计当前知识库规则。"}
				</p>
			</div>
			<div className="compare-changes">
				<h3>已解除的风险</h3>
				{resolved.length === 0 ? (
					<p>对照后，已命中风险没有减少。</p>
				) : (
					<ul>
						{resolved.map((finding) => (
							<li key={finding.rule.id}>
								<Icon name="check" size={13} />
								<span>
									{finding.rule.looks_for}
									<small>原版证据：{finding.signals[0]?.evidence || signalLabel(finding.signals[0].signal)}</small>
								</span>
							</li>
						))}
					</ul>
				)}
			</div>
			<div className="segmented compare-layout" role="group" aria-label="对照布局">
				<button type="button" aria-pressed={pane === "both"} onClick={() => setPane("both")}>
					并排
				</button>
				<button type="button" aria-pressed={pane === "original"} onClick={() => setPane("original")}>
					只看原版
				</button>
				<button type="button" aria-pressed={pane === "localized"} onClick={() => setPane("localized")}>
					只看修订示例
				</button>
			</div>
			<div className={"compare-board layout-" + pane}>
				<ComparePane title={"原版 · " + demo.original.label} assets={paired(demo.original.assets)} signals={originalSignals} report={before} />
				<ComparePane
					title={"本地化修订示例 · " + demo.localized.label}
					assets={paired(demo.localized.assets)}
					signals={localizedSignals}
					report={after}
				/>
			</div>
		</section>
	);
}
