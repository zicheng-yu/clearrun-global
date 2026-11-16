import type { CSSProperties } from "react";

const paths = {
	workspace: "M3.5 4.5h17v15h-17z M9 4.5v15",
	scan: "M8 3.5H4v4.5m12-4.5h4v4.5M4 16v4.5h4m12-4.5v4.5h-4M7 12h10",
	calendar: "M4 6h16v14H4z M8 3.5V8m8-4.5V8M4 10.5h16m-12 4h3",
	stack: "m12 3 9 5-9 5-9-5z m-9 9 9 5 9-5m-18 4 9 5 9-5",
	image: "M3.5 4.5h17v15h-17z M4 17l5-5 4 4 3-3 4 4 M8 8.5h.1",
	text: "M4 5.5h16M4 10h12m-12 4.5h16M4 19h9",
	page: "M5.5 3h9l4 4v14h-13z M14 3v5h4m-10 4h7m-7 4h5",
	film: "M3 5h18v14H3z M7 5v14m10-14v14M3 9h4m-4 5h4m10-5h4m-4 5h4",
	info: "M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0 M12 10.5v6m0-9.5v.1",
	chevron: "m9 5.5 6.5 6.5L9 18.5",
	down: "m6.5 9.5 5.5 5.5 5.5-5.5",
	arrow: "M4 12h15m-6-6 6 6-6 6",
	external: "M13 4.5h6.5V11m0-6.5-10 10M10 6H5v13h13v-5",
	expand: "M14.5 4H20v5.5M20 4l-6 6M9.5 20H4v-5.5M4 20l6-6",
	plus: "M12 5v14m-7-7h14",
	close: "m6 6 12 12M18 6 6 18",
	globe: "M21 12a9 9 0 1 1-18 0 9 9 0 1 1 18 0 M3.5 12h17M12 3c-5 5-5 13 0 18 5-5 5-13 0-18z",
	version: "M3.5 5h7v14h-7z M13.5 5h7v14h-7z",
	alert: "m12 3 9 17H3z M12 9v5m0 2.5v.1",
	check: "m5 12 4.5 4.5L19 7",
	shield: "m12 3 7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z m-3 9 2 2 4-4",
	list: "M8 6h12M8 12h12M8 18h12M4 6h.1M4 12h.1M4 18h.1",
	adjust: "M4 7h7m4 0h5M4 17h2m4 0h10M11 4v6m-5 4v6",
	book: "M3 5.5c4-1.5 6.5-1 9 1 2.5-2 5-2.5 9-1v14c-4-1.5-6.5-1-9 1-2.5-2-5-2.5-9-1z M12 6.5v14",
	upload: "M12 15V3.5m-5 5 5-5 5 5M4 15v5h16v-5",
	target: "M20 12a8 8 0 1 1-16 0 8 8 0 1 1 16 0m-5 0a3 3 0 1 1-6 0 3 3 0 1 1 6 0",
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name, size = 16, className, style }: { name: IconName; size?: number; className?: string; style?: CSSProperties }) {
	return (
		<svg
			width={size}
			height={size}
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="1.6"
			strokeLinecap="round"
			strokeLinejoin="round"
			className={className}
			style={style}
			aria-hidden="true"
		>
			<path d={paths[name]} />
		</svg>
	);
}
