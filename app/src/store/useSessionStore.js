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
  deleteMode: false,
  previewMode: false,

  setActiveItem: (id) => set({ activeItemId: id, deleteMode: false, previewMode: false }),
  openCapture: () => set({ captureOverlayOpen: true }),
  closeCapture: () => set({ captureOverlayOpen: false }),
  setDeleteMode: (on) => set({ deleteMode: on }),
  startPreview: () => set({ previewMode: true, deleteMode: false }),
  stopPreview: () => set({ previewMode: false }),
}));

export default useSessionStore;
