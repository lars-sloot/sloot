import { LoadingProgress } from "@/components/loading-progress";

export default function Loading() {
  return (
    <div aria-busy="true">
      <LoadingProgress />
      <p className="text-sm text-[#667168]">Pagina wordt geladen…</p>
      <div aria-hidden="true" className="mt-6 space-y-6 motion-safe:animate-pulse">
        <div className="h-9 w-48 rounded-lg bg-[#dce4dd]" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[0, 1, 2, 3].map((item) => <div key={item} className="h-28 rounded-2xl border border-[#dde4de] bg-white" />)}
        </div>
        <div className="h-64 rounded-2xl border border-[#dde4de] bg-white" />
      </div>
    </div>
  );
}
