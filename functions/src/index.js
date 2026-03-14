const { onDocumentWritten } = require('firebase-functions/v2/firestore');
const admin = require('firebase-admin');
const { computeTriangulation } = require('./triangulate');

admin.initializeApp();

exports.onDataPointWritten = onDocumentWritten(
  'sessions/{sessionId}/items/{itemId}/dataPoints/{pointId}',
  async (event) => {
    const { sessionId, itemId } = event.params;
    const db = admin.firestore();
    const pointsSnap = await db
      .collection(`sessions/${sessionId}/items/${itemId}/dataPoints`)
      .get();
    const points = pointsSnap.docs.map(d => d.data());
    const result = computeTriangulation(points);
    const resultRef = db.doc(
      `sessions/${sessionId}/items/${itemId}/triangulation/result`
    );
    if (points.length === 0) {
      await resultRef.delete();
    } else {
      await resultRef.set({
        ...result,
        computedAt: admin.firestore.FieldValue.serverTimestamp(),
      });
    }
  }
);
