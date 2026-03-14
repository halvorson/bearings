import { useCompass } from '../hooks/useCompass';
import { useGeolocation } from '../hooks/useGeolocation';
import { useItems } from '../hooks/useItems';
import { useDataPoints } from '../hooks/useDataPoints';
import useSessionStore from '../store/useSessionStore';

/**
 * Floating "Track" button fixed to the bottom of the screen.
 *
 * Props:
 *   sessionId {string}
 */
export default function TrackButton({ sessionId }) {
  const activeItemId = useSessionStore((s) => s.activeItemId);
  const openCapture = useSessionStore((s) => s.openCapture);

  const { supported: compassSupported, permissionState, requestPermission } = useCompass();
  const { error: gpsError } = useGeolocation();
  const { items } = useItems(sessionId);
  const { dataPoints } = useDataPoints(sessionId, activeItemId);

  // Derive active item
  const activeItem = items.find((item) => item.id === activeItemId) ?? null;
  const isLocked = activeItem?.locked ?? false;
  const dataPointCount = dataPoints?.length ?? 0;
  const maxReached = dataPointCount >= 10;

  // Determine disabled state and label
  let disabled = false;
  let label = 'Track';

  if (gpsError) {
    disabled = true;
    label = 'GPS required';
  } else if (isLocked) {
    disabled = true;
    label = 'Locked';
  } else if (maxReached) {
    disabled = true;
    label = 'Max data points reached';
  }

  const handlePress = async () => {
    if (disabled) return;

    // iOS: request compass permission on first tap if still at 'prompt'
    if (compassSupported && permissionState === 'prompt') {
      await requestPermission();
    }

    openCapture();
  };

  return (
    <div className="fixed bottom-4 left-4 right-4 max-w-lg mx-auto z-20">
      <button
        type="button"
        onClick={handlePress}
        disabled={disabled}
        className={`
          w-full rounded-xl min-h-[44px] py-3 px-6
          text-base font-semibold text-white
          shadow-lg transition-colors
          ${disabled
            ? 'bg-gray-400 cursor-not-allowed'
            : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
          }
        `}
      >
        {label}
      </button>
    </div>
  );
}
