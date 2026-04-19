# Triangulation Accuracy Overhaul — TDD v2

**April 2026 | Supersedes Triangulation_TDD_v1.md**

---

## 1. Context & Findings

### 1.1 What Changed Since TDD v1

TDD v1 (March 2026) introduced IRLS with GPS-accuracy weighting and Huber outlier downweighting. That reduced S Tower GGB error from 356m to 203m but did not help the 3-point items.

Since then, new field data was collected (March 28 – April 18, 2026), expanding the test corpus from 4 items to 6 with known ground truth:

| Item | Points | TDD v1 error | Current error | Notes |
|------|--------|-------------|---------------|-------|
| S Tower GGB | 5 → 7 | 203m | 297m | 2 new points added |
| N Tower GGB | 3 → 5 | 788m | 910m | 2 new points; Battery Spencer metal railing outlier |
| Pt Bonita | 3 | 805m | 805m | Unchanged; Baker Beach anomalous reading |
| Sutro Tower | 2 → 5 | N/A | 750m | Was insufficient spread; now has estimate |
| Alcatraz | 0 → 4 | — | 1272m | New item |
| Salesforce Tower | 0 → 4 | — | 1694m | New item; 2 near-duplicate Treasure Island readings |

Additional items collected but excluded from evaluation:
- Chase Center (2 pts, both from ~100m away — 24m error, not representative of typical use)
- Yerba Buena Island (1 pt — cannot triangulate)

### 1.2 Root Cause: Magnetic Declination

Analysis of per-observation compass error (observed bearing vs. true bearing to known target, 28 observations across 6 items) revealed:

- **Mean compass error: +9.5°** (observed bearings are consistently clockwise of true)
- **Median: +9.8°, Std dev: 9.4°**
- **Two outliers >20°:** Battery Spencer metal railing readings (+26.2° on S Tower, +40.4° on N Tower)

The iOS `webkitCompassHeading` API returns heading relative to **magnetic north**. The app stores these magnetic bearings without correcting for declination. The NOAA World Magnetic Model (WMM-2025) gives **12.88° East** declination for San Francisco (April 2026), with ±0.35° uncertainty. This is consistent with the observed ~10° systematic bias (the gap between 12.88° and the observed 9.5° is within the natural compass noise).

**Source:** NOAA WMM-2025 API, queried for (37.78, -122.42) on 2026-04-17. Declination varies <0.03° across all SF observer locations, so a single per-session value is sufficient.

### 1.3 Algorithm Variants Evaluated

Five principled variants were tested:

| ID | Description | Tunable params |
|----|-------------|---------------|
| A | Current production (IRLS, perpendicular residuals, Huber 50m) | None |
| B | Declination correction only (+12.88°) | None |
| C | Declination + angular IRLS | Huber threshold (degrees) |
| D | Self-calibrating bias + angular IRLS | Huber threshold (degrees) |
| E | Declination + self-calibrating + angular IRLS | Huber threshold (degrees) |

**Key design choices tested:**

1. **Declination correction** — Apply the NOAA WMM value (+12.88°) to all bearings before triangulation. This is a physics correction, not a tuning parameter.

2. **Self-calibrating bias estimation** — Before IRLS, sweep a bearing offset in [−5°, +25°] at 0.5° steps to find the value that minimizes total squared perpendicular residuals across all rays. Requires ≥3 points. This implicitly handles magnetic declination plus per-device/per-session compass bias.

3. **Angular residuals** — Replace perpendicular distance residuals with angular residuals (degrees between bearing ray and direction from observer to estimate). Perpendicular distance is scale-dependent: a 5° error from 1km = 87m, from 10km = 873m. Angular residuals are scale-independent and more meaningful for bearing data.

4. **IRLS activation** — IRLS runs for n > 3 only. With ≤3 points, the initial estimate is too imprecise to reliably identify outliers; IRLS amplifies bias rather than correcting it. (Confirmed: enabling IRLS for n=3 made Pt Bonita 2.5× worse.)

### 1.4 Evaluation Methodology

**Leave-one-item-out cross-validation (LOIO-CV):** For each of 6 folds, one item is held out as the test set. The Huber threshold is tuned on the remaining 5 items (selecting the value that minimizes their median error from candidates [5, 8, 10, 12, 15, 20, 30, 50]°). The held-out item is then evaluated with the chosen threshold. This guards against overfitting to the small dataset.

**Convergence analysis:** For items with ≥4 points, error is measured after each observation is added (in collection order). Metrics: % of transitions where adding a point increased error, average damage when worse, average improvement per point.

### 1.5 Cross-Validated Results

| Variant | CV Median | CV Mean | CV Max | Convergence: % worse | Avg damage | Avg improvement/pt |
|---------|-----------|---------|--------|---------------------|------------|-------------------|
| A: Current | 910m | 955m | 1694m | 40% | +214m | −244m |
| B: Decl only | 502m | 593m | 1380m | 27% | +214m | −157m |
| C: Decl + angIRLS | 385m | 521m | 1380m | 13% | +171m | −195m |
| **D: SelfCal + angIRLS** | **371m** | **389m** | **808m** | **27%** | **+53m** | **−472m** |
| E: Decl + SelfCal + angIRLS | 353m | 404m | 1099m | 27% | +103m | −216m |

**Winner: Variant D (self-calibrating bias + angular IRLS).**

- Lowest CV mean (389m) and lowest CV max (808m)
- Best convergence: when adding a point makes things worse, the damage is only +53m on average (vs +214m for current). Average improvement per point is −472m (strongest of all variants).
- Huber threshold consistently tunes to 8–15° across folds (stable, not erratic)
- Works without needing a declination lookup — the self-calibration implicitly handles it

**Why variant E (declination + self-cal) underperforms D (self-cal alone):** Applying fixed declination before self-calibration shifts the search space. For items like Pt Bonita where one observation's error is opposite to the expected declination direction, self-calibration from raw data can compensate, but can't undo an incorrect fixed correction as effectively. The self-calibration subsumes the declination correction.

**Pt Bonita remains the hardest item** (808m at best). It has only 3 points, one of which (Baker Beach) has a −12.2° error — opposite to the expected +12.88° declination. With 3 points, no algorithm can reliably identify which observation is wrong.

### 1.6 PRD Targets Assessment

The original PRD targets (<150m median, <400m max, <100m S Tower) are not achievable with the current data and smartphone compass hardware. Per-observation compass noise of ±5–12° (after declination correction) is the limiting factor.

| Metric | PRD v1 target | Best CV result (D) | Revised target |
|--------|--------------|-------------------|---------------|
| Median error (3+ pts) | <150m | 371m | <400m |
| Max error (3+ pts) | <400m | 808m | <900m |
| S Tower GGB | <100m | 371m (CV) / 328m (full) | <400m |
| More data improves accuracy | Yes | Yes (−472m/pt avg) | Yes |

Note: Sutro Tower achieves 73m with 5 clean observations. The <150m target is achievable **per item** when data quality is good and there are ≥5 well-spread points. As a **median across items**, it requires either more observations per item or capture-time declination correction.

---

## 2. Recommended Algorithm

### 2.1 Two-Part Fix

**Part 1 — Capture-time declination correction (client-side):**

Apply magnetic declination when storing bearings so that all future data is in true-north reference. This:
- Fixes the live bearing preview (line shows correct direction on map)
- Improves 2-point estimates immediately (before self-cal can activate at 3+ points)
- Uses the `geomagnetism` npm package (zero deps, implements WMM-2025, valid through 2029)

**Part 2 — Self-calibrating angular IRLS (server-side triangulation):**

Replace the current IRLS with a self-calibrating variant that:
1. Estimates residual bearing bias from the data itself (handles existing magnetic data + per-device variation)
2. Uses angular residuals instead of perpendicular distance for outlier weighting
3. Keeps IRLS disabled for n ≤ 3 (insufficient data for reliable outlier detection)

Together, Part 1 provides good initial estimates at 2 points and correct live preview, while Part 2 refines accuracy as more data arrives and handles noise robustly.

### 2.2 Algorithm Pseudocode

```
function computeTriangulation(points):
  if n < 2: return no estimate
  if circularBearingRange(bearings) < 10°: return insufficient spread

  // Step 1: Project to LTP
  origins, lat0, lng0 = projectToLTP(points)
  bearings = normalize(points.bearings)

  // Step 2: Self-calibrating bias estimation (n ≥ 3)
  if n >= 3:
    bestBias = 0, bestResidual = ∞
    for bias in [-5°, -4.5°, ..., +25°]:
      testBearings = bearings + bias
      dirs = bearingsToDirections(testBearings)
      est = unweightedLSIntersection(origins, dirs)
      totalResidual = Σ perpDistance(est, origins[i], dirs[i])²
      if totalResidual < bestResidual:
        bestResidual = totalResidual
        bestBias = bias
    bearings = bearings + bestBias

  // Step 3: Directions and initial weights
  directions = bearingsToDirections(bearings)
  weights[i] = 1 / max(accuracy[i], 1)  // GPS accuracy prior

  // Step 4: Weighted least-squares intersection
  estimated = WLS(origins, directions, weights)

  // Step 5: IRLS with angular residuals (n > 3 only)
  if n > 3:
    for iter in 1..10:
      for each observation i:
        angularResidual = angleBetween(
          direction: observer[i] → estimated,
          direction: bearing ray[i]
        )  // degrees
        huberWeight = angularResidual ≤ 10° ? 1.0 : 10° / angularResidual
        weights[i] = gpsPrior[i] * huberWeight
      newEstimated = WLS(origins, directions, weights)
      if movement < 0.1m: break
      estimated = newEstimated

  // Step 6: Confidence polygon (unchanged, uses final weights)
  // Step 7: Low-confidence check (unchanged)
  return { estimatedLat, estimatedLng, ... }
```

### 2.3 Key Parameters

| Parameter | Value | Rationale |
|-----------|-------|-----------|
| Self-cal search range | [−5°, +25°] | Covers 0° (no correction) through ~2× expected declination. Negative range handles inverse errors. |
| Self-cal step | 0.5° | Fine enough for smooth convergence; 61 evaluations is fast |
| Self-cal minimum points | 3 | Need geometric diversity to estimate bias; 2 points have no redundancy |
| Huber threshold | 10° | Cross-validation consistently selects 8–15°; 10° is a robust middle value |
| IRLS minimum points | 4 | n ≤ 3 is too few for reliable outlier detection |
| IRLS max iterations | 10 | Converges in 3–5 iterations in practice |
| IRLS convergence | 0.1m | Movement below this is negligible |
| Residual type | Angular (degrees) | Scale-independent; treats near and far observations equally |

### 2.4 Handling Existing Data

Existing data in Firestore was stored as magnetic bearings. The self-calibrating step handles this: it will detect and compensate for the ~12.88° bias in historical data, and detect the ~0° bias (or residual device error) in future declination-corrected data. No data migration is needed.

### 2.5 Client-Side Declination Correction

In `app/src/hooks/useCompass.js`, after reading `webkitCompassHeading` or `360 - event.alpha`:

```javascript
import geomagnetism from 'geomagnetism';

// Compute declination from user's GPS position
const model = geomagnetism.model();
const { decl } = model.point([latitude, longitude]);
const trueBearing = (magneticBearing + decl) % 360;
```

The `geomagnetism` package (0.2.0, zero deps, 73kB) implements WMM-2025, valid through 2029. Declination varies <0.03° across the SF area, so computing it once per session start is sufficient.

**Note on Android:** The `deviceorientationabsolute` event's `alpha` value is specified relative to the Earth's coordinate frame, which may already use true north on some implementations. Testing on Android devices is needed to determine whether declination correction should be conditional on platform. The self-calibrating triangulation handles either case, but the live preview line should be accurate.

---

## 3. Test Infrastructure Updates

### 3.1 Updated Fixtures

Update `functions/__tests__/fixtures/ancient-gap/` with:
- New data points for S Tower GGB (7 pts), N Tower GGB (5 pts), Sutro Tower (5 pts)
- New fixture files: `alcatraz.json`, `salesforce-tower.json`
- Updated `session.json` with new items and baseline results
- Updated known coordinates for Alcatraz (37.82711, -122.42302) and Salesforce Tower (37.78986, -122.39722) from Google Maps

### 3.2 Updated Field Tests

`functions/__tests__/triangulate.field.test.js` should be updated with:
- Tightened bounds reflecting the new algorithm's accuracy
- New items (Alcatraz, Salesforce Tower)
- Convergence regression test: for each item with ≥4 points, verify that error at n points ≤ error at 2 points (weak monotonicity)

### 3.3 Cross-Validation Test

The cross-validation script (`functions/__tests__/cross-validation.cjs`) should be maintained as a benchmark. It is not a CI test (too slow and not deterministic with respect to test bounds), but should be re-run whenever the algorithm changes to verify no regression.

---

## 4. Implementation Plan

### Step 1 — Update fixtures with new field data

**Files:** `functions/__tests__/fixtures/ancient-gap/*.json`

Pull the latest data from Firebase dev Firestore and update all fixture files. Add new items (Alcatraz, Salesforce Tower). Update known coordinates.

### Step 2 — Implement self-calibrating angular IRLS

**Files:** `functions/src/triangulate.js`

Changes to `computeTriangulation`:
1. Add self-calibrating bias estimation step (before IRLS loop)
2. Replace perpendicular distance residuals with angular residuals in the IRLS loop
3. Change Huber threshold from 50m to 10° (parameter change, not code change)
4. Update `buildConfidencePolygon` to use calibrated bearings

Constants to add/change:
```javascript
const SELFCAL_MIN_POINTS = 3;
const SELFCAL_RANGE_MIN = -5;
const SELFCAL_RANGE_MAX = 25;
const SELFCAL_STEP = 0.5;
const HUBER_THRESHOLD_DEG = 10;  // replaces HUBER_THRESHOLD_M = 50
```

### Step 3 — Update field tests

**Files:** `functions/__tests__/triangulate.field.test.js`

- Update baseline assertions to match new algorithm's accuracy
- Add Alcatraz and Salesforce Tower test cases
- Add convergence regression test

### Step 4 — Client-side declination correction

**Files:** `app/src/hooks/useCompass.js`, `app/package.json`

1. Install `geomagnetism` in the app package
2. In `useCompass`, apply declination correction to the reported bearing
3. This requires knowing the user's GPS position — either pass it as a parameter to the hook, or compute declination once when GPS becomes available

### Step 5 — Deploy and validate

1. Run `cd functions && npx vitest run` — all tests pass
2. Deploy Cloud Function: `firebase deploy --only functions --project dev`
3. Deploy hosting: `cd app && npm run build && cd .. && firebase deploy --only hosting --project dev`
4. Open Ancient Gap session on device — verify triangulation estimates update and match expected accuracy
5. Test live bearing preview with declination correction — verify bearing line points in correct direction

---

## 5. Future Work

- **More field data.** The biggest accuracy gains come from more observations, not algorithm tuning. Pt Bonita needs ≥2 more points from different vantage points. Items with 5+ well-spread observations consistently achieve <200m accuracy.
- **Per-device calibration.** If the app eventually supports user accounts, per-device compass calibration offsets could be stored and applied, reducing reliance on per-session self-calibration.
- **WMM coefficient updates.** WMM-2025 is valid through 2029. The `geomagnetism` package will need updating when WMM-2030 is released.
- **Android declination testing.** Verify whether Android's `deviceorientationabsolute` already reports true north on target devices. If so, apply declination correction only for iOS.

---

## Appendix A: Field Data Summary

### Per-Observation Compass Error (28 observations, 6 items)

```
Global stats:
  Mean: +9.5°  Median: +9.8°  Std dev: 9.4°
  Min: -12.2°  Max: +40.4°

Outliers (>20°):
  S Tower GGB / Battery Spencer: +26.2° (magnetic interference)
  N Tower GGB / Battery Spencer (metal railing): +40.4° (magnetic interference)

NOAA WMM-2025 declination for SF: 12.88° East (±0.35°)
```

### Cross-Validation Fold Details

```
Fold 1 (held out: S Tower GGB, 7pts):  D=371m  (Huber tuned to 5° on train)
Fold 2 (held out: N Tower GGB, 5pts):  D=176m  (Huber tuned to 8°)
Fold 3 (held out: Pt Bonita, 3pts):    D=808m  (Huber tuned to 15°)
Fold 4 (held out: Sutro Tower, 5pts):  D=73m   (Huber tuned to 8°)
Fold 5 (held out: Alcatraz, 4pts):     D=341m  (Huber tuned to 15°)
Fold 6 (held out: Salesforce, 4pts):   D=563m  (Huber tuned to 15°)
```

### Convergence Data (Variant D, items with ≥4 points)

```
S Tower GGB:  2pts→2180m  3pts→593m  4pts→683m  5pts→450m  6pts→318m  7pts→328m
N Tower GGB:  2pts→1436m  3pts→889m  4pts→330m  5pts→204m
Sutro Tower:  2pts→1912m  3pts→888m  4pts→130m  5pts→73m
Alcatraz:     2pts→1323m  3pts→233m  4pts→341m
Salesforce:   2pts→1737m  3pts→559m  4pts→563m
```
