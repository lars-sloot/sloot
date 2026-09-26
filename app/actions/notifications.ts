"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { deliverDailyDigest } from "@/lib/email/deliver-daily-digest";
import { amsterdamDateKey, AMSTERDAM_TIME_ZONE, normalizeSendTime, scheduleDailyDigest } from "@/lib/email/digest-schedule";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export type NotificationSettingsState = {
  status: "idle" | "success" | "error";
  message: string;
};

export async function sendTestDigestNow(
  _previousState: NotificationSettingsState,
  formData: FormData,
): Promise<NotificationSettingsState> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const actorId = auth?.claims?.sub;
    if (!actorId) return { status: "error", message: "Je bent niet ingelogd." };

    const { data: actor } = await supabase
      .from("profiles")
      .select("organization_id,role")
      .eq("id", actorId)
      .single();
    if (!actor || actor.role !== "admin") {
      return { status: "error", message: "Alleen een beheerder mag een testmail versturen." };
    }

    const targetUserId = String(formData.get("user_id") || "");
    if (!targetUserId) return { status: "error", message: "De gebruiker ontbreekt." };
    const { data: target } = await supabase
      .from("profiles")
      .select("id,organization_id,full_name,active")
      .eq("id", targetUserId)
      .eq("organization_id", actor.organization_id)
      .maybeSingle();
    if (!target) return { status: "error", message: "Deze gebruiker hoort niet bij jouw organisatie." };
    if (!target.active) return { status: "error", message: "Voor een inactieve gebruiker kan geen testmail worden verstuurd." };

    const admin = createAdminClient();
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(targetUserId);
    const recipientEmail = authUser.user?.email?.trim().toLowerCase();
    if (authUserError || !recipientEmail) {
      return { status: "error", message: "Voor deze gebruiker is geen geldig account-e-mailadres gevonden." };
    }

    const requestId = randomUUID();
    const now = new Date();
    const sendTime = new Intl.DateTimeFormat("nl-NL", {
      timeZone: AMSTERDAM_TIME_ZONE,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(now);
    const result = await deliverDailyDigest({
      organizationId: actor.organization_id,
      userId: targetUserId,
      recipient: recipientEmail,
      scheduledDate: amsterdamDateKey(now),
      sendTime,
      idempotencyKey: `manual-daily-digest/${actor.organization_id}/${targetUserId}/${requestId}`,
      messageId: requestId,
      actorId,
      auditAction: "notification.test_digest_sent",
      mode: "manual",
    });

    revalidatePath("/protected/notificaties");
    return {
      status: "success",
      message: `Testmail naar ${recipientEmail} is door Resend geaccepteerd${result.resendMessageId ? ` (bericht-ID ${result.resendMessageId})` : ""}.`,
    };
  } catch (error) {
    console.error("manual notification test failed", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "De testmail kon niet worden verstuurd.",
    };
  }
}

export async function updateUserNotificationSettings(
  _previousState: NotificationSettingsState,
  formData: FormData,
): Promise<NotificationSettingsState> {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const actorId = auth?.claims?.sub;
    if (!actorId) return { status: "error", message: "Je bent niet ingelogd." };

    const { data: actor } = await supabase
      .from("profiles")
      .select("organization_id,role")
      .eq("id", actorId)
      .single();
    if (!actor || actor.role !== "admin") {
      return { status: "error", message: "Alleen een beheerder mag notificaties aanpassen." };
    }

    const targetUserId = String(formData.get("user_id") || "");
    const enabled = formData.get("daily_digest_enabled") === "on";
    const sendTimes = [...new Set(formData.getAll("send_time")
      .map((value) => normalizeSendTime(String(value)))
      .filter((value): value is string => Boolean(value)))].sort();
    if (!targetUserId) return { status: "error", message: "De gebruiker ontbreekt." };
    if (!sendTimes.length || sendTimes.length > 12) {
      return { status: "error", message: "Kies één tot twaalf verzendmomenten in stappen van 15 minuten." };
    }

    const { data: target } = await supabase
      .from("profiles")
      .select("id,organization_id,full_name")
      .eq("id", targetUserId)
      .eq("organization_id", actor.organization_id)
      .maybeSingle();
    if (!target) return { status: "error", message: "Deze gebruiker hoort niet bij jouw organisatie." };

    const admin = createAdminClient();
    const { data: authUser, error: authUserError } = await admin.auth.admin.getUserById(targetUserId);
    const recipientEmail = authUser.user?.email?.trim().toLowerCase();
    if (authUserError || !recipientEmail) {
      return { status: "error", message: "Voor deze gebruiker is geen geldig account-e-mailadres gevonden." };
    }

    const { data: before } = await supabase
      .from("user_notification_settings")
      .select("daily_digest_enabled,recipient_email,send_times")
      .eq("user_id", targetUserId)
      .maybeSingle();
    const updatedAt = new Date().toISOString();
    const after = {
      user_id: targetUserId,
      organization_id: actor.organization_id,
      daily_digest_enabled: enabled,
      recipient_email: recipientEmail,
      send_times: sendTimes,
      updated_at: updatedAt,
    };
    const { error } = await supabase
      .from("user_notification_settings")
      .upsert(after, { onConflict: "user_id" });
    if (error) throw error;

    const { error: auditError } = await supabase.from("audit_logs").insert({
      organization_id: actor.organization_id,
      actor_id: actorId,
      action: "notification.user_settings_updated",
      entity_type: "user_notification_settings",
      entity_id: targetUserId,
      before_data: before,
      after_data: {
        user_name: target.full_name,
        daily_digest_enabled: enabled,
        recipient_email: recipientEmail,
        send_times: sendTimes,
      },
    });
    if (auditError) console.error("notification.user_settings_updated audit failed", { code: auditError.code });

    let failedSchedules = 0;
    if (enabled) {
      const scheduleResults = await Promise.allSettled(
        sendTimes.map((sendTime) => scheduleDailyDigest(actor.organization_id, targetUserId, sendTime, updatedAt)),
      );
      scheduleResults.forEach((result, index) => {
        if (result.status === "fulfilled") {
          console.log(JSON.stringify({ level: "info", message: "digest_scheduled", userId: targetUserId, sendTime: sendTimes[index], scheduledDate: result.value.scheduledDate, queueMessageId: result.value.messageId }));
        } else {
          console.error(JSON.stringify({ level: "error", message: "digest_schedule_failed", userId: targetUserId, sendTime: sendTimes[index], error: result.reason instanceof Error ? result.reason.message : String(result.reason) }));
        }
      });
      failedSchedules = scheduleResults.filter((result) => result.status === "rejected").length;
      if (failedSchedules) console.error("notification schedules failed", { targetUserId, failedSchedules });
    }

    revalidatePath("/protected/notificaties");
    return {
      status: "success",
      message: enabled
        ? `Notificaties voor ${target.full_name || recipientEmail} zijn ingesteld op ${sendTimes.join(", ")} uur.${failedSchedules ? " Niet alle momenten konden direct worden gepland; de nachtelijke controle probeert dit opnieuw." : ""}`
        : `Notificaties voor ${target.full_name || recipientEmail} zijn uitgeschakeld.`,
    };
  } catch (error) {
    console.error("user notification settings update failed", error);
    return {
      status: "error",
      message: error instanceof Error ? error.message : "De instellingen konden niet worden opgeslagen.",
    };
  }
}
