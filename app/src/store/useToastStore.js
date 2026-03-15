import { create } from 'zustand';

let nextId = 0;

const useToastStore = create((set) => ({
  toasts: [],

  addToast: (toast) => {
    const id = nextId++;
    set((state) => ({
      toasts: [...state.toasts, { id, ...toast }],
    }));
    return id;
  },

  removeToast: (id) =>
    set((state) => ({
      toasts: state.toasts.filter((t) => t.id !== id),
    })),
}));

export default useToastStore;
