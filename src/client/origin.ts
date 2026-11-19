import type { ScanSource } from "../shared/api.ts";

export type OriginKind = ScanSource | "pending" | "error" | "unknown";

export interface OriginCopy {
	kind: OriginKind;
	label: string;
	detail: string;
}

/** Unknown payloads are a failure fallback, never a live analysis. */
export function knownScanSource(source: unknown): ScanSource {
	return source === "fixture" || source === "model" || source === "offline" || source === "fallback" ? source : "fallback";
}

const CAUTION: Record<ScanSource, number> = { fallback: 0, offline: 1, fixture: 2, model: 3 };

/** When two reads disagree, keep the label that is further from "live". */
export function preferScanSource(sources: Array<ScanSource | undefined>): ScanSource | undefined {
	let best: ScanSource | undefined;
	for (const source of sources) {
		if (!source) continue;
		if (!best || CAUTION[source] < CAUTION[best]) best = source;
	}
	return best;
}

export function originCopy(input: {
	phase: "pending" | "error" | "ready";
	source?: ScanSource;
	model?: string;
	fallbackModel?: boolean;
}): OriginCopy {
	if (input.phase === "pending") {
		return { kind: "pending", label: "尚未检测", detail: "正在读取这次检测结果，还不能当作预检结论。" };
	}
	if (input.phase === "error") {
		return { kind: "error", label: "检测失败", detail: "没有可用结论，不能当作实时分析、预置示例或已通过预检。" };
	}
	switch (input.source) {
		case "fixture":
			return { kind: "fixture", label: "预置示例", detail: "预置示例结果，使用预置感知信号（非本次模型实时识别）；规则裁决与档期引擎均为本地实时运行。" };
		case "model":
			return input.fallbackModel
				? {
						kind: "model",
						label: "实时分析",
						detail: "实时模型分析由备用模型" + (input.model ? " " + input.model : "") + " 完成，不是主模型，也不是离线演示。",
					}
				: {
						kind: "model",
						label: "实时分析",
						detail: "实时模型分析。由感知模型提取信号" + (input.model ? "（" + input.model + "）" : "") + "，规则库给出判断。",
					};
		case "offline":
			return { kind: "offline", label: "离线演示", detail: "离线模拟，使用预置信号，不是实时分析；规则裁决与档期引擎均为本地实时实算。" };
		case "fallback":
			return { kind: "fallback", label: "检测回退", detail: "实时分析没有完成。这是失败回退，不能当成实时分析或已通过预检。" };
		default:
			return { kind: "unknown", label: "来源不明", detail: "没有标明来源，不能当作实时分析。" };
	}
}
