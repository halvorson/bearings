import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import useToastStore from '../store/useToastStore.js';

export function useTriangulation(sessionId, itemId) {
  const [result, setResult] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId || !itemId) {
      setResult(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const docRef = doc(
      db,
      'sessions',
      sessionId,
      'items',
      itemId,
      'triangulation',
      'result'
    );

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data();
          // confidencePolygon is stored as a JSON string in Firestore
          // (nested arrays are not supported), so parse it back to an object.
          if (typeof data.confidencePolygon === 'string') {
            try {
              data.confidencePolygon = JSON.parse(data.confidencePolygon);
            } catch {
              data.confidencePolygon = null;
            }
          }
          setResult(data);
        } else {
          setResult(null);
        }
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
        useToastStore.getState().addToast({ error: err });
      }
    );

    return () => unsubscribe();
  }, [sessionId, itemId]);

  return { result, loading, error };
}
