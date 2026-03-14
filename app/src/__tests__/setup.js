import '@testing-library/jest-dom';

// Mock mapbox-gl since it requires WebGL
vi.mock('mapbox-gl', () => {
  function MockMap() {
    this.on = vi.fn();
    this.remove = vi.fn();
    this.addSource = vi.fn();
    this.addLayer = vi.fn();
    this.getSource = vi.fn(() => ({ setData: vi.fn() }));
    this.getCanvas = vi.fn(() => ({ style: {} }));
    this.flyTo = vi.fn();
    this.isStyleLoaded = vi.fn(() => true);
  }

  return {
    default: { Map: MockMap, accessToken: '' },
    Map: MockMap,
  };
});

// Mock import.meta.env defaults for tests
if (!import.meta.env.VITE_FIREBASE_CONFIG) {
  // Base64-encoded minimal Firebase config for test env
  const testConfig = btoa(JSON.stringify({
    apiKey: 'test-api-key',
    authDomain: 'test.firebaseapp.com',
    projectId: 'bearings-app-dev',
    storageBucket: 'test.appspot.com',
    messagingSenderId: '123',
    appId: '1:123:web:abc',
  }));
  import.meta.env.VITE_FIREBASE_CONFIG = testConfig;
}

if (!import.meta.env.VITE_MAPBOX_TOKEN) {
  import.meta.env.VITE_MAPBOX_TOKEN = 'pk.test_token';
}

// Suppress console.error in tests unless debugging
const originalError = console.error;
beforeAll(() => {
  console.error = (...args) => {
    // Let Firebase and React errors through in verbose mode
    if (process.env.VERBOSE_TESTS) {
      originalError(...args);
    }
  };
});

afterAll(() => {
  console.error = originalError;
});
