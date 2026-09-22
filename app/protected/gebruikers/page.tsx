import { createClient } from "@/lib/supabase/server";
import { createUser, updateUser } from "@/app/actions/users";
import { UserPlus } from "lucide-react";
import { redirect } from "next/navigation";

export default async function UsersPage() {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const { data: currentProfile } = await supabase.from("profiles").select("role").eq("id", auth?.claims?.sub || "").maybeSingle();
  if (currentProfile?.role !== "admin") redirect("/protected");

  const [{ data: profiles = [] }, { data: branches = [] }] = await Promise.all([
    supabase.from("profiles").select("id,full_name,role,active,user_branches(branch_id,branches(name))").order("full_name"),
    supabase.from("branches").select("id,name").eq("active", true).order("name"),
  ]);
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#718078]">Beheer</p><h1 className="mt-1 text-3xl font-semibold">Gebruikers</h1><p className="mt-2 text-[#667168]">Koppel een gebruiker aan één of meerdere filialen.</p></div></div>
    <details className="mt-8 rounded-2xl border border-[#dce4dd] bg-white p-5">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium"><UserPlus size={18}/> Nieuwe gebruiker</summary>
      <form action={createUser} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Naam<input name="full_name" required className="rounded-xl border p-3"/></label>
        <label className="grid gap-1 text-sm">E-mail<input name="email" type="email" required className="rounded-xl border p-3"/></label>
        <label className="grid gap-1 text-sm">Rol<select name="role" className="rounded-xl border p-3"><option value="user">Gebruiker</option><option value="admin">Beheerder</option></select></label>
        <fieldset className="text-sm"><legend className="mb-2">Filialen</legend><div className="flex flex-wrap gap-3">{branches?.map((b) => <label key={b.id} className="flex items-center gap-2"><input type="checkbox" name="branch_id" value={b.id}/>{b.name}</label>)}</div></fieldset>
        <button className="w-fit rounded-xl bg-[#173b2b] px-5 py-3 text-white">Gebruiker aanmaken</button>
      </form>
    </details>
    <div className="mt-6 grid gap-4">
      {profiles?.map((profile) => {
        const selected = new Set(profile.user_branches?.map((link) => link.branch_id));
        return <details key={profile.id} className="rounded-2xl border border-[#dce4dd] bg-white p-5">
          <summary className="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-4"><div><p className="font-medium">{profile.full_name || "Naamloos account"}</p><p className="mt-1 text-sm text-[#718078]">{profile.role === "admin" ? "Beheerder" : "Gebruiker"} · {profile.active ? "Actief" : "Inactief"}</p></div><span className="rounded-lg border px-3 py-2 text-sm">Aanpassen</span></summary>
          <form action={updateUser} className="mt-5 grid gap-4 border-t pt-5 md:grid-cols-2">
            <input type="hidden" name="user_id" value={profile.id}/>
            <label className="grid gap-1 text-sm">Naam<input name="full_name" defaultValue={profile.full_name} required className="rounded-xl border p-3"/></label>
            <label className="grid gap-1 text-sm">Rol<select name="role" defaultValue={profile.role} className="rounded-xl border p-3"><option value="user">Gebruiker</option><option value="admin">Beheerder</option></select></label>
            <fieldset className="text-sm"><legend className="mb-2">Filialen</legend><div className="flex flex-wrap gap-3">{branches?.map((b) => <label key={b.id} className="flex items-center gap-2"><input type="checkbox" name="branch_id" value={b.id} defaultChecked={selected.has(b.id)}/>{b.name}</label>)}</div></fieldset>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="active" defaultChecked={profile.active}/> Account actief</label>
            <button className="w-fit rounded-xl bg-[#173b2b] px-5 py-3 text-white">Wijzigingen opslaan</button>
          </form>
        </details>;
      })}
    </div>
  </div>;
}
