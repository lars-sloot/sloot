import { createClient } from "@/lib/supabase/server";
import { undoAudit } from "@/app/actions/audit";
import { redirect } from "next/navigation";

const actionLabels: Record<string,string> = {
  "delivery_note.uploaded": "Pakbon geüpload",
  "delivery_note.ai_extracted": "Pakbon door AI uitgelezen",
  "delivery_note.approved": "Pakbon geaccordeerd",
  "delivery_note.rejected": "Pakbon afgewezen",
  "delivery_note.updated": "Pakbongegevens aangepast",
  "delivery_note.item_created": "Artikelregel toegevoegd",
  "delivery_note.item_updated": "Artikelregel aangepast",
  "delivery_note.item_deleted": "Artikelregel verwijderd",
  "delivery_note.photo_deleted": "Foto handmatig verwijderd",
  "delivery_note.deleted": "Pakbon verwijderd",
  "delivery_note.photo_retention_deleted": "Foto na bewaartermijn verwijderd",
  "user.created": "Gebruiker aangemaakt",
  "user.updated": "Gebruiker aangepast",
  "audit.undo": "Handeling teruggedraaid",
};

export default async function ActivityPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", auth?.claims?.sub || "").single();
  if (profile?.role !== "admin") redirect("/protected");
  const { data: logs = [] } = await supabase.from("audit_logs").select("id,action,entity_type,entity_id,created_at,undone_at,actor:profiles!audit_logs_actor_id_fkey(full_name)").order("created_at", { ascending: false }).limit(100);
  return <div><p className="text-sm text-[#718078]">Beheer</p><h1 className="mt-1 text-3xl font-semibold">Activiteiten</h1><p className="mt-2 text-[#667168]">Alle belangrijke handelingen worden vastgelegd. Alleen veilige wijzigingen zijn terug te draaien.</p>
    <div className="mt-8 divide-y rounded-2xl border border-[#dce4dd] bg-white">{logs?.map((log) => {
      const canUndo = !log.undone_at && ["delivery_note.approved","delivery_note.rejected","delivery_note.updated","delivery_note.item_created","delivery_note.item_updated","delivery_note.item_deleted","user.created","user.updated"].includes(log.action);
      const actor = Array.isArray(log.actor) ? log.actor[0] : log.actor;
      return <div key={log.id} className="grid gap-3 p-5 md:grid-cols-[1fr_auto]"><div><p className="font-medium">{actionLabels[log.action] || log.action}</p><p className="mt-1 text-sm text-[#718078]">{actor?.full_name || "Systeem"} · {new Intl.DateTimeFormat("nl-NL", { dateStyle: "medium", timeStyle: "short" }).format(new Date(log.created_at))}</p></div>{canUndo ? <form action={undoAudit}><input type="hidden" name="log_id" value={log.id}/><button className="rounded-xl border px-4 py-2 text-sm">Terugdraaien</button></form> : log.undone_at ? <span className="text-sm text-[#718078]">Teruggedraaid</span> : null}</div>;
    })}</div>
  </div>;
}
