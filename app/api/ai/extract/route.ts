import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

type OutputPart = { type?: string; text?: string };
type OutputItem = { content?: OutputPart[] };

export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub;
  if (!userId) return NextResponse.json({ error: "Niet ingelogd." }, { status: 401 });
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_VISION_MODEL) {
    return NextResponse.json({ error: "AI-configuratie ontbreekt." }, { status: 503 });
  }

  const { delivery_note_id: noteId } = await request.json();
  const { data: note } = await supabase.from("delivery_notes").select("id,organization_id,photo_path").eq("id", noteId).single();
  if (!note) return NextResponse.json({ error: "Pakbon niet gevonden." }, { status: 404 });

  const admin = createAdminClient();
  const { data: signed, error: signError } = await admin.storage.from("delivery-notes").createSignedUrl(note.photo_path, 300);
  if (signError || !signed?.signedUrl) return NextResponse.json({ error: "Foto kon niet worden geopend." }, { status: 500 });

  const schema = {
    type: "object",
    additionalProperties: false,
    properties: {
      supplier: { type: ["string", "null"] },
      delivery_number: { type: ["string", "null"] },
      delivery_date: { type: ["string", "null"], description: "YYYY-MM-DD" },
      article_summary: { type: ["string", "null"] },
      confidence: { type: "number", minimum: 0, maximum: 1 },
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          properties: {
            article_code: { type: ["string", "null"] },
            ean: { type: ["string", "null"] },
            description: { type: ["string", "null"] },
            quantity: { type: ["number", "null"] },
            unit: { type: ["string", "null"] },
          },
          required: ["article_code", "ean", "description", "quantity", "unit"],
        },
      },
    },
    required: ["supplier", "delivery_number", "delivery_date", "article_summary", "confidence", "items"],
  };

  const aiResponse = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: process.env.OPENAI_VISION_MODEL,
      store: false,
      instructions: "Lees deze Nederlandse pakbon nauwkeurig. Gebruik alleen zichtbare gegevens. Geef null bij twijfel. Negeer handgeschreven notities behalve wanneer die een ontvangstdatum tonen.",
      input: [{ role: "user", content: [{ type: "input_text", text: "Extraheer de pakbongegevens en artikelregels." }, { type: "input_image", image_url: signed.signedUrl, detail: "high" }] }],
      text: { format: { type: "json_schema", name: "delivery_note", strict: true, schema } },
    }),
  });

  if (!aiResponse.ok) {
    const errorText = await aiResponse.text();
    await admin.from("delivery_notes").update({ status: "error", ai_result: { error: errorText.slice(0, 1000) } }).eq("id", note.id);
    return NextResponse.json({ error: "AI-verwerking is mislukt." }, { status: 502 });
  }

  const response = await aiResponse.json() as { output?: OutputItem[]; usage?: unknown };
  const text = response.output?.flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text;
  if (!text) return NextResponse.json({ error: "Geen AI-resultaat ontvangen." }, { status: 502 });
  const parsed = JSON.parse(text) as { supplier: string | null; delivery_number: string | null; delivery_date: string | null; article_summary: string | null; confidence: number; items: Array<{ article_code: string | null; ean: string | null; description: string | null; quantity: number | null; unit: string | null }> };

  await admin.from("delivery_notes").update({
    supplier: parsed.supplier,
    delivery_number: parsed.delivery_number,
    delivery_date: parsed.delivery_date,
    article_summary: parsed.article_summary,
    ai_confidence: parsed.confidence,
    ai_result: { extracted: parsed, usage: response.usage },
    status: "pending",
    updated_at: new Date().toISOString(),
  }).eq("id", note.id);

  if (parsed.items.length) {
    await admin.from("delivery_note_items").insert(parsed.items.map((item, index) => ({ delivery_note_id: note.id, line_number: index + 1, ...item })));
  }
  await admin.from("audit_logs").insert({ organization_id: note.organization_id, actor_id: userId, action: "delivery_note.ai_extracted", entity_type: "delivery_note", entity_id: note.id, after_data: { confidence: parsed.confidence, item_count: parsed.items.length } });

  return NextResponse.json({ ok: true, result: parsed });
}

