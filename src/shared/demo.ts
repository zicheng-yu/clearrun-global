/**
 * The three hero cases for the demo, each with an original and a localized variant. `signals` are what
 * the perception model is expected to report for that material: the offline demo answers from them, and
 * they double as the expected output when testing the live model against the same assets.
 * Images in public/demo/ are illustrative campaign assets for this fictional product.
 */
import type { DetectedSignal } from "./api.ts";
import type { Market, Segment } from "./knowledge.ts";
import type { SignalId } from "./signals.ts";

/** A fictional product: not a real brand. */
export const PRODUCT = "Mira Agent";

export interface DemoAsset {
	id: string;
	kind: "image" | "copy" | "page";
	label: string;
	/** image: a path under public/; copy and page: the text itself. */
	content: string;
}

export interface DemoVariant {
	label: string;
	assets: DemoAsset[];
	signals: DetectedSignal[];
}

export interface DemoCase {
	id: string;
	title: string;
	pitch: string;
	focus: Market;
	markets: Market[];
	segment: Segment;
	original: DemoVariant;
	localized: DemoVariant;
}

export const DEMO_CASES: DemoCase[] = [
	{
		id: "kr-kv",
		title: "产品主视觉与隐私页",
		pitch: "对照全球统一版与韩国本地化版，检查主视觉中的手势、隐私页语言和数据存储说明。",
		focus: "KR",
		markets: ["US", "SG", "KR"],
		segment: "prosumer",
		original: {
			label: "全球统一版",
			assets: [
				{ id: "kv", kind: "image", label: "主视觉 KV", content: "/demo/mira-global.webp" },
				{ id: "copy", kind: "copy", label: "主文案", content: "Mira Agent. Your work, handled." },
				{
					id: "page",
					kind: "page",
					label: "落地页与隐私页",
					content: "落地页语言：英文、简体中文。隐私政策只有英文版，没有写明用户数据存储在哪个地区、是否跨境传输。AI 生成的内容没有任何标识说明。",
				},
			],
			signals: [
				{ signal: "gesture.pinch", asset: "kv", evidence: "拇指和食指捏住手机的上下两端", box: [0.52, 0.076, 0.466, 0.82], confidence: 0.92 },
				{ signal: "privacy.no_local_policy", asset: "page", evidence: "隐私政策只有英文版", quotes: ["隐私政策只有英文版"], confidence: 0.95 },
				{
					signal: "privacy.no_data_residency",
					asset: "page",
					evidence: "没有写明数据存储地区与跨境传输",
					quotes: ["没有写明用户数据存储在哪个地区、是否跨境传输"],
					confidence: 0.95,
				},
				{ signal: "ai.no_disclosure", asset: "page", evidence: "AI 生成内容没有标识说明", quotes: ["AI 生成的内容没有任何标识说明"], confidence: 0.9 },
			],
		},
		localized: {
			label: "韩国本地化版",
			assets: [
				{ id: "kv", kind: "image", label: "主视觉 KV（韩国版）", content: "/demo/mira-kr.webp" },
				{ id: "copy", kind: "copy", label: "主文案", content: "Mira Agent. 당신의 일, 맡겨 주세요." },
				{
					id: "page",
					kind: "page",
					label: "落地页与隐私页",
					content: "落地页和隐私政策提供韩文版。用户数据存储在首尔区域，不向第三国传输；韩国本地代表与联系方式已列出。AI 生成的内容会标注“AI 생성”。",
				},
			],
			signals: [],
		},
	},
	{
		id: "us-copy",
		title: "产品发布文案与用户推荐语",
		pitch: "对照初稿与改稿，检查产品效果承诺、用户推荐语及其来源。",
		focus: "US",
		markets: ["US"],
		segment: "enterprise",
		original: {
			label: "初稿",
			assets: [
				{ id: "hero", kind: "image", label: "落地页首屏", content: "/demo/b-hero.svg" },
				{
					id: "copy",
					kind: "copy",
					label: "发布文案",
					content: "Fire your assistant. Hire Mira.\n100% accurate. Never hallucinates.\n“Mira wrote my wedding vows in 30 seconds.” — Jamie R., Austin",
				},
				{ id: "page", kind: "page", label: "落地页备注", content: "首屏的三条用户推荐语由 AI 生成，用来“示意效果”，不是真实用户。" },
			],
			signals: [
				{ signal: "claim.replace_humans", asset: "hero", evidence: "Fire your assistant. Hire Mira.", box: [0.08, 0.26, 0.84, 0.16], confidence: 0.95 },
				{ signal: "claim.absolute_accuracy", asset: "hero", evidence: "100% accurate. Never hallucinates.", box: [0.08, 0.44, 0.6, 0.08], confidence: 0.95 },
				{
					signal: "claim.emotional_ghostwriting",
					asset: "copy",
					evidence: "Mira wrote my wedding vows",
					quotes: ["Mira wrote my wedding vows in 30 seconds."],
					confidence: 0.85,
				},
				{
					signal: "claim.ai_testimonial",
					asset: "page",
					evidence: "推荐语由 AI 生成，不是真实用户",
					quotes: ["用户推荐语由 AI 生成", "不是真实用户"],
					confidence: 0.95,
				},
			],
		},
		localized: {
			label: "改稿",
			assets: [
				{ id: "hero", kind: "image", label: "落地页首屏", content: "/demo/b-hero-fixed.svg" },
				{
					id: "copy",
					kind: "copy",
					label: "发布文案",
					content: "Give your team back 10 hours a week.\n92% task success on our public benchmark — see the methodology.\n“Mira drafts the follow-ups so I can focus on the client.” — verified customer",
				},
				{ id: "page", kind: "page", label: "落地页备注", content: "推荐语全部来自真实付费客户，已获书面授权。基准测试方法与数据集公开。" },
			],
			signals: [],
		},
	},
	{
		id: "sg-frame",
		title: "多语言宣传片关键帧",
		pitch: "对照初版与重拍版，检查宣传片如何通过选角、化妆和字幕表现多语言场景。",
		focus: "SG",
		markets: ["SG", "US"],
		segment: "consumer",
		original: {
			label: "初版",
			assets: [
				{ id: "frame", kind: "image", label: "视频关键帧", content: "/demo/c-frame.svg" },
				{ id: "copy", kind: "copy", label: "字幕", content: "Mira speaks your language — 华语 · Bahasa Melayu · தமிழ் · English" },
			],
			signals: [
				{ signal: "people.one_actor_many_races", asset: "frame", evidence: "同一位演员出现在三个族群角色中", box: [0.02, 0.1, 0.96, 0.66], confidence: 0.9 },
				{ signal: "people.altered_skin_tone", asset: "frame", evidence: "第二、三个角色的肤色被刻意加深", box: [0.35, 0.12, 0.62, 0.5], confidence: 0.85 },
				{ signal: "food.pork", asset: "frame", evidence: "桌上一碗肉骨茶（猪肋排汤）", box: [0.06, 0.62, 0.22, 0.2], confidence: 0.8 },
			],
		},
		localized: {
			label: "重拍版",
			assets: [
				{ id: "frame", kind: "image", label: "视频关键帧（重拍）", content: "/demo/c-frame-fixed.svg" },
				{ id: "copy", kind: "copy", label: "字幕", content: "Mira speaks your language — 华语 · Bahasa Melayu · தமிழ் · English" },
			],
			signals: [],
		},
	},
];

export const demoCase = (id: string): DemoCase | undefined => DEMO_CASES.find((c) => c.id === id);

/**
 * Fixed theme → calendar script. The Singapore original already carries `food.pork`;
 * `sg-ramadan-2027` in the calendar blocks that signal. Removing the theme must clear the same week.
 */
export const THEME_SCHEDULE_SCRIPT: { demoId: string; signal: SignalId; eventId: string } = {
	demoId: "sg-frame",
	signal: "food.pork",
	eventId: "sg-ramadan-2027",
};
