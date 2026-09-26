import { dailyDigestEmail } from "@/lib/email/daily-digest";
import { digestWindow } from "@/lib/email/digest-schedule";
import { createAdminClient } from "@/lib/supabase/admin";

const DEFAULT_EMAIL_FROM = "Sloot pakbonnen <onboarding@resend.dev>";

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
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY ontbreekt.");

  const recipient = input.recipient.trim().toLowerCase();
  if (!recipient) throw new Error("Het e-mailadres van de ontvanger ontbreekt.");

  const admin = createAdminClient();
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

  logDigest("info", "resend_request_started", {
    messageId: input.messageId,
    mode: input.mode,
    userId: input.userId,
    scheduledDate: input.scheduledDate,
    sendTime: input.sendTime,
  });
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
      "Content-Type": "application/json",
      "Idempotency-Key": input.idempotencyKey,
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
      to: [recipient],
      subject: input.mode === "manual" ? `[TEST] ${email.subject}` : email.subject,
      html: email.html,
      text: email.text,
    }),
  });
  const responseBody = await response.json().catch(() => null) as { id?: string; message?: string } | null;
  if (!response.ok) throw new Error(`Resend returned ${response.status}: ${responseBody?.message || "onbekende fout"}`);
  const resendMessageId = responseBody?.id || null;
  logDigest("info", "resend_request_accepted", {
    messageId: input.messageId,
    resendMessageId,
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
  if (updateError) throw updateError;

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
      resend_message_id: resendMessageId,
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
      resendMessageId,
      userId: input.userId,
      error: auditError.message,
    });
  }

  return { resendMessageId, incoming, processed, approved, rejected, pending };
}
