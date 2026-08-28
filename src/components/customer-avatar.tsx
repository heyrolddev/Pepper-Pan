export function CustomerAvatar({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 200 200"
      className={className}
      role="img"
      aria-label="Illustrated portrait of a happy Pepper Pan customer"
    >
      <circle cx="100" cy="100" r="96" fill="var(--color-gold-300)" />
      <circle cx="150" cy="46" r="14" fill="var(--color-brand-600)" />
      <circle cx="34" cy="140" r="8" fill="var(--color-brand-600)" />

      {/* head */}
      <ellipse cx="100" cy="92" rx="46" ry="50" fill="#3a2416" />
      {/* face */}
      <ellipse cx="100" cy="104" rx="34" ry="38" fill="#f2c199" />
      {/* hair */}
      <path
        d="M56 92c0-30 20-52 44-52s44 22 44 52c0-10-8-18-10-8-4-16-16-24-34-24s-30 8-34 24c-2-10-10-2-10 8Z"
        fill="#241408"
      />
      {/* eyes */}
      <circle cx="86" cy="100" r="4.5" fill="#241408" />
      <circle cx="114" cy="100" r="4.5" fill="#241408" />
      {/* blush */}
      <circle cx="78" cy="114" r="6" fill="var(--color-brand-300)" opacity="0.6" />
      <circle cx="122" cy="114" r="6" fill="var(--color-brand-300)" opacity="0.6" />
      {/* big happy smile */}
      <path
        d="M80 116c6 12 34 12 40 0"
        stroke="#241408"
        strokeWidth="5"
        strokeLinecap="round"
        fill="none"
      />

      {/* bowl of noodles under chin, because of course */}
      <path d="M62 156c0 16 17 26 38 26s38-10 38-26Z" fill="var(--color-brand-600)" />
      <ellipse cx="100" cy="156" rx="38" ry="10" fill="#fff" />
      <path
        d="M76 152q6 -8 12 0t12 0t12 0t12 0"
        stroke="var(--color-gold-500)"
        strokeWidth="4"
        strokeLinecap="round"
        fill="none"
      />
    </svg>
  );
}
