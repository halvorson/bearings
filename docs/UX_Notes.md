# UX Overhaul Notes

## CTA Naming

Current: "Track" — too vague, doesn't communicate what happens on press.

Candidates:
- **"Record Bearing"** — accurate but wordy
- **"Pin Bearing"** — short, implies placing a marker
- **"Mark"** — minimal, action-oriented (like marking a waypoint)
- **"Sight"** — fits the act of sighting a target through a compass
- **"Log"** — simple, implies recording data
- **"Drop Pin"** — familiar from maps apps, but we're recording a bearing not just a location
- **"Capture"** — already used internally (CaptureOverlay), implies recording a moment

Open questions:
- Should the label change contextually? e.g. "Mark Bearing" first time, then just "Mark" after?
- Should it include the current bearing in the button? e.g. "Mark 247°"

---

## Session Page Layout

**Current problem:** The map is full-screen with the CTA floating on top of it. The CTA competes visually with the map and feels secondary.

**Principle:** The CTA (recording a bearing) is the primary action. The map is important context but should support, not dominate.

Layout ideas:
- **Bottom panel approach:** Map takes upper ~60% of screen. Bottom 40% is a dedicated panel with the compass bearing readout, GPS status, and the CTA button. Clear visual separation.
- **Split view:** Map on top, fixed bottom card with bearing + CTA. Similar to ride-sharing apps where the map is context and the bottom sheet is the action area.
- **Drawer approach:** Minimal bottom bar with CTA + bearing. Map fills most of the screen. Swipe up to see more details (data points, settings). The CTA is always anchored and visually distinct.

Key considerations:
- Compass bearing readout must be visible alongside the CTA so users know what they're about to record
- GPS accuracy indicator should be near the CTA (don't save bad data unknowingly)
- Item tabs and session header still need a home — possibly in the bottom panel rather than floating on the map
- The map should still be interactive (pan, zoom, tap to delete points)

---

## Open Items

- [ ] Decide on CTA label
- [ ] Decide on layout approach
- [ ] Consider onboarding/first-use — user lands on session page, what do they see?
- [ ] Compass permission flow — currently returns silently on first tap (iOS), no feedback
