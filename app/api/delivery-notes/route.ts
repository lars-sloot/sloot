import { NextResponse } from "next/server";
import { send } from "@vercel/queue";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

const bucket = "delivery-notes";
const allowedTypes = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);
const maxFileBytes = 15 * 1024 * 1024;
const maxTotalBytes = 50 * 1024 * 1024;
const maxPages = 10;

type UploadRequest = {
  action?: "prepare" | "complete";
  branch_id?: string;
  note_id?: string;
  page_number?: number;
  page_count?: number;
  file_name?: string;
  mime_type?: string;
  size_bytes?: number;
  storage_path?: string;
};

function normalizedMimeType(mimeType = "", fileName = "") {
  const normalized = mimeType.toLowerCase() === "image/jpg" ? "image/jpeg" : mimeType.toLowerCase();
  if (allowedTypes.has(normalized)) return normalized;
  const extension = fileName.split(".").pop()?.toLowerCase();
  return ({ jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", pdf: "application/pdf" } as Record<string, string>)[extension || ""] || "";
}

function extensionFor(mimeType: string) {
  return ({ "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "application/pdf": "pdf" } as Record<string, string>)[mimeType];
}

function validPageNumbers(pageNumber: number, pageCount: number) {
  return Number.isInteger(pageNumber) && Number.isInteger(pageCount) && pageNumber >= 1 && pageCount >= 1 && pageNumber <= pageCount && pageCount <= maxPages;
}

function uploadPageCount(aiResult: unknown) {
  if (!aiResult || typeof aiResult !== "object" || !("upload" in aiResult)) return null;
  const upload = (aiResult as { upload?: unknown }).upload;
  if (!upload || typeof upload !== "object" || !("page_count" in upload)) return null;
  const value = Number((upload as { page_count?: unknown }).page_count);
  return Number.isInteger(value) ? value : null;
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
    console.error("Delivery note queue failed", { noteId, message });
    return NextResponse.json({ id: noteId, queued: false, error: "De pagina's zijn opgeslagen, maar konden niet in de AI-wachtrij worden geplaatst." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  try {
    const supabase = await createClient();
    const { data: auth } = await supabase.auth.getClaims();
    const userId = auth?.claims?.sub;
    if (!userId) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

    let body: UploadRequest;
    try {
      body = await request.json() as UploadRequest;
    } catch {
      return NextResponse.json({ error: "Ongeldig uploadverzoek." }, { status: 400 });
    }

    const branchId = String(body.branch_id || "");
    const pageNumber = Number(body.page_number || 0);
    const pageCount = Number(body.page_count || 0);
    const sizeBytes = Number(body.size_bytes || 0);
    const mimeType = normalizedMimeType(body.mime_type, body.file_name);

    if (!branchId || !validPageNumbers(pageNumber, pageCount)) {
      return NextResponse.json({ error: `Een pakbon mag maximaal ${maxPages} pagina's bevatten.` }, { status: 400 });
    }
    if (!mimeType || !Number.isInteger(sizeBytes) || sizeBytes < 1 || sizeBytes > maxFileBytes) {
      return NextResponse.json({ error: "Gebruik JPG, PNG, WEBP of PDF tot 15 MB per pagina. HEIC wordt niet ondersteund." }, { status: 400 });
    }

    const { data: profile } = await supabase.from("profiles").select("organization_id,role,active").eq("id", userId).single();
    if (!profile?.active) return NextResponse.json({ error: "Account is niet actief." }, { status: 403 });
    if (profile.role !== "admin") {
      const { data: assignment } = await supabase.from("user_branches").select("branch_id").eq("user_id", userId).eq("branch_id", branchId).maybeSingle();
      if (!assignment) return NextResponse.json({ error: "Geen toegang tot dit filiaal." }, { status: 403 });
    }

    const admin = createAdminClient();
    let noteId = String(body.note_id || "");
    let createdNote = false;
    const extension = extensionFor(mimeType);

    if (!noteId) {
      if (body.action !== "prepare" || pageNumber !== 1) return NextResponse.json({ error: "De eerste pagina ontbreekt." }, { status: 400 });
      noteId = crypto.randomUUID();
      createdNote = true;
    }

    const path = `${profile.organization_id}/${branchId}/${noteId}/pagina-${String(pageNumber).padStart(2, "0")}.${extension}`;
    if (body.storage_path && body.storage_path !== path) return NextResponse.json({ error: "Het opslagpad van deze pagina klopt niet." }, { status: 400 });

    if (createdNote) {
      const { error: insertError } = await admin.from("delivery_notes").insert({
        id: noteId,
        organization_id: profile.organization_id,
        branch_id: branchId,
        uploaded_by: userId,
        photo_path: path,
        status: "processing",
        ai_result: { upload: { page_count: pageCount } },
      });
      if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });
    }

    const { data: note } = await admin.from("delivery_notes").select("id,organization_id,branch_id,uploaded_by,status,photo_path,ai_result").eq("id", noteId).single();
    if (!note || note.organization_id !== profile.organization_id || note.branch_id !== branchId || note.uploaded_by !== userId || note.status !== "processing") {
      if (createdNote) await admin.from("delivery_notes").delete().eq("id", noteId);
      return NextResponse.json({ error: "Deze upload kan niet worden hervat." }, { status: 403 });
    }
    const expectedPageCount = uploadPageCount(note.ai_result);
    if (expectedPageCount !== null && expectedPageCount !== pageCount) {
      return NextResponse.json({ error: "Het aantal pagina's van deze upload is gewijzigd. Begin de upload opnieuw." }, { status: 409 });
    }
    if (expectedPageCount === null) {
      await admin.from("delivery_notes").update({ ai_result: { upload: { page_count: pageCount } } }).eq("id", noteId);
    }

    if (body.action === "prepare") {
      const { data: existingPage } = await admin.from("delivery_note_pages").select("id,storage_path").eq("delivery_note_id", noteId).eq("page_number", pageNumber).maybeSingle();
      if (existingPage) {
        return NextResponse.json({ id: noteId, page_number: pageNumber, storage_path: existingPage.storage_path, already_uploaded: true });
      }

      const { data: existingPages = [] } = await admin.from("delivery_note_pages").select("size_bytes").eq("delivery_note_id", noteId);
      const totalBytes = (existingPages ?? []).reduce((total, page) => total + Number(page.size_bytes), 0) + sizeBytes;
      if (totalBytes > maxTotalBytes) return NextResponse.json({ error: "Alle pagina's samen mogen maximaal 50 MB zijn." }, { status: 400 });

      const { data: signedUpload, error: signedUploadError } = await admin.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
      if (signedUploadError || !signedUpload?.token) {
        if (createdNote) await admin.from("delivery_notes").delete().eq("id", noteId);
        console.error("Signed delivery note upload URL failed", { noteId, pageNumber, error: signedUploadError?.message });
        return NextResponse.json({ error: "De beveiligde upload kon niet worden voorbereid." }, { status: 500 });
      }
      return NextResponse.json({ id: noteId, page_number: pageNumber, storage_path: path, token: signedUpload.token, mime_type: mimeType });
    }

    if (body.action !== "complete") return NextResponse.json({ error: "Onbekende uploadactie." }, { status: 400 });

    const { data: objectInfo, error: objectError } = await admin.storage.from(bucket).info(path);
    if (objectError || !objectInfo) {
      return NextResponse.json({ error: "Het geüploade bestand is niet in de opslag gevonden." }, { status: 409 });
    }
    const storedSize = Number(objectInfo.size || 0);
    if (storedSize < 1 || storedSize > maxFileBytes || storedSize !== sizeBytes) {
      return NextResponse.json({ error: "De bestandsgrootte in de opslag komt niet overeen met de upload." }, { status: 409 });
    }

    const { data: existingPage } = await admin.from("delivery_note_pages").select("id").eq("delivery_note_id", noteId).eq("page_number", pageNumber).maybeSingle();
    if (!existingPage) {
      const { error: pageError } = await admin.from("delivery_note_pages").insert({
        delivery_note_id: noteId,
        page_number: pageNumber,
        storage_path: path,
        mime_type: mimeType,
        size_bytes: sizeBytes,
      });
      if (pageError) return NextResponse.json({ error: pageError.message }, { status: 500 });
    }

    if (pageNumber !== pageCount) return NextResponse.json({ id: noteId, page_number: pageNumber, queued: false }, { status: 201 });

    const { data: completedPages = [] } = await admin.from("delivery_note_pages").select("page_number").eq("delivery_note_id", noteId).order("page_number");
    const allPagesComplete = completedPages?.length === pageCount && completedPages.every((page, index) => page.page_number === index + 1);
    if (!allPagesComplete) return NextResponse.json({ error: "Nog niet alle pagina's zijn volledig geüpload." }, { status: 409 });

    const { data: existingAudit } = await admin.from("audit_logs").select("id").eq("action", "delivery_note.uploaded").eq("entity_type", "delivery_note").eq("entity_id", noteId).maybeSingle();
    if (!existingAudit) {
      await admin.from("audit_logs").insert({
        organization_id: profile.organization_id,
        actor_id: userId,
        action: "delivery_note.uploaded",
        entity_type: "delivery_note",
        entity_id: noteId,
        after_data: { branch_id: branchId, photo_path: note.photo_path, page_count: pageCount },
      });
    }
    return queueDeliveryNote(noteId, userId);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error("Delivery note upload failed", { message });
    return NextResponse.json({ error: "De upload is onverwacht mislukt. Probeer het opnieuw." }, { status: 500 });
  }
}
