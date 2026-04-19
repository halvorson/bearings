# Bearings — To-Do Tracker

## Workflow

1. **Opus** triages: reads relevant code, determines tier, writes a spec for the implementer
2. **Writer agent** (tier-appropriate) implements in a worktree
3. **Reviewer agent** (tier-appropriate) reviews the diff
4. **Opus** merges, runs tests, deploys if needed

**Tiers:**
- **small** — Haiku writes, Sonnet reviews (typos, config, simple wiring)
- **medium** — Sonnet writes, Opus reviews (bug fixes, features, multi-file changes)
- **large** — Opus writes, Opus reviews (architecture, complex math, security)

## Items

| #  | Status | Tier   | Summary                                                                                  |
|----|--------|--------|------------------------------------------------------------------------------------------|
| 1  | done   | medium | Cannot delete a datapoint — added 44px hit area, toast on error, token mismatch warning  |
| 2  | done   | medium | Map auto-zoom to fit points + intersection on item load — fitBounds with padding          |
| 3  | done   | medium | Intersection clearly displays error/uncertainty — confidence polygon outline + opacity    |
| 4  | done   | medium | Impossible intersection notification — context-aware messages, prompt to remove/new item  |
| 5  | done   | small  | Bottom padding — pb-4 → pb-6 on Mark CTA container                                      |
| 6  | done   | small  | Version number — v0.2.0, injected via Vite define, shown in header                       |
| 7  | done   | medium | Delete fixed — removed window.confirm, delete-on-tap with error toast                    |
| 8  | done   | medium | Auto-zoom — keyed fitBounds with lastFittedItemRef, re-fits on item switch + new points   |
| 9  | done   | small  | "Tap Mark to enable compass" → "Tap Record to capture a bearing"                         |
| 10 | done   | small  | CTA button: "Mark" → "Record"                                                           |
| 11 | done   | small  | Error polygon investigated — correct math, large shape due to similar bearings (4° + 27°) |
| 12 | done   | small  | Bottom padding — replaced conflicting pb-6/pb-safe-b with max() inline style              |
| 13 | done   | medium | Home button in SessionHeader — navigate back to home screen from any session               |
| 14 | done   | medium | Recent sessions on Home — localStorage-backed "Jump Back In" list with timeAgo + remove    |
| 15 | open   | large  | Live bearing preview — show user location + real-time directional vector on map before saving (see spec below) |
| 16 | open   | medium | Directional guidance — when in "start bearing" mode, show which way to turn to face the selected item (see spec below) |
| 17 | open   | large  | Triangulation accuracy overhaul — pull "Ancient Gap" field data as test fixtures, improve intersection algorithm for outlier robustness (see spec below) |
| 18 | open   | small  | Ship client-side declination correction — fix already in working tree (useCompass.js), just needs commit + deploy (see spec below) |
| 19 | open   | medium | Confidence polygon is too large visually — rethink display of triangulation uncertainty (see spec below) |

---

## #15 — Live Bearing Preview

**Version:** minor bump (v0.3.0)
**Tier:** large — touches CTA flow, Mapbox layers, compass/GPS integration, state management
**Problems solved:**
1. Once a user has an item to find, it's unclear whether they're facing it or where it is relative to them
2. Known-wrong angles get saved and then deleted; previewing before saving would reduce deletion rate

**User flow:**
1. Map loads with existing data points (if any)
2. User taps **"Start Bearing"** CTA
3. User's current GPS location appears on the map as a marker, with a real-time directional vector (line/ray) showing the compass heading they're currently facing — updates live as the device rotates
4. User aims their device, confirms the bearing looks correct on the map
5. User taps **"Save Bearing"** CTA
6. The reading is persisted (same as current "Record" flow), appears on the map as a saved data point
7. CTA resets to **"Start Bearing"**
8. Triangulation is **not** recalculated until the reading is saved

**Implementation notes:**
- CTA transitions: idle → "Start Bearing" → (previewing) → "Save Bearing" → idle
- GPS: use `navigator.geolocation.watchPosition` during preview mode for live location
- Compass: use existing device orientation subscription for live heading
- Mapbox: add a temporary source/layer for the preview marker + bearing line; remove on save or cancel
- The preview vector should be visually distinct from saved bearings (e.g., dashed line, different color, or animated)
- Consider a "Cancel" action (tap "Start Bearing" again, or explicit cancel button) to exit preview without saving
- This replaces the current single-tap "Record" CTA with a two-step flow

**Docs updates required:**
- Update PRD (`docs/Bearings_PRD_v0.3.md`) with the new capture flow and CTA states
- Update TDD (`docs/Bearings_TDD_v0.2.md`) with preview layer architecture, GPS/compass subscription lifecycle, and state machine

### Implementation Plan

#### Step 0 — Branch & version bump
**Agent:** Opus (coordinator)

1. Create branch `feature/live-bearing-preview` from `main`
2. Bump `app/package.json` version to `0.3.0`
3. Commit: `chore: bump version to v0.3.0 for live bearing preview`

---

#### Step 1 — Docs updates (PRD + TDD)
**Agent:** 1× Sonnet (writer), Opus reviews
**Depends on:** Step 0

Update docs to reflect the new capture flow before writing code. Two Sonnet workers run in parallel:

**Worker A — PRD update** (`docs/Bearings_PRD_v0.3.md`):
- Add "Live Bearing Preview" to the feature list
- Replace the current single-tap capture flow description with the two-step Start → Save flow
- Document the new CTA states (idle / previewing / saving)
- Add acceptance criteria for the preview feature

**Worker B — TDD update** (`docs/Bearings_TDD_v0.2.md`):
- Add a "Preview Mode" section covering:
  - CTA state machine: `idle → previewing → saving → idle`
  - Zustand store additions (`previewMode`, `previewLat`, `previewLng`, `previewBearing`)
  - Mapbox sources/layers for the live preview (source: `preview-location`, `preview-bearing-ray`; layers: `preview-marker`, `preview-ray`)
  - GPS/compass subscription lifecycle (start on "Start Bearing", stop on save/cancel)
  - Cancel flow behavior
- Update the existing data flow diagram to show the preview step

**Review:** Opus reviews both doc diffs for consistency with each other and with the existing spec.

---

#### Step 2 — State management
**Agent:** 1× Sonnet (writer), Opus reviews
**Depends on:** Step 1

**Files touched:**
- `app/src/store/useSessionStore.js`

**Tasks:**
1. Add preview state to the Zustand store:
   - `previewMode: false` — whether the user is currently previewing
   - `startPreview()` — sets `previewMode: true`
   - `stopPreview()` — sets `previewMode: false`
2. No new hooks yet — GPS and compass hooks already exist and will be wired in Step 4

**Review:** Opus reviews for clean state boundaries and no regressions to existing store consumers.

---

#### Step 3 — Mapbox preview layers
**Agent:** 1× Sonnet (writer), Opus reviews
**Depends on:** Step 2

**Files touched:**
- `app/src/components/MapView.jsx`

**Tasks:**
1. In `addSourcesAndLayers()`, add two new GeoJSON sources:
   - `preview-location` — Point for the user's current GPS position
   - `preview-bearing-ray` — LineString for the live bearing vector
2. Add corresponding layers:
   - `preview-marker` — circle layer, distinct color (green or white), with pulsing opacity or ring to distinguish from saved observer points
   - `preview-ray` — line layer, dashed (`line-dasharray`), distinct color (amber/yellow), to distinguish from saved blue bearing rays
3. Add a `useEffect` that updates these sources when `previewMode` is active:
   - Reads live `lat`, `lng`, `bearing` from props/hooks
   - Computes ray endpoint (reuse existing ray-length logic, 500m)
   - Sets source data to the live GeoJSON; clears to empty FeatureCollection when preview stops
4. Ensure preview layers render above saved layers but below the triangulation point

**Review:** Opus reviews for correct Mapbox lifecycle (no leaked sources/layers), visual distinction from saved data, and performance (updates should not cause full repaints).

---

#### Step 4 — TrackButton refactor (two-step CTA)
**Agent:** 1× Sonnet (writer), Opus reviews
**Depends on:** Steps 2 + 3

**Files touched:**
- `app/src/components/TrackButton.jsx`

**Tasks:**
1. Replace the single-tap "Record" flow with a two-step flow:
   - **Idle state:** Button reads "Start Bearing" (amber). On tap → call `startPreview()`, enter preview mode.
   - **Previewing state:** Button reads "Save Bearing" (green). On tap → execute the existing save logic (addDoc to Firestore), then call `stopPreview()`.
   - **Saving state:** Button reads "Saving…" (disabled/gray) — same as current.
2. Add a **Cancel** affordance:
   - Small "Cancel" text button or secondary button next to "Save Bearing"
   - On tap → call `stopPreview()`, return to idle without saving
3. iOS compass permission request still happens on first "Start Bearing" tap (before entering preview)
4. GPS/compass hooks are already running (via `useCompass` and `useGeolocation` in the Session page) — no new subscriptions needed, just pass live values to MapView when `previewMode` is true
5. Keep the manual `CaptureOverlay` flow as a fallback when compass is unsupported — that flow remains single-step

**Review:** Opus reviews for:
- Correct state transitions (no stuck states)
- iOS permission edge cases
- GPS-unavailable edge case (should disable "Start Bearing" with message, same as current)
- No regressions to manual capture overlay flow

---

#### Step 5 — Integration wiring
**Agent:** 1× Sonnet (writer), Opus reviews
**Depends on:** Step 4

**Files touched:**
- `app/src/pages/Session.jsx` — wire preview state + live GPS/compass values to MapView
- `app/src/components/MapView.jsx` — accept and use preview props

**Tasks:**
1. In `Session.jsx`, read `previewMode` from the store and pass it along with live `lat`, `lng`, `bearing` to `MapView`
2. In `MapView.jsx`, consume these props in the preview layer `useEffect` from Step 3
3. When `previewMode` transitions to `true`, auto-pan the map to center on the user's GPS position (fly to with moderate zoom)
4. When `previewMode` transitions to `false` after a save, trigger the existing auto-zoom/fitBounds logic to include the new point

**Review:** Opus reviews for prop threading correctness, no unnecessary re-renders, and smooth map transitions.

---

#### Step 6 — Build, deploy, smoke test
**Agent:** Opus (coordinator)
**Depends on:** Step 5

1. `cd app && npm run build` — verify clean build, no warnings
2. `cd .. && firebase deploy --only hosting --project dev` — deploy to dev
3. Manual smoke test checklist (user tests on device):
   - [ ] Tap "Start Bearing" → own location + bearing ray appear on map in real time
   - [ ] Rotate device → ray updates live
   - [ ] Walk a few steps → marker position updates
   - [ ] Tap "Save Bearing" → point saved, appears as blue dot + ray, CTA resets
   - [ ] Triangulation recalculates after save (if ≥2 points)
   - [ ] Tap "Start Bearing" then "Cancel" → returns to idle, nothing saved
   - [ ] Manual capture overlay still works when compass unavailable
   - [ ] Delete mode still works on saved points
   - [ ] Auto-zoom works after save
   - [ ] Version shows v0.3.0 in header

---

#### Step 7 — PR & merge
**Agent:** Opus (coordinator)
**Depends on:** Step 6 smoke test passing

1. Commit all changes (should already be committed per-step)
2. Open PR: `feature/live-bearing-preview → main`
3. Merge after user approval

---

### Agent summary

| Step | Writer | Reviewer | Parallelizable |
|------|--------|----------|----------------|
| 0 — Branch + version | Opus | — | — |
| 1A — PRD update | Sonnet | Opus | Yes (with 1B) |
| 1B — TDD update | Sonnet | Opus | Yes (with 1A) |
| 2 — Zustand store | Sonnet | Opus | No |
| 3 — Mapbox layers | Sonnet | Opus | No |
| 4 — TrackButton refactor | Sonnet | Opus | No |
| 5 — Integration wiring | Sonnet | Opus | No |
| 6 — Build + deploy | Opus | User (smoke test) | — |
| 7 — PR + merge | Opus | User (approval) | — |

Steps 2–5 are sequential because each builds on the prior step's output. Steps 1A and 1B can run as parallel Sonnet workers since they touch independent files.

---

## #16 — Directional Guidance (Turn Indicator)

**Version:** same minor (v0.3.x) or next patch after #15
**Tier:** medium — builds on #15's live preview infrastructure
**Depends on:** #15 (live bearing preview must be implemented first)

**Problem:** When in "Start Bearing" preview mode, if the user has an existing triangulation estimate for the selected item, they have no guidance on which direction to turn to face it.

**Feature:**
- When previewing (after tapping "Start Bearing"), if the current item has a triangulation estimate, show a directional indicator telling the user which way to turn (e.g., "Turn left 45°", an arrow overlay, or a compass-style arc showing the angle between current heading and target bearing)
- This helps users orient toward the item before saving a new bearing, improving accuracy

**Implementation notes:**
- Calculate the bearing from user's current GPS position to the item's triangulated location
- Compare with the device's current compass heading to get the relative angle
- Display as a UI overlay or map annotation during preview mode
- Only shown when item has an existing triangulation estimate

**Docs updates required:**
- Update PRD with directional guidance feature description
- Update TDD with bearing-to-target calculation and UI overlay specs

---

## #17 — Triangulation Accuracy Overhaul

**Version:** v0.4.0 (or later)
**Tier:** large — algorithm R&D, test infrastructure, math-heavy
**Depends on:** None (independent of #15/#16)

**Problem:**
The current least-squares ray intersection algorithm (`functions/src/triangulate.js`) treats all observations equally — one wildly inaccurate bearing pulls the estimate significantly. With more data points, the algorithm should get *more* precise, not more susceptible to outliers. There is no mechanism for outlier rejection or observation weighting.

**Goal:**
Build a real-world test suite from field data, then use it to develop and validate a more robust triangulation algorithm that improves precision as data density increases, even in the presence of outlier bearings.

### Step 1 — Pull and save "Ancient Gap" field data as test fixtures

**This is the critical first step. Do this before any algorithm work.**

1. **Pull data from Firestore (prod).** The session is named "Ancient Gap" in the `bearings-app-prod` project. Use the Firebase Admin SDK or `firebase` CLI to export all items and their data points:
   - Path: `sessions/{sessionId}/items/{itemId}/dataPoints`
   - For each item, export: item name, and all data points (lat, lng, bearing, accuracy, timestamp, participantToken)
   - Find the session by querying for name = "Ancient Gap", or ask the user for the session ID if needed

2. **Save as JSON fixture files** in the repo at `functions/__tests__/fixtures/ancient-gap/`:
   - `session.json` — session metadata
   - One file per item, named by slug (e.g., `n-tower-ggb.json`, `s-tower-ggb.json`, `sutro-tower.json`, `pt-bonita-lighthouse.json`)
   - Each item file contains:
     ```json
     {
       "name": "N Tower GGB",
       "knownLocation": { "lat": ..., "lng": ... },
       "dataPoints": [ { "lat": ..., "lng": ..., "bearing": ..., "accuracy": ..., "timestamp": "..." }, ... ]
     }
     ```
   - **Answer key:** Each item is a real, known landmark. Look up and record the actual lat/lng coordinates:
     - **North Tower, Golden Gate Bridge:** 37.82548, -122.47897 (from Google Maps satellite)
     - **South Tower, Golden Gate Bridge:** 37.81406, -122.47789 (from Google Maps satellite)
     - **Sutro Tower:** 37.7552, -122.4528
     - **Pt. Bonita Lighthouse:** 37.8155, -122.5297

3. **Write baseline tests** in `functions/__tests__/triangulate.field.test.js`:
   - For each item, run `computeTriangulation(item.dataPoints)` and measure Haversine distance from `estimatedLat/Lng` to `knownLocation`
   - Record current accuracy as baseline (don't assert tight bounds yet — just log/snapshot)
   - Flag the known outlier: N Tower GGB has one reading from Hawk Hill that is wildly off (likely magnetic interference from a metal railing)
   - Test with and without the outlier to measure its impact on accuracy

4. **Document the outlier.** In the fixture file or a companion `notes.md`, record:
   - Which data point is the Hawk Hill outlier (by index or timestamp)
   - Why it's suspected bad (magnetic interference from metal railing)
   - The accuracy delta when it's included vs excluded

### Step 2 — Algorithm improvements (after Step 1 is validated)

With test fixtures and baselines in place, explore algorithm improvements:

1. **Outlier rejection candidates:**
   - RANSAC-style: find the largest consensus set of bearings that agree
   - Iterative reweighted least squares (IRLS): downweight observations with high residuals
   - Leave-one-out: compute N estimates, discard the observation whose removal most improves consistency
   - Median-based: use geometric median of pairwise intersections instead of least-squares mean

2. **Observation weighting candidates:**
   - Weight by GPS accuracy (the `accuracy` field is collected but currently unused)
   - Weight by residual from initial estimate (iterative refinement)
   - Weight by angular separation from other bearings (wider spread = more informative)

3. **Validation criteria:**
   - Each algorithm variant must be tested against all 4 Ancient Gap items
   - Accuracy must improve (or not regress) on clean data
   - Accuracy must significantly improve on data with outliers (N Tower GGB)
   - Algorithm must still handle 2-point cases gracefully

### Step 3 — Docs updates

- Update TDD (`docs/Bearings_TDD_v0.2.md`) with the new algorithm specification
- Update PRD (`docs/Bearings_PRD_v0.3.md`) with improved accuracy as a feature
- Document the test fixture methodology for future field data collection

### Implementation notes

- **Existing algorithm:** `computeTriangulation()` in `functions/src/triangulate.js` — least-squares ray intersection, no outlier handling, `accuracy` field unused
- **Existing tests:** `functions/__tests__/triangulate.test.js` — synthetic cases + one real-world regression (Woodpile, 2 points)
- **Test runner:** Vitest (`cd functions && npx vitest`)
- **The Cloud Function** (`onDataPointWritten`) calls `computeTriangulation` on every data point write — algorithm changes propagate automatically
- Step 1 (fixture extraction) needs `firebase` CLI access to `bearings-app-prod` Firestore

---

## #18 — Ship client-side declination correction

**Version:** v0.3.1 (patch)
**Tier:** small — the fix already exists as uncommitted changes in the working tree
**Depends on:** None

**Problem:**
Stored bearings on dev are ~10–13° west of reality in the SF Bay Area, confirmed against known S Tower GGB readings from Marin Headlands and Presidio (off by −12.5° and −10.6° respectively). Expected magnetic declination in SF is +12.88° E. Root cause: v0.3.0 (currently deployed) does not apply any magnetic→true-north correction; it stores `webkitCompassHeading` verbatim.

**Evidence the fix is already written (uncommitted):**
- `app/src/hooks/useCompass.js` adds `geomagnetism` import, `computeDeclination(lat, lng)` with a 5km cache, a `declinationRef`, and `if (isMagnetic) newBearing += declinationRef.current;`
- `app/package.json` already bumped to `0.3.1` with `geomagnetism` dep
- `CaptureOverlay.jsx`, `TrackButton.jsx`, `Session.jsx` all pass `{ lat, lng }` into `useCompass(...)`
- `app/node_modules/geomagnetism` is installed
- Deployed bundle at `bearings-app-dev.web.app` confirmed to contain NO declination logic

**Plan:**
1. **Writer (Sonnet):** commit working-tree changes with a focused message (subject: `v0.3.1: client-side magnetic declination correction`). Only stage `app/src/hooks/useCompass.js`, `app/src/components/CaptureOverlay.jsx`, `app/src/components/TrackButton.jsx`, `app/src/pages/Session.jsx`, `app/package.json`, `app/package-lock.json`. Leave the triangulate.js / fixtures / docs changes out of this commit — they belong with #17.
2. **Reviewer (Haiku):** spot-check the commit for:
   - Sign convention: `geomagnetism` returns positive-East declination; `TrueBearing = MagneticBearing + decl` is correct
   - `isMagnetic` guarding: Android `deviceorientationabsolute` with `event.absolute === true` must NOT get declination added (already handled by `isMagnetic = !event.absolute`)
   - No double-correction: no caller adds declination again
   - `declinationRef` updates via `useEffect([lat, lng])`, orientation handler reads the ref (so no stale closure)
3. **Build + deploy:** `cd app && npm run build && cd .. && firebase deploy --only hosting --project dev`
4. **Smoke test (user):** re-record a bearing from a known vantage point toward S Tower GGB; confirm ray now lands on the tower.
5. **Migration note:** existing stored data points on prod and dev still have uncorrected magnetic bearings. Don't back-fill — the self-cal step in `computeTriangulation` (n≥3) already absorbs a global bearing bias, so mixed-vintage sessions with ≥3 points will re-triangulate correctly. Document this in the commit.

---

## #19 — Rethink confidence polygon display

**Version:** v0.3.2 (or later; independent of #18)
**Tier:** medium — visualization + light algorithm work, user-facing
**Depends on:** None (but pairs well with #17)

**Problem:**
The red dashed confidence polygon on the map is now visually dominating — often much larger than the actual estimate uncertainty after the new IRLS + self-cal math tightens the point estimate. The current polygon is built from a fixed ±5° wedge on each saved bearing and the convex hull of all pairwise extreme-ray intersections (`functions/src/triangulate.js:377 buildConfidencePolygon`). That geometry is technically correct but pessimistic: at km-scale ray lengths, ±5° sweeps out hundreds of meters, regardless of how well the rays actually agree.

**Goal:**
Display an uncertainty region that reflects the *posterior* uncertainty of the triangulation (how well the rays agree) rather than a worst-case envelope of each single ray.

**Candidate approaches (explore in this order):**
1. **Residual-scaled sigma.** After IRLS, compute the weighted RMS residual of the bearings. Use that (plus GPS accuracy) to derive a covariance of the estimate via the linearized least-squares formula `Σ = (JᵀWJ)⁻¹ × σ²`. Draw a 1σ or 2σ ellipse around the estimate. This is the standard triangulation uncertainty ellipse and will collapse nicely as rays agree.
2. **Downrange-scaled wedge.** Replace the fixed ±5° with a wedge whose half-angle scales with residuals (e.g., `max(1°, 2× RMS residual)`), and clip it at reasonable ray lengths.
3. **Just drop the polygon entirely when residuals are tight.** If RMS residual < threshold, show only the point + a small error circle; show the polygon only for genuinely ambiguous cases.

**Implementation Plan**

#### Step 1 — Instrument + baseline
**Writer:** Sonnet in a worktree
**Reviewer:** Opus

1. In `functions/src/triangulate.js`, compute and expose the weighted RMS residual and covariance Σ as part of the result (don't change the polygon yet).
2. Add a field test: for each Ancient Gap fixture, log RMS residual, covariance 1σ/2σ axis lengths, and the current polygon area. This gives us a baseline for tuning.

#### Step 2 — Error ellipse rendering
**Writer:** Sonnet in a worktree
**Reviewer:** Opus (polygon/Mapbox layer work is the kind of thing where visual regressions hide; Opus should skim the diff)

1. Return `errorEllipse: { semiMajor, semiMinor, orientation, centerLat, centerLng }` from the Cloud Function (kept in Firestore as a plain object, not nested arrays — follow the existing `JSON.stringify(confidencePolygon)` convention if needed).
2. In `MapView.jsx`, replace the `confidence-polygon` source with an ellipse GeoJSON built from the same `destinationPoint` helper already in the file (sweep 64 points, scale by semi-major/minor).
3. Keep the existing polygon only as a fallback for n=2 (where covariance is ill-defined).
4. Soften the fill: `fill-opacity: 0.1`, outline `line-width: 1.5`, `line-opacity: 0.4`. The visual should whisper, not shout.

#### Step 3 — Tune and ship
**Writer:** Sonnet
**Reviewer:** Haiku (final visual pass)

1. Tune the sigma multiplier (1σ vs 2σ) using the Ancient Gap fixtures as ground truth: the ellipse should contain the true location ~68% or ~95% of the time across items.
2. Add a fixture test asserting the ellipse contains `knownLocation` for each Ancient Gap item.
3. Deploy to dev, smoke test with existing sessions.

**Docs updates required:**
- TDD: document the covariance computation and ellipse convention
- PRD: brief update replacing "confidence polygon" with "error ellipse"

### Agent summary

| Step | Writer | Reviewer |
|------|--------|----------|
| 1 — Instrument residuals + covariance | Sonnet (worktree) | Opus |
| 2 — Ellipse rendering (functions + MapView) | Sonnet (worktree) | Opus |
| 3 — Tune + test + deploy | Sonnet | Haiku |
