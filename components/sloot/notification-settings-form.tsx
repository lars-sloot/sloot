"use client";

import { useActionState, useState } from "react";
import { BellRing, Clock3, Mail, Plus, Save, Trash2, UserRound } from "lucide-react";
import {
  updateUserNotificationSettings,
  type NotificationSettingsState,
} from "@/app/actions/notifications";

const initialState: NotificationSettingsState = { status: "idle", message: "" };

export type NotificationUser = {
  id: string;
  name: string;
  email: string;
  active: boolean;
  enabled: boolean;
  sendTimes: string[];
  lastSentAt: string | null;
};

type NotificationSettingsFormProps = {
  users: NotificationUser[];
  emailServiceConfigured: boolean;
};

function UserNotificationCard({ user }: { user: NotificationUser }) {
  const [state, action, pending] = useActionState(updateUserNotificationSettings, initialState);
  const [times, setTimes] = useState(() => user.sendTimes.length ? user.sendTimes : ["08:00"]);

  return (
    <form action={action} className="overflow-hidden rounded-2xl border border-[#dce4dd] bg-white shadow-[0_1px_2px_rgba(16,42,32,0.03)]">
      <input type="hidden" name="user_id" value={user.id} />
      <div className="flex flex-wrap items-start justify-between gap-4 border-b border-[#e6ebe7] p-5 sm:p-6">
        <div className="flex min-w-0 items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-[#e9f2ed] text-[#286044]">
            <UserRound size={19} />
          </span>
          <div className="min-w-0">
            <h2 className="truncate font-semibold text-[#17231d]">{user.name}</h2>
            <p className="mt-1 flex items-center gap-1.5 truncate text-sm text-[#718078]"><Mail size={14} /> {user.email}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-medium ${user.active ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>
          {user.active ? "Actief account" : "Inactief account"}
        </span>
      </div>

      <div className="grid gap-5 p-5 sm:p-6">
        <label className="flex items-start gap-3 rounded-xl border border-[#dce4dd] bg-[#f8faf8] p-4">
          <input
            type="checkbox"
            name="daily_digest_enabled"
            defaultChecked={user.enabled}
            disabled={!user.active}
            className="mt-0.5 size-5 accent-[#173b2b]"
          />
          <span>
            <span className="block font-medium text-[#17231d]">E-mailnotificaties inschakelen</span>
            <span className="mt-1 block text-sm text-[#718078]">Deze gebruiker ontvangt op ieder ingesteld tijdstip een eigen overzicht.</span>
          </span>
        </label>

        <fieldset className="grid gap-3" disabled={!user.active}>
          <legend className="mb-2 flex items-center gap-2 text-sm font-medium text-[#33443a]"><Clock3 size={16} /> Verzendmomenten</legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {times.map((time, index) => (
              <div key={index} className="flex items-center gap-2">
                <input
                  type="time"
                  name="send_time"
                  required
                  step={900}
                  value={time}
                  onChange={(event) => setTimes((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  aria-label={`Verzendmoment ${index + 1} voor ${user.name}`}
                  className="min-w-0 flex-1 rounded-xl border border-[#d6ddd7] bg-white px-4 py-3 font-normal outline-none focus:border-[#173b2b] focus:ring-2 focus:ring-[#173b2b]/10"
                />
                <button
                  type="button"
                  onClick={() => setTimes((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                  disabled={times.length === 1}
                  aria-label={`Verzendmoment ${index + 1} verwijderen`}
                  className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#d6ddd7] text-[#718078] hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-35"
                >
                  <Trash2 size={18} />
                </button>
              </div>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setTimes((current) => current.length < 12 ? [...current, "12:00"] : current)}
            disabled={times.length >= 12}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#d6ddd7] px-4 py-2.5 text-sm font-medium text-[#33443a] hover:bg-[#f5f7f4] disabled:opacity-50"
          >
            <Plus size={17} /> Tijdstip toevoegen
          </button>
          <p className="text-xs text-[#718078]">Nederlandse tijd, instelbaar per 15 minuten. Maximaal 12 momenten per dag.</p>
        </fieldset>

        {user.lastSentAt ? <p className="text-xs text-[#718078]">Laatst verzonden: {user.lastSentAt}</p> : null}

        {state.message ? (
          <p role="status" className={`rounded-xl px-4 py-3 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending || !user.active}
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#173b2b] px-5 py-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Save size={17} />
          {pending ? "Opslaan…" : "Opslaan voor deze gebruiker"}
        </button>
      </div>
    </form>
  );
}

export function NotificationSettingsForm({ users, emailServiceConfigured }: NotificationSettingsFormProps) {
  return (
    <div className="mt-8 grid max-w-3xl gap-5">
      <div className="flex items-start gap-4 rounded-2xl border border-[#dce4dd] bg-white p-5 sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e9f2ed] text-[#286044]">
          <BellRing size={21} />
        </span>
        <div>
          <h2 className="font-semibold text-[#17231d]">Persoonlijke pakbonoverzichten</h2>
          <p className="mt-1 text-sm leading-6 text-[#667168]">Stel per gebruiker in of en op welke momenten het overzicht wordt verzonden.</p>
        </div>
      </div>

      {!emailServiceConfigured ? (
        <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
          De e-maildienst moet nog aan Vercel worden gekoppeld. Je kunt de schema&apos;s alvast opslaan; verzending begint zodra de koppeling actief is.
        </div>
      ) : null}

      {users.length ? users.map((user) => <UserNotificationCard key={user.id} user={user} />) : (
        <p className="rounded-2xl border border-[#dce4dd] bg-white p-6 text-sm text-[#718078]">Er zijn nog geen gebruikers om in te stellen.</p>
      )}
    </div>
  );
}
