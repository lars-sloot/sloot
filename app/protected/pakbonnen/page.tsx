import { createClient } from "@/lib/supabase/server";
import { FileText } from "lucide-react";
import { approveNote, deleteNotePhoto, rejectNote, updateNoteData } from "@/app/actions/notes";

const labels: Record<string, string> = {
  processing: "AI verwerkt",
  pending: "Te accorderen",
  approved: "Geaccordeerd",
  rejected: "Afgewezen",
  error: "Fout",
};

export default async function NotesPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const [{ data: notes = [] }, { data: profile }] = await Promise.all([
    supabase.from("delivery_notes").select("id,supplier,delivery_number,delivery_date,status,article_summary,rejection_reason,branches(name),delivery_note_items(id)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("role").eq("id", auth?.claims?.sub || "").single(),
  ]);
  return <div>
    <p className="text-sm text-[#718078]">Overzicht</p><h1 className="mt-1 text-3xl font-semibold">Pakbonnen</h1>
    <div className="mt-8 grid gap-4">{notes?.length ? notes.map((n) => <article key={n.id} className="rounded-2xl border border-[#dce4dd] bg-white p-5">
      <div className="grid gap-4 md:grid-cols-[1.2fr_.8fr_auto]">
        <div><p className="font-semibold">{n.supplier || "Wordt herkend"}</p><p className="mt-1 text-sm text-[#718078]">{n.delivery_number || "Geen nummer"} · {n.delivery_date || "Datum onbekend"}</p></div>
        <div><p className="text-sm text-[#667168]">{n.article_summary || "Artikelen worden herkend"}</p><p className="mt-1 text-xs text-[#8a948d]">{n.delivery_note_items?.length || 0} artikelregels</p></div>
        <span className="h-fit rounded-full bg-[#edf5ef] px-3 py-1 text-xs">{labels[n.status] || n.status}</span>
      </div>
      {n.rejection_reason && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Reden: {n.rejection_reason}</p>}
      <details className="mt-4 border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Gegevens aanpassen</summary><form action={updateNoteData} className="mt-4 grid gap-3 md:grid-cols-2"><input type="hidden" name="id" value={n.id}/><input name="supplier" defaultValue={n.supplier || ""} placeholder="Leverancier" className="rounded-xl border px-4 py-3 text-sm"/><input name="delivery_number" defaultValue={n.delivery_number || ""} placeholder="Pakbonnummer" className="rounded-xl border px-4 py-3 text-sm"/><input name="delivery_date" type="date" defaultValue={n.delivery_date || ""} className="rounded-xl border px-4 py-3 text-sm"/><input name="article_summary" defaultValue={n.article_summary || ""} placeholder="Samenvatting artikelen" className="rounded-xl border px-4 py-3 text-sm"/><button className="w-fit rounded-xl border px-5 py-3 text-sm font-medium">Wijzigingen opslaan</button></form></details>
      {n.status === "pending" && <div className="mt-5 grid gap-3 border-t pt-5 md:grid-cols-[auto_1fr]">
        <form action={approveNote}><input type="hidden" name="id" value={n.id}/><button className="rounded-xl bg-[#173b2b] px-5 py-3 text-sm font-medium text-white">Accorderen</button></form>
        <form action={rejectNote} className="flex gap-2"><input type="hidden" name="id" value={n.id}/><input name="reason" required placeholder="Reden van afwijzing" className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"/><button className="rounded-xl border border-red-200 px-5 py-3 text-sm font-medium text-red-700">Afwijzen</button></form>
      </div>}
      {profile?.role === "admin" && <form action={deleteNotePhoto} className="mt-4 border-t pt-4"><input type="hidden" name="id" value={n.id}/><button className="text-sm text-red-700 underline underline-offset-4">Foto handmatig verwijderen</button></form>}
    </article>) : <div className="grid place-items-center rounded-2xl border border-[#dce4dd] bg-white p-14 text-center text-[#718078]"><FileText/><p className="mt-3">Er zijn nog geen pakbonnen opgeslagen.</p></div>}</div>
  </div>;
}
