import { useEffect, useState } from "react";
import type { ScanAsset, ScanRequest, ScanResponse } from "../shared/api.ts";

async function errorMessage(response: Response): Promise<string> {
	const body = (await response.json().catch(() => ({}))) as { message?: string };
	return body.message ?? `请求失败（HTTP ${response.status}）`;
}

export function useJson<T>(url: string): { data?: T; error?: string } {
	const [state, setState] = useState<{ data?: T; error?: string }>({});
	useEffect(() => {
		let live = true;
		fetch(url)
			.then(async (r) => (r.ok ? ((await r.json()) as T) : Promise.reject(new Error(await errorMessage(r)))))
			.then((data) => live && setState({ data }))
			.catch((e: unknown) => live && setState({ error: e instanceof Error ? e.message : String(e) }));
		return () => {
			live = false;
		};
	}, [url]);
	return state;
}

export async function scan(request: ScanRequest, signal?: AbortSignal): Promise<ScanResponse> {
	const response = await fetch("/api/scan", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(request), signal });
	if (!response.ok) throw new Error(await errorMessage(response));
	return (await response.json()) as ScanResponse;
}

/**
 * Loads an image (a File or a URL, SVG included) and re-encodes it as a JPEG data: URL no larger than
 * `maxSide` pixels on its long edge: what the perception model accepts, at a size that keeps requests small.
 */
export async function imageToDataUrl(source: File | string, maxSide = 1400): Promise<string> {
	const url = typeof source === "string" ? source : URL.createObjectURL(source);
	try {
		const img = new Image();
		img.decoding = "async";
		img.src = url;
		await img.decode();
		const scale = Math.min(1, maxSide / Math.max(img.naturalWidth || 1, img.naturalHeight || 1));
		const canvas = document.createElement("canvas");
		canvas.width = Math.max(1, Math.round((img.naturalWidth || maxSide) * scale));
		canvas.height = Math.max(1, Math.round((img.naturalHeight || maxSide) * scale));
		const ctx = canvas.getContext("2d");
		if (!ctx) throw new Error("浏览器不支持 canvas");
		ctx.fillStyle = "#ffffff";
		ctx.fillRect(0, 0, canvas.width, canvas.height);
		ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
		return canvas.toDataURL("image/jpeg", 0.88);
	} finally {
		if (typeof source !== "string") URL.revokeObjectURL(url);
	}
}

export type { ScanAsset };
