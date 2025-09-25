export default function UrbanbyteLogo() {
  return (
    <div className="urbanbyte-logo" aria-hidden="true">
      <svg
        className="urbanbyte-logo__neural"
        width="260"
        height="170"
        viewBox="0 0 260 170"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="neural-web">
          <path
            d="M25 105L60 70L95 108L130 62L168 102L210 60L240 98M32 60L60 70L90 42L130 62L160 34L190 56L218 30"
            stroke="url(#neuralLine)"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <path
            d="M40 142L72 92L114 144L152 88L190 130L222 90"
            stroke="url(#neuralLine)"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <circle cx="60" cy="70" r="3" fill="#29F0D8" />
          <circle cx="90" cy="42" r="3" fill="#29F0D8" />
          <circle cx="130" cy="62" r="3" fill="#29F0D8" />
          <circle cx="168" cy="102" r="3" fill="#29F0D8" />
          <circle cx="190" cy="130" r="3" fill="#29F0D8" />
          <circle cx="218" cy="30" r="3" fill="#29F0D8" />
        </g>

        <g transform="translate(70,32)">
          <rect x="0" y="0" width="48" height="48" rx="12" fill="#0B1B45" />
          <rect x="24" y="14" width="52" height="52" rx="16" fill="url(#grad-teal)" />
          <rect x="56" y="0" width="48" height="48" rx="12" fill="#5BE38F" />
          <rect x="14" y="56" width="52" height="52" rx="16" fill="#3CD9FF" />
        </g>

        <defs>
          <linearGradient id="grad-teal" x1="24" y1="14" x2="76" y2="66" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2CE4CB" />
            <stop offset="1" stopColor="#14B8FF" />
          </linearGradient>
          <radialGradient id="neuralLine" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(130 90) rotate(90) scale(130)">
            <stop stopColor="rgba(64, 248, 198, 0.9)" />
            <stop offset="1" stopColor="rgba(64, 248, 198, 0.2)" />
          </radialGradient>
        </defs>
      </svg>

      <div className="urbanbyte-logo__wordmark">
        <span className="urbanbyte-logo__title">URBAN</span>
        <span className="urbanbyte-logo__subtitle">BYTE</span>
      </div>
    </div>
  );
}
