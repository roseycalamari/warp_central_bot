import { addMinutes, setHours, setMinutes, setSeconds, startOfDay } from "date-fns";

/**
 * Spread N posts across a day between startHour and endHour (local time).
 * Default: 20 posts from 09:00 to 21:00 (~every 36–40 min).
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

  if (count === 1) return [start];

  const spanMs = end.getTime() - start.getTime();
  const step = spanMs / (count - 1);

  return Array.from({ length: count }, (_, i) => {
    const t = new Date(start.getTime() + step * i);
    // Snap to nearest minute for cleaner schedules
    t.setSeconds(0, 0);
    return t;
  });
}

export function staggerFromNow(count: number, everyMinutes = 45): Date[] {
  const now = new Date();
  // First post ~1 minute from now (or click "post now" for immediate)
  const first = addMinutes(now, 1);
  first.setSeconds(0, 0);
  const step = Math.max(1, everyMinutes);
  return Array.from({ length: count }, (_, i) =>
    addMinutes(first, i * step),
  );
}
