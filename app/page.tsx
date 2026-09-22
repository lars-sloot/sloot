import Link from "next/link";
import { Camera, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";

const features = [
  { icon: Camera, title: "Fotografeer", text: "Maak op mobiel een foto of upload een pakbon op desktop." },
  { icon: Sparkles, title: "AI leest mee", text: "Leverancier, datum, nummer en artikelregels worden automatisch herkend." },
  { icon: CheckCircle2, title: "Accordeer", text: "Eén bevoegde gebruiker controleert en accordeert of wijst af met reden." },
];

export default function Home() {
  return (
    <main className="min-h-screen bg-[#f5f7f4] text-[#18221b]">
      <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-6">
        <div className="flex items-center gap-3 font-semibold"><span className="grid size-10 place-items-center rounded-xl bg-[#173b2b] text-white">S</span><span>Sloot pakbonnen</span></div>
        <Link className="rounded-xl bg-[#173b2b] px-5 py-3 text-sm font-medium text-white" href="/auth/login">Inloggen</Link>
      </nav>
      <section className="mx-auto grid max-w-6xl gap-12 px-6 pb-16 pt-16 lg:grid-cols-[1.1fr_.9fr] lg:items-center">
        <div>
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-[#dff0e5] px-3 py-1.5 text-sm text-[#245c43]"><ShieldCheck size={16}/> Veilig per filiaal</div>
          <h1 className="max-w-3xl text-5xl font-semibold tracking-[-0.05em] sm:text-6xl">Van papieren pakbon naar controle in één minuut.</h1>
          <p className="mt-6 max-w-2xl text-lg leading-8 text-[#667168]">Sloot pakbonnen verzamelt alle leveringen van Delden, Borne en Tubbergen. Medewerkers controleren de AI-herkenning; beheerders houden overzicht en kunnen handelingen terugdraaien.</p>
          <div className="mt-8 flex flex-wrap gap-3"><Link className="rounded-xl bg-[#173b2b] px-6 py-3.5 font-medium text-white" href="/auth/login">Open dashboard</Link><a className="rounded-xl border border-[#cad2cc] bg-white px-6 py-3.5 font-medium" href="#werking">Bekijk hoe het werkt</a></div>
        </div>
        <div className="rounded-[2rem] bg-[#173b2b] p-4 shadow-2xl shadow-green-950/20"><div className="rounded-[1.35rem] bg-white p-6">
          <p className="text-sm text-[#667168]">Vandaag</p><p className="mt-1 text-3xl font-semibold">12 pakbonnen</p>
          <div className="mt-7 space-y-3">{[['Gazelle','Delden','Te accorderen'],['Cortina / PENDLR','Borne','Verwerkt'],['MBPS','Tubbergen','AI-controle']].map(([name,branch,status]) => <div key={name} className="flex items-center justify-between rounded-xl border border-[#e4e9e5] p-4"><div><p className="font-medium">{name}</p><p className="text-sm text-[#758078]">{branch}</p></div><span className="rounded-full bg-[#e8f4ec] px-3 py-1 text-xs text-[#246044]">{status}</span></div>)}</div>
        </div></div>
      </section>
      <section id="werking" className="mx-auto grid max-w-6xl gap-4 px-6 pb-24 md:grid-cols-3">{features.map(({icon: Icon,title,text}) => <div key={title} className="rounded-2xl border border-[#dde4de] bg-white p-6"><Icon className="text-[#2f7655]"/><h2 className="mt-5 text-xl font-semibold">{title}</h2><p className="mt-2 leading-7 text-[#667168]">{text}</p></div>)}</section>
    </main>
  );
}

