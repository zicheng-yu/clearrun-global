import { Fragment, useMemo, useState } from "react";
import { planLaunch, type LaunchPlan, type MarketPlan, type WeekScore } from "../engine/launch/plan.ts";
import { addDays, isoDay, weekLabel } from "../shared/dates.ts";
import {
	EVENT_KIND_LABEL,
	MARKETS,
	MARKET_LABEL,
	SEGMENTS,
	SEGMENT_LABEL,
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

function Rollout({ plan, onSelect }: { plan: LaunchPlan; onSelect: (s: WeekSelection) => void }) {
	return (
		<section className="rollout" aria-label="推荐发布周">
			<h2 className="section-title">
				<Icon name="calendar" />
				推荐发布周
			</h2>
			<div className="rollout-steps">
				{plan.markets.map((m, i) => {
					const step = plan.rollout.find((s) => s.market === m.market);
					return (
						<Fragment key={m.market}>
							{i > 0 && <Icon name="arrow" size={16} className="step-arrow" />}
							{step ? (
								<button
									className="rollout-step"
									aria-label={MARKET_LABEL[m.market] + " " + step.week + " 当周，查看推荐依据"}
									onClick={() => onSelect(step)}
								>
									<span className="date-tile">
										<span>{Number(step.week.slice(5, 7))} 月</span>
										<strong>{Number(step.week.slice(8))}</strong>
									</span>
									<span>
										<strong className="step-title">{MARKET_LABEL[m.market]}</strong>
										<span className="step-market">档期分 {Math.round(step.clear * 100)}</span>
									</span>
								</button>
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

function PressureCalendar({ plan, selection, onSelect }: { plan: LaunchPlan; selection: WeekSelection; onSelect: (s: WeekSelection) => void }) {
	const weeks = plan.markets[0].weeks;
	const columns = { gridTemplateColumns: "repeat(" + weeks.length + ", minmax(0, 1fr))" };
	return (
		<section className="calendar-section" aria-label="档期压力日历">
			<div className="section-head">
				<h2 className="section-title">
					<Icon name="calendar" />
					档期压力日历
				</h2>
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
						{plan.markets.map((m) => (
							<div key={m.market} className="heat-row">
								<span className="heat-market">
									{MARKET_LABEL[m.market]} <small>{m.market}</small>
								</span>
								<div className="heat-grid" style={columns}>
									{m.weeks.map((w) => {
										const active = selection.market === m.market && selection.week === w.week;
										const label =
											MARKET_LABEL[m.market] +
											" " +
											w.week +
											" 当周，档期分 " +
											Math.round(w.clear * 100) +
											(w.blocks.length ? "，主题冲突" : "") +
											(m.best.includes(w.week) ? "，推荐周" : "") +
											(!w.covered ? "，数据不完整" : "");
										return (
											<button
												key={w.week}
												title={label}
												aria-label={label}
												aria-pressed={active}
												className={[
													"week-cell",
													m.best.includes(w.week) ? "recommended" : "",
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
						))}
					</div>
				</div>
				<div className="calendar-key">
					<span className="pressure-key">
						低压力{" "}
						{[0, 0.33, 0.66, 1].map((n) => (
							<i key={n} style={{ background: pressureColor(n) }} />
						))}{" "}
						高压力
					</span>
					<span>
						<i className="key-best" />
						推荐周
					</span>
					<span>
						<i className="key-launch" />
						上线周
					</span>
					<span>
						<i className="key-block" />
						主题冲突
					</span>
					<span>
						<i className="dot green" />
						顺势窗口
					</span>
				</div>
			</div>
		</section>
	);
}

function WeekDetail({ week, plan, onSelect }: { week: WeekScore; plan: MarketPlan; onSelect: (s: WeekSelection) => void }) {
	const total = week.contributors.reduce((sum, c) => sum + c.pressure, 0);
	return (
		<section className="week-detail" aria-label="所选周详情">
			<div className="week-head">
				<div>
					<p className="minor-label">所选周 · {MARKET_LABEL[plan.market]}</p>
					<h2>{weekLabel(week.week)}当周</h2>
				</div>
				<div className="week-stats">
					<span>
						档期分 <strong>{Math.round(week.clear * 100)}</strong>
					</span>
					<span>
						压力指数 <strong>{Math.round(week.p * 100)}</strong>
					</span>
				</div>
			</div>
			{!week.covered && (
				<p className="notice">
					<Icon name="info" />
					本周的后续传播期超出日历覆盖范围，数据不完整。
				</p>
			)}
			{week.blocks.map((b) => {
				const e = eventById(b.eventId);
				return (
					<div key={b.eventId} className="date-conflict">
						<h3>
							<Icon name="alert" size={15} />
							主题冲突 · {e?.name}
						</h3>
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
			) : (
				<p className="quiet-note">
					<Icon name="info" size={15} />
					已收录事件中，这三周没有与当前受众争夺注意力的事件。
				</p>
			)}
			{!!week.opportunities.length && (
				<p className="opportunity-note">顺势窗口 · {week.opportunities.map((id) => eventById(id)?.name).join("、")}</p>
			)}
			{!!plan.best.length && (
				<div className="alternate-weeks">
					<span>推荐周</span>
					{plan.best.map((w) => (
						<button key={w} aria-pressed={week.week === w} onClick={() => onSelect({ market: plan.market, week: w })}>
							{weekLabel(w)}
						</button>
					))}
				</div>
			)}
		</section>
	);
}

export function LaunchView({ handoff, onReturn }: { handoff?: LaunchHandoff; onReturn?: () => void }) {
	const [markets, setMarkets] = useState<Market[]>(handoff?.markets ?? ["US", "SG", "KR"]);
	const [segment, setSegment] = useState<Segment>(handoff?.segment ?? "prosumer");
	const [themes, setThemes] = useState<SignalId[]>(handoff?.themes ?? []);
	const [from, setFrom] = useState(() => addDays(isoDay(new Date()), 14));
	const [weeks, setWeeks] = useState(26);
	const [selected, setSelected] = useState<WeekSelection>();
	const [filtersOpen, setFiltersOpen] = useState(false);

	const plan = useMemo(() => planLaunch({ markets, segment, themes, from, weeks }), [markets, segment, themes, from, weeks]);
	const first = plan.rollout[0];
	const selectedMarket = plan.markets.find((m) => m.market === selected?.market && m.weeks.some((w) => w.week === selected?.week));
	const detailPlan = selectedMarket ?? plan.markets.find((m) => m.market === first?.market) ?? plan.markets[0];
	const detailWeek = detailPlan.weeks.find((w) => w.week === (selectedMarket ? selected?.week : first?.week)) ?? detailPlan.weeks[0];
	const selection = { market: detailPlan.market, week: detailWeek.week };
	const toggleMarket = (m: Market) =>
		setMarkets((current) => {
			if (!current.includes(m)) return [...current, m];
			return current.length > 1 ? current.filter((v) => v !== m) : current;
		});
	const toggleTheme = (s: SignalId) => setThemes((current) => (current.includes(s) ? current.filter((v) => v !== s) : [...current, s]));

	return (
		<div className="workspace-page planner-page">
			<div className="page-heading">
				<div className="heading-copy">
					<h1>市场发布计划</h1>
				</div>
				<button className="button" aria-expanded={filtersOpen} aria-controls="plan-filters" onClick={() => setFiltersOpen((v) => !v)}>
					<Icon name="adjust" />
					排期条件
				</button>
			</div>
			<section className="precheck-bridge" aria-label="素材预检与上线市场">
				{handoff ? (
					<div className="source-material">
						<Icon name="stack" size={15} />
						<span>已带入素材</span>
						<strong>{handoff.source}</strong>
						<OriginNote phase="ready" source={handoff.origin} model={handoff.model} fallbackModel={handoff.fallbackModel} />
						{handoff.themes.length > 0 && (
							<details>
								<summary>{handoff.themes.length} 个素材信号</summary>
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
					<p className="notice">
						<Icon name="info" />
						这次排期没有素材预检。下面的市场都尚未做素材预检，档期建议不代表素材已审核通过。
					</p>
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
			{!filtersOpen && (
				<div className="plan-properties">
					<span>
						上线顺序 <b>{markets.map((m) => MARKET_LABEL[m]).join(" → ")}</b>
					</span>
					<span>
						受众 <b>{SEGMENT_LABEL[segment]}</b>
					</span>
					<span>
						起始日 <b className="mono">{from}</b>
					</span>
					<span>
						范围 <b>{weeks} 周</b>
					</span>
				</div>
			)}
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
			<Rollout plan={plan} onSelect={setSelected} />
			<PressureCalendar plan={plan} selection={selection} onSelect={setSelected} />
			<WeekDetail plan={detailPlan} week={detailWeek} onSelect={setSelected} />
			<p className="coverage-note">
				日历覆盖 {plan.coverage.start} 至 {plan.coverage.end}。档期分与压力指数均为 0–100。
			</p>
		</div>
	);
}
