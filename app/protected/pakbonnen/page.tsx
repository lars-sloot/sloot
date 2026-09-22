import { createClient } from "@/lib/supabase/server";
import { FileText, MapPin, PackageSearch } from "lucide-react";
import { approveNote, deleteNotePhoto, rejectNote, updateNoteData } from "@/app/actions/notes";
import { NotePhoto } from "@/components/sloot/note-photo";

const labels: Record<string, string> = {
  processing: "AI verwerkt",
  pending: "Te accorderen",
  approved: "Geaccordeerd",
  rejected: "Afgewezen",
  error: "Fout",
};

function branchName(branches: unknown) {
  if (Array.isArray(branches)) return branches[0]?.name || "Onbekend";
  if (branches && typeof branches === "object" && "name" in branches) return String(branches.name);
  return "Onbekend";
}

export default async function NotesPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const [{ data: notes = [] }, { data: profile }] = await Promise.all([
    supabase.from("delivery_notes").select("id,supplier,delivery_number,delivery_date,status,article_summary,rejection_reason,photo_path,deleted_at,ai_confidence,created_at,branches(name),delivery_note_items(id,line_number,article_code,ean,description,quantity,unit)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("role").eq("id", auth?.claims?.sub || "").single(),
  ]);

  const safeNotes = notes ?? [];
  const visiblePhotos = safeNotes.filter((note) => !note.deleted_at).map((note) => note.photo_path);
  const { data: signedPhotos = [] } = visiblePhotos.length
    ? await supabase.storage.from("delivery-notes").createSignedUrls(visiblePhotos, 3600)
    : { data: [] };
  const photoUrls = new Map(signedPhotos?.map((photo) => [photo.path, photo.signedUrl]) || []);

  return <div>
    <p className="text-sm text-[#718078]">Overzicht</p><h1 className="mt-1 text-3xl font-semibold">Pakbonnen</h1><p className="mt-2 text-sm text-[#718078]">Bekijk de originele foto en controleer de herkende specificaties.</p>
    <div className="mt-8 grid gap-4">{safeNotes.length ? safeNotes.map((n) => <article key={n.id} className="rounded-2xl border border-[#dce4dd] bg-white p-5">
      <div className="grid gap-4 md:grid-cols-[1.2fr_.8fr_auto]">
        <div><p className="font-semibold">{n.supplier || "Wordt herkend"}</p><p className="mt-1 text-sm text-[#718078]">{n.delivery_number || "Geen nummer"} · {n.delivery_date || "Datum onbekend"}</p><p className="mt-2 flex items-center gap-1.5 text-xs text-[#8a948d]"><MapPin size={13}/>{branchName(n.branches)}</p></div>
        <div><p className="text-sm text-[#667168]">{n.article_summary || "Artikelen worden herkend"}</p><p className="mt-1 text-xs text-[#8a948d]">{n.delivery_note_items?.length || 0} artikelregels</p></div>
        <span className="h-fit rounded-full bg-[#edf5ef] px-3 py-1 text-xs">{labels[n.status] || n.status}</span>
      </div>
      {n.rejection_reason && <p className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">Reden: {n.rejection_reason}</p>}

      <div className="mt-5 grid gap-6 border-t pt-5 lg:grid-cols-[260px_1fr]">
        <div>
          <p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#718078]">Originele pakbon</p>
          <NotePhoto url={photoUrls.get(n.photo_path) || null} photoPath={n.photo_path} alt={`Pakbon ${n.delivery_number || n.id} van ${n.supplier || "onbekende leverancier"}`} deleted={Boolean(n.deleted_at)}/>
        </div>
        <div className="min-w-0">
          <div className="flex items-center justify-between gap-4"><p className="text-xs font-semibold uppercase tracking-[0.14em] text-[#718078]">Specificaties</p>{n.ai_confidence !== null && <span className="text-xs text-[#718078]">AI-betrouwbaarheid {Math.round(Number(n.ai_confidence) * 100)}%</span>}</div>
          <dl className="mt-3 grid gap-3 rounded-xl bg-[#f7f8f6] p-4 sm:grid-cols-2">
            <div><dt className="text-xs text-[#718078]">Leverancier</dt><dd className="mt-1 text-sm font-medium">{n.supplier || "Onbekend"}</dd></div>
            <div><dt className="text-xs text-[#718078]">Pakbonnummer</dt><dd className="mt-1 text-sm font-medium">{n.delivery_number || "Onbekend"}</dd></div>
            <div><dt className="text-xs text-[#718078]">Datum pakbon</dt><dd className="mt-1 text-sm font-medium">{n.delivery_date || "Onbekend"}</dd></div>
            <div><dt className="text-xs text-[#718078]">Filiaal</dt><dd className="mt-1 text-sm font-medium">{branchName(n.branches)}</dd></div>
          </dl>

          <div className="mt-5 overflow-hidden rounded-xl border border-[#e0e5e1]">
            <div className="flex items-center gap-2 border-b bg-[#f7f8f6] px-4 py-3"><PackageSearch size={17}/><h2 className="text-sm font-semibold">Artikelen</h2></div>
            {n.delivery_note_items?.length ? <div className="overflow-x-auto"><table className="w-full min-w-[680px] text-left text-sm"><thead className="bg-white text-xs text-[#718078]"><tr><th className="px-4 py-3 font-medium">#</th><th className="px-4 py-3 font-medium">Artikelcode</th><th className="px-4 py-3 font-medium">Omschrijving</th><th className="px-4 py-3 font-medium">EAN</th><th className="px-4 py-3 text-right font-medium">Aantal</th></tr></thead><tbody className="divide-y divide-[#edf0ed]">{[...n.delivery_note_items].sort((a,b) => a.line_number - b.line_number).map((item) => <tr key={item.id}><td className="px-4 py-3 text-[#718078]">{item.line_number}</td><td className="px-4 py-3 font-medium">{item.article_code || "—"}</td><td className="px-4 py-3">{item.description || "—"}</td><td className="px-4 py-3 text-[#667168]">{item.ean || "—"}</td><td className="px-4 py-3 text-right">{item.quantity ?? "—"}{item.unit ? ` ${item.unit}` : ""}</td></tr>)}</tbody></table></div> : <p className="p-4 text-sm text-[#718078]">Er zijn nog geen artikelregels herkend.</p>}
          </div>
        </div>
      </div>

      <details className="mt-4 border-t pt-4"><summary className="cursor-pointer text-sm font-medium">Gegevens aanpassen</summary><form action={updateNoteData} className="mt-4 grid gap-3 md:grid-cols-2"><input type="hidden" name="id" value={n.id}/><input name="supplier" defaultValue={n.supplier || ""} placeholder="Leverancier" className="rounded-xl border px-4 py-3 text-sm"/><input name="delivery_number" defaultValue={n.delivery_number || ""} placeholder="Pakbonnummer" className="rounded-xl border px-4 py-3 text-sm"/><input name="delivery_date" type="date" defaultValue={n.delivery_date || ""} className="rounded-xl border px-4 py-3 text-sm"/><input name="article_summary" defaultValue={n.article_summary || ""} placeholder="Samenvatting artikelen" className="rounded-xl border px-4 py-3 text-sm"/><button className="w-fit rounded-xl border px-5 py-3 text-sm font-medium">Wijzigingen opslaan</button></form></details>
      {n.status === "pending" && <div className="mt-5 grid gap-3 border-t pt-5 md:grid-cols-[auto_1fr]">
        <form action={approveNote}><input type="hidden" name="id" value={n.id}/><button className="rounded-xl bg-[#173b2b] px-5 py-3 text-sm font-medium text-white">Accorderen</button></form>
        <form action={rejectNote} className="flex gap-2"><input type="hidden" name="id" value={n.id}/><input name="reason" required placeholder="Reden van afwijzing" className="min-w-0 flex-1 rounded-xl border px-4 py-3 text-sm"/><button className="rounded-xl border border-red-200 px-5 py-3 text-sm font-medium text-red-700">Afwijzen</button></form>
      </div>}
      {profile?.role === "admin" && <form action={deleteNotePhoto} className="mt-4 border-t pt-4"><input type="hidden" name="id" value={n.id}/><button className="text-sm text-red-700 underline underline-offset-4">Foto handmatig verwijderen</button></form>}
    </article>) : <div className="grid place-items-center rounded-2xl border border-[#dce4dd] bg-white p-14 text-center text-[#718078]"><FileText/><p className="mt-3">Er zijn nog geen pakbonnen opgeslagen.</p></div>}</div>
  </div>;
}
