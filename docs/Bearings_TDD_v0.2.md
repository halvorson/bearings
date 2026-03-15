# Bearings — Technical Design Document
**Version 0.3 · March 2026 · Companion to PRD v0.4**

| | |
|---|---|
| **Status** | Draft — Ready for implementation |
| **PRD version** | v0.4 |
| **Stack** | React 18 + Vite · Firebase (Hosting / Firestore / Functions v2) · Mapbox GL JS v3 · GA4 |
| **Repo layout** | Monorepo: `/app` (frontend) + `/functions` (Cloud Functions) |

### Ownership Key

> 👤 **YOU** — Requires browser login, billing, or credentials only you hold. Must be done by a human.
>
> 🤖 **AGENT** — Executable by a coding agent using the Firebase CLI, GitHub CLI, or shell scripts.

### Changelog (v0.1 → v0.2)

| # | Change | Source |
|---|---|---|
| 1 | Firebase config must be valid JSON (double-quoted keys); added note to §6.1 | Review #1 (critical) |
| 2 | Added `itemCount` field to session schema (§4.1) | Review #2 |
| 3 | Security rules updated: session update allows `itemCount`; session create requires `itemCount` (§4.2) | Review #3 |
| 4 | Added Firebase emulator configuration to `firebase.json` (§3.2) and `firebase.js` (§6.1) | Review #4 |
| 5 | Removed `app/src/lib/triangulate.js` from repo structure (§3.1) — no client-side preview | Review #5 |
| 6 | Added §13: Error Handling specification | Review #6 |
| 7 | Added compass calibration warning to capture overlay (§7.3) | Review #7 |
| 8 | Added `lowConfidence` flag and quality check to triangulation algorithm (§5.2, §5.5) and result schema (§4.1) | Review #8 |
| 9 | Clarified `onDocumentWritten` trigger choice in §5.1 | Review #9 |
| 10 | Updated 10-point cap note: client-side enforcement only (§4.2, §12) | Review #10 |
| 11 | `confidencePolygon` stored as JSON string in Firestore result doc (§4.1, §5.3) — Firestore rejects nested arrays | Bug fix |
| 12 | Delete mode UX: toggle in item settings, not direct tap-to-delete (§7.2, §6.4) | UX redesign |
| 13 | Map auto-zoom via `fitBounds` when switching items or data loads (§7.2) | Feature |
| 14 | CTA renamed from "Mark"/"Track" to "Record" (§7.3, §6.4) | UX change |
| 15 | Version display injected via Vite `define` from package.json (§6.1) | Feature |
| 16 | Zustand store: added `deleteMode` and `setDeleteMode` (§6.3) | Feature |

---

## 1. Implementation Plan Overview

| Phase | Name | Key Deliverables | Owner |
|---|---|---|---|
| 1 | External accounts & secrets | Firebase projects, Mapbox token, GA4 property, GitHub secrets | YOU |
| 2 | Repo & CI/CD scaffold | GitHub repo, workflow files, firebase.json, .firebaserc | YOU + AGENT |
| 3 | Firestore schema & rules | Collection structure, security rules, indexes | AGENT |
| 4 | Cloud Function — triangulation | onDocumentWritten trigger, math, result write | AGENT |
| 5 | Frontend — core shell | Vite+React scaffold, routing, Firestore hooks, Zustand store | AGENT |
| 6 | Frontend — map & capture | Mapbox integration, GPS/compass capture, Record flow | AGENT |
| 7 | Frontend — session & item mgmt | Session name, item tabs, rename, lock, delete point | AGENT |
| 8 | Analytics & PWA | GA4 events, manifest, service worker | AGENT |
| 9 | End-to-end QA & deploy | Dev deploy, smoke test, prod deploy | AGENT + YOU |

---

## 2. Phase 1 — External Accounts & Secrets

Everything in this phase requires browser-based login or billing setup that only you can perform. Complete these before handing off to an agent.

| Owner | Task | Notes / How |
|---|---|---|
| 👤 YOU | Create two Firebase projects: `bearings-app-dev` and `bearings-app-prod` | console.firebase.google.com → Add project. Enable Blaze (pay-as-you-go) on both — required for Cloud Functions. |
| 👤 YOU | Enable Firestore in both projects (Native mode, us-central1 region) | Firebase Console → Build → Firestore Database → Create database |
| 👤 YOU | Enable Firebase Hosting in both projects | Firebase Console → Build → Hosting → Get started |
| 👤 YOU | Create a Mapbox account and generate a public token scoped to your domain(s) | account.mapbox.com. Create two tokens: one for dev (localhost + dev domain), one for prod. |
| 👤 YOU | Create a Google Analytics 4 property and note the Measurement ID (G-XXXXXXXXXX) | analytics.google.com → Admin → Create property. Create a separate data stream for dev and prod if desired. |
| 👤 YOU | Create a GitHub repository named `bearings` | github.com → New repository. Initialize with a README. |
| 👤 YOU | Generate Firebase service account JSON keys for both projects and add as GitHub Secrets | Firebase Console → Project Settings → Service Accounts → Generate new private key. Add as `FIREBASE_SERVICE_ACCOUNT_DEV` and `FIREBASE_SERVICE_ACCOUNT_PROD`. |
| 👤 YOU | Add remaining GitHub Secrets | `VITE_MAPBOX_TOKEN_DEV`, `VITE_MAPBOX_TOKEN_PROD`, `VITE_GA_MEASUREMENT_ID_DEV`, `VITE_GA_MEASUREMENT_ID_PROD`, `VITE_FIREBASE_CONFIG_DEV`, `VITE_FIREBASE_CONFIG_PROD` |
| 🤖 AGENT | Verify secrets are present | `gh secret list --repo {owner}/bearings` |

> **Important:** The `VITE_FIREBASE_CONFIG_*` secrets must contain a base64-encoded **valid JSON** string (double-quoted keys). Do not copy the JavaScript object literal from the Firebase Console SDK snippet directly — convert it to JSON first.

---

## 3. Phase 2 — Repo & CI/CD Scaffold

### 3.1 Repository Structure

```
bearings/
  ├── .github/
  │   └── workflows/
  │       ├── deploy-dev.yml
  │       └── deploy-prod.yml
  ├── app/                     # React frontend (Vite)
  │   ├── public/
  │   ├── src/
  │   │   ├── components/
  │   │   ├── hooks/
  │   │   ├── lib/
  │   │   │   ├── firebase.js      # SDK init + emulator connection
  │   │   │   ├── words.js         # adjective-noun generator
  │   │   │   ├── analytics.js     # GA4 thin wrapper
  │   │   │   └── errors.js        # error display utilities
  │   │   ├── store/
  │   │   │   └── useSessionStore.js  # Zustand
  │   │   ├── pages/
  │   │   │   ├── Home.jsx
  │   │   │   └── Session.jsx
  │   │   ├── App.jsx
  │   │   └── main.jsx
  │   ├── index.html
  │   ├── .env.local.example       # template for local dev env vars
  │   └── vite.config.js
  ├── functions/               # Firebase Cloud Functions
  │   ├── src/
  │   │   ├── index.js
  │   │   └── triangulate.js   # triangulation math module
  │   ├── __tests__/
  │   │   └── triangulate.test.js
  │   └── package.json
  ├── firestore.rules
  ├── firestore.indexes.json
  ├── firebase.json
  ├── .firebaserc
  └── .gitignore
```

### 3.2 firebase.json

```json
{
  "hosting": {
    "public": "app/dist",
    "ignore": ["firebase.json", "**/.*", "**/node_modules/**"],
    "rewrites": [{ "source": "**", "destination": "/index.html" }]
  },
  "functions": { "source": "functions", "runtime": "nodejs20" },
  "firestore": {
    "rules": "firestore.rules",
    "indexes": "firestore.indexes.json"
  },
  "emulators": {
    "firestore": { "port": 8080, "host": "127.0.0.1" },
    "functions": { "port": 5001, "host": "127.0.0.1" },
    "ui": { "enabled": true, "port": 4000 }
  }
}
```

### 3.3 .firebaserc

```json
{
  "projects": {
    "dev":     "bearings-app-dev",
    "default": "bearings-app-dev",
    "prod":    "bearings-app-prod"
  }
}
```

### 3.4 GitHub Workflow — Deploy Dev

File: `.github/workflows/deploy-dev.yml`

```yaml
name: Deploy — Dev
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20' }
      - name: Install & build frontend
        working-directory: app
        run: npm ci && npm run build
        env:
          VITE_FIREBASE_CONFIG: ${{ secrets.VITE_FIREBASE_CONFIG_DEV }}
          VITE_MAPBOX_TOKEN:    ${{ secrets.VITE_MAPBOX_TOKEN_DEV }}
          VITE_GA_ID:          ${{ secrets.VITE_GA_MEASUREMENT_ID_DEV }}
      - name: Install functions deps
        working-directory: functions
        run: npm ci
      - uses: w9jds/firebase-action@v13
        with:
          args: deploy --only hosting,functions,firestore:rules,firestore:indexes --project dev
        env:
          GCP_SA_KEY: ${{ secrets.FIREBASE_SERVICE_ACCOUNT_DEV }}
```

### 3.5 GitHub Workflow — Deploy Prod

File: `.github/workflows/deploy-prod.yml` — identical to dev workflow except:

- Trigger: `on: push: tags: ['v*.*.*']`
- Env vars use `_PROD` secrets
- Firebase args: `--project prod`

### 3.6 Phase 2 Task Ownership

| Owner | Task | Notes |
|---|---|---|
| 🤖 AGENT | Scaffold full repo directory structure and all config files | git init, create all files, initial commit |
| 🤖 AGENT | Write `package.json` for `/app` (React 18, Vite, Tailwind, Zustand, Firebase JS SDK v10, Mapbox GL JS v3, React Router v6) | npm init, add deps |
| 🤖 AGENT | Write `package.json` for `/functions` (firebase-functions v4, firebase-admin) | npm init in /functions |
| 🤖 AGENT | Write both GitHub Actions workflow files | Per specs in 3.4 and 3.5 |
| 🤖 AGENT | Write firebase.json (with emulators), .firebaserc, .gitignore | Per specs above |
| 🤖 AGENT | Write `app/.env.local.example` | Template with placeholder values for VITE_FIREBASE_CONFIG, VITE_MAPBOX_TOKEN, VITE_GA_ID |
| 👤 YOU | Push repo to GitHub and confirm Actions tab shows the first workflow run | `git remote add origin ... && git push` |

---

## 4. Phase 3 — Firestore Schema & Rules

### 4.1 Full Schema

#### sessions/{sessionId}

| Field | Type | Notes |
|---|---|---|
| `id` | string | 8-char URL-safe random (nanoid alphabet) |
| `name` | string | Random adjective-noun default. User-editable. |
| `itemCount` | number | Starts at 1 on session creation. Atomically incremented when a new item is created. Used to assign sequential default item names. |
| `createdAt` | timestamp | Firestore server timestamp |

#### sessions/{sessionId}/items/{itemId}

| Field | Type | Notes |
|---|---|---|
| `name` | string | Default: "Item {itemIndex}" |
| `locked` | boolean | false on creation |
| `itemIndex` | number | 1-based integer, set at creation from session's `itemCount`, never updated |
| `createdAt` | timestamp | Server timestamp |

#### sessions/{sessionId}/items/{itemId}/dataPoints/{pointId}

| Field | Type | Notes |
|---|---|---|
| `participantToken` | string | Client-generated UUID stored in localStorage |
| `lat` | number | WGS84 latitude, −90 to 90 |
| `lng` | number | WGS84 longitude, −180 to 180 |
| `bearing` | number | 0–360 degrees true north |
| `accuracy` | number | GPS accuracy in metres (informational) |
| `timestamp` | timestamp | Firestore server timestamp |

#### sessions/{sessionId}/items/{itemId}/triangulation/result

Single document with fixed ID "result". Written exclusively by the Cloud Function service account.

| Field | Type | Notes |
|---|---|---|
| `estimatedLat` | number | Computed best-estimate latitude |
| `estimatedLng` | number | Computed best-estimate longitude |
| `confidencePolygon` | string | JSON-serialized GeoJSON Polygon object. Firestore does not support nested arrays in document fields. Value is null when unavailable. |
| `dataPointCount` | number | Count of points used in computation |
| `insufficientSpread` | boolean | True if all bearings within 10° of each other |
| `lowConfidence` | boolean | True if estimated point is >2km from observer centroid |
| `computedAt` | timestamp | Server timestamp of last computation |

### 4.2 Firestore Security Rules

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function isValidBearing(b) {
      return b is number && b >= 0 && b <= 360;
    }
    function isValidLat(l) {
      return l is number && l >= -90 && l <= 90;
    }
    function isValidLng(l) {
      return l is number && l >= -180 && l <= 180;
    }

    match /sessions/{sessionId} {
      allow read: if true;
      allow create: if request.resource.data.keys()
        .hasAll(['id','name','itemCount','createdAt']);
      allow update: if request.resource.data.diff(
        resource.data).affectedKeys().hasOnly(['name', 'itemCount']);

      match /items/{itemId} {
        allow read: if true;
        allow create: if request.resource.data.keys()
          .hasAll(['name','locked','itemIndex','createdAt'])
          && request.resource.data.locked == false;
        allow update: if request.resource.data.diff(
          resource.data).affectedKeys().hasOnly(['name','locked']);

        match /dataPoints/{pointId} {
          allow read: if true;
          allow create: if
            get(/databases/$(database)/documents/sessions/$(sessionId)
              /items/$(itemId)).data.locked == false
            && request.resource.data.keys().hasAll([
                 'participantToken','lat','lng',
                 'bearing','accuracy','timestamp'])
            && isValidBearing(request.resource.data.bearing)
            && isValidLat(request.resource.data.lat)
            && isValidLng(request.resource.data.lng);
          allow delete: if true; // v1: token match enforced client-side only
        }

        match /triangulation/{doc} {
          allow read: if true;
          allow write: if false; // Function uses Admin SDK, bypasses rules
        }
      }
    }
  }
}
```

> **Security note on data point deletion:** Because the app uses no Firebase Auth, `participantToken` ownership cannot be verified server-side by Firestore rules in v1. Any client with the session link can technically delete any point. This matches the security-through-obscurity posture already established for session access. Revisit with Firebase Auth in v2 if needed.

> **Note on 10-point cap:** The maximum of 10 data points per item is enforced client-side only in v1 (Record button disabled at cap). Firestore security rules cannot natively count subcollection documents. A Cloud Function pre-check could be added in v2.

### 4.3 Firestore Index

```json
{
  "indexes": [{
    "collectionGroup": "dataPoints",
    "queryScope": "COLLECTION",
    "fields": [
      { "fieldPath": "timestamp", "order": "ASCENDING" }
    ]
  }],
  "fieldOverrides": []
}
```

### 4.4 Phase 3 Task Ownership

| Owner | Task | Notes |
|---|---|---|
| 🤖 AGENT | Write `firestore.rules` per spec in 4.2 | Commit to repo root |
| 🤖 AGENT | Write `firestore.indexes.json` per spec in 4.3 | Commit to repo root |
| 🤖 AGENT | Deploy rules and indexes to dev | `firebase deploy --only firestore --project dev` |
| 👤 YOU | Review rules in Firebase Console → Firestore → Rules tab | Sanity check before prod |

---

## 5. Phase 4 — Cloud Function: Triangulation

### 5.1 Trigger & Responsibilities

- Trigger: Firestore `onDocumentWritten` on `sessions/{s}/items/{i}/dataPoints/{p}`. This fires on create, update, and delete — covering all mutation cases with a single trigger. Data points are not expected to be updated, but using `onDocumentWritten` is simpler and future-proof.
- Reads all current `dataPoints` for the item.
- If 0 points: deletes the `triangulation/result` document (if it exists).
- If 1 point: writes result with `dataPointCount: 1`, no `estimatedLat`/`Lng`, no polygon.
- If 2+ points: runs the triangulation algorithm (see 5.2), writes full result.
- Always sets `computedAt` to server timestamp.

### 5.2 Triangulation Algorithm (functions/src/triangulate.js)

This module lives in `/functions` only. It is the authoritative computation, run exclusively by the Cloud Function. Pure JavaScript, no external dependencies.

#### Step 1 — Convert to local tangent plane (LTP)

Choose the centroid of all observer positions as the LTP origin. Project each observer `(lat, lng)` to `(x, y)` in metres using the equirectangular approximation (valid for distances < 2 km):

```js
const R = 6371000; // Earth radius, metres
const lat0 = meanLat * Math.PI / 180;
x_i = R * (lng_i - lng0) * Math.PI/180 * Math.cos(lat0);
y_i = R * (lat_i - lat0) * Math.PI/180;
```

#### Step 2 — Bearing to direction vector

Convert each bearing `b_i` (degrees, clockwise from north) to a unit direction vector in the LTP (x = east, y = north):

```js
const rad = b_i * Math.PI / 180;
d_i = { x: Math.sin(rad), y: Math.cos(rad) };
```

#### Step 3 — Least-squares ray intersection

For N rays, each defined by origin `p_i` and direction `d_i`, find the point P minimizing the sum of squared perpendicular distances:

```js
// For each ray i, build the contribution to the normal equation:
// A += (I - d_i * d_i^T),  b += (I - d_i * d_i^T) * p_i
// Solve: P = A^{-1} * b
```

#### Step 4 — Confidence polygon

For each data point `i`, compute two additional direction vectors at `bearing ± 5°`. Find all pairwise intersections of the 2N extreme rays. Return the convex hull of those intersection points, converted back to `(lat, lng)` via inverse LTP projection. If fewer than 3 hull points, return null.

#### Step 5 — Insufficient spread check

Compute the circular range of all bearings (accounting for wrap-around at 0°/360°). If the range is less than 10°, set `insufficientSpread: true` and skip the intersection computation.

#### Step 6 — Quality check (low confidence)

After computing the estimated point, measure the distance from the estimate to the centroid of all observer positions. If this distance exceeds 2 km, set `lowConfidence: true` in the result. The UI should display: "Result may be inaccurate. Try adding points from different angles, or delete a point that seems off."

### 5.3 Function Entry Point (functions/src/index.js)

```js
const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { computeTriangulation } = require('./triangulate');

admin.initializeApp();

exports.onDataPointWritten = onDocumentWritten(
  'sessions/{sessionId}/items/{itemId}/dataPoints/{pointId}',
  async (event) => {
    const { sessionId, itemId } = event.params;
    const db = admin.firestore();
    const pointsSnap = await db
      .collection(`sessions/${sessionId}/items/${itemId}/dataPoints`)
      .get();
    const points = pointsSnap.docs.map(d => d.data());
    const result = computeTriangulation(points);
    const resultRef = db.doc(
      `sessions/${sessionId}/items/${itemId}/triangulation/result`
    );
    if (points.length === 0) {
      await resultRef.delete();
    } else {
      const payload = { ...result };
      if (payload.confidencePolygon != null) {
        payload.confidencePolygon = JSON.stringify(payload.confidencePolygon);
      }
      await resultRef.set({
        ...payload,
        computedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);
```

### 5.4 Phase 4 Task Ownership

| Owner | Task | Notes |
|---|---|---|
| 🤖 AGENT | Write `functions/src/triangulate.js` implementing steps 1–6 | Pure JS, no deps |
| 🤖 AGENT | Write `functions/src/index.js` per spec in 5.3 | Uses firebase-functions v4 + firebase-admin |
| 🤖 AGENT | Write unit tests for `triangulate.js` covering: 2-point intersection, parallel bearing rejection, 0/1 point edge cases, wrap-around bearings, low confidence flag | Jest or Vitest in `functions/` |
| 🤖 AGENT | Deploy function to dev | `firebase deploy --only functions --project dev` |
| 👤 YOU | In Firebase Console → Functions, confirm the function appears with no deploy errors | Visual check |

---

## 6. Phase 5 — Frontend: Core Shell

### 6.1 Firebase SDK Init (src/lib/firebase.js)

Firebase config is injected at build time from Vite env vars. The config object is stored as a single **valid JSON** secret (`VITE_FIREBASE_CONFIG_DEV` / `_PROD`), base64-encoded, and decoded at build time. The JSON must have double-quoted keys — do not use JavaScript object literal syntax.

The app version is injected at build time via Vite's `define` option in `vite.config.js`, reading `version` from `package.json`:

```js
// vite.config.js (relevant excerpt)
import { version } from './package.json';
export default defineConfig({
  define: {
    __APP_VERSION__: JSON.stringify(version),
  },
});
```

Components access the version as the global `__APP_VERSION__` string (no import needed).

```js
import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const config = JSON.parse(
  atob(import.meta.env.VITE_FIREBASE_CONFIG)
);
export const app = initializeApp(config);
export const db  = getFirestore(app);

// Connect to local emulators in development
if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
```

### 6.2 Routing (App.jsx)

Single query-param route. React Router v6 reads the `?s=` param; no path-based routing needed.

```jsx
import { useSearchParams } from 'react-router-dom';
import Home    from './pages/Home';
import Session from './pages/Session';

export default function App() {
  const [params] = useSearchParams();
  const sessionId = params.get('s');
  return sessionId ? <Session id={sessionId} /> : <Home />;
}
```

### 6.3 Zustand Store (src/store/useSessionStore.js)

Stores local UI state only. Server state lives in Firestore and is subscribed to via custom hooks.

- `activeItemId`: string | null
- `participantToken`: string (loaded from / written to localStorage on mount)
- `captureOverlayOpen`: boolean
- `deleteMode`: boolean — when true, observer points on the map are tappable for deletion
- Actions: `setActiveItem` (also clears `deleteMode`), `openCapture`, `closeCapture`, `setDeleteMode`

### 6.4 Custom Hooks

| Hook | Subscribes to / Returns |
|---|---|
| `useSession(sessionId)` | `sessions/{id}` document. Returns `{ session, loading, error }`. |
| `useItems(sessionId)` | `sessions/{id}/items` ordered by `createdAt`. Returns `items[]`. |
| `useDataPoints(sessionId, itemId)` | `dataPoints` sub-collection for active item. Returns `points[]`. |
| `useTriangulation(sessionId, itemId)` | `triangulation/result` doc. Returns `result \| null`. JSON-parses the `confidencePolygon` string field back to a GeoJSON object before returning. |
| `useGeolocation()` | Wraps `navigator.geolocation.watchPosition`. Returns `{ lat, lng, accuracy, error }`. |
| `useCompass()` | Wraps `DeviceOrientationEvent`. Returns `{ bearing, supported, permissionState, calibrationQuality }`. See §7.3 for calibration details. |

### 6.5 Adjective-Noun Generator (src/lib/words.js)

A bundled list of ~200 navigation- and nature-themed adjectives and ~200 nouns (e.g., Crimson, Zenith, Meridian, Solstice, Falcon, Heron). `generateName()` = `adjectives[rand] + ' ' + nouns[rand]`. No external dependency. The list is compact enough to inline in the bundle (~4 KB).

### 6.6 Error Utilities (src/lib/errors.js)

Centralized error display logic. See §13 for full specification.

### 6.7 Phase 5 Task Ownership

| Owner | Task | Notes |
|---|---|---|
| 🤖 AGENT | Scaffold Vite + React 18 project in `/app` with Tailwind CSS v3 | `npm create vite@latest`, then add Tailwind |
| 🤖 AGENT | Write `src/lib/firebase.js` per spec in 6.1 (with emulator connection) | — |
| 🤖 AGENT | Write `App.jsx` with query-param routing per 6.2 | Wrap in ErrorBoundary |
| 🤖 AGENT | Write Zustand store per 6.3 | — |
| 🤖 AGENT | Write all six custom hooks per 6.4 | `useGeolocation` and `useCompass` need careful permission handling |
| 🤖 AGENT | Write `src/lib/words.js` with adjective-noun generator | Navigation- and nature-themed words (~200 × 200), e.g. Crimson, Zenith, Meridian |
| 🤖 AGENT | Write `src/lib/errors.js` per spec in §13 | — |
| 🤖 AGENT | Write `Home.jsx` — single CTA page that creates a session and redirects | Writes to Firestore (including `itemCount: 1`), then sets `?s=` param |
| 🤖 AGENT | Write `Session.jsx` — layout shell with map placeholder, item tabs, Record button | Map canvas, item selector, floating panels |

---

## 7. Phase 6 — Frontend: Map & Capture

### 7.1 Mapbox Integration

Mapbox GL JS v3. The map instance is created in a `useEffect` on the Session page and attached to a div ref. The map instance must be held in a ref to prevent re-mounting on re-renders.

- Token: `import.meta.env.VITE_MAPBOX_TOKEN`
- Default style: `mapbox://styles/mapbox/streets-v12`
- Initial center: participant's GPS location (or `[0,0]` until GPS available)
- Initial zoom: 17 (suitable for ~100m radius field work)

### 7.2 Map Layer Management

All layers are managed imperatively via `map.addSource` / `map.addLayer` / `map.setData`. Use a single GeoJSON source per layer type, updated via `map.getSource(id).setData(newGeoJSON)` on each Firestore update. Do not tear down and re-add layers on data change.

| Source ID | Layer Type | Data |
|---|---|---|
| `observer-points` | circle + symbol | Point per data point. Properties: token, sequence, accuracy. |
| `observer-points-hitarea` | circle (transparent, radius 22px) | Invisible larger tap target overlaid on observer points to achieve the 44px minimum touch target on mobile. |
| `bearing-rays` | line | LineString per data point. 500m extent from observer. |
| `error-wedges` | fill | Polygon (wedge) per data point at bearing ±5°. |
| `triangulation-point` | circle + symbol | Single Point at `estimatedLat`/`Lng`. Hidden if no result. |
| `confidence-polygon` | fill | Polygon from `result.confidencePolygon` (parsed from JSON string). Hidden if null. |
| `confidence-polygon-outline` | line (dashed red) | Outline of the confidence polygon. Reuses the `confidence-polygon` source. Hidden if null. |
| `accuracy-rings` | circle | Circle per observer with radius = accuracy metres. |

> **Auto-zoom:** On item switch or data point arrival, the map calls `fitBounds` to frame all observer points and the triangulation estimate with 60px padding. This keeps all relevant data visible without requiring the user to manually pan or zoom.

### 7.3 Capture Overlay

A full-screen modal overlay shown when the user taps Record. Contains:

- A live compass rose SVG that rotates in real time with `useCompass()` output.
- Current GPS coordinates and accuracy indicator (green < 10m, amber < 20m, red ≥ 20m).
- A "Confirm" button that writes the data point to Firestore and closes the overlay.
- A "Cancel" button.
- If compass not supported: a numeric bearing input (0–360) replaces the compass rose.
- On iOS: triggers `DeviceMotionEvent.requestPermission()` before showing the overlay if not yet granted.
- **Compass calibration warning:** When `webkitCompassAccuracy` (iOS) reports accuracy > 15°, or when `DeviceOrientationEvent.absolute` is false on Android (indicating the compass may be unreliable), display an amber warning banner: "Compass may be inaccurate. Try moving away from metal objects or calibrate by moving your phone in a figure-8." The `useCompass()` hook should expose a `calibrationQuality` field: `'good'`, `'poor'`, or `'unknown'`.

### 7.4 Phase 6 Task Ownership

| Owner | Task | Notes |
|---|---|---|
| 🤖 AGENT | Install `mapbox-gl` v3 and write `MapView` component with all six sources/layers | Imperative GL JS, not react-map-gl |
| 🤖 AGENT | Write layer update logic: on `dataPoints` change, call `source.setData()` for each affected layer | Called from `useEffect` watching `dataPoints` and `result` |
| 🤖 AGENT | Write `CaptureOverlay` component with live compass rose SVG and calibration warning | Uses `useCompass()` and `useGeolocation()` |
| 🤖 AGENT | Write data point write logic: `addDoc` to `dataPoints` sub-collection with all required fields | Includes GA4 event fire |
| 🤖 AGENT | Write data point delete logic: `deleteDoc` via delete mode toggle in item settings | Delete mode activated via `setDeleteMode`; tapping an observer point in delete mode triggers deletion |

---

## 8. Phase 7 — Frontend: Session & Item Management

### 8.1 Session Header

- Displays session name (editable inline on tap). Updates Firestore on blur/enter.
- Share link button: copies `/?s={sessionId}` to clipboard. On mobile, calls `navigator.share()` if available, else clipboard fallback.
- Page title: `document.title = session.name + " — Bearings"`

### 8.2 Item Selector

- Horizontal scrolling tab bar below the header.
- Each tab shows item name + a lock icon if locked.
- Active item highlighted. Tap to switch (local state only).
- A "+ New Item" tab at the right end. Creates item with next sequential name (atomically increments `itemCount` on session doc, uses new value as `itemIndex`), sets it active locally.
- Default item on session load: the item with the latest `createdAt`.

### 8.3 Item Settings Panel

- Accessible via a ⚙️ icon on the active item tab.
- Inline name editor: text input, updates Firestore on blur/enter.
- Lock toggle: switches `item.locked`. Shows confirmation if locking ("Locking prevents new data points.").
- Shows current data point count / 10 cap.
- Delete mode toggle: activates `deleteMode` in the Zustand store. While active, a `DeleteModeBanner` is shown on the map and tapping any observer point prompts for deletion. Switching items (via `setActiveItem`) automatically clears delete mode.

### 8.4 Phase 7 Task Ownership

| Owner | Task | Notes |
|---|---|---|
| 🤖 AGENT | Write `SessionHeader` component with inline session name edit and share button | `navigator.share` fallback to clipboard |
| 🤖 AGENT | Write `ItemTabs` component with horizontal scroll, lock icon, and + New Item button | Uses atomic `itemCount` increment |
| 🤖 AGENT | Write `ItemSettingsPanel` component with name edit, lock toggle, and point count display | — |
| 🤖 AGENT | Wire all item actions (create, rename, lock) to Firestore writes with GA4 events | — |

---

## 9. Phase 8 — Analytics & PWA

### 9.1 Google Analytics 4

Load `gtag.js` in `index.html` with the Measurement ID from `VITE_GA_ID`. Thin wrapper:

```js
// src/lib/analytics.js
export const track = (event, params = {}) => {
  if (typeof window.gtag !== 'function') return;
  window.gtag('event', event, params);
};
```

Import `track()` and call it at each event site listed in PRD §12. All calls fire-and-forget (no await).

### 9.2 PWA

- `public/manifest.json`: name, short_name, icons (192px + 512px SVG placeholders), theme_color, `display: standalone`, `start_url: /`
- Service worker: minimal Workbox setup for shell caching only. No data caching (Firestore SDK handles its own persistence).
- Register SW in `main.jsx` only in production builds.

### 9.3 Phase 8 Task Ownership

| Owner | Task | Notes |
|---|---|---|
| 🤖 AGENT | Add `gtag.js` script to `index.html` and write `src/lib/analytics.js` | — |
| 🤖 AGENT | Add all GA4 `track()` calls at the correct event sites per PRD §12 | — |
| 🤖 AGENT | Write `public/manifest.json` with placeholder icons | — |
| 🤖 AGENT | Add Workbox plugin to `vite.config.js` for shell caching | `vite-plugin-pwa` |

---

## 10. Phase 9 — End-to-End QA & Deploy

### 10.1 Dev Smoke Test Checklist

After first full deploy to `bearings-app-dev`, verify:

- [ ] Home page loads, "Start New Session" creates a session and redirects to `/?s=...`
- [ ] Share link copies to clipboard.
- [ ] Joining session on a second device (or incognito window) shows the live map.
- [ ] Record records a data point; it appears on both devices' maps within 2s.
- [ ] Second data point from a different position produces a triangulation pin on both maps.
- [ ] Item rename propagates to both devices in real time.
- [ ] Item lock disables Record button on both devices.
- [ ] Data point delete removes the point and updates triangulation on both devices.
- [ ] Max 10 points: 11th tap shows "Max data points reached."
- [ ] GA4 DebugView shows events firing correctly.
- [ ] Compass calibration warning appears when compass accuracy is poor.
- [ ] Low confidence triangulation result shows appropriate warning banner.
- [ ] Invalid session URL (e.g., `/?s=doesnotexist`) shows "Session not found" page.
- [ ] Error boundary catches unexpected errors with appropriate dev/prod display.

### 10.2 Phase 9 Task Ownership

| Owner | Task | Notes |
|---|---|---|
| 🤖 AGENT | Run production build locally (`npm run build`) and fix any build errors | — |
| 🤖 AGENT | Push to `main` branch to trigger dev deploy workflow | Watch GitHub Actions run |
| 👤 YOU | Run smoke test checklist (10.1) on the deployed dev URL | Requires a real mobile device for GPS/compass |
| 👤 YOU | Report any failures; agent fixes and re-deploys to dev | — |
| 👤 YOU | When dev is green: create a git tag to trigger prod deploy | `git tag v1.0.0 && git push --tags` |
| 👤 YOU | Verify prod URL and confirm GA4 production data stream is receiving events | analytics.google.com → Realtime |

---

## 11. Component Tree

```
App
  ├── ErrorBoundary                   # catches unexpected errors
  ├── Home                            # /?  (no session param)
  │   └── [Start New Session button]
  ├── SessionNotFound                 # /?s={invalid}
  └── Session                         # /?s={id}
      ├── SessionHeader
      │   ├── InlineNameEditor        # session.name
      │   └── ShareButton
      ├── ItemTabs
      │   ├── ItemTab (x N)           # name, locked badge
      │   └── NewItemTab
      ├── MapView                     # Mapbox GL canvas
      │   ├── [imperative layer management]
      │   └── DeleteModeBanner        # amber banner shown when deleteMode is active; tap an observer point to delete it
      ├── RecordButton                # floating, bottom-center
      ├── CaptureOverlay              # conditional modal
      │   ├── CompassRose             # SVG, live rotation
      │   ├── CompassCalibrationWarning  # amber banner if poor calibration
      │   ├── GpsStatus               # accuracy indicator
      │   ├── ManualBearingInput      # fallback
      │   └── [Confirm / Cancel]
      ├── TriangulationWarning        # banner for lowConfidence / insufficientSpread
      └── ItemSettingsPanel           # slide-up sheet
          ├── InlineNameEditor        # item.name
          ├── LockToggle
          └── DataPointCount          # N / 10
```

---

## 12. Key Technical Risks & Mitigations

| Risk | Likelihood | Mitigation |
|---|---|---|
| iOS compass permission dialog not firing | High — iOS 13+ requires user gesture | Trigger `DeviceMotionEvent.requestPermission()` inside the Record button click handler, not on mount |
| GPS accuracy too low in dense cover | Medium | Show accuracy warning at > 20m; store accuracy per point for v2 weighting |
| Function cold start > 5s on first trigger | Medium | Use `min-instances: 1` in Functions v2 config for prod (small cost) |
| Parallel bearings produce degenerate intersection | Medium — common in practice | `insufficientSpread` flag + UI hint; threshold at 10° spread |
| Near-parallel rays pass spread check but produce distant estimate | Medium | `lowConfidence` flag when estimate is >2km from observers; UI prompt to delete/retry |
| Compass poorly calibrated near metal objects | Medium | Calibration warning in capture overlay when accuracy is poor |
| Firestore data point cap race condition (two clients both at 9) | Low | Client-side cap only in v1; acceptable for low-concurrency use case |
| Session ID collision (8 chars) | Negligible (~1 in 2.8T) | Log a warning and retry once on collision |

---

## 13. Error Handling

### 13.1 Error Boundary

The app is wrapped in a React ErrorBoundary component at the top level.

**Development mode** (`import.meta.env.DEV`):
- Full stack trace displayed
- Firestore document path (if applicable)
- Request/response details (if applicable)
- Error message and error code
- "Copy Error Details" button that copies all of the above to clipboard as formatted text
- "Reload" button

**Production mode:**
- Generic message: "Something went wrong. Please refresh the page."
- "Reload" button
- Error is logged to `console.error` (picked up by any future error monitoring)

### 13.2 Session Not Found

When `useSession(sessionId)` resolves with no document, render a `SessionNotFound` page:
- Message: "This session doesn't exist or may have been removed."
- CTA: "Start a New Session" button linking to `/`

### 13.3 Firestore Connection Errors

Firestore SDK handles reconnection automatically. For errors surfaced by real-time listeners:
- In dev: toast notification with full error details + copy button
- In prod: toast notification with "Connection issue. Retrying..."
- The SDK will retry automatically; no manual retry logic needed

### 13.4 Cloud Function Errors

Function errors are silent to the client — the triangulation result simply won't update. No special UI is needed. If the result hasn't updated in >10 seconds after a data point write, the UI may optionally show a subtle "Computing..." indicator, but this is not required for v1.

### 13.5 GPS & Compass Errors

- **GPS permission denied:** Persistent banner: "Location access is required to use Bearings. Please enable it in your browser settings." Record button disabled.
- **GPS unavailable:** Same banner with "Location is not available on this device."
- **Compass unavailable:** Automatic fallback to manual bearing input (§7.3). No error banner — manual input is the designed fallback.
- **Poor compass calibration:** Amber warning in capture overlay (§7.3).

### 13.6 Triangulation Quality Warnings

Displayed as a dismissible banner on the map view:

- **`insufficientSpread: true`:** "Bearings are too similar. Add points from different directions for a better result."
- **`lowConfidence: true`:** "Result may be inaccurate. Try adding points from different angles, or delete a point that seems off."
