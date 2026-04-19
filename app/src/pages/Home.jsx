import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { collection, doc, writeBatch, serverTimestamp } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { generateName } from '../lib/words';
import { track } from '../lib/analytics';
import useSessionStore from '../store/useSessionStore';
import { getRecentSessions, removeRecentSession } from '../lib/recentSessions';

const NANOID_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-';

function generateId(length = 8) {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => NANOID_ALPHABET[b % NANOID_ALPHABET.length])
    .join('');
}

function timeAgo(timestamp) {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

export default function Home() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [recentSessions, setRecentSessions] = useState(() => getRecentSessions());
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
    <div className="flex flex-col items-center justify-center min-h-full bg-gray-950 p-4 overflow-y-auto">
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

        {recentSessions.length > 0 && (
          <div className="mt-10 w-full text-left">
            <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
              Jump Back In
            </h2>
            <ul className="space-y-1">
              {recentSessions.map((s) => (
                <li key={s.id} className="group flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/?s=${s.id}`)}
                    className="flex-1 min-w-0 flex items-center justify-between min-h-[44px]
                               px-3 py-2 rounded-lg text-left
                               hover:bg-gray-800 active:bg-gray-700 transition-colors"
                  >
                    <span className="text-sm text-gray-200 truncate">{s.name}</span>
                    <span className="text-xs text-gray-600 flex-none ml-3">
                      {timeAgo(s.lastVisited)}
                    </span>
                  </button>
                  <button
                    onClick={() => {
                      removeRecentSession(s.id);
                      setRecentSessions(getRecentSessions());
                    }}
                    aria-label={`Remove ${s.name} from recent sessions`}
                    className="flex-none w-8 h-8 flex items-center justify-center rounded-full
                               text-gray-700 hover:text-red-400 hover:bg-gray-800
                               sm:opacity-0 sm:group-hover:opacity-100 transition-all"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                      <path d="M6.28 5.22a.75.75 0 00-1.06 1.06L8.94 10l-3.72 3.72a.75.75 0 101.06 1.06L10 11.06l3.72 3.72a.75.75 0 101.06-1.06L11.06 10l3.72-3.72a.75.75 0 00-1.06-1.06L10 8.94 6.28 5.22z" />
                    </svg>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
