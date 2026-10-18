import type { ScheduleTask } from "./contracts";
export const localZone = () =>
  Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
export interface ScheduleForm {
  target: string;
  title: string;
  prompt: string;
  kind: string;
  date: string;
  time: string;
  timeZone: string;
  weekdays: number[];
  count: string;
  unit: string;
}
export function initialSchedule(target = ""): ScheduleForm {
  const later = new Date(Date.now() + 3_600_000),
    pad = (n: number) => String(n).padStart(2, "0");
  return {
    target,
    title: "",
    prompt: "",
    kind: "daily",
    date: `${later.getFullYear()}-${pad(later.getMonth() + 1)}-${pad(later.getDate())}`,
    time: "09:00",
    timeZone: localZone(),
    weekdays: [1, 2, 3, 4, 5],
    count: "1",
    unit: "hours",
  };
}
export function schedulePayload(form: ScheduleForm, now = Date.now()) {
  const title = form.title.trim(),
    prompt = form.prompt.trim();
  if (!form.target) throw new Error("Choose a Bot or group chat.");
  if (!title || title.length > 120)
    throw new Error("Give the task a name of up to 120 characters.");
  if (!prompt) throw new Error("Say what the Bot should do.");
  let when: Record<string, unknown>;
  if (form.kind === "every") {
    const factors: Record<string, number> = {
      minutes: 1,
      hours: 60,
      days: 1440,
    };
    const factor = factors[form.unit];
    const minutes = Number(form.count) * (factor ?? NaN);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 10080)
      throw new Error("Repeat every 1 minute to 7 days.");
    when = { kind: "every", minutes };
  } else {
    if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(form.time))
      throw new Error("Use a time in HH:MM format.");
    if (form.kind === "at") {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date))
        throw new Error("Use a date in YYYY-MM-DD format.");
      const at = new Date(`${form.date}T${form.time}:00`);
      const expected = form.date.split("-").map(Number);
      if (
        !Number.isFinite(at.getTime()) ||
        at.getFullYear() !== expected[0] ||
        at.getMonth() + 1 !== expected[1] ||
        at.getDate() !== expected[2] ||
        at.getHours() !== Number(form.time.slice(0, 2)) ||
        at.getMinutes() !== Number(form.time.slice(3))
      )
        throw new Error("Choose a valid local date and time.");
      if (at.getTime() <= now)
        throw new Error("Choose a future date and time.");
      when = { kind: "at", at: at.toISOString() };
    } else {
      try {
        new Intl.DateTimeFormat("en", { timeZone: form.timeZone }).format();
      } catch {
        throw new Error("Enter a valid time zone, such as Asia/Shanghai.");
      }
      if (!["daily", "weekly"].includes(form.kind))
        throw new Error("Choose when the task runs.");
      const weekdays = [...new Set(form.weekdays)]
        .filter((day) => Number.isInteger(day) && day >= 1 && day <= 7)
        .sort();
      if (form.kind === "weekly" && weekdays.length === 0)
        throw new Error("Pick at least one day.");
      when = {
        kind: form.kind,
        time: form.time,
        timeZone: form.timeZone,
        ...(form.kind === "weekly" ? { weekdays } : {}),
      };
    }
  }
  return { target: form.target, title, prompt, when };
}
export function timingText(task: ScheduleTask, translate = (key: string, values: Record<string,string | number> = {}) => key.replace(/\{(\w+)\}/g, (match,key) => Object.hasOwn(values,key) ? String(values[key]) : match), locale?: string) {
  const zone =
      task.timeZone && task.timeZone !== localZone()
        ? ` (${task.timeZone})`
        : "",
    time = task.time?.slice(0, 5) ?? "";
  if (task.kind === "at" || task.kind === "after")
    return translate("Once, {date}",{date:new Date(task.scheduledAt).toLocaleString(locale)});
  if (task.kind === "daily") return translate("Every day at {time}{zone}",{time,zone});
  if (task.kind === "weekly") {
    const days = task.weekdays ?? [],
      names = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const label =
      days.join() === "1,2,3,4,5"
        ? "weekday"
        : days.join() === "6,7"
          ? "weekend"
          : days.join() === "1,2,3,4,5,6,7"
            ? "day"
            : days.map((day) => translate(names[day - 1])).join(", ");
    return translate("Every {days} at {time}{zone}",{days:translate(label),time,zone});
  }
  if (task.kind === "every") {
    const seconds = task.everySeconds ?? 0;
    return seconds % 86400 === 0
      ? translate("Every {count} day(s)",{count:seconds / 86400})
      : seconds % 3600 === 0
        ? translate("Every {count} hour(s)",{count:seconds / 3600})
        : translate("Every {count} minutes",{count:Math.round(seconds / 60)});
  }
  return task.kind === "cron"
    ? translate("On schedule {expression}{zone}",{expression:task.expression || "",zone})
    : task.kind;
}
