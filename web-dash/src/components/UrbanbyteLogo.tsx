export default function UrbanbyteLogo() {
  return (
    <div className="urbanbyte-logo" aria-hidden="true">
      <svg
        width="120"
        height="120"
        viewBox="0 0 120 120"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="14" y="10" width="36" height="36" rx="10" fill="#0B1B45" />
        <rect x="44" y="22" width="40" height="40" rx="12" fill="url(#grad-teal)" />
        <rect x="70" y="10" width="36" height="36" rx="10" fill="#5BE38F" />
        <rect x="22" y="64" width="40" height="40" rx="12" fill="#3CD9FF" />
        <defs>
          <linearGradient id="grad-teal" x1="44" y1="22" x2="84" y2="62" gradientUnits="userSpaceOnUse">
            <stop stopColor="#2CE4CB" />
            <stop offset="1" stopColor="#14B8FF" />
          </linearGradient>
        </defs>
      </svg>
      <div className="urbanbyte-logo__wordmark">
        <span className="urbanbyte-logo__title">URBAN</span>
        <span className="urbanbyte-logo__subtitle">BYTE</span>
      </div>
    </div>
  );
}
