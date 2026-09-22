"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

async function context() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) throw new Error("Niet ingelogd.");
  const { data: profile } = await supabase.from("profiles").select("organization_id,role").eq("id", userId).single();
  if (!profile) throw new Error("Profiel ontbreekt.");
  return { supabase, userId, profile };
}

export async function approveNote(formData: FormData) {
  const { supabase, userId, profile } = await context();
  const id = String(formData.get("id") || "");
  const { data: before } = await supabase.from("delivery_notes").select("status,rejection_reason,approved_by,approved_at").eq("id", id).single();
  if (!before || before.status !== "pending") throw new Error("Deze pakbon is al behandeld.");
  const after = { status: "approved", rejection_reason: null, approved_by: userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("delivery_notes").update(after).eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (error || !data) throw error || new Error("De pakbon is ondertussen door iemand anders behandeld.");
  await supabase.from("audit_logs").insert({ organization_id: profile.organization_id, actor_id: userId, action: "delivery_note.approved", entity_type: "delivery_note", entity_id: id, before_data: before, after_data: after });
  revalidatePath("/protected");
  revalidatePath("/protected/pakbonnen");
}

export async function rejectNote(formData: FormData) {
  const { supabase, userId, profile } = await context();
  const id = String(formData.get("id") || "");
  const reason = String(formData.get("reason") || "").trim();
  if (!reason) throw new Error("Een reden is verplicht.");
  const { data: before } = await supabase.from("delivery_notes").select("status,rejection_reason,approved_by,approved_at").eq("id", id).single();
  if (!before || before.status !== "pending") throw new Error("Deze pakbon is al behandeld.");
  const after = { status: "rejected", rejection_reason: reason, approved_by: userId, approved_at: new Date().toISOString(), updated_at: new Date().toISOString() };
  const { data, error } = await supabase.from("delivery_notes").update(after).eq("id", id).eq("status", "pending").select("id").maybeSingle();
  if (error || !data) throw error || new Error("De pakbon is ondertussen door iemand anders behandeld.");
  await supabase.from("audit_logs").insert({ organization_id: profile.organization_id, actor_id: userId, action: "delivery_note.rejected", entity_type: "delivery_note", entity_id: id, before_data: before, after_data: after });
  revalidatePath("/protected");
  revalidatePath("/protected/pakbonnen");
}

export async function deleteNotePhoto(formData: FormData) {
  const { supabase, userId, profile } = await context();
  if (profile.role !== "admin") throw new Error("Alleen een beheerder mag foto's verwijderen.");
  const id = String(formData.get("id") || "");
  const { data: note } = await supabase.from("delivery_notes").select("photo_path,deleted_at").eq("id", id).single();
  if (!note || note.deleted_at) return;
  const { error: storageError } = await supabase.storage.from("delivery-notes").remove([note.photo_path]);
  if (storageError) throw storageError;
  const now = new Date().toISOString();
  await supabase.from("delivery_notes").update({ deleted_at: now, updated_at: now }).eq("id", id);
  await supabase.from("audit_logs").insert({ organization_id: profile.organization_id, actor_id: userId, action: "delivery_note.photo_deleted", entity_type: "delivery_note", entity_id: id, before_data: { photo_path: note.photo_path }, after_data: { deleted_at: now } });
  revalidatePath("/protected");
  revalidatePath("/protected/pakbonnen");
}

export async function updateNoteData(formData: FormData) {
  const { supabase, userId, profile } = await context();
  const id = String(formData.get("id") || "");
  const { data: before } = await supabase.from("delivery_notes").select("supplier,delivery_number,delivery_date,article_summary").eq("id", id).single();
  if (!before) throw new Error("Pakbon niet gevonden.");
  const after = {
    supplier: String(formData.get("supplier") || "").trim() || null,
    delivery_number: String(formData.get("delivery_number") || "").trim() || null,
    delivery_date: String(formData.get("delivery_date") || "").trim() || null,
    article_summary: String(formData.get("article_summary") || "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  const { error } = await supabase.from("delivery_notes").update(after).eq("id", id);
  if (error) throw error;
  await supabase.from("audit_logs").insert({ organization_id: profile.organization_id, actor_id: userId, action: "delivery_note.updated", entity_type: "delivery_note", entity_id: id, before_data: before, after_data: after });
  revalidatePath("/protected/pakbonnen");
}
