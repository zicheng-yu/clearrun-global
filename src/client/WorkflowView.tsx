import { knowledge, type Market } from "../shared/knowledge.ts";
import { SIGNAL_IDS } from "../shared/signals.ts";
import { Icon } from "./Icon.tsx";

interface Props {
	onInput: () => void;
	onCase: (id: string, market: Market) => void;
	onPlan: () => void;
	onSingapore: () => void;
}

const STEPS = [
	["输入", "素材与目标市场"],
	["预检", "信号与当地规则"],
	["修订对照", "原稿与本地化版本"],
	["排期输出", "推荐周与撞档原因"],
] as const;

export function WorkflowView({ onInput, onCase, onPlan, onSingapore }: Props) {
	const archNodes = [
		["多模态素材", "海报 · 关键帧 · 文案 · 隐私页"],
		["受控感知", `${SIGNAL_IDS.length} 类词表信号 · 不做风险臆断`],
		["确定性规则库", `${knowledge.rules.length} 条规则 · ${knowledge.cases.length} 个真实出处`],
		["档期压力引擎", `${knowledge.calendar.length} 个三国节点 · 本地 0ms 重算`],
	] as const;
	const cases: Array<{ id: string; code: Market; name: string; tag: string; thumb?: string; text: string; open: () => void }> = [
		{
			id: "kr",
			code: "KR",
			name: "韩国",
			tag: "手势跨市场",
			thumb: "/demo/iphone-air-global.jpg",
			text: "iPhone Air 官网主视觉：全球版捏住机身的手指，韩国版删掉了",
			open: () => onCase("kr-kv", "KR"),
		},
		{
			id: "us",
			code: "US",
			name: "美国",
			tag: "FTC 合规",
			thumb: "/demo/us-desk.jpg",
			text: "核查“100% 准确”的依据，对照发布文案改稿",
			open: () => onCase("us-copy", "US"),
		},
		{
			id: "sg-food",
			code: "SG",
			name: "新加坡",
			tag: "宣发联动",
			thumb: "/demo/sg-bak-kut-teh.jpg",
			text: "肉骨茶饮食素材触发宗教提示，并自动阻断新加坡斋月发布周",
			open: () => onCase("sg-frame", "SG"),
		},
		{
			id: "sg-cny",
			code: "SG",
			name: "新加坡",
			tag: "错峰排期",
			text: "比较美国首发周与新加坡农历新年前后的窗口",
			open: onSingapore,
		},
	];
	return (
		<div className="workspace-page overview">
			<header>
				<p className="context-line">ClearRun 出海版</p>
				<h1>出海宣发预检</h1>
				<p className="lead">
					给出海的 AI 产品做上线前检查：先确认宣传素材在目标市场能不能用，再为每个市场找一个不撞档、不踩敏感日的发布周。
				</p>
			</header>
			<ol className="arch-strip" aria-label="核心工作原理">
				{archNodes.map(([title, desc]) => (
					<li key={title}>
						<strong>{title}</strong>
						<span>{desc}</span>
					</li>
				))}
			</ol>
			<div className="entry-grid">
				<button className="entry" onClick={onInput}>
					<span className="entry-mark" aria-hidden="true">
						宣
					</span>
					<strong>素材预检</strong>
					<span className="entry-text">选择目标市场，找出风险并对照改稿。</span>
					<span className="entry-go">
						新建预检 <Icon name="arrow" size={15} />
					</span>
				</button>
				<button className="entry" onClick={onPlan}>
					<span className="entry-mark" aria-hidden="true">
						发
					</span>
					<strong>发布排期</strong>
					<span className="entry-text">结合当地节点，比较各市场的发布窗口。</span>
					<span className="entry-go">
						查看排期 <Icon name="arrow" size={15} />
					</span>
				</button>
			</div>
			<section className="overview-section" aria-labelledby="overview-flow">
				<h2 id="overview-flow">流程</h2>
				<ol className="workflow-steps">
					{STEPS.map(([title, text]) => (
						<li key={title}>
							<b>{title}</b>
							<span>{text}</span>
						</li>
					))}
				</ol>
			</section>
			<section className="overview-section" aria-labelledby="overview-cases">
				<h2 id="overview-cases">示例案例</h2>
				<div className="case-list">
					{cases.map((c) => (
						<button key={c.id} className={c.thumb ? "has-thumb" : undefined} onClick={c.open}>
							<span className="case-market">
								{c.name}
								<small>{c.code}</small>
							</span>
							{c.thumb && <img className="case-thumb" src={c.thumb} alt="" loading="lazy" />}
							<span className="case-copy">
								<span className="case-tag">{c.tag}</span>
								<span className="case-text">{c.text}</span>
							</span>
							<Icon name="arrow" size={15} />
						</button>
					))}
				</div>
			</section>
			<p className="overview-note">
				模型只识别素材里的信号，风险由知识库判定。目前收录 {knowledge.rules.length} 条市场规则、{knowledge.cases.length} 个案例和{" "}
				{knowledge.calendar.length} 个日历事件。韩国示例取自 Apple 官网的真实素材，其余示例中的 Mira Agent 是虚构产品。
			</p>
		</div>
	);
}
