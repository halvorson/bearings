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
 * "Mark" CTA button — saves a bearing data point on press.
 * Rendered inline in the instrument panel (not floating).
 *
 * Props:
 *   sessionId {string}
 */
export default function TrackButton({ sessionId }) {
  const activeItemId = useSessionStore((s) => s.activeItemId);
  const participantToken = useSessionStore((s) => s.participantToken);
  const openCapture = useSessionStore((s) => s.openCapture);

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
  let label = 'Record';

  if (saving) {
    disabled = true;
    label = 'Saving\u2026';
  } else if (isLocked) {
    disabled = true;
    label = 'Locked';
  } else if (maxReached) {
    disabled = true;
    label = 'Max points reached';
  }

  const handlePress = async () => {
    if (disabled) return;

    // iOS: request compass permission on first tap
    if (compassSupported && permissionState === 'prompt') {
      await requestPermission();
      return;
    }

    // If compass is not supported, fall back to manual bearing overlay
    if (!compassSupported) {
      openCapture();
      return;
    }

    // Need GPS + bearing to save
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
    } catch (err) {
      console.error('Failed to record data point:', err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handlePress}
      disabled={disabled}
      className={`
        w-full rounded-xl min-h-[44px] py-3 px-6
        text-base font-bold tracking-wide uppercase
        shadow-lg transition-all
        ${disabled
          ? 'bg-gray-700 text-gray-500 cursor-not-allowed shadow-none'
          : 'bg-amber-500 text-gray-950 hover:bg-amber-400 active:bg-amber-600 shadow-amber-500/25'
        }
      `}
    >
      {label}
    </button>
  );
}
