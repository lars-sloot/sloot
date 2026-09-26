import { send } from "@vercel/queue";

export const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";

export type DailyDigestJob = {
  organizationId: string;
  scheduledDate: string;
  settingsUpdatedAt: string;
};

type LocalDate = { year: number; month: number; day: number };

function localParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    year: Number(values.year), month: Number(values.month), day: Number(values.day),
    hour: Number(values.hour), minute: Number(values.minute), second: Number(values.second),
  };
}

function addDays(date: LocalDate, days: number): LocalDate {
  const shifted = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return { year: shifted.getUTCFullYear(), month: shifted.getUTCMonth() + 1, day: shifted.getUTCDate() };
}

function dateKey(date: LocalDate) {
  return `${date.year}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function localDateTimeToUtc(date: LocalDate, hour: number, minute: number) {
  const targetAsUtc = Date.UTC(date.year, date.month - 1, date.day, hour, minute, 0);
  let candidate = new Date(targetAsUtc);
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const represented = localParts(candidate);
    const representedAsUtc = Date.UTC(represented.year, represented.month - 1, represented.day, represented.hour, represented.minute, represented.second);
    candidate = new Date(candidate.getTime() + (targetAsUtc - representedAsUtc));
  }
  return candidate;
}

export function normalizeSendTime(value: string) {
  const match = /^(\d{2}):(\d{2})(?::\d{2})?$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59 || minute % 15 !== 0) return null;
  return `${match[1]}:${match[2]}`;
}

export function nextDigestOccurrence(sendTime: string, now = new Date()) {
  const normalized = normalizeSendTime(sendTime);
  if (!normalized) throw new Error("Ongeldig verzendmoment.");
  const [hour, minute] = normalized.split(":").map(Number);
  const current = localParts(now);
  let localDate: LocalDate = { year: current.year, month: current.month, day: current.day };
  let scheduledAt = localDateTimeToUtc(localDate, hour, minute);
  if (scheduledAt.getTime() <= now.getTime() + 30_000) {
    localDate = addDays(localDate, 1);
    scheduledAt = localDateTimeToUtc(localDate, hour, minute);
  }
  return { scheduledAt, scheduledDate: dateKey(localDate), sendTime: normalized };
}

export function digestWindow(scheduledDate: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(scheduledDate);
  if (!match) throw new Error("Ongeldige geplande datum.");
  const sendDate = { year: Number(match[1]), month: Number(match[2]), day: Number(match[3]) };
  const summaryDate = addDays(sendDate, -1);
  const summaryDateUtc = new Date(Date.UTC(summaryDate.year, summaryDate.month - 1, summaryDate.day));
  return {
    dateKey: dateKey(summaryDate),
    dateLabel: new Intl.DateTimeFormat("nl-NL", { dateStyle: "long", timeZone: "UTC" }).format(summaryDateUtc),
    start: localDateTimeToUtc(summaryDate, 0, 0).toISOString(),
    end: localDateTimeToUtc(sendDate, 0, 0).toISOString(),
  };
}

export async function scheduleDailyDigest(organizationId: string, sendTime: string, settingsUpdatedAt: string, now = new Date()) {
  const next = nextDigestOccurrence(sendTime, now);
  const delaySeconds = Math.max(0, Math.ceil((next.scheduledAt.getTime() - now.getTime()) / 1000));
  const retentionSeconds = Math.min(604_800, Math.max(86_400, delaySeconds + 86_400));
  const { messageId } = await send<DailyDigestJob>(
    "daily-digest-email",
    { organizationId, scheduledDate: next.scheduledDate, settingsUpdatedAt },
    {
      delaySeconds,
      retentionSeconds,
      idempotencyKey: `daily-digest/${organizationId}/${next.scheduledDate}/${settingsUpdatedAt}`,
      region: "fra1",
    },
  );
  return { ...next, messageId };
}
