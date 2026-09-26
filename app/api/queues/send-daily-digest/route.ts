import { createHash } from "node:crypto";
import { handleCallback } from "@vercel/queue";
import { createAdminClient } from "@/lib/supabase/admin";
import { dailyDigestEmail } from "@/lib/email/daily-digest";
import { digestWindow, type DailyDigestJob } from "@/lib/email/digest-schedule";

export const maxDuration = 60;
const DEFAULT_EMAIL_FROM = "Sloot pakbonnen <onboarding@resend.dev>";

async function countQuery(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

async function sendDigest(job: DailyDigestJob) {
  if (!job?.organizationId || !job?.scheduledDate || !job?.settingsUpdatedAt) throw new Error("Ongeldige e-mailopdracht.");
  if (!process.env.RESEND_API_KEY) throw new Error("RESEND_API_KEY ontbreekt.");

  const admin = createAdminClient();
  const { data: setting, error: settingError } = await admin
    .from("notification_settings")
    .select("daily_digest_enabled,recipient_emails,last_sent_date,updated_at,organizations(name)")
    .eq("organization_id", job.organizationId)
    .maybeSingle();
  if (settingError) throw settingError;
  if (!setting?.daily_digest_enabled || setting.updated_at !== job.settingsUpdatedAt || setting.last_sent_date === job.scheduledDate) return;
  const rawRecipients = Array.isArray(setting.recipient_emails)
    ? setting.recipient_emails.filter((email): email is string => typeof email === "string")
    : [];
  const recipients = [...new Set(rawRecipients.map((email) => email.trim().toLowerCase()).filter(Boolean))];
  if (!recipients.length) return;

  const day = digestWindow(job.scheduledDate);
  const [incoming, processed, approved, rejected, pending] = await Promise.all([
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", job.organizationId).gte("created_at", day.start).lt("created_at", day.end)),
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", job.organizationId).in("status", ["approved", "rejected"]).gte("approved_at", day.start).lt("approved_at", day.end)),
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", job.organizationId).eq("status", "approved").gte("approved_at", day.start).lt("approved_at", day.end)),
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", job.organizationId).eq("status", "rejected").gte("approved_at", day.start).lt("approved_at", day.end)),
    countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", job.organizationId).eq("status", "pending")),
  ]);
  const organization = Array.isArray(setting.organizations) ? setting.organizations[0] : setting.organizations;
  const productionUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "https://sloot-pakbonnen.vercel.app");
  const email = dailyDigestEmail({
    organizationName: organization?.name || "Sloot 2Wielers",
    dateLabel: day.dateLabel,
    incoming,
    processed,
    approved,
    rejected,
    pending,
    pendingUrl: `${productionUrl}/protected/pakbonnen?status=pending`,
  });

  await Promise.all(recipients.map(async (recipient) => {
    const recipientHash = createHash("sha256").update(recipient).digest("hex").slice(0, 20);
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json",
        "Idempotency-Key": `daily-digest/${job.organizationId}/${job.scheduledDate}/${recipientHash}`,
      },
      body: JSON.stringify({
        from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
        to: [recipient],
        subject: email.subject,
        html: email.html,
        text: email.text,
      }),
    });
    if (!response.ok) throw new Error(`Resend returned ${response.status}: ${(await response.text()).slice(0, 300)}`);
  }));

  const now = new Date().toISOString();
  const { error: updateError } = await admin
    .from("notification_settings")
    .update({ last_sent_date: job.scheduledDate, last_sent_at: now, updated_at: setting.updated_at })
    .eq("organization_id", job.organizationId)
    .eq("updated_at", setting.updated_at);
  if (updateError) throw updateError;
  await admin.from("audit_logs").insert({
    organization_id: job.organizationId,
    actor_id: null,
    action: "notification.daily_digest_sent",
    entity_type: "notification_settings",
    entity_id: job.organizationId,
    after_data: { date: day.dateKey, recipient_count: recipients.length, incoming, processed, approved, rejected, pending },
  });
}

const queueHandler = handleCallback<DailyDigestJob>(sendDigest, {
  visibilityTimeoutSeconds: 300,
  retry: (_error, metadata) => {
    if (metadata.deliveryCount >= 5) return { acknowledge: true };
    return { afterSeconds: Math.min(900, 30 * (2 ** Math.max(0, metadata.deliveryCount - 1))) };
  },
});

export async function POST(request: Request) {
  return queueHandler(request);
}
