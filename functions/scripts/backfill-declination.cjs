/**
 * One-shot migration: add magnetic declination to stored bearings so legacy
 * data points (written before v0.3.1) match the true-north convention used
 * by v0.3.1+ readings.
 *
 * Idempotent: each updated doc is stamped `declinationCorrected: true` and
 * skipped on subsequent runs.
 *
 * Usage:
 *   cd functions
 *   # Dry run (default):
 *   node scripts/backfill-declination.cjs --project bearings-app-dev
 *   # Apply:
 *   node scripts/backfill-declination.cjs --project bearings-app-dev --apply
 *
 * Requires GOOGLE_APPLICATION_CREDENTIALS or a logged-in `gcloud auth
 * application-default login` for the target project.
 */

const admin = require('firebase-admin');
const geomagnetism = require('geomagnetism');

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const projIdx = args.indexOf('--project');
const projectId = projIdx >= 0 ? args[projIdx + 1] : null;

if (!projectId) {
  console.error('Missing --project <id>');
  process.exit(1);
}

admin.initializeApp({ projectId });
const db = admin.firestore();

async function run() {
  const sessionsSnap = await db.collection('sessions').get();
  console.log(`Found ${sessionsSnap.size} sessions in ${projectId}`);

  let scanned = 0;
  let skipped = 0;
  let updated = 0;

  for (const sessionDoc of sessionsSnap.docs) {
    const itemsSnap = await sessionDoc.ref.collection('items').get();
    for (const itemDoc of itemsSnap.docs) {
      const dpSnap = await itemDoc.ref.collection('dataPoints').get();
      for (const dp of dpSnap.docs) {
        scanned++;
        const d = dp.data();
        if (d.declinationCorrected) {
          skipped++;
          continue;
        }
        if (typeof d.lat !== 'number' || typeof d.lng !== 'number' || typeof d.bearing !== 'number') {
          skipped++;
          continue;
        }
        const decl = geomagnetism.model().point([d.lat, d.lng]).decl;
        const newBearing = ((d.bearing + decl) % 360 + 360) % 360;
        const label = `${sessionDoc.id}/${itemDoc.id}/${dp.id}`;
        console.log(`  ${label}  ${d.bearing.toFixed(2)}° + ${decl.toFixed(2)}° → ${newBearing.toFixed(2)}°`);
        if (apply) {
          await dp.ref.update({
            bearing: newBearing,
            declinationCorrected: true,
            declinationAppliedDeg: decl,
          });
        }
        updated++;
      }
    }
  }

  console.log('---');
  console.log(`scanned: ${scanned}`);
  console.log(`skipped (already corrected or malformed): ${skipped}`);
  console.log(`${apply ? 'updated' : 'would update'}: ${updated}`);
  if (!apply) console.log('(dry run — re-run with --apply to write)');
}

run().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
