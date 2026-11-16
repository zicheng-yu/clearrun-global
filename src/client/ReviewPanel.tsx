import { useRef, useState } from "react";
import type { Assessment, Finding, MarketAssessment } from "../engine/creative/assess.ts";
import type { DetectedSignal } from "../shared/api.ts";
import type { DemoAsset } from "../shared/demo.ts";
import { MARKET_LABEL, STAGE_LABEL, type Market } from "../shared/knowledge.ts";
import { signalLabel } from "../shared/signals.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { Dialog, Highlight, SeverityLabel, VerifiedLabel } from "./ui.tsx";

const ASSET_ICON: Record<DemoAsset["kind"], IconName> = { image: "image", copy: "text", page: "page" };

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
					<Icon name="book" />
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
	onFinding: (finding: Finding) => void;
}

function AssetContent({ asset, signals, findings, active, onFinding }: PreviewProps) {
	const mine = signals.filter((s) => s.asset === asset.id);
	if (asset.kind !== "image") {
		const selected = active?.signals.filter((s) => s.asset === asset.id) ?? [];
		return (
			<div className="document-preview">
				<div className="document-label">
					<Icon name={ASSET_ICON[asset.kind]} size={15} />
					{asset.label}
				</div>
				<p>
					<Highlight text={asset.content} needles={(selected.length ? selected : mine).map((s) => s.evidence)} />
				</p>
			</div>
		);
	}
	return (
		<div className="artboard">
			<div className="artwork">
				<img src={asset.content} alt={asset.label} />
				{mine.map((s, i) => {
					if (!s.box) return null;
					const [x, y, w, h] = s.box;
					const finding = active?.signals.includes(s) ? active : findings.find((f) => f.signals.includes(s));
					return (
						<div
							key={i}
							className={"annotation " + (finding?.rule.severity ?? "unmatched")}
							style={{ left: x * 100 + "%", top: y * 100 + "%", width: w * 100 + "%", height: h * 100 + "%" }}
						>
							{finding ? (
								<button onClick={() => onFinding(finding)} title={s.evidence} aria-label={"定位规则 " + finding.rule.id}>
									{finding.rule.id}
								</button>
							) : (
								<span>{signalLabel(s.signal)}</span>
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
}

export function ReviewPanel({ assets, signals, result, report, before, market, error }: ReviewProps) {
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
	const previewProps: PreviewProps = { asset, signals, findings, active, onFinding: selectFinding };
	const evidence = active?.signals.filter((s) => s.asset === asset.id) ?? [];
	return (
		<div className="review-grid">
			<section className="preview-section" aria-label="素材预览" ref={previewSection} tabIndex={-1}>
				<div className="section-head">
					<h2 className="section-title">
						<Icon name="stack" size={17} />
						素材预览
					</h2>
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
					<div className="evidence-foot">
						<Icon name="target" size={15} />
						<span>{evidence.map((s) => s.evidence || signalLabel(s.signal)).join(" · ")}</span>
					</div>
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
						<Icon name="list" size={17} />
						风险清单 {report && <span className="count">{findings.length}</span>}
					</h2>
					{findings.length > 1 && <span className="section-meta">按严重度排列</span>}
				</div>
				{findings.length > 0 ? (
					<div className="issue-list">
						{findings.map((f) => (
							<button
								className="issue-row"
								key={f.rule.id}
								aria-pressed={active?.rule.id === f.rule.id}
								onClick={() => selectFinding(f)}
							>
								<span className="issue-copy">
									<span className="issue-title">{f.signals[0].evidence || signalLabel(f.signals[0].signal)}</span>
									<span className="issue-meta">
										<span className="mono">{f.rule.id}</span>
										<span>{f.rule.category}</span>
									</span>
								</span>
								<SeverityLabel severity={f.rule.severity} />
								<Icon name="chevron" size={13} />
							</button>
						))}
					</div>
				) : (
					<div className="empty-panel">
						<Icon name={report ? "shield" : error ? "alert" : "scan"} size={22} />
						<p>
							{report
								? "未命中" + MARKET_LABEL[market] + "已收录的素材风险规则。"
								: error
									? "检测失败，暂时没有可用结论。"
									: "正在读取素材检测结果…"}
						</p>
					</div>
				)}
				{resolved.length > 0 && (
					<details className="resolved-issues">
						<summary>对照原版，{resolved.length} 项风险在本版未再命中</summary>
						<ul>
							{resolved.map((f) => (
								<li key={f.rule.id}>
									<Icon name="check" size={13} />
									<span>{f.signals[0].evidence || signalLabel(f.signals[0].signal)}</span>
									<small className="mono">{f.rule.id}</small>
								</li>
							))}
						</ul>
					</details>
				)}
				{active && (
					<div className="fix-panel">
						<div className="fix-head">
							<h3>修改建议</h3>
							<div className="meta-line">
								<span className="mono">{active.rule.id}</span>
								<VerifiedLabel value={active.rule.verified} />
							</div>
						</div>
						<p>{active.rule.fix}</p>
						<div className="fix-actions">
							<button className="text-button" onClick={() => setDialog("rule")}>
								<Icon name="book" size={14} />
								规则依据与案例{active.cases.length ? " (" + active.cases.length + ")" : ""}
								<Icon name="arrow" size={14} />
							</button>
							<button
								className="text-button mobile-jump"
								onClick={() => {
									previewSection.current?.focus({ preventScroll: true });
									previewSection.current?.scrollIntoView({ block: "start" });
								}}
							>
								<Icon name="target" size={14} />
								定位素材
							</button>
						</div>
					</div>
				)}
				{!!report?.timing.length && (
					<div className="timing-note">
						<h3>
							<Icon name="calendar" />
							档期提醒
						</h3>
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
