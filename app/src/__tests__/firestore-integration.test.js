/**
 * Phase 8 — Firestore Integration Tests
 *
 * These tests verify the Firestore data model and Cloud Function trigger.
 * REQUIRES: `firebase emulators:start` running before test execution.
 *
 * Run with: FIRESTORE_EMULATOR_HOST=127.0.0.1:8080 npm test
 *
 * When emulators are not running, these tests are automatically skipped.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { initializeApp, deleteApp } from 'firebase/app';
import {
  getFirestore,
  connectFirestoreEmulator,
  collection,
  doc,
  setDoc,
  getDoc,
  getDocs,
  addDoc,
  deleteDoc,
  updateDoc,
  writeBatch,
  serverTimestamp,
  increment,
  onSnapshot,
} from 'firebase/firestore';

// ---------------------------------------------------------------------------
// Emulator detection — skip suite if emulators aren't running
// ---------------------------------------------------------------------------

const EMULATOR_HOST = '127.0.0.1';
const EMULATOR_PORT = 8080;

let emulatorAvailable = false;

try {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 1000);
  const res = await fetch(`http://${EMULATOR_HOST}:${EMULATOR_PORT}/`, {
    signal: controller.signal,
  }).catch(() => null);
  clearTimeout(timeout);
  emulatorAvailable = res != null;
} catch {
  emulatorAvailable = false;
}

const describeEmulator = emulatorAvailable ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Firebase setup for emulator tests
// ---------------------------------------------------------------------------

let app;
let db;
const TEST_PROJECT = 'bearings-test-' + Date.now();

beforeAll(() => {
  if (!emulatorAvailable) return;
  app = initializeApp(
    { projectId: 'bearings-app-dev', apiKey: 'fake-api-key' },
    TEST_PROJECT
  );
  db = getFirestore(app);
  connectFirestoreEmulator(db, EMULATOR_HOST, EMULATOR_PORT);
});

afterAll(async () => {
  if (app) await deleteApp(app);
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function uniqueId() {
  return Math.random().toString(36).slice(2, 10);
}

async function createSession(sessionId, name = 'Test Session') {
  const batch = writeBatch(db);
  const sessionRef = doc(db, 'sessions', sessionId);
  batch.set(sessionRef, {
    id: sessionId,
    name,
    itemCount: 1,
    createdAt: serverTimestamp(),
  });

  const itemRef = doc(collection(db, 'sessions', sessionId, 'items'));
  batch.set(itemRef, {
    name: 'Item 1',
    locked: false,
    itemIndex: 1,
    createdAt: serverTimestamp(),
  });

  await batch.commit();
  return { sessionRef, itemId: itemRef.id };
}

async function addDataPoint(sessionId, itemId, data) {
  return addDoc(
    collection(db, 'sessions', sessionId, 'items', itemId, 'dataPoints'),
    {
      participantToken: 'test-token',
      lat: data.lat,
      lng: data.lng,
      bearing: data.bearing,
      accuracy: data.accuracy ?? 10,
      timestamp: serverTimestamp(),
    }
  );
}

function waitForTriangulation(sessionId, itemId, predicate, timeoutMs = 10000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsub();
      reject(new Error('Timed out waiting for triangulation result'));
    }, timeoutMs);

    const unsub = onSnapshot(
      doc(db, 'sessions', sessionId, 'items', itemId, 'triangulation', 'result'),
      (snap) => {
        const data = snap.exists() ? snap.data() : null;
        if (predicate(data)) {
          clearTimeout(timer);
          unsub();
          resolve(data);
        }
      }
    );
  });
}

// =========================================================================
// Test Suite: Session & Item Creation
// =========================================================================
describeEmulator('Firestore: Session & Item Creation', () => {
  it('creates a session with itemCount=1 and one item', async () => {
    const sid = uniqueId();
    const { itemId } = await createSession(sid);

    const sessionSnap = await getDoc(doc(db, 'sessions', sid));
    expect(sessionSnap.exists()).toBe(true);
    expect(sessionSnap.data().name).toBe('Test Session');
    expect(sessionSnap.data().itemCount).toBe(1);

    const itemSnap = await getDoc(doc(db, 'sessions', sid, 'items', itemId));
    expect(itemSnap.exists()).toBe(true);
    expect(itemSnap.data().name).toBe('Item 1');
    expect(itemSnap.data().locked).toBe(false);
  });

  it('atomically creates a second item with incremented itemCount', async () => {
    const sid = uniqueId();
    const { itemId: firstItemId } = await createSession(sid);

    const sessionRef = doc(db, 'sessions', sid);
    const newItemRef = doc(collection(db, 'sessions', sid, 'items'));
    const batch = writeBatch(db);
    batch.update(sessionRef, { itemCount: increment(1) });
    batch.set(newItemRef, {
      name: 'Item 2',
      locked: false,
      itemIndex: 2,
      createdAt: serverTimestamp(),
    });
    await batch.commit();

    const sessionSnap = await getDoc(sessionRef);
    expect(sessionSnap.data().itemCount).toBe(2);

    const itemsSnap = await getDocs(collection(db, 'sessions', sid, 'items'));
    expect(itemsSnap.size).toBe(2);
  });
});

// =========================================================================
// Test Suite: Data Points & Triangulation
// =========================================================================
describeEmulator('Firestore: Data Points & Triangulation', () => {
  it('records data points and triggers triangulation', async () => {
    const sid = uniqueId();
    const { itemId } = await createSession(sid);

    // Add two data points from perpendicular angles
    // Observer 1: south of target, looking north
    await addDataPoint(sid, itemId, { lat: 51.500, lng: -0.128, bearing: 0 });
    // Observer 2: west of target, looking east
    await addDataPoint(sid, itemId, { lat: 51.507, lng: -0.135, bearing: 90 });

    // Wait for the Cloud Function to compute triangulation
    const result = await waitForTriangulation(sid, itemId, (data) => {
      return data != null && data.dataPointCount === 2;
    });

    expect(result.dataPointCount).toBe(2);
    expect(result.estimatedLat).toBeTypeOf('number');
    expect(result.estimatedLng).toBeTypeOf('number');
    expect(result.insufficientSpread).toBe(false);
  });

  it('re-triangulates after deleting a data point', async () => {
    const sid = uniqueId();
    const { itemId } = await createSession(sid);

    const dp1 = await addDataPoint(sid, itemId, { lat: 51.500, lng: -0.128, bearing: 0 });
    await addDataPoint(sid, itemId, { lat: 51.507, lng: -0.135, bearing: 90 });
    await addDataPoint(sid, itemId, { lat: 51.510, lng: -0.120, bearing: 200 });

    // Wait for 3-point triangulation
    await waitForTriangulation(sid, itemId, (d) => d?.dataPointCount === 3);

    // Delete one point
    await deleteDoc(
      doc(db, 'sessions', sid, 'items', itemId, 'dataPoints', dp1.id)
    );

    // Should re-triangulate with 2 points
    const result = await waitForTriangulation(sid, itemId, (d) => d?.dataPointCount === 2);
    expect(result.dataPointCount).toBe(2);
  });

  it('flags insufficientSpread for near-parallel bearings', async () => {
    const sid = uniqueId();
    const { itemId } = await createSession(sid);

    // Two bearings within 10 degrees
    await addDataPoint(sid, itemId, { lat: 51.500, lng: -0.128, bearing: 45 });
    await addDataPoint(sid, itemId, { lat: 51.501, lng: -0.127, bearing: 48 });

    const result = await waitForTriangulation(sid, itemId, (d) => d != null && d.dataPointCount === 2);
    expect(result.insufficientSpread).toBe(true);
  });

  it('flags lowConfidence when estimate is far from observers', async () => {
    const sid = uniqueId();
    const { itemId } = await createSession(sid);

    // Two near-parallel bearings (but spread > 10 degrees) pointing far away
    await addDataPoint(sid, itemId, { lat: 51.500, lng: -0.128, bearing: 1 });
    await addDataPoint(sid, itemId, { lat: 51.500, lng: -0.127, bearing: 359 });

    const result = await waitForTriangulation(sid, itemId, (d) => d != null && d.dataPointCount === 2);
    // The intersection point should be very far north, triggering lowConfidence
    expect(result.lowConfidence).toBe(true);
  });
});

// =========================================================================
// Test Suite: Item Lock
// =========================================================================
describeEmulator('Firestore: Item Lock', () => {
  it('can lock and unlock an item', async () => {
    const sid = uniqueId();
    const { itemId } = await createSession(sid);

    const itemRef = doc(db, 'sessions', sid, 'items', itemId);

    // Lock
    await updateDoc(itemRef, { locked: true });
    let snap = await getDoc(itemRef);
    expect(snap.data().locked).toBe(true);

    // Unlock
    await updateDoc(itemRef, { locked: false });
    snap = await getDoc(itemRef);
    expect(snap.data().locked).toBe(false);
  });
});

// =========================================================================
// Test Suite: Session Not Found
// =========================================================================
describeEmulator('Firestore: Session Not Found', () => {
  it('returns no data for nonexistent session', async () => {
    const snap = await getDoc(doc(db, 'sessions', 'nonexistent-session-id'));
    expect(snap.exists()).toBe(false);
  });
});
