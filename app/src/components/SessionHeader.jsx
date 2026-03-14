import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { track } from '../lib/analytics';

/**
 * Top bar showing the session name (inline editable) and a share button.
 * Positioned absolute so the map / content underneath can fill the full viewport.
 */
export default function SessionHeader({ sessionId, session }) {
  const [editingName, setEditingName] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const inputRef = useRef(null);

  // Keep local editing state in sync when the session name changes remotely,
  // but only while the user is NOT actively editing.
  useEffect(() => {
    if (!isEditing && session?.name) {
      setEditingName(session.name);
    }
  }, [session?.name, isEditing]);

  // Update document.title whenever session name changes.
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
      // Revert to the last known server value on error.
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
      // User cancelled share sheet or clipboard blocked — not an error worth surfacing.
      if (err.name !== 'AbortError') {
        console.error('Share failed:', err);
      }
    }
  };

  return (
    <header className="absolute top-0 left-0 right-0 z-10 bg-white shadow-sm px-4 py-2 flex items-center gap-2">
      {/* Session name — styled to look like plain text until focused */}
      <input
        ref={inputRef}
        type="text"
        value={editingName}
        onChange={(e) => setEditingName(e.target.value)}
        onFocus={handleFocus}
        onBlur={commitName}
        onKeyDown={handleKeyDown}
        aria-label="Session name"
        className="flex-1 min-w-0 bg-transparent text-gray-900 font-semibold text-base
                   leading-tight rounded px-1 py-1 min-h-[44px]
                   border border-transparent hover:border-gray-200
                   focus:border-blue-400 focus:outline-none focus:bg-gray-50
                   transition-colors truncate"
      />

      {/* Share button */}
      <button
        onClick={handleShare}
        aria-label="Share session link"
        className="flex-none flex items-center justify-center w-11 h-11 rounded-full
                   text-gray-500 hover:text-blue-600 hover:bg-blue-50
                   active:bg-blue-100 transition-colors"
      >
        {/* Share / upload icon */}
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
