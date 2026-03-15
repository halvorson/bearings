import { useRef } from 'react';
import {
  doc,
  collection,
  writeBatch,
  serverTimestamp,
  increment,
} from 'firebase/firestore';
import { db } from '../lib/firebase';
import { track } from '../lib/analytics';
import useSessionStore from '../store/useSessionStore';

/**
 * Horizontal scrolling tab bar for switching between items.
 * Dark themed for the instrument panel.
 */
export default function ItemTabs({
  sessionId,
  session,
  items,
  activeItemId,
  onSelectItem,
}) {
  const { setActiveItem } = useSessionStore();
  const creatingRef = useRef(false);

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

      track('item_created', { sessionId, itemIndex: newIndex });
    } catch (err) {
      console.error('Failed to create item:', err);
    } finally {
      creatingRef.current = false;
    }
  };

  return (
    <nav
      aria-label="Items"
      className="bg-gray-900 border-b border-gray-800 flex overflow-x-auto"
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
            onClick={() => onSelectItem?.(item.id)}
            aria-current={isActive ? 'true' : undefined}
            className={[
              'flex-none flex items-center gap-1 px-4 whitespace-nowrap min-h-[44px]',
              'text-sm font-medium transition-colors border-b-2',
              isActive
                ? 'text-amber-400 border-amber-500 bg-gray-800/50'
                : 'text-gray-500 border-transparent hover:text-gray-300 hover:bg-gray-800/30',
            ].join(' ')}
          >
            <span className="truncate max-w-[120px]">{item.name}</span>
            {item.locked && (
              <span aria-label="locked" className="text-xs leading-none opacity-60">
                🔒
              </span>
            )}
          </button>
        );
      })}

      <button
        onClick={handleCreateItem}
        aria-label="Create new item"
        className="flex-none flex items-center gap-1 px-4 whitespace-nowrap min-h-[44px]
                   text-sm font-medium text-gray-600 border-b-2 border-transparent
                   hover:text-amber-400 hover:bg-gray-800/30 transition-colors"
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
  );
}
