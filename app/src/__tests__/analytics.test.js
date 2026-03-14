/**
 * Unit tests for the analytics track() wrapper.
 * These test the real implementation (not mocked).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Import the real module (not mocked in integration tests)
const { track } = await import('../lib/analytics.js');

describe('analytics.track()', () => {
  afterEach(() => {
    delete window.gtag;
  });

  it('does not throw when gtag is not defined', () => {
    delete window.gtag;
    expect(() => track('test_event')).not.toThrow();
  });

  it('calls window.gtag when defined', () => {
    window.gtag = vi.fn();
    track('test_event', { key: 'value' });
    expect(window.gtag).toHaveBeenCalledWith('event', 'test_event', { key: 'value' });
  });

  it('passes empty params object by default', () => {
    window.gtag = vi.fn();
    track('session_created');
    expect(window.gtag).toHaveBeenCalledWith('event', 'session_created', {});
  });
});
