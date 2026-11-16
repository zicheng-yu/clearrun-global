/**
 * Who a cf command would target. Mock is selected only with `--mode mock`.
 * Omitting the mode (the Vite production build, and `cf build` / `cf deploy` with no flag)
 * stays on the live settings: no demo hostname, no demo database, and a secret binding.
 * Nothing in this module creates DNS records or uploads a Worker.
 */

export const CLOUDFLARE_ACCOUNT_ID = "8bd3c442c3f8ce8003575fc10f2cb079";
/** zichengyu.com. Kept for the publish notes. The config does not create a route from this id. */
export const ZICHENGYU_ZONE_ID = "4d5cd4ce4448701dfa3de49e4ef55601";

/** This product's Worker. Do not rename it onto the original ClearRun Worker. */
export const WORKER_NAME = "clearrun-global";
export const ORIGINAL_WORKER_NAME = "clearrun";
export const ORIGINAL_HOSTNAME = "clearrun.zichengyu.com";

/** Demo hostname. Not `clearrun-global.zichengyu.com`, and not the original site. */
export const DEMO_HOSTNAME = "global-clearrun.zichengyu.com";

/** Empty database created for this demo. Not the original ClearRun database. */
export const DEMO_D1 = {
	id: "1537b307-566a-40fc-8bf9-04ae80dac074",
	name: "clearrun-global-demo",
} as const;

/** Not a real database. Live deploys stay on this placeholder until a separate live database exists. */
export const LIVE_D1_PLACEHOLDER = {
	id: "00000000-0000-4000-8000-00000000c1a0",
	name: "clearrun-global-db",
} as const;

export interface ModeTarget {
	mock: boolean;
	workerName: typeof WORKER_NAME;
	scanMode: "mock" | "live";
	d1: { readonly id: string; readonly name: string };
	domains: string[];
	requiresOpenRouterSecret: boolean;
}

export function modeTarget(mode: string | undefined): ModeTarget {
	const mock = mode === "mock";
	return {
		mock,
		workerName: WORKER_NAME,
		scanMode: mock ? "mock" : "live",
		d1: mock ? DEMO_D1 : LIVE_D1_PLACEHOLDER,
		domains: mock ? [DEMO_HOSTNAME] : [],
		requiresOpenRouterSecret: !mock,
	};
}
