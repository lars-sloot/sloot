"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

async function requireAdmin() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) throw new Error("Niet ingelogd.");
  const { data: profile } = await supabase.from("profiles").select("organization_id,role").eq("id", userId).single();
  if (!profile || profile.role !== "admin") throw new Error("Alleen een beheerder mag gebruikers aanpassen.");
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
  const { data, error } = await admin.auth.admin.createUser({ email, email_confirm: true, user_metadata: { full_name: fullName } });
  if (error || !data.user) throw error || new Error("Gebruiker kon niet worden gemaakt.");
  await admin.from("profiles").update({ full_name: fullName, role, organization_id: organizationId }).eq("id", data.user.id);
  if (branchIds.length) await admin.from("user_branches").insert(branchIds.map((branchId) => ({ user_id: data.user.id, branch_id: branchId })));
  await supabase.from("audit_logs").insert({ organization_id: organizationId, actor_id: userId, action: "user.created", entity_type: "profile", entity_id: data.user.id, after_data: { full_name: fullName, email, role, branch_ids: branchIds } });
  revalidatePath("/protected/gebruikers");
}

export async function updateUser(formData: FormData) {
  const { supabase, userId, organizationId } = await requireAdmin();
  const targetId = String(formData.get("user_id") || "");
  const fullName = String(formData.get("full_name") || "").trim();
  const role = formData.get("role") === "admin" ? "admin" : "user";
  const active = formData.get("active") === "on";
  const branchIds = formData.getAll("branch_id").map(String);
  const admin = createAdminClient();
  const { data: before } = await admin.from("profiles").select("full_name,role,active,user_branches(branch_id)").eq("id", targetId).single();
  const { error } = await admin.from("profiles").update({ full_name: fullName, role, active, updated_at: new Date().toISOString() }).eq("id", targetId);
  if (error) throw error;
  await admin.from("user_branches").delete().eq("user_id", targetId);
  if (branchIds.length) await admin.from("user_branches").insert(branchIds.map((branchId) => ({ user_id: targetId, branch_id: branchId })));
  await supabase.from("audit_logs").insert({ organization_id: organizationId, actor_id: userId, action: "user.updated", entity_type: "profile", entity_id: targetId, before_data: before, after_data: { full_name: fullName, role, active, branch_ids: branchIds } });
  revalidatePath("/protected/gebruikers");
}

