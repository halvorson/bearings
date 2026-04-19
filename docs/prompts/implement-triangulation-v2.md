Implement the triangulation algorithm changes described in `docs/Triangulation_TDD_v2.md`, Steps 1–5.

Read the TDD v2 first — it has the full spec, pseudocode, parameters, and rationale from cross-validated evaluation.

Summary of changes:

1. **Update fixtures** (`functions/__tests__/fixtures/ancient-gap/`): Pull latest data from Firebase dev Firestore (session `fruDQ9CF`) and update all fixture files. Add `alcatraz.json` and `salesforce-tower.json`. Known coordinates: Alcatraz (37.82711, -122.42302), Salesforce Tower (37.78986, -122.39722). Update `session.json`.

2. **Implement self-calibrating angular IRLS** in `functions/src/triangulate.js`:
   - Add self-calibrating bias estimation step before IRLS (sweep [-5°, +25°] at 0.5° steps, min 3 points, minimize total squared perpendicular residuals)
   - Replace perpendicular distance residuals with angular residuals in IRLS loop
   - Change Huber threshold from 50m (perpendicular) to 10° (angular)
   - Keep IRLS disabled for n ≤ 3
   - Update confidence polygon to use calibrated bearings

3. **Update field tests** (`functions/__tests__/triangulate.field.test.js`): Add new items, update baseline assertions. Run `cd functions && npx vitest run` to verify.

4. **Client-side declination** (`app/src/hooks/useCompass.js`): Install `geomagnetism` in `/app`, apply magnetic declination correction to compass readings before returning them. Declination needs the user's GPS position — accept it as a parameter or compute once when available.

5. **Deploy to dev**: Bump version in `app/package.json`, build and deploy: `cd app && npm run build && cd .. && firebase deploy --only hosting --project dev`. Deploy functions too: `firebase deploy --only functions --project dev`.

After implementation, run the cross-validation benchmark to verify no regression: `node functions/__tests__/cross-validation.cjs`
