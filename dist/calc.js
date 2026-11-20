/**
 * Pure calculations for the P1 Meter Metrics tiles. No Homebridge imports, so they can be
 * tested on their own.
 *
 * Units handed back here are the numbers the tiles show:
 *   electricity: W (now), Wh (last hour); month and total are sent in Wh too
 *   gas:         litres (last 5 minutes, last hour), m3 (month, total)
 */

export const MINUTE = 60_000;

/** "261120181512" (yyMMddHHmmss, meter local time) to a comparable millisecond value. */
export function parseGasTimestamp(value) {
    const s = String(value).padStart(12, '0');
    return Date.UTC(2000 + Number(s.slice(0, 2)), Number(s.slice(2, 4)) - 1, Number(s.slice(4, 6)), Number(s.slice(6, 8)), Number(s.slice(8, 10)), Number(s.slice(10, 12)));
}

/** Litres used between two consecutive gas readings, or null when they are not consecutive (gap over 6 minutes). */
export function litresLastStep(previous, current) {
    const gap = current.when - previous.when;
    if (!(gap > 0 && gap <= 6 * MINUTE)) return null;
    return Math.max(0, Math.round((current.total - previous.total) * 1000));
}

/**
 * The history entry to count the last hour from: the newest one at or before 60 minutes
 * ago, as long as it is no more than `tolerance` older. While the history is shorter than
 * an hour (or has a gap there), the oldest entry inside the hour, so the value shows what
 * was used so far. Null only when there is no earlier entry at all.
 */
export function entryHourAgo(history, now, tolerance) {
    const target = now - 60 * MINUTE;
    const before = history.filter((entry) => entry.when <= target).at(-1);
    if (before && target - before.when <= tolerance) return before;
    return history.find((entry) => entry.when > target && entry.when < now) ?? null;
}

/** Litres of gas used in the last 60 minutes (so far, while the history is shorter than an hour). */
export function litresLastHour(gasHistory, current) {
    const past = entryHourAgo(gasHistory, current.when, 6 * MINUTE);
    return past ? Math.max(0, Math.round((current.total - past.total) * 1000)) : null;
}

/** Wh of electricity used in the last 60 minutes (so far, while the history is shorter than an hour). */
export function wattHoursLastHour(electricityHistory, now, kwh) {
    const past = entryHourAgo(electricityHistory, now, 2 * MINUTE);
    return past ? Math.max(0, Math.round((kwh - past.kwh) * 1000)) : null;
}

/** Adds an entry and drops the ones older than `keepMs` before it. */
export function appendHistory(history, entry, keepMs) {
    return [...history, entry].filter((item) => item.when >= entry.when - keepMs);
}

/** "2026-11" for a date, in the local time zone. */
export function monthKey(date) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Where this month's counting starts: the meter totals at the start of the month.
 *
 * - A new month starts from the current totals.
 * - The first month can start earlier when the user enters the month so far
 *   (from the HomeWizard app): the start is then the current totals minus those.
 *   Entering other numbers later in the same month applies them again.
 */
export function monthStart(state, key, kwh, m3, soFar) {
    const wanted = { kwh: Number(soFar?.kwh) || 0, m3: Number(soFar?.m3) || 0 };
    const sameNumbers = state && state.soFar && state.soFar.kwh === wanted.kwh && state.soFar.m3 === wanted.m3;
    if (state && state.key === key && (sameNumbers || !state.firstMonth)) return state;
    if (state && state.key !== key) return { key, kwh, m3, soFar: wanted, firstMonth: false };
    return { key, kwh: kwh - wanted.kwh, m3: m3 - wanted.m3, soFar: wanted, firstMonth: true };
}

/**
 * The month-so-far numbers from the plugin settings, in the units the month start uses:
 * electricity is entered in Wh (the unit its tile uses), gas in m3.
 */
export function monthSoFarFromConfig(config) {
    return { kwh: (Number(config?.electricityMonthSoFarWh) || 0) / 1000, m3: Number(config?.gasMonthSoFar) || 0 };
}

/** Rounds a tile value to the precision it is shown with. */
export function round(value, decimals = 0) {
    const factor = 10 ** decimals;
    return Math.round(value * factor) / factor;
}
