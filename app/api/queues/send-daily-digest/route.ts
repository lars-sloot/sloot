import { handleCallback } from "@vercel/queue";
import { deliverDailyDigest, logDigest } from "@/lib/email/deliver-daily-digest";
import { createAdminClient } from "@/lib/supabase/admin";
import { type DailyDigestJob } from "@/lib/email/digest-schedule";

export const maxDuration = 60;

function timestampsMatch(first: string, second: string) {
  const firstTimestamp = Date.parse(first);
  const secondTimestamp = Date.parse(second);
  return Number.isFinite(firstTimestamp) && Number.isFinite(secondTimestamp) && firstTimestamp === secondTimestamp;
}

async function sendDigest(job: DailyDigestJob, messageId: string) {
  if (!job?.organizationId || !job?.userId || !job?.scheduledDate || !job?.sendTime || !job?.settingsUpdatedAt) throw new Error("Ongeldige e-mailopdracht.");
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY ontbreekt.");

  const admin = createAdminClient();
  const { data: setting, error: settingError } = await admin
    .from("user_notification_settings")
    .select("daily_digest_enabled,recipient_email,send_times,updated_at,organizations(name),profiles(active)")
    .eq("user_id", job.userId)
    .eq("organization_id", job.organizationId)
    .maybeSingle();
  if (settingError) throw settingError;
  if (!setting) {
    logDigest("warning", "digest_skipped", { messageId, userId: job.userId, scheduledDate: job.scheduledDate, sendTime: job.sendTime, reason: "missing_settings" });
    return { status: "skipped" as const, reason: "missing_settings" };
  }
  const configuredTimes = Array.isArray(setting.send_times) ? setting.send_times : [];
  const relatedProfile = Array.isArray(setting.profiles) ? setting.profiles[0] : setting.profiles;
  const skipReason = !setting.daily_digest_enabled
    ? "disabled_or_missing"
    : !relatedProfile?.active
      ? "inactive_user"
      : !timestampsMatch(setting.updated_at, job.settingsUpdatedAt)
        ? "outdated_schedule"
        : !configuredTimes.includes(job.sendTime)
          ? "removed_send_time"
          : null;
  if (skipReason) {
    logDigest("warning", "digest_skipped", { messageId, userId: job.userId, scheduledDate: job.scheduledDate, sendTime: job.sendTime, reason: skipReason });
    return { status: "skipped" as const, reason: skipReason };
  }
  const recipient = setting.recipient_email?.trim().toLowerCase();
  if (!recipient) {
    logDigest("warning", "digest_skipped", { messageId, userId: job.userId, scheduledDate: job.scheduledDate, sendTime: job.sendTime, reason: "missing_recipient" });
    return { status: "skipped" as const, reason: "missing_recipient" };
  }

  const result = await deliverDailyDigest({
    organizationId: job.organizationId,
    userId: job.userId,
    recipient,
    scheduledDate: job.scheduledDate,
    sendTime: job.sendTime,
    idempotencyKey: `daily-digest/${job.organizationId}/${job.userId}/${job.scheduledDate}/${job.sendTime}`,
    messageId,
    mode: "scheduled",
  });
  return { status: "sent" as const, resendMessageId: result.resendMessageId };
}

const queueHandler = handleCallback<DailyDigestJob>(async (job, metadata) => {
  const startedAt = Date.now();
  logDigest("info", "digest_started", {
    messageId: metadata.messageId,
    deliveryCount: metadata.deliveryCount,
    userId: job?.userId,
    scheduledDate: job?.scheduledDate,
    sendTime: job?.sendTime,
  });
  try {
    const result = await sendDigest(job, metadata.messageId);
    logDigest("info", "digest_finished", { messageId: metadata.messageId, userId: job.userId, result, durationMs: Date.now() - startedAt });
  } catch (error) {
    logDigest("error", "digest_failed", {
      messageId: metadata.messageId,
      userId: job?.userId,
      error: error instanceof Error ? error.message : String(error),
      durationMs: Date.now() - startedAt,
    });
    throw error;
  }
}, {
  visibilityTimeoutSeconds: 300,
  retry: (_error, metadata) => {
    if (metadata.deliveryCount >= 5) return { acknowledge: true };
    return { afterSeconds: Math.min(900, 30 * (2 ** Math.max(0, metadata.deliveryCount - 1))) };
  },
});

export async function POST(request: Request) {
  return queueHandler(request);
}
