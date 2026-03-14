import { create } from 'zustand';

const STORAGE_KEY = 'bearings_participant_token';

const getOrCreateToken = () => {
  const existing = localStorage.getItem(STORAGE_KEY);
  if (existing) return existing;
  // Generate a UUID v4
  const token = crypto.randomUUID();
  localStorage.setItem(STORAGE_KEY, token);
  return token;
};

const useSessionStore = create((set) => ({
  activeItemId: null,
  participantToken: getOrCreateToken(),
  captureOverlayOpen: false,

  setActiveItem: (id) => set({ activeItemId: id }),
  openCapture: () => set({ captureOverlayOpen: true }),
  closeCapture: () => set({ captureOverlayOpen: false }),
}));

export default useSessionStore;
