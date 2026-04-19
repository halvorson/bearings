import { useState, useEffect, useCallback, useRef, useSyncExternalStore } from 'react';
import geomagnetism from 'geomagnetism';

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

// ── Declination cache ────────────────────────────────────────────────────
// Declination varies <0.03° across ~10km, so we recompute only when the
// position moves more than DECL_RECOMPUTE_KM. This keeps us well inside
// the ±0.35° WMM uncertainty and avoids calling geomagnetism on every
// orientation event.
const DECL_RECOMPUTE_KM = 5;
let _cachedDecl = null; // { lat, lng, decl }

function computeDeclination(lat, lng) {
  if (
    _cachedDecl &&
    Math.abs(_cachedDecl.lat - lat) < DECL_RECOMPUTE_KM / 111 &&
    Math.abs(_cachedDecl.lng - lng) < DECL_RECOMPUTE_KM / 111
  ) {
    return _cachedDecl.decl;
  }
  try {
    const info = geomagnetism.model().point([lat, lng]);
    _cachedDecl = { lat, lng, decl: info.decl };
    return info.decl;
  } catch {
    return 0;
  }
}

/**
 * useCompass — returns a true-north bearing with magnetic declination correction.
 *
 * @param {{ lat?: number, lng?: number }} position — optional GPS position used
 *   to compute declination via the WMM-2025 model. When absent, the reading is
 *   returned uncorrected (magnetic north on iOS, platform-dependent on Android).
 */
export function useCompass(position = {}) {
  const { lat, lng } = position;
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

  // Keep the latest declination in a ref so the orientation handler doesn't
  // need to re-subscribe every time position updates.
  const declinationRef = useRef(0);
  useEffect(() => {
    if (typeof lat === 'number' && typeof lng === 'number') {
      declinationRef.current = computeDeclination(lat, lng);
    }
  }, [lat, lng]);

  const handleOrientation = useCallback((event) => {
    // ── Bearing ──────────────────────────────────────────────────────────
    let newBearing = null;
    let isMagnetic = false;

    if (event.webkitCompassHeading != null) {
      // iOS: degrees clockwise from *magnetic* north — apply declination
      newBearing = event.webkitCompassHeading;
      isMagnetic = true;
    } else if (event.alpha != null) {
      // Android `deviceorientationabsolute` is specified relative to Earth's
      // coordinate frame (true north). `deviceorientation` alpha without
      // absolute=true is device-relative and unreliable — treat as magnetic
      // so self-cal still compensates, but do not double-correct absolute.
      newBearing = 360 - event.alpha;
      isMagnetic = !event.absolute;
    }

    if (newBearing !== null) {
      if (isMagnetic) newBearing += declinationRef.current;
      setBearing(((newBearing % 360) + 360) % 360);
    }

    // ── Calibration quality ──────────────────────────────────────────────
    if (event.webkitCompassHeading != null) {
      const accuracy = event.webkitCompassAccuracy;
      if (accuracy != null && accuracy >= 0) {
        setCalibrationQuality(accuracy > 15 ? 'poor' : 'good');
      } else {
        setCalibrationQuality('unknown');
      }
    } else if (event.alpha != null) {
      setCalibrationQuality(event.absolute ? 'good' : 'poor');
    }
  }, []);

  // Attach listener when permission is granted (or not needed)
  useEffect(() => {
    if (!supported) return;
    if (requiresPermission && permissionState !== 'granted') return;

    const hasAbsoluteEvent = 'ondeviceorientationabsolute' in window;

    if (hasAbsoluteEvent) {
      window.addEventListener('deviceorientationabsolute', handleOrientation, true);
    }
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
