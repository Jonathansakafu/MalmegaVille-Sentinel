/**
 * Fixed bezel that draws the whole product inside a single console chassis.
 * Purely decorative: it never intercepts pointer events and hides on small
 * screens where the viewport has no gutter to spare.
 */
function ConsoleFrame() {
  return (
    <div aria-hidden="true" className="console-frame pointer-events-none fixed inset-0 z-[60] hidden overflow-hidden lg:block">
      <div className="absolute inset-0 border border-brand-green/25" />
      <div className="absolute inset-[4px] border border-brand-green/[0.07]" />

      <span className="console-frame-corner left-[3px] top-[3px] border-l-2 border-t-2" />
      <span className="console-frame-corner right-[3px] top-[3px] border-r-2 border-t-2" />
      <span className="console-frame-corner bottom-[3px] left-[3px] border-b-2 border-l-2" />
      <span className="console-frame-corner bottom-[3px] right-[3px] border-b-2 border-r-2" />

      <div className="absolute right-[2px] top-1/2 hidden -translate-y-1/2 flex-col items-end gap-[5px] xl:flex">
        {Array.from({ length: 21 }).map((_, index) => (
          <span
            key={index}
            className={`h-px ${index % 5 === 0 ? 'w-4 bg-brand-green/70' : 'w-2 bg-brand-green/25'}`}
          />
        ))}
      </div>

      <div className="absolute left-[8px] top-1/2 hidden origin-left -rotate-90 whitespace-nowrap font-mono text-[8px] uppercase tracking-[0.5em] text-brand-green/30 xl:block">
        sentinel core · encrypted channel
      </div>

      <div className="console-frame-scan absolute inset-0" />
    </div>
  );
}

export default ConsoleFrame;
