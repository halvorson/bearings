import { useEffect, useState } from 'react';
import { useSession } from '../hooks/useSession';
import { useItems } from '../hooks/useItems';
import { useDataPoints } from '../hooks/useDataPoints';
import { useTriangulation } from '../hooks/useTriangulation';
import { useCompass } from '../hooks/useCompass';
import { useGeolocation } from '../hooks/useGeolocation';
import useSessionStore from '../store/useSessionStore';
import { track } from '../lib/analytics';
import MapView from '../components/MapView';
import TrackButton from '../components/TrackButton';
import CaptureOverlay from '../components/CaptureOverlay';
import TriangulationWarning from '../components/TriangulationWarning';
import CompassCalibrationWarning from '../components/CompassCalibrationWarning';
import SessionHeader from '../components/SessionHeader';
import ItemTabs from '../components/ItemTabs';
import GpsStatus from '../components/GpsStatus';
import ItemSettingsPanel from '../components/ItemSettingsPanel';

/**
 * Cardinal/intercardinal direction label for a bearing.
 */
function bearingLabel(deg) {
  const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  return dirs[Math.round(deg / 45) % 8];
}

export default function Session({ id }) {
  const { session, loading: sessionLoading } = useSession(id);
  const { items } = useItems(id);
  const activeItemId = useSessionStore((s) => s.activeItemId);
  const setActiveItem = useSessionStore((s) => s.setActiveItem);
  const { result } = useTriangulation(id, activeItemId);
  const { dataPoints } = useDataPoints(id, activeItemId);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeItem = items.find((i) => i.id === activeItemId) ?? null;
  const { bearing, supported: compassSupported, calibrationQuality, permissionState } = useCompass();
  const { accuracy, error: gpsError } = useGeolocation();

  // Fire session_joined once when session loads
  useEffect(() => {
    if (session) {
      track('session_joined', { session_id: id });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [!!session]);

  // Fire triangulation_computed when result updates
  useEffect(() => {
    if (result?.dataPointCount >= 2) {
      track('triangulation_computed', {
        point_count: result.dataPointCount,
        insufficient_spread: result.insufficientSpread,
      });
    }
  }, [result?.computedAt]);

  // Auto-select latest item when items load
  useEffect(() => {
    if (items.length > 0 && !activeItemId) {
      const latest = items[items.length - 1];
      setActiveItem(latest.id);
    }
  }, [items, activeItemId, setActiveItem]);

  if (sessionLoading) {
    return (
      <div className="flex items-center justify-center h-full bg-gray-950">
        <p className="text-gray-400">Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center bg-gray-950">
        <h1 className="text-xl font-bold text-gray-100 mb-2">Session Not Found</h1>
        <p className="text-gray-400 mb-4">
          This session doesn&apos;t exist or may have been removed.
        </p>
        <a
          href="/"
          className="text-amber-400 hover:text-amber-300 min-h-[44px] flex items-center"
        >
          Start a New Session
        </a>
      </div>
    );
  }

  const displayBearing = bearing != null ? Math.round(bearing) : null;

  return (
    <div className="flex flex-col h-full w-full bg-gray-950">
      {/* ── Map viewport ── */}
      <div className="flex-1 relative min-h-0">
        <MapView sessionId={id} itemId={activeItemId} />

        {/* Triangulation warnings — overlaid on map */}
        {result && (
          <div className="absolute bottom-2 left-0 right-0 z-10">
            <TriangulationWarning
              insufficientSpread={result.insufficientSpread}
              lowConfidence={result.lowConfidence}
            />
          </div>
        )}
      </div>

      {/* ── Instrument panel ── */}
      <div className="flex-none border-t-2 border-amber-500/40">
        {/* Session header + item tabs */}
        <SessionHeader sessionId={id} session={session} />
        <div className="relative">
          <ItemTabs
            sessionId={id}
            session={session}
            items={items}
            activeItemId={activeItemId}
            onSelectItem={setActiveItem}
          />
          {/* Settings gear */}
          {activeItem && (
            <button
              onClick={() => setSettingsOpen(true)}
              aria-label="Item settings"
              className="absolute right-1 top-0 z-10 flex items-center justify-center w-11 h-11
                         rounded-full text-gray-500 hover:text-gray-200 hover:bg-gray-800
                         active:bg-gray-700 transition-colors"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth={2}
                strokeLinecap="round"
                strokeLinejoin="round"
                className="w-4 h-4"
                aria-hidden="true"
              >
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
          )}
        </div>

        {/* Bearing readout + GPS status */}
        <div className="flex flex-col items-center py-4 px-4">
          {compassSupported && permissionState !== 'prompt' ? (
            <>
              <p className="text-6xl font-mono font-bold text-amber-400 tabular-nums tracking-tight leading-none">
                {displayBearing != null ? `${displayBearing}\u00b0` : '\u2014'}
              </p>
              {displayBearing != null && (
                <p className="text-sm text-gray-500 font-medium mt-1 tracking-widest uppercase">
                  {bearingLabel(displayBearing)}
                </p>
              )}
            </>
          ) : (
            <p className="text-lg text-gray-500">
              {compassSupported ? 'Tap Mark to enable compass' : 'No compass — manual input'}
            </p>
          )}

          <div className="mt-3">
            <GpsStatus accuracy={accuracy} error={gpsError} />
          </div>

          {calibrationQuality === 'poor' && (
            <div className="mt-2 w-full max-w-sm">
              <CompassCalibrationWarning />
            </div>
          )}
        </div>

        {/* Mark button */}
        <div className="px-4 pb-4 pb-safe-b">
          <TrackButton sessionId={id} />
        </div>
      </div>

      {/* Capture overlay — manual bearing fallback only */}
      <CaptureOverlay sessionId={id} />

      {/* Item settings panel */}
      {settingsOpen && activeItem && (
        <ItemSettingsPanel
          sessionId={id}
          item={activeItem}
          dataPointCount={dataPoints.length}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}
