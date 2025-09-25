export default function UrbanbyteLogo() {
  return (
    <div className="urbanbyte-logo" aria-hidden="true">
      <svg
        className="urbanbyte-logo__neural"
        width="320"
        height="190"
        viewBox="0 0 320 190"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <g className="neural-web">
          <path
            className="neural-web__layer"
            d="M22 130L68 76L108 126L148 74L196 120L244 70L296 118"
            stroke="url(#neuralLine)"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <path
            className="neural-web__layer"
            d="M40 54L72 82L110 40L156 68L204 36L248 66L288 38"
            stroke="url(#neuralLine)"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <path
            className="neural-web__layer"
            d="M48 166L92 102L144 166L188 106L232 154L272 102"
            stroke="url(#neuralLine)"
            strokeWidth="0.8"
            strokeLinecap="round"
          />
          <circle cx="68" cy="76" r="3" fill="#29F0D8" />
          <circle cx="110" cy="40" r="3" fill="#29F0D8" />
          <circle cx="156" cy="68" r="3" fill="#29F0D8" />
          <circle cx="196" cy="120" r="3" fill="#29F0D8" />
          <circle cx="232" cy="154" r="3" fill="#29F0D8" />
          <circle cx="288" cy="38" r="3" fill="#29F0D8" />
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
