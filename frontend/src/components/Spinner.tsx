function Spinner({ label }: { label?: string }) {
  return (
    <div className="flex items-center gap-3 text-sm text-slate-400">
      <span className="h-4 w-4 animate-spin rounded-full border-2 border-slate-700 border-t-brand-green" />
      {label ? <span>{label}</span> : null}
    </div>
  );
}

export default Spinner;
