import { useState, useEffect, useRef } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { track } from '../lib/analytics';

const DATA_POINT_CAP = 10;

/**
 * Slide-up sheet for viewing and editing a single item's settings.
 * Shown over a semi-transparent backdrop; closes via the X button or backdrop tap.
 */
export default function ItemSettingsPanel({
  sessionId,
  item,
  dataPointCount,
  onClose,
}) {
  const [editingName, setEditingName] = useState(item?.name ?? '');
  const [showLockConfirm, setShowLockConfirm] = useState(false);
  const inputRef = useRef(null);

  // Sync name when item prop changes (e.g. remote rename by another user).
  useEffect(() => {
    setEditingName(item?.name ?? '');
  }, [item?.name]);

  // Focus the name input on open for quick editing.
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const itemRef = doc(db, 'sessions', sessionId, 'items', item.id);

  const commitName = async () => {
    const trimmed = editingName.trim();
    if (!trimmed || trimmed === item.name) return;
    try {
      await updateDoc(itemRef, { name: trimmed });
      track('item_renamed');
    } catch (err) {
      console.error('Failed to rename item:', err);
      setEditingName(item.name);
    }
  };

  const handleNameKeyDown = (e) => {
    if (e.key === 'Enter') {
      inputRef.current?.blur();
    } else if (e.key === 'Escape') {
      setEditingName(item.name);
      inputRef.current?.blur();
    }
  };

  const handleLockToggle = () => {
    if (!item.locked) {
      // Locking: show confirmation first.
      setShowLockConfirm(true);
    } else {
      // Unlocking: no confirmation needed.
      performLockToggle(false);
    }
  };

  const performLockToggle = async (newLockedValue) => {
    setShowLockConfirm(false);
    try {
      await updateDoc(itemRef, { locked: newLockedValue });
      track(newLockedValue ? 'item_locked' : 'item_unlocked', newLockedValue ? { locked: true } : undefined);
    } catch (err) {
      console.error('Failed to toggle item lock:', err);
    }
  };

  const count = dataPointCount ?? 0;
  const isAtCap = count >= DATA_POINT_CAP;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-20 bg-black/40"
        aria-hidden="true"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Item settings"
        className="fixed bottom-0 left-0 right-0 z-30 bg-white rounded-t-2xl
                   shadow-2xl p-4 pb-8 pb-safe-b flex flex-col gap-5"
      >
        {/* Header row */}
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-gray-900">Item settings</h2>
          <button
            onClick={onClose}
            aria-label="Close settings"
            className="flex items-center justify-center w-11 h-11 rounded-full
                       text-gray-500 hover:text-gray-900 hover:bg-gray-100
                       active:bg-gray-200 transition-colors"
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
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

        {/* Name editor */}
        <div className="flex flex-col gap-1">
          <label
            htmlFor="item-name-input"
            className="text-sm font-medium text-gray-700"
          >
            Name
          </label>
          <input
            id="item-name-input"
            ref={inputRef}
            type="text"
            value={editingName}
            onChange={(e) => setEditingName(e.target.value)}
            onBlur={commitName}
            onKeyDown={handleNameKeyDown}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 min-h-[44px]
                       text-base text-gray-900 focus:border-blue-500 focus:outline-none
                       focus:ring-2 focus:ring-blue-200 transition"
          />
        </div>

        {/* Data point count */}
        <div className="flex items-center justify-between">
          <span className="text-sm text-gray-600">Data points</span>
          <span
            className={[
              'text-sm font-semibold tabular-nums',
              isAtCap ? 'text-red-600' : 'text-gray-900',
            ].join(' ')}
          >
            {count} / {DATA_POINT_CAP}
          </span>
        </div>

        {isAtCap && (
          <p className="text-xs text-red-600 -mt-3">
            Cap reached. Delete an existing point before adding new ones.
          </p>
        )}

        {/* Lock toggle */}
        <div className="flex items-center justify-between min-h-[44px]">
          <div className="flex flex-col">
            <span className="text-sm font-medium text-gray-700">
              {item.locked ? 'Locked' : 'Unlocked'}
            </span>
            <span className="text-xs text-gray-500">
              {item.locked
                ? 'New data points are blocked'
                : 'New data points can be added'}
            </span>
          </div>
          <button
            onClick={handleLockToggle}
            aria-pressed={item.locked}
            aria-label={item.locked ? 'Unlock item' : 'Lock item'}
            className={[
              'relative inline-flex h-7 w-12 flex-none cursor-pointer rounded-full',
              'border-2 border-transparent transition-colors duration-200',
              'focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2',
              item.locked ? 'bg-blue-600' : 'bg-gray-300',
            ].join(' ')}
          >
            <span
              aria-hidden="true"
              className={[
                'pointer-events-none inline-block h-6 w-6 rounded-full bg-white',
                'shadow ring-0 transition-transform duration-200',
                item.locked ? 'translate-x-5' : 'translate-x-0',
              ].join(' ')}
            />
          </button>
        </div>

        {/* Lock confirmation */}
        {showLockConfirm && (
          <div className="rounded-xl bg-amber-50 border border-amber-200 p-4 flex flex-col gap-3">
            <p className="text-sm text-amber-800">
              Locking prevents new data points from being added to this item. You
              can unlock it at any time.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => performLockToggle(true)}
                className="flex-1 rounded-lg bg-amber-600 text-white text-sm font-medium
                           py-2 min-h-[44px] hover:bg-amber-700 active:bg-amber-800
                           transition-colors"
              >
                Lock item
              </button>
              <button
                onClick={() => setShowLockConfirm(false)}
                className="flex-1 rounded-lg bg-white border border-gray-300 text-gray-700
                           text-sm font-medium py-2 min-h-[44px] hover:bg-gray-50
                           active:bg-gray-100 transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
