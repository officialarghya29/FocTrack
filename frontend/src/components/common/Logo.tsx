interface LogoMarkProps {
  size?: number;
  className?: string;
}

/**
 * FocTrack mark: a focus target whose outer ring is broken into a tracking
 * arc, with a clock hand sweeping through the centre.
 */
export function LogoMark({ size = 30, className = "" }: LogoMarkProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      role="img"
      aria-label="FocTrack mark"
      className={className}
    >
      <circle cx="16" cy="16" r="13.25" stroke="currentColor" strokeWidth="1.25" opacity="0.35" />
      <path
        d="M16 2.75a13.25 13.25 0 0 1 13.25 13.25"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      <path
        d="M16 29.25A13.25 13.25 0 0 1 2.75 16"
        stroke="var(--accent)"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="16" cy="16" r="6.25" stroke="currentColor" strokeWidth="1" opacity="0.5" />
      <path d="M16 16V7.5" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" />
      <path d="M16 16l5.2 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="16" cy="16" r="1.9" fill="var(--accent)" />
    </svg>
  );
}

export function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="flex items-center gap-2.5">
      <LogoMark size={compact ? 24 : 28} className="text-ink" />
      <span className="flex flex-col leading-none">
        <span className="font-display text-[17px] font-semibold tracking-[-0.02em]">
          Foc<span className="text-accent">Track</span>
        </span>
        {!compact && (
          <span className="mt-1 font-mono text-[9px] uppercase tracking-micro text-muted">
            Focus analytics
          </span>
        )}
      </span>
    </span>
  );
}
