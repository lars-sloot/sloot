import { createClient } from "@/lib/supabase/server";
import { FileText } from "lucide-react";

export default async function NotesPage() {
  const supabase = await createClient();
  const { data: notes = [] } = await supabase.from("delivery_notes").select("id,supplier,delivery_number,delivery_date,status,article_summary,branches(name)").order("created_at", { ascending: false });
  return <div><p className="text-sm text-[#718078]">Overzicht</p><h1 className="mt-1 text-3xl font-semibold">Pakbonnen</h1><div className="mt-8 rounded-2xl border border-[#dce4dd] bg-white">{notes?.length ? <div className="divide-y">{notes.map((n) => <div key={n.id} className="grid gap-3 p-5 md:grid-cols-[1.2fr_1fr_1fr_auto]"><div><p className="font-medium">{n.supplier || "Wordt herkend"}</p><p className="text-sm text-[#718078]">{n.delivery_number || "Geen nummer"}</p></div><p>{n.delivery_date || "Datum onbekend"}</p><p className="text-[#667168]">{n.article_summary || "Artikelen worden herkend"}</p><span className="h-fit rounded-full bg-[#edf5ef] px-3 py-1 text-xs">{n.status}</span></div>)}</div> : <div className="grid place-items-center p-14 text-center text-[#718078]"><FileText/><p className="mt-3">Er zijn nog geen pakbonnen opgeslagen.</p></div>}</div></div>;
}

