# Triangulation Accuracy Overhaul — PRD v1

**March 2026 | Bearings v0.4.0**

---

## 1. Problem Statement

Bearings uses compass-bearing triangulation to estimate the location of observed items. The current algorithm (least-squares ray intersection) treats every observation equally. In practice, field data shows:

1. **Errors of 750m–1350m** against known landmarks, even with 3–5 data points from multiple locations.
2. **No outlier resilience.** A single bad reading (e.g., magnetic interference near metal structures) pulls the estimate significantly. The algorithm cannot distinguish good data from bad.
3. **GPS accuracy is collected but unused.** The `accuracy` field on every data point is stored in Firestore but ignored by the triangulation function.
4. **More data doesn't reliably help.** Adding observations doesn't consistently improve accuracy because outliers are weighted equally with clean readings.

### Baseline measurements (Ancient Gap field session)

| Item | Points | Current error | Notes |
|------|--------|--------------|-------|
| S Tower GGB | 5 | 356m | Best result — most data points, widest spread |
| N Tower GGB | 3 | 744m | Low confidence flag; one reading from Hawk Hill near metal railing |
| Pt Bonita Lighthouse | 3 | 761m | Reasonable spread but significant error |
| Sutro Tower | 2 | N/A | 8.8° spread — fails 10° minimum |

**Target:** Reduce median error to <150m with 3+ well-spread observations, and demonstrate that adding more data improves (or at least doesn't degrade) accuracy.

---

## 2. Goals

1. **Build a real-world test suite** from field data with known ground-truth locations, enabling data-driven algorithm development.
2. **Improve triangulation accuracy** by implementing outlier-robust methods and observation weighting.
3. **Maintain backward compatibility** — the Cloud Function API contract (input/output schema) stays the same.
4. **Validate with data, not theory** — every algorithm change must be measured against the field test fixtures.

---

## 3. Non-Goals

- Changing the data collection UX (handled by #15/#16)
- Client-side triangulation (Cloud Function architecture stays)
- Supporting non-compass bearing sources (e.g., visual alignment)
- Sub-10m precision (we're working with smartphone compasses, not surveying equipment)

---

## 4. Field Data & Test Infrastructure

### 4.1 Ancient Gap Session

The "Ancient Gap" session (dev project, session ID `fruDQ9CF`) contains field observations of four San Francisco Bay Area landmarks taken from multiple vantage points:

| Item | Known location | Points | Vantage points |
|------|---------------|--------|----------------|
| N Tower GGB | 37.8255, -122.4790 | 3 | Hawk Hill overlook, Baker Beach area, Battery Spencer area |
| S Tower GGB | 37.8141, -122.4779 | 5 | Hawk Hill, Battery Spencer, Lands End trail, Baker Beach, Coastal Trail |
| Sutro Tower | 37.7552, -122.4528 | 2 | Battery Spencer area, Coastal Trail |
| Pt Bonita Lighthouse | 37.8158, -122.5297 | 3 | Baker Beach area, Battery Spencer area, Coastal Trail |

### 4.2 Known Data Quality Issues

- **N Tower GGB, point from Hawk Hill (bearing 54.9°):** Suspected magnetic interference from a metal railing at the overlook. Initial analysis shows removing this point actually *improves* the estimate somewhat, but all three readings have significant error — the algorithm flags this as low-confidence (estimate >2km from observer centroid).
- **Sutro Tower:** Only 2 observations with 8.8° angular spread — fails the 10° minimum. The observers were at similar azimuths relative to the target. Needs wider-spread data.

### 4.3 Test Fixture Format

Each item is saved as a JSON file with:
- `name`: Human-readable item name
- `knownLocation`: Ground-truth lat/lng (from authoritative map sources)
- `dataPoints`: Array of raw observation records from Firestore
- `notes`: Optional per-item observations about data quality

### 4.4 Future Data Collection

The test framework should make it easy to add new field sessions as fixtures. Each session that includes known landmarks can be added to the test suite to grow the validation corpus over time.

---

## 5. Algorithm Requirements

### 5.1 Outlier Robustness

The algorithm must be resilient to 1–2 outlier observations in a set of 3–10 points. Approaches to evaluate:

- **RANSAC (Random Sample Consensus):** Sample minimal subsets (2 rays), compute intersection, score by how many other rays pass near it. Choose the model with the most inliers.
- **Iterative Reweighted Least Squares (IRLS):** Start with equal weights, compute estimate, downweight observations with high residuals, repeat.
- **Leave-One-Out (LOO) filtering:** Compute N estimates each excluding one point, discard the point whose removal most improves inter-estimate consistency.
- **Geometric median of pairwise intersections:** Compute all C(n,2) pairwise ray intersections, take the geometric median instead of the mean. More robust to outliers than least-squares.

### 5.2 Observation Weighting

Factors that could improve estimates:
- **GPS accuracy:** Observations with tighter GPS fixes should carry more weight.
- **Angular separation:** Observations from diverse angles are more informative than clustered ones.
- **Residual-based reweighting:** After initial estimate, downweight observations whose bearing residual is large.

### 5.3 Constraints

- Must handle 2-point cases (minimum for any intersection)
- Must run in <100ms for up to 10 observations (Cloud Function cold start budget)
- Output schema unchanged: `{ estimatedLat, estimatedLng, confidencePolygon, dataPointCount, insufficientSpread, lowConfidence }`
- Confidence polygon should reflect the refined estimate, not the raw one

---

## 6. Success Criteria

| Metric | Current | Target |
|--------|---------|--------|
| Median error (3+ pts, Ancient Gap) | 744m | <150m |
| Max error (Ancient Gap items with 3+ pts) | 761m | <400m |
| S Tower GGB (best case, 5 pts) | 356m | <100m |
| Error with outlier vs without | Not yet measured per-point | Outlier rejection brings error within 20% of clean-data estimate |
| Sutro Tower (2 pts, narrow spread) | No estimate | Estimate produced if spread >=5° (stretch) |

---

## 7. Rollout

1. Algorithm changes are pure functions — no infra changes needed
2. Deploy updated Cloud Function to dev, re-run field session to verify live results match test expectations
3. Deploy to prod after validation
4. Monitor GA4 for `triangulation_computed` events and any increase in `lowConfidence` flags
