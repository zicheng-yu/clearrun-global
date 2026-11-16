import { useId, useLayoutEffect, useRef, type ReactNode } from "react";
import type { Level } from "../engine/creative/assess.ts";
import { MARKETS, MARKET_LABEL, SEVERITY_LABEL, type Market, type Severity, type Verified } from "../shared/knowledge.ts";
import { Icon } from "./Icon.tsx";

export const LEVEL_LABEL: Record<Level, string> = { red: "建议修改后再投放", yellow: "建议投放前复核", green: "可考虑使用" };

export function SeverityLabel({ severity }: { severity: Severity }) {
	return (
		<span className={"severity " + severity}>
			<i aria-hidden="true" />
			{SEVERITY_LABEL[severity]}
		</span>
	);
}

export function VerifiedLabel({ value }: { value: Verified }) {
	return (
		<span className="verified">
			<Icon name={value === true ? "shield" : "info"} size={13} />
			{value === true ? "已核实" : value === "partial" ? "部分核实" : "待核实"}
		</span>
	);
}

export function MarketSelect({ value, onChange }: { value: Market; onChange: (market: Market) => void }) {
	return (
		<label className="property">
			<span>目标市场</span>
			<span className="select-wrap market-select">
				<Icon name="globe" size={15} />
				<select aria-label="目标市场" value={value} onChange={(e) => onChange(e.target.value as Market)}>
					{MARKETS.map((m) => (
						<option key={m} value={m}>
							{MARKET_LABEL[m]} · {m}
						</option>
					))}
				</select>
				<Icon name="down" size={13} />
			</span>
		</label>
	);
}

/** Native modal provides keyboard focus trapping, Escape and return to the opener. */
export function Dialog({ title, children, onClose, wide = false }: { title: string; children: ReactNode; onClose: () => void; wide?: boolean }) {
	const ref = useRef<HTMLDialogElement>(null);
	const id = useId();
	useLayoutEffect(() => {
		const dialog = ref.current;
		const opener = document.activeElement;
		dialog?.showModal();
		return () => {
			dialog?.close();
			if (opener instanceof HTMLElement && opener.isConnected) opener.focus({ preventScroll: true });
		};
	}, []);
	return (
		<dialog
			ref={ref}
			aria-labelledby={id}
			className={"dialog" + (wide ? " dialog-wide" : "")}
			onCancel={(e) => {
				e.preventDefault();
				onClose();
			}}
			onClick={(e) => {
				if (e.target === e.currentTarget) onClose();
			}}
		>
			<div className="dialog-inner">
				<header className="dialog-head">
					<h2 id={id}>{title}</h2>
					<button className="icon-button" aria-label="关闭对话框" onClick={onClose}>
						<Icon name="close" size={18} />
					</button>
				</header>
				{children}
			</div>
		</dialog>
	);
}

/** Wraps the first case-insensitive match of each piece of evidence. */
export function Highlight({ text, needles }: { text: string; needles: string[] }) {
	const lower = text.toLowerCase();
	const spans: [number, number][] = [];
	for (const needle of needles) {
		const n = needle.trim().toLowerCase();
		if (n.length < 3) continue;
		const at = lower.indexOf(n);
		if (at >= 0 && spans.every(([s, e]) => at >= e || at + n.length <= s)) spans.push([at, at + n.length]);
	}
	spans.sort((a, b) => a[0] - b[0]);
	const out: ReactNode[] = [];
	let cursor = 0;
	for (const [s, e] of spans) {
		out.push(text.slice(cursor, s), <mark key={s}>{text.slice(s, e)}</mark>);
		cursor = e;
	}
	out.push(text.slice(cursor));
	return <>{out}</>;
}
