import type { CSSProperties } from "react";

export default function UrbanbyteLogo() {
  return (
    <div className="urbanbyte-logo" aria-hidden="true">
      <div className="urbanbyte-logo__canvas">
        <svg
          className="urbanbyte-logo__neural"
          width="360"
          height="210"
          viewBox="0 0 360 210"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <g className="neural-web">
            {[
              "M22 150L66 96L112 150L156 94L204 148L250 96L302 146",
              "M44 60L66 96L110 48L156 86L204 44L248 82L298 52",
              "M60 184L96 124L148 184L196 122L244 176L288 124",
              "M22 150L44 60L90 96L22 150",
              "M302 146L326 82L248 82L302 146",
              "M96 124L66 96L110 48L156 94L196 122L204 148",
              "M248 96L196 122L244 176",
              "M110 48L156 32L204 44L254 30",
              "M44 60L60 24L110 48",
              "M288 124L326 82L352 118"
            ].map((d, index) => (
              <path
                key={index}
                className="neural-web__layer"
                d={d}
                stroke="url(#neuralLine)"
                strokeWidth="0.85"
                strokeLinecap="round"
                style={{ ["--layer-index" as const]: index } as CSSProperties}
              />
            ))}

            {[
              { cx: 22, cy: 150 },
              { cx: 44, cy: 60 },
              { cx: 60, cy: 184 },
              { cx: 60, cy: 24 },
              { cx: 66, cy: 96 },
              { cx: 90, cy: 96 },
              { cx: 96, cy: 124 },
              { cx: 110, cy: 48 },
              { cx: 112, cy: 150 },
              { cx: 148, cy: 184 },
              { cx: 156, cy: 32 },
              { cx: 156, cy: 94 },
              { cx: 156, cy: 186 },
              { cx: 196, cy: 122 },
              { cx: 204, cy: 44 },
              { cx: 204, cy: 148 },
              { cx: 244, cy: 176 },
              { cx: 248, cy: 82 },
              { cx: 250, cy: 96 },
              { cx: 288, cy: 124 },
              { cx: 298, cy: 52 },
              { cx: 302, cy: 146 },
              { cx: 326, cy: 82 },
              { cx: 352, cy: 118 }
            ].map((node, index) => (
              <circle
                key={index}
                cx={node.cx}
                cy={node.cy}
                r={3}
                fill="#29F0D8"
                style={{ ["--node-index" as const]: index } as CSSProperties}
              />
            ))}
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
      </div>

      <div className="urbanbyte-logo__wordmark">
        <span className="urbanbyte-logo__title">URBAN</span>
        <span className="urbanbyte-logo__subtitle">BYTE</span>
      </div>
    </div>
  );
}
