// firebase-config.js — turns on cloud sync (see js/sync.js). Plain script, loaded
// before app.js so window.OTOLAB_FIREBASE is set when sync.initSync() runs.
//
// These are Firebase *web* config values, not secrets: the apiKey identifies the
// project, it doesn't grant access. Security is enforced by Firestore rules +
// anonymous auth (each uid can read/write only its own doc). Safe to commit.
//
// Firestore rules to pair with this (Firebase console → Firestore → Rules):
//   rules_version = '2';
//   service cloud.firestore {
//     match /databases/{db}/documents {
//       match /otolab/{uid} {
//         allow read, write: if request.auth != null && request.auth.uid == uid;
//       }
//     }
//   }
// And enable Anonymous sign-in under Authentication → Sign-in method.

window.OTOLAB_FIREBASE = {
  apiKey: 'AIzaSyCQaP8nqbJg4dw0O4JJWdWk96RpwlUJSRI',
  authDomain: 'otolab-cb2de.firebaseapp.com',
  projectId: 'otolab-cb2de',
  storageBucket: 'otolab-cb2de.firebasestorage.app',
  messagingSenderId: '2605909578',
  appId: '1:2605909578:web:438ef258d1ca9cc01748b3',
  measurementId: 'G-45VHYSL2B4',
};
