import { useState, useEffect, useCallback, useSyncExternalStore } from 'react';

// ── Shared permission state across all useCompass instances ──────────────
// DeviceOrientationEvent.requestPermission() is page-level — once granted,
// every hook instance must see 'granted' so they attach their listeners.
let _permissionState = null;
const _listeners = new Set();

function getPermissionState() {
  return _permissionState;
}

function subscribePermission(cb) {
  _listeners.add(cb);
  return () => _listeners.delete(cb);
}

function setSharedPermissionState(state) {
  _permissionState = state;
  _listeners.forEach((cb) => cb());
}

export function useCompass() {
  const [bearing, setBearing] = useState(null);
  const [calibrationQuality, setCalibrationQuality] = useState('unknown');

  const permissionState = useSyncExternalStore(subscribePermission, getPermissionState);

  const supported =
    typeof window !== 'undefined' && 'DeviceOrientationEvent' in window;

  // Determine whether iOS permission prompt is required
  const requiresPermission =
    supported &&
    typeof DeviceOrientationEvent.requestPermission === 'function';

  // Initialise shared permissionState once for iOS
  useEffect(() => {
    if (requiresPermission && _permissionState === null) {
      setSharedPermissionState('prompt');
    }
  }, [requiresPermission]);

  const handleOrientation = useCallback((event) => {
    // ── Bearing ──────────────────────────────────────────────────────────
    let newBearing = null;

    if (event.webkitCompassHeading != null) {
      // iOS: already degrees clockwise from magnetic north
      newBearing = event.webkitCompassHeading;
    } else if (event.alpha != null) {
      // Android: alpha is degrees counter-clockwise from north (when absolute)
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
      // Android: absolute events are reliable, non-absolute are poor
      setCalibrationQuality(event.absolute ? 'good' : 'poor');
    }
  }, []);

  // Attach listener when permission is granted (or not needed)
  useEffect(() => {
    if (!supported) return;
    if (requiresPermission && permissionState !== 'granted') return;

    // Android Chrome fires absolute compass data on 'deviceorientationabsolute'.
    // Fall back to 'deviceorientation' for iOS and browsers without it.
    const hasAbsoluteEvent = 'ondeviceorientationabsolute' in window;

    if (hasAbsoluteEvent) {
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    }
    // Always attach the standard event too — iOS uses it exclusively,
    // and Android will use it as a fallback if absolute isn't available.
    window.addEventListener('deviceorientation', handleOrientation, true);

    return () => {
      if (hasAbsoluteEvent) {
        window.removeEventListener('deviceorientationabsolute', handleOrientation, true);
      }
      window.removeEventListener('deviceorientation', handleOrientation, true);
    };
  }, [supported, requiresPermission, permissionState, handleOrientation]);

  const requestPermission = useCallback(async () => {
    if (!requiresPermission) return;

    try {
      const state = await DeviceOrientationEvent.requestPermission();
      setSharedPermissionState(state === 'granted' ? 'granted' : 'denied');
    } catch {
      setSharedPermissionState('denied');
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
