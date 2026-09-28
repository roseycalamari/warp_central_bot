import {
  addMinutes,
  setHours,
  setMinutes,
  setSeconds,
  startOfDay,
} from "date-fns";

/**
 * Spread N posts across a day between startHour and endHour.
 * Pass a Date already in the intended timezone (browser local is best).
 */
export function buildDaySchedule(opts: {
  count: number;
  day?: Date;
  startHour?: number;
  endHour?: number;
}): Date[] {
  const count = Math.max(1, opts.count);
  const day = opts.day ?? new Date();
  const startHour = opts.startHour ?? 9;
  const endHour = opts.endHour ?? 21;

  const base = startOfDay(day);
  const start = setSeconds(setMinutes(setHours(base, startHour), 0), 0);
  const end = setSeconds(setMinutes(setHours(base, endHour), 0), 0);

  if (end.getTime() <= start.getTime()) {
    throw new Error("End hour must be after start hour");
  }

  if (count === 1) return [start];

  const spanMs = end.getTime() - start.getTime();
  const step = spanMs / (count - 1);

  return Array.from({ length: count }, (_, i) => {
    const t = new Date(start.getTime() + step * i);
    t.setSeconds(0, 0);
    return t;
  });
}

/** Build day schedule from YYYY-MM-DD using the caller's local timezone. */
export function buildDayScheduleLocal(opts: {
  count: number;
  dayStr: string;
  startHour?: number;
  endHour?: number;
}): Date[] {
  const parts = opts.dayStr.split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    throw new Error("Invalid day");
  }
  const [y, m, d] = parts;
  const day = new Date(y, m - 1, d, 12, 0, 0, 0);
  return buildDaySchedule({
    count: opts.count,
    day,
    startHour: opts.startHour,
    endHour: opts.endHour,
  });
}

export function staggerFromNow(count: number, everyMinutes = 45): Date[] {
  const now = new Date();
  const first = addMinutes(now, 1);
  first.setSeconds(0, 0);
  const step = Math.max(1, everyMinutes);
  return Array.from({ length: count }, (_, i) =>
    addMinutes(first, i * step),
  );
}

/** Shared schedule for multi-batch uploads (avoid recalculating per batch). */
export function buildUploadSchedule(opts: {
  count: number;
  mode: "bulk_day" | "stagger";
  dayStr: string;
  startHour: number;
  endHour: number;
  everyMinutes: number;
}): Date[] {
  if (opts.mode === "stagger") {
    return staggerFromNow(opts.count, opts.everyMinutes);
  }
  return buildDayScheduleLocal({
    count: opts.count,
    dayStr: opts.dayStr,
    startHour: opts.startHour,
    endHour: opts.endHour,
  });
}
