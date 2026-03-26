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

// ---------------------------------------------------------------------------
// Ancient Gap field data — baseline tests
// ---------------------------------------------------------------------------

describe('Ancient Gap field data — baseline accuracy', () => {
  const fixtures = [
    { file: 'n-tower-ggb.json', minPoints: 3 },
    { file: 's-tower-ggb.json', minPoints: 5 },
    { file: 'sutro-tower.json', minPoints: 2 },
    { file: 'pt-bonita-lighthouse.json', minPoints: 3 },
  ];

  for (const { file } of fixtures) {
    const item = loadFixture(file);
    const points = item.dataPoints.map((dp) => ({
      lat: dp.lat,
      lng: dp.lng,
      bearing: dp.bearing,
      accuracy: dp.accuracy,
    }));

    it(`${item.name}: produces a result with ${points.length} points`, () => {
      const result = computeTriangulation(points);
      expect(result.dataPointCount).toBe(points.length);

      if (result.estimatedLat != null) {
        const error = haversineDistance(
          result.estimatedLat,
          result.estimatedLng,
          item.knownLocation.lat,
          item.knownLocation.lng,
        );
        // Log baseline accuracy for reference
        console.log(
          `  ${item.name}: ${Math.round(error)}m error` +
            (result.lowConfidence ? ' (low confidence)' : '') +
            (result.insufficientSpread ? ' (insufficient spread)' : ''),
        );
      } else {
        console.log(
          `  ${item.name}: no estimate` +
            (result.insufficientSpread ? ' (insufficient spread)' : ''),
        );
      }
    });
  }

  // Specific baseline assertions — these document current behavior
  // and will be tightened as the algorithm improves

  it('S Tower GGB (5 pts): estimate within 400m', () => {
    const item = loadFixture('s-tower-ggb.json');
    const points = item.dataPoints.map((dp) => ({
      lat: dp.lat, lng: dp.lng, bearing: dp.bearing, accuracy: dp.accuracy,
    }));
    const result = computeTriangulation(points);
    expect(result.estimatedLat).toBeDefined();
    const error = haversineDistance(
      result.estimatedLat, result.estimatedLng,
      item.knownLocation.lat, item.knownLocation.lng,
    );
    expect(error).toBeLessThan(400);
  });

  it('N Tower GGB (3 pts): estimate within 850m', () => {
    const item = loadFixture('n-tower-ggb.json');
    const points = item.dataPoints.map((dp) => ({
      lat: dp.lat, lng: dp.lng, bearing: dp.bearing, accuracy: dp.accuracy,
    }));
    const result = computeTriangulation(points);
    expect(result.estimatedLat).toBeDefined();
    const error = haversineDistance(
      result.estimatedLat, result.estimatedLng,
      item.knownLocation.lat, item.knownLocation.lng,
    );
    expect(error).toBeLessThan(850);
  });

  it('Pt Bonita Lighthouse (3 pts): estimate within 850m', () => {
    const item = loadFixture('pt-bonita-lighthouse.json');
    const points = item.dataPoints.map((dp) => ({
      lat: dp.lat, lng: dp.lng, bearing: dp.bearing, accuracy: dp.accuracy,
    }));
    const result = computeTriangulation(points);
    expect(result.estimatedLat).toBeDefined();
    const error = haversineDistance(
      result.estimatedLat, result.estimatedLng,
      item.knownLocation.lat, item.knownLocation.lng,
    );
    expect(error).toBeLessThan(850);
  });

  it('Sutro Tower (2 pts, 8.8° spread): no estimate (insufficient spread)', () => {
    const item = loadFixture('sutro-tower.json');
    const points = item.dataPoints.map((dp) => ({
      lat: dp.lat, lng: dp.lng, bearing: dp.bearing, accuracy: dp.accuracy,
    }));
    const result = computeTriangulation(points);
    expect(result.insufficientSpread).toBe(true);
    expect(result.estimatedLat).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Leave-one-out analysis — measures per-point impact
// ---------------------------------------------------------------------------

describe('Ancient Gap field data — leave-one-out analysis', () => {
  const itemsWithEstimates = [
    'n-tower-ggb.json',
    's-tower-ggb.json',
    'pt-bonita-lighthouse.json',
  ];

  for (const file of itemsWithEstimates) {
    const item = loadFixture(file);
    const points = item.dataPoints.map((dp) => ({
      lat: dp.lat, lng: dp.lng, bearing: dp.bearing, accuracy: dp.accuracy,
    }));

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
