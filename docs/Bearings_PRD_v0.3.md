# Bearings — Product Requirements Document
**Version 0.4 · March 2026 · Ready for Engineering**

| | |
|---|---|
| **Status** | Ready for Engineering — All decisions resolved |
| **Last Updated** | March 25, 2026 |
| **Tech Stack** | React (Vite) · Firebase Hosting + Firestore + Cloud Functions · Mapbox GL JS · Google Analytics 4 |
| **Primary Use Case** | Collaborative, GPS + compass-based triangulation of sound sources in the field |

---

## Decisions Log

| # | Question | Decision |
|---|---|---|
| 1 | Session expiry policy? | Sessions never expire |
| 2 | Data point deletion? | Yes — recorder can delete their own points |
| 3 | URL strategy? | Query param: `/?s=x7k2m9ab` |
| 4 | Session naming? | Editable. Defaults to random adjective-noun (e.g. "Crimson Meridian") |
| 5 | Item default naming? | Item 1, Item 2, … (sequential) |
| 6 | Data point cap per item? | 10 points maximum |
| 7 | Mapbox default style? | Streets only |
| 8 | Participant presence? | Deferred to v2 |
| 9 | Item reordering? | Deferred to v2 |
| 10 | Capture flow for v0.3.0? | Two-step: "Start Bearing" → live preview on map → "Save Bearing." Triangulation recalculates only on save. |

---

## 1. Overview

Bearings is a mobile-first Progressive Web App (PWA) that lets a group of participants collaboratively triangulate the real-world position of a sound source using GPS coordinates and phone compass headings. No authentication is required. Sessions are shared via a unique query-param URL. All map data updates in real time across all connected participants.

The domain model is deliberately generic: the core concept is an "item" — a target object whose location is being determined. The first use case is bird spotting, but the architecture must not couple to that domain. Nothing in the codebase should reference birds, birdwatching, or related terminology.

### 1.1 Problem Statement

When naturalists, birders, or researchers hear a sound source but cannot see it, they currently have no lightweight tool to collaboratively narrow its location using multiple bearing readings from different vantage points. Existing apps require authentication, are not real-time multiplayer, or do not support compass-bearing triangulation.

### 1.2 Goals

- Enable any participant to create a shareable triangulation session with a single tap.
- Allow two or more people (or one person moving between vantage points) to record GPS + bearing data points that the system uses to triangulate and display an estimated item location on a map.
- Support multiple items within a single session with real-time switching.
- Operate without accounts or authentication — access is controlled by link obscurity only.
- Display all data on a live-updating Mapbox (streets style) map.

### 1.3 Feature Highlights

| Feature | Version | Description |
|---|---|---|
| Collaborative sessions | v0.1 | Shareable session URL, no auth, real-time Firestore sync |
| GPS + compass capture | v0.1 | Record observer position and compass bearing per data point |
| Triangulation & confidence polygon | v0.1 | Cloud Function computes estimated item location from ≥2 bearing rays |
| Multiple items per session | v0.1 | Switch between named items; triangulation independent per item |
| Delete mode | v0.2 | Tap-to-delete own data points from item settings panel |
| Home screen & recent sessions | v0.2 | Session list from localStorage, start or rejoin sessions |
| Live Bearing Preview | v0.3.0 | Two-step capture flow: "Start Bearing" shows a live GPS marker + bearing ray on the map before "Save Bearing" commits the reading. Triangulation recalculates only on save. |

### 1.4 Non-Goals

- User authentication or authorization.
- Offline / service-worker data sync (v2).
- Native iOS / Android builds (PWA only for v1).
- Audio recording or identification.
- Historical analytics beyond the current session.
- Participant presence indicators (v2).
- Item reordering (v2).

---

## 2. User Roles

There is a single participant role. Any person with the session URL is a full participant with equal capabilities. The session creator has no elevated privileges after creation.

| Role | Capabilities |
|---|---|
| Participant | Create sessions · Name/rename sessions & items · Add items · Record data points · Delete own data points · Lock items · View live map |

---

## 3. Core Concepts

### 3.1 Session

A session is the top-level container. It has a unique, randomly-generated 8-character URL-safe ID (e.g., `x7k2m9ab`) accessed via query param: `/?s=x7k2m9ab`. Sessions never expire and are never automatically deleted.

- `name`: editable string, defaults to a random adjective-noun pair (e.g., "Crimson Meridian"). Displayed in the page title and at the top of the share link UI.
- `createdAt`: timestamp
- Contains one or more items (sub-collection).

### 3.2 Item

An item is a named target whose location participants are attempting to determine. Items are ordered by creation time (oldest first). The session always opens showing the most recently created item.

- `name`: editable string, defaults to "Item 1", "Item 2", etc. (1-indexed, based on total items ever created in the session).
- `locked`: boolean. When true, no new data points may be added and the Track button is disabled. Lock/unlock is available to any participant.
- `createdAt`: timestamp
- Data points: sub-collection (max 10).
- Triangulation result: single document in a sub-collection, written by Cloud Function.

### 3.3 Data Point

A data point represents a single observation. It contains:

- `participantToken`: string (anonymous random ID stored in localStorage, persists across sessions on the same device)
- `lat`, `lng`: number (observer GPS position at time of capture)
- `bearing`: number (0–360, degrees from true north, direction toward the item)
- `accuracy`: number (GPS accuracy in meters at time of capture)
- `timestamp`: Firestore server timestamp

A participant may delete any data point they recorded (matched by participantToken). Deletion triggers re-computation of the triangulation result via Cloud Function.

### 3.4 Triangulation

Given two or more data points, the system computes the most likely item location by finding the closest-approach point across all bearing rays. Each ray extends from an observer's GPS position in the direction of the recorded bearing.

- Error margin: ±5 degrees is applied to each bearing to produce a confidence polygon.
- With more data points, the confidence polygon shrinks.
- The map displays both the best-estimate pin and the semi-transparent confidence polygon.
- Computation runs in a Firebase Cloud Function, triggered on data point create or delete. Results are written to Firestore and fetched by all clients via a real-time listener.
- Maximum 10 data points per item enforced by Firestore security rules and client-side UI (Track button disabled at cap; a warning message is shown).

---

## 4. User Flows

### 4.1 Creating a New Session

1. Participant opens the app root URL (`/` or `/?`).
2. Taps "Start New Session."
3. System generates a random 8-char session ID and a random adjective-noun session name.
4. A Firestore session document is created, along with a first item named "Item 1."
5. Browser navigates to `/?s={sessionId}`.
6. The share link (full URL) is prominently displayed with a one-tap copy button.
7. Session defaults to Item 1 (the most recently created item).

### 4.2 Joining a Session

1. Participant opens the share link (`?s={sessionId}`).
2. App loads the session and defaults to the most recently created item.
3. If the participant has no localStorage token, one is generated and stored.
4. Live map is displayed with all existing data points and the current triangulation result.

### 4.3 Recording a Data Point (v0.3.0 — Live Bearing Preview)

The capture flow uses a two-step "Start Bearing" → "Save Bearing" interaction that shows a real-time bearing preview on the map before committing a reading.

**Idle state**

- The CTA reads "Start Bearing" (amber).
- Disabled if the item is locked or has reached 10 data points.

**Previewing state** (entered on "Start Bearing" tap)

1. The app begins acquiring GPS position (Geolocation API, high-accuracy mode) and reading the compass heading (DeviceOrientationEvent absolute) continuously.
2. A live GPS marker and a bearing ray are rendered on the map, updating in real time as the device moves or rotates.
3. Preview visuals are visually distinct from saved data points (different color / style) so participants can distinguish unsaved from committed readings.
4. The CTA changes to "Save Bearing" (green). A "Cancel" option is available alongside it.
5. Triangulation is not recalculated during the preview — it only recalculates after a save.
6. If the device does not support absolute orientation, the manual bearing entry overlay is shown as fallback (unchanged from v0.2).

**Save**

1. Participant taps "Save Bearing."
2. The current GPS position and compass heading are written to Firestore as a data point under the active item.
3. The preview visuals are removed from the map and replaced by the persisted data point marker.
4. The Cloud Function triggers, recomputes triangulation, and writes the result.
5. The UI returns to idle ("Start Bearing").
6. Map on all connected clients updates within ~2s (data point) and ~5s (triangulation result).

**Cancel**

1. Participant taps "Cancel."
2. The preview visuals are cleared from the map.
3. No data is written. The UI returns to idle ("Start Bearing").

#### Acceptance Criteria

- [ ] Live GPS marker appears on the map immediately upon entering previewing state.
- [ ] Bearing ray updates in real time as the device rotates during preview.
- [ ] Preview marker and ray are visually distinct (different color/style) from saved data point markers.
- [ ] Cancelling preview removes all preview visuals and returns UI to idle without writing any data.
- [ ] Triangulation pin and confidence polygon do not change during preview; they only update after a save.
- [ ] Manual capture overlay fallback is unchanged for devices without compass support.
- [ ] "Start Bearing" CTA is amber; "Save Bearing" CTA is green.
- [ ] Save and Cancel tap targets meet the ≥44 × 44px minimum.

### 4.4 Deleting a Data Point

1. Participant opens item settings (by tapping the active item tab) and taps the delete mode button (trash icon).
2. A red banner appears on the map: "Tap a point to remove it. This cannot be undone."
3. Participant taps their own data point marker on the map.
4. The data point is immediately deleted from Firestore (no confirmation dialog).
5. Cloud Function triggers and recomputes triangulation with the remaining points.
6. Delete mode is exited when the participant switches items or toggles it off.

Only the participant whose token matches the data point's `participantToken` may delete it. This is enforced client-side in v1 (see security note in TDD §4.2).

### 4.5 Item Management

- **Add item:** Tap "New Item." New item is created with the next sequential default name. It becomes the active item for the tapping participant (other participants are unaffected).
- **Switch items:** Item selector (tab bar or dropdown) lists all items in creation order. Tap to switch. Local UI state only — does not affect others.
- **Rename item:** Tap the item name to edit inline. Written to Firestore, propagates to all clients in real time.
- **Lock / unlock item:** Toggle the lock control. Propagates to all clients. Locked items show a visual badge; Track button is disabled with a "Locked" tooltip.

### 4.6 Session Management

- **Rename session:** Tap the session name at the top of the UI to edit inline. Written to Firestore, propagates to all clients and updates the page title.
- **Share link:** Always visible in the header. One-tap copy. On mobile, also surfaces the native share sheet.

---

## 5. Map & Visualization

### 5.1 Provider & Style

Mapbox GL JS. Default style: streets (`mapbox://styles/mapbox/streets-v12`). The map initializes centered on the first participant's GPS location. If GPS is unavailable, it defaults to a world view. Style switching is a v2 concern.

### 5.2 Map Layers

| Layer | Description | Update Trigger |
|---|---|---|
| Observer points | Pin at each data point's GPS location. Labeled with participant initial + sequence number. Tappable to delete (own points only). | Firestore real-time |
| Bearing rays | Line from observer point in bearing direction, clipped at 500m. Color-coded per participant. | Firestore real-time |
| Error wedges | Semi-transparent wedge (±5°) per ray showing orientation uncertainty. | Firestore real-time |
| Triangulation pin | Prominent marker at computed item location. Shown only when ≥2 non-parallel data points exist. | Function result |
| Confidence polygon | Convex hull of intersection region accounting for bearing error. Semi-transparent fill. | Function result |
| Confidence polygon outline | Dashed red outline around the confidence polygon for visibility. | Function result |
| GPS accuracy ring | Circle around each observer point reflecting GPS accuracy in meters. | Firestore real-time |
| **Preview GPS marker** | Live marker at the device's current GPS position, shown only during the "previewing" capture state. Distinct style (e.g. pulsing amber) to differentiate from saved points. | Device Geolocation API (live) |
| **Preview bearing ray** | Live ray from the preview GPS marker in the current compass heading direction, clipped at 500m. Updates continuously as the device rotates. Distinct style (e.g. dashed amber) to differentiate from saved rays. | DeviceOrientationEvent (live) |

The map auto-zooms to fit all data points and the triangulation estimate when the active item changes.

### 5.3 Real-Time Updates

All clients maintain Firestore real-time listeners on: the session document, the active item document, the active item's `dataPoints` sub-collection, and the active item's `triangulation/result` document. Map layers update incrementally without a page reload. Switching items tears down and re-establishes item-level listeners.

---

## 6. Triangulation Algorithm

### 6.1 Inputs

- N data points, each: `(latᵢ, lngᵢ, bearingᵢ)`
- Error tolerance: ±5 degrees per bearing

### 6.2 Method

Convert each `(lat, lng, bearing)` to a unit direction vector in a local tangent-plane coordinate system (valid for distances < 1 km). For N rays, find the point P minimizing the sum of squared perpendicular distances to all rays (least-squares ray intersection).

For the confidence polygon: generate two additional rays per data point at `(bearing ± 5°)`. Compute all pairwise intersections of the "extreme" rays and return their convex hull as a GeoJSON Polygon.

### 6.3 Implementation

Firebase Cloud Function (Node.js 20), triggered by Firestore `onCreate` and `onDelete` on `dataPoints` documents. The function reads all current data points for the item, recomputes, and writes a `triangulation/result` document. Clients fetch the result via real-time listener.

`confidencePolygon` is JSON-serialized (`JSON.stringify`) before being written to Firestore, because Firestore does not support nested arrays (required by the GeoJSON Polygon coordinates structure). The client parses it back with `JSON.parse` after reading.

### 6.4 Edge Cases

- **1 data point:** No triangulation computed. Rays displayed only.
- **Parallel rays** (all bearings within 10° of each other): Set `insufficientSpread: true` in result. Display rays but no triangulation pin. Show "Needs more spread" UI hint.
- **Same GPS position for multiple points:** Merge into a single position for triangulation purposes; do not error.
- **0 data points** (after deletion): Delete the triangulation result document.

---

## 7. Data Model (Firestore)

### sessions/{sessionId}

| Field | Type | Notes |
|---|---|---|
| `id` | string | 8-char random URL-safe, e.g. "x7k2m9ab" |
| `name` | string | Editable, defaults to random adjective-noun |
| `createdAt` | timestamp | Server timestamp |

### sessions/{sessionId}/items/{itemId}

| Field | Type | Notes |
|---|---|---|
| `name` | string | Default: "Item {itemIndex}" |
| `locked` | boolean | false on creation |
| `itemIndex` | number | 1-based integer, set at creation, never updated |
| `createdAt` | timestamp | Server timestamp |

### sessions/{sessionId}/items/{itemId}/dataPoints/{pointId}

| Field | Type | Notes |
|---|---|---|
| `participantToken` | string | Client-generated UUID stored in localStorage |
| `lat` | number | WGS84 latitude, −90 to 90 |
| `lng` | number | WGS84 longitude, −180 to 180 |
| `bearing` | number | 0–360 degrees true north |
| `accuracy` | number | GPS accuracy in metres (informational) |
| `timestamp` | timestamp | Firestore server timestamp |

### sessions/{sessionId}/items/{itemId}/triangulation/result

Single document with fixed ID "result". Written exclusively by the Cloud Function service account.

| Field | Type | Notes |
|---|---|---|
| `estimatedLat` | number | Computed best-estimate latitude |
| `estimatedLng` | number | Computed best-estimate longitude |
| `confidencePolygon` | string | JSON-serialized GeoJSON Polygon (Firestore does not support nested arrays). Parsed back to object on the client. Or null. |
| `dataPointCount` | number | Count of points used in computation |
| `insufficientSpread` | boolean | True if all bearings within 10° of each other |
| `computedAt` | timestamp | Server timestamp of last computation |

---

## 8. Technical Architecture

### 8.1 Frontend

| | |
|---|---|
| Framework | React 18 + Vite |
| Styling | Tailwind CSS v3 |
| State | Zustand (local UI: active item, `deleteMode`, etc.) + Firestore real-time listeners (server state) |
| Routing | React Router v6. Route: `/?s=:sessionId` (query param) |
| Map | Mapbox GL JS v3. Streets style default. |
| Device APIs | Geolocation API (high-accuracy). DeviceOrientationEvent absolute. webkitCompassHeading fallback for iOS. |
| Fallback bearing | Manual numeric input if DeviceOrientationEvent unavailable. |
| Analytics | Google Analytics 4 via gtag.js |
| PWA | Web app manifest + basic service worker for installability (online-only data in v1) |
| Adjective-noun gen | Navigation- and nature-themed word list (~200 adjectives × 200 nouns, e.g. Crimson, Zenith, Meridian, Solstice). No external dependency. |

### 8.2 Backend

| | |
|---|---|
| Hosting | Firebase Hosting (SPA, all routes rewrite to index.html) |
| Database | Cloud Firestore (NoSQL, real-time listeners) |
| Functions | Firebase Cloud Functions v2, Node.js 20 |
| Function trigger | Firestore onCreate + onDelete: `sessions/{s}/items/{i}/dataPoints/{p}` |
| Auth | None. Firestore rules enforce schema and participantToken-scoped deletes. |
| Security | 8-char alphanumeric session IDs (~2.8T combinations). Security through obscurity. |

### 8.3 Firestore Security Rules (sketch)

- **Read:** any client, all collections.
- **Create session / item:** any client, required fields present.
- **Update session name:** any client.
- **Update item name / locked:** any client.
- **Create dataPoint:** any client, required fields valid (bearing 0–360, lat/lng range valid), item not locked, item dataPoints count < 10.
- **Delete dataPoint:** client-side token match in v1 (see TDD §4.2 security note).
- **Write triangulation/result:** Cloud Function service account only.

---

## 9. Deployment & CI/CD

### 9.1 Environments

| Environment | Firebase Project | Deploy Trigger |
|---|---|---|
| Dev | `bearings-app-dev` | Merge to `main` branch |
| Prod | `bearings-app-prod` | Git tag push matching `v*.*.*` |

### 9.2 GitHub Workflow — Deploy Dev

File: `.github/workflows/deploy-dev.yml`

- Trigger: push to `main`
- Steps: checkout → setup Node 20 → `npm ci` → `npm run build` (with dev secrets) → `firebase deploy --only hosting,functions,firestore:rules,firestore:indexes --project dev`

### 9.3 GitHub Workflow — Deploy Prod

File: `.github/workflows/deploy-prod.yml`

- Trigger: push of tag matching `v*.*.*`
- Same steps as dev but uses prod secrets and `--project prod`

### 9.4 Required GitHub Secrets

| Secret | Purpose |
|---|---|
| `FIREBASE_SERVICE_ACCOUNT_DEV` | Firebase deploy auth for dev project |
| `FIREBASE_SERVICE_ACCOUNT_PROD` | Firebase deploy auth for prod project |
| `VITE_MAPBOX_TOKEN_DEV` | Mapbox public token for dev build |
| `VITE_MAPBOX_TOKEN_PROD` | Mapbox public token for prod build |
| `VITE_GA_MEASUREMENT_ID_DEV` | GA4 measurement ID for dev |
| `VITE_GA_MEASUREMENT_ID_PROD` | GA4 measurement ID for prod |
| `VITE_FIREBASE_CONFIG_DEV` | Firebase client config JSON (base64-encoded) for dev |
| `VITE_FIREBASE_CONFIG_PROD` | Firebase client config JSON (base64-encoded) for prod |

---

## 10. Device API & Mobile Considerations

### 10.1 Geolocation

- Request high-accuracy mode (`enableHighAccuracy: true`).
- Display GPS accuracy ring on map. If accuracy > 20m, show an amber warning badge on the Track button.
- Store raw accuracy value with each data point for downstream quality weighting (v2).
- If geolocation is denied, show a persistent banner explaining it is required.

### 10.2 Compass / Bearing

- Primary: `DeviceOrientationEvent` with `absolute: true`.
- iOS fallback: `webkitCompassHeading` (requires `DeviceMotionEvent.requestPermission()` on iOS 13+). Prompt before first Track action.
- If neither is available: display a numeric bearing input field (0–360) and a note that manual entry is in use.
- Live compass rose shown in the capture overlay, rotating in real time with the phone.

---

## 11. UX Requirements

### 11.1 Key Screens

| Screen | Purpose | Primary CTA |
|---|---|---|
| Home | Entry. Start or (future) resume a session. | Start New Session |
| Session / Map (idle) | Live map, item tabs, share link. CTA is "Start Bearing" (amber). Includes delete mode banner when active. | Start Bearing |
| Session / Map (previewing) | Live preview GPS marker + bearing ray on map. CTA is "Save Bearing" (green); "Cancel" adjacent. | Save Bearing |
| Capture overlay (fallback) | Manual bearing input for devices without compass. Confirm the bearing before writing. | Confirm |
| Item settings | Rename or lock an item inline. Includes delete mode toggle (trash icon). | Save / Lock |
| Session header | Session name (editable), share link copy. | — |

### 11.2 Mobile-First Design Principles

- All interactive tap targets ≥44 × 44px.
- Record button: large, bottom-center, thumb-reachable. Full-width on narrow screens.
- Map occupies the majority of the viewport. Controls overlay as floating cards.
- Share link accessible from a persistent header icon; also surfaced on session creation.
- Item tab bar scrolls horizontally if items overflow.

### 11.3 Real-Time Feedback

- New data points appear on map within ~2s of submission for all clients.
- Triangulation result updates within ~5s (Cloud Function cold start budget).
- A subtle spinner on the triangulation pin while the Function is computing.
- At 10/10 data points: Record button is disabled; show "Max data points reached" message.
- When `insufficientSpread` is true: show a context-aware warning. If ≥3 data points exist: "Bearings are too parallel — move to a different angle." If <3 data points: "Add points from different directions for a better result."

---

## 12. Analytics

Google Analytics 4 (gtag.js). Key custom events:

| Event | Key Parameters |
|---|---|
| `session_created` | — |
| `session_joined` | session_id |
| `session_renamed` | — |
| `item_created` | item_index |
| `item_renamed` | — |
| `item_locked` | locked: bool |
| `bearing_preview_started` | item_id |
| `bearing_preview_cancelled` | item_id |
| `data_point_recorded` | item_id, point_count_after, gps_accuracy_m |
| `data_point_deleted` | item_id, point_count_after |
| `triangulation_computed` | point_count, insufficient_spread: bool |
| `share_link_copied` | — |
| `manual_bearing_used` | — |

---

## 13. Future Considerations (v2+)

- Offline support via service worker + IndexedDB sync.
- Participant presence indicators (live count of active clients in session).
- Item reordering (drag-to-reorder).
- Weighted triangulation using GPS accuracy as a per-point confidence weight.
- Mapbox style switcher (satellite, hybrid).
- Export session as GeoJSON or KML.
- Session passcode (optional, beyond link obscurity).
- Push notifications when a triangulation result is ready.
- Session search / history (requires auth, major scope expansion).
