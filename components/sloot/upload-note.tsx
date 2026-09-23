"use client";

import { useRef, useState } from "react";
import { Camera, LoaderCircle, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

type Branch = { id: string; name: string };

export function UploadNote({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [state, setState] = useState<"idle" | "uploading" | "queued">("idle");
  const [error, setError] = useState("");

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file || !branchId) return;
    setError("");
    setState("uploading");
    const form = new FormData();
    form.set("file", file);
    form.set("branch_id", branchId);
    const upload = await fetch("/api/delivery-notes", { method: "POST", body: form });
    const uploaded = await upload.json();
    if (!upload.ok) { setError(uploaded.error || "Uploaden mislukt."); setState("idle"); return; }
    setState("queued");
    setFile(null);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
    setTimeout(() => setState("idle"), 3500);
  }

  return <form onSubmit={submit} className="rounded-2xl bg-[#173b2b] p-5 text-white">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white/10"><Camera size={20}/></span><div><h2 className="font-semibold">Nieuwe pakbon</h2><p className="text-sm text-white/65">Foto of bestand, maximaal 15 MB</p></div></div>
    <label className="mt-5 grid gap-2 text-sm">Filiaal<select value={branchId} onChange={(e) => setBranchId(e.target.value)} className="rounded-xl border border-white/20 bg-white/10 p-3 text-white">{branches.map((branch) => <option key={branch.id} value={branch.id} className="text-black">{branch.name}</option>)}</select></label>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <label className="grid min-h-24 cursor-pointer place-items-center rounded-xl border border-white/25 bg-white/5 p-4 text-center hover:bg-white/10"><span><Camera className="mx-auto" size={22}/><span className="mt-2 block text-sm font-medium">Foto maken</span></span><input ref={cameraInputRef} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => setFile(event.target.files?.[0] || null)}/></label>
      <label className="grid min-h-24 cursor-pointer place-items-center rounded-xl border border-white/25 bg-white/5 p-4 text-center hover:bg-white/10"><span><Upload className="mx-auto" size={22}/><span className="mt-2 block text-sm font-medium">Bestand kiezen</span></span><input ref={fileInputRef} className="sr-only" type="file" accept="image/*,application/pdf" onChange={(event) => setFile(event.target.files?.[0] || null)}/></label>
    </div>
    {file ? <p className="mt-3 truncate rounded-lg bg-white/10 px-3 py-2 text-sm">Geselecteerd: {file.name}</p> : null}
    {error && <p className="mt-3 rounded-lg bg-red-500/20 p-3 text-sm">{error}</p>}
    {state === "queued" && <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm">Foto opgeslagen. De AI verwerkt de pakbon nu op de achtergrond.</p>}
    <button disabled={!file || !branchId || state !== "idle"} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-medium text-[#173b2b] disabled:opacity-50">{state === "idle" ? "Uploaden" : state === "queued" ? "In wachtrij geplaatst" : <><LoaderCircle className="animate-spin" size={18}/>Foto uploaden…</>}</button>
  </form>;
}
