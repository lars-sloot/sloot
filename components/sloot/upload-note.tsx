"use client";

import { useRef, useState } from "react";
import { Camera, FileText, LoaderCircle, Trash2, Upload } from "lucide-react";
import { useRouter } from "next/navigation";

type Branch = { id: string; name: string };

const maxPages = 10;
const maxFileBytes = 15 * 1024 * 1024;
const maxTotalBytes = 50 * 1024 * 1024;

function formatSize(bytes: number) {
  return new Intl.NumberFormat("nl-NL", { maximumFractionDigits: 1 }).format(bytes / 1024 / 1024) + " MB";
}

export function UploadNote({ branches }: { branches: Branch[] }) {
  const router = useRouter();
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [branchId, setBranchId] = useState(branches[0]?.id || "");
  const [state, setState] = useState<"idle" | "uploading" | "queued">("idle");
  const [error, setError] = useState("");
  const [uploadingPage, setUploadingPage] = useState(0);
  const [uploadedPages, setUploadedPages] = useState(0);
  const [draftNoteId, setDraftNoteId] = useState("");
  const selectionLocked = state === "uploading" || uploadedPages > 0;

  function addFiles(selected: File[]) {
    setError("");
    const next = [...files, ...selected];
    if (next.length > maxPages) {
      setError(`Selecteer maximaal ${maxPages} pagina's per pakbon.`);
      return;
    }
    if (selected.some((file) => file.size < 1 || file.size > maxFileBytes)) {
      setError("Iedere pagina mag maximaal 15 MB zijn.");
      return;
    }
    if (next.reduce((total, file) => total + file.size, 0) > maxTotalBytes) {
      setError("Alle pagina's samen mogen maximaal 50 MB zijn.");
      return;
    }
    setFiles(next);
  }

  function removeFile(index: number) {
    if (selectionLocked) return;
    setFiles((current) => current.filter((_, fileIndex) => fileIndex !== index));
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!files.length || !branchId) return;
    setError("");
    setState("uploading");
    let noteId = draftNoteId;

    for (let index = uploadedPages; index < files.length; index += 1) {
      setUploadingPage(index + 1);
      const form = new FormData();
      form.set("file", files[index]);
      form.set("branch_id", branchId);
      form.set("page_number", String(index + 1));
      form.set("page_count", String(files.length));
      if (noteId) form.set("note_id", noteId);

      let upload: Response;
      let uploaded: { id?: string; queued?: boolean; error?: string };
      try {
        upload = await fetch("/api/delivery-notes", { method: "POST", body: form });
        uploaded = await upload.json();
      } catch {
        setState("idle");
        setError(`Pagina ${index + 1} kon niet worden verstuurd. Controleer de internetverbinding en hervat de upload.`);
        return;
      }
      if (uploaded.id) {
        noteId = uploaded.id;
        setDraftNoteId(uploaded.id);
      }
      if (!upload.ok) {
        if (uploaded.id && index === files.length - 1) {
          setFiles([]);
          setDraftNoteId("");
          setUploadedPages(0);
          setUploadingPage(0);
          setState("idle");
          setError(uploaded.error || "De pakbon is opgeslagen, maar de AI-verwerking kon niet worden gestart.");
          router.refresh();
          return;
        }
        setState("idle");
        setError(`Pagina ${index + 1} kon niet worden geüpload. Probeer de upload opnieuw om verder te gaan. ${uploaded.error || ""}`.trim());
        return;
      }
      setUploadedPages(index + 1);
    }

    setState("queued");
    setFiles([]);
    setDraftNoteId("");
    setUploadedPages(0);
    setUploadingPage(0);
    if (cameraInputRef.current) cameraInputRef.current.value = "";
    if (fileInputRef.current) fileInputRef.current.value = "";
    router.refresh();
    window.setTimeout(() => setState("idle"), 3500);
  }

  return <form onSubmit={submit} className="rounded-2xl bg-[#173b2b] p-5 text-white">
    <div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-white/10"><Camera size={20}/></span><div><h2 className="font-semibold">Nieuwe pakbon</h2><p className="text-sm text-white/65">Eén of meer pagina&apos;s, maximaal 10</p></div></div>
    <label className="mt-5 grid gap-2 text-sm">Filiaal<select value={branchId} disabled={selectionLocked} onChange={(event) => setBranchId(event.target.value)} className="rounded-xl border border-white/20 bg-white/10 p-3 text-white disabled:opacity-60">{branches.map((branch) => <option key={branch.id} value={branch.id} className="text-black">{branch.name}</option>)}</select></label>
    <div className="mt-4 grid grid-cols-2 gap-3">
      <label className={`grid min-h-24 place-items-center rounded-xl border border-white/25 bg-white/5 p-4 text-center hover:bg-white/10 ${selectionLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}><span><Camera className="mx-auto" size={22}/><span className="mt-2 block text-sm font-medium">Pagina fotograferen</span><span className="mt-1 block text-xs text-white/55">Herhaal voor iedere pagina</span></span><input ref={cameraInputRef} disabled={selectionLocked} className="sr-only" type="file" accept="image/*" capture="environment" onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = ""; }}/></label>
      <label className={`grid min-h-24 place-items-center rounded-xl border border-white/25 bg-white/5 p-4 text-center hover:bg-white/10 ${selectionLocked ? "cursor-not-allowed opacity-50" : "cursor-pointer"}`}><span><Upload className="mx-auto" size={22}/><span className="mt-2 block text-sm font-medium">Bestanden kiezen</span><span className="mt-1 block text-xs text-white/55">Meerdere tegelijk mogelijk</span></span><input ref={fileInputRef} disabled={selectionLocked} className="sr-only" type="file" accept="image/*,application/pdf" multiple onChange={(event) => { addFiles(Array.from(event.target.files || [])); event.target.value = ""; }}/></label>
    </div>

    {files.length ? <div className="mt-4 overflow-hidden rounded-xl bg-white/10">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2 text-xs text-white/70"><span>{files.length} {files.length === 1 ? "pagina" : "pagina's"} geselecteerd</span><span>{formatSize(files.reduce((total, file) => total + file.size, 0))}</span></div>
      <ol className="max-h-48 divide-y divide-white/10 overflow-y-auto">{files.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}-${index}`} className="flex items-center gap-3 px-3 py-2.5">
        <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-white/10 text-xs font-semibold">{index + 1}</span>
        <FileText size={16} className="shrink-0 text-white/70"/>
        <span className="min-w-0 flex-1"><span className="block truncate text-sm">{file.name}</span><span className="block text-xs text-white/55">{formatSize(file.size)}</span></span>
        <button type="button" disabled={selectionLocked} onClick={() => removeFile(index)} aria-label={`Pagina ${index + 1} verwijderen`} className="grid size-8 shrink-0 place-items-center rounded-lg text-white/70 hover:bg-white/10 hover:text-white disabled:opacity-40"><Trash2 size={15}/></button>
      </li>)}</ol>
    </div> : null}

    {error && <p role="alert" className="mt-3 rounded-lg bg-red-500/20 p-3 text-sm">{error}</p>}
    {state === "queued" && <p className="mt-3 rounded-lg bg-white/10 p-3 text-sm">Alle pagina&apos;s zijn opgeslagen. De AI verwerkt de pakbon nu op de achtergrond.</p>}
    <button disabled={!files.length || !branchId || state !== "idle"} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-white px-4 py-3 font-medium text-[#173b2b] disabled:opacity-50">{state === "idle" ? (uploadedPages ? "Upload hervatten" : `${files.length > 1 ? "Pagina's" : "Pakbon"} uploaden`) : state === "queued" ? "In wachtrij geplaatst" : <><LoaderCircle className="animate-spin" size={18}/>Pagina {uploadingPage} van {files.length} uploaden…</>}</button>
  </form>;
}
