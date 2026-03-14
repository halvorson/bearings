import { describe, it, expect } from 'vitest';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { computeTriangulation } = require('../src/triangulate.js');

// Phase 0 stub tests — full test suite added in Phase 1

describe('computeTriangulation (stub)', () => {
  it('returns dataPointCount of 0 for empty input', () => {
    const result = computeTriangulation([]);
    expect(result.dataPointCount).toBe(0);
  });

  it('returns dataPointCount of 1 for single point', () => {
    const result = computeTriangulation([
      { lat: 51.5, lng: -0.1, bearing: 90 }
    ]);
    expect(result.dataPointCount).toBe(1);
  });
});
