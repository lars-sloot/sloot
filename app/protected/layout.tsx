import Link from "next/link";
import { AuthButton } from "@/components/auth-button";
import { Building2, FileText, LayoutDashboard, Users } from "lucide-react";

const links = [
  ["/protected", "Overzicht", LayoutDashboard],
  ["/protected/pakbonnen", "Pakbonnen", FileText],
  ["/protected/gebruikers", "Gebruikers", Users],
  ["/protected/filialen", "Filialen", Building2],
] as const;

export default function ProtectedLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-[#f5f7f4] text-[#18221b] lg:grid lg:grid-cols-[250px_1fr]">
      <aside className="border-r border-[#dde4de] bg-[#173b2b] p-5 text-white lg:min-h-screen">
        <Link href="/protected" className="flex items-center gap-3 text-lg font-semibold"><span className="grid size-10 place-items-center rounded-xl bg-white/15">S</span>Sloot pakbonnen</Link>
        <nav className="mt-10 grid grid-cols-2 gap-2 lg:grid-cols-1">{links.map(([href,label,Icon]) => <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/80 hover:bg-white/10 hover:text-white"><Icon size={18}/>{label}</Link>)}</nav>
      </aside>
      <main>
        <header className="flex items-center justify-between border-b border-[#dde4de] bg-white px-6 py-4"><div><p className="text-sm text-[#718078]">Sloot 2Wielers</p><p className="font-medium">Beheeromgeving</p></div><AuthButton/></header>
        <div className="mx-auto max-w-7xl p-6 lg:p-10">{children}</div>
      </main>
    </div>
  );
}

