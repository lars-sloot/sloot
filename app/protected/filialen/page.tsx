import { getViewerProfile } from "@/lib/supabase/viewer";
import { createClient } from "@/lib/supabase/server";
import { MapPin } from "lucide-react";
import { redirect } from "next/navigation";

export default async function BranchesPage() {
  const supabase = await createClient();
  const profile = await getViewerProfile();
  if (profile?.role !== "admin") redirect("/protected");

  const { data: branches = [] } = await supabase.from("branches").select("id,name,active").order("name");
  return <div><p className="text-sm text-[#718078]">Beheer</p><h1 className="mt-1 text-3xl font-semibold">Filialen</h1><div className="mt-8 grid gap-4 md:grid-cols-3">{branches?.map((branch) => <div key={branch.id} className="rounded-2xl border border-[#dce4dd] bg-white p-6"><MapPin className="text-[#2f7655]"/><h2 className="mt-5 text-xl font-semibold">{branch.name}</h2><p className="mt-2 text-sm text-[#718078]">{branch.active ? "Actief filiaal" : "Inactief"}</p></div>)}</div></div>;
}
