import { useEffect } from 'react';
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
  const deleteMode = useSessionStore((s) => s.deleteMode);
  const { result } = useTriangulation(id, activeItemId);
  const { dataPoints } = useDataPoints(id, activeItemId);

  const activeItem = items.find((i) => i.id === activeItemId) ?? null;
  const previewMode = useSessionStore((s) => s.previewMode);
  const { lat: gpsLat, lng: gpsLng, accuracy, error: gpsError } = useGeolocation();
  const { bearing, supported: compassSupported, calibrationQuality, permissionState } = useCompass({ lat: gpsLat, lng: gpsLng });

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
      {/* ── Session header ── */}
      <SessionHeader sessionId={id} session={session} />

      {/* ── Item tabs with inline settings ── */}
      <ItemTabs
        sessionId={id}
        session={session}
        items={items}
        activeItemId={activeItemId}
        activeItem={activeItem}
        dataPointCount={dataPoints?.length ?? 0}
        onSelectItem={setActiveItem}
      />

      {/* ── Map card ── */}
      <div className="flex-1 min-h-0 px-3 py-2">
        <div className="relative w-full h-full rounded-xl overflow-hidden ring-1 ring-white/10">
          <MapView
            sessionId={id}
            itemId={activeItemId}
            previewMode={previewMode}
            previewLat={gpsLat}
            previewLng={gpsLng}
            previewBearing={bearing}
          />

          {/* Delete mode banner */}
          {deleteMode && (
            <div className="absolute top-2 left-2 right-2 z-10">
              <div className="rounded-lg bg-red-900/90 backdrop-blur-sm border border-red-500/30
                              px-3 py-2.5 text-red-200 text-xs leading-snug">
                Tap a point to remove it. This cannot be undone.
              </div>
            </div>
          )}

          {/* Triangulation warnings — overlaid inside map card */}
          {result && (
            <div className="absolute bottom-2 left-2 right-2 z-10">
              <TriangulationWarning
                insufficientSpread={result.insufficientSpread}
                lowConfidence={result.lowConfidence}
                dataPointCount={dataPoints?.length ?? 0}
              />
            </div>
          )}
        </div>
      </div>

      {/* ── Instrument row: bearing + GPS ── */}
      <div className="flex-none px-4 py-2">
        <div className="flex items-center justify-between">
          {/* Bearing readout */}
          <div className="flex items-baseline gap-2">
            {compassSupported && permissionState !== 'prompt' ? (
              <>
                <span className="text-3xl font-mono font-bold text-amber-400 tabular-nums tracking-tight leading-none">
                  {displayBearing != null ? `${displayBearing}\u00b0` : '\u2014'}
                </span>
                {displayBearing != null && (
                  <span className="text-sm text-gray-500 font-medium tracking-widest uppercase">
                    {bearingLabel(displayBearing)}
                  </span>
                )}
              </>
            ) : (
              <span className="text-sm text-gray-500">
                {compassSupported ? 'Tap Start Bearing to begin' : 'No compass — manual input'}
              </span>
            )}
          </div>

          {/* GPS status */}
          <GpsStatus accuracy={accuracy} error={gpsError} />
        </div>

        {/* Compass calibration warning */}
        {calibrationQuality === 'poor' && (
          <div className="mt-2">
            <CompassCalibrationWarning />
          </div>
        )}
      </div>

      {/* ── Mark CTA ── */}
      <div className="flex-none px-4" style={{ paddingBottom: 'max(1rem, env(safe-area-inset-bottom))' }}>
        <TrackButton sessionId={id} />
      </div>

      {/* Capture overlay — manual bearing fallback only */}
      <CaptureOverlay sessionId={id} />
    </div>
  );
}
