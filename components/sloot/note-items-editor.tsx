"use client";

import { useActionState } from "react";
import { Plus, Save } from "lucide-react";
import { createNoteItem, updateNoteItem, type NoteItemState } from "@/app/actions/notes";

type NoteItem = { id: string; line_number: number; article_code: string | null; ean: string | null; description: string | null; quantity: number | null; unit: string | null };

const initialState: NoteItemState = { status: "idle", message: "" };

function ItemRow({ noteId, item }: { noteId: string; item: NoteItem }) {
  const [state, action, pending] = useActionState(updateNoteItem, initialState);
  const quantity = Math.max(1, Math.round(Number(item.quantity ?? 1)));
  return <form action={action} className="grid gap-3 px-4 py-4 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-start sm:px-5">
    <input type="hidden" name="note_id" value={noteId}/><input type="hidden" name="item_id" value={item.id}/>
    <label className="grid min-w-0 gap-1.5 text-xs text-[#667168]"><span>Beschrijving</span><input name="description" required maxLength={500} defaultValue={item.description || item.article_code || ""} className="h-11 min-w-0 w-full rounded-xl border border-[#d6ddd7] px-3 text-[#17231d] outline-none focus:border-[#173b2b]"/></label>
    <label className="grid gap-1.5 text-xs text-[#667168]"><span>Aantal</span><div className="flex h-11 items-center gap-2"><input name="quantity" required type="number" min="1" step="1" defaultValue={quantity} className="h-11 min-w-0 w-full rounded-xl border border-[#d6ddd7] px-3 text-[#17231d] outline-none focus:border-[#173b2b]"/><span className="text-xs text-[#718078]">{item.unit || "STK"}</span></div></label>
    <button disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#cdd8d0] px-3 text-sm font-medium text-[#173b2b] disabled:opacity-60 sm:mt-[1.375rem]"><Save size={15}/>{pending ? "Opslaan…" : "Opslaan"}</button>
    <p className="-mt-1 truncate text-[11px] text-[#8a968f] sm:col-span-3">{[item.article_code, item.ean].filter(Boolean).join(" · ") || `Regel ${item.line_number}`}</p>
    {state.message ? <p role="status" className={`text-xs sm:col-span-3 ${state.status === "error" ? "text-red-700" : "text-emerald-700"}`}>{state.message}</p> : null}
  </form>;
}

export function NoteItemsEditor({ noteId, items }: { noteId: string; items: NoteItem[] }) {
  const [state, action, pending] = useActionState(createNoteItem, initialState);
  return <>
    {items.length ? <div className="divide-y divide-[#edf0ed]">{items.map((item) => <ItemRow key={item.id} noteId={noteId} item={item}/>)}</div> : <p className="px-5 py-4 text-sm text-[#718078]">Er zijn nog geen artikelregels. Voeg hieronder de eerste regel toe.</p>}
    <form action={action} className="grid gap-3 border-t border-[#dce4dd] bg-[#f7f9f7] px-4 py-4 sm:grid-cols-[minmax(0,1fr)_7rem_auto] sm:items-end sm:px-5">
      <input type="hidden" name="note_id" value={noteId}/>
      <label className="grid min-w-0 gap-1.5 text-xs text-[#667168]"><span>Nieuwe beschrijving</span><input name="description" required maxLength={500} placeholder="Bijvoorbeeld: Fietsband zwart" className="h-11 min-w-0 w-full rounded-xl border border-[#d6ddd7] bg-white px-3 text-[#17231d] outline-none focus:border-[#173b2b]"/></label>
      <label className="grid gap-1.5 text-xs text-[#667168]"><span>Aantal</span><input name="quantity" required type="number" min="1" step="1" defaultValue="1" className="h-11 min-w-0 w-full rounded-xl border border-[#d6ddd7] bg-white px-3 text-[#17231d] outline-none focus:border-[#173b2b]"/></label>
      <button disabled={pending} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#173b2b] px-3 text-sm font-medium text-white disabled:opacity-60"><Plus size={16}/>{pending ? "Toevoegen…" : "Regel toevoegen"}</button>
      {state.message ? <p role="status" className={`text-xs sm:col-span-3 ${state.status === "error" ? "text-red-700" : "text-emerald-700"}`}>{state.message}</p> : null}
    </form>
  </>;
}
