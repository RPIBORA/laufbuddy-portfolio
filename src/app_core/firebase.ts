// src/app_core/firebase.ts
import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// Deine echten Firebase-Zugangsdaten für LaufBuddy V2
const firebaseConfig = {
  apiKey: "AIzaSyBS5mV3Sf1TNV__Dz_wnVJ9X242gEd8Twg",
  authDomain: "laufbuddy-v2.firebaseapp.com",
  projectId: "laufbuddy-v2",
  storageBucket: "laufbuddy-v2.firebasestorage.app",
  messagingSenderId: "862089167524",
  appId: "1:862089167524:web:d426f35627cc86650cdc31"
};

// Firebase initialisieren
export const app = initializeApp(firebaseConfig);

// Datenbank (Firestore) exportieren, damit wir Daten lesen und schreiben können
export const db = getFirestore(app);