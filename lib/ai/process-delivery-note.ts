import { createAdminClient } from "@/lib/supabase/admin";

type OutputPart = { type?: string; text?: string };
type OutputItem = { content?: OutputPart[] };
type ExtractedItem = { article_code: string | null; ean: string | null; description: string | null; quantity: number | null; unit: string | null };
type ExtractedNote = { supplier: string | null; delivery_number: string | null; delivery_date: string | null; article_summary: string | null; confidence: number; items: ExtractedItem[] };

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

export async function processDeliveryNote(noteId: string, actorId: string) {
  if (!process.env.OPENAI_API_KEY || !process.env.OPENAI_VISION_MODEL) throw new Error("AI-configuratie ontbreekt.");

  const admin = createAdminClient();
  const { data: note, error: noteError } = await admin.from("delivery_notes").select("id,organization_id,photo_path,status").eq("id", noteId).single();
  if (noteError || !note) throw new Error("Pakbon niet gevonden.");

  // Queue delivery is at-least-once. A completed note must not be processed twice.
  if (note.status !== "processing" && note.status !== "error") return null;
  await admin.from("delivery_notes").update({ status: "processing", updated_at: new Date().toISOString() }).eq("id", note.id);

  try {
    const { data: signed, error: signError } = await admin.storage.from("delivery-notes").createSignedUrl(note.photo_path, 300);
    if (signError || !signed?.signedUrl) throw new Error("Foto kon niet worden geopend.");

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
    if (!aiResponse.ok) throw new Error((await aiResponse.text()).slice(0, 1000));

    const response = await aiResponse.json() as { output?: OutputItem[]; usage?: unknown };
    const text = response.output?.flatMap((item) => item.content || []).find((part) => part.type === "output_text")?.text;
    if (!text) throw new Error("Geen AI-resultaat ontvangen.");
    const parsed = JSON.parse(text) as ExtractedNote;

    const { error: deleteError } = await admin.from("delivery_note_items").delete().eq("delivery_note_id", note.id);
    if (deleteError) throw deleteError;
    if (parsed.items.length) {
      const { error: itemsError } = await admin.from("delivery_note_items").insert(parsed.items.map((item, index) => ({ delivery_note_id: note.id, line_number: index + 1, ...item })));
      if (itemsError) throw itemsError;
    }

    const { error: updateError } = await admin.from("delivery_notes").update({
      supplier: parsed.supplier,
      delivery_number: parsed.delivery_number,
      delivery_date: parsed.delivery_date,
      article_summary: parsed.article_summary,
      ai_confidence: parsed.confidence,
      ai_result: { extracted: parsed, usage: response.usage },
      status: "pending",
      updated_at: new Date().toISOString(),
    }).eq("id", note.id);
    if (updateError) throw updateError;

    await admin.from("audit_logs").insert({ organization_id: note.organization_id, actor_id: actorId, action: "delivery_note.ai_extracted", entity_type: "delivery_note", entity_id: note.id, after_data: { confidence: parsed.confidence, item_count: parsed.items.length } });
    return parsed;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await admin.from("delivery_notes").update({ status: "error", ai_result: { error: message.slice(0, 1000) }, updated_at: new Date().toISOString() }).eq("id", note.id);
    throw error;
  }
}
