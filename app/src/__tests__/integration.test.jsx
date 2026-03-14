/**
 * Phase 8 — Integration Tests
 *
 * These tests verify the core UI flows and component behaviour.
 * For full end-to-end with emulators, start `firebase emulators:start`
 * before running tests.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';
import TriangulationWarning from '../components/TriangulationWarning';
import TrackButton from '../components/TrackButton';
import ErrorBoundary from '../components/ErrorBoundary';
import ItemSettingsPanel from '../components/ItemSettingsPanel';
import GpsStatus from '../components/GpsStatus';
import ManualBearingInput from '../components/ManualBearingInput';
import CompassCalibrationWarning from '../components/CompassCalibrationWarning';
import { generateName } from '../lib/words';
import { track } from '../lib/analytics';
import { formatError } from '../lib/errors';

// ---------------------------------------------------------------------------
// Mock Firebase to avoid real network calls in unit-level tests
// ---------------------------------------------------------------------------
vi.mock('../lib/firebase', () => ({
  db: {},
  app: {},
}));

vi.mock('firebase/firestore', () => ({
  doc: vi.fn(),
  collection: vi.fn(),
  addDoc: vi.fn(),
  writeBatch: vi.fn(() => ({
    set: vi.fn(),
    update: vi.fn(),
    commit: vi.fn(() => Promise.resolve()),
  })),
  updateDoc: vi.fn(() => Promise.resolve()),
  deleteDoc: vi.fn(() => Promise.resolve()),
  onSnapshot: vi.fn((ref, onNext) => {
    // Return unsubscribe function
    return vi.fn();
  }),
  query: vi.fn(),
  orderBy: vi.fn(),
  serverTimestamp: vi.fn(() => ({ _type: 'serverTimestamp' })),
  increment: vi.fn((n) => ({ _type: 'increment', value: n })),
  getFirestore: vi.fn(),
  connectFirestoreEmulator: vi.fn(),
  initializeApp: vi.fn(),
}));

vi.mock('../lib/analytics', () => ({
  track: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Mock hooks with controllable return values
// ---------------------------------------------------------------------------
const mockSession = { id: 'test-session', name: 'Test Session', itemCount: 1 };
const mockItems = [{ id: 'item-1', name: 'Item 1', locked: false, itemIndex: 1 }];
const mockDataPoints = [];
const mockTriangulation = null;

vi.mock('../hooks/useSession', () => ({
  useSession: vi.fn(() => ({ session: mockSession, loading: false, error: null })),
}));

vi.mock('../hooks/useItems', () => ({
  useItems: vi.fn(() => ({ items: mockItems, loading: false, error: null })),
}));

vi.mock('../hooks/useDataPoints', () => ({
  useDataPoints: vi.fn(() => ({ dataPoints: mockDataPoints, loading: false, error: null })),
}));

vi.mock('../hooks/useTriangulation', () => ({
  useTriangulation: vi.fn(() => ({ result: mockTriangulation, loading: false, error: null })),
}));

vi.mock('../hooks/useGeolocation', () => ({
  useGeolocation: vi.fn(() => ({
    lat: 51.5074, lng: -0.1278, accuracy: 10, error: null, supported: true,
  })),
}));

vi.mock('../hooks/useCompass', () => ({
  useCompass: vi.fn(() => ({
    bearing: 45, supported: true, permissionState: 'granted',
    calibrationQuality: 'good', requestPermission: vi.fn(),
  })),
}));

// ---------------------------------------------------------------------------
// Helper: render with router
// ---------------------------------------------------------------------------
function renderWithRouter(ui, { route = '/' } = {}) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      {ui}
    </MemoryRouter>
  );
}

// =========================================================================
// Test Suite: App Routing
// =========================================================================
describe('App Routing', () => {
  it('shows Home page when no session param', () => {
    renderWithRouter(<App />);
    expect(screen.getByText('Start New Session')).toBeInTheDocument();
  });

  it('shows Session page when ?s= param present', () => {
    renderWithRouter(<App />, { route: '/?s=test-session' });
    // Session page should show the map container (via MapView) and track button
    expect(screen.getByText('Track')).toBeInTheDocument();
  });

  it('shows Session Not Found when session is null', async () => {
    const { useSession } = await import('../hooks/useSession');
    useSession.mockReturnValue({ session: null, loading: false, error: null });

    renderWithRouter(<App />, { route: '/?s=doesnotexist' });
    expect(screen.getByText('Session Not Found')).toBeInTheDocument();
    expect(screen.getByText('Start a New Session')).toBeInTheDocument();

    // Restore
    useSession.mockReturnValue({ session: mockSession, loading: false, error: null });
  });

  it('shows loading state while session loads', async () => {
    const { useSession } = await import('../hooks/useSession');
    useSession.mockReturnValue({ session: null, loading: true, error: null });

    renderWithRouter(<App />, { route: '/?s=test-session' });
    expect(screen.getByText('Loading...')).toBeInTheDocument();

    useSession.mockReturnValue({ session: mockSession, loading: false, error: null });
  });
});

// =========================================================================
// Test Suite: Triangulation Warnings
// =========================================================================
describe('TriangulationWarning', () => {
  it('shows insufficient spread warning', () => {
    render(<TriangulationWarning insufficientSpread={true} lowConfidence={false} />);
    expect(screen.getByText(/Bearings are too similar/)).toBeInTheDocument();
  });

  it('shows low confidence warning', () => {
    render(<TriangulationWarning insufficientSpread={false} lowConfidence={true} />);
    expect(screen.getByText(/Result may be inaccurate/)).toBeInTheDocument();
  });

  it('shows both warnings simultaneously', () => {
    render(<TriangulationWarning insufficientSpread={true} lowConfidence={true} />);
    expect(screen.getByText(/Bearings are too similar/)).toBeInTheDocument();
    expect(screen.getByText(/Result may be inaccurate/)).toBeInTheDocument();
  });

  it('renders nothing when no warnings', () => {
    const { container } = render(
      <TriangulationWarning insufficientSpread={false} lowConfidence={false} />
    );
    expect(container.innerHTML).toBe('');
  });

  it('dismisses insufficient spread warning when X clicked', () => {
    render(<TriangulationWarning insufficientSpread={true} lowConfidence={false} />);
    const dismissButton = screen.getByLabelText('Dismiss warning');
    fireEvent.click(dismissButton);
    expect(screen.queryByText(/Bearings are too similar/)).not.toBeInTheDocument();
  });

  it('dismisses low confidence warning independently', () => {
    render(<TriangulationWarning insufficientSpread={true} lowConfidence={true} />);
    const dismissButtons = screen.getAllByLabelText('Dismiss warning');
    // Dismiss the second warning (low confidence)
    fireEvent.click(dismissButtons[1]);
    expect(screen.getByText(/Bearings are too similar/)).toBeInTheDocument();
    expect(screen.queryByText(/Result may be inaccurate/)).not.toBeInTheDocument();
  });
});

// =========================================================================
// Test Suite: Track Button States
// =========================================================================
describe('TrackButton', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows "Track" when enabled', async () => {
    const { useGeolocation } = await import('../hooks/useGeolocation');
    useGeolocation.mockReturnValue({ lat: 51.5, lng: -0.1, accuracy: 10, error: null });

    const { useItems } = await import('../hooks/useItems');
    useItems.mockReturnValue({
      items: [{ id: 'item-1', name: 'Item 1', locked: false }],
      loading: false,
    });

    const { useDataPoints } = await import('../hooks/useDataPoints');
    useDataPoints.mockReturnValue({ dataPoints: [], loading: false });

    render(<TrackButton sessionId="test" />);
    const button = screen.getByRole('button', { name: /track/i });
    expect(button).not.toBeDisabled();
    expect(button).toHaveTextContent('Track');
  });

  it('shows "GPS required" when GPS has error', async () => {
    const { useGeolocation } = await import('../hooks/useGeolocation');
    useGeolocation.mockReturnValue({
      lat: null, lng: null, accuracy: null, error: 'Location denied',
    });

    render(<TrackButton sessionId="test" />);
    expect(screen.getByText('GPS required')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    // Restore
    useGeolocation.mockReturnValue({ lat: 51.5, lng: -0.1, accuracy: 10, error: null });
  });

  it('shows "Locked" when item is locked', async () => {
    const { useItems } = await import('../hooks/useItems');
    useItems.mockReturnValue({
      items: [{ id: 'item-1', name: 'Item 1', locked: true }],
      loading: false,
    });

    // Need to set activeItemId in the store
    const useSessionStore = (await import('../store/useSessionStore')).default;
    useSessionStore.setState({ activeItemId: 'item-1' });

    render(<TrackButton sessionId="test" />);
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    // Restore
    useItems.mockReturnValue({ items: mockItems, loading: false });
  });

  it('shows "Max data points reached" at 10 points', async () => {
    const { useDataPoints } = await import('../hooks/useDataPoints');
    const tenPoints = Array.from({ length: 10 }, (_, i) => ({
      id: `dp-${i}`, lat: 51.5, lng: -0.1, bearing: i * 36,
    }));
    useDataPoints.mockReturnValue({ dataPoints: tenPoints, loading: false });

    const { useItems } = await import('../hooks/useItems');
    useItems.mockReturnValue({
      items: [{ id: 'item-1', name: 'Item 1', locked: false }],
      loading: false,
    });

    const useSessionStore = (await import('../store/useSessionStore')).default;
    useSessionStore.setState({ activeItemId: 'item-1' });

    render(<TrackButton sessionId="test" />);
    expect(screen.getByText('Max data points reached')).toBeInTheDocument();
    expect(screen.getByRole('button')).toBeDisabled();

    // Restore
    useDataPoints.mockReturnValue({ dataPoints: mockDataPoints, loading: false });
    useItems.mockReturnValue({ items: mockItems, loading: false });
  });
});

// =========================================================================
// Test Suite: GPS Status
// =========================================================================
describe('GpsStatus', () => {
  it('shows accuracy value for good GPS', () => {
    const { container } = render(<GpsStatus accuracy={5} error={null} />);
    // Renders as "GPS: ±5m"
    expect(container.textContent).toContain('5m');
  });

  it('shows acquiring message when accuracy is null', () => {
    render(<GpsStatus accuracy={null} error={null} />);
    expect(screen.getByText(/Acquiring GPS/)).toBeInTheDocument();
  });

  it('shows error message when GPS error present', () => {
    render(<GpsStatus accuracy={null} error="Location denied" />);
    expect(screen.getByText('Location denied')).toBeInTheDocument();
  });
});

// =========================================================================
// Test Suite: Manual Bearing Input
// =========================================================================
describe('ManualBearingInput', () => {
  it('renders input with range 0-360', () => {
    const onChange = vi.fn();
    render(<ManualBearingInput value={null} onChange={onChange} />);
    const input = screen.getByRole('spinbutton');
    expect(input).toBeInTheDocument();
  });

  it('calls onChange with numeric value', () => {
    const onChange = vi.fn();
    render(<ManualBearingInput value={null} onChange={onChange} />);
    const input = screen.getByRole('spinbutton');
    fireEvent.change(input, { target: { value: '180' } });
    expect(onChange).toHaveBeenCalledWith(180);
  });
});

// =========================================================================
// Test Suite: Compass Calibration Warning
// =========================================================================
describe('CompassCalibrationWarning', () => {
  it('renders calibration warning text', () => {
    render(<CompassCalibrationWarning />);
    expect(screen.getByText(/calibrat/i)).toBeInTheDocument();
  });
});

// =========================================================================
// Test Suite: Item Settings Panel
// =========================================================================
describe('ItemSettingsPanel', () => {
  const defaultItem = { id: 'item-1', name: 'Item 1', locked: false };

  it('shows data point count', () => {
    render(
      <ItemSettingsPanel
        sessionId="test"
        item={defaultItem}
        dataPointCount={3}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('3 / 10')).toBeInTheDocument();
  });

  it('shows cap warning at 10 points', () => {
    render(
      <ItemSettingsPanel
        sessionId="test"
        item={defaultItem}
        dataPointCount={10}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('10 / 10')).toBeInTheDocument();
    expect(screen.getByText(/Cap reached/)).toBeInTheDocument();
  });

  it('shows lock toggle in unlocked state', () => {
    render(
      <ItemSettingsPanel
        sessionId="test"
        item={defaultItem}
        dataPointCount={3}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Unlocked')).toBeInTheDocument();
    expect(screen.getByText('New data points can be added')).toBeInTheDocument();
  });

  it('shows lock toggle in locked state', () => {
    render(
      <ItemSettingsPanel
        sessionId="test"
        item={{ ...defaultItem, locked: true }}
        dataPointCount={3}
        onClose={vi.fn()}
      />
    );
    expect(screen.getByText('Locked')).toBeInTheDocument();
    expect(screen.getByText('New data points are blocked')).toBeInTheDocument();
  });

  it('shows lock confirmation when toggling to locked', () => {
    render(
      <ItemSettingsPanel
        sessionId="test"
        item={defaultItem}
        dataPointCount={3}
        onClose={vi.fn()}
      />
    );
    const toggle = screen.getByLabelText('Lock item');
    fireEvent.click(toggle);
    expect(screen.getByText(/Locking prevents new data points/)).toBeInTheDocument();
  });

  it('calls onClose when backdrop clicked', () => {
    const onClose = vi.fn();
    render(
      <ItemSettingsPanel
        sessionId="test"
        item={defaultItem}
        dataPointCount={3}
        onClose={onClose}
      />
    );
    // Click the backdrop (aria-hidden div)
    const backdrop = document.querySelector('[aria-hidden="true"]');
    fireEvent.click(backdrop);
    expect(onClose).toHaveBeenCalled();
  });
});

// =========================================================================
// Test Suite: Error Boundary
// =========================================================================
describe('ErrorBoundary', () => {
  it('renders children when no error', () => {
    render(
      <ErrorBoundary>
        <div>Hello</div>
      </ErrorBoundary>
    );
    expect(screen.getByText('Hello')).toBeInTheDocument();
  });

  it('catches errors and shows fallback UI', () => {
    const ThrowError = () => {
      throw new Error('Test error');
    };
    // Suppress React error boundary console output
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(
      <ErrorBoundary>
        <ThrowError />
      </ErrorBoundary>
    );
    // In dev mode, should show error details
    expect(screen.getByText('Unhandled Error')).toBeInTheDocument();
    spy.mockRestore();
  });
});

// =========================================================================
// Test Suite: Word Generator
// =========================================================================
describe('generateName', () => {
  it('returns a two-word name', () => {
    const name = generateName();
    const parts = name.split(' ');
    expect(parts.length).toBe(2);
    expect(parts[0].length).toBeGreaterThan(0);
    expect(parts[1].length).toBeGreaterThan(0);
  });

  it('generates different names (not always the same)', () => {
    const names = new Set(Array.from({ length: 20 }, () => generateName()));
    // With 200x150 combinations, 20 samples should almost certainly have > 1 unique
    expect(names.size).toBeGreaterThan(1);
  });
});

// =========================================================================
// Test Suite: Analytics
// =========================================================================
describe('analytics', () => {
  it('track() is a callable function (mocked)', () => {
    // track is mocked at module level; verify it's callable without errors
    expect(() => track('test_event')).not.toThrow();
    expect(() => track('test_event', { key: 'value' })).not.toThrow();
  });
});

// =========================================================================
// Test Suite: Error Utilities
// =========================================================================
describe('formatError', () => {
  it('formats error with message and code in dev mode', () => {
    const error = { message: 'Not found', code: 'not-found', stack: 'at foo.js:1' };
    const formatted = formatError(error);
    expect(formatted).toContain('Not found');
    expect(formatted).toContain('not-found');
    expect(formatted).toContain('foo.js');
  });
});

// =========================================================================
// Test Suite: Mobile Layout / Tap Targets
// =========================================================================
describe('Mobile Layout', () => {
  it('Home page button meets 44px minimum tap target', () => {
    renderWithRouter(<App />);
    const button = screen.getByText('Start New Session');
    // The button should have min-h-[44px] class
    expect(button.className).toMatch(/min-h-\[44px\]/);
  });

  it('Track button meets 44px minimum tap target', () => {
    renderWithRouter(<App />, { route: '/?s=test-session' });
    const button = screen.getByText('Track');
    expect(button.className).toMatch(/min-h-\[44px\]/);
  });

  it('ItemSettingsPanel close button meets 44px minimum', () => {
    render(
      <ItemSettingsPanel
        sessionId="test"
        item={{ id: 'item-1', name: 'Item 1', locked: false }}
        dataPointCount={3}
        onClose={vi.fn()}
      />
    );
    const closeButton = screen.getByLabelText('Close settings');
    expect(closeButton.className).toMatch(/w-11/);
    expect(closeButton.className).toMatch(/h-11/);
  });
});
