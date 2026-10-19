export function LoadingProgress() {
  return (
    <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-1 overflow-hidden bg-[#dceade]">
      <span className="navigation-progress block h-full w-1/3 bg-[#2f7655]" />
      <span className="sr-only">Pagina wordt geladen…</span>
    </div>
  );
}
