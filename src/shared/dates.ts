/** Date helpers on YYYY-MM-DD strings, all in UTC. Launch weeks start on Monday. */

const DAY_MS = 86_400_000;

export function isoDay(date: Date): string {
	return date.toISOString().slice(0, 10);
}

export const dayMs = (day: string): number => Date.parse(`${day}T00:00:00Z`);

export function addDays(day: string, days: number): string {
	const d = new Date(`${day}T00:00:00Z`);
	d.setUTCDate(d.getUTCDate() + days);
	return isoDay(d);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export const daysBetween = (from: string, to: string): number => Math.round((dayMs(to) - dayMs(from)) / DAY_MS);

/** The Monday that starts the week holding `day`. */
export function mondayOf(day: string): string {
	const dow = new Date(`${day}T00:00:00Z`).getUTCDay(); // 0 = Sunday … 6 = Saturday
	return addDays(day, dow === 0 ? -6 : 1 - dow);
}

/** `count` consecutive Mondays starting with the week holding `from`. */
export function listMondays(from: string, count: number): string[] {
	const first = mondayOf(from);
	return Array.from({ length: count }, (_, i) => addDays(first, i * 7));
}

/**
 * The first day in the Monday-start week that is not before `earliest`.
 * The week may open on a Monday earlier than the user's earliest launch date;
 * that Monday is the week label, not a day we can recommend.
 */
export function launchDay(weekMonday: string, earliest: string): string {
	if (earliest <= weekMonday) return weekMonday;
	const sunday = addDays(weekMonday, 6);
	if (earliest > sunday) return weekMonday;
	return earliest;
}

/** Same wording for every market: week start (Monday) and the actual earliest launch day. */
export function launchDayText(weekMonday: string, earliest: string): string {
	const day = launchDay(weekMonday, earliest);
	if (day === weekMonday) return `${weekLabel(weekMonday)}当周（周一）`;
	return `最早可上线 ${weekLabel(day)}（发布周起始 ${weekLabel(weekMonday)}，周一）`;
}

/** Days of the inclusive range [start, end] that fall in the week starting `monday`. */
export function overlapDays(start: string, end: string, monday: string): number {
	const from = Math.max(dayMs(start), dayMs(monday));
	const to = Math.min(dayMs(end), dayMs(addDays(monday, 6)));
	return to < from ? 0 : Math.round((to - from) / DAY_MS) + 1;
}

/** "11月16日" style label for a week, in Chinese. */
export function weekLabel(monday: string): string {
	const [, m, d] = monday.split("-");
	return `${Number(m)}月${Number(d)}日`;
}
