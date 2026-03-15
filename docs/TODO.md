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
