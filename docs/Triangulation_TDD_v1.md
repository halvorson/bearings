# Triangulation Accuracy Overhaul — TDD v1

**March 2026 | Companion to Triangulation_PRD_v1.md**

---

## 1. Current Algorithm Analysis

### 1.1 Existing Implementation

`functions/src/triangulate.js` implements a 6-step pipeline:

1. **Spread check** — circular bearing range must be >= 10°
2. **LTP projection** — WGS84 → local tangent plane (equirectangular, centroid-centered)
3. **Bearing → direction vectors** — compass degrees to unit (x, y)
4. **Least-squares ray intersection** — solves `A⁻¹b` where `A = Σ(I - ddᵀ)`, `b = Σ(I - ddᵀ)pᵢ`
5. **Confidence polygon** — ±5° extreme rays, all pairwise intersections, convex hull
6. **Low-confidence check** — flag if estimate > 2km from observer centroid

### 1.2 Why It's Inaccurate

The least-squares formulation minimizes the sum of squared perpendicular distances from the estimate to all rays. This is optimal under the assumption that all bearing errors are i.i.d. Gaussian with equal variance. In practice:

- **Compass errors are not equal.** Magnetic interference (metal railings, cars, rebar) can produce 10–30° errors on a single reading, while other readings may be accurate to 2–5°.
- **GPS accuracy varies.** Observer positions have 2–7m uncertainty, but the algorithm treats them as exact.
- **No outlier detection.** A single 20° error shifts the estimate by hundreds of meters because least-squares gives it equal weight.

### 1.3 Field Data Evidence

Leave-one-out analysis on Ancient Gap data reveals:

**S Tower GGB (5 points, 356m baseline error):**
| Point removed | Bearing | Error | Delta |
|--------------|---------|-------|-------|
| None (full) | — | 356m | — |
| 0 (315.4°) | 315.4° | 467m | +111m |
| **1 (101.3°)** | **101.3°** | **53m** | **-302m** |
| 2 (285.4°) | 285.4° | 599m | +243m |
| 3 (8.9°) | 8.9° | 1,325m | +970m |
| **4 (96.7°)** | **96.7°** | **231m** | **-124m** |

Point 1 is a clear outlier — removing it drops error from 356m to 53m. Points 1 and 4 have similar bearings (101° vs 97°) but from different locations (Battery Spencer vs Coastal Trail), so the algorithm should be able to identify point 1 as inconsistent.

**N Tower GGB (3 points, 744m baseline error):**
All three points contribute positively — removing any one increases error. With only 3 points there's no outlier to reject; the error is inherent in compass accuracy from these positions.

---

## 2. Algorithm Design

### 2.1 Approach: Iterative Reweighted Least Squares (IRLS)

IRLS is chosen over RANSAC because:
- RANSAC requires sampling minimal subsets (2 rays) and scoring by inlier count. With only 3–10 points, the sample space is small and RANSAC's random sampling adds variance.
- IRLS builds on the existing least-squares infrastructure, adding a weighting step.
- IRLS naturally incorporates GPS accuracy as a prior weight.

**Algorithm:**

```
function computeTriangulation(points):
  1. Spread check (unchanged)
  2. Project to LTP (unchanged)
  3. Compute initial weights:
     w_i = 1 / max(accuracy_i, 1)   // GPS accuracy prior
  4. Iterate (max 10 rounds, or until convergence):
     a. Weighted least-squares intersection:
        A = Σ w_i (I - d_i d_iᵀ)
        b = Σ w_i (I - d_i d_iᵀ) p_i
        P = A⁻¹ b
     b. Compute residuals:
        r_i = perpendicular distance from P to ray i
     c. Reweight using Huber-like function:
        w_i = (1 / max(accuracy_i, 1)) * huber(r_i, threshold)
     d. Convergence check:
        if max(|P_new - P_old|) < 0.1m: break
  5. Confidence polygon (updated to use final weights)
  6. Low-confidence check (unchanged)
```

### 2.2 Huber Weighting Function

The Huber function provides a smooth transition between full weight (for small residuals) and reduced weight (for large residuals):

```
huber(r, k):
  if |r| <= k:  return 1.0
  else:          return k / |r|
```

The threshold `k` determines where downweighting begins. With smartphone compass errors typically 2–5° and our ray length of 500m:
- A 5° error at 500m distance ≈ 44m perpendicular residual
- A 15° error ≈ 130m residual
- A good threshold: `k = 50m` (starts downweighting beyond ~5° equivalent error)

### 2.3 Residual Calculation

The perpendicular distance from point P to ray (origin `pᵢ`, direction `dᵢ`) is:

```
r_i = |(P - p_i) × d_i|
```

where `×` is the 2D cross product: `(a.x * b.y - a.y * b.x)`.

### 2.4 GPS Accuracy Weighting

The `accuracy` field (meters, 68% confidence radius) is collected on every data point but currently unused. Incorporating it as a prior weight:

```
w_prior_i = 1 / max(accuracy_i, 1)
```

This gives ~2× more weight to a 3m-accuracy fix vs a 6m-accuracy fix. The `max(..., 1)` prevents division by zero and caps the maximum weight.

### 2.5 Convergence

IRLS converges when the estimate moves less than 0.1m between iterations. A hard cap of 10 iterations prevents infinite loops in degenerate cases. In practice, field data converges in 3–5 iterations.

---

## 3. Confidence Polygon Updates

The confidence polygon should reflect the reweighted estimate. Changes:
- Use the final IRLS weights when generating extreme rays
- Heavily downweighted points (weight < 0.1) should be excluded from the polygon computation, as they are treated as outliers
- The polygon still uses ±5° offset rays and convex hull

---

## 4. API Contract

The input/output schema is unchanged:

**Input:** `Array<{ lat, lng, bearing, accuracy }>`

**Output:**
```typescript
{
  estimatedLat?: number;
  estimatedLng?: number;
  confidencePolygon: GeoJSON.Polygon | null;
  dataPointCount: number;
  insufficientSpread: boolean;
  lowConfidence: boolean;
}
```

The Cloud Function (`onDataPointWritten`) calls `computeTriangulation` on every write — algorithm changes propagate automatically with no client updates.

---

## 5. Test Infrastructure

### 5.1 Fixture Location

```
functions/__tests__/fixtures/ancient-gap/
├── session.json                 # Session metadata + baseline results
├── n-tower-ggb.json            # 3 points, known: 37.8255, -122.4790
├── s-tower-ggb.json            # 5 points, known: 37.8141, -122.4779
├── sutro-tower.json            # 2 points, known: 37.7552, -122.4528
└── pt-bonita-lighthouse.json   # 3 points, known: 37.8155, -122.5297
```

### 5.2 Test File

`functions/__tests__/triangulate.field.test.js` contains:
- **Baseline accuracy tests** — one per item, asserts error within current bounds
- **Leave-one-out analysis** — logs per-point impact for diagnostic purposes
- **Regression guards** — as accuracy targets are met, bounds are tightened

### 5.3 Running Tests

```bash
cd functions && npx vitest run
```

Runs both `triangulate.test.js` (synthetic cases) and `triangulate.field.test.js` (field data).

---

## 6. Implementation Plan

### Step 1 — Test fixtures and baseline (DONE)
**Status:** Complete. Fixtures saved, baseline tests passing.

### Step 2 — Weighted least-squares (GPS accuracy prior)
**Agent:** Opus writes, Opus reviews
**Files:** `functions/src/triangulate.js`

Add GPS accuracy weighting to `leastSquaresIntersection`:
1. Accept an optional `weights` array parameter
2. Multiply each observation's contribution to `A` and `b` by `w_i`
3. Compute initial weights from GPS accuracy: `w_i = 1 / max(accuracy_i, 1)`
4. Pass weights through from `computeTriangulation`

**Validation:** Run field tests. GPS weighting alone may produce marginal improvement since accuracy values in the Ancient Gap data are all similar (2–6m).

### Step 3 — IRLS iteration loop
**Agent:** Opus writes, Opus reviews
**Files:** `functions/src/triangulate.js`

Wrap the weighted least-squares in an iteration loop:
1. Compute initial estimate with GPS-only weights
2. Calculate per-ray residuals (perpendicular distance)
3. Apply Huber reweighting: `w_i *= huber(r_i, 50)`
4. Re-solve weighted least-squares
5. Repeat until convergence (< 0.1m movement) or 10 iterations

**Validation:** S Tower GGB should improve significantly — the outlier at bearing 101.3° should get downweighted. Target: < 150m error.

### Step 4 — Confidence polygon update
**Agent:** Opus writes, Opus reviews
**Files:** `functions/src/triangulate.js`

Update `buildConfidencePolygon` to:
1. Accept final weights
2. Exclude points with weight < 0.1 from polygon computation
3. Ensure polygon reflects the refined estimate

### Step 5 — Tighten test bounds
**Agent:** Opus
**Files:** `functions/__tests__/triangulate.field.test.js`

After validating improvements:
1. Tighten assertion bounds to lock in gains
2. Add new assertions for outlier detection (S Tower GGB point 1 should have low final weight)
3. Ensure existing synthetic tests still pass (no regressions)

### Step 6 — Docs update
**Agent:** Sonnet writes
**Files:** `docs/Triangulation_PRD_v1.md`, `docs/Triangulation_TDD_v1.md`

Update with final accuracy numbers and any algorithm tuning decisions.

### Step 7 — Deploy and validate
**Agent:** Opus
1. Deploy updated Cloud Function to dev
2. Open Ancient Gap session — verify live triangulation matches test expectations
3. Deploy to prod after validation

---

## 7. Performance Budget

The Cloud Function runs on every data point write. Current execution: < 5ms for 10 points.

IRLS adds iteration overhead:
- 10 iterations × 10 points × O(1) matrix ops = negligible
- Residual computation: O(n) per iteration
- **Expected total:** < 10ms for 10 points, well within the 100ms budget

---

## 8. Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| IRLS doesn't converge | Low — well-studied algorithm | Hard cap at 10 iterations; fall back to initial estimate |
| Huber threshold too aggressive | Medium | Threshold is tunable; validate on field data before deploying |
| Over-fitting to Ancient Gap data | Medium | Algorithm uses general statistical principles, not data-specific rules. Add more field sessions over time. |
| 2-point case regresses | Low | 2-point case bypasses IRLS (no residuals to compute with 2 rays) |
| Existing synthetic tests break | Low | IRLS with equal weights reduces to standard LS; existing tests should pass unchanged |
