"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) throw new Error("Niet ingelogd.");
  const { data: profile } = await supabase.from("profiles").select("organization_id,role,active").eq("id", userId).single();
  if (!profile?.active || profile.role !== "admin") throw new Error("Alleen een actieve beheerder mag gebruikers aanpassen.");
  return { supabase, userId, organizationId: profile.organization_id };
}

export async function createUser(formData: FormData) {
  const { supabase, userId, organizationId } = await requireAdmin();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const fullName = String(formData.get("full_name") || "").trim();
  const role = formData.get("role") === "admin" ? "admin" : "user";
  const branchIds = formData.getAll("branch_id").map(String);
  if (!email || !fullName) throw new Error("Naam en e-mailadres zijn verplicht.");
  const admin = createAdminClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "")
    || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000");
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { full_name: fullName },
    redirectTo: `${appUrl}/auth/confirm?next=/auth/update-password`,
  });
  if (error || !data.user) throw error || new Error("Gebruiker kon niet worden gemaakt.");
  await admin.from("profiles").update({ full_name: fullName, role, organization_id: organizationId }).eq("id", data.user.id);
  if (branchIds.length) await admin.from("user_branches").insert(branchIds.map((branchId) => ({ user_id: data.user.id, branch_id: branchId })));
  await supabase.from("audit_logs").insert({ organization_id: organizationId, actor_id: userId, action: "user.created", entity_type: "profile", entity_id: data.user.id, after_data: { full_name: fullName, email, role, branch_ids: branchIds, invitation_sent: true } });
  revalidatePath("/protected/gebruikers");
}

export async function updateUser(formData: FormData) {
  const { supabase, userId, organizationId } = await requireAdmin();
  const targetId = String(formData.get("user_id") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const role = formData.get("role") === "admin" ? "admin" : "user";
  const active = formData.get("active") === "on";
  const branchIds = formData.getAll("branch_id").map(String);
  if (!fullName) throw new Error("Naam is verplicht.");
  const { data: target } = await supabase.from("profiles").select("id").eq("id", targetId).eq("organization_id", organizationId).maybeSingle();
  if (!target) throw new Error("Deze gebruiker hoort niet bij jouw organisatie.");
  if (branchIds.length) {
    const { data: allowedBranches, error } = await supabase.from("branches").select("id").eq("organization_id", organizationId).in("id", branchIds);
    if (error) throw error;
    const allowedIds = new Set((allowedBranches ?? []).map((branch) => branch.id));
    if (branchIds.some((id) => !allowedIds.has(id))) throw new Error("Een gekozen filiaal hoort niet bij jouw organisatie.");
  }
  const admin = createAdminClient();
  const { data: before } = await admin.from("profiles").select("full_name,role,active,user_branches(branch_id)").eq("id", targetId).single();
  const { error } = await admin.from("profiles").update({ full_name: fullName, role, active, updated_at: new Date().toISOString() }).eq("id", targetId);
  if (error) throw error;
  const { error: deleteError } = await admin.from("user_branches").delete().eq("user_id", targetId);
  if (deleteError) throw deleteError;
  if (branchIds.length) {
    const { error: branchError } = await admin.from("user_branches").insert(branchIds.map((branchId) => ({ user_id: targetId, branch_id: branchId })));
    if (branchError) throw branchError;
  }
  const { error: auditError } = await supabase.from("audit_logs").insert({ organization_id: organizationId, actor_id: userId, action: "user.updated", entity_type: "profile", entity_id: targetId, before_data: before, after_data: { full_name: fullName, role, active, branch_ids: branchIds } });
  if (auditError) throw auditError;
  revalidatePath("/protected/gebruikers");
  revalidatePath("/protected/notificaties");
  revalidatePath("/protected/pakbonnen");
}

export type UserSettingsState = { status: "idle" | "success" | "error"; message: string };

export async function saveUserSettings(_previousState: UserSettingsState, formData: FormData): Promise<UserSettingsState> {
  try {
    await updateUser(formData);
    return { status: "success", message: "De gebruikersgegevens zijn opgeslagen." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Opslaan is niet gelukt. Controleer de gegevens en probeer het opnieuw." };
  }
}

export async function updateUserEmail(_previousState: UserSettingsState, formData: FormData): Promise<UserSettingsState> {
  try {
    const { supabase, userId, organizationId } = await requireAdmin();
    const targetId = String(formData.get("user_id") || "");
    const email = String(formData.get("email") || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { status: "error", message: "Vul een geldig e-mailadres in." };

    const { data: target, error: targetError } = await supabase.from("profiles").select("id").eq("id", targetId).eq("organization_id", organizationId).maybeSingle();
    if (targetError) throw targetError;
    if (!target) return { status: "error", message: "Deze gebruiker hoort niet bij jouw organisatie." };

    const admin = createAdminClient();
    const { data, error: userError } = await admin.auth.admin.getUserById(targetId);
    if (userError || !data.user?.email) return { status: "error", message: "Het huidige e-mailadres kon niet worden opgehaald." };
    const previousEmail = data.user.email;
    if (previousEmail.toLowerCase() === email) return { status: "success", message: "Dit e-mailadres is al ingesteld." };

    const { error: emailError } = await admin.auth.admin.updateUserById(targetId, { email });
    if (emailError) return { status: "error", message: emailError.code === "email_exists" || emailError.code === "email_address_not_authorized" ? "Dit e-mailadres is al in gebruik of niet toegestaan." : "Het e-mailadres kon niet worden gewijzigd. Controleer of het adres al in gebruik is en probeer het opnieuw." };

    // Keep existing schedules valid: only change the recipient, not their version timestamp.
    const { error: notificationError } = await supabase.from("user_notification_settings").update({ recipient_email: email }).eq("user_id", targetId).eq("organization_id", organizationId);
    if (notificationError) {
      const { error: rollbackError } = await admin.auth.admin.updateUserById(targetId, { email: previousEmail });
      revalidatePath("/protected/gebruikers");
      revalidatePath("/protected/notificaties");
      return { status: "error", message: rollbackError ? "Het inlogadres is gewijzigd, maar het notificatieadres kon niet worden bijgewerkt. Vernieuw de pagina en probeer het opnieuw." : "Het notificatieadres kon niet worden bijgewerkt. De e-mailwijziging is teruggedraaid; probeer het opnieuw." };
    }
    const { error: auditError } = await supabase.from("audit_logs").insert({ organization_id: organizationId, actor_id: userId, action: "user.email_updated", entity_type: "profile", entity_id: targetId, before_data: { email: previousEmail }, after_data: { email } });
    revalidatePath("/protected/gebruikers");
    revalidatePath("/protected/notificaties");
    revalidatePath("/protected/activiteiten");
    return auditError
      ? { status: "error", message: "Het e-mailadres is gewijzigd, maar kon niet in het activiteitenlog worden vastgelegd." }
      : { status: "success", message: "Het e-mailadres is gewijzigd voor inloggen en e-mailnotificaties. Het wachtwoord blijft gelijk." };
  } catch {
    return { status: "error", message: "Het e-mailadres kon niet worden gewijzigd. Probeer het opnieuw." };
  }
}
