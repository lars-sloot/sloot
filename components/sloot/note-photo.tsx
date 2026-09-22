"use client";

import Image from "next/image";
import { ExternalLink, FileText, Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";

type NotePhotoProps = {
  url: string | null;
  photoPath: string;
  alt: string;
  deleted: boolean;
};

export function NotePhoto({ url, photoPath, alt, deleted }: NotePhotoProps) {
  const [open, setOpen] = useState(false);
  const canPreview = /\.(jpe?g|png|webp)$/i.test(photoPath);

  useEffect(() => {
    if (!open) return;
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [open]);

  if (deleted) {
    return (
      <div className="grid aspect-[3/4] place-items-center rounded-2xl border border-dashed border-[#d6ddd7] bg-[#f7f8f6] p-6 text-center text-sm text-[#718078]">
        <div><FileText className="mx-auto mb-3" size={28}/><p>De foto is verwijderd.</p></div>
      </div>
    );
  }

  if (!url) {
    return (
      <div className="grid aspect-[3/4] place-items-center rounded-2xl border border-dashed border-[#d6ddd7] bg-[#f7f8f6] p-6 text-center text-sm text-[#718078]">
        <div><FileText className="mx-auto mb-3" size={28}/><p>De foto kon niet worden geladen.</p></div>
      </div>
    );
  }

  if (!canPreview) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="grid aspect-[3/4] place-items-center rounded-2xl border border-[#d6ddd7] bg-[#f7f8f6] p-6 text-center text-sm font-medium text-[#173b2b] hover:bg-[#eef2ee]">
        <span><FileText className="mx-auto mb-3" size={30}/><span className="flex items-center gap-2">Bestand openen <ExternalLink size={15}/></span></span>
      </a>
    );
  }

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl border border-[#d6ddd7] bg-[#eef1ed] text-left" aria-label="Foto van pakbon vergroten">
        <Image src={url} alt={alt} fill sizes="(max-width: 768px) 100vw, 280px" className="object-cover transition duration-200 group-hover:scale-[1.02]"/>
        <span className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-xs font-medium text-white"><Maximize2 size={14}/>Vergroten</span>
      </button>

      {open && (
        <div role="dialog" aria-modal="true" aria-label="Vergrote foto van pakbon" className="fixed inset-0 z-50 grid place-items-center bg-black/85 p-4 md:p-8" onClick={() => setOpen(false)}>
          <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-white text-[#18221b] shadow-lg" aria-label="Foto sluiten"><X size={22}/></button>
          <div className="relative h-full w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
            <Image src={url} alt={alt} fill sizes="100vw" className="object-contain" priority/>
          </div>
        </div>
      )}
    </>
  );
}
