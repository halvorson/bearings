/**
 * Leave-One-Item-Out Cross-Validation
 *
 * For each held-out item:
 *   1. On the 5 training items, sweep Huber threshold to find best median error
 *   2. Evaluate on the held-out item with the chosen threshold
 *
 * This separates "does the approach generalize?" from "did we overfit the threshold?"
 *
 * Variants tested (principled, not ad-hoc):
 *   A — Current production IRLS (perpendicular residuals, Huber 50m, no declination)
 *   B — Declination 12.88° only (physics fix, no algorithm change)
 *   C — Declination + angular IRLS (threshold tuned per fold)
 *   D — Self-calibrating bias (no fixed declination) + angular IRLS (threshold tuned)
 *   E — Declination + self-calibrating + angular IRLS (threshold tuned)
 *
 * Run: node functions/__tests__/cross-validation.cjs
 */

const { computeTriangulation } = require('../src/triangulate.js');

const EARTH_RADIUS = 6371000;
function toRad(deg) { return deg * Math.PI / 180; }
function toDeg(rad) { return rad * 180 / Math.PI; }

function haversineDistance(lat1, lng1, lat2, lng2) {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat/2)**2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng/2)**2;
  return EARTH_RADIUS * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// -----------------------------------------------------------------------
// Configurable triangulation engine
// -----------------------------------------------------------------------

function wlsIntersect(origins, dirs, weights) {
  let a00=0, a01=0, a10=0, a11=0, bx=0, by=0;
  for (let i = 0; i < origins.length; i++) {
    const w = weights[i];
    const {x:px,y:py} = origins[i];
    const {x:dx,y:dy} = dirs[i];
    const m00=w*(1-dx*dx), m01=w*(-dx*dy), m10=w*(-dy*dx), m11=w*(1-dy*dy);
    a00+=m00; a01+=m01; a10+=m10; a11+=m11;
    bx += m00*px + m01*py;
    by += m10*px + m11*py;
  }
  const det = a00*a11 - a01*a10;
  if (Math.abs(det) < 1e-10) return null;
  return { x: (a11*bx - a01*by)/det, y: (-a10*bx + a00*by)/det };
}

function bearingToDir(b) {
  const r = toRad(b);
  return { x: Math.sin(r), y: Math.cos(r) };
}

function triangulate(points, opts = {}) {
  const {
    declination = 0,
    huberThreshold = 50,   // metres for perpendicular, degrees for angular
    maxIter = 10,
    useAngularResiduals = false,
    selfCalibrate = false,
    selfCalRange = [-5, 25],
    selfCalStep = 0.5,
  } = opts;

  const n = points.length;
  if (n < 2) return { estimatedLat: undefined };

  let bearings = points.map(p => ((p.bearing + declination) % 360 + 360) % 360);

  // Spread check
  const sorted = bearings.slice().sort((a,b) => a-b);
  let largestGap = 0;
  for (let i = 0; i < n; i++) {
    const next = sorted[(i+1)%n], curr = sorted[i];
    const gap = i < n-1 ? next-curr : 360-curr+sorted[0];
    if (gap > largestGap) largestGap = gap;
  }
  if (360 - largestGap < 10) return { estimatedLat: undefined, insufficientSpread: true };

  const lat0 = points.reduce((s,p) => s+p.lat, 0)/n;
  const lng0 = points.reduce((s,p) => s+p.lng, 0)/n;
  const lat0Rad = toRad(lat0);

  const origins = points.map(p => ({
    x: EARTH_RADIUS * toRad(p.lng - lng0) * Math.cos(lat0Rad),
    y: EARTH_RADIUS * toRad(p.lat - lat0),
  }));

  // Self-calibrate: find bearing bias that minimizes total squared perpendicular residuals
  if (selfCalibrate && n >= 3) {
    let bestBias = 0, bestResid = Infinity;
    for (let bias = selfCalRange[0]; bias <= selfCalRange[1]; bias += selfCalStep) {
      const tb = bearings.map(b => ((b + bias) % 360 + 360) % 360);
      const dirs = tb.map(bearingToDir);
      const est = wlsIntersect(origins, dirs, points.map(() => 1));
      if (!est) continue;
      let totalR = 0;
      for (let i = 0; i < n; i++) {
        const vx = est.x - origins[i].x, vy = est.y - origins[i].y;
        const perp = Math.abs(vx * dirs[i].y - vy * dirs[i].x);
        totalR += perp * perp;
      }
      if (totalR < bestResid) { bestResid = totalR; bestBias = bias; }
    }
    bearings = bearings.map(b => ((b + bestBias) % 360 + 360) % 360);
  }

  const directions = bearings.map(bearingToDir);
  const accuracies = points.map(p => p.accuracy);
  const weights = accuracies.map(a => 1 / Math.max(a ?? 1, 1));

  let estimated = wlsIntersect(origins, directions, weights);
  if (!estimated) return { estimatedLat: undefined };

  // IRLS for n > 3 only (n<=3 is too few to reliably identify outliers)
  if (n > 3) {
    for (let iter = 0; iter < maxIter; iter++) {
      for (let i = 0; i < n; i++) {
        const prior = 1 / Math.max(accuracies[i] ?? 1, 1);
        let residual;
        if (useAngularResiduals) {
          const toEstX = estimated.x - origins[i].x, toEstY = estimated.y - origins[i].y;
          const dist = Math.sqrt(toEstX*toEstX + toEstY*toEstY);
          if (dist < 1) residual = 0;
          else {
            const cosA = (toEstX*directions[i].x + toEstY*directions[i].y) / dist;
            residual = toDeg(Math.acos(Math.max(-1, Math.min(1, cosA))));
          }
        } else {
          const vx = estimated.x - origins[i].x, vy = estimated.y - origins[i].y;
          residual = Math.abs(vx * directions[i].y - vy * directions[i].x);
        }
        weights[i] = prior * (residual <= huberThreshold ? 1.0 : huberThreshold / residual);
      }
      const newEst = wlsIntersect(origins, directions, weights);
      if (!newEst) break;
      const dx = newEst.x - estimated.x, dy = newEst.y - estimated.y;
      estimated = newEst;
      if (Math.sqrt(dx*dx + dy*dy) < 0.1) break;
    }
  }

  const lat = lat0 + toDeg(estimated.y / EARTH_RADIUS);
  const lng = lng0 + toDeg(estimated.x / (EARTH_RADIUS * Math.cos(lat0Rad)));
  return { estimatedLat: lat, estimatedLng: lng, dataPointCount: n };
}

// -----------------------------------------------------------------------
// Dataset
// -----------------------------------------------------------------------

const items = [
  {
    name: "S Tower GGB",
    known: { lat: 37.814059454854515, lng: -122.47788705223233 },
    dataPoints: [
      { lat: 37.8070059175949, lng: -122.47245773818342, bearing: 315.41265869140625, accuracy: 4.748651530191762 },
      { lat: 37.826978809244316, lng: -122.49917590935753, bearing: 101.28266906738281, accuracy: 6.16133448169341 },
      { lat: 37.80625283705569, lng: -122.45493258839372, bearing: 285.409423828125, accuracy: 4.443235172697603 },
      { lat: 37.80041265989814, lng: -122.47824105785354, bearing: 8.905256271362305, accuracy: 3.1133771787241575 },
      { lat: 37.824107437339514, lng: -122.52738450926171, bearing: 96.66275024414062, accuracy: 4.748651530191761 },
      { lat: 37.829856837722026, lng: -122.48328792494281, bearing: 153.46546936035156, accuracy: 5.5118072550260839 },
      { lat: 37.805461545179519, lng: -122.4302154604831, bearing: 272.28326416015625, accuracy: 6.56816943908373 },
    ],
  },
  {
    name: "N Tower GGB",
    known: { lat: 37.82547835516429, lng: -122.47897218629134 },
    dataPoints: [
      { lat: 37.807003794959115, lng: -122.47246218868105, bearing: 331.8048095703125, accuracy: 4.748651530191761 },
      { lat: 37.800414615665495, lng: -122.47823770796029, bearing: 6.9012274742126465, accuracy: 4.748651530191761 },
      { lat: 37.826963751513844, lng: -122.49917055980461, bearing: 54.9205322265625, accuracy: 4.210217522099167 },
      { lat: 37.829855308826446, lng: -122.48329337601332, bearing: 132.2901611328125, accuracy: 5.9565323734662909 },
      { lat: 37.805462601189589, lng: -122.43021774007404, bearing: 287.97674560546875, accuracy: 4.9666847898319526 },
    ],
  },
  {
    name: "Pt Bonita",
    known: { lat: 37.8155, lng: -122.5297 },
    dataPoints: [
      { lat: 37.800398865098217, lng: -122.47821367672969, bearing: 302.61065673828125, accuracy: 6.1695494157505513 },
      { lat: 37.827205375627592, lng: -122.50209701195439, bearing: 228.08985900878906, accuracy: 2.3898306316937719 },
      { lat: 37.824111592503144, lng: -122.5273985709097, bearing: 181.14750671386719, accuracy: 5.8829967180406939 },
    ],
  },
  {
    name: "Sutro Tower",
    known: { lat: 37.7552, lng: -122.4528 },
    dataPoints: [
      { lat: 37.824109693850829, lng: -122.52738936967157, bearing: 129.72857666015625, accuracy: 4.7486515301917622 },
      { lat: 37.784580353695056, lng: -122.4502003422633, bearing: 172.07489013671875, accuracy: 4.8122410418191643 },
      { lat: 37.77090814579303, lng: -122.45548190539751, bearing: 165.35845947265625, accuracy: 7.199440424319631 },
      { lat: 37.760752728627018, lng: -122.4267078359202, bearing: 242.434326171875, accuracy: 4.7486515301917613 },
      { lat: 37.757619930314959, lng: -122.40036978046906, bearing: 258.04156494140625, accuracy: 5.8696168391362651 },
    ],
  },
  {
    name: "Alcatraz",
    known: { lat: 37.82711069461153, lng: -122.42301697676008 },
    dataPoints: [
      { lat: 37.829860729706731, lng: -122.4832906365242, bearing: 79.2196273803711, accuracy: 4.8866143948658127 },
      { lat: 37.792098394975184, lng: -122.45847804496017, bearing: 26.880962371826172, accuracy: 7.2087860636392449 },
      { lat: 37.805476286295765, lng: -122.4302144199369, bearing: 5.7052350044250488, accuracy: 4.7486515301917613 },
      { lat: 37.816672388582205, lng: -122.37218120308765, bearing: 277.85870361328125, accuracy: 7.6645236425347774 },
    ],
  },
  {
    name: "Salesforce Tower",
    known: { lat: 37.78986287257681, lng: -122.39722297466544 },
    dataPoints: [
      { lat: 37.816668132021633, lng: -122.37218496875852, bearing: 210.28285217285156, accuracy: 5.88526573907736 },
      { lat: 37.7576463579453, lng: -122.40021267014518, bearing: 352.66336059570312, accuracy: 14.24595459057527 },
      { lat: 37.760752728627018, lng: -122.4267078359202, bearing: 32.725788116455078, accuracy: 7.9461684179711867 },
      { lat: 37.816668362796541, lng: -122.3721830758699, bearing: 210.33181762695312, accuracy: 6.2104690792663932 },
    ],
  },
];

// -----------------------------------------------------------------------
// Variant definitions
// -----------------------------------------------------------------------

// Variants A and B have no tunable parameters — evaluated directly
// Variants C, D, E have huberThreshold tuned per fold

function makeVariantOpts(variant, huberThreshold) {
  switch (variant) {
    case 'A': return {}; // use production computeTriangulation
    case 'B': return { declination: 12.88 };
    case 'C': return { declination: 12.88, useAngularResiduals: true, huberThreshold };
    case 'D': return { selfCalibrate: true, useAngularResiduals: true, huberThreshold };
    case 'E': return { declination: 12.88, selfCalibrate: true, useAngularResiduals: true, huberThreshold };
    default: throw new Error('Unknown variant: ' + variant);
  }
}

function evalItem(item, opts, useProduction) {
  let result;
  if (useProduction) {
    result = computeTriangulation(item.dataPoints.map(p => ({
      lat: p.lat, lng: p.lng, bearing: p.bearing, accuracy: p.accuracy,
    })));
  } else {
    result = triangulate(item.dataPoints.map(p => ({
      lat: p.lat, lng: p.lng, bearing: p.bearing, accuracy: p.accuracy,
    })), opts);
  }
  if (result.estimatedLat == null) return null;
  return Math.round(haversineDistance(
    result.estimatedLat, result.estimatedLng,
    item.known.lat, item.known.lng
  ));
}

// -----------------------------------------------------------------------
// LOIO Cross-Validation
// -----------------------------------------------------------------------

console.log("=".repeat(90));
console.log("LEAVE-ONE-ITEM-OUT CROSS-VALIDATION");
console.log("=".repeat(90));
console.log("\nFor variants C/D/E: Huber threshold is tuned on the 5 training items,");
console.log("then the held-out item is evaluated with the chosen threshold.\n");

const HUBER_CANDIDATES = [5, 8, 10, 12, 15, 20, 30, 50];
const variantNames = ['A', 'B', 'C', 'D', 'E'];
const variantDescs = {
  A: 'Current production (IRLS, perp residuals, Huber 50m)',
  B: 'Declination 12.88° only',
  C: 'Decl 12.88° + angular IRLS (threshold tuned)',
  D: 'Self-cal + angular IRLS (threshold tuned)',
  E: 'Decl 12.88° + self-cal + angular IRLS (threshold tuned)',
};

// Store per-fold results
const foldResults = {}; // variant -> [{ heldOut, error, tunedThreshold }]
for (const v of variantNames) foldResults[v] = [];

for (let holdOut = 0; holdOut < items.length; holdOut++) {
  const testItem = items[holdOut];
  const trainItems = items.filter((_, i) => i !== holdOut);

  console.log(`\nFold ${holdOut + 1}/6: held out = ${testItem.name} (${testItem.dataPoints.length} pts)`);
  console.log("-".repeat(70));

  for (const variant of variantNames) {
    if (variant === 'A') {
      // No tuning — just evaluate
      const err = evalItem(testItem, {}, true);
      foldResults[variant].push({ heldOut: testItem.name, error: err, tunedThreshold: 'N/A' });
      console.log(`  ${variant}: ${err !== null ? err + 'm' : 'N/A'}`);
    } else if (variant === 'B') {
      // No tuning — just declination
      const err = evalItem(testItem, { declination: 12.88 }, false);
      foldResults[variant].push({ heldOut: testItem.name, error: err, tunedThreshold: 'N/A' });
      console.log(`  ${variant}: ${err !== null ? err + 'm' : 'N/A'}`);
    } else {
      // Tune Huber threshold on training set
      let bestThreshold = 10, bestTrainMedian = Infinity;
      for (const h of HUBER_CANDIDATES) {
        const opts = makeVariantOpts(variant, h);
        const trainErrors = trainItems.map(item => evalItem(item, opts, false)).filter(e => e !== null);
        trainErrors.sort((a, b) => a - b);
        const median = trainErrors[Math.floor(trainErrors.length / 2)];
        if (median < bestTrainMedian) {
          bestTrainMedian = median;
          bestThreshold = h;
        }
      }

      // Evaluate on held-out item with tuned threshold
      const opts = makeVariantOpts(variant, bestThreshold);
      const err = evalItem(testItem, opts, false);
      foldResults[variant].push({ heldOut: testItem.name, error: err, tunedThreshold: bestThreshold });
      console.log(`  ${variant}: ${err !== null ? err + 'm' : 'N/A'} (tuned Huber=${bestThreshold}° on train set, train median=${bestTrainMedian}m)`);
    }
  }
}

// -----------------------------------------------------------------------
// Summary: cross-validated performance
// -----------------------------------------------------------------------

console.log(`\n${"=".repeat(90)}`);
console.log("CROSS-VALIDATED RESULTS SUMMARY");
console.log("=".repeat(90));

console.log("\n" + "Variant".padEnd(55) + "Median".padStart(8) + "Mean".padStart(8) + "Max".padStart(8) + "  Per-item errors");
console.log("-".repeat(120));

for (const v of variantNames) {
  const errors = foldResults[v].map(r => r.error).filter(e => e !== null);
  const sorted = errors.slice().sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];
  const mean = Math.round(errors.reduce((s, e) => s + e, 0) / errors.length);
  const max = Math.max(...errors);

  const perItem = foldResults[v].map(r => `${r.heldOut.substring(0,8)}:${r.error ?? 'N/A'}`).join('  ');
  console.log(`${v}: ${variantDescs[v].padEnd(52)} ${String(median).padStart(8)} ${String(mean).padStart(8)} ${String(max).padStart(8)}  ${perItem}`);
}

// -----------------------------------------------------------------------
// Non-cross-validated (full dataset) for reference
// -----------------------------------------------------------------------

console.log(`\n${"=".repeat(90)}`);
console.log("FULL-DATASET RESULTS (for reference — NOT cross-validated)");
console.log("=".repeat(90));

// For tunable variants, pick best Huber on ALL items (this is the "overfit" number)
console.log("\n" + "Variant".padEnd(55) + "Median".padStart(8) + "Mean".padStart(8) + "Max".padStart(8) + "  Huber");
console.log("-".repeat(90));

for (const v of variantNames) {
  if (v === 'A' || v === 'B') {
    const errors = items.map(item => evalItem(item, v === 'A' ? {} : { declination: 12.88 }, v === 'A')).filter(e => e !== null);
    const sorted = errors.slice().sort((a,b) => a-b);
    console.log(`${v}: ${variantDescs[v].padEnd(52)} ${String(sorted[Math.floor(sorted.length/2)]).padStart(8)} ${String(Math.round(errors.reduce((s,e)=>s+e,0)/errors.length)).padStart(8)} ${String(Math.max(...errors)).padStart(8)}  N/A`);
  } else {
    let bestH = 10, bestMed = Infinity;
    for (const h of HUBER_CANDIDATES) {
      const opts = makeVariantOpts(v, h);
      const errors = items.map(item => evalItem(item, opts, false)).filter(e => e !== null);
      const sorted = errors.slice().sort((a,b) => a-b);
      const med = sorted[Math.floor(sorted.length/2)];
      if (med < bestMed) { bestMed = med; bestH = h; }
    }
    const opts = makeVariantOpts(v, bestH);
    const errors = items.map(item => evalItem(item, opts, false)).filter(e => e !== null);
    const sorted = errors.slice().sort((a,b) => a-b);
    console.log(`${v}: ${variantDescs[v].padEnd(52)} ${String(sorted[Math.floor(sorted.length/2)]).padStart(8)} ${String(Math.round(errors.reduce((s,e)=>s+e,0)/errors.length)).padStart(8)} ${String(Math.max(...errors)).padStart(8)}  ${bestH}`);
  }
}

// -----------------------------------------------------------------------
// Convergence: does more data help? (for winning variant)
// -----------------------------------------------------------------------

console.log(`\n${"=".repeat(90)}`);
console.log("CONVERGENCE: More data → better estimate? (per variant)");
console.log("=".repeat(90));

const convergenceItems = items.filter(item => item.dataPoints.length >= 4);

for (const v of variantNames) {
  let totalTransitions = 0, worseCount = 0, worseDelta = 0, totalDelta = 0;

  for (const item of convergenceItems) {
    let prevErr = null;
    for (let k = 2; k <= item.dataPoints.length; k++) {
      const subset = { ...item, dataPoints: item.dataPoints.slice(0, k) };
      let err;
      if (v === 'A') {
        err = evalItem(subset, {}, true);
      } else if (v === 'B') {
        err = evalItem(subset, { declination: 12.88 }, false);
      } else {
        // Use a fixed reasonable threshold for convergence test (not tuned per fold)
        err = evalItem(subset, makeVariantOpts(v, 10), false);
      }
      if (err !== null && prevErr !== null) {
        totalTransitions++;
        const delta = err - prevErr;
        totalDelta += delta;
        if (delta > 0) { worseCount++; worseDelta += delta; }
      }
      if (err !== null) prevErr = err;
    }
  }

  const pctWorse = (100 * worseCount / totalTransitions).toFixed(0);
  const avgWorseDelta = worseCount > 0 ? Math.round(worseDelta / worseCount) : 0;
  const avgDelta = Math.round(totalDelta / totalTransitions);
  console.log(`  ${v}: ${worseCount}/${totalTransitions} transitions worse (${pctWorse}%), avg damage when worse: +${avgWorseDelta}m, avg delta/pt: ${avgDelta}m`);
}

// -----------------------------------------------------------------------
// PRD success criteria check (best variant)
// -----------------------------------------------------------------------

console.log(`\n${"=".repeat(90)}`);
console.log("PRD SUCCESS CRITERIA CHECK");
console.log("=".repeat(90));

const prdTargets = {
  'Median error (3+ pts)': { target: 150, op: '<' },
  'Max error (3+ pts)': { target: 400, op: '<' },
  'S Tower GGB': { target: 100, op: '<' },
};

for (const v of variantNames) {
  console.log(`\n  Variant ${v}: ${variantDescs[v]}`);

  // Get errors for items with 3+ pts
  const threeplus = items.filter(i => i.dataPoints.length >= 3);
  let errors;
  if (v === 'A') {
    errors = threeplus.map(item => ({ name: item.name, err: evalItem(item, {}, true) }));
  } else if (v === 'B') {
    errors = threeplus.map(item => ({ name: item.name, err: evalItem(item, { declination: 12.88 }, false) }));
  } else {
    errors = threeplus.map(item => ({ name: item.name, err: evalItem(item, makeVariantOpts(v, 10), false) }));
  }

  const validErrors = errors.filter(e => e.err !== null);
  const errVals = validErrors.map(e => e.err);
  const sorted = errVals.slice().sort((a,b) => a-b);
  const median = sorted[Math.floor(sorted.length/2)];
  const max = Math.max(...errVals);
  const sTower = validErrors.find(e => e.name === 'S Tower GGB');

  console.log(`    Median (3+ pts): ${median}m ${median < 150 ? '✓' : '✗'} (target <150m)`);
  console.log(`    Max (3+ pts): ${max}m ${max < 400 ? '✓' : '✗'} (target <400m)`);
  console.log(`    S Tower GGB: ${sTower?.err ?? 'N/A'}m ${(sTower?.err ?? Infinity) < 100 ? '✓' : '✗'} (target <100m)`);
  for (const e of validErrors) {
    console.log(`      ${e.name}: ${e.err}m`);
  }
}
