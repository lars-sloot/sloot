"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Activity, Building2, FileText, LayoutDashboard, Menu, Users, X } from "lucide-react";
import { LogoutButton } from "@/components/logout-button";

const userLinks = [
  ["/protected", "Overzicht", LayoutDashboard],
  ["/protected/pakbonnen", "Pakbonnen", FileText],
] as const;

const adminLinks = [
  ["/protected/gebruikers", "Gebruikers", Users],
  ["/protected/filialen", "Filialen", Building2],
  ["/protected/activiteiten", "Activiteiten", Activity],
] as const;

export function MobileNavigation({ isAdmin, email }: { isAdmin: boolean; email: string }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const links = isAdmin ? [...userLinks, ...adminLinks] : userLinks;

  useEffect(() => setOpen(false), [pathname]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, [open]);

  return <>
    <header className="flex items-center justify-between border-b border-[#dde4de] bg-[#173b2b] px-4 py-3 text-white lg:hidden">
      <Link href="/protected" className="flex min-w-0 items-center gap-3 font-semibold"><span className="grid size-9 shrink-0 place-items-center rounded-xl bg-white/15">S</span><span className="truncate">Sloot pakbonnen</span></Link>
      <button type="button" onClick={() => setOpen(true)} aria-label="Menu openen" aria-expanded={open} className="grid size-11 shrink-0 place-items-center rounded-xl border border-white/20 bg-white/10"><Menu size={22}/></button>
    </header>

    {open ? <div className="fixed inset-0 z-[70] lg:hidden">
      <button type="button" aria-label="Menu sluiten" onClick={() => setOpen(false)} className="absolute inset-0 bg-[#102a20]/45 backdrop-blur-[1px]"/>
      <aside role="dialog" aria-modal="true" aria-label="Hoofdmenu" className="absolute inset-y-0 left-0 flex w-[min(86vw,340px)] max-w-full flex-col bg-[#173b2b] px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1.25rem,env(safe-area-inset-top))] text-white shadow-2xl">
        <div className="flex items-center justify-between gap-3"><Link href="/protected" className="flex min-w-0 items-center gap-3 text-lg font-semibold"><span className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/15">S</span><span className="truncate">Sloot pakbonnen</span></Link><button type="button" onClick={() => setOpen(false)} aria-label="Menu sluiten" className="grid size-10 shrink-0 place-items-center rounded-full border border-white/20"><X size={20}/></button></div>
        <nav className="mt-8 grid gap-2">{links.map(([href, label, Icon]) => {
          const active = href === "/protected" ? pathname === href : pathname.startsWith(href);
          return <Link key={href} href={href} className={`flex items-center gap-3 rounded-xl px-4 py-3.5 text-sm font-medium ${active ? "bg-white text-[#173b2b]" : "text-white/80 hover:bg-white/10 hover:text-white"}`}><Icon size={19}/>{label}</Link>;
        })}</nav>
        <div className="mt-auto border-t border-white/15 pt-5"><p className="text-xs uppercase tracking-[0.14em] text-white/55">Ingelogd als</p><p className="mt-1 break-all text-sm">{email}</p><div className="mt-4 [&_button]:w-full [&_button]:bg-white [&_button]:text-[#173b2b]"> <LogoutButton/></div></div>
      </aside>
    </div> : null}
  </>;
}
