// Simple drawn illustrations so the demo needs no product photos.
export function ProductArt({ id, accent, className = "" }: { id: string; accent: string; className?: string }) {
  return (
    <svg viewBox="0 0 240 160" className={className} role="img" aria-label="">
      <rect width="240" height="160" fill="var(--surface)" />
      {id === "celadon-tea-set" && (
        <g>
          <ellipse cx="120" cy="128" rx="78" ry="8" fill="#00000010" />
          <path d="M88 70 Q120 52 152 70 L148 118 Q120 130 92 118 Z" fill={accent} />
          <path d="M152 80 Q176 82 170 104 Q166 112 150 110" stroke={accent} strokeWidth="6" fill="none" />
          <path d="M88 84 Q66 76 64 62" stroke={accent} strokeWidth="6" fill="none" strokeLinecap="round" />
          <ellipse cx="120" cy="62" rx="20" ry="6" fill={accent} />
          <circle cx="120" cy="54" r="5" fill={accent} />
          <path d="M40 112 Q52 108 64 112 L62 126 Q52 130 42 126 Z" fill={accent} opacity="0.85" />
          <path d="M176 112 Q188 108 200 112 L198 126 Q188 130 178 126 Z" fill={accent} opacity="0.85" />
        </g>
      )}
      {id === "waxed-weekender" && (
        <g>
          <ellipse cx="120" cy="132" rx="84" ry="7" fill="#00000010" />
          <rect x="44" y="66" width="152" height="62" rx="18" fill={accent} />
          <rect x="44" y="108" width="152" height="20" rx="8" fill="#4a3420" />
          <path d="M92 66 Q92 34 120 34 Q148 34 148 66" stroke="#4a3420" strokeWidth="8" fill="none" />
          <rect x="66" y="80" width="10" height="16" rx="2" fill="#c8a24a" />
          <rect x="164" y="80" width="10" height="16" rx="2" fill="#c8a24a" />
        </g>
      )}
      {id === "jute-espadrilles" && (
        <g>
          <ellipse cx="120" cy="132" rx="86" ry="6" fill="#00000010" />
          <path d="M40 112 Q44 84 74 80 Q100 76 116 96 L118 116 Z" fill={accent} />
          <rect x="36" y="112" width="84" height="14" rx="7" fill="#c9a66b" />
          <path d="M40 119 H118" stroke="#a9874d" strokeWidth="2" strokeDasharray="3 3" />
          <path d="M122 106 Q128 78 158 74 Q184 70 200 90 L202 110 Z" fill={accent} opacity="0.9" />
          <rect x="120" y="106" width="86" height="14" rx="7" fill="#c9a66b" />
          <path d="M124 113 H202" stroke="#a9874d" strokeWidth="2" strokeDasharray="3 3" />
          <rect x="120" y="118" width="86" height="3" rx="1.5" fill="#3b3b3b" />
        </g>
      )}
      {id === "brass-candle-holder" && (
        <g>
          <ellipse cx="120" cy="134" rx="46" ry="6" fill="#00000010" />
          <ellipse cx="120" cy="126" rx="38" ry="9" fill={accent} />
          <rect x="112" y="64" width="16" height="62" rx="5" fill={accent} />
          <ellipse cx="120" cy="64" rx="18" ry="5" fill={accent} />
          <rect x="114" y="22" width="12" height="42" rx="3" fill="#f3efe6" />
          <path d="M120 8 Q127 16 120 22 Q113 16 120 8" fill="#e8a33c" />
        </g>
      )}
    </svg>
  );
}
