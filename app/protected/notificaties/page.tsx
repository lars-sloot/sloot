import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { NotificationSettingsForm } from "@/components/sloot/notification-settings-form";

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

  const { data: settings } = await supabase
    .from("notification_settings")
    .select("daily_digest_enabled,recipient_email,last_sent_at")
    .eq("organization_id", profile.organization_id)
    .maybeSingle();

  return (
    <div>
      <p className="text-sm text-[#718078]">Beheer</p>
      <h1 className="mt-1 text-3xl font-semibold tracking-tight">Notificaties</h1>
      <p className="mt-2 max-w-2xl text-[#667168]">
        Stel in waar het dagelijkse overzicht van de pakbonnen naartoe wordt gestuurd.
      </p>
      <NotificationSettingsForm
        enabled={settings?.daily_digest_enabled ?? false}
        recipientEmail={settings?.recipient_email ?? ""}
        emailServiceConfigured={Boolean(process.env.RESEND_API_KEY)}
        lastSentAt={formatSentAt(settings?.last_sent_at ?? null)}
      />
    </div>
  );
}
