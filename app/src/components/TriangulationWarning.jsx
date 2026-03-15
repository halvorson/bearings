import { useState } from 'react';

function Banner({ message, onDismiss }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-2 rounded-lg bg-gray-900/90 backdrop-blur-sm
                 border border-amber-500/20 px-3 py-2.5 text-amber-300 text-xs"
    >
      <span className="flex-1 leading-snug">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss warning"
        className="ml-1 flex-shrink-0 rounded p-0.5 hover:bg-white/10
                   focus:outline-none min-w-[44px] min-h-[44px]
                   flex items-center justify-center"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-3.5 h-3.5"
          aria-hidden="true"
        >
          <path d="M6.28 5.22a.75.75 0 0 0-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 1 0 1.06 1.06L10 11.06l3.72 3.72a.75.75 0 1 0 1.06-1.06L11.06 10l3.72-3.72a.75.75 0 0 0-1.06-1.06L10 8.94 6.28 5.22Z" />
        </svg>
      </button>
    </div>
  );
}

/**
 * Dismissible warning banners for triangulation quality issues.
 * Dark themed to sit inside the map card.
 */
export default function TriangulationWarning({ insufficientSpread, lowConfidence, dataPointCount = 0 }) {
  const [spreadDismissed, setSpreadDismissed] = useState(false);
  const [confidenceDismissed, setConfidenceDismissed] = useState(false);

  const showSpread = insufficientSpread && !spreadDismissed;
  const showConfidence = lowConfidence && !confidenceDismissed;

  if (!showSpread && !showConfidence) return null;

  return (
    <div className="flex flex-col gap-2 pointer-events-none">
      {showSpread && (
        <div className="pointer-events-auto">
          <Banner
            message={
              dataPointCount >= 3
                ? "Bearings are too similar. Tap a point on the map to remove a conflicting reading."
                : "Bearings are too similar to triangulate. Try marking from a different angle."
            }
            onDismiss={() => setSpreadDismissed(true)}
          />
        </div>
      )}
      {showConfidence && (
        <div className="pointer-events-auto">
          <Banner
            message="Location estimate may be far off. Tap a point on the map to remove a bad reading, or create a new item if the target has moved."
            onDismiss={() => setConfidenceDismissed(true)}
          />
        </div>
      )}
    </div>
  );
}
