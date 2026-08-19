# LaufBuddy – Android / React Native Portfolio Project

[![React Native](https://img.shields.io/badge/React_Native-0.81-61DAFB?logo=react&logoColor=black)](https://reactnative.dev/)
[![Expo](https://img.shields.io/badge/Expo_SDK-54-000020?logo=expo&logoColor=white)](https://expo.dev/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
[![Kotlin](https://img.shields.io/badge/Kotlin-Native_Modules-7F52FF?logo=kotlin&logoColor=white)](https://kotlinlang.org/)
[![Android](https://img.shields.io/badge/Android-API_29_--_36-3DDC84?logo=android&logoColor=white)](https://developer.android.com/)

**LaufBuddy** ist eine eigenständig entwickelte Android-Lauf-App auf Basis von React Native und TypeScript mit nativen Android-Modulen in Kotlin.

Das Projekt verbindet klassisches GPS-Lauftracking mit Live-Funktionen, Sprachsteuerung, Echtzeitkommunikation, BLE-Sensoren und robusten Android-Hintergrundprozessen.

---

## 🚀 Key Features

- **GPS-Tracking & Session-Recovery:** Route, Distanz, Pace, Pausen und Wiederherstellung aktiver Läufe nach Prozessneustarts.
- **LiveBuddy:** Echtzeit-Standortfreigabe eines aktiven Laufs über Firebase/Firestore und einen persönlichen Browser-Link.
- **BuddyWord:** Offline-Spracherkennung mit Vosk und headsetgebundene Sprachsteuerung.
- **BuddyLauf:** Direkte Audio-Verbindung zwischen Läufern über WebRTC.
- **BLE-Sensoren:** Integration externer Herzfrequenzsensoren über Bluetooth Low Energy.
- **Native Android:** Eigene Kotlin-Module für Audio Focus, Headset-Erkennung, Foreground Services, WorkManager und Bewegungserkennung.

---

## 🛠 Tech-Stack & Architektur

### Frontend & Core
* **Framework:** React Native 0.81 / Expo SDK 54
* **Sprache:** TypeScript
* **Echtzeitkommunikation:** WebRTC
* **Sensoren / BLE:** `react-native-ble-plx`

### Native Android (Kotlin Module)
* **Background Processing:** Android Foreground Services & WorkManager
* **Audio & Hardware:** Audio-Focus-Management & Headset-Event-Routing
* **Offline-Spracherkennung:** Vosk Android SDK (`0.3.75`)
* **Motion & Safety:** Native Notfall-Koordination und Bewegungserkennung

### Backend & Cloud
* **Authentifizierung & Backend:** Firebase Authentication & Cloud Functions (TypeScript)
* **Datenbank:** Cloud Firestore mit granularen Security Rules

---

## 🧪 Qualitätssicherung & Tests

Das Repository enthält automatisierte Prüfungen zur Absicherung von Kernabläufen:

* **Logik- & State-Tests:** Validierung von Routing-Policies, Daten-Scoping und kritischen Zustandsübergängen (`tsx`).
* **Firestore Security Rules Tests:** Validierung der Firestore-Sicherheitsregeln über den Firebase Emulator.
* **Smoke Checks:** Lifecycle-Prüfungen für Pause/Resume, Auto-Pause, Recovery und Session-Abschluss.
* **Typecheck:** Vollständige TypeScript-Kompilierungsprüfung (`npm run typecheck`).

---

## 💻 Lokale Entwicklung & Setup

### Voraussetzungen
* Node.js `>= 20.x`
* Java JDK 17
* Android SDK (Target SDK 36, Min SDK 29)
* Android Studio / Emulator oder physisches Testgerät

### Installation

```bash
# Repository klonen
git clone https://github.com/RPIBORA/laufbuddy-portfolio.git
cd laufbuddy-portfolio

# Abhängigkeiten installieren
npm ci
```

### Umgebungsvariablen (`.env`)

Erstelle eine `.env`-Datei im Projektstamm:

```text
GOOGLE_MAPS_ANDROID_API_KEY=your_api_key_here
```

### Ausführung & Build

```bash
# Metro Bundler starten
npm run dev

# Android Debug-Build ausführen
npm run android

# TypeScript prüfen
npm run typecheck

# Android Release APK erstellen
cd android
./gradlew assembleRelease
```

---

## 📌 Release & Status

- **Status:** Finalisierung für den Release im Google Play Store (Version 1.0.0).
- **Android Release:** Release-APK und enthaltene 64-Bit-Native-Libraries auf 16-KB-Page-Size-Kompatibilität geprüft.
- **SDKs:** Minimum SDK: `API 29` (Android 10) | Compile SDK: `API 36` | Target SDK: `API 36`.
