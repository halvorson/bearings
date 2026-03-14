import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeTriangulation } = require('../src/triangulate.js');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Haversine distance between two WGS84 points, in metres.
 */
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ---------------------------------------------------------------------------
// Edge cases — 0 and 1 point
// ---------------------------------------------------------------------------

describe('edge cases — 0 and 1 point', () => {
  it('returns dataPointCount 0 and no estimate for empty input', () => {
    const result = computeTriangulation([]);
    expect(result.dataPointCount).toBe(0);
    expect(result.estimatedLat).toBeUndefined();
    expect(result.estimatedLng).toBeUndefined();
  });

  it('returns dataPointCount 1, no estimate, and insufficientSpread false for a single point', () => {
    const result = computeTriangulation([
      { lat: 51.5, lng: -0.1, bearing: 90, accuracy: 5 },
    ]);
    expect(result.dataPointCount).toBe(1);
    expect(result.estimatedLat).toBeUndefined();
    expect(result.estimatedLng).toBeUndefined();
    expect(result.insufficientSpread).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 2-point intersection — known geometry
// ---------------------------------------------------------------------------

describe('2-point intersection — known geometry', () => {
  it('estimates the intersection of two perpendicular bearings within 1 metre', () => {
    // Observer A at (51.5, -0.1) pointing due east (90°).
    // Its ray travels east along latitude 51.5.
    //
    // Observer B at (51.504, -0.095) pointing due south (180°).
    // Its ray travels south along longitude -0.095.
    //
    // The rays cross at (51.5, -0.095).
    const points = [
      { lat: 51.5, lng: -0.1, bearing: 90, accuracy: 5 },
      { lat: 51.504, lng: -0.095, bearing: 180, accuracy: 5 },
    ];
    const result = computeTriangulation(points);

    expect(result.dataPointCount).toBe(2);
    expect(result.insufficientSpread).toBe(false);
    expect(result.estimatedLat).toBeDefined();
    expect(result.estimatedLng).toBeDefined();

    const dist = haversineDistance(
      result.estimatedLat,
      result.estimatedLng,
      51.5,
      -0.095,
    );
    expect(dist).toBeLessThan(1);
  });
});

// ---------------------------------------------------------------------------
// Insufficient spread
// ---------------------------------------------------------------------------

describe('insufficient spread', () => {
  it('flags insufficientSpread when two bearings are only 5° apart', () => {
    const points = [
      { lat: 51.5, lng: -0.1, bearing: 90, accuracy: 5 },
      { lat: 51.501, lng: -0.105, bearing: 95, accuracy: 5 },
    ];
    const result = computeTriangulation(points);
    expect(result.insufficientSpread).toBe(true);
    expect(result.estimatedLat).toBeUndefined();
    expect(result.estimatedLng).toBeUndefined();
  });

  // ---------------------------------------------------------------------------
  // Wrap-around bearings
  // ---------------------------------------------------------------------------

  it('flags insufficientSpread for 358° and 2° (circular range = 4°)', () => {
    // Circular range: min angular gap travelling either way = 4°, which is < 10°.
    const points = [
      { lat: 51.5, lng: -0.1, bearing: 358, accuracy: 5 },
      { lat: 51.501, lng: -0.105, bearing: 2, accuracy: 5 },
    ];
    const result = computeTriangulation(points);
    expect(result.insufficientSpread).toBe(true);
  });

  it('does NOT flag insufficientSpread for 350° and 10° (circular range = 20°)', () => {
    // 350° → 10° the short way around is 20°, which is NOT < 10°.
    const points = [
      { lat: 51.5, lng: -0.1, bearing: 350, accuracy: 5 },
      { lat: 51.501, lng: -0.105, bearing: 10, accuracy: 5 },
    ];
    const result = computeTriangulation(points);
    expect(result.insufficientSpread).toBe(false);
  });

  it('does NOT flag insufficientSpread for 355° and 5° (circular range = 10°, not < 10°)', () => {
    // 355° → 5° the short way around = 10°. The threshold is strictly < 10°,
    // so exactly 10° must NOT be flagged.
    const points = [
      { lat: 51.5, lng: -0.1, bearing: 355, accuracy: 5 },
      { lat: 51.501, lng: -0.105, bearing: 5, accuracy: 5 },
    ];
    const result = computeTriangulation(points);
    expect(result.insufficientSpread).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 3+ points — convergence near a known target
// ---------------------------------------------------------------------------

describe('3+ points — convergence', () => {
  it('estimates within 50 metres of the target when three observers ring it', () => {
    // Target: (51.5010, -0.1000)
    //
    // Place three observers roughly 300 m from the target and compute the
    // exact bearing each one should aim toward the target.  Using the
    // equirectangular approximation at this latitude:
    //   1° lng ≈ 111 319 × cos(51.5° × π/180) ≈ 69 470 m
    //   1° lat ≈ 111 319 m
    //
    // Observer N  (51.5037, -0.1000)  ~300 m north  → bearing ≈ 180° (south)
    // Observer SE (51.4992, -0.0957)  ~300 m SE     → bearing ≈ 287° (west-NW)
    // Observer SW (51.4992, -0.1043)  ~300 m SW     → bearing ≈ 53°  (NE)
    //
    // Rather than hand-compute exact bearings we use the forward-azimuth
    // formula so the test inputs are self-consistent and should converge to
    // (51.5010, -0.1000) exactly under the algorithm.

    const target = { lat: 51.501, lng: -0.1 };

    /** Great-circle initial bearing from (lat1,lng1) toward (lat2,lng2). */
    function initialBearing(lat1, lng1, lat2, lng2) {
      const toRad = (d) => (d * Math.PI) / 180;
      const toDeg = (r) => (r * 180) / Math.PI;
      const dLng = toRad(lng2 - lng1);
      const y = Math.sin(dLng) * Math.cos(toRad(lat2));
      const x =
        Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
        Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLng);
      return (toDeg(Math.atan2(y, x)) + 360) % 360;
    }

    const observers = [
      { lat: 51.5037, lng: -0.1 },    // ~300 m north
      { lat: 51.4992, lng: -0.0957 }, // ~300 m SE
      { lat: 51.4992, lng: -0.1043 }, // ~300 m SW
    ];

    const points = observers.map((obs) => ({
      lat: obs.lat,
      lng: obs.lng,
      bearing: initialBearing(obs.lat, obs.lng, target.lat, target.lng),
      accuracy: 5,
    }));

    const result = computeTriangulation(points);

    expect(result.dataPointCount).toBe(3);
    expect(result.insufficientSpread).toBe(false);
    expect(result.estimatedLat).toBeDefined();
    expect(result.estimatedLng).toBeDefined();

    const dist = haversineDistance(
      result.estimatedLat,
      result.estimatedLng,
      target.lat,
      target.lng,
    );
    expect(dist).toBeLessThan(50);
  });
});

// ---------------------------------------------------------------------------
// Same GPS position, different bearings
// ---------------------------------------------------------------------------

describe('same GPS position, different bearings', () => {
  it('does not throw and returns a valid result object', () => {
    // Two readings from the exact same location pointing in different directions.
    // The rays are co-located so the intersection is degenerate, but the
    // function must not throw.
    const points = [
      { lat: 51.5, lng: -0.1, bearing: 45, accuracy: 5 },
      { lat: 51.5, lng: -0.1, bearing: 135, accuracy: 5 },
    ];
    let result;
    expect(() => {
      result = computeTriangulation(points);
    }).not.toThrow();

    expect(result).toBeDefined();
    expect(typeof result.dataPointCount).toBe('number');
    expect(typeof result.insufficientSpread).toBe('boolean');
    expect(typeof result.lowConfidence).toBe('boolean');
  });
});

// ---------------------------------------------------------------------------
// Confidence polygon
// ---------------------------------------------------------------------------

describe('confidence polygon', () => {
  it('is not null and has at least 4 coordinate pairs (ring + closing point) for a valid 2-point case', () => {
    const points = [
      { lat: 51.5, lng: -0.1, bearing: 90, accuracy: 5 },
      { lat: 51.504, lng: -0.095, bearing: 180, accuracy: 5 },
    ];
    const result = computeTriangulation(points);

    expect(result.confidencePolygon).not.toBeNull();
    expect(result.confidencePolygon.type).toBe('Polygon');

    const ring = result.confidencePolygon.coordinates[0];
    // GeoJSON rings close on themselves: first === last, so a triangle has 4 entries.
    expect(ring.length).toBeGreaterThanOrEqual(4);

    // Every coordinate pair must be [lng, lat] (two-element arrays).
    for (const coord of ring) {
      expect(coord).toHaveLength(2);
      expect(typeof coord[0]).toBe('number'); // lng
      expect(typeof coord[1]).toBe('number'); // lat
    }
  });
});

// ---------------------------------------------------------------------------
// Low confidence
// ---------------------------------------------------------------------------

describe('low confidence', () => {
  it('sets lowConfidence true when the estimate is more than 2 km from the observer centroid', () => {
    // Two observers ~1 km apart east-west, both pointing nearly due north but
    // with only a 10° angular spread.  The rays are nearly parallel and converge
    // roughly 6 km to the north — well beyond the 2 km lowConfidence threshold.
    //
    // Observer A at (51.5000, -0.1100) bearing  1° (just east of north)
    // Observer B at (51.5000, -0.0950) bearing 11° (slightly more east)
    //
    // Circular range = 10°, which is NOT < 10°, so insufficientSpread must be false.
    const points = [
      { lat: 51.5, lng: -0.11, bearing: 1, accuracy: 5 },
      { lat: 51.5, lng: -0.095, bearing: 11, accuracy: 5 },
    ];
    const result = computeTriangulation(points);

    // Must NOT be flagged as insufficient spread (11° ≥ 10°).
    expect(result.insufficientSpread).toBe(false);

    // The estimate must exist (we have 2 valid points).
    expect(result.estimatedLat).toBeDefined();
    expect(result.estimatedLng).toBeDefined();

    // The estimate must be flagged as low confidence (> 2 km from centroid).
    expect(result.lowConfidence).toBe(true);
  });
});
