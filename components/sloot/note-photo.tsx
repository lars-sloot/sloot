"use client";

import Image from "next/image";
import { ExternalLink, FileText, Maximize2, X } from "lucide-react";
import { useEffect, useState } from "react";

type NotePage = {
  id: string;
  pageNumber: number;
  storagePath: string;
  mimeType: string;
  url: string | null;
};

type NotePhotoProps = {
  pages: NotePage[];
  alt: string;
  deleted: boolean;
};

function isPreviewableImage(page: NotePage) {
  return ["image/jpeg", "image/png", "image/webp"].includes(page.mimeType)
    || /\.(jpe?g|png|webp)$/i.test(page.storagePath);
}

export function NotePhoto({ pages, alt, deleted }: NotePhotoProps) {
  const [open, setOpen] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const selectedPage = pages[Math.min(selectedIndex, Math.max(0, pages.length - 1))];

  useEffect(() => {
    setSelectedIndex(0);
    setOpen(false);
  }, [pages.length]);

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
        <div><FileText className="mx-auto mb-3" size={28}/><p>De foto&apos;s zijn verwijderd.</p></div>
      </div>
    );
  }

  if (!selectedPage) {
    return (
      <div className="grid aspect-[3/4] place-items-center rounded-2xl border border-dashed border-[#d6ddd7] bg-[#f7f8f6] p-6 text-center text-sm text-[#718078]">
        <div><FileText className="mx-auto mb-3" size={28}/><p>De pagina&apos;s konden niet worden geladen.</p></div>
      </div>
    );
  }

  const canPreview = isPreviewableImage(selectedPage);

  return (
    <div>
      {!selectedPage.url ? (
        <div className="grid aspect-[3/4] place-items-center rounded-2xl border border-dashed border-[#d6ddd7] bg-[#f7f8f6] p-6 text-center text-sm text-[#718078]">
          <div><FileText className="mx-auto mb-3" size={28}/><p>Pagina {selectedPage.pageNumber} kon niet worden geladen.</p></div>
        </div>
      ) : canPreview ? (
        <button type="button" onClick={() => setOpen(true)} className="group relative block aspect-[3/4] w-full overflow-hidden rounded-2xl border border-[#d6ddd7] bg-[#eef1ed] text-left" aria-label={`Pagina ${selectedPage.pageNumber} van pakbon vergroten`}>
          <Image src={selectedPage.url} alt={`${alt}, pagina ${selectedPage.pageNumber}`} fill sizes="(max-width: 768px) 100vw, 620px" className="object-contain transition duration-200 group-hover:scale-[1.01]"/>
          <span className="absolute bottom-3 right-3 flex items-center gap-2 rounded-lg bg-black/70 px-3 py-2 text-xs font-medium text-white"><Maximize2 size={14}/>Vergroten</span>
        </button>
      ) : (
        <a href={selectedPage.url} target="_blank" rel="noreferrer" className="grid aspect-[3/4] place-items-center rounded-2xl border border-[#d6ddd7] bg-[#f7f8f6] p-6 text-center text-sm font-medium text-[#173b2b] hover:bg-[#eef2ee]">
          <span><FileText className="mx-auto mb-3" size={30}/><span className="flex items-center gap-2">Pagina {selectedPage.pageNumber} openen <ExternalLink size={15}/></span></span>
        </a>
      )}

      {pages.length > 1 && (
        <div className="mt-3 flex gap-2 overflow-x-auto pb-1" aria-label="Pagina kiezen">
          {pages.map((page, index) => <button key={page.id} type="button" onClick={() => setSelectedIndex(index)} aria-current={index === selectedIndex ? "page" : undefined} className={`shrink-0 rounded-lg border px-3 py-2 text-xs font-medium transition ${index === selectedIndex ? "border-[#173b2b] bg-[#173b2b] text-white" : "border-[#d6ddd7] bg-white text-[#526057] hover:bg-[#f2f5f2]"}`}>Pagina {page.pageNumber}</button>)}
        </div>
      )}

      {open && selectedPage.url && canPreview && (
        <div role="dialog" aria-modal="true" aria-label={`Vergrote pagina ${selectedPage.pageNumber} van pakbon`} className="fixed inset-0 z-[70] grid place-items-center bg-black/85 p-4 md:p-8" onClick={() => setOpen(false)}>
          <button type="button" onClick={() => setOpen(false)} className="absolute right-4 top-4 z-10 grid size-11 place-items-center rounded-full bg-white text-[#18221b] shadow-lg" aria-label="Foto sluiten"><X size={22}/></button>
          <div className="relative h-full w-full max-w-6xl" onClick={(event) => event.stopPropagation()}>
            <Image src={selectedPage.url} alt={`${alt}, pagina ${selectedPage.pageNumber}`} fill sizes="100vw" className="object-contain" priority/>
          </div>
        </div>
      )}
    </div>
  );
}
