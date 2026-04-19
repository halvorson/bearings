import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { computeTriangulation } = require('../src/triangulate.js');

const __dirname = dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function loadFixture(filename) {
  const path = join(__dirname, 'fixtures', 'ancient-gap', filename);
  return JSON.parse(readFileSync(path, 'utf-8'));
}

function pointsFrom(item) {
  return item.dataPoints.map((dp) => ({
    lat: dp.lat, lng: dp.lng, bearing: dp.bearing, accuracy: dp.accuracy,
  }));
}

function errorFor(item) {
  const result = computeTriangulation(pointsFrom(item));
  if (result.estimatedLat == null) return { result, error: null };
  const error = haversineDistance(
    result.estimatedLat, result.estimatedLng,
    item.knownLocation.lat, item.knownLocation.lng,
  );
  return { result, error };
}

// ---------------------------------------------------------------------------
// Ancient Gap field data — baseline tests (v3 self-calibrating angular IRLS)
// ---------------------------------------------------------------------------

describe('Ancient Gap field data — baseline accuracy', () => {
  const fixtures = [
    'n-tower-ggb.json',
    's-tower-ggb.json',
    'sutro-tower.json',
    'pt-bonita-lighthouse.json',
    'alcatraz.json',
    'salesforce-tower.json',
  ];

  for (const file of fixtures) {
    const item = loadFixture(file);
    const points = pointsFrom(item);

    it(`${item.name}: produces a result with ${points.length} points`, () => {
      const { result, error } = errorFor(item);
      expect(result.dataPointCount).toBe(points.length);
      if (error !== null) {
        console.log(
          `  ${item.name}: ${Math.round(error)}m error` +
            (result.lowConfidence ? ' (low confidence)' : ''),
        );
      } else {
        console.log(
          `  ${item.name}: no estimate` +
            (result.insufficientSpread ? ' (insufficient spread)' : ''),
        );
      }
    });
  }

  // Baseline assertions from v3 full-dataset results (2026-04-18):
  //   S Tower=328m, N Tower=204m, Sutro=73m, Pt Bonita=808m,
  //   Alcatraz=341m, Salesforce=563m
  // Each bound adds headroom for numerical noise / future tweaks.

  it('S Tower GGB (7 pts): within 400m', () => {
    const { error } = errorFor(loadFixture('s-tower-ggb.json'));
    expect(error).not.toBeNull();
    expect(error).toBeLessThan(400);
  });

  it('N Tower GGB (5 pts): within 300m', () => {
    const { error } = errorFor(loadFixture('n-tower-ggb.json'));
    expect(error).not.toBeNull();
    expect(error).toBeLessThan(300);
  });

  it('Sutro Tower (5 pts): within 150m', () => {
    const { error } = errorFor(loadFixture('sutro-tower.json'));
    expect(error).not.toBeNull();
    expect(error).toBeLessThan(150);
  });

  it('Pt Bonita Lighthouse (3 pts): within 900m', () => {
    const { error } = errorFor(loadFixture('pt-bonita-lighthouse.json'));
    expect(error).not.toBeNull();
    expect(error).toBeLessThan(900);
  });

  it('Alcatraz (4 pts): within 450m', () => {
    const { error } = errorFor(loadFixture('alcatraz.json'));
    expect(error).not.toBeNull();
    expect(error).toBeLessThan(450);
  });

  it('Salesforce Tower (4 pts): within 700m', () => {
    const { error } = errorFor(loadFixture('salesforce-tower.json'));
    expect(error).not.toBeNull();
    expect(error).toBeLessThan(700);
  });
});

// ---------------------------------------------------------------------------
// Convergence regression — adding data should not make error dramatically worse
// ---------------------------------------------------------------------------

describe('Ancient Gap field data — convergence regression', () => {
  const convergenceItems = [
    's-tower-ggb.json',
    'n-tower-ggb.json',
    'sutro-tower.json',
    'alcatraz.json',
    'salesforce-tower.json',
  ];

  for (const file of convergenceItems) {
    const item = loadFixture(file);
    const points = pointsFrom(item);

    it(`${item.name}: final error ≤ 2-point error (weak monotonicity)`, () => {
      const twoPt = computeTriangulation(points.slice(0, 2));
      const full = computeTriangulation(points);
      if (twoPt.estimatedLat == null || full.estimatedLat == null) return;

      const twoErr = haversineDistance(
        twoPt.estimatedLat, twoPt.estimatedLng,
        item.knownLocation.lat, item.knownLocation.lng,
      );
      const fullErr = haversineDistance(
        full.estimatedLat, full.estimatedLng,
        item.knownLocation.lat, item.knownLocation.lng,
      );
      console.log(`  ${item.name}: 2pts→${Math.round(twoErr)}m → ${points.length}pts→${Math.round(fullErr)}m`);
      expect(fullErr).toBeLessThanOrEqual(twoErr);
    });
  }
});

// ---------------------------------------------------------------------------
// Leave-one-out analysis — diagnostic logging
// ---------------------------------------------------------------------------

describe('Ancient Gap field data — leave-one-out analysis', () => {
  const itemsWithEstimates = [
    'n-tower-ggb.json',
    's-tower-ggb.json',
    'pt-bonita-lighthouse.json',
    'alcatraz.json',
    'salesforce-tower.json',
  ];

  for (const file of itemsWithEstimates) {
    const item = loadFixture(file);
    const points = pointsFrom(item);

    it(`${item.name}: leave-one-out analysis (${points.length} points)`, () => {
      const fullResult = computeTriangulation(points);
      const fullError = haversineDistance(
        fullResult.estimatedLat, fullResult.estimatedLng,
        item.knownLocation.lat, item.knownLocation.lng,
      );
      console.log(`  ${item.name} full set: ${Math.round(fullError)}m`);

      for (let i = 0; i < points.length; i++) {
        const subset = points.filter((_, j) => j !== i);
        const result = computeTriangulation(subset);
        if (result.estimatedLat != null) {
          const error = haversineDistance(
            result.estimatedLat, result.estimatedLng,
            item.knownLocation.lat, item.knownLocation.lng,
          );
          const delta = error - fullError;
          console.log(
            `  Without point ${i} (bearing ${points[i].bearing.toFixed(1)}°): ` +
              `${Math.round(error)}m (${delta > 0 ? '+' : ''}${Math.round(delta)}m)`,
          );
        } else {
          console.log(
            `  Without point ${i} (bearing ${points[i].bearing.toFixed(1)}°): no estimate`,
          );
        }
      }
    });
  }
});
