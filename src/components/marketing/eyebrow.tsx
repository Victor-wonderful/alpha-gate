export function Eyebrow({ children }: { children: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[0.24em] text-primary">
      <span className="inline-block h-px w-8 bg-primary" />
      {children}
    </div>
  );
}
