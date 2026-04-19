import { useState } from 'react';
import { addDoc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { track } from '../lib/analytics';
import { useCompass } from '../hooks/useCompass';
import { useGeolocation } from '../hooks/useGeolocation';
import useSessionStore from '../store/useSessionStore';
import CompassRose from './CompassRose';
import CompassCalibrationWarning from './CompassCalibrationWarning';
import ManualBearingInput from './ManualBearingInput';
import GpsStatus from './GpsStatus';

/**
 * Full-screen modal overlay for recording a bearing data point.
 *
 * Props:
 *   sessionId {string}
 */
export default function CaptureOverlay({ sessionId }) {
  const captureOverlayOpen = useSessionStore((s) => s.captureOverlayOpen);
  const closeCapture = useSessionStore((s) => s.closeCapture);
  const activeItemId = useSessionStore((s) => s.activeItemId);
  const participantToken = useSessionStore((s) => s.participantToken);

  const { lat, lng, accuracy, error: gpsError } = useGeolocation();
  const { bearing, supported: compassSupported, calibrationQuality } = useCompass({ lat, lng });

  const [manualBearing, setManualBearing] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  if (!captureOverlayOpen) return null;

  // This overlay is now only used for manual bearing input (no compass).

  // Determine the effective bearing to record
  const effectiveBearing = compassSupported ? bearing : manualBearing;

  const canConfirm =
    !submitting &&
    lat != null &&
    lng != null &&
    effectiveBearing != null;

  const handleConfirm = async () => {
    if (!canConfirm) return;
    setSubmitting(true);
    setSubmitError(null);

    try {
      await addDoc(
        collection(db, 'sessions', sessionId, 'items', activeItemId, 'dataPoints'),
        {
          participantToken,
          lat,
          lng,
          bearing: effectiveBearing,
          accuracy: accuracy ?? null,
          timestamp: serverTimestamp(),
        }
      );

      track('data_point_recorded', { sessionId, itemId: activeItemId, gps_accuracy_m: accuracy ?? null });
      if (!compassSupported) {
        track('manual_bearing_used');
      }
      closeCapture();
    } catch (err) {
      console.error('Failed to record data point:', err);
      setSubmitError('Failed to save. Please try again.');
      setSubmitting(false);
    }
  };

  const handleCancel = () => {
    closeCapture();
  };

  return (
    <div
      className="fixed inset-0 bg-gray-900/95 z-30 flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-label="Record bearing"
    >
      {/* Top bar — GPS status */}
      <div className="flex items-center justify-between px-4 pt-safe-t pt-4 pb-3 border-b border-gray-700">
        <GpsStatus accuracy={accuracy} error={gpsError} />
      </div>

      {/* Centre — compass or manual input */}
      <div className="flex-1 flex flex-col items-center justify-center gap-6 px-4 py-6">
        {compassSupported ? (
          <>
            <CompassRose bearing={bearing} />
            {calibrationQuality === 'poor' && <CompassCalibrationWarning />}
          </>
        ) : (
          <ManualBearingInput value={manualBearing} onChange={setManualBearing} />
        )}

        {/* GPS unavailable notice */}
        {lat == null && !gpsError && (
          <p className="text-sm text-gray-400 text-center">
            Waiting for GPS fix before you can confirm…
          </p>
        )}

        {/* Submit error */}
        {submitError && (
          <p className="text-sm text-red-400 text-center" role="alert">
            {submitError}
          </p>
        )}
      </div>

      {/* Bottom — Confirm + Cancel */}
      <div className="flex flex-col gap-3 px-4 pb-safe-b pb-6 pt-3 border-t border-gray-700">
        <button
          type="button"
          onClick={handleConfirm}
          disabled={!canConfirm}
          className={`
            w-full rounded-xl min-h-[44px] py-3 px-6
            text-base font-semibold text-white
            transition-colors
            ${canConfirm
              ? 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
              : 'bg-blue-600/40 cursor-not-allowed'
            }
          `}
        >
          {submitting ? 'Saving…' : 'Confirm'}
        </button>

        <button
          type="button"
          onClick={handleCancel}
          disabled={submitting}
          className="
            w-full rounded-xl min-h-[44px] py-3 px-6
            text-base font-semibold text-gray-300
            bg-gray-700 hover:bg-gray-600 active:bg-gray-500
            transition-colors
          "
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
