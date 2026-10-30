/** The AgentShelf mark (a shop shelf inside a chat bubble) with the wordmark. Small-size artwork from public/brand. */
export function LogoMark({ size = 28 }: { size?: number }) {
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden className="shrink-0">
      <rect width="64" height="64" rx="14" fill="#f59e0b" />
      <path
        d="M10 9 h44 a5 5 0 0 1 5 5 v31 a5 5 0 0 1 -5 5 H28 l-11 9 V50 h-7 a5 5 0 0 1 -5 -5 V14 a5 5 0 0 1 5 -5 Z"
        fill="#1c1917"
      />
      <path d="M15.5 43 v-15.5 a3.5 3.5 0 0 1 2.5 -3.4 v-5.1 h5 v5.1 a3.5 3.5 0 0 1 2.5 3.4 V43 Z" fill="#faf7f2" />
      <rect x="30" y="29" width="18" height="14" rx="3.5" fill="#faf7f2" />
      <rect x="11" y="42" width="42" height="4.5" rx="2.25" fill="#f59e0b" />
    </svg>
  );
}

export function Logo({ size = 28 }: { size?: number }) {
  return (
    <span className="inline-flex items-center gap-2 tracking-tight">
      <LogoMark size={size} />
      <span>
        <span className="font-normal">Agent</span>
        <span className="font-bold">Shelf</span>
      </span>
    </span>
  );
}
