import { describe, it, beforeAll, afterAll, beforeEach } from 'vitest';
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from '@firebase/rules-unit-testing';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const fs = require('fs');
const path = require('path');

const RULES_PATH = path.resolve(__dirname, '..', '..', 'firestore.rules');

// Check if the emulator is running before initializing
let emulatorAvailable = false;
try {
  const net = require('net');
  await new Promise((resolve) => {
    const socket = new net.Socket();
    socket.setTimeout(1000);
    socket.on('connect', () => { emulatorAvailable = true; socket.destroy(); resolve(); });
    socket.on('timeout', () => { socket.destroy(); resolve(); });
    socket.on('error', () => { resolve(); });
    socket.connect(8080, '127.0.0.1');
  });
} catch {
  emulatorAvailable = false;
}

let testEnv;

if (emulatorAvailable) {
  beforeAll(async () => {
    testEnv = await initializeTestEnvironment({
      projectId: 'bearings-rules-test',
      firestore: {
        rules: fs.readFileSync(RULES_PATH, 'utf8'),
        host: '127.0.0.1',
        port: 8080,
      },
    });
  });

  afterAll(async () => {
    if (testEnv) await testEnv.cleanup();
  });

  beforeEach(async () => {
    await testEnv.clearFirestore();
  });
}

// Use describe.skipIf to skip all tests when emulator is not running
const describeRules = emulatorAvailable ? describe : describe.skip;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getDb() {
  return testEnv.unauthenticatedContext().firestore();
}

/**
 * Run a callback with an admin (rules-bypassed) Firestore instance.
 * withSecurityRulesDisabled expects the callback to perform all work
 * and return a promise — it does not return the firestore instance.
 */
async function withAdmin(fn) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await fn(db);
  });
}

const SESSION_ID = 'test-session';
const ITEM_ID = 'test-item';

const validSession = {
  id: SESSION_ID,
  name: 'Test Session',
  itemCount: 0,
  createdAt: new Date(),
};

const validItem = {
  name: 'Item 1',
  locked: false,
  itemIndex: 0,
  createdAt: new Date(),
};

const validDataPoint = {
  participantToken: 'tok-abc',
  lat: 51.5,
  lng: -0.1,
  bearing: 90,
  accuracy: 5,
  timestamp: new Date(),
};

// ---------------------------------------------------------------------------
// Sessions
// ---------------------------------------------------------------------------

describeRules('Session rules', () => {
  describe('read', () => {
    it('allows reading a session', async () => {
      const db = getDb();
      await assertSucceeds(db.collection('sessions').doc(SESSION_ID).get());
    });
  });

  describe('create', () => {
    it('succeeds with all required fields', async () => {
      const db = getDb();
      await assertSucceeds(
        db.collection('sessions').doc(SESSION_ID).set(validSession)
      );
    });

    it('fails without required fields', async () => {
      const db = getDb();
      await assertFails(
        db.collection('sessions').doc('bad').set({ name: 'Missing fields' })
      );
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await withAdmin(async (db) => {
        await db.collection('sessions').doc(SESSION_ID).set(validSession);
      });
    });

    it('succeeds when changing name', async () => {
      const db = getDb();
      await assertSucceeds(
        db.collection('sessions').doc(SESSION_ID).update({ name: 'Renamed' })
      );
    });

    it('succeeds when changing itemCount', async () => {
      const db = getDb();
      await assertSucceeds(
        db.collection('sessions').doc(SESSION_ID).update({ itemCount: 1 })
      );
    });

    it('fails when changing id', async () => {
      const db = getDb();
      await assertFails(
        db.collection('sessions').doc(SESSION_ID).update({ id: 'changed' })
      );
    });

    it('fails when changing createdAt', async () => {
      const db = getDb();
      await assertFails(
        db
          .collection('sessions')
          .doc(SESSION_ID)
          .update({ createdAt: new Date() })
      );
    });
  });
});

// ---------------------------------------------------------------------------
// Items
// ---------------------------------------------------------------------------

describeRules('Item rules', () => {
  const itemRef = () =>
    getDb()
      .collection('sessions')
      .doc(SESSION_ID)
      .collection('items')
      .doc(ITEM_ID);

  // Seed the parent session for all item tests
  beforeEach(async () => {
    await withAdmin(async (db) => {
      await db.collection('sessions').doc(SESSION_ID).set(validSession);
    });
  });

  describe('read', () => {
    it('allows reading an item', async () => {
      await assertSucceeds(itemRef().get());
    });
  });

  describe('create', () => {
    it('succeeds with required fields and locked=false', async () => {
      await assertSucceeds(itemRef().set(validItem));
    });

    it('fails if locked is true', async () => {
      await assertFails(itemRef().set({ ...validItem, locked: true }));
    });

    it('fails without required fields', async () => {
      await assertFails(itemRef().set({ name: 'Missing locked' }));
    });
  });

  describe('update', () => {
    beforeEach(async () => {
      await withAdmin(async (db) => {
        await db
          .collection('sessions')
          .doc(SESSION_ID)
          .collection('items')
          .doc(ITEM_ID)
          .set(validItem);
      });
    });

    it('succeeds when changing name', async () => {
      await assertSucceeds(itemRef().update({ name: 'Renamed Item' }));
    });

    it('succeeds when changing locked', async () => {
      await assertSucceeds(itemRef().update({ locked: true }));
    });

    it('fails when changing itemIndex', async () => {
      await assertFails(itemRef().update({ itemIndex: 5 }));
    });

    it('fails when changing createdAt', async () => {
      await assertFails(itemRef().update({ createdAt: new Date() }));
    });
  });
});

// ---------------------------------------------------------------------------
// DataPoints
// ---------------------------------------------------------------------------

describeRules('DataPoint rules', () => {
  const POINT_ID = 'dp-1';

  const dpRef = () =>
    getDb()
      .collection('sessions')
      .doc(SESSION_ID)
      .collection('items')
      .doc(ITEM_ID)
      .collection('dataPoints')
      .doc(POINT_ID);

  // Seed session + unlocked item
  beforeEach(async () => {
    await withAdmin(async (db) => {
      await db.collection('sessions').doc(SESSION_ID).set(validSession);
      await db
        .collection('sessions')
        .doc(SESSION_ID)
        .collection('items')
        .doc(ITEM_ID)
        .set(validItem);
    });
  });

  describe('read', () => {
    it('allows reading data points', async () => {
      await assertSucceeds(dpRef().get());
    });
  });

  describe('create', () => {
    it('succeeds with valid fields when item is not locked', async () => {
      await assertSucceeds(dpRef().set(validDataPoint));
    });

    it('fails with invalid bearing (400)', async () => {
      await assertFails(
        dpRef().set({ ...validDataPoint, bearing: 400 })
      );
    });

    it('fails with invalid lat (100)', async () => {
      await assertFails(
        dpRef().set({ ...validDataPoint, lat: 100 })
      );
    });

    it('fails with invalid lng (200)', async () => {
      await assertFails(
        dpRef().set({ ...validDataPoint, lng: 200 })
      );
    });

    it('fails when item is locked', async () => {
      await withAdmin(async (db) => {
        await db
          .collection('sessions')
          .doc(SESSION_ID)
          .collection('items')
          .doc(ITEM_ID)
          .update({ locked: true });
      });

      await assertFails(dpRef().set(validDataPoint));
    });
  });

  describe('delete', () => {
    it('allows deleting a data point', async () => {
      await withAdmin(async (db) => {
        await db
          .collection('sessions')
          .doc(SESSION_ID)
          .collection('items')
          .doc(ITEM_ID)
          .collection('dataPoints')
          .doc(POINT_ID)
          .set(validDataPoint);
      });

      await assertSucceeds(dpRef().delete());
    });
  });
});

// ---------------------------------------------------------------------------
// Triangulation
// ---------------------------------------------------------------------------

describeRules('Triangulation rules', () => {
  const triRef = () =>
    getDb()
      .collection('sessions')
      .doc(SESSION_ID)
      .collection('items')
      .doc(ITEM_ID)
      .collection('triangulation')
      .doc('result');

  beforeEach(async () => {
    await withAdmin(async (db) => {
      await db.collection('sessions').doc(SESSION_ID).set(validSession);
      await db
        .collection('sessions')
        .doc(SESSION_ID)
        .collection('items')
        .doc(ITEM_ID)
        .set(validItem);
    });
  });

  describe('read', () => {
    it('allows reading triangulation results', async () => {
      await assertSucceeds(triRef().get());
    });
  });

  describe('write', () => {
    it('denies creating a triangulation doc', async () => {
      await assertFails(
        triRef().set({ estimatedLat: 51.5, estimatedLng: -0.1 })
      );
    });

    it('denies updating a triangulation doc', async () => {
      await withAdmin(async (db) => {
        await db
          .collection('sessions')
          .doc(SESSION_ID)
          .collection('items')
          .doc(ITEM_ID)
          .collection('triangulation')
          .doc('result')
          .set({ estimatedLat: 51.5, estimatedLng: -0.1 });
      });

      await assertFails(triRef().update({ estimatedLat: 52.0 }));
    });

    it('denies deleting a triangulation doc', async () => {
      await withAdmin(async (db) => {
        await db
          .collection('sessions')
          .doc(SESSION_ID)
          .collection('items')
          .doc(ITEM_ID)
          .collection('triangulation')
          .doc('result')
          .set({ estimatedLat: 51.5, estimatedLng: -0.1 });
      });

      await assertFails(triRef().delete());
    });
  });
});
