import Link from "next/link";
import { AuthButton } from "@/components/auth-button";
import { Activity, Building2, FileText, LayoutDashboard, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { MobileNavigation } from "@/components/sloot/mobile-navigation";

const userLinks = [
  ["/protected", "Overzicht", LayoutDashboard],
  ["/protected/pakbonnen", "Pakbonnen", FileText],
] as const;

const adminLinks = [
  ["/protected/gebruikers", "Gebruikers", Users],
  ["/protected/filialen", "Filialen", Building2],
  ["/protected/activiteiten", "Activiteiten", Activity],
] as const;

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getClaims();
  const userId = auth?.claims?.sub || "";
  const { data: profile } = await supabase.from("profiles").select("role").eq("id", userId).maybeSingle();
  const isAdmin = profile?.role === "admin";
  const links = isAdmin ? [...userLinks, ...adminLinks] : userLinks;
  const email = typeof auth?.claims?.email === "string" ? auth.claims.email : "";

  return (
    <div className="min-h-screen w-full max-w-full overflow-x-clip bg-[#f5f7f4] text-[#18221b] lg:grid lg:grid-cols-[250px_minmax(0,1fr)]">
      <aside className="hidden border-r border-[#dde4de] bg-[#173b2b] p-5 text-white lg:block lg:min-h-screen">
        <Link href="/protected" className="flex items-center gap-3 text-lg font-semibold"><span className="grid size-10 place-items-center rounded-xl bg-white/15">S</span>Sloot pakbonnen</Link>
        <nav className="mt-10 grid grid-cols-2 gap-2 lg:grid-cols-1">{links.map(([href,label,Icon]) => <Link key={href} href={href} className="flex items-center gap-3 rounded-xl px-3 py-3 text-sm text-white/80 hover:bg-white/10 hover:text-white"><Icon size={18}/>{label}</Link>)}</nav>
      </aside>
      <main className="min-w-0 max-w-full">
        <MobileNavigation isAdmin={isAdmin} email={email}/>
        <header className="hidden items-center justify-between border-b border-[#dde4de] bg-white px-6 py-4 lg:flex"><div><p className="text-sm text-[#718078]">Sloot 2Wielers</p><p className="font-medium">{isAdmin ? "Beheeromgeving" : "Pakbonnenomgeving"}</p></div><AuthButton/></header>
        <div className="mx-auto min-w-0 max-w-7xl p-4 sm:p-6 lg:p-10">{children}</div>
      </main>
    </div>
  );
}
