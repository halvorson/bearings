# Bearings — Agent Instructions

## Project Overview
Collaborative GPS + compass triangulation PWA. No auth — sessions shared via URL query param `/?s=`.

## Tech Stack
- Frontend: React 18 + Vite, Tailwind CSS v3, Zustand, Mapbox GL JS v3, React Router v6
- Backend: Firebase Hosting + Firestore + Cloud Functions v2, Node.js 20
- Analytics: GA4 via gtag.js
- Monorepo: `/app` (frontend) + `/functions` (Cloud Functions)

## Key Docs (read before starting work)
- **TDD v0.2:** `docs/Bearings_TDD_v0.2.md` — authoritative technical spec
- **PRD v0.3:** `docs/Bearings_PRD_v0.3.md` — product requirements
- **Implementation Plan:** `docs/Implementation_Plan_v1.md` — phased build plan with checkpoints
- **UX Notes:** `docs/UX_Notes.md` — design direction for Phase 9 UX overhaul

## Firebase Projects
- Dev: `bearings-app-dev` (default)
- Prod: `bearings-app-prod`

## Local Dev
- `app/.env.local` has Firebase config, Mapbox token, GA ID
- Firebase emulators: Firestore on 8080, Functions on 5001, UI on 4000
- Frontend connects to emulators automatically in dev mode (`import.meta.env.DEV`)

## Testing Changes
This is a mobile PWA that requires HTTPS for compass/orientation APIs. Local dev servers cannot test device features. After making changes, always deploy to the dev environment before asking the user to test:
```
cd app && npm run build && cd .. && firebase deploy --only hosting --project dev
```
Live URL: https://bearings-app-dev.web.app

## Key Architecture Decisions
- No client-side triangulation preview — wait for Cloud Function result
- 10-point data cap per item: client-side enforcement only
- `itemCount` on session doc for atomic sequential item naming
- Last-write-wins for concurrent name edits
- Errors: verbose in dev (full details + copy button), generic in prod
- Compass calibration warning when accuracy is poor
- `lowConfidence` flag when triangulation estimate is >2km from observers

## Conventions
- Domain-generic: never reference birds, birdwatching, or similar — the core concept is "item"
- Mobile-first: all tap targets ≥44×44px
- Mapbox layers managed imperatively (not react-map-gl)
- Firebase config is base64-encoded valid JSON (double-quoted keys)
- GA4 events tracked via `src/lib/analytics.js` `track()` wrapper

## Bash Permissions Policy
Use dedicated tools (Read, Edit, Write, Glob, Grep) instead of shell equivalents (`cat`, `head`, `sed`, `grep`, `find`, etc.). The allowlist in `.claude/settings.local.json` is intentionally minimal:
- **Build/run:** `node`, `npm`, `npx`, `firebase`
- **Version control:** `git`, `gh`
- **Network:** `curl`
- **Filesystem:** `ls`, `mkdir`, `cp`, `mv`, `which`, `pwd`
- **Process management:** `kill`, `lsof` (for stopping emulators)

Do not add commands to the allowlist for one-off tasks — accept the permission prompt instead. Only add commands that are needed repeatedly across sessions.

## Development Workflow
- Opus coordinates, Sonnet writes code, Haiku does reviews and lightweight tasks
- Every phase ends with a checkpoint PR
- Sonnet reviews for: triangulation math, Mapbox layers, capture flow, integration
- Haiku reviews for: scaffold, config, wiring phases
