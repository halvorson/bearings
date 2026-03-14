/**
 * Bearings — Triangulation Math Module
 *
 * computeTriangulation(points) — takes an array of data point objects with
 * fields: lat, lng, bearing (degrees, 0–360 clockwise from north), accuracy.
 *
 * Algorithm:
 *   Step 1  — Convert observer positions to local tangent plane (LTP)
 *   Step 2  — Convert bearings to unit direction vectors
 *   Step 3  — Least-squares ray intersection
 *   Step 4  — Confidence polygon via ±5° extreme rays + convex hull
 *   Step 5  — Insufficient spread check (early exit if range < 10°)
 *   Step 6  — Low-confidence flag if estimate is > 2 km from observer centroid
 */

const EARTH_RADIUS = 6371000; // metres
const MIN_SPREAD_DEG = 10;
const LOW_CONFIDENCE_DIST_M = 2000;
const BEARING_OFFSET_DEG = 5;

// ---------------------------------------------------------------------------
// Helper: degrees ↔ radians
// ---------------------------------------------------------------------------

function toRad(deg) {
  return (deg * Math.PI) / 180;
}

function toDeg(rad) {
  return (rad * 180) / Math.PI;
}

// ---------------------------------------------------------------------------
// Step 5 — Circular bearing spread
// ---------------------------------------------------------------------------

/**
 * Compute the circular range of a set of bearings (0–360, wrapping).
 * Returns the smallest arc that contains all bearings, i.e.
 *   range = 360 − largestGap
 * where the gaps are measured between consecutive sorted bearings.
 *
 * @param {number[]} bearings
 * @returns {number} range in degrees [0, 360]
 */
function circularBearingRange(bearings) {
  const sorted = bearings.slice().sort((a, b) => a - b);
  const n = sorted.length;

  // Compute all consecutive gaps, including the wrap-around gap
  let largestGap = 0;
  for (let i = 0; i < n; i++) {
    const next = sorted[(i + 1) % n];
    const curr = sorted[i];
    const gap = i < n - 1 ? next - curr : 360 - curr + sorted[0];
    if (gap > largestGap) largestGap = gap;
  }

  return 360 - largestGap;
}

// ---------------------------------------------------------------------------
// LTP projection / inverse projection
// ---------------------------------------------------------------------------

/**
 * Project an array of {lat, lng} observers onto a local tangent plane
 * centred at the centroid of all positions.
 *
 * Returns: { points2d, lat0, lng0, lat0Rad }
 *   points2d — array of {x, y} in metres (x = east, y = north)
 *   lat0, lng0 — centroid in degrees
 *   lat0Rad — centroid latitude in radians (cached for inverse projection)
 */
function projectToLTP(observers) {
  const n = observers.length;
  const lat0 = observers.reduce((s, p) => s + p.lat, 0) / n;
  const lng0 = observers.reduce((s, p) => s + p.lng, 0) / n;
  const lat0Rad = toRad(lat0);

  const points2d = observers.map((p) => ({
    x: EARTH_RADIUS * toRad(p.lng - lng0) * Math.cos(lat0Rad),
    y: EARTH_RADIUS * toRad(p.lat - lat0),
  }));

  return { points2d, lat0, lng0, lat0Rad };
}

/**
 * Convert an LTP {x, y} point back to {lat, lng} degrees.
 */
function ltpToLatLng(x, y, lat0, lng0, lat0Rad) {
  const lat = lat0 + toDeg(y / EARTH_RADIUS);
  const lng = lng0 + toDeg(x / (EARTH_RADIUS * Math.cos(lat0Rad)));
  return { lat, lng };
}

// ---------------------------------------------------------------------------
// Step 2 — Bearing to unit direction vector
// ---------------------------------------------------------------------------

function bearingToDirection(bearingDeg) {
  const rad = toRad(bearingDeg);
  return { x: Math.sin(rad), y: Math.cos(rad) };
}

// ---------------------------------------------------------------------------
// Step 3 — Least-squares ray intersection (2×2 linear system)
// ---------------------------------------------------------------------------

/**
 * Solve A * P = b for P, where A is 2×2 and b is a 2-vector.
 * Returns null if the matrix is singular (degenerate rays).
 *
 * Stored as flat array: [a00, a01, a10, a11]
 */
function solve2x2(A, b) {
  const [a00, a01, a10, a11] = A;
  const det = a00 * a11 - a01 * a10;
  if (Math.abs(det) < 1e-10) return null;

  const invDet = 1 / det;
  return {
    x: invDet * (a11 * b[0] - a01 * b[1]),
    y: invDet * (-a10 * b[0] + a00 * b[1]),
  };
}

/**
 * Find the least-squares best-fit intersection of N rays.
 * Each ray: origin p_i, unit direction d_i.
 *
 * Normal equation:
 *   A = Σ (I − d_i d_i^T)
 *   b = Σ (I − d_i d_i^T) p_i
 *   P = A^{-1} b
 */
function leastSquaresIntersection(origins, directions) {
  // Accumulate A (2×2) and b (2-vector)
  let a00 = 0, a01 = 0, a10 = 0, a11 = 0;
  let bx = 0, by = 0;

  for (let i = 0; i < origins.length; i++) {
    const { x: px, y: py } = origins[i];
    const { x: dx, y: dy } = directions[i];

    // M = (I − d d^T)
    const m00 = 1 - dx * dx;
    const m01 = -dx * dy;
    const m10 = -dy * dx;
    const m11 = 1 - dy * dy;

    a00 += m00;
    a01 += m01;
    a10 += m10;
    a11 += m11;

    // b += M * p
    bx += m00 * px + m01 * py;
    by += m10 * px + m11 * py;
  }

  return solve2x2([a00, a01, a10, a11], [bx, by]);
}

// ---------------------------------------------------------------------------
// Step 4 — Ray-ray intersection + convex hull
// ---------------------------------------------------------------------------

/**
 * Compute the intersection point of two rays:
 *   ray1: p1 + t * d1
 *   ray2: p2 + s * d2
 *
 * Returns null if rays are parallel (det ≈ 0) or if either parameter is
 * negative (intersection would be behind the observer).
 */
function rayRayIntersection(p1, d1, p2, d2) {
  // Solve: p1 + t*d1 = p2 + s*d2
  // [d1 -d2] [t; s] = p2 - p1
  const det = d1.x * (-d2.y) - d1.y * (-d2.x);
  if (Math.abs(det) < 1e-10) return null;

  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  const t = (dx * (-d2.y) - dy * (-d2.x)) / det;
  const s = (d1.x * dy - d1.y * dx) / det;

  // Both parameters should be positive (intersection is ahead of both observers)
  if (t < 0 || s < 0) return null;

  return {
    x: p1.x + t * d1.x,
    y: p1.y + t * d1.y,
  };
}

/**
 * Convex hull via Andrew's monotone chain algorithm.
 * Input: array of {x, y} points.
 * Returns: array of {x, y} hull vertices in counter-clockwise order,
 *          or empty array if fewer than 3 distinct points.
 */
function convexHull(points) {
  if (points.length < 3) return points.slice();

  // Sort lexicographically by (x, y)
  const sorted = points
    .slice()
    .sort((a, b) => a.x - b.x || a.y - b.y);

  function cross(o, a, b) {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  }

  // Build lower hull
  const lower = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  // Build upper hull
  const upper = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  // Remove last point of each half (it's the first of the other)
  lower.pop();
  upper.pop();

  return lower.concat(upper);
}

/**
 * Build the confidence polygon.
 *
 * For each of the N data points, produce two extreme rays at bearing ± 5°.
 * Intersect all pairs of extreme rays from different observers.
 * Return the convex hull as a closed GeoJSON Polygon ring.
 */
function buildConfidencePolygon(points2d, bearings, lat0, lng0, lat0Rad) {
  const n = points2d.length;

  // Collect extreme ray origins and directions (2 per point: bearing ± 5°)
  const extremeRays = [];
  for (let i = 0; i < n; i++) {
    const bLow = bearings[i] - BEARING_OFFSET_DEG;
    const bHigh = bearings[i] + BEARING_OFFSET_DEG;
    extremeRays.push({ origin: points2d[i], dir: bearingToDirection(bLow) });
    extremeRays.push({ origin: points2d[i], dir: bearingToDirection(bHigh) });
  }

  // Find all pairwise intersections between rays from different original points
  const intersections = [];
  for (let i = 0; i < extremeRays.length; i++) {
    for (let j = i + 1; j < extremeRays.length; j++) {
      // Rays from the same original observer share the same origin index
      // (ray 2k and 2k+1 come from point k). Skip if same observer.
      const iObs = Math.floor(i / 2);
      const jObs = Math.floor(j / 2);
      if (iObs === jObs) continue;

      const pt = rayRayIntersection(
        extremeRays[i].origin,
        extremeRays[i].dir,
        extremeRays[j].origin,
        extremeRays[j].dir,
      );
      if (pt !== null) {
        intersections.push(pt);
      }
    }
  }

  const hull = convexHull(intersections);
  if (hull.length < 3) return null;

  // Convert hull points to [lng, lat] pairs and close the ring
  const ring = hull.map((pt) => {
    const { lat, lng } = ltpToLatLng(pt.x, pt.y, lat0, lng0, lat0Rad);
    return [lng, lat];
  });
  ring.push(ring[0]); // Close ring

  return { type: 'Polygon', coordinates: [ring] };
}

// ---------------------------------------------------------------------------
// Step 6 — Distance from estimate to centroid
// ---------------------------------------------------------------------------

/**
 * Euclidean distance in the LTP (metres).
 */
function ltpDistance(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  return Math.sqrt(dx * dx + dy * dy);
}

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

/**
 * Compute a triangulation result from an array of data points.
 *
 * @param {Array<{lat: number, lng: number, bearing: number, accuracy: number}>} points
 * @returns {{
 *   estimatedLat?: number,
 *   estimatedLng?: number,
 *   confidencePolygon: object | null,
 *   dataPointCount: number,
 *   insufficientSpread: boolean,
 *   lowConfidence: boolean,
 * }}
 */
function computeTriangulation(points) {
  const n = points.length;

  // --- 0 or 1 points: no estimate possible ---
  if (n === 0) {
    return { dataPointCount: 0, insufficientSpread: false, lowConfidence: false };
  }
  if (n === 1) {
    return { dataPointCount: 1, insufficientSpread: false, lowConfidence: false };
  }

  // --- Step 5: Insufficient spread check (before any intersection work) ---
  const bearings = points.map((p) => ((p.bearing % 360) + 360) % 360); // normalise to [0, 360)
  const range = circularBearingRange(bearings);
  if (range < MIN_SPREAD_DEG) {
    return { dataPointCount: n, insufficientSpread: true, lowConfidence: false };
  }

  // --- Step 1: Project observers to LTP ---
  const { points2d, lat0, lng0, lat0Rad } = projectToLTP(points);

  // --- Step 2: Bearing to direction vectors ---
  const directions = bearings.map(bearingToDirection);

  // --- Step 3: Least-squares intersection ---
  const estimated = leastSquaresIntersection(points2d, directions);
  if (estimated === null) {
    // Degenerate — treat as insufficient spread
    return { dataPointCount: n, insufficientSpread: true, lowConfidence: false };
  }

  // --- Step 4: Confidence polygon ---
  const confidencePolygon = buildConfidencePolygon(points2d, bearings, lat0, lng0, lat0Rad);

  // --- Convert estimated point back to lat/lng ---
  const { lat: estimatedLat, lng: estimatedLng } = ltpToLatLng(
    estimated.x,
    estimated.y,
    lat0,
    lng0,
    lat0Rad,
  );

  // --- Step 6: Low-confidence check ---
  // Centroid of observers in LTP is (0, 0) by construction
  const distToObservers = ltpDistance(estimated.x, estimated.y, 0, 0);
  const lowConfidence = distToObservers > LOW_CONFIDENCE_DIST_M;

  return {
    estimatedLat,
    estimatedLng,
    confidencePolygon,
    dataPointCount: n,
    insufficientSpread: false,
    lowConfidence,
  };
}

module.exports = { computeTriangulation };
