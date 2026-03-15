import { useState, useEffect } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { db } from '../lib/firebase.js';
import useToastStore from '../store/useToastStore.js';

export function useSession(sessionId) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!sessionId) {
      setSession(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    const docRef = doc(db, 'sessions', sessionId);

    const unsubscribe = onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          setSession({ id: snapshot.id, ...snapshot.data() });
        } else {
          setSession(null);
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
  }, [sessionId]);

  return { session, loading, error };
}
