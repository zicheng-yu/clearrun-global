/**
 * The signal vocabulary: everything the perception model is allowed to report. The model only says
 * what it sees (a pinch gesture, an absolute accuracy claim); whether that is a problem in a market is
 * decided by knowledge/rules.yaml. Rules and calendar blocks may only reference IDs listed here.
 */

/** Where a signal is found: in an image, in copy, on the landing/privacy page, or as the creative's overall theme. */
export type SignalChannel = "vision" | "text" | "page" | "theme";

export interface SignalInfo {
	label: string;
	channel: SignalChannel;
	/** What the model should look for, written for the model (English keeps the prompt compact and unambiguous). */
	hint: string;
}

export const SIGNALS = {
	"gesture.pinch": {
		label: "拇指与食指捏/夹的手势",
		channel: "vision",
		hint: "A hand pinching or holding something between only the thumb and index finger, or a pinching gesture pointing at an object.",
	},
	"symbol.rising_sun": {
		label: "旭日旗或放射状日章图案",
		channel: "vision",
		hint: "A rising-sun flag or a red disc with radiating rays.",
	},
	"map.disputed_label": {
		label: "地图上的争议地区标注",
		channel: "vision",
		hint: "A map showing Dokdo/Takeshima, the East Sea/Sea of Japan, the nine-dash line or another disputed border or label.",
	},
	"text.red_person_name": {
		label: "用红色书写的人名",
		channel: "vision",
		hint: "A living person's name written in red text.",
	},
	"people.one_actor_many_races": {
		label: "同一演员扮演多个族群",
		channel: "vision",
		hint: "The same performer appears as characters of different ethnicities.",
	},
	"people.altered_skin_tone": {
		label: "刻意加深或改变肤色的妆造",
		channel: "vision",
		hint: "Makeup or editing that darkens or changes a person's skin tone to portray another ethnicity.",
	},
	"food.pork": { label: "猪肉或猪肉菜肴", channel: "vision", hint: "Pork or a pork dish (e.g. bak kut teh, char siu, bacon, ham)." },
	"food.alcohol": { label: "酒精饮品", channel: "vision", hint: "Alcoholic drinks (beer, wine, spirits, cocktails)." },
	"religion.decorative_symbol": {
		label: "宗教符号被用作装饰",
		channel: "vision",
		hint: "A religious figure, text or symbol used as decoration or on a product (e.g. Buddha statue as decor, scripture on a rug).",
	},
	"symbol.national_flag": { label: "国旗、国徽等国家象征", channel: "vision", hint: "A national flag, coat of arms or other state emblem." },
	"claim.crush_creativity": {
		label: "碾碎/淘汰人类创作的意象",
		channel: "vision",
		hint: "Imagery of instruments, art supplies, books or creative work being destroyed, crushed or replaced by a device or AI.",
	},
	"claim.replace_humans": {
		label: "“取代人类/不用再雇人”叙事",
		channel: "text",
		hint: "Copy saying the product replaces people or jobs: 'fire your assistant', 'stop hiring humans', 'no need for a team'.",
	},
	"claim.emotional_ghostwriting": {
		label: "AI 代替用户做情感表达",
		channel: "text",
		hint: "The AI writes personal or emotional messages on the user's behalf: love letters, wedding vows, a child's fan letter, apologies.",
	},
	"claim.absolute_accuracy": {
		label: "“100% 准确/从不出错”等绝对化宣称",
		channel: "text",
		hint: "Absolute capability claims: '100% accurate', 'never hallucinates', 'zero errors', 'always right'.",
	},
	"claim.replace_professional": {
		label: "“替代律师/医生/会计”等专业替代宣称",
		channel: "text",
		hint: "Claims that the AI replaces a licensed professional: 'your AI lawyer', 'no need for a doctor', 'robot accountant'.",
	},
	"claim.ai_testimonial": {
		label: "AI 生成或虚构的用户评价",
		channel: "page",
		hint: "Testimonials, reviews or customer logos that are AI-generated, invented or not from real users (use the page notes).",
	},
	"privacy.no_local_policy": {
		label: "没有当地语言的隐私政策",
		channel: "page",
		hint: "The page notes say there is no privacy policy in the target market's language.",
	},
	"privacy.no_data_residency": {
		label: "没有说明数据存储地和跨境传输",
		channel: "page",
		hint: "The page notes say where user data is stored or transferred is not stated.",
	},
	"ai.no_disclosure": {
		label: "没有说明 AI 生成内容的标识方式",
		channel: "page",
		hint: "The page notes say AI-generated output is not labelled or disclosed.",
	},
	"theme.halloween": {
		label: "万圣节元素（南瓜、鬼怪、变装派对）",
		channel: "theme",
		hint: "Halloween theme: pumpkins, ghosts, costumes, trick-or-treat, Halloween party.",
	},
	"theme.festive": {
		label: "狂欢/派对/大促式的热闹基调",
		channel: "theme",
		hint: "A loud celebratory tone: party, festival, confetti, flash sale, 'let's go wild'.",
	},
	"theme.japan": { label: "日本相关意象", channel: "theme", hint: "Japanese cultural imagery: kimono, torii, rising sun, Mount Fuji, Japanese text." },
} as const satisfies Record<string, SignalInfo>;

export type SignalId = keyof typeof SIGNALS;

export const SIGNAL_IDS = Object.keys(SIGNALS) as SignalId[];

export const isSignalId = (value: unknown): value is SignalId => typeof value === "string" && Object.hasOwn(SIGNALS, value);

export const signalLabel = (id: SignalId): string => SIGNALS[id].label;

/** Theme-channel signals: the ones a creative carries into launch planning (calendar blocks). */
export const THEME_SIGNALS = SIGNAL_IDS.filter((id) => SIGNALS[id].channel === "theme");
