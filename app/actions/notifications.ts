"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

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
    const recipientEmail = String(formData.get("recipient_email") || "").trim().toLowerCase();
    if (!recipientEmail || !emailPattern.test(recipientEmail) || recipientEmail.length > 320) {
      return { status: "error", message: "Vul een geldig e-mailadres in." };
    }

    const { data: before } = await supabase
      .from("notification_settings")
      .select("daily_digest_enabled,recipient_email")
      .eq("organization_id", profile.organization_id)
      .maybeSingle();
    const after = {
      organization_id: profile.organization_id,
      daily_digest_enabled: enabled,
      recipient_email: recipientEmail,
      updated_at: new Date().toISOString(),
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
        recipient_email: recipientEmail,
      },
    });
    if (auditError) console.error("notification.settings_updated audit failed", { code: auditError.code });

    revalidatePath("/protected/notificaties");
    return {
      status: "success",
      message: enabled
        ? "De dagelijkse e-mailnotificatie is ingeschakeld."
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
