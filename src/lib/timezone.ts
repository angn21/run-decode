import { fromZonedTime, formatInTimeZone, toZonedTime } from "date-fns-tz";
import {
  endOfMonth,
  endOfWeek,
  parseISO,
  startOfMonth,
  startOfWeek,
  subMonths,
  subWeeks,
} from "date-fns";

/** IANA timezone, e.g. America/Toronto. Set RUN_DECODE_TIMEZONE in env. */
export function getRunDecodeTimezone(): string {
  return process.env.RUN_DECODE_TIMEZONE?.trim() || "UTC";
}

function nowInTimezone(): Date {
  return toZonedTime(new Date(), getRunDecodeTimezone());
}

/** Week boundaries in UTC for comparing against Strava ISO timestamps. */
export function weekIntervalUtc(weeksAgo: number) {
  const tz = getRunDecodeTimezone();
  const ref = subWeeks(nowInTimezone(), weeksAgo);
  const startLocal = startOfWeek(ref, { weekStartsOn: 1 });
  const endLocal = endOfWeek(ref, { weekStartsOn: 1 });
  return {
    start: fromZonedTime(startLocal, tz),
    end: fromZonedTime(endLocal, tz),
  };
}

/** Month boundaries in UTC for comparing against Strava ISO timestamps. */
export function monthIntervalUtc(monthsAgo: number) {
  const tz = getRunDecodeTimezone();
  const ref = subMonths(nowInTimezone(), monthsAgo);
  const startLocal = startOfMonth(ref);
  const endLocal = endOfMonth(ref);
  return {
    start: fromZonedTime(startLocal, tz),
    end: fromZonedTime(endLocal, tz),
    labelStart: startLocal,
  };
}

export function formatInRunTimezone(isoDate: string, pattern: string): string {
  return formatInTimeZone(parseISO(isoDate), getRunDecodeTimezone(), pattern);
}

/** Start of week in user TZ (for labels). */
export function weekLabelStart(weeksAgo: number): Date {
  const ref = subWeeks(nowInTimezone(), weeksAgo);
  return startOfWeek(ref, { weekStartsOn: 1 });
}

export function monthLabelStart(monthsAgo: number): Date {
  const ref = subMonths(nowInTimezone(), monthsAgo);
  return startOfMonth(ref);
}
