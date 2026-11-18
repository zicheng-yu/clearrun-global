/**
 * The three hero cases for the demo, each with an original and a localized variant. `signals` are what
 * the perception model is expected to report for that material: the offline demo answers from them, and
 * they double as the expected output when testing the live model against the same assets.
 * The Korea case uses the Apple iPhone Air product photos already on the demo site.
 * The US and Singapore cases use credited photographs. They are not photos of Mira.
 * Sources and licenses are in public/demo/CREDITS.md.
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
	/** Shown on the image. Says what the file actually is. */
	note?: string;
}

export interface DemoVariant {
	label: string;
	assets: DemoAsset[];
	signals: DetectedSignal[];
}

export interface DemoCase {
	id: string;
	title: string;
	/** Whose material this is; defaults to the fictional PRODUCT. */
	product?: string;
	/** Set when the material is a real, published campaign rather than an illustration. */
	source?: { label: string; url: string };
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
		title: "iPhone Air 官网主视觉",
		product: "Apple iPhone Air",
		source: { label: "apple.com", url: "https://www.apple.com/kr/iphone-air/" },
		pitch: "对照 Apple 官网的全球版与韩国版主视觉：其他地区用手指捏住机身，韩国版只展示产品。",
		focus: "KR",
		markets: ["US", "SG", "KR"],
		segment: "consumer",
		original: {
			label: "全球版",
			assets: [
				{
					id: "kv",
					kind: "image",
					label: "主视觉（美国、台湾等地区官网）",
					content: "/demo/iphone-air-global.jpg",
					note: "Apple 官网产品图。案例来源页 apple.com/kr/iphone-air。文件与当前线上演示一致，未再压缩。",
				},
				{ id: "copy", kind: "copy", label: "主文案（美国官网）", content: "iPhone Air. Incredibly light and thin. With the power of Pro inside." },
			],
			signals: [{ signal: "gesture.pinch", asset: "kv", evidence: "拇指和食指捏住机身一端", box: [0.645, 0.27, 0.205, 0.41], confidence: 0.93 }],
		},
		localized: {
			label: "韩国版",
			assets: [
				{
					id: "kv",
					kind: "image",
					label: "主视觉（韩国官网）",
					content: "/demo/iphone-air-kr.jpg",
					note: "Apple 官网产品图。韩国版没有手。案例来源页 apple.com/kr/iphone-air。文件与当前线上演示一致，未再压缩。",
				},
				{ id: "copy", kind: "copy", label: "主文案（韩国官网）", content: "iPhone Air. 놀랍도록 얇고 가벼운 디자인. 역량은 프로급." },
			],
			signals: [],
		},
	},
	{
		id: "us-copy",
		title: "产品发布文案与用户推荐语",
		pitch: "对照初稿与改稿，检查产品效果承诺、用户推荐语及其来源。首屏照片是图库里的真实电脑，不是 Mira 的实拍；宣称在文案里。",
		focus: "US",
		markets: ["US"],
		segment: "enterprise",
		original: {
			label: "初稿",
			assets: [
				{
					id: "hero",
					kind: "image",
					label: "落地页首屏",
					content: "/demo/us-desk.jpg",
					note: "图库照片：办公桌上的笔记本电脑。不是 Mira 的产品实拍，画面里也没有那些宣称。",
				},
				{
					id: "copy",
					kind: "copy",
					label: "发布文案",
					content: "Fire your assistant. Hire Mira.\n100% accurate. Never hallucinates.\n“Mira wrote my wedding vows in 30 seconds.” — Jamie R., Austin",
				},
				{ id: "page", kind: "page", label: "落地页备注", content: "首屏的三条用户推荐语由 AI 生成，用来“示意效果”，不是真实用户。" },
			],
			signals: [
				{
					signal: "claim.replace_humans",
					asset: "copy",
					evidence: "Fire your assistant. Hire Mira.",
					quotes: ["Fire your assistant. Hire Mira."],
					confidence: 0.95,
				},
				{
					signal: "claim.absolute_accuracy",
					asset: "copy",
					evidence: "100% accurate. Never hallucinates.",
					quotes: ["100% accurate. Never hallucinates."],
					confidence: 0.95,
				},
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
				{
					id: "hero",
					kind: "image",
					label: "落地页首屏",
					content: "/demo/us-laptop.jpg",
					note: "公有领域产品照片：一台笔记本电脑。不是 Mira 的产品实拍。",
				},
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
		pitch: "对照肉骨茶和咖椰吐司两张真实食物照片。肉骨茶会把猪肉主题带进新加坡斋月规则。照片不是 Mira 宣传片，也没有一人分饰多个族群或加深肤色。",
		focus: "SG",
		markets: ["SG", "US"],
		segment: "consumer",
		original: {
			label: "初版",
			assets: [
				{
					id: "frame",
					kind: "image",
					label: "肉骨茶",
					content: "/demo/sg-bak-kut-teh.jpg",
					note: "共享照片：一桌肉骨茶（排骨汤）。不是 Mira 宣传片，画面里没有选角或加深肤色。",
				},
				{ id: "copy", kind: "copy", label: "字幕", content: "Mira speaks your language — 华语 · Bahasa Melayu · தமிழ் · English" },
			],
			signals: [{ signal: "food.pork", asset: "frame", evidence: "桌上的肉骨茶（排骨汤）", box: [0, 0.5, 0.33, 0.34], confidence: 0.9 }],
		},
		localized: {
			label: "重拍版",
			assets: [
				{
					id: "frame",
					kind: "image",
					label: "咖椰吐司",
					content: "/demo/sg-kaya-toast.jpg",
					note: "共享照片：咖椰吐司蘸蛋。没有猪肉。不是 Mira 宣传片。",
				},
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
