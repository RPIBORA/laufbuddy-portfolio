// src/app_core/firebase/firebaseConfig.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Deine geheimen LaufBuddy-Zugangsdaten
const firebaseConfig = {
  apiKey: "AIzaSyBS5mV3Sf1TNV__Dz_wnVJ9X242gEd8Twg",
  authDomain: "laufbuddy-v2.firebaseapp.com",
  projectId: "laufbuddy-v2",
  storageBucket: "laufbuddy-v2.firebasestorage.app",
  messagingSenderId: "862089167524",
  appId: "1:862089167524:web:d426f35627cc86650cdc31"
};

// 1. Firebase starten
export const app = initializeApp(firebaseConfig);

// 2. Datenbank (den Telefonisten) für den Rest der App freigeben
export const db = getFirestore(app);