import { useEffect, useRef, useState } from 'react';
import mapboxgl from 'mapbox-gl';
import 'mapbox-gl/dist/mapbox-gl.css';
import { deleteDoc, doc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { track } from '../lib/analytics';
import { useGeolocation } from '../hooks/useGeolocation';
import { useDataPoints } from '../hooks/useDataPoints';
import { useTriangulation } from '../hooks/useTriangulation';
import useSessionStore from '../store/useSessionStore';
import useToastStore from '../store/useToastStore';

mapboxgl.accessToken = import.meta.env.VITE_MAPBOX_TOKEN;

// ---------------------------------------------------------------------------
// Geo helpers
// ---------------------------------------------------------------------------

const EARTH_RADIUS_M = 6371000;
const DEG = Math.PI / 180;
const RAD = 180 / Math.PI;

/**
 * Compute destination point given start lat/lng, bearing (degrees), and
 * distance (metres). Uses the spherical-earth (Haversine) formula.
 */
function destinationPoint(lat, lng, bearingDeg, distanceM) {
  const δ = distanceM / EARTH_RADIUS_M; // angular distance
  const θ = bearingDeg * DEG;
  const φ1 = lat * DEG;
  const λ1 = lng * DEG;

  const φ2 = Math.asin(
    Math.sin(φ1) * Math.cos(δ) + Math.cos(φ1) * Math.sin(δ) * Math.cos(θ),
  );
  const λ2 =
    λ1 +
    Math.atan2(
      Math.sin(θ) * Math.sin(δ) * Math.cos(φ1),
      Math.cos(δ) - Math.sin(φ1) * Math.sin(φ2),
    );

  return { lat: φ2 * RAD, lng: ((λ2 * RAD + 540) % 360) - 180 };
}

/**
 * Create a GeoJSON Polygon for a bearing-error wedge centred on the given
 * bearing, extending `distance` metres, with a half-angle of `halfAngle`
 * degrees on each side.
 */
function createWedgePolygon(lat, lng, bearingDeg, distanceM, halfAngle = 5) {
  const steps = 16; // points along the arc
  const coords = [[lng, lat]]; // apex

  const startBearing = bearingDeg - halfAngle;
  const endBearing = bearingDeg + halfAngle;

  for (let i = 0; i <= steps; i++) {
    const b = startBearing + (i / steps) * (endBearing - startBearing);
    const dest = destinationPoint(lat, lng, b, distanceM);
    coords.push([dest.lng, dest.lat]);
  }

  coords.push([lng, lat]); // close ring

  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}

/**
 * Approximate a circle as a polygon with `numPoints` vertices.
 */
function createCirclePolygon(lat, lng, radiusMetres, numPoints = 64) {
  const coords = [];
  for (let i = 0; i <= numPoints; i++) {
    const bearing = (i / numPoints) * 360;
    const dest = destinationPoint(lat, lng, bearing, radiusMetres);
    coords.push([dest.lng, dest.lat]);
  }
  return {
    type: 'Feature',
    geometry: { type: 'Polygon', coordinates: [coords] },
    properties: {},
  };
}

// ---------------------------------------------------------------------------
// Source + layer definitions
// ---------------------------------------------------------------------------

const SOURCES = [
  'observer-points',
  'bearing-rays',
  'error-wedges',
  'triangulation-point',
  'confidence-polygon',
  'accuracy-rings',
];

function addSourcesAndLayers(map) {
  // Add empty GeoJSON sources
  SOURCES.forEach((id) => {
    map.addSource(id, {
      type: 'geojson',
      data: { type: 'FeatureCollection', features: [] },
    });
  });

  // accuracy-rings — dashed line behind everything
  map.addLayer({
    id: 'accuracy-rings',
    type: 'line',
    source: 'accuracy-rings',
    paint: {
      'line-width': 1,
      'line-color': '#3B82F6',
      'line-opacity': 0.3,
      'line-dasharray': [4, 4],
    },
  });

  // error-wedges fill
  map.addLayer({
    id: 'error-wedges',
    type: 'fill',
    source: 'error-wedges',
    paint: {
      'fill-color': '#3B82F6',
      'fill-opacity': 0.1,
    },
  });

  // confidence-polygon fill
  map.addLayer({
    id: 'confidence-polygon',
    type: 'fill',
    source: 'confidence-polygon',
    paint: {
      'fill-color': '#EF4444',
      'fill-opacity': 0.2,
    },
  });

  // confidence-polygon outline
  map.addLayer({
    id: 'confidence-polygon-outline',
    type: 'line',
    source: 'confidence-polygon',
    paint: {
      'line-color': '#EF4444',
      'line-width': 2,
      'line-opacity': 0.6,
      'line-dasharray': [4, 2],
    },
  });

  // bearing-rays line
  map.addLayer({
    id: 'bearing-rays',
    type: 'line',
    source: 'bearing-rays',
    paint: {
      'line-width': 2,
      'line-color': '#3B82F6',
      'line-opacity': 0.7,
    },
  });

  // triangulation-point circle
  map.addLayer({
    id: 'triangulation-point',
    type: 'circle',
    source: 'triangulation-point',
    paint: {
      'circle-radius': 10,
      'circle-color': '#EF4444',
      'circle-stroke-width': 3,
      'circle-stroke-color': '#ffffff',
    },
  });

  // observer-points circle — topmost
  map.addLayer({
    id: 'observer-points',
    type: 'circle',
    source: 'observer-points',
    paint: {
      'circle-radius': 6,
      'circle-color': '#3B82F6',
      'circle-stroke-width': 2,
      'circle-stroke-color': '#ffffff',
    },
  });

  // Transparent hit-area layer above observer-points to ensure ≥44px tap target
  map.addLayer({
    id: 'observer-points-hitarea',
    type: 'circle',
    source: 'observer-points',
    paint: {
      'circle-radius': 22,
      'circle-opacity': 0,
      'circle-stroke-width': 0,
    },
  });
}

// ---------------------------------------------------------------------------
// MapView
// ---------------------------------------------------------------------------

export default function MapView({ sessionId, itemId }) {
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const initialCenteredRef = useRef(false);
  const lastFittedItemRef = useRef(null);
  const [styleLoaded, setStyleLoaded] = useState(false);

  const { lat: gpsLat, lng: gpsLng } = useGeolocation();
  const { dataPoints } = useDataPoints(sessionId, itemId);
  const { result } = useTriangulation(sessionId, itemId);
  const { participantToken } = useSessionStore();

  const { deleteMode } = useSessionStore();

  // Refs so the Mapbox click handler always reads current values
  const propsRef = useRef({ sessionId, itemId, participantToken, dataPoints, deleteMode });
  propsRef.current = { sessionId, itemId, participantToken, dataPoints, deleteMode };

  // Initialise map on mount
  useEffect(() => {
    if (!mapContainerRef.current) return;

    const map = new mapboxgl.Map({
      container: mapContainerRef.current,
      style: 'mapbox://styles/mapbox/streets-v12',
      center: [-122.4194, 37.7749],
      zoom: 17,
    });

    mapRef.current = map;

    map.on('load', () => {
      addSourcesAndLayers(map);
      setStyleLoaded(true);
    });

    // Tap-to-delete on own observer points
    const handlePointClick = (e) => {
      if (!e.features || e.features.length === 0) return;
      const feature = e.features[0];
      const { pointId, participantToken: featureToken } = feature.properties;
      const { sessionId: sid, itemId: iid, participantToken: token, dataPoints: pts, deleteMode: dm } = propsRef.current;

      if (!dm) return;
      if (featureToken !== token) return;

      deleteDoc(
        doc(db, 'sessions', sid, 'items', iid, 'dataPoints', pointId),
      ).then(() => {
        track('data_point_deleted', { sessionId: sid, itemId: iid, point_count_after: (pts?.length ?? 1) - 1 });
      }).catch((err) => {
        console.error('Failed to delete data point:', err);
        useToastStore.getState().addToast({ error: err });
      });
    };

    map.on('click', 'observer-points-hitarea', handlePointClick);
    map.on('click', 'observer-points', handlePointClick);

    // Change cursor on hover to indicate clickability
    map.on('mouseenter', 'observer-points-hitarea', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'observer-points-hitarea', () => {
      map.getCanvas().style.cursor = '';
    });
    map.on('mouseenter', 'observer-points', () => {
      map.getCanvas().style.cursor = 'pointer';
    });
    map.on('mouseleave', 'observer-points', () => {
      map.getCanvas().style.cursor = '';
    });

    return () => {
      map.remove();
      mapRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount only

  // Fly to first GPS fix
  useEffect(() => {
    if (!mapRef.current || initialCenteredRef.current) return;
    if (gpsLat == null || gpsLng == null) return;

    mapRef.current.flyTo({ center: [gpsLng, gpsLat], zoom: 17 });
    initialCenteredRef.current = true;
  }, [gpsLat, gpsLng]);

  // Fit map to data points + triangulation estimate when item changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    const points = dataPoints ?? [];
    if (points.length === 0) return;

    // Only auto-fit when the item changes or on first load for this item
    const fittingKey = `${itemId}:${points.length}`;
    if (lastFittedItemRef.current === fittingKey) return;
    lastFittedItemRef.current = fittingKey;

    const coords = points.map((dp) => [dp.lng, dp.lat]);
    if (result?.estimatedLat != null && result?.estimatedLng != null) {
      coords.push([result.estimatedLng, result.estimatedLat]);
    }

    if (coords.length === 1) {
      map.flyTo({ center: coords[0], zoom: 17, duration: 1000 });
      return;
    }

    const bounds = new mapboxgl.LngLatBounds();
    coords.forEach((c) => bounds.extend(c));
    map.fitBounds(bounds, { padding: 60, maxZoom: 18, duration: 1000 });
  }, [itemId, dataPoints, result, styleLoaded]);

  // Update map layers whenever dataPoints or triangulation result change
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !styleLoaded) return;

    // --- observer-points source ---
    const observerFeatures = (dataPoints ?? []).map((dp) => ({
      type: 'Feature',
      geometry: { type: 'Point', coordinates: [dp.lng, dp.lat] },
      properties: {
        pointId: dp.id,
        participantToken: dp.participantToken,
        accuracy: dp.accuracy,
        bearing: dp.bearing,
      },
    }));
    map.getSource('observer-points')?.setData({
      type: 'FeatureCollection',
      features: observerFeatures,
    });

    // --- bearing-rays source ---
    const RAY_LENGTH_M = 500;
    const rayFeatures = (dataPoints ?? []).map((dp) => {
      const dest = destinationPoint(dp.lat, dp.lng, dp.bearing, RAY_LENGTH_M);
      return {
        type: 'Feature',
        geometry: {
          type: 'LineString',
          coordinates: [
            [dp.lng, dp.lat],
            [dest.lng, dest.lat],
          ],
        },
        properties: { pointId: dp.id },
      };
    });
    map.getSource('bearing-rays')?.setData({
      type: 'FeatureCollection',
      features: rayFeatures,
    });

    // --- error-wedges source ---
    const wedgeFeatures = (dataPoints ?? []).map((dp) =>
      createWedgePolygon(dp.lat, dp.lng, dp.bearing, RAY_LENGTH_M, 5),
    );
    map.getSource('error-wedges')?.setData({
      type: 'FeatureCollection',
      features: wedgeFeatures,
    });

    // --- accuracy-rings source ---
    const ringFeatures = (dataPoints ?? [])
      .filter((dp) => dp.accuracy != null && dp.accuracy > 0)
      .map((dp) => createCirclePolygon(dp.lat, dp.lng, dp.accuracy, 64));
    map.getSource('accuracy-rings')?.setData({
      type: 'FeatureCollection',
      features: ringFeatures,
    });

    // --- triangulation-point source ---
    if (result?.estimatedLat != null && result?.estimatedLng != null) {
      map.getSource('triangulation-point')?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [result.estimatedLng, result.estimatedLat],
            },
            properties: {},
          },
        ],
      });
    } else {
      map.getSource('triangulation-point')?.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }

    // --- confidence-polygon source ---
    if (result?.confidencePolygon) {
      map.getSource('confidence-polygon')?.setData({
        type: 'FeatureCollection',
        features: [
          {
            type: 'Feature',
            geometry: result.confidencePolygon,
            properties: {},
          },
        ],
      });
    } else {
      map.getSource('confidence-polygon')?.setData({
        type: 'FeatureCollection',
        features: [],
      });
    }
  }, [dataPoints, result, styleLoaded]);

  return <div ref={mapContainerRef} className="w-full h-full" />;
}
