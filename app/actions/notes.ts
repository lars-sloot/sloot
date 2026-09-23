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

export type DeleteNoteState = {
  status: "idle" | "error";
  message: string;
};

export async function deleteNote(
  _previousState: DeleteNoteState,
  formData: FormData,
): Promise<DeleteNoteState> {
  try {
    const { supabase, userId, profile } = await context();
    if (profile.role !== "admin") return { status: "error", message: "Alleen een beheerder mag een pakbon verwijderen." };

    const id = String(formData.get("id") || "");
    if (!id) return { status: "error", message: "Pakbon ontbreekt." };
    const { data: note, error: readError } = await supabase
      .from("delivery_notes")
      .select("id,branch_id,supplier,delivery_number,delivery_date,status,article_summary,photo_path,deleted_at")
      .eq("id", id)
      .single();
    if (readError || !note) return { status: "error", message: "Pakbon niet gevonden of al verwijderd." };

    if (!note.deleted_at) {
      const { error: storageError } = await supabase.storage.from("delivery-notes").remove([note.photo_path]);
      if (storageError) {
        console.error("delivery_note.delete storage failed", { id, code: storageError.name, message: storageError.message });
        return { status: "error", message: "De foto kon niet worden verwijderd. De pakbon is behouden." };
      }
    }

    const { data: deleted, error: deleteError } = await supabase
      .from("delivery_notes")
      .delete()
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (deleteError || !deleted) {
      console.error("delivery_note.delete failed", { id, code: deleteError?.code, message: deleteError?.message });
      return { status: "error", message: "De pakbon kon niet worden verwijderd." };
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      organization_id: profile.organization_id,
      actor_id: userId,
      action: "delivery_note.deleted",
      entity_type: "delivery_note",
      entity_id: id,
      before_data: note,
      after_data: { deleted: true },
    });
    if (auditError) console.error("delivery_note.delete audit failed", { id, code: auditError.code, message: auditError.message });

    revalidatePath("/protected");
    revalidatePath("/protected/pakbonnen");
    revalidatePath("/protected/activiteiten");
    return { status: "idle", message: "" };
  } catch (error) {
    console.error("delivery_note.delete unexpected failure", error);
    return { status: "error", message: error instanceof Error ? error.message : "Verwijderen is mislukt." };
  }
}

export type UpdateNoteState = {
  status: "idle" | "success" | "error";
  message: string;
};

export type NoteItemState = {
  status: "idle" | "success" | "error";
  message: string;
};

function parseQuantity(value: FormDataEntryValue | null) {
  const quantity = Number(String(value || "").trim().replace(",", "."));
  return Number.isFinite(quantity) && quantity > 0 ? quantity : null;
}

export async function updateNoteItem(
  _previousState: NoteItemState,
  formData: FormData,
): Promise<NoteItemState> {
  try {
    const { supabase, userId, profile } = await context();
    const id = String(formData.get("item_id") || "");
    const noteId = String(formData.get("note_id") || "");
    const description = String(formData.get("description") || "").trim();
    const quantity = parseQuantity(formData.get("quantity"));
    if (!id || !noteId || !description || quantity === null) return { status: "error", message: "Vul een omschrijving en een aantal groter dan nul in." };

    const { data: before, error: readError } = await supabase
      .from("delivery_note_items")
      .select("id,delivery_note_id,line_number,article_code,ean,description,quantity,unit")
      .eq("id", id)
      .eq("delivery_note_id", noteId)
      .single();
    if (readError || !before) return { status: "error", message: "Deze artikelregel is niet gevonden of niet toegankelijk." };

    const after = { description: description.slice(0, 500), quantity };
    const { data: updated, error } = await supabase.from("delivery_note_items").update(after).eq("id", id).eq("delivery_note_id", noteId).select("id").maybeSingle();
    if (error || !updated) return { status: "error", message: error?.message || "De artikelregel kon niet worden opgeslagen." };

    const { error: auditError } = await supabase.from("audit_logs").insert({
      organization_id: profile.organization_id,
      actor_id: userId,
      action: "delivery_note.item_updated",
      entity_type: "delivery_note_item",
      entity_id: id,
      before_data: before,
      after_data: { ...before, ...after },
    });
    if (auditError) console.error("delivery_note.item_updated audit failed", { id, code: auditError.code, message: auditError.message });
    revalidatePath("/protected/pakbonnen");
    return { status: "success", message: "Regel opgeslagen." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Opslaan is mislukt." };
  }
}

export async function createNoteItem(
  _previousState: NoteItemState,
  formData: FormData,
): Promise<NoteItemState> {
  try {
    const { supabase, userId, profile } = await context();
    const noteId = String(formData.get("note_id") || "");
    const description = String(formData.get("description") || "").trim();
    const quantity = parseQuantity(formData.get("quantity"));
    if (!noteId || !description || quantity === null) return { status: "error", message: "Vul een omschrijving en een aantal groter dan nul in." };

    const { data: note } = await supabase.from("delivery_notes").select("id").eq("id", noteId).single();
    if (!note) return { status: "error", message: "Deze pakbon is niet gevonden of niet toegankelijk." };
    const { data: existing = [] } = await supabase.from("delivery_note_items").select("line_number").eq("delivery_note_id", noteId);
    const lineNumber = Math.max(0, ...(existing ?? []).map((item) => item.line_number)) + 1;
    const item = { delivery_note_id: noteId, line_number: lineNumber, description: description.slice(0, 500), quantity, unit: "STK" };
    const { data: created, error } = await supabase.from("delivery_note_items").insert(item).select("id").single();
    if (error || !created) return { status: "error", message: error?.message || "De artikelregel kon niet worden toegevoegd." };

    const { error: auditError } = await supabase.from("audit_logs").insert({
      organization_id: profile.organization_id,
      actor_id: userId,
      action: "delivery_note.item_created",
      entity_type: "delivery_note_item",
      entity_id: created.id,
      after_data: { id: created.id, ...item },
    });
    if (auditError) console.error("delivery_note.item_created audit failed", { id: created.id, code: auditError.code, message: auditError.message });
    revalidatePath("/protected/pakbonnen");
    return { status: "success", message: "Nieuwe regel toegevoegd." };
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : "Toevoegen is mislukt." };
  }
}

export async function updateNoteData(
  _previousState: UpdateNoteState,
  formData: FormData,
): Promise<UpdateNoteState> {
  try {
    const { supabase, userId, profile } = await context();
    const id = String(formData.get("id") || "");
    const branchId = String(formData.get("branch_id") || "");
    if (!id || !branchId) return { status: "error", message: "Kies een geldig filiaal." };

    const { data: before, error: readError } = await supabase
      .from("delivery_notes")
      .select("supplier,delivery_number,delivery_date,article_summary,branch_id")
      .eq("id", id)
      .single();
    if (readError || !before) return { status: "error", message: "Pakbon niet gevonden of niet toegankelijk." };

    const { data: targetBranch } = await supabase
      .from("branches")
      .select("id,organization_id")
      .eq("id", branchId)
      .eq("organization_id", profile.organization_id)
      .eq("active", true)
      .maybeSingle();
    if (!targetBranch) return { status: "error", message: "Dit filiaal is niet beschikbaar." };

    if (profile.role !== "admin") {
      const { data: assignment } = await supabase
        .from("user_branches")
        .select("branch_id")
        .eq("user_id", userId)
        .eq("branch_id", branchId)
        .maybeSingle();
      if (!assignment) return { status: "error", message: "Je hebt geen toegang tot dit filiaal." };
    }

    const after = {
      supplier: String(formData.get("supplier") || "").trim() || null,
      delivery_number: String(formData.get("delivery_number") || "").trim() || null,
      delivery_date: String(formData.get("delivery_date") || "").trim() || null,
      article_summary: String(formData.get("article_summary") || "").trim() || null,
      branch_id: branchId,
      updated_at: new Date().toISOString(),
    };
    const { data: updated, error } = await supabase
      .from("delivery_notes")
      .update(after)
      .eq("id", id)
      .select("id")
      .maybeSingle();
    if (error || !updated) {
      console.error("delivery_note.update failed", { id, code: error?.code, message: error?.message });
      return { status: "error", message: error?.message || "De wijzigingen konden niet worden opgeslagen." };
    }

    const { error: auditError } = await supabase.from("audit_logs").insert({
      organization_id: profile.organization_id,
      actor_id: userId,
      action: "delivery_note.updated",
      entity_type: "delivery_note",
      entity_id: id,
      before_data: before,
      after_data: after,
    });
    if (auditError) console.error("delivery_note.update audit failed", { id, code: auditError.code, message: auditError.message });
    revalidatePath("/protected/pakbonnen");
    revalidatePath("/protected");
    return { status: "success", message: "Wijzigingen zijn opgeslagen." };
  } catch (error) {
    console.error("delivery_note.update unexpected failure", error);
    return { status: "error", message: error instanceof Error ? error.message : "Opslaan is mislukt." };
  }
}
