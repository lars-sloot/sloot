import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AlertCircle, CheckCircle2, Clock3, FileText } from "lucide-react";

export default async function Dashboard() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  if (!auth?.claims) redirect("/auth/login");
  const { data: notes = [] } = await supabase.from("delivery_notes").select("id,status,supplier,delivery_date,branch:branches(name)").order("created_at", { ascending: false }).limit(6);
  const total = notes?.length ?? 0;
  const pending = notes?.filter((n) => n.status === "pending").length ?? 0;
  const approved = notes?.filter((n) => n.status === "approved").length ?? 0;
  const stats = [
    { label: "Totaal zichtbaar", value: total, icon: FileText },
    { label: "Te accorderen", value: pending, icon: Clock3 },
    { label: "Geaccordeerd", value: approved, icon: CheckCircle2 },
    { label: "Aandacht nodig", value: 0, icon: AlertCircle },
  ];
  return <div>
    <div><p className="text-sm text-[#718078]">Dashboard</p><h1 className="mt-1 text-3xl font-semibold tracking-tight">Goedemiddag</h1><p className="mt-2 text-[#667168]">Dit is de actuele stand van de binnengekomen pakbonnen.</p></div>
    <div className="mt-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{stats.map(({ label, value, icon: Icon }) => <div key={label} className="rounded-2xl border border-[#dde4de] bg-white p-5"><Icon className="text-[#2f7655]"/><p className="mt-5 text-3xl font-semibold">{value}</p><p className="mt-1 text-sm text-[#718078]">{label}</p></div>)}</div>
    <div className="mt-8 rounded-2xl border border-[#dde4de] bg-white"><div className="border-b border-[#e6ebe7] p-5"><h2 className="text-lg font-semibold">Laatste pakbonnen</h2></div>{notes?.length ? <div className="divide-y divide-[#edf0ed]">{notes.map((note) => <div key={note.id} className="grid grid-cols-[1fr_auto] gap-4 p-5"><div><p className="font-medium">{note.supplier || "Leverancier wordt herkend"}</p><p className="mt-1 text-sm text-[#718078]">{note.delivery_date || "Datum onbekend"}</p></div><span className="self-center rounded-full bg-[#edf5ef] px-3 py-1 text-xs text-[#286044]">{note.status}</span></div>)}</div> : <div className="p-10 text-center text-[#718078]">Nog geen pakbonnen. Upload straks de eerste foto via de mobiele weergave.</div>}</div>
  </div>;
}
