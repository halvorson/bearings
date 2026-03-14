/**
 * Compact GPS accuracy indicator for the top bar of the capture overlay.
 *
 * Props:
 *   accuracy {number|null} — GPS accuracy in metres
 *   error    {string|null} — error message if GPS is unavailable
 */
export default function GpsStatus({ accuracy, error }) {
  if (error) {
    return (
      <div className="flex items-center gap-2 text-sm text-red-300">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full bg-red-500 flex-shrink-0"
          aria-hidden="true"
        />
        <span className="truncate">{error}</span>
      </div>
    );
  }

  if (accuracy == null) {
    return (
      <div className="flex items-center gap-2 text-sm text-gray-400">
        <span
          className="inline-block w-2.5 h-2.5 rounded-full bg-gray-500 flex-shrink-0"
          aria-hidden="true"
        />
        <span>Acquiring GPS…</span>
      </div>
    );
  }

  let dotColor;
  if (accuracy < 10) {
    dotColor = 'bg-green-500';
  } else if (accuracy < 20) {
    dotColor = 'bg-amber-500';
  } else {
    dotColor = 'bg-red-500';
  }

  return (
    <div className="flex items-center gap-2 text-sm text-gray-200">
      <span
        className={`inline-block w-2.5 h-2.5 rounded-full flex-shrink-0 ${dotColor}`}
        aria-hidden="true"
      />
      <span>GPS: &plusmn;{Math.round(accuracy)}m</span>
    </div>
  );
}
