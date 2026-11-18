import { useEffect, useRef, useState } from "react";
import type { DetectedSignal, Health, ScanAsset, ScanSource } from "../shared/api.ts";
import { DEMO_CASES } from "../shared/demo.ts";
import type { Market } from "../shared/knowledge.ts";
import { imageToDataUrl, scan } from "./api.ts";
import { knownScanSource } from "./origin.ts";
import { Dialog, MarketSelect } from "./ui.tsx";

export interface UploadedMaterial {
	title: string;
	market: Market;
	assets: ScanAsset[];
	signals: DetectedSignal[];
	source: ScanSource;
	model?: string;
	fallbackModel?: boolean;
}

interface ImportProps {
	market: Market;
	mode?: Health["scan"];
	serviceError?: string;
	initial?: UploadedMaterial;
	demoId: string;
	onDemo: (id: string, market: Market) => void;
	onClose: () => void;
	onResult: (material: UploadedMaterial, market: Market) => void;
}

export function MaterialImport({ market, mode, serviceError, initial, demoId, onDemo, onClose, onResult }: ImportProps) {
	const [target, setTarget] = useState(market);
	const [example, setExample] = useState(demoId);
	const [file, setFile] = useState<File>();
	const [savedImage, setSavedImage] = useState(() => initial?.assets.find((a) => a.kind === "image"));
	const [copy, setCopy] = useState(() => initial?.assets.find((a) => a.kind === "copy")?.content ?? "");
	const [page, setPage] = useState(() => initial?.assets.find((a) => a.kind === "page")?.content ?? "");
	const [busy, setBusy] = useState(false);
	const [error, setError] = useState("");
	const request = useRef<AbortController | undefined>(undefined);
	const fileInput = useRef<HTMLInputElement>(null);
	useEffect(() => () => request.current?.abort(), []);
	const demoOnly = mode === "offline" && !initial;

	const run = async () => {
		if (request.current || mode !== "live") return;
		const controller = new AbortController();
		request.current = controller;
		setBusy(true);
		setError("");
		try {
			const assets: ScanAsset[] = [];
			if (file) assets.push({ id: "image", kind: "image", label: file.name, content: await imageToDataUrl(file) });
			else if (savedImage) assets.push(savedImage);
			if (copy.trim()) assets.push({ id: "copy", kind: "copy", label: "文案", content: copy.trim() });
			if (page.trim()) assets.push({ id: "page", kind: "page", label: "落地页备注", content: page.trim() });
			if (!assets.length) throw new Error("请添加一张图片或填写一段文字。");
			if (controller.signal.aborted) return;
			const response = await scan({ markets: [target], assets }, controller.signal);
			if (!controller.signal.aborted) {
				const title = file?.name ?? savedImage?.label ?? (copy.trim().split(/\r?\n/)[0]?.slice(0, 32) || "落地页素材");
				onResult(
					{
						title,
						market: target,
						assets,
						signals: response.signals,
						source: knownScanSource(response.source),
						...(response.model ? { model: response.model } : {}),
						...(response.fallbackModel ? { fallbackModel: true } : {}),
					},
					target,
				);
			}
		} catch (e) {
			if (!controller.signal.aborted) setError(e instanceof Error ? e.message : "预检失败，请重试。");
		} finally {
			request.current = undefined;
			if (!controller.signal.aborted) setBusy(false);
		}
	};

	return (
		<Dialog title={initial ? "重新预检素材" : "新建素材预检"} onClose={onClose}>
			<form
				className="dialog-body import-form"
				onSubmit={(e) => {
					e.preventDefault();
					if (demoOnly) onDemo(example, target);
					else void run();
				}}
			>
				<fieldset disabled={busy} className="import-fields">
					<MarketSelect value={target} onChange={setTarget} />
					{demoOnly && (
						<fieldset className="example-options">
							<legend>选择示例素材</legend>
							{DEMO_CASES.map((d) => (
								<label key={d.id}>
									<input
										type="radio"
										name="example"
										checked={d.id === example}
										onChange={() => {
											setExample(d.id);
											setTarget(d.focus);
										}}
									/>
									<span>{d.title}</span>
								</label>
							))}
						</fieldset>
					)}
					{mode !== "live" && (
						<p className="notice">
							{serviceError
								? "检测服务暂时不可用。"
								: mode === "offline"
									? "离线演示使用预置检测信号。上传自有素材需要实时检测服务。"
									: "正在连接检测服务…"}
						</p>
					)}
					{!demoOnly && (
						<fieldset disabled={mode !== "live"} className="import-fields">
							<label className="form-field">
								<span>图片或视频关键帧</span>
								<input
									ref={fileInput}
									type="file"
									accept="image/png,image/jpeg,image/webp"
									onChange={(e) => setFile(e.target.files?.[0])}
								/>
							</label>
							{(savedImage || file) && (
								<div className="attachment-note">
									{file?.name ?? savedImage?.label}
									<button
										type="button"
										className="text-button"
										onClick={() => {
											setFile(undefined);
											setSavedImage(undefined);
											if (fileInput.current) fileInput.current.value = "";
										}}
									>
										移除图片
									</button>
								</div>
							)}
							<label className="form-field">
								<span>发布文案</span>
								<textarea
									value={copy}
									onChange={(e) => setCopy(e.target.value)}
									maxLength={4000}
									placeholder="粘贴广告语或发布稿"
									rows={3}
								/>
							</label>
							<label className="form-field">
								<span>落地页备注</span>
								<textarea
									value={page}
									onChange={(e) => setPage(e.target.value)}
									maxLength={4000}
									placeholder="例如隐私政策语言、数据存储地区、推荐语来源"
									rows={2}
								/>
							</label>
						</fieldset>
					)}
				</fieldset>
				{error && (
					<p role="alert" className="error-text">
						检测失败，没有实时分析结果。{error}
					</p>
				)}
				<div className="dialog-actions">
					<button type="button" className="button" onClick={onClose}>
						{busy ? "取消检查" : "关闭"}
					</button>
					<button type="submit" className="button primary" disabled={(!demoOnly && mode !== "live") || busy}>
						{busy ? "检查中…" : demoOnly ? "开始示例预检" : "开始预检"}
					</button>
				</div>
			</form>
		</Dialog>
	);
}
