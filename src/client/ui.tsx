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

export interface HighlightPart {
	text: string;
	mark: boolean;
}

/** Exact needles only. A paraphrase that is not a substring is reported as missed and is not highlighted. */
export function highlightParts(text: string, needles: string[]): { parts: HighlightPart[]; missed: string[] } {
	const lower = text.toLowerCase();
	const spans: [number, number][] = [];
	const missed: string[] = [];
	for (const needle of needles) {
		const raw = needle.trim();
		if (raw.length < 2) continue;
		const at = lower.indexOf(raw.toLowerCase());
		if (at < 0) {
			missed.push(raw);
			continue;
		}
		if (spans.every(([start, end]) => at >= end || at + raw.length <= start)) spans.push([at, at + raw.length]);
	}
	spans.sort((a, b) => a[0] - b[0]);
	const parts: HighlightPart[] = [];
	let cursor = 0;
	for (const [start, end] of spans) {
		if (start > cursor) parts.push({ text: text.slice(cursor, start), mark: false });
		parts.push({ text: text.slice(start, end), mark: true });
		cursor = end;
	}
	if (cursor < text.length || parts.length === 0) parts.push({ text: text.slice(cursor), mark: false });
	return { parts, missed };
}

/** Prefer exact quotes. Evidence is only a fallback when the detection has no quotes. */
export function signalNeedles(signal: { evidence: string; quotes?: string[] }): string[] {
	const quotes = (signal.quotes ?? []).map((quote) => quote.trim()).filter((quote) => quote.length >= 2);
	if (quotes.length) return quotes;
	const evidence = signal.evidence.trim();
	return evidence.length >= 3 ? [evidence] : [];
}

/** Wraps exact matches. Unmatched needles are named instead of being drawn as a highlight. */
export function Highlight({ text, needles, severity }: { text: string; needles: string[]; severity?: Severity }) {
	const { parts, missed } = highlightParts(text, needles);
	return (
		<>
			{parts.map((part, index) =>
				part.mark ? (
					<mark key={index} className={severity}>
						{part.text}
					</mark>
				) : (
					<span key={index}>{part.text}</span>
				),
			)}
			{missed.length > 0 && (
				<span className="locate-miss" role="note" title={missed.join("\n")}>
					无法在当前文本中精确定位
				</span>
			)}
		</>
	);
}
