"use client";

import { useActionState, useState } from "react";
import { ChevronDown, Mail, UserRound } from "lucide-react";
import { saveUserSettings, updateUserEmail, type UserSettingsState } from "@/app/actions/users";
import { UserSubmitButton } from "@/components/sloot/user-submit-button";

export type ManagedUser = {
  id: string;
  name: string;
  email: string;
  role: string;
  active: boolean;
  branchIds: string[];
};
type Branch = { id: string; name: string };
const initialState: UserSettingsState = { status: "idle", message: "" };
const inputClass = "min-w-0 w-full rounded-xl border border-[#d6ddd7] bg-white px-4 py-3 text-[#17231d] outline-none focus:border-[#173b2b] focus:ring-2 focus:ring-[#173b2b]/10";

function Feedback({ state }: { state: UserSettingsState }) {
  return state.message ? <p role="status" className={`rounded-xl px-4 py-3 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>{state.message}</p> : null;
}

function UserCard({ user, branches }: { user: ManagedUser; branches: Branch[] }) {
  const [expanded, setExpanded] = useState(false);
  const [state, action, pending] = useActionState(saveUserSettings, initialState);
  const [emailState, emailAction, emailPending] = useActionState(updateUserEmail, initialState);
  const contentId = `user-settings-${user.id}`;

  return <div className="overflow-hidden rounded-2xl border border-[#dce4dd] bg-white shadow-[0_1px_2px_rgba(16,42,32,0.03)]">
    <button type="button" aria-expanded={expanded} aria-controls={contentId} onClick={() => setExpanded((current) => !current)} className={`flex w-full items-start justify-between gap-4 p-5 text-left transition-colors hover:bg-[#f8faf8] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#286044] sm:p-6 ${expanded ? "border-b border-[#e6ebe7]" : ""}`}>
      <span className="flex min-w-0 items-start gap-3">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e9f2ed] text-[#286044]"><UserRound size={19}/></span>
        <span className="min-w-0">
          <span className="block truncate font-semibold text-[#17231d]">{user.name}</span>
          <span className="mt-1 flex min-w-0 items-center gap-1.5 text-sm text-[#718078]"><Mail size={14} className="shrink-0"/><span className="truncate">{user.email || "Geen e-mailadres"}</span></span>
          <span className="mt-2 block text-xs text-[#718078]">{user.role === "admin" ? "Beheerder" : "Gebruiker"} · {branches.filter((branch) => user.branchIds.includes(branch.id)).map((branch) => branch.name).join(", ") || "Geen filialen gekoppeld"}</span>
          <span className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-medium sm:hidden ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.active ? "Actief account" : "Inactief account"}</span>
        </span>
      </span>
      <span className="flex shrink-0 items-center gap-2 sm:gap-3"><span className={`hidden rounded-full px-3 py-1 text-xs font-medium sm:inline-flex ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{user.active ? "Actief account" : "Inactief account"}</span><ChevronDown size={20} aria-hidden="true" className={`mt-1 text-[#718078] transition-transform ${expanded ? "rotate-180" : ""}`}/></span>
    </button>
    {expanded ? <div id={contentId} className="grid gap-6 p-5 sm:p-6">
      <form action={action} className="grid gap-5">
        <input type="hidden" name="user_id" value={user.id}/>
        <fieldset disabled={pending || emailPending} className="grid min-w-0 gap-5 sm:grid-cols-2">
          <label className="grid min-w-0 gap-2 text-sm font-medium text-[#33443a]">Naam<input name="full_name" defaultValue={user.name} required className={inputClass}/></label>
          <label className="grid min-w-0 gap-2 text-sm font-medium text-[#33443a]">Rol<select name="role" defaultValue={user.role} className={inputClass}><option value="user">Gebruiker</option><option value="admin">Beheerder</option></select></label>
          <fieldset className="sm:col-span-2"><legend className="mb-3 text-sm font-medium text-[#33443a]">Filialen</legend><div className="flex flex-wrap gap-4">{branches.map((branch) => <label key={branch.id} className="flex items-center gap-2 text-sm text-[#33443a]"><input type="checkbox" name="branch_id" value={branch.id} defaultChecked={user.branchIds.includes(branch.id)} className="size-4 accent-[#173b2b]"/>{branch.name}</label>)}</div></fieldset>
          <label className="flex items-start gap-3 rounded-xl border border-[#dce4dd] bg-[#f8faf8] p-4 sm:col-span-2"><input type="checkbox" name="active" defaultChecked={user.active} className="mt-0.5 size-5 accent-[#173b2b]"/><span><span className="block text-sm font-medium text-[#17231d]">Account actief</span><span className="mt-1 block text-sm text-[#718078]">Bij deactiveren blijven bestaande pakbonnen en gebruikersnamen behouden.</span></span></label>
          <UserSubmitButton label="Wijzigingen opslaan" pendingLabel="Opslaan…"/>
        </fieldset>
        <Feedback state={state}/>
      </form>
      <form action={emailAction} className="grid gap-4 border-t border-[#e6ebe7] pt-6">
        <input type="hidden" name="user_id" value={user.id}/>
        <fieldset disabled={pending || emailPending} className="grid min-w-0 gap-4">
          <label className="grid min-w-0 gap-2 text-sm font-medium text-[#33443a]">E-mailadres<input type="email" name="email" defaultValue={user.email} required className={inputClass}/></label>
          <p className="text-sm leading-6 text-[#718078]">Dit adres wordt gebruikt voor inloggen en e-mailnotificaties. Een wijziging gaat direct in; het wachtwoord blijft gelijk.</p>
          <UserSubmitButton label="E-mailadres opslaan" pendingLabel="Opslaan…"/>
        </fieldset>
        <Feedback state={emailState}/>
      </form>
    </div> : null}
  </div>;
}

export function UserSettingsForm({ users, branches }: { users: ManagedUser[]; branches: Branch[] }) {
  return <div className="grid gap-5">{users.length ? users.map((user) => <UserCard key={user.id} user={user} branches={branches}/>) : <p className="rounded-2xl border border-[#dce4dd] bg-white p-6 text-sm text-[#718078]">Er zijn nog geen gebruikers om in te stellen.</p>}</div>;
}
