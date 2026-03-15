# Bearings

Collaborative GPS + compass triangulation PWA. Point your phone at a target, tap Record, and combine bearings from multiple participants to pinpoint its location on a map.

**Current version:** 0.2.2

## Tech Stack

- **Frontend:** React 18 + Vite, Tailwind CSS v3, Zustand, Mapbox GL JS v3
- **Backend:** Firebase (Hosting, Firestore, Cloud Functions v2)
- **Analytics:** Google Analytics 4

## Key Features

- Real-time collaborative triangulation from multiple observers
- Least-squares ray intersection with confidence polygon visualization
- Delete mode for removing bad data points
- Auto-zoom to fit all data points when switching items
- No authentication required — share via URL

## Repo Structure

```
app/          React frontend (Vite)
functions/    Firebase Cloud Functions (triangulation)
docs/         PRD, TDD, implementation plan
```

## Local Development

```bash
# Install dependencies
cd app && npm install
cd ../functions && npm install

# Copy env template and fill in values
cp app/.env.local.example app/.env.local

# Start Firebase emulators + Vite dev server
firebase emulators:start
cd app && npm run dev
```

## Deployment

- **Dev:** Push to `main` → auto-deploys to `bearings-app-dev`
- **Prod:** Push a `v*.*.*` tag → auto-deploys to `bearings-app-prod`

## Docs

- [PRD v0.3](docs/Bearings_PRD_v0.3.md)
- [TDD v0.2](docs/Bearings_TDD_v0.2.md)
- [Implementation Plan](docs/Implementation_Plan_v1.md)
- [Setup Guide](docs/Bearings_Setup_Guide.md)
- [TODO Tracker](docs/TODO.md)
