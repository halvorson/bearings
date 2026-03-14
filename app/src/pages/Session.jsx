import { useEffect, useState } from 'react';
import { useSession } from '../hooks/useSession';
import { useItems } from '../hooks/useItems';
import { useDataPoints } from '../hooks/useDataPoints';
import { useTriangulation } from '../hooks/useTriangulation';
import useSessionStore from '../store/useSessionStore';
import { track } from '../lib/analytics';
import MapView from '../components/MapView';
import TrackButton from '../components/TrackButton';
import CaptureOverlay from '../components/CaptureOverlay';
import TriangulationWarning from '../components/TriangulationWarning';
import SessionHeader from '../components/SessionHeader';
import ItemTabs from '../components/ItemTabs';
import ItemSettingsPanel from '../components/ItemSettingsPanel';

export default function Session({ id }) {
  const { session, loading: sessionLoading } = useSession(id);
  const { items } = useItems(id);
  const activeItemId = useSessionStore((s) => s.activeItemId);
  const setActiveItem = useSessionStore((s) => s.setActiveItem);
  const { result } = useTriangulation(id, activeItemId);
  const { dataPoints } = useDataPoints(id, activeItemId);
  const [settingsOpen, setSettingsOpen] = useState(false);

  const activeItem = items.find((i) => i.id === activeItemId) ?? null;

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
      <div className="flex items-center justify-center h-full">
        <p>Loading...</p>
      </div>
    );
  }

  if (!session) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 text-center">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Session Not Found</h1>
        <p className="text-gray-500 mb-4">
          This session doesn&apos;t exist or may have been removed.
        </p>
        <a
          href="/"
          className="text-blue-600 hover:text-blue-700 min-h-[44px] flex items-center"
        >
          Start a New Session
        </a>
      </div>
    );
  }

  return (
    <div className="relative h-full w-full">
      {/* Map takes full screen */}
      <MapView sessionId={id} itemId={activeItemId} />

      {/* Session header + item tabs */}
      <SessionHeader sessionId={id} session={session} />
      <ItemTabs
        sessionId={id}
        session={session}
        items={items}
        activeItemId={activeItemId}
        onSelectItem={setActiveItem}
      />

      {/* Settings gear button — positioned next to item tabs */}
      {activeItem && (
        <button
          onClick={() => setSettingsOpen(true)}
          aria-label="Item settings"
          className="absolute z-10 right-2 flex items-center justify-center w-11 h-11
                     rounded-full text-gray-500 hover:text-gray-900 hover:bg-white/80
                     active:bg-gray-100 transition-colors"
          style={{ top: '52px' }}
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-5 h-5"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        </button>
      )}

      {/* Triangulation warnings — offset below header + tabs */}
      {result && (
        <div style={{ top: '92px' }} className="absolute left-0 right-0 z-10">
          <TriangulationWarning
            insufficientSpread={result.insufficientSpread}
            lowConfidence={result.lowConfidence}
          />
        </div>
      )}

      {/* Track button */}
      <TrackButton sessionId={id} />

      {/* Capture overlay */}
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
