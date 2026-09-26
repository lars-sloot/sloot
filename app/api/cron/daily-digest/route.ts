import { createAdminClient } from "@/lib/supabase/admin";
import { scheduleDailyDigest } from "@/lib/email/digest-schedule";

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }

  const admin = createAdminClient();
  const { data: settings, error } = await admin
    .from("user_notification_settings")
    .select("organization_id,user_id,send_times,updated_at,profiles(active)")
    .eq("daily_digest_enabled", true);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let scheduled = 0;
  let failed = 0;
  for (const setting of settings ?? []) {
    const relatedProfile = Array.isArray(setting.profiles) ? setting.profiles[0] : setting.profiles;
    if (!relatedProfile?.active) continue;
    const sendTimes = Array.isArray(setting.send_times) ? setting.send_times : [];
    for (const sendTime of sendTimes) {
      try {
        await scheduleDailyDigest(setting.organization_id, setting.user_id, sendTime, setting.updated_at);
        scheduled += 1;
      } catch (scheduleError) {
        failed += 1;
        console.error("daily digest scheduling failed", { organizationId: setting.organization_id, userId: setting.user_id, sendTime, scheduleError });
      }
    }
  }

  return Response.json({ ok: failed === 0, scheduled, failed }, { status: failed ? 500 : 200 });
}
