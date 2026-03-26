import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { track } from '../lib/analytics';
import { useCompass } from '../hooks/useCompass';
import { useGeolocation } from '../hooks/useGeolocation';
import { useItems } from '../hooks/useItems';
import { useDataPoints } from '../hooks/useDataPoints';
import useSessionStore from '../store/useSessionStore';

/**
 * Two-step bearing CTA: "Start Bearing" → "Save Bearing".
 * Shows live GPS + compass preview on the map before saving.
 *
 * Props:
 *   sessionId {string}
 */
export default function TrackButton({ sessionId }) {
  const activeItemId = useSessionStore((s) => s.activeItemId);
  const participantToken = useSessionStore((s) => s.participantToken);
  const openCapture = useSessionStore((s) => s.openCapture);
  const previewMode = useSessionStore((s) => s.previewMode);
  const startPreview = useSessionStore((s) => s.startPreview);
  const stopPreview = useSessionStore((s) => s.stopPreview);

  const { bearing, supported: compassSupported, permissionState, requestPermission } = useCompass();
  const { lat, lng, accuracy } = useGeolocation();
  const { items } = useItems(sessionId);
  const { dataPoints } = useDataPoints(sessionId, activeItemId);

  const [saving, setSaving] = useState(false);

  // Derive active item
  const activeItem = items.find((item) => item.id === activeItemId) ?? null;
  const isLocked = activeItem?.locked ?? false;
  const dataPointCount = dataPoints?.length ?? 0;
  const maxReached = dataPointCount >= 10;

  // Determine disabled state and label
  let disabled = false;
  let label = 'Start Bearing';
  let buttonStyle = 'bg-amber-500 text-gray-950 hover:bg-amber-400 active:bg-amber-600 shadow-amber-500/25';

  if (saving) {
    disabled = true;
    label = 'Saving\u2026';
    buttonStyle = 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none';
  } else if (isLocked) {
    disabled = true;
    label = 'Locked';
    buttonStyle = 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none';
  } else if (maxReached) {
    disabled = true;
    label = 'Max points reached';
    buttonStyle = 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none';
  } else if (previewMode) {
    label = 'Save Bearing';
    buttonStyle = 'bg-green-500 text-gray-950 hover:bg-green-400 active:bg-green-600 shadow-green-500/25';
  }

  const handlePress = async () => {
    if (disabled) return;

    // iOS: request compass permission on first tap, then continue into preview
    if (compassSupported && permissionState === 'prompt') {
      await requestPermission();
      // After permission is granted, fall through to start preview.
      // If denied, compassSupported stays true but bearing will be null —
      // the user can still cancel or retry.
    }

    // If compass is not supported, fall back to manual bearing overlay
    if (!compassSupported) {
      openCapture();
      return;
    }

    // Not yet previewing → enter preview mode
    if (!previewMode) {
      if (lat == null || lng == null) return;
      startPreview();
      return;
    }

    // Previewing → save the bearing
    if (lat == null || lng == null) return;
    if (bearing == null) return;

    setSaving(true);
    try {
      await addDoc(
        collection(db, 'sessions', sessionId, 'items', activeItemId, 'dataPoints'),
        {
          participantToken,
          lat,
          lng,
          bearing,
          accuracy: accuracy ?? null,
          timestamp: serverTimestamp(),
        },
      );
      track('data_point_recorded', { sessionId, itemId: activeItemId, gps_accuracy_m: accuracy ?? null });
      stopPreview();
    } catch (err) {
      console.error('Failed to record data point:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    stopPreview();
  };

  return (
    <div className="flex gap-2">
      {previewMode && !saving && (
        <button
          type="button"
          onClick={handleCancel}
          className="rounded-xl min-h-[44px] py-3 px-4
            text-sm font-bold tracking-wide uppercase
            bg-gray-700 text-gray-300 hover:bg-gray-600 active:bg-gray-800
            transition-all"
        >
          Cancel
        </button>
      )}
      <button
        type="button"
        onClick={handlePress}
        disabled={disabled}
        className={`
          flex-1 rounded-xl min-h-[44px] py-3 px-6
          text-base font-bold tracking-wide uppercase
          shadow-lg transition-all
          ${buttonStyle}
        `}
      >
        {label}
      </button>
    </div>
  );
}
