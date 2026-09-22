"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Check, PackageSearch, Save, Trash2, X } from "lucide-react";
import { approveNote, deleteNote, deleteNotePhoto, rejectNote, updateNoteData, type DeleteNoteState, type UpdateNoteState } from "@/app/actions/notes";
import { NotePhoto } from "@/components/sloot/note-photo";

type Branch = { id: string; name: string };
type NoteItem = { id: string; line_number: number; article_code: string | null; ean: string | null; description: string | null; quantity: number | null; unit: string | null };
type Note = { id: string; branch_id: string; supplier: string | null; delivery_number: string | null; delivery_date: string | null; status: string; article_summary: string | null; rejection_reason: string | null; photo_path: string; deleted_at: string | null; ai_confidence: number | null; delivery_note_items: NoteItem[] };

const initialState: UpdateNoteState = { status: "idle", message: "" };
const initialDeleteState: DeleteNoteState = { status: "idle", message: "" };

export function NoteDetailPanel({ note, branches, photoUrl, closeHref, isAdmin }: { note: Note; branches: Branch[]; photoUrl: string | null; closeHref: string; isAdmin: boolean }) {
  const [state, formAction, pending] = useActionState(updateNoteData, initialState);
  const [deleteState, deleteAction, deleting] = useActionState(deleteNote, initialDeleteState);
  const items = [...(note.delivery_note_items || [])].sort((a, b) => a.line_number - b.line_number);

  return <>
    <Link href={closeHref} aria-label="Detail sluiten" className="fixed inset-0 z-40 bg-[#102a20]/25 backdrop-blur-[1px]" />
    <aside className="fixed inset-y-0 right-0 z-50 flex w-full max-w-[620px] flex-col overflow-hidden border-l border-[#dce4dd] bg-[#f8faf8] shadow-2xl">
      <header className="flex items-start justify-between gap-4 border-b border-[#dce4dd] bg-white px-5 py-5 sm:px-7">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#819087]">Pakbon bekijken</p><h2 className="mt-1 text-2xl font-semibold text-[#17231d]">{note.delivery_number || "Nieuwe pakbon"}</h2><p className="mt-1 text-sm text-[#718078]">{note.supplier || "Leverancier wordt herkend"}</p></div>
        <Link href={closeHref} aria-label="Detail sluiten" className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-[#dce4dd] bg-white text-[#526057] hover:bg-[#f2f5f2]"><X size={19}/></Link>
      </header>

      <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">
        {note.ai_confidence !== null && <div className="mb-5 flex items-center justify-between rounded-xl bg-[#edf5ef] px-4 py-3 text-sm text-[#285b43]"><span className="flex items-center gap-2 font-medium"><Check size={17}/>AI-herkenning voltooid</span><span>{Math.round(Number(note.ai_confidence) * 100)}%</span></div>}
        <div className="mb-6"><p className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[#718078]">Originele foto</p><NotePhoto url={photoUrl} photoPath={note.photo_path} alt={`Pakbon ${note.delivery_number || note.id} van ${note.supplier || "onbekende leverancier"}`} deleted={Boolean(note.deleted_at)}/></div>

        <form action={formAction} className="grid gap-4 rounded-2xl border border-[#dce4dd] bg-white p-5 sm:grid-cols-2">
          <input type="hidden" name="id" value={note.id}/>
          <label className="grid gap-1.5 text-sm text-[#526057]"><span>Leverancier</span><input name="supplier" defaultValue={note.supplier || ""} placeholder="Leverancier" className="rounded-xl border border-[#d6ddd7] px-3.5 py-2.5 text-[#17231d] outline-none focus:border-[#173b2b]"/></label>
          <label className="grid gap-1.5 text-sm text-[#526057]"><span>Pakbonnummer</span><input name="delivery_number" defaultValue={note.delivery_number || ""} placeholder="Pakbonnummer" className="rounded-xl border border-[#d6ddd7] px-3.5 py-2.5 text-[#17231d] outline-none focus:border-[#173b2b]"/></label>
          <label className="grid gap-1.5 text-sm text-[#526057]"><span>Datum pakbon</span><input name="delivery_date" type="date" defaultValue={note.delivery_date || ""} className="rounded-xl border border-[#d6ddd7] px-3.5 py-2.5 text-[#17231d] outline-none focus:border-[#173b2b]"/></label>
          <label className="grid gap-1.5 text-sm text-[#526057]"><span>Filiaal</span><select name="branch_id" defaultValue={note.branch_id} className="rounded-xl border border-[#d6ddd7] bg-white px-3.5 py-2.5 text-[#17231d] outline-none focus:border-[#173b2b]">{branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm text-[#526057] sm:col-span-2"><span>Omschrijving</span><textarea name="article_summary" defaultValue={note.article_summary || ""} rows={3} placeholder="Samenvatting artikelen" className="resize-y rounded-xl border border-[#d6ddd7] px-3.5 py-2.5 text-[#17231d] outline-none focus:border-[#173b2b]"/></label>
          <div className="flex flex-wrap items-center gap-3 sm:col-span-2"><button disabled={pending} className="inline-flex items-center gap-2 rounded-xl bg-[#173b2b] px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"><Save size={16}/>{pending ? "Opslaan…" : "Wijzigingen opslaan"}</button>{state.message && <p role="status" className={`text-sm ${state.status === "error" ? "text-red-700" : "text-[#28704c]"}`}>{state.message}</p>}</div>
        </form>

        <section className="mt-6 overflow-hidden rounded-2xl border border-[#dce4dd] bg-white">
          <div className="flex items-center justify-between gap-3 border-b bg-[#f7f8f6] px-5 py-4"><h3 className="flex items-center gap-2 font-semibold"><PackageSearch size={18}/>Artikelen</h3><span className="text-xs text-[#718078]">{items.length} {items.length === 1 ? "regel" : "regels"}</span></div>
          {items.length ? <div className="divide-y divide-[#edf0ed]">{items.map((item) => <div key={item.id} className="grid gap-1 px-5 py-4 text-sm sm:grid-cols-[1fr_auto]"><div><p className="font-medium">{item.description || item.article_code || "Onbekend artikel"}</p><p className="mt-1 text-xs text-[#718078]">{[item.article_code, item.ean].filter(Boolean).join(" · ") || `Regel ${item.line_number}`}</p></div><p className="text-[#526057] sm:text-right">{item.quantity ?? "—"}{item.unit ? ` ${item.unit}` : ""}</p></div>)}</div> : <p className="p-5 text-sm text-[#718078]">Er zijn nog geen artikelregels herkend.</p>}
        </section>

        {note.rejection_reason && <p className="mt-5 rounded-xl bg-red-50 p-4 text-sm text-red-800"><strong>Reden afwijzing:</strong> {note.rejection_reason}</p>}
        {note.status === "pending" && <div className="mt-6 grid gap-3 border-t border-[#dce4dd] pt-6 sm:grid-cols-[auto_1fr]"><form action={approveNote}><input type="hidden" name="id" value={note.id}/><button className="w-full rounded-xl bg-[#173b2b] px-5 py-3 text-sm font-medium text-white">Pakbon accorderen</button></form><form action={rejectNote} className="flex min-w-0 gap-2"><input type="hidden" name="id" value={note.id}/><input name="reason" required placeholder="Reden van afwijzing" className="min-w-0 flex-1 rounded-xl border border-[#e8caca] px-3 py-2.5 text-sm"/><button className="rounded-xl border border-red-200 px-4 py-2.5 text-sm font-medium text-red-700">Afwijzen</button></form></div>}
        {isAdmin && <div className="mt-6 rounded-2xl border border-red-100 bg-red-50/60 p-4">
          <p className="text-sm font-semibold text-red-900">Beheerderacties</p>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            <form action={deleteNotePhoto}><input type="hidden" name="id" value={note.id}/><button className="text-sm text-red-700 underline underline-offset-4">Alleen foto verwijderen</button></form>
            <form action={deleteAction} onSubmit={(event) => { if (!window.confirm("Weet je zeker dat je deze pakbon inclusief foto en artikelregels permanent wilt verwijderen?")) event.preventDefault(); }}>
              <input type="hidden" name="id" value={note.id}/>
              <button disabled={deleting} className="inline-flex items-center gap-2 rounded-xl bg-red-700 px-4 py-2.5 text-sm font-medium text-white disabled:opacity-60"><Trash2 size={15}/>{deleting ? "Verwijderen…" : "Pakbon verwijderen"}</button>
            </form>
          </div>
          {deleteState.message && <p role="status" className="mt-3 text-sm text-red-700">{deleteState.message}</p>}
        </div>}
      </div>
    </aside>
  </>;
}
