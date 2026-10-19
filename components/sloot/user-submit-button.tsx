"use client";

import { LoaderCircle } from "lucide-react";
import { useFormStatus } from "react-dom";

export function UserSubmitButton({ label, pendingLabel }: { label: string; pendingLabel: string }) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex w-fit items-center justify-center gap-2 rounded-xl bg-[#173b2b] px-5 py-3 text-white transition-opacity disabled:cursor-wait disabled:opacity-75"
    >
      <span className="grid">
        <span className={`col-start-1 row-start-1 ${pending ? "invisible" : ""}`}>{label}</span>
        <span className={`col-start-1 row-start-1 ${pending ? "" : "invisible"}`}>{pendingLabel}</span>
      </span>
      <LoaderCircle aria-hidden="true" size={16} className={`shrink-0 ${pending ? "motion-safe:animate-spin" : "invisible"}`} />
    </button>
  );
}
