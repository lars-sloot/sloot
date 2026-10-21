import { dailyDigestEmail } from "@/lib/email/daily-digest";
import { digestWindow } from "@/lib/email/digest-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { getSmtpConfig, sendSmtpEmail } from "@/lib/email/smtp";

type DeliverDailyDigestInput = {
  organizationId: string;
  userId: string;
  recipient: string;
  scheduledDate: string;
  sendTime: string;
  idempotencyKey: string;
  messageId: string;
  actorId?: string | null;
  auditAction?: "notification.daily_digest_sent" | "notification.test_digest_sent";
  mode: "scheduled" | "manual";
};

export function logDigest(
  level: "info" | "warning" | "error",
  message: string,
  details: Record<string, unknown>,
) {
  const payload = JSON.stringify({ level, message, component: "daily-digest", ...details });
  if (level === "error") console.error(payload);
  else if (level === "warning") console.warn(payload);
  else console.log(payload);
}

async function countQuery(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function deliverDailyDigest(input: DeliverDailyDigestInput) {
  getSmtpConfig();

  const recipient = input.recipient.trim().toLowerCase();
  if (!recipient) throw new Error("Het e-mailadres van de ontvanger ontbreekt.");

  const admin = createAdminClient();
  if (input.mode === "scheduled") {
    const { data: receipt, error } = await admin.from("audit_logs")
      .select("after_data")
      .eq("organization_id", input.organizationId)
      .eq("entity_id", input.userId)
      .eq("action", "notification.daily_digest_sent")
      .contains("after_data", { delivery_key: input.idempotencyKey })
      .limit(1).maybeSingle();
    if (error) throw error;
    if (receipt) {
      logDigest("info", "digest_already_sent", { messageId: input.messageId, userId: input.userId });
      return { emailMessageId: typeof receipt.after_data?.smtp_message_id === "string" ? receipt.after_data.smtp_message_id : null, alreadySent: true };
    }
  }

  const { data: organization, error: organizationError } = await admin
    .from("organizations")
    .select("name")
    .eq("id", input.organizationId)
    .single();
  if (organizationError) throw organizationError;

  const day = digestWindow(input.scheduledDate);
  const [incoming, processed, approved, rejected, pending] = await Promise.all([
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId).gte("created_at", day.start).lt("created_at", day.end)),
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId).in("status", ["approved", "rejected"]).gte("approved_at", day.start).lt("approved_at", day.end)),
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId).eq("status", "approved").gte("approved_at", day.start).lt("approved_at", day.end)),
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId).eq("status", "rejected").gte("approved_at", day.start).lt("approved_at", day.end)),
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", input.organizationId).eq("status", "pending")),
  ]);
  const productionUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://sloot-pakbonnen.vercel.app");
  const email = dailyDigestEmail({
    organizationName: organization.name || "Sloot 2Wielers",
    dateLabel: day.dateLabel,
    incoming,
    processed,
    approved,
    rejected,
    pending,
    pendingUrl: `${productionUrl}/protected/pakbonnen?status=pending`,
  });

  logDigest("info", "smtp_request_started", {
    messageId: input.messageId,
    mode: input.mode,
    userId: input.userId,
    scheduledDate: input.scheduledDate,
    sendTime: input.sendTime,
  });
  const { emailMessageId } = await sendSmtpEmail({
    to: recipient,
    subject: input.mode === "manual" ? `[TEST] ${email.subject}` : email.subject,
    html: email.html,
    text: email.text,
    deliveryKey: input.idempotencyKey,
  });
  logDigest("info", "smtp_request_accepted", {
    messageId: input.messageId,
    emailMessageId,
    mode: input.mode,
    userId: input.userId,
    scheduledDate: input.scheduledDate,
    sendTime: input.sendTime,
  });

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("user_notification_settings")
    .update({ last_sent_at: now })
    .eq("user_id", input.userId)
    .eq("organization_id", input.organizationId);
  // SMTP has already accepted the message. A bookkeeping failure must not trigger another send.
  if (updateError) logDigest("warning", "digest_last_sent_update_failed", { messageId: input.messageId, emailMessageId, userId: input.userId, error: updateError.message });

  const { error: auditError } = await admin.from("audit_logs").insert({
    organization_id: input.organizationId,
    actor_id: input.actorId ?? null,
    action: input.auditAction || "notification.daily_digest_sent",
    entity_type: "user_notification_settings",
    entity_id: input.userId,
    after_data: {
      date: day.dateKey,
      send_time: input.sendTime,
      recipient,
      smtp_message_id: emailMessageId,
      delivery_key: input.idempotencyKey,
      provider: "smtp",
      mode: input.mode,
      incoming,
      processed,
      approved,
      rejected,
      pending,
    },
  });
  if (auditError) {
    logDigest("warning", "digest_audit_failed", {
      messageId: input.messageId,
      emailMessageId,
      userId: input.userId,
      error: auditError.message,
    });
  }

  return { emailMessageId, incoming, processed, approved, rejected, pending };
}
