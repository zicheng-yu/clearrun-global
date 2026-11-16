import type { ScanSource } from "../shared/api.ts";
import { originCopy } from "./origin.ts";

export function OriginNote({
	phase,
	source,
	model,
	fallbackModel,
}: {
	phase: "pending" | "error" | "ready";
	source?: ScanSource;
	model?: string;
	fallbackModel?: boolean;
}) {
	const origin = originCopy({ phase, source, model, fallbackModel });
	return (
		<p className="origin-note" data-origin={origin.kind} aria-label={"本次检测来源：" + origin.label}>
			<strong>{origin.label}</strong>
			<span>{origin.detail}</span>
		</p>
	);
}
