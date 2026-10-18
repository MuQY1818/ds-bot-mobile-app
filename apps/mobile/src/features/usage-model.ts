export type UsageRow = [
  string,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
  number,
];
export interface UsageView {
  now: string;
  scanning?: boolean;
  owners: {
    key: string;
    id?: string;
    name?: string;
    kind: string;
    deleted?: boolean;
  }[];
  models: {
    key: string;
    name: string;
    provider?: string;
    providerName?: string;
  }[];
  kinds: string[];
  rows: UsageRow[];
}
export interface UsageRange {
  id: string;
  unit: "hour" | "day" | "week" | "month";
  count: number;
  from?: string;
  to?: string;
  days?: number;
}
export const ranges: UsageRange[] = [
  { id: "24h", unit: "hour", count: 24 },
  { id: "7d", unit: "day", count: 7 },
  { id: "30d", unit: "day", count: 30 },
  { id: "12w", unit: "week", count: 12 },
  { id: "12m", unit: "month", count: 12 },
];
export const rangeLabels: Record<string, string> = {
  "24h": "24 hours",
  "7d": "7 days",
  "30d": "30 days",
  "12w": "12 weeks",
  "12m": "12 months",
  custom: "Custom range",
};
const HOUR = 3_600_000,
  DAY = 24 * HOUR;
export const hourMs = (key: string) =>
  Date.UTC(
    Number(key.slice(0, 4)),
    Number(key.slice(5, 7)) - 1,
    Number(key.slice(8, 10)),
    Number(key.slice(11, 13) || 0),
  );
const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const hourKey = (ms: number) =>
  new Date(ms).toISOString().slice(0, 13).replace("T", " ");
const monday = (ms: number) => ms - ((new Date(ms).getUTCDay() + 6) % 7) * DAY;
const validDay = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  Number.isFinite(hourMs(value)) &&
  dayKey(hourMs(value)) === value;

export function customRange(from: string, to: string): UsageRange {
  if (!validDay(from) || !validDay(to))
    throw new Error("Use valid dates in YYYY-MM-DD format.");
  if (to < from) [from, to] = [to, from];
  const days = Math.round((hourMs(to) - hourMs(from)) / DAY) + 1;
  if (days > 3660) throw new Error("Choose a range of up to 10 years.");
  return {
    id: "custom",
    from,
    to,
    days,
    unit:
      days <= 2 ? "hour" : days <= 62 ? "day" : days <= 182 ? "week" : "month",
    count: days,
  };
}
export interface UsageSum {
  input: number;
  cacheRead: number;
  output: number;
  calls: number;
  total: number;
}
const empty = (): UsageSum => ({
  input: 0,
  cacheRead: 0,
  output: 0,
  calls: 0,
  total: 0,
});
export const tokensOf = (row: UsageRow) => row[4] + row[5] + row[6] + row[7];
function add(sum: UsageSum, row: UsageRow) {
  sum.input += row[4] + row[6];
  sum.cacheRead += row[5];
  sum.output += row[7];
  sum.calls += row[8];
  sum.total += tokensOf(row);
}
export interface UsageBucket {
  key: string;
  start: number;
  end: number;
  sum: UsageSum;
  owners: Map<number, number>;
  models: Map<number, number>;
}
function bucketKey(ms: number, unit: UsageRange["unit"]) {
  if (unit === "hour") return hourKey(ms);
  if (unit === "week") return dayKey(monday(ms - (ms % DAY)));
  return unit === "month" ? dayKey(ms).slice(0, 7) : dayKey(ms);
}
function bounds(range: UsageRange, now: string) {
  const current = hourMs(now),
    day = current - (current % DAY);
  if (range.from && range.to)
    return {
      from: hourMs(range.from),
      end: hourMs(range.to) + DAY,
      before: hourMs(range.from) - (range.days ?? 1) * DAY,
    };
  const start = (back: number) =>
    range.unit === "hour"
      ? current - back * HOUR
      : range.unit === "day"
        ? day - back * DAY
        : range.unit === "week"
          ? monday(day) - back * 7 * DAY
          : Date.UTC(
              new Date(current).getUTCFullYear(),
              new Date(current).getUTCMonth() - back,
              1,
            );
  return {
    from: start(range.count - 1),
    before: start(range.count * 2 - 1),
    end: current + HOUR,
  };
}
export function summarizeUsage(
  view: UsageView,
  range: UsageRange,
  ownerKey = "",
  modelKey = "",
) {
  const { from, end, before } = bounds(range, view.now);
  const buckets: UsageBucket[] = [],
    index = new Map<string, UsageBucket>();
  let start =
    range.unit === "week"
      ? monday(from)
      : range.unit === "month"
        ? Date.UTC(
            new Date(from).getUTCFullYear(),
            new Date(from).getUTCMonth(),
            1,
          )
        : from;
  while (start < end) {
    const next =
      range.unit === "hour"
        ? start + HOUR
        : range.unit === "day"
          ? start + DAY
          : range.unit === "week"
            ? start + 7 * DAY
            : Date.UTC(
                new Date(start).getUTCFullYear(),
                new Date(start).getUTCMonth() + 1,
                1,
              );
    const bucket = {
      key: bucketKey(start, range.unit),
      start: Math.max(start, from),
      end: Math.min(next, end),
      sum: empty(),
      owners: new Map<number, number>(),
      models: new Map<number, number>(),
    };
    buckets.push(bucket);
    index.set(bucket.key, bucket);
    start = next;
  }
  const total = empty(),
    owners = new Map<number, UsageSum>(),
    models = new Map<number, UsageSum>(),
    kinds = new Map<number, UsageSum>();
  let previous = 0;
  const keep = (row: UsageRow) =>
    (!ownerKey || view.owners[row[1]]?.key === ownerKey) &&
    (!modelKey || view.models[row[2]]?.key === modelKey);
  for (const row of view.rows) {
    const at = hourMs(row[0]);
    if (at < before || at >= end || !keep(row)) continue;
    if (at < from) {
      previous += tokensOf(row);
      continue;
    }
    const bucket = index.get(bucketKey(at, range.unit));
    if (!bucket) continue;
    add(total, row);
    add(bucket.sum, row);
    bucket.owners.set(row[1], (bucket.owners.get(row[1]) ?? 0) + tokensOf(row));
    bucket.models.set(row[2], (bucket.models.get(row[2]) ?? 0) + tokensOf(row));
    for (const [map, key] of [
      [owners, row[1]],
      [models, row[2]],
      [kinds, row[3]],
    ] as const) {
      const sum = map.get(key) ?? empty();
      add(sum, row);
      map.set(key, sum);
    }
  }
  return {
    buckets,
    total,
    previous,
    owners,
    models,
    kinds,
    from: hourKey(from),
    to: hourKey(end - HOUR),
    keep,
  };
}
export function compact(value: number) {
  for (const [size, unit] of [
    [1e9, "B"],
    [1e6, "M"],
    [1e3, "K"],
  ] as const)
    if (value >= size * 0.9995) {
      const count = value / size;
      return `${Number(count.toFixed(count >= 100 ? 0 : count >= 10 ? 1 : 2))}${unit}`;
    }
  return String(Math.round(value));
}
export function activityDays(
  view: UsageView,
  keep: (row: UsageRow) => boolean,
  weeks = 53,
) {
  const end = hourMs(view.now.slice(0, 10)),
    start = monday(end) - (weeks - 1) * 7 * DAY;
  const counts = new Map<string, number>();
  for (const row of view.rows)
    if (keep(row)) {
      const key = row[0].slice(0, 10);
      counts.set(key, (counts.get(key) ?? 0) + tokensOf(row));
    }
  const days = [];
  for (let ms = start; ms <= end; ms += DAY)
    days.push({ day: dayKey(ms), tokens: counts.get(dayKey(ms)) ?? 0 });
  return days;
}
