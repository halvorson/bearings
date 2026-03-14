import { useState } from 'react';

function Banner({ message, onDismiss }) {
  return (
    <div
      role="alert"
      className="flex items-start gap-3 rounded-lg bg-amber-50 px-4 py-3 shadow-md text-amber-800 text-sm"
    >
      <span className="flex-1 leading-snug">{message}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label="Dismiss warning"
        className="ml-1 flex-shrink-0 rounded p-0.5 hover:bg-amber-100 focus:outline-none focus:ring-2 focus:ring-amber-400 min-w-[44px] min-h-[44px] flex items-center justify-center"
      >
        {/* Simple × glyph — no emoji */}
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
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
 *
 * Props:
 *   insufficientSpread {boolean} — all bearings are too similar
 *   lowConfidence      {boolean} — estimated point is far from observer centroid
 *
 * Each banner is independently dismissible via local state. Banners re-appear
 * if the parent re-mounts (e.g. when the user switches items).
 */
export default function TriangulationWarning({ insufficientSpread, lowConfidence }) {
  const [spreadDismissed, setSpreadDismissed] = useState(false);
  const [confidenceDismissed, setConfidenceDismissed] = useState(false);

  const showSpread = insufficientSpread && !spreadDismissed;
  const showConfidence = lowConfidence && !confidenceDismissed;

  if (!showSpread && !showConfidence) return null;

  return (
    <div className="px-3 pt-2 flex flex-col gap-2 pointer-events-none">
      {showSpread && (
        <div className="pointer-events-auto">
          <Banner
            message="Bearings are too similar. Add points from different directions for a better result."
            onDismiss={() => setSpreadDismissed(true)}
          />
        </div>
      )}
      {showConfidence && (
        <div className="pointer-events-auto">
          <Banner
            message="Result may be inaccurate. Try adding points from different angles, or delete a point that seems off."
            onDismiss={() => setConfidenceDismissed(true)}
          />
        </div>
      )}
    </div>
  );
}
