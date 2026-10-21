import type { SupabaseClient } from "@supabase/supabase-js";

async function getSearchItems(supabase: SupabaseClient) {
  const rows: Array<{ delivery_note_id: string; article_code: string | null; ean: string | null; description: string | null }> = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await supabase.from("delivery_note_items")
      .select("delivery_note_id,article_code,ean,description")
      .order("id").range(offset, offset + 999);
    if (error) throw new Error("De artikelgegevens konden niet worden doorzocht. Probeer het opnieuw.");
    rows.push(...(data ?? []));
    if (!data || data.length < 1000) return { data: rows, error: null };
  }
}

export async function getNotesPageData(supabase: SupabaseClient, noteId: string, search: string) {
  const validNoteId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(noteId);
  const [list, detail, items] = await Promise.all([
    supabase.from("delivery_notes")
      .select("id,branch_id,uploaded_by,supplier,delivery_number,delivery_date,status,article_summary,created_at,branches(name),delivery_note_items(count)")
      .order("created_at", { ascending: false }),
    validNoteId
      ? supabase.from("delivery_notes")
        .select("id,branch_id,uploaded_by,supplier,delivery_number,delivery_date,status,article_summary,rejection_reason,photo_path,deleted_at,ai_confidence,approved_by,approved_at,created_at,delivery_note_items(id,line_number,article_code,ean,description,quantity,unit),delivery_note_pages(id,page_number,storage_path,mime_type)")
        .eq("id", noteId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    search
      ? getSearchItems(supabase)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (list.error) throw new Error("De pakbonnen konden niet worden geladen. Probeer het opnieuw.");
  if (detail.error) throw new Error("Deze pakbon kon niet worden geladen. Probeer het opnieuw.");
  if (items.error) throw new Error("De artikelgegevens konden niet worden doorzocht. Probeer het opnieuw.");
  return { notes: list.data ?? [], selectedNote: detail.data, searchItems: items.data ?? [] };
}
