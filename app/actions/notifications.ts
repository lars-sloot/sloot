"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { normalizeSendTime, scheduleDailyDigest } from "@/lib/email/digest-schedule";

export type NotificationSettingsState = {
  status: "idle" | "success" | "error";
  message: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateNotificationSettings(
  _previousState: NotificationSettingsState,
  formData: FormData,
): Promise<NotificationSettingsState> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (!userId) return { status: "error", message: "Je bent niet ingelogd." };

    const { data: profile } = await supabase
      .from("profiles")
      .select("organization_id,role")
      .eq("id", userId)
      .single();
    if (!profile || profile.role !== "admin") {
      return { status: "error", message: "Alleen een beheerder mag notificaties aanpassen." };
    }

    const enabled = formData.get("daily_digest_enabled") === "on";
    const recipientEmails = [...new Set(formData.getAll("recipient_email").map((value) => String(value).trim().toLowerCase()).filter(Boolean))];
    const sendTime = normalizeSendTime(String(formData.get("send_time") || ""));
    if (!recipientEmails.length || recipientEmails.length > 20 || recipientEmails.some((email) => !emailPattern.test(email) || email.length > 320)) {
      return { status: "error", message: "Vul één tot twintig geldige e-mailadressen in." };
    }
    if (!sendTime) return { status: "error", message: "Kies een verzendmoment in stappen van 15 minuten." };

    const { data: before } = await supabase
      .from("notification_settings")
      .select("daily_digest_enabled,recipient_emails,send_time")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    const updatedAt = new Date().toISOString();
    const after = {
      organization_id: profile.organization_id,
      daily_digest_enabled: enabled,
      recipient_emails: recipientEmails,
      send_time: sendTime,
      updated_at: updatedAt,
    };
    const { error } = await supabase
      .from("notification_settings")
      .upsert(after, { onConflict: "organization_id" });
    if (error) throw error;

    const { error: auditError } = await supabase.from("audit_logs").insert({
      organization_id: profile.organization_id,
      actor_id: userId,
      action: "notification.settings_updated",
      entity_type: "notification_settings",
      entity_id: profile.organization_id,
      before_data: before,
      after_data: {
        daily_digest_enabled: enabled,
        recipient_emails: recipientEmails,
        send_time: sendTime,
      },
    });
    if (auditError) console.error("notification.settings_updated audit failed", { code: auditError.code });

    let scheduleWarning = "";
    if (enabled) {
      try {
        await scheduleDailyDigest(profile.organization_id, sendTime, updatedAt);
      } catch (scheduleError) {
        console.error("notification.schedule failed", scheduleError);
        scheduleWarning = " De planning wordt vannacht automatisch opnieuw geprobeerd.";
      }
    }
    revalidatePath("/protected/notificaties");
    return {
      status: "success",
      message: enabled
        ? `De dagelijkse e-mailnotificatie is ingeschakeld voor ${sendTime} uur.${scheduleWarning}`
        : "De dagelijkse e-mailnotificatie is uitgeschakeld.",
    };
  } catch (error) {
    console.error("notification.settings update failed", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "De instellingen konden niet worden opgeslagen.",
    };
  }
}
