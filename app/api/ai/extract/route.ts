import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { processDeliveryNote } from "@/lib/ai/process-delivery-note";

export const maxDuration = 60;

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });

  const { delivery_note_id: noteId } = await request.json();
  const { data: note } = await supabase.from("delivery_notes").select("id").eq("id", noteId).single();
  if (!note) return NextResponse.json({ error: "Pakbon niet gevonden." }, { status: 404 });

  try {
    const result = await processDeliveryNote(note.id, userId);
    return NextResponse.json({ ok: true, result });
  } catch {
    return NextResponse.json({ error: "AI-verwerking is mislukt." }, { status: 502 });
  }
}
