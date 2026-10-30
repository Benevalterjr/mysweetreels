// Configuração centralizada do Firebase para Mysweetreels
import { initializeApp, getApps, getApp } from 'firebase/app';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

export const firebaseConfig = {
  apiKey: "AIzaSyCNNDNYhza5hpDcliDpPnY9bY0QPf1e96o",
  authDomain: "studio-1211123919-7a14e.firebaseapp.com",
  projectId: "studio-1211123919-7a14e",
  storageBucket: "studio-1211123919-7a14e.firebasestorage.app",
  messagingSenderId: "1092118003439",
  appId: "1:1092118003439:web:8070a91bed781a36d5e51a"
};

// Singleton App
export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Firestore com suporte a Long Polling e fallback limpo
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true
});
