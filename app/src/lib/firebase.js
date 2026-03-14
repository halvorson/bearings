import { initializeApp } from 'firebase/app';
import { getFirestore, connectFirestoreEmulator } from 'firebase/firestore';

const config = JSON.parse(
  atob(import.meta.env.VITE_FIREBASE_CONFIG)
);
export const app = initializeApp(config);
export const db  = getFirestore(app);

if (import.meta.env.DEV) {
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}
