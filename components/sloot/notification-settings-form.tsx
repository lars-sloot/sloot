"use client";

import { useActionState, useState } from "react";
import { BellRing, Mail, Plus, Save, Trash2 } from "lucide-react";
import {
  updateNotificationSettings,
  type NotificationSettingsState,
} from "@/app/actions/notifications";

const initialState: NotificationSettingsState = { status: "idle", message: "" };

type NotificationSettingsFormProps = {
  enabled: boolean;
  recipientEmails: string[];
  sendTime: string;
  emailServiceConfigured: boolean;
  lastSentAt: string | null;
};

export function NotificationSettingsForm({
  enabled,
  recipientEmails,
  sendTime,
  emailServiceConfigured,
  lastSentAt,
}: NotificationSettingsFormProps) {
  const [state, action, pending] = useActionState(updateNotificationSettings, initialState);
  const [emails, setEmails] = useState(() => recipientEmails.length ? recipientEmails : [""]);

  return (
    <form action={action} className="mt-8 max-w-2xl overflow-hidden rounded-2xl border border-[#dce4dd] bg-white shadow-[0_1px_2px_rgba(16,42,32,0.03)]">
      <div className="flex items-start gap-4 border-b border-[#e6ebe7] p-5 sm:p-6">
        <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-[#e9f2ed] text-[#286044]">
          <BellRing size={21} />
        </span>
        <div>
          <h2 className="font-semibold text-[#17231d]">Dagelijks pakbonnenoverzicht</h2>
          <p className="mt-1 text-sm leading-6 text-[#667168]">
            Iedere ochtend ontvang je de cijfers van de vorige dag en de actuele werkvoorraad.
          </p>
        </div>
      </div>

      <div className="grid gap-6 p-5 sm:p-6">
        {!emailServiceConfigured ? (
          <div role="status" className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-900">
            De e-maildienst moet nog één keer aan Vercel worden gekoppeld. Je kunt de ontvanger alvast opslaan; verzending begint zodra de koppeling actief is.
          </div>
        ) : null}

        <label className="flex items-start gap-3 rounded-xl border border-[#dce4dd] bg-[#f8faf8] p-4">
          <input
            type="checkbox"
            name="daily_digest_enabled"
            defaultChecked={enabled}
            className="mt-0.5 size-5 accent-[#173b2b]"
          />
          <span>
            <span className="block font-medium text-[#17231d]">Dagelijkse e-mail inschakelen</span>
            <span className="mt-1 block text-sm text-[#718078]">Verzending vindt dagelijks plaats op het gekozen tijdstip in Nederlandse tijd.</span>
          </span>
        </label>

        <fieldset className="grid gap-3">
          <legend className="text-sm font-medium text-[#33443a]">Ontvangers</legend>
          {emails.map((email, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="relative min-w-0 flex-1">
                <Mail className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-[#718078]" size={18} />
                <input
                  type="email"
                  name="recipient_email"
                  required
                  value={email}
                  onChange={(event) => setEmails((current) => current.map((item, itemIndex) => itemIndex === index ? event.target.value : item))}
                  autoComplete="email"
                  aria-label={`Ontvanger ${index + 1}`}
                  placeholder="bijvoorbeeld administratie@sloot2wielers.nl"
                  className="w-full rounded-xl border border-[#d6ddd7] bg-white py-3 pl-10 pr-4 text-sm font-normal outline-none focus:border-[#173b2b] focus:ring-2 focus:ring-[#173b2b]/10"
                />
              </span>
              <button
                type="button"
                onClick={() => setEmails((current) => current.filter((_, itemIndex) => itemIndex !== index))}
                disabled={emails.length === 1}
                aria-label={`Ontvanger ${index + 1} verwijderen`}
                className="grid size-11 shrink-0 place-items-center rounded-xl border border-[#d6ddd7] text-[#718078] hover:bg-red-50 hover:text-red-700 disabled:cursor-not-allowed disabled:opacity-35"
              >
                <Trash2 size={18} />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setEmails((current) => current.length < 20 ? [...current, ""] : current)}
            disabled={emails.length >= 20}
            className="inline-flex w-fit items-center gap-2 rounded-xl border border-[#d6ddd7] px-4 py-2.5 text-sm font-medium text-[#33443a] hover:bg-[#f5f7f4] disabled:opacity-50"
          >
            <Plus size={17} /> E-mailadres toevoegen
          </button>
        </fieldset>

        <label className="grid max-w-xs gap-2 text-sm font-medium text-[#33443a]">
          Dagelijks verzendmoment
          <input
            type="time"
            name="send_time"
            required
            step={900}
            defaultValue={sendTime}
            className="rounded-xl border border-[#d6ddd7] bg-white px-4 py-3 font-normal outline-none focus:border-[#173b2b] focus:ring-2 focus:ring-[#173b2b]/10"
          />
          <span className="text-xs font-normal text-[#718078]">Nederlandse tijd, instelbaar per 15 minuten.</span>
        </label>

        <div className="rounded-xl bg-[#f5f7f4] p-4 text-sm leading-6 text-[#526057]">
          <p className="font-medium text-[#33443a]">De e-mail bevat</p>
          <p className="mt-1">Iedere ontvanger krijgt een afzonderlijke e-mail met binnengekomen, verwerkt, geaccordeerd, afgewezen en nog te controleren pakbonnen. De knop opent direct het gefilterde overzicht.</p>
          {lastSentAt ? <p className="mt-2 text-xs text-[#718078]">Laatst verzonden: {lastSentAt}</p> : null}
        </div>

        {state.message ? (
          <p role="status" className={`rounded-xl px-4 py-3 text-sm ${state.status === "error" ? "bg-red-50 text-red-700" : "bg-emerald-50 text-emerald-700"}`}>
            {state.message}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={pending}
          className="inline-flex w-fit items-center gap-2 rounded-xl bg-[#173b2b] px-5 py-3 text-sm font-semibold text-white disabled:cursor-wait disabled:opacity-60"
        >
          <Save size={17} />
          {pending ? "Opslaan…" : "Instellingen opslaan"}
        </button>
      </div>
    </form>
  );
}
