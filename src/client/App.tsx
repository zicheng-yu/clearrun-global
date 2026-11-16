import { useEffect, useState } from "react";
import type { Health } from "../shared/api.ts";
import { DEMO_CASES, PRODUCT, demoCase } from "../shared/demo.ts";
import { knowledge, type Market } from "../shared/knowledge.ts";
import { useJson } from "./api.ts";
import { Icon, type IconName } from "./Icon.tsx";
import { LaunchView } from "./LaunchView.tsx";
import { MaterialImport, type UploadedMaterial } from "./MaterialImport.tsx";
import { ScanView, type LaunchHandoff } from "./ScanView.tsx";
import { Dialog } from "./ui.tsx";

type View = "creative" | "launch";
const VIEW_LABEL: Record<View, string> = { creative: "素材预检", launch: "发布排期" };
const VIEW_ICON: Record<View, IconName> = { creative: "scan", launch: "calendar" };
const LIBRARY_ITEMS: Record<string, { icon: IconName; label: string }> = {
	"kr-kv": { icon: "image", label: "韩国主视觉" },
	"us-copy": { icon: "text", label: "美国宣称文案" },
	"sg-frame": { icon: "film", label: "新加坡宣传片" },
};
const fromUrl = (): View => (new URLSearchParams(location.search).get("view") === "launch" ? "launch" : "creative");

interface NavigationProps {
	view: View;
	materialId: string;
	upload?: UploadedMaterial;
	onView: (view: View) => void;
	onMaterial: (id: string) => void;
	onInfo: () => void;
}

function Navigation({ view, materialId, upload, onView, onMaterial, onInfo }: NavigationProps) {
	return (
		<div className="nav-content">
			<div className="brand">
				<img src="/favicon.svg" width="29" height="29" alt="" />
				<span>ClearRun</span>
			</div>
			<nav aria-label="工作台导航" className="nav-group">
				<p className="nav-heading">工作台</p>
				{(["creative", "launch"] as const).map((v) => (
					<button
						key={v}
						className="nav-link"
						title={VIEW_LABEL[v]}
						aria-current={view === v ? "page" : undefined}
						onClick={() => onView(v)}
					>
						<Icon name={VIEW_ICON[v]} size={17} />
						{VIEW_LABEL[v]}
					</button>
				))}
			</nav>
			<nav aria-label="示例素材" className="nav-group library">
				<p className="nav-heading">示例素材</p>
				{DEMO_CASES.map((d) => (
					<button
						key={d.id}
						className="library-link"
						title={d.title}
						aria-label={LIBRARY_ITEMS[d.id]?.label ?? d.title}
						aria-pressed={view === "creative" && materialId === d.id}
						onClick={() => onMaterial(d.id)}
					>
						<Icon name={LIBRARY_ITEMS[d.id]?.icon ?? "page"} />
						<span>{LIBRARY_ITEMS[d.id]?.label ?? d.title}</span>
					</button>
				))}
			</nav>
			{upload && (
				<nav aria-label="本次上传" className="nav-group library">
					<p className="nav-heading">本次上传</p>
					<button
						className="library-link"
						aria-label={upload.title}
						title={upload.title}
						aria-pressed={view === "creative" && materialId === "upload"}
						onClick={() => onMaterial("upload")}
					>
						<Icon name="upload" />
						<span>{upload.title}</span>
					</button>
				</nav>
			)}
			<div className="nav-foot">
				<button className="nav-link" title="工作台信息" onClick={onInfo}>
					<Icon name="info" />
					工作台信息
				</button>
			</div>
		</div>
	);
}

function WorkspaceInfo({ health, error, onClose }: { health?: Health; error?: string; onClose: () => void }) {
	return (
		<Dialog title="工作台信息" onClose={onClose}>
			<div className="dialog-body info-body">
				<h3>检测服务</h3>
				<p>
					{error
						? "无法连接检测服务，当前没有可展示的实时分析结果。"
						: health?.scan === "live"
							? "服务可用时，自有素材可由多模态模型提取信号，规则库给出市场判断。顶栏只表示服务状态；每次预检会单独标明预置示例、实时分析或离线演示。"
							: health
								? "当前是离线演示，使用预置检测信号，不是实时分析。发布档期在浏览器中计算。"
								: "正在读取服务状态…"}
				</p>
				{health?.model && <p className="mono">{health.model}</p>}
				{health?.budget && (
					<p>
						今日模型费用 ${health.budget.todayUsd.toFixed(3)} / ${health.budget.dailyCapUsd.toFixed(2)}
					</p>
				)}
				<h3>数据与来源</h3>
				<p>
					知识库收录 {knowledge.rules.length} 条市场规则、{knowledge.cases.length} 个案例和 {knowledge.calendar.length}{" "}
					个日历事件。规则详情中可查看核实状态与案例来源。法定假日来自 Nager.Date，预估事件在排期中单独标注。
				</p>
				<p>{PRODUCT} 是虚构的演示项目，不是这个工具。演示素材用于说明预检流程。预检仅覆盖已收录的风险，不能替代法律意见或投放许可。</p>
				<h3>分数、压力和修订示例</h3>
				<p>
					主结果是已命中项和待处理项。预检评分基于当前知识库规则；100 表示当前规则未命中已知风险，不是合规认证，也不保证通过。档期里的压力指数是模型计算结果，不是真实市场注意力百分比。预置修订稿是本地化修订示例，不会自动改写素材。
					标记为待核实的案例还没有完成出处核对。
				</p>
			</div>
		</Dialog>
	);
}

export function App() {
	const health = useJson<Health>("/api/health");
	const [view, setView] = useState<View>(fromUrl);
	const [market, setMarket] = useState<Market>(DEMO_CASES[0].focus);
	const [materialId, setMaterialId] = useState(DEMO_CASES[0].id);
	const [reviewRun, setReviewRun] = useState(0);
	const [upload, setUpload] = useState<UploadedMaterial>();
	const [modal, setModal] = useState<"navigation" | "info" | "import" | "revise" | null>(null);
	const [planner, setPlanner] = useState<{ revision: number; handoff?: LaunchHandoff } | null>(() =>
		fromUrl() === "launch" ? { revision: 0 } : null,
	);

	useEffect(() => {
		const restore = () => {
			const next = fromUrl();
			setView(next);
			if (next === "launch") setPlanner((p) => p ?? { revision: 0 });
			setModal(null);
		};
		window.addEventListener("popstate", restore);
		return () => window.removeEventListener("popstate", restore);
	}, []);

	const open = (next: View) => {
		setModal(null);
		if (next === "launch") setPlanner((p) => p ?? { revision: 0 });
		if (view !== next) {
			const url = new URL(location.href);
			if (next === "launch") url.searchParams.set("view", "launch");
			else url.searchParams.delete("view");
			history.pushState(null, "", url);
			setView(next);
		}
		window.scrollTo(0, 0);
	};

	const nav: NavigationProps = {
		view,
		materialId,
		upload,
		onView: open,
		onMaterial: (id) => {
			const picked = demoCase(id);
			const switching = id !== materialId;
			if (picked) setMarket(picked.focus);
			else if (id === "upload" && upload && switching) setMarket(upload.market);
			if (switching || picked) {
				setReviewRun((n) => n + 1);
				setPlanner(null);
			}
			setMaterialId(id);
			open("creative");
		},
		onInfo: () => setModal("info"),
	};
	const demo = demoCase(materialId) ?? DEMO_CASES[0];
	const activeUpload = materialId === "upload" ? upload : undefined;
	const startReview = (id: string, target: Market) => {
		setMarket(target);
		setMaterialId(id);
		setReviewRun((n) => n + 1);
		setPlanner(null);
		open("creative");
	};
	const mode = health.data?.scan;
	const serviceLabel = health.error ? "服务不可用" : mode === "live" ? "服务可用" : mode === "offline" ? "离线演示" : "连接中";
	const serviceTitle = health.error
		? "检测服务不可用。当前没有实时分析结果。"
		: mode === "live"
			? "检测服务可用。这只说明服务状态，不代表当前结果来自实时分析。"
			: mode === "offline"
				? "离线演示。结果来自预置信号，不是实时分析。"
				: "正在连接检测服务。";

	return (
		<div className="app-shell">
			<a className="skip-link" href="#work-area">
				跳至工作区
			</a>
			<aside className="sidebar">
				<Navigation {...nav} />
			</aside>
			<div className="main-column">
				<header className="topbar">
					<div className="breadcrumb">
						<button className="icon-button open-nav" aria-label="打开工作台导航" onClick={() => setModal("navigation")}>
							<Icon name="workspace" size={19} />
						</button>
						<Icon name="workspace" size={16} className="desktop-crumb-icon" />
						<span className="workspace-label">出海工作台</span>
						<span className="crumb-slash">/</span>
						<span>{VIEW_LABEL[view]}</span>
					</div>
					<span className={"service-status " + (mode === "live" ? "connected" : "")} title={serviceTitle}>
						<i />
						{serviceLabel}
					</span>
				</header>
				<main id="work-area" tabIndex={-1}>
					<div hidden={view !== "creative"}>
						<ScanView
							key={materialId + "/" + reviewRun}
							demo={demo}
							own={activeUpload}
							market={market}
							onMarketChange={setMarket}
							onImport={() => setModal("import")}
							onRevise={() => setModal("revise")}
							onPlanLaunch={(handoff) => {
								setPlanner((p) => ({ revision: (p?.revision ?? 0) + 1, handoff }));
								open("launch");
							}}
						/>
					</div>
					{planner && (
						<div hidden={view !== "launch"}>
							<LaunchView key={planner.revision} handoff={planner.handoff} onReturn={() => open("creative")} />
						</div>
					)}
				</main>
			</div>
			{modal === "navigation" && (
				<Dialog title="工作台导航" onClose={() => setModal(null)}>
					<Navigation {...nav} />
				</Dialog>
			)}
			{modal === "info" && <WorkspaceInfo health={health.data} error={health.error} onClose={() => setModal(null)} />}
			{(modal === "import" || modal === "revise") && (
				<MaterialImport
					initial={modal === "revise" ? activeUpload : undefined}
					demoId={demo.id}
					market={market}
					mode={mode}
					serviceError={health.error}
					onClose={() => setModal(null)}
					onDemo={startReview}
					onResult={(next, target) => {
						setUpload({ ...next, market: target });
						startReview("upload", target);
					}}
				/>
			)}
		</div>
	);
}
