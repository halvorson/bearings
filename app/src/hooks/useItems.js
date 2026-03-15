import { useState, useEffect } from 'react';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import useToastStore from '../store/useToastStore.js';

export function useItems(sessionId) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setItems([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const colRef = collection(db, 'sessions', sessionId, 'items');
    const q = query(colRef, orderBy('createdAt', 'asc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const docs = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
        setItems(docs);
        setLoading(false);
      },
      (err) => {
        setError(err);
        setLoading(false);
        useToastStore.getState().addToast({ error: err });
      }
    );

    return () => unsubscribe();
  }, [sessionId]);

  return { items, loading, error };
}
