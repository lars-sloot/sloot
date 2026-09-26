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
    .from("notification_settings")
    .select("organization_id,send_time,updated_at")
    .eq("daily_digest_enabled", true);
  if (error) return Response.json({ error: error.message }, { status: 500 });

  let scheduled = 0;
  let failed = 0;
  for (const setting of settings ?? []) {
    try {
      await scheduleDailyDigest(setting.organization_id, setting.send_time, setting.updated_at);
      scheduled += 1;
    } catch (scheduleError) {
      failed += 1;
      console.error("daily digest scheduling failed", { organizationId: setting.organization_id, scheduleError });
    }
  }

  return Response.json({ ok: failed === 0, scheduled, failed }, { status: failed ? 500 : 200 });
}
