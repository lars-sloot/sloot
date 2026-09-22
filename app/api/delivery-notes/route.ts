import { NextResponse } from "next/server";
import { send } from "@vercel/queue";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/heic", "application/pdf"]);
const maxBytes = 15 * 1024 * 1024;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const branchId = String(form.get("branch_id") || "");
  if (!(file instanceof File) || !branchId) return NextResponse.json({ error: "Foto en filiaal zijn verplicht." }, { status: 400 });
  if (!allowedTypes.has(file.type) || file.size > maxBytes) return NextResponse.json({ error: "Gebruik JPG, PNG, HEIC of PDF tot 15 MB." }, { status: 400 });

  const { data: profile } = await supabase.from("profiles").select("organization_id,role,active").eq("id", userId).single();
  if (!profile?.active) return NextResponse.json({ error: "Account is niet actief." }, { status: 403 });
  if (profile.role !== "admin") {
    const { data: assignment } = await supabase.from("user_branches").select("branch_id").eq("user_id", userId).eq("branch_id", branchId).maybeSingle();
    if (!assignment) return NextResponse.json({ error: "Geen toegang tot dit filiaal." }, { status: 403 });
  }

  const admin = createAdminClient();
  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${profile.organization_id}/${branchId}/${crypto.randomUUID()}.${extension}`;
  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage.from("delivery-notes").upload(path, bytes, { contentType: file.type, upsert: false });
  if (uploadError) return NextResponse.json({ error: uploadError.message }, { status: 500 });

  const { data: note, error: insertError } = await admin.from("delivery_notes").insert({
    organization_id: profile.organization_id,
    branch_id: branchId,
    uploaded_by: userId,
    photo_path: path,
    status: "processing",
  }).select("id").single();

  if (insertError || !note) {
    await admin.storage.from("delivery-notes").remove([path]);
    return NextResponse.json({ error: insertError?.message || "Opslaan mislukt." }, { status: 500 });
  }

  await admin.from("audit_logs").insert({
    organization_id: profile.organization_id,
    actor_id: userId,
    action: "delivery_note.uploaded",
    entity_type: "delivery_note",
    entity_id: note.id,
    after_data: { branch_id: branchId, photo_path: path },
  });

  try {
    const { messageId } = await send("delivery-note-ai", { noteId: note.id, actorId: userId }, {
      idempotencyKey: `delivery-note-${note.id}`,
      retentionSeconds: 604800,
      region: "fra1",
    });
    return NextResponse.json({ id: note.id, queued: true, message_id: messageId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("delivery_notes").update({ status: "error", ai_result: { error: `Queue: ${message.slice(0, 900)}` } }).eq("id", note.id);
    return NextResponse.json({ id: note.id, queued: false, error: "De foto is opgeslagen, maar kon niet in de AI-wachtrij worden geplaatst." }, { status: 503 });
  }
}
