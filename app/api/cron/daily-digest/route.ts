import { createAdminClient } from "@/lib/supabase/admin";
import { dailyDigestEmail } from "@/lib/email/daily-digest";

export const runtime = "nodejs";
export const maxDuration = 60;

const AMSTERDAM_TIME_ZONE = "Europe/Amsterdam";
const DEFAULT_EMAIL_FROM = "Sloot pakbonnen <pakbonnen@sloot2wielers.nl>";

function datePartsInAmsterdam(date: Date) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return { year: Number(values.year), month: Number(values.month), day: Number(values.day) };
}

function amsterdamMidnightUtc(year: number, month: number, day: number) {
  const guess = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: AMSTERDAM_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(guess);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const representedAsUtc = Date.UTC(
    Number(values.year),
    Number(values.month) - 1,
    Number(values.day),
    Number(values.hour),
    Number(values.minute),
    Number(values.second),
  );
  return new Date(guess.getTime() - (representedAsUtc - guess.getTime()));
}

function previousAmsterdamDay(now = new Date()) {
  const today = datePartsInAmsterdam(now);
  const todayDate = new Date(Date.UTC(today.year, today.month - 1, today.day));
  const previousDate = new Date(todayDate.getTime() - 86_400_000);
  const previous = {
    year: previousDate.getUTCFullYear(),
    month: previousDate.getUTCMonth() + 1,
    day: previousDate.getUTCDate(),
  };
  const dateKey = `${previous.year}-${String(previous.month).padStart(2, "0")}-${String(previous.day).padStart(2, "0")}`;
  return {
    dateKey,
    dateLabel: new Intl.DateTimeFormat("nl-NL", {
      dateStyle: "long",
      timeZone: "UTC",
    }).format(previousDate),
    start: amsterdamMidnightUtc(previous.year, previous.month, previous.day).toISOString(),
    end: amsterdamMidnightUtc(today.year, today.month, today.day).toISOString(),
  };
}

function productionUrl() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (configured) return configured;
  const vercelUrl = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  return vercelUrl ? `https://${vercelUrl}` : "https://sloot-pakbonnen.vercel.app";
}

async function countQuery(query: PromiseLike<{ count: number | null; error: { message: string } | null }>) {
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count ?? 0;
}

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  if (!process.env.RESEND_API_KEY) {
    return Response.json({ error: "Email service is not configured." }, { status: 503 });
  }

  const admin = createAdminClient();
  const day = previousAmsterdamDay();
  const { data: settings, error: settingsError } = await admin
    .from("notification_settings")
    .select("organization_id,recipient_email,last_sent_date,organizations(name)")
    .eq("daily_digest_enabled", true)
    .not("recipient_email", "is", null);
  if (settingsError) return Response.json({ error: settingsError.message }, { status: 500 });

  let sent = 0;
  const failures: Array<{ organizationId: string; reason: string }> = [];
  for (const setting of settings ?? []) {
    if (!setting.recipient_email || setting.last_sent_date === day.dateKey) continue;
    try {
      const base = admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", setting.organization_id);
      const [incoming, processed, approved, rejected, pending] = await Promise.all([
        countQuery(base.gte("created_at", day.start).lt("created_at", day.end)),
        countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", setting.organization_id).in("status", ["approved", "rejected"]).gte("approved_at", day.start).lt("approved_at", day.end)),
        countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", setting.organization_id).eq("status", "approved").gte("approved_at", day.start).lt("approved_at", day.end)),
        countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", setting.organization_id).eq("status", "rejected").gte("approved_at", day.start).lt("approved_at", day.end)),
        countQuery(admin.from("delivery_notes").select("id", { count: "exact", head: true }).eq("organization_id", setting.organization_id).eq("status", "pending")),
      ]);
      const organization = Array.isArray(setting.organizations) ? setting.organizations[0] : setting.organizations;
      const pendingUrl = `${productionUrl()}/protected/pakbonnen?status=pending`;
      const email = dailyDigestEmail({
        organizationName: organization?.name || "Sloot 2Wielers",
        dateLabel: day.dateLabel,
        incoming,
        processed,
        approved,
        rejected,
        pending,
        pendingUrl,
      });
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
          "Content-Type": "application/json",
          "Idempotency-Key": `daily-digest/${setting.organization_id}/${day.dateKey}`,
        },
        body: JSON.stringify({
          from: process.env.EMAIL_FROM || DEFAULT_EMAIL_FROM,
          to: [setting.recipient_email],
          subject: email.subject,
          html: email.html,
          text: email.text,
        }),
      });
      if (!response.ok) {
        const errorBody = await response.text();
        throw new Error(`Resend returned ${response.status}: ${errorBody.slice(0, 300)}`);
      }
      const now = new Date().toISOString();
      const { error: updateError } = await admin
        .from("notification_settings")
        .update({ last_sent_date: day.dateKey, last_sent_at: now, updated_at: now })
        .eq("organization_id", setting.organization_id);
      if (updateError) throw updateError;
      await admin.from("audit_logs").insert({
        organization_id: setting.organization_id,
        actor_id: null,
        action: "notification.daily_digest_sent",
        entity_type: "notification_settings",
        entity_id: setting.organization_id,
        after_data: { date: day.dateKey, incoming, processed, approved, rejected, pending },
      });
      sent += 1;
    } catch (error) {
      console.error("daily digest failed", { organizationId: setting.organization_id, error });
      failures.push({
        organizationId: setting.organization_id,
        reason: error instanceof Error ? error.message : "Unknown error",
      });
    }
  }

  return Response.json({ ok: failures.length === 0, date: day.dateKey, sent, failed: failures.length }, { status: failures.length ? 500 : 200 });
}
