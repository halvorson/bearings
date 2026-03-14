import { useState, useEffect, useCallback } from 'react';

export function useCompass() {
  const [bearing, setBearing] = useState(null);
  const [calibrationQuality, setCalibrationQuality] = useState('unknown');
  const [permissionState, setPermissionState] = useState(null);

  const supported =
    typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

  // Determine whether iOS permission prompt is required
  const requiresPermission =
    supported &&
    typeof DeviceOrientationEvent.requestPermission === 'function';

  // Initialise permissionState for iOS devices that need a prompt
  useEffect(() => {
    if (requiresPermission) {
      setPermissionState('prompt');
    }
  }, [requiresPermission]);

  const handleOrientation = useCallback((event) => {
    // ── Bearing ──────────────────────────────────────────────────────────
    let newBearing = null;

    if (event.webkitCompassHeading != null) {
      // iOS: already degrees clockwise from magnetic north
      newBearing = event.webkitCompassHeading;
    } else if (event.absolute && event.alpha != null) {
      // Android with absolute orientation
      newBearing = 360 - event.alpha;
    }

    if (newBearing !== null) {
      // Normalise to [0, 360)
      setBearing(((newBearing % 360) + 360) % 360);
    }

    // ── Calibration quality ──────────────────────────────────────────────
    if (event.webkitCompassHeading != null) {
      // iOS: webkitCompassAccuracy gives accuracy in degrees
      const accuracy = event.webkitCompassAccuracy;
      if (accuracy != null && accuracy >= 0) {
        setCalibrationQuality(accuracy > 15 ? 'poor' : 'good');
      } else {
        setCalibrationQuality('unknown');
      }
    } else if (event.alpha != null) {
      // Android: treat non-absolute events as poor
      setCalibrationQuality(event.absolute ? 'good' : 'poor');
    }
  }, []);

  // Attach listener when permission is granted (or not needed)
  useEffect(() => {
    if (!supported) return;
    if (requiresPermission && permissionState !== 'granted') return;

    window.addEventListener('deviceorientation', handleOrientation, true);

    return () => {
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [supported, requiresPermission, permissionState, handleOrientation]);

  const requestPermission = useCallback(async () => {
    if (!requiresPermission) return;

    try {
      const state = await DeviceOrientationEvent.requestPermission();
      setPermissionState(state === 'granted' ? 'granted' : 'denied');
    } catch {
      setPermissionState('denied');
    }
  }, [requiresPermission]);

  return {
    bearing,
    supported,
    permissionState,
    calibrationQuality,
    requestPermission,
  };
}
