import { useState, useEffect } from 'react';

export function useGeolocation() {
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [error, setError] = useState(null);

  const supported = typeof navigator !== 'undefined' && 'geolocation' in navigator;

  useEffect(() => {
    if (!supported) {
      setError('Location is not available on this device');
      return;
    }

    const options = {
      enableHighAccuracy: true,
      maximumAge: 5000,
      timeout: 10000,
    };

    const onSuccess = (position) => {
      setLat(position.coords.latitude);
      setLng(position.coords.longitude);
      setAccuracy(position.coords.accuracy);
      setError(null);
    };

    const onError = (err) => {
      switch (err.code) {
        case err.PERMISSION_DENIED:
          setError('Location access is required. Please enable location permissions for this site.');
          break;
        case err.POSITION_UNAVAILABLE:
          setError('Location is not available on this device');
          break;
        case err.TIMEOUT:
          setError('Location request timed out. Please try again.');
          break;
        default:
          setError('An unknown location error occurred.');
      }
    };

    const watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);

    return () => {
      navigator.geolocation.clearWatch(watchId);
    };
  }, [supported]);

  return { lat, lng, accuracy, error, supported };
}
