/**
 * Small inline icon set. Inline SVG rather than an icon package so the nav
 * and admin chrome cost nothing extra to load.
 */

type IconProps = { className?: string };

const base = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
};

export function SearchIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="11" cy="11" r="7" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}

/** Chef's hat — the owner/staff marker throughout the site. */
export function ChefHatIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M6 18h12v2a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1v-2Z" />
      <path d="M18 18V13a4 4 0 0 0 .6-7.95A4.5 4.5 0 0 0 12 3.2a4.5 4.5 0 0 0-6.6 1.85A4 4 0 0 0 6 13v5" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <path d="M3 6h18M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2m3 0v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function ClockIcon({ className }: IconProps) {
  return (
    <svg {...base} className={className}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function LiveDotIcon({ className }: IconProps) {
  return (
    <svg viewBox="0 0 8 8" aria-hidden className={className}>
      <circle cx="4" cy="4" r="4" fill="currentColor" />
    </svg>
  );
}
