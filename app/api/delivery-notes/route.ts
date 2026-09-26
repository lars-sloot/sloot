import { NextResponse } from "next/server";
import { send } from "@vercel/queue";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "image/heic", "application/pdf"]);
const maxFileBytes = 15 * 1024 * 1024;
const maxTotalBytes = 50 * 1024 * 1024;
const maxPages = 10;

function fileType(file: File) {
  if (allowedTypes.has(file.type)) return file.type;
  const extension = file.name.split(".").pop()?.toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", pdf: "application/pdf" } as Record<string, string>)[extension || ""] || "";
}

async function queueDeliveryNote(noteId: string, actorId: string) {
  const admin = createAdminClient();
  try {
    const { messageId } = await send("delivery-note-ai", { noteId, actorId }, {
      idempotencyKey: `delivery-note-${noteId}`,
      retentionSeconds: 604800,
      region: "fra1",
    });
    return NextResponse.json({ id: noteId, queued: true, message_id: messageId }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("delivery_notes").update({ status: "error", ai_result: { error: `Queue: ${message.slice(0, 900)}` } }).eq("id", noteId);
    return NextResponse.json({ id: noteId, queued: false, error: "De pagina's zijn opgeslagen, maar konden niet in de AI-wachtrij worden geplaatst." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

  const form = await request.formData();
  const file = form.get("file");
  const branchId = String(form.get("branch_id") || "");
  const requestedNoteId = String(form.get("note_id") || "");
  const pageNumber = Number(form.get("page_number") || 1);
  const pageCount = Number(form.get("page_count") || 1);

  if (!(file instanceof File) || !branchId) return NextResponse.json({ error: "Bestand en filiaal zijn verplicht." }, { status: 400 });
  if (!Number.isInteger(pageNumber) || !Number.isInteger(pageCount) || pageNumber < 1 || pageCount < 1 || pageNumber > pageCount || pageCount > maxPages) {
    return NextResponse.json({ error: `Een pakbon mag maximaal ${maxPages} pagina's bevatten.` }, { status: 400 });
  }
  const mimeType = fileType(file);
  if (!mimeType || file.size < 1 || file.size > maxFileBytes) {
    return NextResponse.json({ error: "Gebruik JPG, PNG, WEBP, HEIC of PDF tot 15 MB per pagina." }, { status: 400 });
  }

  const { data: profile } = await supabase.from("profiles").select("organization_id,role,active").eq("id", userId).single();
  if (!profile?.active) return NextResponse.json({ error: "Account is niet actief." }, { status: 403 });
  if (profile.role !== "admin") {
    const { data: assignment } = await supabase.from("user_branches").select("branch_id").eq("user_id", userId).eq("branch_id", branchId).maybeSingle();
    if (!assignment) return NextResponse.json({ error: "Geen toegang tot dit filiaal." }, { status: 403 });
  }

  const admin = createAdminClient();
  let noteId = requestedNoteId;
  let createdNote = false;

  if (noteId) {
    const { data: note } = await admin.from("delivery_notes").select("id,organization_id,branch_id,uploaded_by,status").eq("id", noteId).single();
    if (!note || note.organization_id !== profile.organization_id || note.branch_id !== branchId || note.uploaded_by !== userId || note.status !== "processing") {
      return NextResponse.json({ error: "Deze upload kan niet worden hervat." }, { status: 403 });
    }

    const { data: existingPage } = await admin.from("delivery_note_pages").select("id").eq("delivery_note_id", noteId).eq("page_number", pageNumber).maybeSingle();
    if (existingPage) {
      if (pageNumber === pageCount) return queueDeliveryNote(noteId, userId);
      return NextResponse.json({ id: noteId, page_number: pageNumber, queued: false }, { status: 200 });
    }
  } else {
    if (pageNumber !== 1) return NextResponse.json({ error: "De eerste pagina ontbreekt." }, { status: 400 });
    noteId = crypto.randomUUID();
    createdNote = true;
  }

  const { data: existingPages = [] } = await admin.from("delivery_note_pages").select("size_bytes").eq("delivery_note_id", noteId);
  const totalBytes = (existingPages ?? []).reduce((total, page) => total + Number(page.size_bytes), 0) + file.size;
  if (totalBytes > maxTotalBytes) return NextResponse.json({ error: "Alle pagina's samen mogen maximaal 50 MB zijn." }, { status: 400 });

  const extension = file.name.split(".").pop()?.toLowerCase().replace(/[^a-z0-9]/g, "") || "jpg";
  const path = `${profile.organization_id}/${branchId}/${noteId}/pagina-${String(pageNumber).padStart(2, "0")}.${extension}`;

  if (createdNote) {
    const { error: insertError } = await admin.from("delivery_notes").insert({
      id: noteId,
      organization_id: profile.organization_id,
      branch_id: branchId,
      uploaded_by: userId,
      photo_path: path,
      status: "processing",
    });
    if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  const bytes = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage.from("delivery-notes").upload(path, bytes, { contentType: mimeType, upsert: false });
  if (uploadError) {
    if (createdNote) await admin.from("delivery_notes").delete().eq("id", noteId);
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  const { error: pageError } = await admin.from("delivery_note_pages").insert({
    delivery_note_id: noteId,
    page_number: pageNumber,
    storage_path: path,
    mime_type: mimeType,
    size_bytes: file.size,
  });
  if (pageError) {
    await admin.storage.from("delivery-notes").remove([path]);
    if (createdNote) await admin.from("delivery_notes").delete().eq("id", noteId);
    return NextResponse.json({ error: pageError.message }, { status: 500 });
  }

  if (createdNote) {
    await admin.from("audit_logs").insert({
      organization_id: profile.organization_id,
      actor_id: userId,
      action: "delivery_note.uploaded",
      entity_type: "delivery_note",
      entity_id: noteId,
      after_data: { branch_id: branchId, photo_path: path, page_count: pageCount },
    });
  }

  if (pageNumber === pageCount) return queueDeliveryNote(noteId, userId);
  return NextResponse.json({ id: noteId, page_number: pageNumber, queued: false }, { status: 201 });
}
