/**
 * SVG rotating compass rose that visualises the current bearing.
 *
 * Props:
 *   bearing {number|null} — degrees clockwise from north (0–360)
 */
export default function CompassRose({ bearing }) {
  const displayBearing = bearing != null ? Math.round(bearing) : null;

  return (
    <div className="flex flex-col items-center gap-3">
      <div className="relative w-[200px] h-[200px]">
        {/* Outer ring */}
        <svg
          width="200"
          height="200"
          viewBox="0 0 200 200"
          aria-label={
            displayBearing != null
              ? `Compass bearing: ${displayBearing} degrees`
              : 'Compass — waiting for reading'
          }
          role="img"
        >
          {/* Background circle */}
          <circle
            cx="100"
            cy="100"
            r="96"
            fill="#1f2937"
            stroke="#374151"
            strokeWidth="2"
          />

          {/* Cardinal tick marks */}
          {[0, 90, 180, 270].map((deg) => {
            const rad = (deg - 90) * (Math.PI / 180);
            const x1 = 100 + 80 * Math.cos(rad);
            const y1 = 100 + 80 * Math.sin(rad);
            const x2 = 100 + 92 * Math.cos(rad);
            const y2 = 100 + 92 * Math.sin(rad);
            return (
              <line
                key={deg}
                x1={x1}
                y1={y1}
                x2={x2}
                y2={y2}
                stroke="#6b7280"
                strokeWidth="2"
              />
            );
          })}

          {/* Cardinal labels */}
          {[
            { label: 'N', deg: 0 },
            { label: 'E', deg: 90 },
            { label: 'S', deg: 180 },
            { label: 'W', deg: 270 },
          ].map(({ label, deg }) => {
            const rad = (deg - 90) * (Math.PI / 180);
            const x = 100 + 68 * Math.cos(rad);
            const y = 100 + 68 * Math.sin(rad);
            return (
              <text
                key={label}
                x={x}
                y={y}
                textAnchor="middle"
                dominantBaseline="central"
                fill={label === 'N' ? '#ef4444' : '#9ca3af'}
                fontSize="14"
                fontWeight="bold"
                fontFamily="sans-serif"
              >
                {label}
              </text>
            );
          })}

          {/* Rotating needle group */}
          <g
            transform={`rotate(${displayBearing ?? 0}, 100, 100)`}
            style={{ transition: 'transform 0.15s ease-out' }}
          >
            {/* North (red) arrowhead */}
            <polygon
              points="100,24 107,100 93,100"
              fill="#ef4444"
            />
            {/* South (white) arrowhead */}
            <polygon
              points="100,176 107,100 93,100"
              fill="#ffffff"
              opacity="0.7"
            />
            {/* Centre pivot dot */}
            <circle cx="100" cy="100" r="5" fill="#d1d5db" />
          </g>
        </svg>
      </div>

      {/* Bearing readout */}
      <p className="text-3xl font-bold text-white tabular-nums">
        {displayBearing != null ? `${displayBearing}\u00b0` : '--'}
      </p>
    </div>
  );
}
