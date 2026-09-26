import { redirect } from "next/navigation";
import { NotificationSettingsForm, type NotificationUser } from "@/components/sloot/notification-settings-form";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

function formatSentAt(value: string | null) {
  if (!value) return null;
  return new Intl.DateTimeFormat("nl-NL", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone: "Europe/Amsterdam",
  }).format(new Date(value));
}

export default async function NotificationSettingsPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub || "";
  const { data: profile } = await supabase
    .from("profiles")
    .select("organization_id,role")
    .eq("id", userId)
    .maybeSingle();
  if (!profile || profile.role !== "admin") redirect("/protected");

  const admin = createAdminClient();
  const [{ data: profiles = [] }, { data: settings = [] }, { data: authUsers }] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,full_name,active")
      .eq("organization_id", profile.organization_id)
      .order("active", { ascending: false })
      .order("full_name"),
    supabase
      .from("user_notification_settings")
      .select("user_id,daily_digest_enabled,recipient_email,send_times,last_sent_at")
      .eq("organization_id", profile.organization_id),
    admin.auth.admin.listUsers({ page: 1, perPage: 1000 }),
  ]);

  const authEmailById = new Map((authUsers?.users ?? []).map((user) => [user.id, user.email ?? ""]));
  const settingsByUserId = new Map((settings ?? []).map((setting) => [setting.user_id, setting]));
  const users: NotificationUser[] = (profiles ?? []).flatMap((person) => {
    const setting = settingsByUserId.get(person.id);
    const email = authEmailById.get(person.id) || setting?.recipient_email || "";
    if (!email) return [];
    return [{
      id: person.id,
      name: person.full_name || email,
      email,
      active: person.active,
      enabled: setting?.daily_digest_enabled ?? false,
      sendTimes: Array.isArray(setting?.send_times) ? setting.send_times : ["08:00"],
      lastSentAt: formatSentAt(setting?.last_sent_at ?? null),
    }];
  });

  return (
    <div>
      <p className="text-sm text-[#718078]">Beheer</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Notificaties</h1>
      <p className="mt-2 max-w-2xl text-[#667168]">
        Kies per gebruiker wanneer het pakbonnenoverzicht wordt verzonden. Iedere gebruiker kan meerdere verzendmomenten per dag krijgen.
      </p>
      <NotificationSettingsForm
        users={users}
        emailServiceConfigured={Boolean(process.env.RESEND_API_KEY)}
      />
    </div>
  );
}
