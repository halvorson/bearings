import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { track } from '../lib/analytics';

/**
 * Compact session header for the instrument panel — dark themed.
 * Shows the session name (inline editable) and a share button.
 */
export default function SessionHeader({ sessionId, session }) {
  const [editingName, setEditingName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!isEditing && session?.name) {
      setEditingName(session.name);
    }
  }, [session?.name, isEditing]);

  useEffect(() => {
    if (session?.name) {
      document.title = `${session.name} — Bearings`;
    }
  }, [session?.name]);

  const handleFocus = () => {
    setIsEditing(true);
  };

  const commitName = async () => {
    setIsEditing(false);
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === session?.name) return;
    try {
      await updateDoc(doc(db, 'sessions', sessionId), { name: trimmed });
      track('session_renamed');
    } catch (err) {
      console.error('Failed to rename session:', err);
      setEditingName(session?.name ?? '');
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setEditingName(session?.name ?? '');
      setIsEditing(false);
      inputRef.current?.blur();
    }
  };

  const handleShare = async () => {
    const url = window.location.href;
    try {
      if (navigator.share) {
        await navigator.share({ title: session?.name ?? 'Bearings', url });
      } else {
        await navigator.clipboard.writeText(url);
      }
      track('share_link_copied');
    } catch (err) {
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  };

  return (
    <header className="bg-gray-950 px-4 py-1 flex items-center gap-2">
      <span className="absolute top-1 right-14 text-[9px] text-gray-700 font-mono select-none pointer-events-none">
        v{__APP_VERSION__}
      </span>
      <input
        ref={inputRef}
        type="text"
        value={editingName}
        onChange={(e) => setEditingName(e.target.value)}
        onFocus={handleFocus}
        onBlur={commitName}
        onKeyDown={handleKeyDown}
        aria-label="Session name"
        className="flex-1 min-w-0 bg-transparent text-gray-200 font-semibold text-sm
                   leading-tight rounded px-1 py-1 min-h-[44px]
                   border border-transparent hover:border-gray-700
                   focus:border-amber-500/50 focus:outline-none focus:bg-gray-900
                   transition-colors truncate"
      />

      <button
        onClick={handleShare}
        aria-label="Share session link"
        className="flex-none flex items-center justify-center w-11 h-11 rounded-full
                   text-gray-500 hover:text-amber-400 hover:bg-gray-800
                   active:bg-gray-700 transition-colors"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="w-5 h-5"
          aria-hidden="true"
        >
          <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
          <polyline points="16 6 12 2 8 6" />
          <line x1="12" y1="2" x2="12" y2="15" />
        </svg>
      </button>
    </header>
  );
}
