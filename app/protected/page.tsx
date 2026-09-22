import { redirect } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { AlertCircle, CheckCircle2, ChevronRight, Clock3, FileText } from "lucide-react";
import { UploadNote } from "@/components/sloot/upload-note";
import { ProcessingRefresh } from "@/components/sloot/processing-refresh";

const statusLabels: Record<string, string> = {
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

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/auth/login");
  const userId = auth.claims.sub;
  const [{ data: notes = [] }, { data: profile }] = await Promise.all([
    supabase.from("delivery_notes").select("id,status,supplier,delivery_number,delivery_date,branch:branches(name)").order("created_at", { ascending: false }).limit(6),
    supabase.from("profiles").select("role").eq("id", userId).single(),
  ]);
  const { data: allBranches = [] } = await supabase.from("branches").select("id,name").eq("active", true).order("name");
  let branches = allBranches || [];
  if (profile?.role !== "admin") {
    const { data: assignments = [] } = await supabase.from("user_branches").select("branch_id").eq("user_id", userId);
    const allowed = new Set(assignments?.map((row) => row.branch_id));
    branches = branches.filter((branch) => allowed.has(branch.id));
  }
  const safeNotes = notes ?? [];
  const total = safeNotes.length;
  const pending = safeNotes.filter((n) => n.status === "pending").length;
  const approved = safeNotes.filter((n) => n.status === "approved").length;
  const stats = [
    { label: "Totaal zichtbaar", value: total, icon: FileText },
    { label: "Te accorderen", value: pending, icon: Clock3 },
    { label: "Geaccordeerd", value: approved, icon: CheckCircle2 },
    { label: "Aandacht nodig", value: 0, icon: AlertCircle },
  ];
  return <div>
    <ProcessingRefresh active={safeNotes.some((note) => note.status === "processing")}/>
    <div><p className="text-sm text-[#718078]">Dashboard</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Goedemiddag</h1><p className="mt-2 text-[#667168]">Dit is de actuele stand van de binnengekomen pakbonnen.</p></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-[#dde4de] bg-white p-5"><Icon className="text-[#2f7655]"/><p className="mt-5 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-[#718078]">{label}</p></div>)}</div>
    <div className="mt-8 grid gap-6 xl:grid-cols-[340px_1fr]"><UploadNote branches={branches}/>
    <div className="rounded-2xl border border-[#dde4de] bg-white"><div className="flex items-center justify-between border-b border-[#e6ebe7] p-5"><div><h2 className="text-lg font-semibold">Laatste pakbonnen</h2><p className="mt-1 text-xs text-[#718078]">De status wordt tijdens verwerking automatisch bijgewerkt.</p></div><Link href="/protected/pakbonnen" className="text-sm font-medium text-[#286044]">Alles bekijken</Link></div>{safeNotes.length ? <div className="divide-y divide-[#edf0ed]">{safeNotes.map((note) => <Link href={`/protected/pakbonnen?note=${note.id}`} key={note.id} className="grid grid-cols-[1fr_auto_auto] items-center gap-4 p-5 transition-colors hover:bg-[#f8faf8]"><div className="min-w-0"><p className="truncate font-medium">{note.supplier || "Leverancier wordt herkend"}</p><p className="mt-1 truncate text-sm text-[#718078]">{note.delivery_number || "Nog geen nummer"} · {note.delivery_date || "Datum onbekend"}</p></div><span className={`rounded-full px-3 py-1 text-xs font-medium ${statusStyles[note.status] || "bg-slate-100 text-slate-700"}`}>{statusLabels[note.status] || note.status}</span><ChevronRight size={18} className="text-[#8a948d]"/></Link>)}</div> : <div className="p-10 text-center text-[#718078]">Nog geen pakbonnen. Upload straks de eerste foto via de mobiele weergave.</div>}</div>
    </div>
  </div>;
}
