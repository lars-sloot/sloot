import Link from "next/link";
import { Camera, FileText, MoreHorizontal, Search } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { NoteDetailPanel } from "@/components/sloot/note-detail-panel";
import { ProcessingRefresh } from "@/components/sloot/processing-refresh";

const labels: Record<string, string> = {
  processing: "Wordt verwerkt",
  pending: "Te controleren",
  approved: "Geaccordeerd",
  rejected: "Afgewezen",
  error: "Fout",
};

const statusStyles: Record<string, string> = {
  processing: "bg-blue-50 text-blue-700",
  pending: "bg-amber-50 text-amber-800",
  approved: "bg-emerald-50 text-emerald-700",
  rejected: "bg-red-50 text-red-700",
  error: "bg-red-50 text-red-700",
};

function branchName(branches: unknown) {
  if (Array.isArray(branches)) return branches[0]?.name || "Onbekend";
  if (branches && typeof branches === "object" && "name" in branches) return String(branches.name);
  return "Onbekend";
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] || "" : value || "";
}

function formatDate(date: string | null) {
  if (!date) return "Datum onbekend";
  return new Intl.DateTimeFormat("nl-NL", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`));
}

type NotesPageProps = {
  searchParams: Promise<{ q?: string | string[]; branch?: string | string[]; status?: string | string[]; note?: string | string[] }>;
};

export default async function NotesPage({ searchParams }: NotesPageProps) {
  const params = await searchParams;
  const query = firstParam(params.q).trim();
  const selectedBranch = firstParam(params.branch);
  const selectedStatus = firstParam(params.status);
  const selectedNoteId = firstParam(params.note);
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub || "";

  const [{ data: notes = [] }, { data: profile }, { data: allBranches = [] }, { data: assignments = [] }] = await Promise.all([
    supabase.from("delivery_notes").select("id,branch_id,supplier,delivery_number,delivery_date,status,article_summary,rejection_reason,photo_path,deleted_at,ai_confidence,created_at,branches(name),delivery_note_items(id,line_number,article_code,ean,description,quantity,unit)").order("created_at", { ascending: false }),
    supabase.from("profiles").select("role").eq("id", userId).single(),
    supabase.from("branches").select("id,name").eq("active", true).order("name"),
    supabase.from("user_branches").select("branch_id").eq("user_id", userId),
  ]);

  const safeNotes = notes ?? [];
  const assignmentIds = new Set((assignments ?? []).map((assignment) => assignment.branch_id));
  const editableBranches = profile?.role === "admin" ? (allBranches ?? []) : (allBranches ?? []).filter((branch) => assignmentIds.has(branch.id));
  const normalizedQuery = query.toLocaleLowerCase("nl");
  const filteredNotes = safeNotes.filter((note) => {
    if (selectedBranch && note.branch_id !== selectedBranch) return false;
    if (selectedStatus && note.status !== selectedStatus) return false;
    if (!normalizedQuery) return true;
    const searchable = [note.supplier, note.delivery_number, branchName(note.branches), note.article_summary, ...note.delivery_note_items.flatMap((item) => [item.article_code, item.ean, item.description])].filter(Boolean).join(" ").toLocaleLowerCase("nl");
    return searchable.includes(normalizedQuery);
  });
  const selectedNote = safeNotes.find((note) => note.id === selectedNoteId) || null;
  const filterParams = new URLSearchParams();
  if (query) filterParams.set("q", query);
  if (selectedBranch) filterParams.set("branch", selectedBranch);
  if (selectedStatus) filterParams.set("status", selectedStatus);
  const closeHref = `/protected/pakbonnen${filterParams.size ? `?${filterParams}` : ""}`;
  let photoUrl: string | null = null;
  if (selectedNote && !selectedNote.deleted_at) {
    const { data } = await supabase.storage.from("delivery-notes").createSignedUrl(selectedNote.photo_path, 3600);
    photoUrl = data?.signedUrl || null;
  }

  function hrefWith(changes: Record<string, string | null>) {
    const next = new URLSearchParams(filterParams);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    return `/protected/pakbonnen${next.size ? `?${next}` : ""}`;
  }

  const statusFilters = [["", "Alle"], ["pending", "Te controleren"], ["approved", "Geaccordeerd"], ["rejected", "Afgewezen"]];

  return <div>
    <ProcessingRefresh active={safeNotes.some((note) => note.status === "processing")}/>
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#819087]">Pakbonnen</p><h1 className="mt-1 text-3xl font-semibold text-[#17231d]">Alle pakbonnen</h1></div>
      <Link href="/protected#nieuwe-pakbon" className="inline-flex items-center gap-2 rounded-xl bg-[#173b2b] px-5 py-3 text-sm font-semibold text-white shadow-sm"><Camera size={17}/>Nieuwe pakbon</Link>
    </div>

    <div className="mt-7 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <form method="get" className="flex min-w-0 flex-1 flex-col gap-3 sm:flex-row">
        <label className="relative min-w-0 flex-1 lg:max-w-md"><span className="sr-only">Zoeken</span><Search className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#718078]" size={18}/><input name="q" defaultValue={query} placeholder="Zoek leverancier, nummer, filiaal of artikel" className="w-full rounded-xl border border-[#d6ddd7] bg-white py-3 pl-10 pr-4 text-sm outline-none focus:border-[#173b2b]"/></label>
        <label><span className="sr-only">Filiaal</span><select name="branch" defaultValue={selectedBranch} className="w-full rounded-xl border border-[#d6ddd7] bg-white px-4 py-3 text-sm outline-none focus:border-[#173b2b]"><option value="">Alle filialen</option>{editableBranches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}</select></label>
        {selectedStatus && <input type="hidden" name="status" value={selectedStatus}/>}<button className="rounded-xl border border-[#d6ddd7] bg-white px-5 py-3 text-sm font-medium text-[#33443a] hover:bg-[#f4f6f4]">Zoeken</button>
      </form>
      <nav aria-label="Filter op status" className="flex flex-wrap gap-2">{statusFilters.map(([value, text]) => <Link key={value || "all"} href={hrefWith({ status: value || null, note: null })} className={`rounded-full border px-4 py-2 text-sm font-medium ${selectedStatus === value ? "border-[#173b2b] bg-[#173b2b] text-white" : "border-[#d6ddd7] bg-white text-[#667168] hover:bg-[#f4f6f4]"}`}>{text}</Link>)}</nav>
    </div>

    <p className="mt-4 text-sm text-[#718078]">{filteredNotes.length} {filteredNotes.length === 1 ? "pakbon" : "pakbonnen"} gevonden</p>
    <div className="mt-4 overflow-hidden rounded-2xl border border-[#dce4dd] bg-white shadow-[0_1px_2px_rgba(16,42,32,0.03)]">
      {filteredNotes.length ? <div className="overflow-x-auto"><table className="w-full min-w-[760px] text-left text-sm">
        <thead className="border-b border-[#dce4dd] bg-[#f7f8f7] text-[11px] uppercase tracking-[0.08em] text-[#718078]"><tr><th className="px-5 py-4 font-semibold">Pakbon</th><th className="px-5 py-4 font-semibold">Leverancier</th><th className="px-5 py-4 font-semibold">Filiaal</th><th className="px-5 py-4 font-semibold">Datum</th><th className="px-5 py-4 font-semibold">Artikelen</th><th className="px-5 py-4 font-semibold">Status</th><th className="w-16 px-5 py-4"><span className="sr-only">Openen</span></th></tr></thead>
        <tbody className="divide-y divide-[#e8ece8]">{filteredNotes.map((note) => {
          const rowHref = hrefWith({ note: note.id });
          return <tr key={note.id} className="group hover:bg-[#fafcfa]">
            <td className="px-5 py-4"><Link href={rowHref} className="block font-semibold text-[#17231d]">{note.delivery_number || "Nog geen nummer"}</Link></td>
            <td className="px-5 py-4 text-[#33443a]"><Link href={rowHref} className="block">{note.supplier || "Wordt herkend"}</Link></td>
            <td className="px-5 py-4 text-[#526057]"><Link href={rowHref} className="block">{branchName(note.branches)}</Link></td>
            <td className="whitespace-nowrap px-5 py-4 text-[#526057]"><Link href={rowHref} className="block">{formatDate(note.delivery_date)}</Link></td>
            <td className="px-5 py-4 text-[#526057]"><Link href={rowHref} className="block">{note.delivery_note_items?.length || 0}</Link></td>
            <td className="px-5 py-4"><Link href={rowHref} className={`inline-flex rounded-full px-3 py-1.5 text-xs font-medium ${statusStyles[note.status] || "bg-slate-100 text-slate-700"}`}>{labels[note.status] || note.status}</Link></td>
            <td className="px-5 py-4 text-right"><Link href={rowHref} aria-label={`Pakbon ${note.delivery_number || note.id} openen`} className="inline-grid h-9 w-9 place-items-center rounded-full text-[#718078] hover:bg-[#edf1ed] hover:text-[#173b2b]"><MoreHorizontal size={20}/></Link></td>
          </tr>;
        })}</tbody>
      </table></div> : <div className="grid place-items-center p-14 text-center text-[#718078]"><FileText/><p className="mt-3">Geen pakbonnen gevonden met deze filters.</p><Link href="/protected/pakbonnen" className="mt-3 text-sm font-medium text-[#173b2b] underline underline-offset-4">Filters wissen</Link></div>}
    </div>
    {selectedNote && <NoteDetailPanel note={selectedNote} branches={editableBranches} photoUrl={photoUrl} closeHref={closeHref} isAdmin={profile?.role === "admin"}/>}
  </div>;
}
