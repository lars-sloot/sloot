import { getViewerProfile } from "@/lib/supabase/viewer";
import { createClient } from "@/lib/supabase/server";
import { createUser } from "@/app/actions/users";
import { UserPlus, Users } from "lucide-react";
import { redirect } from "next/navigation";
import { UserSubmitButton } from "@/components/sloot/user-submit-button";
import { UserSettingsForm } from "@/components/sloot/user-settings-form";
import { createAdminClient } from "@/lib/supabase/admin";

export default async function UsersPage() {
  const supabase = await createClient();
  const currentProfile = await getViewerProfile();
  if (currentProfile?.role !== "admin") redirect("/protected");

  const [{ data: profiles = [] }, { data: branches = [] }] = await Promise.all([
    supabase.from("profiles").select("id,full_name,role,active,user_branches(branch_id,branches(name))").eq("organization_id", currentProfile.organization_id).order("active", { ascending: false }).order("full_name"),
    supabase.from("branches").select("id,name").eq("organization_id", currentProfile.organization_id).eq("active", true).order("name"),
  ]);
  const admin = createAdminClient();
  const users = await Promise.all((profiles ?? []).map(async (profile) => {
    const { data, error } = await admin.auth.admin.getUserById(profile.id);
    if (error || !data.user) throw new Error("De e-mailadressen konden niet worden geladen. Probeer het opnieuw.");
    return {
      id: profile.id,
      name: profile.full_name || "Naamloos account",
      email: data.user.email || "",
      role: profile.role,
      active: profile.active,
      branchIds: (profile.user_branches ?? []).map((link) => link.branch_id),
    };
  }));
  return <div>
    <div className="flex flex-wrap items-end justify-between gap-4"><div><p className="text-sm text-[#718078]">Beheer</p><h1 className="mt-1 text-3xl font-semibold">Gebruikers</h1><p className="mt-2 text-[#667168]">Koppel een gebruiker aan één of meerdere filialen.</p></div></div>
    <div className="mt-8 grid max-w-3xl gap-5">
    <div className="flex items-start gap-4 rounded-2xl border border-[#dce4dd] bg-white p-5 sm:p-6">
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e9f2ed] text-[#286044]"><Users size={21}/></span>
      <div><h2 className="font-semibold text-[#17231d]">Gebruikers beheren</h2><p className="mt-1 text-sm leading-6 text-[#667168]">Beheer accountgegevens, e-mailadressen en toegang tot filialen. Bij deactiveren blijven namen en pakbonnen bewaard.</p></div>
    </div>
    <details className="rounded-2xl border border-[#dce4dd] bg-white p-5 sm:p-6 shadow-[0_1px_2px_rgba(16,42,32,0.03)]">
      <summary className="flex cursor-pointer list-none items-center gap-2 font-medium"><UserPlus size={18}/> Nieuwe gebruiker</summary>
      <form action={createUser} className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="grid gap-1 text-sm">Naam<input name="full_name" required className="rounded-xl border p-3"/></label>
        <label className="grid gap-1 text-sm">E-mail<input name="email" type="email" required className="rounded-xl border p-3"/></label>
        <label className="grid gap-1 text-sm">Rol<select name="role" className="rounded-xl border p-3"><option value="user">Gebruiker</option><option value="admin">Beheerder</option></select></label>
        <fieldset className="text-sm"><legend className="mb-2">Filialen</legend><div className="flex flex-wrap gap-3">{branches?.map((b) => <label key={b.id} className="flex items-center gap-2"><input type="checkbox" name="branch_id" value={b.id}/>{b.name}</label>)}</div></fieldset>
        <UserSubmitButton label="Gebruiker aanmaken" pendingLabel="Aanmaken…" />
      </form>
    </details>
    <UserSettingsForm users={users} branches={branches ?? []} />
    </div>
  </div>;
}
