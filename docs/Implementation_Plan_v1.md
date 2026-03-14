# Bearings — Implementation Plan v1
**March 2026 · For use with Opus coordinator + Sonnet/Haiku workers**
**Companion to TDD v0.2**

---

## Decision Log

| # | Question | Decision |
|---|---|---|
| 1 | Local dev environment | `.env.local` in `/app` with Firebase config, Mapbox token, GA ID |
| 2 | Firebase emulators | Yes — Firestore (8080) + Functions (5001) + Emulator UI (4000) |
| 3 | 10-point cap enforcement | Client-side only |
| 4 | `itemIndex` determination | `itemCount` field on session doc, incremented atomically |
| 5 | Client-side triangulation preview | No — wait for Cloud Function result |
| 6 | Compass calibration UX | Show warning when accuracy is poor |
| 7 | Error states | Descriptive in dev (with copy button), generic in prod |
| 8 | Concurrent name edits | Last-write-wins |
| 9 | Triangulation quality | `lowConfidence` flag when estimate >2km from observers; UI prompt to delete/retry |
| 10 | Firebase config format | Must be valid JSON (double-quoted keys) — fixed in .env.local |

---

## Phase -1: Preflight Verification
**Agent: Haiku**
**Depends on: All manual setup complete**

Verify all CLIs, credentials, and services are configured. Fail fast on any misconfig.

### Tasks:
1. Verify CLI versions:
   - `node --version` → 20+
   - `firebase --version`
   - `gh --version`
   - `git --version`
2. Verify Firebase CLI auth:
   - `firebase projects:list` → should list `bearings-app-dev` and `bearings-app-prod`
3. Verify GitHub CLI auth:
   - `gh auth status`
   - `gh secret list` → should show all 8 secrets
4. Verify Firebase projects:
   - `firebase use dev` → `firebase firestore:indexes` (confirms Firestore enabled)
   - `firebase use prod` → `firebase firestore:indexes`
5. Verify `app/.env.local` exists with non-placeholder values
6. Verify Firebase config decodes to valid JSON:
   - Base64-decode `VITE_FIREBASE_CONFIG` → `JSON.parse()` succeeds
7. Verify Mapbox token is valid:
   - HTTP request to Mapbox styles API with the dev token

### Checkpoint -1:
All checks green, or specific remediation steps printed. **Do NOT proceed until all pass.**

---

## Phase 0: Project Scaffold & Config
**Agent: 1 Sonnet**
**Depends on: Phase -1 green**

### Tasks:
1. Create full directory structure per TDD v0.2 §3.1
2. Write `firebase.json` with emulators block per TDD §3.2
3. Write `.firebaserc` per TDD §3.3
4. Write `.gitignore` (node_modules, dist, .env.local, .firebase/, *.log, etc.)
5. Initialize `app/package.json`:
   - React 18, Vite, Tailwind CSS v3, Zustand, Firebase JS SDK v10, Mapbox GL JS v3, React Router v6, vite-plugin-pwa
6. Initialize `functions/package.json`:
   - firebase-functions v4, firebase-admin
   - Dev deps: vitest (for triangulation tests)
7. Vite config with Tailwind + env variable handling
8. Tailwind config + base CSS
9. Write both GitHub Actions workflow files per TDD §3.4–3.5
10. Write `firestore.rules` per TDD §4.2 (includes `itemCount` in session rules)
11. Write `firestore.indexes.json` per TDD §4.3
12. Write `app/.env.local.example` (template with placeholder values)
13. `npm install` in both `/app` and `/functions`

### Checkpoint 0:
- `npm install` succeeds in both dirs
- `npm run dev` starts Vite (blank page OK)
- `firebase emulators:start` launches without errors
- All config files present and correct

### PR → Haiku review before merge

---

## Phase 1: Cloud Function — Triangulation
**Agents: 1 Sonnet (implementation) + 1 Haiku (tests) — in parallel**
**Depends on: Phase 0 merged**

### Sonnet tasks:
1. `functions/src/triangulate.js` — pure math module implementing TDD §5.2 steps 1–6:
   - LTP projection (equirectangular)
   - Bearing → direction vector
   - Least-squares ray intersection (2×2 normal equation)
   - Confidence polygon (convex hull of ±5° ray intersections)
   - Insufficient spread check (circular bearing range < 10°)
   - Low confidence check (estimate >2km from observer centroid)
2. `functions/src/index.js` — `onDocumentWritten` trigger per TDD §5.3

### Haiku tasks (parallel):
3. `functions/__tests__/triangulate.test.js`:
   - 2 perpendicular bearings → known intersection point (verify within 1m)
   - 2 near-parallel bearings → `insufficientSpread: true`
   - 0 points → no estimate, count 0
   - 1 point → partial result, count 1, no estimate
   - 3+ points from different angles → estimate converges near expected point
   - Wrap-around bearings (355° and 5°) → NOT flagged as insufficient spread
   - Same GPS position, different bearings → no error, valid result
   - Confidence polygon has ≥3 vertices for valid 2+ point cases
   - Estimate far from observers → `lowConfidence: true`

### Checkpoint 1:
- All unit tests pass (`npm test` in `/functions`)
- Function deploys to emulator without errors

### PR → **Sonnet review** (math correctness is critical)

---

## Phase 2: Frontend Core Shell
**Agents: 2 Sonnets in parallel**
**Depends on: Phase 0 merged**

### Worker A — Infrastructure:
1. `src/lib/firebase.js` — SDK init + emulator connection in dev (TDD §6.1)
2. `src/lib/words.js` — adjective-noun generator, ~200×200 (TDD §6.5)
3. `src/lib/analytics.js` — GA4 thin wrapper (TDD §9.1)
4. `src/lib/errors.js` — error utilities per TDD §13
5. `src/store/useSessionStore.js` — Zustand (TDD §6.3)
6. `App.jsx` with query-param routing + ErrorBoundary wrapper (TDD §6.2)

### Worker B — Hooks:
1. `useSession(sessionId)` — real-time session doc listener
2. `useItems(sessionId)` — real-time items collection, ordered by createdAt
3. `useDataPoints(sessionId, itemId)` — real-time data points listener
4. `useTriangulation(sessionId, itemId)` — real-time triangulation result listener
5. `useGeolocation()` — GPS watchPosition, error handling, accuracy tracking
6. `useCompass()` — DeviceOrientation + iOS permission + calibrationQuality field

### Checkpoint 2:
- `npm run dev` boots without errors
- Routing works: `/` shows Home placeholder, `/?s=test` shows Session placeholder
- Firebase connects to emulator in dev mode
- No console errors on load

### PR → Haiku review

---

## Phase 3: Home Page & Session Creation
**Agent: 1 Sonnet**
**Depends on: Phase 2 merged**

### Tasks:
1. `pages/Home.jsx` — landing page with "Start New Session" CTA, mobile-first
2. Session creation logic:
   - Generate 8-char URL-safe ID (nanoid alphabet)
   - Generate random adjective-noun name via `words.js`
   - Batch write: session doc (with `itemCount: 1`) + first item ("Item 1")
   - Generate participantToken → localStorage
   - Navigate to `/?s={sessionId}`
3. Share link prominently displayed after creation
4. Tailwind styling — 44px tap targets, mobile-first layout

### Checkpoint 3:
- Create session from home → redirected to `/?s=...`
- Session doc + Item 1 visible in emulator Firestore UI
- `itemCount` is 1 on the session doc
- participantToken persists in localStorage

### PR → Haiku review

---

## Phase 4: Map View & Layers
**Agent: 1 Sonnet**
**Depends on: Phase 2 merged (can run in parallel with Phase 3)**

This is the most complex single unit.

### Tasks:
1. `components/MapView.jsx` — Mapbox GL JS init, streets style, GPS-centered
2. Six GeoJSON sources + layers per TDD §7.2:
   - `observer-points` (circle + symbol)
   - `bearing-rays` (line, 500m extent, color-coded per participant)
   - `error-wedges` (fill, ±5° semi-transparent)
   - `triangulation-point` (circle + symbol, prominent)
   - `confidence-polygon` (fill, semi-transparent)
   - `accuracy-rings` (circle, radius = GPS accuracy metres)
3. Layer update: `useEffect` watching `dataPoints` and `triangulation` → `source.setData()`
4. Map auto-centers on GPS; fits bounds when data points exist
5. Tap-to-delete on own data points (matched by participantToken), with confirmation prompt
6. `components/TriangulationWarning.jsx` — dismissible banner for `insufficientSpread` and `lowConfidence`

### Checkpoint 4:
- Map renders with streets style
- Manually create data points in emulator Firestore → markers + rays appear
- Triangulation result renders when present
- Warning banners display for insufficientSpread/lowConfidence

### PR → **Sonnet review** (Mapbox layer logic is complex)

---

## Phase 5: Capture Flow
**Agent: 1 Sonnet**
**Depends on: Phases 3 + 4 merged**

### Tasks:
1. `components/TrackButton.jsx` — floating bottom-center, full-width on mobile
   - Disabled states: locked ("Locked"), 10 points ("Max data points reached"), no GPS ("GPS required")
2. `components/CaptureOverlay.jsx` — full-screen modal
3. `components/CompassRose.jsx` — SVG rotating with live bearing
4. `components/CompassCalibrationWarning.jsx` — amber banner when calibration poor
5. `components/GpsStatus.jsx` — green/amber/red accuracy indicator
6. `components/ManualBearingInput.jsx` — numeric 0–360 fallback
7. iOS permission: `DeviceMotionEvent.requestPermission()` in Track click handler
8. Data point write to Firestore on Confirm
9. GA4 event: `data_point_recorded`

### Checkpoint 5:
**This is the "it actually works" milestone.**
- Tap Track → compass overlay → confirm → data point on map
- Second point from different angle → triangulation appears
- Works against emulator
- Compass calibration warning shows when applicable
- Manual bearing fallback works when compass unavailable

### PR → **Sonnet review** (device API interaction, especially iOS)

---

## Phase 6: Session & Item Management
**Agents: 2 Sonnets in parallel**
**Depends on: Phase 3 merged**

### Worker A — Session header:
1. `components/SessionHeader.jsx` — inline editable name, Firestore update on blur/enter
2. `components/ShareButton.jsx` — clipboard copy + `navigator.share()` on mobile
3. `document.title = session.name + " — Bearings"`
4. GA4 events: `session_renamed`, `share_link_copied`

### Worker B — Item management:
1. `components/ItemTabs.jsx` — horizontal scroll tab bar, lock badges, + New Item
2. `components/ItemSettingsPanel.jsx` — slide-up sheet: name edit, lock toggle, point count (N/10)
3. Item creation: atomic `itemCount` increment on session + new item in batch
4. Item rename + lock/unlock → Firestore writes
5. GA4 events: `item_created`, `item_renamed`, `item_locked`

### Checkpoint 6:
- Session name editable, syncs across tabs/windows
- Items switchable, new items get correct sequential names
- Lock prevents tracking, propagates real-time
- Share link works (clipboard + native share on mobile)

### PR → Haiku review

---

## Phase 7: Analytics, PWA & Error Handling
**Agent: 1 Sonnet**
**Depends on: Phases 5 + 6 merged**

### Tasks:
1. `gtag.js` in `index.html` (conditional on `VITE_GA_ID`)
2. Wire all 11 GA4 events from PRD §12 to call sites (some already done in earlier phases — verify completeness)
3. `public/manifest.json` — app name, theme color, `display: standalone`, placeholder icons (192px + 512px)
4. `vite-plugin-pwa` with Workbox shell caching, SW registered in production only
5. `ErrorBoundary` component per TDD §13.1 (dev: full details + copy, prod: generic + reload)
6. `SessionNotFound` page per TDD §13.2
7. Firestore error toasts per TDD §13.3
8. GPS/compass error banners per TDD §13.5

### Checkpoint 7:
- All GA4 events fire (verify in browser console or GA4 DebugView)
- App installable as PWA (Lighthouse PWA check)
- Error boundary catches thrown errors with correct dev/prod display
- `/?s=doesnotexist` shows SessionNotFound page
- GPS denied shows persistent banner

### PR → Haiku review

---

## Phase 8: Integration Testing & Build
**Agent: 1 Sonnet**
**Depends on: Phase 7 merged**

### Tasks:
1. Full integration test against emulators:
   - Create session → add items → record data points → verify triangulation result appears
   - Delete data point → verify re-triangulation
   - Lock item → verify Track button disabled
   - 10-point cap → verify UI message
   - Insufficient spread → verify warning banner
   - Low confidence → verify warning banner
   - Session not found → verify error page
2. Responsive layout pass (375px, 390px, 428px viewports)
3. `npm run build` — zero errors, zero warnings
4. Fix any issues found

### Checkpoint 8:
- Clean production build
- All integration flows work against emulators
- No console errors
- Layout looks correct at all tested widths

### PR → **Sonnet review**

---

## Phase 9: Deploy & Smoke Test
**Agents: 1 Sonnet (fixes) + YOU (manual testing)**
**Depends on: Phase 8 merged**

### Tasks:
1. Deploy Firestore rules + indexes to dev: `firebase deploy --only firestore --project dev`
2. Deploy function to dev: `firebase deploy --only functions --project dev`
3. Push to `main` → triggers full dev deploy via GitHub Actions
4. Verify GitHub Actions workflow completes
5. **YOU:** Run smoke test checklist (TDD §10.1) on real mobile device
6. Agent fixes any reported issues, re-deploys
7. **YOU:** When dev is green → `git tag v1.0.0 && git push --tags` → prod deploy
8. **YOU:** Verify prod URL + GA4 production data stream

---

## Agent Allocation Summary

| Phase | Sonnet | Haiku | Reviewed by | Parallel? |
|-------|--------|-------|-------------|-----------|
| -1 Preflight | — | 1 | — | No |
| 0 Scaffold | 1 | — | Haiku | No |
| 1 Triangulation | 1 | 1 (tests) | **Sonnet** | Yes (impl + tests) |
| 2 Core Shell | 2 | — | Haiku | Yes (infra + hooks) |
| 3 Home + Session | 1 | — | Haiku | No |
| 4 Map & Layers | 1 | — | **Sonnet** | Can parallel with 3 |
| 5 Capture Flow | 1 | — | **Sonnet** | No |
| 6 Session/Item Mgmt | 2 | — | Haiku | Yes (header + items) |
| 7 Analytics/PWA/Errors | 1 | — | Haiku | No |
| 8 Integration & Build | 1 | — | **Sonnet** | No |
| 9 Deploy | 1 (fixes) | — | — | No |

**Totals:** ~12 Sonnet, ~2 Haiku, 10 safe stopping points.

**Review strategy:** Sonnet reviews for math-critical (Phase 1), complex UI (Phases 4, 5), and integration (Phase 8). Haiku reviews for straightforward config/wiring phases.

---

## Dependency Graph

```
Phase -1 (preflight)
  └─► Phase 0 (scaffold)
        ├─► Phase 1 (triangulation)  ──────────────────────┐
        └─► Phase 2 (core shell)                           │
              ├─► Phase 3 (home + session creation)        │
              │     └─► Phase 5 (capture flow) ◄───────────┤
              │     └─► Phase 6 (session/item mgmt)        │
              └─► Phase 4 (map & layers) ◄─────────────────┘
                    └─► Phase 5 (capture flow)
                          └─► Phase 7 (analytics/PWA/errors)
                                └─► Phase 8 (integration)
                                      └─► Phase 9 (deploy)
```

Phases 1, 3, and 4 can run in parallel after Phase 0+2 are merged. Phase 5 is the convergence point where map + capture + triangulation all come together.
