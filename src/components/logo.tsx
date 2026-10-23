// The mark: a record seen from above whose grooves break into a lyric line.
// Amber is the playhead, coral the part already sung.
export function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true" className="logo">
      <defs>
        <linearGradient id="lg-a" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="oklch(0.86 0.15 80)" />
          <stop offset="1" stopColor="oklch(0.68 0.19 35)" />
        </linearGradient>
      </defs>
      <circle cx="16" cy="16" r="15" fill="url(#lg-a)" />
      <circle cx="16" cy="16" r="10.5" fill="none" stroke="oklch(0.2 0.03 50)" strokeOpacity="0.35" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="6.5" fill="none" stroke="oklch(0.2 0.03 50)" strokeOpacity="0.35" strokeWidth="1.2" />
      <rect x="15" y="15" width="17" height="4.2" rx="2.1" fill="oklch(0.17 0.01 60)" />
      <rect x="18" y="16.3" width="7" height="1.6" rx="0.8" fill="oklch(0.95 0.02 80)" />
      <rect x="26.5" y="16.3" width="3" height="1.6" rx="0.8" fill="oklch(0.95 0.02 80)" fillOpacity="0.45" />
      <circle cx="16" cy="16" r="2.2" fill="oklch(0.17 0.01 60)" />
    </svg>
  );
}
