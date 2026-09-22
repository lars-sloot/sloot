"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export async function undoAudit(formData: FormData) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) throw new Error("Niet ingelogd.");
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).single();
  if (profile?.role !== "admin") throw new Error("Alleen een beheerder kan handelingen terugdraaien.");

  const logId = Number(formData.get("log_id"));
  const { data: log } = await supabase.from("audit_logs").select("*").eq("id", logId).is("undone_at", null).single();
  if (!log) throw new Error("Deze handeling is al teruggedraaid of bestaat niet.");
  const before = (log.before_data || {}) as Record<string, unknown>;

  if (log.entity_type === "delivery_note" && ["delivery_note.approved", "delivery_note.rejected", "delivery_note.updated"].includes(log.action)) {
    await supabase.from("delivery_notes").update({
      ...(log.action === "delivery_note.updated" ? {
        supplier: before.supplier,
        delivery_number: before.delivery_number,
        delivery_date: before.delivery_date,
        article_summary: before.article_summary,
      } : {
        status: before.status,
        rejection_reason: before.rejection_reason,
        approved_by: before.approved_by,
        approved_at: before.approved_at,
      }),
      updated_at: new Date().toISOString(),
    }).eq("id", log.entity_id);
  } else if (log.entity_type === "profile" && log.action === "user.updated") {
    await supabase.from("profiles").update({ full_name: before.full_name, role: before.role, active: before.active }).eq("id", log.entity_id);
    await supabase.from("user_branches").delete().eq("user_id", log.entity_id);
    const previous = Array.isArray(before.user_branches) ? before.user_branches as Array<{ branch_id?: string }> : [];
    const branchIds = previous.map((entry) => entry.branch_id).filter((id): id is string => Boolean(id));
    if (branchIds.length) await supabase.from("user_branches").insert(branchIds.map((branchId) => ({ user_id: log.entity_id, branch_id: branchId })));
  } else if (log.entity_type === "profile" && log.action === "user.created") {
    await supabase.from("profiles").update({ active: false }).eq("id", log.entity_id);
  } else {
    throw new Error("Deze handeling kan niet veilig worden teruggedraaid.");
  }

  const now = new Date().toISOString();
  await supabase.from("audit_logs").update({ undone_by: userId, undone_at: now }).eq("id", log.id);
  await supabase.from("audit_logs").insert({ organization_id: log.organization_id, actor_id: userId, action: "audit.undo", entity_type: log.entity_type, entity_id: log.entity_id, before_data: { audit_log_id: log.id }, after_data: { undone_at: now } });
  revalidatePath("/protected/activiteiten");
  revalidatePath("/protected/pakbonnen");
  revalidatePath("/protected/gebruikers");
}
