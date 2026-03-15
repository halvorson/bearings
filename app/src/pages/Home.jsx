import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { generateName } from '../lib/words';
import { track } from '../lib/analytics';
import useSessionStore from '../store/useSessionStore';

const NANOID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

function generateId(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => NANOID_ALPHABET[b % NANOID_ALPHABET.length])
    .join('');
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const participantToken = useSessionStore((s) => s.participantToken);

  const handleStart = async () => {
    setLoading(true);
    setError(null);

    try {
      const sessionId = generateId();
      const sessionName = generateName();

      const batch = writeBatch(db);

      const sessionRef = doc(collection(db, 'sessions'), sessionId);
      batch.set(sessionRef, {
        id: sessionId,
        name: sessionName,
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

      track('session_created', { sessionId });

      navigate(`/?s=${sessionId}`);
    } catch (err) {
      console.error('Failed to create session:', err);
      setError('Failed to create session. Please try again.');
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center h-full bg-gray-950 p-4">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-3xl font-bold text-gray-100 mb-2">Bearings</h1>
        <p className="text-gray-500 mb-8">Collaborative GPS + compass triangulation</p>

        {error && (
          <p className="text-red-400 text-sm mb-4" role="alert">
            {error}
          </p>
        )}

        <button
          onClick={handleStart}
          disabled={loading}
          className="w-full max-w-sm min-h-[44px] bg-amber-500 hover:bg-amber-400
                     disabled:bg-gray-700 disabled:text-gray-500
                     text-gray-950 font-bold text-base rounded-xl px-6 py-3
                     tracking-wide uppercase transition-colors
                     focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2
                     focus:ring-offset-gray-950"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <svg
                className="animate-spin h-4 w-4"
                xmlns="http://www.w3.org/2000/svg"
                fill="none"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                />
              </svg>
              Creating...
            </span>
          ) : (
            'Start New Session'
          )}
        </button>
      </div>
    </div>
  );
}
