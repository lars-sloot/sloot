import { createAdminClient } from "@/lib/supabase/admin";

export async function GET(request: Request) {
  if (!process.env.CRON_SECRET || request.headers.get("authorization") !== `Bearer ${process.env.CRON_SECRET}`) {
    return new Response("Unauthorized", { status: 401 });
  }
  const admin = createAdminClient();
  const { data: expired, error } = await admin.from("delivery_notes").select("id,organization_id,photo_path,delivery_note_pages(storage_path)").lt("photo_delete_after", new Date().toISOString()).is("deleted_at", null).limit(100);
  if (error) return Response.json({ error: error.message }, { status: 500 });
  let removed = 0;
  for (const note of expired || []) {
    const photoPaths = note.delivery_note_pages?.length ? note.delivery_note_pages.map((page) => page.storage_path) : [note.photo_path];
    const { error: storageError } = await admin.storage.from("delivery-notes").remove(photoPaths);
    if (storageError) continue;
    const now = new Date().toISOString();
    await admin.from("delivery_notes").update({ deleted_at: now, updated_at: now }).eq("id", note.id);
    await admin.from("audit_logs").insert({ organization_id: note.organization_id, actor_id: null, action: "delivery_note.photo_retention_deleted", entity_type: "delivery_note", entity_id: note.id, before_data: { photo_paths: photoPaths }, after_data: { deleted_at: now } });
    removed += 1;
  }
  return Response.json({ ok: true, checked: expired?.length || 0, removed });
}
