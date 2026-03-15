import { useRef, useState } from 'react';
import {
  doc,
  collection,
  writeBatch,
  serverTimestamp,
  increment,
  updateDoc,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { track } from '../lib/analytics';
import useSessionStore from '../store/useSessionStore';

const DATA_POINT_CAP = 10;

/**
 * Item tabs with inline expandable settings for the active item.
 * Dark themed, sits above the map card.
 */
export default function ItemTabs({
  sessionId,
  session,
  items,
  activeItemId,
  activeItem,
  dataPointCount,
  onSelectItem,
}) {
  const { setActiveItem, deleteMode, setDeleteMode } = useSessionStore();
  const creatingRef = useRef(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [editingName, setEditingName] = useState('');
  const [isEditingName, setIsEditingName] = useState(false);
  const nameInputRef = useRef(null);

  const handleCreateItem = async () => {
    if (creatingRef.current) return;
    creatingRef.current = true;

    try {
      const newIndex = (session?.itemCount ?? 0) + 1;
      const sessionRef = doc(db, 'sessions', sessionId);
      const newItemRef = doc(collection(db, 'sessions', sessionId, 'items'));

      const batch = writeBatch(db);
      batch.update(sessionRef, { itemCount: increment(1) });
      batch.set(newItemRef, {
        name: `Item ${newIndex}`,
        locked: false,
        itemIndex: newIndex,
        createdAt: serverTimestamp(),
      });

      await batch.commit();

      setActiveItem(newItemRef.id);
      onSelectItem?.(newItemRef.id);
      setSettingsOpen(false);

      track('item_created', { sessionId, itemIndex: newIndex });
    } catch (err) {
      console.error('Failed to create item:', err);
    } finally {
      creatingRef.current = false;
    }
  };

  const handleTabClick = (itemId) => {
    if (itemId === activeItemId) {
      // Toggle settings when tapping the already-active tab
      setSettingsOpen((prev) => !prev);
    } else {
      onSelectItem?.(itemId);
      setSettingsOpen(false);
    }
  };

  // ── Inline settings handlers ──

  const startEditingName = () => {
    setEditingName(activeItem?.name ?? '');
    setIsEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 0);
  };

  const commitName = async () => {
    setIsEditingName(false);
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === activeItem?.name) return;
    try {
      await updateDoc(doc(db, 'sessions', sessionId, 'items', activeItem.id), { name: trimmed });
      track('item_renamed');
    } catch (err) {
      console.error('Failed to rename item:', err);
    }
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      nameInputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setIsEditingName(false);
    }
  };

  const handleLockToggle = async () => {
    if (!activeItem) return;
    const newLocked = !activeItem.locked;
    try {
      await updateDoc(doc(db, 'sessions', sessionId, 'items', activeItem.id), { locked: newLocked });
      track(newLocked ? 'item_locked' : 'item_unlocked', newLocked ? { locked: true } : undefined);
    } catch (err) {
      console.error('Failed to toggle lock:', err);
    }
  };

  const count = dataPointCount ?? 0;
  const isAtCap = count >= DATA_POINT_CAP;

  return (
    <div className="flex-none">
      {/* Tab bar */}
      <nav
        aria-label="Items"
        className="bg-gray-900/60 flex overflow-x-auto border-b border-white/5"
      >
        <style>{`
          nav[aria-label="Items"]::-webkit-scrollbar { display: none; }
          nav[aria-label="Items"] { -ms-overflow-style: none; scrollbar-width: none; }
        `}</style>

        {items.map((item) => {
          const isActive = item.id === activeItemId;
          return (
            <button
              key={item.id}
              onClick={() => handleTabClick(item.id)}
              aria-current={isActive ? 'true' : undefined}
              className={[
                'flex-none flex items-center gap-1.5 px-4 whitespace-nowrap min-h-[44px]',
                'text-sm font-medium transition-colors border-b-2',
                isActive
                  ? 'text-amber-400 border-amber-500 bg-amber-500/10'
                  : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-white/5',
              ].join(' ')}
            >
              <span className="truncate max-w-[120px]">{item.name}</span>
              {item.locked && (
                <span aria-label="locked" className="text-xs leading-none opacity-60">
                  🔒
                </span>
              )}
              {isActive && (
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className={`w-3.5 h-3.5 ml-0.5 transition-transform ${settingsOpen ? 'rotate-180' : ''}`}
                  aria-hidden="true"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              )}
            </button>
          );
        })}

        <button
          onClick={handleCreateItem}
          aria-label="Create new item"
          className="flex-none flex items-center gap-1 px-4 whitespace-nowrap min-h-[44px]
                     text-sm font-medium text-gray-600 border-b-2 border-transparent
                     hover:text-amber-400 hover:bg-white/5 transition-colors"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="w-4 h-4"
            aria-hidden="true"
          >
            <line x1="12" y1="5" x2="12" y2="19" />
            <line x1="5" y1="12" x2="19" y2="12" />
          </svg>
          New
        </button>
      </nav>

      {/* Inline settings panel — expands below tabs */}
      {settingsOpen && activeItem && (
        <div className="bg-gray-900/40 border-b border-white/5 px-4 py-3">
          <div className="flex items-center gap-3">
            {/* Rename */}
            {isEditingName ? (
              <input
                ref={nameInputRef}
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onBlur={commitName}
                onKeyDown={handleNameKeyDown}
                className="flex-1 min-w-0 bg-gray-800 text-gray-100 text-sm rounded-lg
                           px-3 py-2 min-h-[44px] border border-amber-500/30
                           focus:border-amber-500 focus:outline-none transition-colors"
              />
            ) : (
              <button
                onClick={startEditingName}
                className="flex-1 min-w-0 flex items-center gap-2 text-sm text-gray-300
                           hover:text-amber-400 transition-colors min-h-[44px] truncate"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4 flex-shrink-0 opacity-50">
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 00.65.65l3.155-1.262a4 4 0 001.343-.885L17.5 5.5a2.121 2.121 0 00-3-3L3.58 13.42a4 4 0 00-.885 1.343z" />
                </svg>
                <span className="truncate">{activeItem.name}</span>
              </button>
            )}

            {/* Lock toggle */}
            <button
              onClick={handleLockToggle}
              aria-label={activeItem.locked ? 'Unlock item' : 'Lock item'}
              className={`flex-none flex items-center justify-center w-11 h-11 rounded-lg
                          transition-colors ${
                            activeItem.locked
                              ? 'bg-amber-500/20 text-amber-400'
                              : 'bg-white/5 text-gray-500 hover:text-gray-300'
                          }`}
            >
              {activeItem.locked ? (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                  <path fillRule="evenodd" d="M14.5 1A4.5 4.5 0 0010 5.5V9H3a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-1V5.5a3 3 0 116 0v2.75a.75.75 0 001.5 0V5.5A4.5 4.5 0 0014.5 1z" clipRule="evenodd" />
                </svg>
              )}
            </button>

            {/* Delete mode toggle */}
            <button
              onClick={() => setDeleteMode(!deleteMode)}
              disabled={activeItem.locked}
              aria-label={deleteMode ? 'Exit delete mode' : 'Enter delete mode'}
              className={`flex-none flex items-center justify-center w-11 h-11 rounded-lg
                          transition-colors ${
                            activeItem.locked
                              ? 'bg-white/5 text-gray-700 cursor-not-allowed'
                              : deleteMode
                                ? 'bg-red-500/20 text-red-400'
                                : 'bg-white/5 text-gray-500 hover:text-gray-300'
                          }`}
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
                <path fillRule="evenodd" d="M8.75 1A2.75 2.75 0 006 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 10.23 1.482l.149-.022 1.005 11.36A2.75 2.75 0 007.769 20h4.462a2.75 2.75 0 002.75-2.689l1.005-11.36.149.022a.75.75 0 00.23-1.482A41.03 41.03 0 0014 4.193V3.75A2.75 2.75 0 0011.25 1h-2.5zM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4zM8.58 7.72a.75.75 0 01.79.7l.5 6a.75.75 0 11-1.49.12l-.5-6a.75.75 0 01.7-.82zm2.84 0a.75.75 0 01.7.82l-.5 6a.75.75 0 11-1.49-.12l.5-6a.75.75 0 01.79-.7z" clipRule="evenodd" />
              </svg>
            </button>

            {/* Data point count */}
            <div
              className={`flex-none text-sm font-mono tabular-nums px-2.5 py-1.5 rounded-lg ${
                isAtCap
                  ? 'bg-red-500/20 text-red-400'
                  : 'bg-white/5 text-gray-400'
              }`}
            >
              {count}/{DATA_POINT_CAP}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
