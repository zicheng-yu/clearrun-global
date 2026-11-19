import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import {
	DELAY_COST,
	FOLLOW_COST,
	KIND_EFFECT,
	LAUNCH_RUN,
	PRESSURE_REF,
	intensity,
	planLaunch,
	planMarket,
	recommendationLines,
	weekAssessmentLabel,
	type LaunchPlan,
	type MarketPlan,
	type WeekScore,
} from "../engine/launch/plan.ts";
import { addDays, isoDay, launchDay, launchDayText, mondayOf } from "../shared/dates.ts";
import { THEME_SCHEDULE_SCRIPT } from "../shared/demo.ts";
import {
	CONFIDENCE_LABEL,
	EVENT_KIND_LABEL,
	MARKETS,
	MARKET_LABEL,
	SEGMENTS,
	SEGMENT_LABEL,
	audienceOf,
	eventById,
	knowledge,
	ruleById,
	type Market,
	type Segment,
} from "../shared/knowledge.ts";
import { signalLabel, type SignalId } from "../shared/signals.ts";
import { marketActionLabel, marketStatusText, type LaunchHandoff } from "./handoff.ts";
import { Icon } from "./Icon.tsx";
import { OriginNote } from "./OriginNote.tsx";

const BLOCKING_SIGNALS: SignalId[] = [...new Set(knowledge.calendar.flatMap((e) => e.blocks))];
const pressureColor = (pressure: number) => "color-mix(in oklab, var(--pressure-high) " + Math.round(pressure * 100) + "%, var(--pressure-low))";
type WeekSelection = { market: Market; week: string };
type PlannedDates = Partial<Record<Market, string>>;

function sameThemes(left: SignalId[], right: SignalId[]): boolean {
	return left.length === right.length && left.every((theme) => right.includes(theme));
}

function scheduleFingerprint(plan: LaunchPlan): string {
	return plan.markets
		.map((market) =>
			[
				market.market,
				market.best.join(","),
				...market.weeks.map((week) => week.week + ":" + week.blocks.map((block) => block.eventId).join("+") + ":" + Math.round(week.clear * 1000)),
			].join(";"),
		)
		.join("|");
}

interface CellMarks {
	system: boolean;
	planned: boolean;
	blocked: boolean;
	uncovered: boolean;
}

function cellMarks(plan: LaunchPlan, market: Market, week: string, planned: PlannedDates): CellMarks {
	const row = plan.markets.find((item) => item.market === market);
	const cell = row?.weeks.find((item) => item.week === week);
	const plannedWeek = planned[market] ? mondayOf(planned[market]) : "";
	return {
		system: plan.rollout.some((step) => step.market === market && step.week === week),
		planned: plannedWeek === week,
		blocked: Boolean(cell?.blocks.length),
		uncovered: cell ? !cell.covered : false,
	};
}

const MARK_LABEL: Record<keyof CellMarks, string> = {
	system: "系统推荐周",
	planned: "原定周",
	blocked: "主题阻断周",
	uncovered: "无数据区域",
};

function markText(marks: CellMarks): string {
	const names = (Object.keys(MARK_LABEL) as (keyof CellMarks)[]).filter((key) => marks[key]).map((key) => MARK_LABEL[key]);
	return names.length ? names.join("、") : "普通档期格";
}

function defaultLaunchFrom(): string {
	const coverageStart = knowledge.calendar.reduce((min, e) => (min === "" || e.start < min ? e.start : min), "");
	const coverageEnd = knowledge.calendar.reduce((max, e) => (e.end > max ? e.end : max), "");
	const today = isoDay(new Date());
	const candidate = addDays(today, 14);
	if (!coverageStart) return candidate;
	if (candidate < coverageStart || candidate > addDays(coverageEnd, -180) || today <= "2026-11-27") {
		return coverageStart;
	}
	return candidate;
}

function shortEventName(name: string): string {
	if (name.includes("黑五")) return "黑五";
	if (name.includes("春节") || name.includes("农历新年")) return "春节";
	if (name.includes("圣诞")) return "圣诞";
	if (name.includes("年底")) return "年底假";
	if (name.includes("超级碗")) return "超级碗";
	if (name.includes("Google I/O")) return "I/O";
	if (name.includes("re:Invent")) return "AWS";
	if (name.includes("三星")) return "三星";
	if (name.includes("斋月")) return "斋月";
	if (name.includes("万圣节")) return "万圣节";
	return name.slice(0, 4);
}

function peakLabels(weeks: WeekScore[]): Map<string, string> {
	const map = new Map<string, string>();
	let lastIdx = -3;
	weeks.forEach((w, i) => {
		if (!w.covered || i - lastIdx < 3) return;
		const eventId = w.blocks[0]?.eventId ?? (w.p >= 0.55 ? w.contributors[0]?.eventId : undefined);
		const ev = eventId ? eventById(eventId) : undefined;
		if (!ev) return;
		map.set(w.week, shortEventName(ev.name));
		lastIdx = i;
	});
	return map;
}

function Rollout({ plan, onSelect }: { plan: LaunchPlan; onSelect: (s: WeekSelection) => void }) {
	const earliest = plan.request.from;
	return (
		<section className="rollout" aria-label="推荐发布周">
			<h2 className="section-title">推荐发布周</h2>
			<div className="rollout-steps">
				{plan.markets.map((m, i) => {
					const step = plan.rollout.find((s) => s.market === m.market);
					const picked = step ? m.weeks.find((week) => week.week === step.week) : undefined;
					const reasons = picked ? recommendationLines(picked, m.weeks) : [];
					return (
						<Fragment key={m.market}>
							{i > 0 && <Icon name="arrow" size={16} className="step-arrow" />}
							{step ? (
								<div className="rollout-reason">
									<button
										className="rollout-step"
										aria-label={
											MARKET_LABEL[m.market] +
											" 发布周起始 " +
											step.week +
											"，最早可上线 " +
											launchDay(step.week, earliest) +
											"，" +
											weekAssessmentLabel({ covered: true, clear: step.clear }) +
											"，查看推荐依据"
										}
										onClick={() => onSelect(step)}
									>
										<span className="date-tile">
											<span>{Number(launchDay(step.week, earliest).slice(5, 7))} 月</span>
											<strong>{Number(launchDay(step.week, earliest).slice(8))}</strong>
										</span>
										<span>
											<strong className="step-title">{MARKET_LABEL[m.market]}</strong>
											<span className="step-market">{launchDayText(step.week, earliest)}</span>
											<span className="step-market">{weekAssessmentLabel({ covered: true, clear: step.clear })}</span>
										</span>
									</button>
									<ul className="reason-list">
										{reasons.map((line) => (
											<li key={line}>{line}</li>
										))}
									</ul>
								</div>
							) : (
								<span className="rollout-empty">{MARKET_LABEL[m.market]} · 当前条件下没有可推荐的周</span>
							)}
						</Fragment>
					);
				})}
			</div>
		</section>
	);
}

function PressureCalendar({
	plan,
	selection,
	planned,
	onSelect,
}: {
	plan: LaunchPlan;
	selection: WeekSelection;
	planned: PlannedDates;
	onSelect: (s: WeekSelection) => void;
}) {
	const earliest = plan.request.from;
	const weeks = plan.markets[0].weeks;
	const columns = { gridTemplateColumns: "repeat(" + weeks.length + ", minmax(0, 1fr))" };
	return (
		<section className="calendar-section" aria-label="档期压力日历">
			<div className="section-head">
				<h2 className="section-title">档期压力日历</h2>
				<span className="section-meta">
					{weeks[0].week} — {addDays(weeks[weeks.length - 1].week, 6)}
				</span>
			</div>
			<div className="calendar-card">
				<div className="calendar-scroll" tabIndex={0} role="region" aria-label="逐周日历，可横向滚动">
					<div style={{ minWidth: 77 + weeks.length * 22 }}>
						<div className="heat-row months">
							<span>市场</span>
							<div className="heat-grid" style={columns}>
								{weeks.map((w, i) => {
									const month = w.week.slice(0, 7);
									return (
										<span key={w.week}>
											{!i || weeks[i - 1].week.slice(0, 7) !== month ? Number(month.slice(-2)) + "月" : ""}
										</span>
									);
								})}
							</div>
						</div>
						{plan.markets.map((m) => {
							const peaks = peakLabels(m.weeks);
							return (
								<Fragment key={m.market}>
									<div className="heat-row">
										<span className="heat-market">
											{MARKET_LABEL[m.market]} <small>{m.market}</small>
										</span>
										<div className="heat-grid" style={columns}>
											{m.weeks.map((w) => {
												const active = selection.market === m.market && selection.week === w.week;
												const marks = cellMarks(plan, m.market, w.week, planned);
												const label =
													MARKET_LABEL[m.market] +
													" 发布周起始 " +
													w.week +
													"，最早可上线 " +
													launchDay(w.week, earliest) +
													"，" +
													weekAssessmentLabel(w) +
													(w.blocks.length ? "，主题冲突" : "") +
													(m.best.includes(w.week) ? "，推荐周" : "") +
													(marks.system ? "，系统推荐周" : "") +
													(marks.planned ? "，原定周" : "") +
													(marks.blocked ? "，主题阻断周" : "") +
													(marks.uncovered ? "，无数据区域" : "");
												return (
													<button
														key={w.week}
														title={label}
														aria-label={label}
														aria-pressed={active}
														className={[
															"week-cell",
															m.best.includes(w.week) ? "recommended" : "",
															marks.system ? "system-pick" : "",
															marks.planned ? "planned" : "",
															w.blocks.length ? "blocked" : "",
															!w.covered ? "uncovered" : "",
														].join(" ")}
														style={{ backgroundColor: w.covered ? pressureColor(w.p) : undefined }}
														onClick={() => onSelect({ market: m.market, week: w.week })}
													>
														{!!w.opportunities.length && <i className="opportunity-dot" />}
														{plan.rollout.some((s) => s.market === m.market && s.week === w.week) && (
															<i className="launch-marker" />
														)}
													</button>
												);
											})}
										</div>
									</div>
									{peaks.size > 0 && (
										<div className="heat-row peaks" aria-hidden="true">
											<span />
											<div className="heat-grid" style={columns}>
												{m.weeks.map((w) => (
													<span key={w.week} className={peaks.has(w.week) ? "peak-label" : undefined}>
														{peaks.get(w.week) ?? ""}
													</span>
												))}
											</div>
										</div>
									)}
								</Fragment>
							);
						})}
					</div>
				</div>
				<div className="calendar-key" aria-label="当前格图例">
					<span className="pressure-key">
						低压力{" "}
						{[0, 0.33, 0.66, 1].map((n) => (
							<i key={n} style={{ background: pressureColor(n) }} />
						))}{" "}
						高压力
					</span>
					{(Object.keys(MARK_LABEL) as (keyof CellMarks)[]).map((key) => {
						const on = cellMarks(plan, selection.market, selection.week, planned)[key];
						return (
							<span key={key} aria-current={on ? "true" : undefined} className={on ? "legend-on" : undefined}>
								<i className={"key-" + key} />
								{MARK_LABEL[key]}
							</span>
						);
					})}
					<span>
						<i className="dot green" />
						顺势窗口
					</span>
					<p className="legend-current">当前格：{markText(cellMarks(plan, selection.market, selection.week, planned))}</p>
				</div>
			</div>
		</section>
	);
}

function WeekDetail({
	week,
	plan,
	segment,
	earliest,
	coverage,
	marks,
	onSelect,
}: {
	week: WeekScore;
	plan: MarketPlan;
	segment: Segment;
	earliest: string;
	coverage: { start: string; end: string };
	marks: CellMarks;
	onSelect: (s: WeekSelection) => void;
}) {
	const total = week.contributors.reduce((sum, c) => sum + c.pressure, 0);
	const reasons = recommendationLines(week, plan.weeks);
	return (
		<section className="week-detail" aria-label="所选周详情">
			<div className="week-head">
				<div>
					<p className="minor-label">所选周 · {MARKET_LABEL[plan.market]}</p>
					<h2>{week.covered ? launchDayText(week.week, earliest) : "超出数据范围，不足以评估"}</h2>
					<p className="legend-current">当前格：{markText(marks)}</p>
				</div>
				<div className="week-stats">
					{week.covered ? (
						<>
							<span>
								档期分 <strong>{Math.round(week.clear * 100)}</strong>
							</span>
							<span>
								模型计算的档期压力指数 <strong>{Math.round(week.p * 100)}</strong>
							</span>
						</>
					) : (
						<span>{weekAssessmentLabel(week)}</span>
					)}
				</div>
			</div>
			<div className="reason-block" aria-label="所选周解释" aria-live="polite">
				<h3>{week.week} 这一周为什么是现在这样</h3>
				<p>
					发布周起始 {week.week}
					{week.covered ? `，档期分 ${Math.round(week.clear * 100)}，模型计算的档期压力指数 ${Math.round(week.p * 100)}。` : "，超出数据范围，不足以评估。"}
				</p>
				<ul className="reason-list">
					{reasons.map((line) => (
						<li key={line}>{line}</li>
					))}
				</ul>
				{week.covered && <p className="scope-note">压力指数是模型计算的档期压力指数，不是真实市场注意力百分比。</p>}
			</div>
			{!week.covered && (
				<p className="notice">
					{week.week < coverage.start
						? "这一周早于日历覆盖起点 " + coverage.start + "，超出数据范围，不足以评估。"
						: "这一周的后续传播期超出日历覆盖终点 " + coverage.end + "，超出数据范围，不足以评估。"}
					无事件不等于低压力，这里不会给出满分推荐。
				</p>
			)}
			{week.blocks.map((b) => {
				const e = eventById(b.eventId);
				return (
					<div key={b.eventId} className="date-conflict">
						<h3>主题冲突 · {e?.name}</h3>
						<p>
							{e?.start} — {e?.end} · {b.signals.map(signalLabel).join("、")}
						</p>
						{b.rules.map((id) => {
							const rule = ruleById(id);
							return (
								rule && (
									<p key={id}>
										<span className="mono">{id}</span> {rule.why}。{rule.fix}
									</p>
								)
							);
						})}
					</div>
				);
			})}
			{total > 0 ? (
				<div className="event-list">
					<h3>影响首发及随后两周的事件</h3>
					{week.contributors.slice(0, 6).map((c) => {
						const e = eventById(c.eventId);
						if (!e) return null;
						return (
							<div className="event-row" key={e.id}>
								<span className="event-bar">
									<i style={{ width: (c.pressure / total) * 100 + "%" }} />
								</span>
								<span className="event-name">
									{e.name}
									{e.confidence === "estimated" && <small>预计</small>}
								</span>
								<span className="event-meta">
									{EVENT_KIND_LABEL[e.kind]} · {e.start.slice(5)}
									{e.start !== e.end ? " – " + e.end.slice(5) : ""}
								</span>
							</div>
						);
					})}
				</div>
			) : week.covered ? (
				<p className="quiet-note">已收录事件里，这三周没有会抬高档期压力指数的撞档。</p>
			) : null}
			{week.covered && (
				<details className="math-breakdown">
					<summary>算法拆解 · 本地 0ms 同构实算</summary>
					<div className="math-body">
						<p>
							<code>LAUNCH_RUN = [{LAUNCH_RUN.join(", ")}]</code>（首发与随后两周权重和 1.75）；压力归一化{" "}
							<code>
								p = min(1, {week.pressure.toFixed(2)} / {PRESSURE_REF}) = {Math.round(week.p * 100)}%
							</code>
							；顺势红利 <code>+{Math.round(week.bonus * 100)}</code>；最终{" "}
							<code>clear = clamp(1 - p + bonus) = {Math.round(week.clear * 100)}</code>。
						</p>
						<p>
							正交拦截：主题阻断（<code>BLOCK_WEEKS = 2</code>）仅取消推荐资格而不篡改拥挤度；多市场错峰惩罚：首市场{" "}
							<code>{DELAY_COST}/周</code>，后续市场 <code>{FOLLOW_COST}/周</code>。
						</p>
						{week.contributors.length > 0 && (
							<ul>
								{week.contributors.slice(0, 4).map((c) => {
									const e = eventById(c.eventId);
									if (!e) return null;
									return (
										<li key={e.id}>
											{e.name}：类型系数 {KIND_EFFECT[e.kind].weight} × 强度 {e.attention} × {SEGMENT_LABEL[segment]}重合{" "}
											{audienceOf(e, segment)} × 当周重叠 {intensity(e, week.week).toFixed(2)} → 贡献{" "}
											{Math.round((c.pressure / PRESSURE_REF) * 100)}
										</li>
									);
								})}
							</ul>
						)}
					</div>
				</details>
			)}
			{!!week.opportunities.length && (
				<p className="opportunity-note">顺势窗口 · {week.opportunities.map((id) => eventById(id)?.name).join("、")}</p>
			)}
			{!!plan.best.length && (
				<div className="alternate-weeks">
					<span>推荐周</span>
					{plan.best.map((w) => (
						<button key={w} aria-pressed={week.week === w} onClick={() => onSelect({ market: plan.market, week: w })}>
							{launchDayText(w, earliest)}
						</button>
					))}
				</div>
			)}
		</section>
	);
}

export function LaunchView({ handoff, onReturn }: { handoff?: LaunchHandoff; onReturn?: () => void }) {
	const perceived = handoff?.themes ?? [];
	const [markets, setMarkets] = useState<Market[]>(handoff?.markets ?? ["US", "SG", "KR"]);
	const [segment, setSegment] = useState<Segment>(handoff?.segment ?? "prosumer");
	const [themes, setThemes] = useState<SignalId[]>(perceived);
	const [from, setFrom] = useState(() => handoff?.from ?? defaultLaunchFrom());
	const [weeks, setWeeks] = useState(26);
	const [selected, setSelected] = useState<WeekSelection>();
	const [filtersOpen, setFiltersOpen] = useState(false);
	const [planned, setPlanned] = useState<PlannedDates>({});
	const [scheduleNote, setScheduleNote] = useState("");
	const [weekChange, setWeekChange] = useState("");
	const [flashWeek, setFlashWeek] = useState("");
	const interacted = useRef(false);
	const previousFingerprint = useRef<string | null>(null);
	const previousScript = useRef<{ blocked: boolean; clear: number } | null>(null);

	const yours = Object.fromEntries(Object.entries(planned).filter((entry): entry is [string, string] => Boolean(entry[1]))) as Partial<Record<Market, string>>;
	const plan = useMemo(
		() => planLaunch({ markets, segment, themes, from, weeks, ...(Object.keys(yours).length ? { yours } : {}) }),
		[markets, segment, themes, from, weeks, planned],
	);
	const first = plan.rollout[0];
	const selectedMarket = plan.markets.find((m) => m.market === selected?.market && m.weeks.some((w) => w.week === selected?.week));
	const detailPlan = selectedMarket ?? plan.markets.find((m) => m.market === first?.market) ?? plan.markets[0];
	const detailWeek = detailPlan?.weeks.find((w) => w.week === (selectedMarket ? selected?.week : first?.week)) ?? detailPlan?.weeks[0];
	const selection = { market: detailPlan?.market ?? markets[0] ?? "US", week: detailWeek?.week ?? "" };
	const toggleMarket = (m: Market) =>
		setMarkets((current) => {
			if (!current.includes(m)) return [...current, m];
			return current.length > 1 ? current.filter((v) => v !== m) : current;
		});
	const scriptEvent = eventById(THEME_SCHEDULE_SCRIPT.eventId);
	const scriptWeek = scriptEvent ? mondayOf(scriptEvent.start) : "";
	const scriptScore = useMemo(() => {
		if (!scriptWeek) return undefined;
		return planMarket("SG", { markets: ["SG"], segment, themes, from: scriptWeek, weeks: 1 }).weeks[0];
	}, [scriptWeek, segment, themes]);
	const modified = !sameThemes(themes, perceived);
	const added = themes.filter((theme) => !perceived.includes(theme));
	const removed = perceived.filter((theme) => !themes.includes(theme));
	const hypothesis = !added.length && !removed.length
		? "还没有偏离感知结果的假设。"
		: [removed.length ? "去掉 " + removed.map(signalLabel).join("、") : "", added.length ? "加上 " + added.map(signalLabel).join("、") : ""]
				.filter(Boolean)
				.join("；");
	useEffect(() => {
		const scriptSig = scriptScore
			? scriptScore.blocks.map((block) => block.eventId).join("+") + ":" + Math.round(scriptScore.clear * 1000)
			: "";
		const fingerprint = scheduleFingerprint(plan) + "#" + scriptSig;
		if (interacted.current && previousFingerprint.current === fingerprint) setScheduleNote("排期结果未变化");
		else if (interacted.current) setScheduleNote("");
		previousFingerprint.current = fingerprint;
	}, [plan, scriptScore]);
	useEffect(() => {
		if (!scriptScore || !scriptEvent) return;
		const blocked = scriptScore.blocks.some((block) => block.eventId === scriptEvent.id);
		const previous = previousScript.current;
		if (interacted.current && previous && (previous.blocked !== blocked || previous.clear !== scriptScore.clear)) {
			const next = blocked ? "主题阻断" : "未阻断";
			const was = previous.blocked ? "主题阻断" : "未阻断";
			const score = previous.clear === scriptScore.clear ? "档期分没有变化。" : "";
			setWeekChange(`同一周由${was}变为${next}。${score}`);
			setFlashWeek(scriptWeek);
		}
		previousScript.current = { blocked, clear: scriptScore.clear };
	}, [scriptScore, scriptEvent, scriptWeek]);
	const toggleTheme = (s: SignalId) => {
		interacted.current = true;
		setThemes((current) => (current.includes(s) ? current.filter((v) => v !== s) : [...current, s]));
	};
	const focusScriptWeek = () => {
		if (scriptWeek && markets.includes("SG") && plan.markets.some((m) => m.market === "SG" && m.weeks.some((w) => w.week === scriptWeek))) {
			setSelected({ market: "SG", week: scriptWeek });
		}
	};
	const setScriptTheme = (on: boolean) => {
		interacted.current = true;
		const signal = THEME_SCHEDULE_SCRIPT.signal;
		setThemes((current) => (on ? (current.includes(signal) ? current : [...current, signal]) : current.filter((theme) => theme !== signal)));
		focusScriptWeek();
	};
	const restoreThemes = () => {
		interacted.current = true;
		setThemes(perceived);
		focusScriptWeek();
	};
	const verdict = detailPlan?.verdict;
	const plannedDay = planned[selection.market] ?? "";
	const scriptBaseline = scriptWeek
		? planMarket("SG", {
				markets: ["SG"],
				segment,
				themes: themes.filter((theme) => theme !== THEME_SCHEDULE_SCRIPT.signal),
				from: scriptWeek,
				weeks: 1,
			}).weeks[0]
		: undefined;
	const scriptScoreUnchanged = Boolean(scriptScore && scriptBaseline && scriptBaseline.clear === scriptScore.clear);

	return (
		<div className="workspace-page planner-page">
			<div className="page-heading">
				<div className="heading-copy">
					<h1>市场发布计划</h1>
				</div>
				<button className="button" aria-expanded={filtersOpen} aria-controls="plan-filters" onClick={() => setFiltersOpen((v) => !v)}>
					{filtersOpen ? "收起排期条件" : "排期条件"}
				</button>
			</div>
			<section className="precheck-bridge" aria-label="素材预检与上线市场">
				{handoff ? (
					<div className="source-material">
						<span>已带入素材</span>
						<strong>{handoff.source}</strong>
						<OriginNote phase="ready" source={handoff.origin} model={handoff.model} fallbackModel={handoff.fallbackModel} />
						{handoff.themes.length > 0 && (
							<details>
								<summary>感知结果 · {handoff.themes.length} 个素材信号</summary>
								<p>这是检测带入的主题，不是当前模拟条件。</p>
								<p>{handoff.themes.map(signalLabel).join("、")}</p>
							</details>
						)}
						{onReturn && (
							<button type="button" className="button" onClick={onReturn}>
								返回修改素材
							</button>
						)}
					</div>
				) : (
					<p className="notice">这次排期没有素材预检。下面的市场都尚未做素材预检，档期建议不代表素材已审核通过。</p>
				)}
				<div className="market-scope">
					<p className="minor-label">上线市场</p>
					<div className="choices" role="group" aria-label="添加上线市场">
						{MARKETS.map((m) => {
							const included = markets.includes(m);
							const reviewed = handoff?.reviewed.some((review) => review.market === m) ?? false;
							return (
								<button
									key={m}
									type="button"
									aria-pressed={included}
									aria-label={marketActionLabel(m, included, markets.length === 1, reviewed)}
									disabled={included && markets.length === 1}
									onClick={() => toggleMarket(m)}
								>
									{included ? MARKET_LABEL[m] : "添加" + MARKET_LABEL[m]}
								</button>
							);
						})}
					</div>
					<ul className="market-status">
						{MARKETS.map((m) => {
							const review = handoff?.reviewed.find((item) => item.market === m);
							const scheduled = markets.includes(m);
							const state = !review ? "unreviewed" : review.remaining === 0 ? "clear" : "open";
							return (
								<li key={m} data-state={state}>
									{marketStatusText(m, review, scheduled)}
								</li>
							);
						})}
					</ul>
				</div>
			</section>
			<div className="audience-bar" role="group" aria-label="目标受众快捷切换">
				<span className="minor-label">目标受众</span>
				<div className="choices">
					{SEGMENTS.map((s) => (
						<button key={s} type="button" aria-pressed={segment === s} onClick={() => setSegment(s)}>
							{SEGMENT_LABEL[s]}
						</button>
					))}
				</div>
				<span className="audience-meta">
					上线顺序 <b>{markets.map((m) => MARKET_LABEL[m]).join(" → ")}</b> · 起始 <b className="mono">{from}</b> · <b>{weeks} 周</b>
				</span>
			</div>
			{filtersOpen && (
				<div id="plan-filters" className="plan-filters">
					<fieldset>
						<legend>
							上线顺序 <small>按选择顺序排列</small>
						</legend>
						<div className="choices">
							{MARKETS.map((m) => (
								<button
									key={m}
									aria-pressed={markets.includes(m)}
									disabled={markets.length === 1 && markets[0] === m}
									onClick={() => toggleMarket(m)}
								>
									{markets.includes(m) && <small>{markets.indexOf(m) + 1}</small>}
									{MARKET_LABEL[m]}
								</button>
							))}
						</div>
					</fieldset>
					<div className="filter-fields">
						<label className="form-field">
							<span>目标受众</span>
							<select value={segment} onChange={(e) => setSegment(e.target.value as Segment)}>
								{SEGMENTS.map((s) => (
									<option key={s} value={s}>
										{SEGMENT_LABEL[s]}
									</option>
								))}
							</select>
						</label>
						<label className="form-field">
							<span>最早上线日期</span>
							<input
								type="date"
								value={from}
								onChange={(e) => {
									if (e.target.value && e.target.validity.valid) setFrom(e.target.value);
								}}
							/>
						</label>
						<label className="form-field">
							<span>规划范围</span>
							<select value={weeks} onChange={(e) => setWeeks(Number(e.target.value))}>
								{[13, 26, 52].map((n) => (
									<option key={n} value={n}>
										{n} 周
									</option>
								))}
							</select>
						</label>
					</div>
					<fieldset>
						<legend>可能触发档期冲突的素材主题</legend>
						<div className="choices">
							{BLOCKING_SIGNALS.map((s) => (
								<button key={s} aria-pressed={themes.includes(s)} onClick={() => toggleTheme(s)}>
									{themes.includes(s) && <Icon name="check" size={12} />}
									{signalLabel(s)}
								</button>
							))}
						</div>
					</fieldset>
				</div>
			)}
			{mondayOf(from) < from && (
				<p className="notice">
					最早上线日是 {from}。它所在发布周从周一 {mondayOf(from)} 起算。
					{plan.markets.some((m) => m.weeks[0]?.week === mondayOf(from) && m.weeks[0]?.covered)
						? "推荐日是 " + launchDay(mondayOf(from), from) + "，不会早于最早上线日。"
						: "这一周超出数据范围，不足以评估，不会推荐。"}
					三个市场使用同一套日期。
				</p>
			)}
			{plan.markets.some((m) => m.weeks.some((w) => !w.covered)) && (
				<p className="notice">
					日历覆盖 {plan.coverage.start} 至 {plan.coverage.end}。超出这段的周不足以评估，不会作为满分推荐。
				</p>
			)}
			<Rollout plan={plan} onSelect={setSelected} />
			<PressureCalendar plan={plan} selection={selection} planned={planned} onSelect={setSelected} />
			{scriptEvent && scriptScore && scriptWeek && (
				<section className="whatif-panel" aria-label="主题与档期假设">
					<h2 className="section-title">主题如何改变同一周</h2>
					<dl className="whatif-sources">
						<div>
							<dt>感知结果</dt>
							<dd>{perceived.length ? perceived.map(signalLabel).join("、") : "这次排期没有从素材检测带入主题。"}</dd>
						</div>
						<div>
							<dt>用户 what-if 假设</dt>
							<dd>{hypothesis}</dd>
						</div>
						<div>
							<dt>当前模拟条件</dt>
							<dd>
								{themes.length ? themes.map(signalLabel).join("、") : "无主题"}
								{modified ? "（已修改）" : "（与感知结果一致）"}
							</dd>
						</div>
					</dl>
					{modified && (
						<button type="button" className="button" onClick={restoreThemes}>
							恢复检测条件
						</button>
					)}
					<article className="whatif-week" data-changed={flashWeek === scriptWeek ? "true" : "false"}>
						<h3>
							候选周 {scriptWeek}
							{scriptScore.blocks.some((block) => block.eventId === scriptEvent.id) ? " · 主题阻断周" : " · 未阻断"}
						</h3>
						<p>
							事件「{scriptEvent.name}」{scriptEvent.start} 至 {scriptEvent.end}，{CONFIDENCE_LABEL[scriptEvent.confidence]}。规则{" "}
							{scriptEvent.rules.join("、")}。知识库事件 {scriptEvent.id}。
							{scriptEvent.note ? scriptEvent.note + "。" : ""}
						</p>
						<p>
							{scriptScore.blocks.some((block) => block.eventId === scriptEvent.id)
								? `当前模拟条件含「${signalLabel(THEME_SCHEDULE_SCRIPT.signal)}」，这一周被该事件阻断，不会进入推荐。`
								: "当前模拟条件不会触发这条阻断。同一周可以进入候选。"}
						</p>
						<p className="scope-note">
							这一周档期分 {Math.round(scriptScore.clear * 100)}。
							{scriptScoreUnchanged ? "加上或去掉该主题不会改变这一周的档期分。" : ""}
						</p>
						{weekChange && <p className="whatif-change">{weekChange}</p>}
						{scheduleNote && <p className="whatif-change">{scheduleNote}</p>}
						<button
							type="button"
							className="button primary"
							onClick={() => setScriptTheme(!themes.includes(THEME_SCHEDULE_SCRIPT.signal))}
						>
							{themes.includes(THEME_SCHEDULE_SCRIPT.signal) ? "去掉猪肉主题，重算同一周" : "加上猪肉主题，重算同一周"}
						</button>
					</article>
				</section>
			)}
			{detailPlan && detailWeek && (
				<WeekDetail
					plan={detailPlan}
					week={detailWeek}
					segment={segment}
					earliest={from}
					coverage={plan.coverage}
					marks={cellMarks(plan, selection.market, selection.week, planned)}
					onSelect={setSelected}
				/>
			)}
			{detailPlan && detailWeek && (
				<section className="plan-compare" aria-label="原定周与推荐周">
					<h2 className="section-title">原定周和推荐周</h2>
					<label className="form-field">
						<span>{MARKET_LABEL[selection.market]}原定上线日期</span>
						<input
							type="date"
							aria-label="原定上线日期"
							value={plannedDay}
							onChange={(event) => {
								const day = event.target.value;
								const market = selection.market;
								setPlanned((current) => ({ ...current, [market]: day }));
								if (!day) return;
								const week = mondayOf(day);
								const row = plan.markets.find((item) => item.market === market);
								if (row?.weeks.some((item) => item.week === week)) setSelected({ market, week });
							}}
						/>
					</label>
					<p className="scope-note">这是你打算上线的日期，会归到它所在的周一发布周，再和系统推荐周比较。留空表示这一市场还没有原定周。</p>
					{plannedDay && detailPlan.weeks.some((week) => week.week === mondayOf(plannedDay)) && verdict ? (
						<div className="planned-verdict">
							<h3>{verdict.hold ? "建议保留原定周" : "建议调整原定周"}</h3>
							<p>
								{verdict.hold
									? `原定 ${launchDayText(verdict.week, from)} 没有被主题阻断，并且接近当前最清晰的一周（${launchDayText(verdict.best, from)}）。`
									: `原定 ${launchDayText(verdict.week, from)} 不如 ${launchDayText(verdict.best, from)}。建议改到 ${launchDayText(verdict.best, from)}。`}
								{`（当前范围 ${verdict.of} 周中排第 ${verdict.rank} 位）`}
							</p>
						</div>
					) : plannedDay && detailPlan.weeks.some((week) => week.week === mondayOf(plannedDay)) ? (
						<p className="notice">原定周已在当前范围内，但还没有另一周可以比较。</p>
					) : plannedDay ? (
						<p className="notice">原定日期不在当前规划范围内，无法和推荐周比较。可以扩大范围或改日期。</p>
					) : (
						<p className="scope-note">还没有原定周。填入日期后，这里会说明建议保留还是调整。</p>
					)}
				</section>
			)}
			<p className="coverage-note">
				日历覆盖 {plan.coverage.start} 至 {plan.coverage.end}。覆盖范围内的档期分与模型计算的档期压力指数均为 0–100，压力指数不是真实市场注意力百分比。推荐日不早于最早上线日 {from}。
			</p>
		</div>
	);
}
