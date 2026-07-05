// sync.js — optional cloud sync for the progress store, so your curriculum,
// streak and SRS history follow you across devices instead of dying with one
// browser's localStorage.
//
// It is OFF until you give it a Firebase project. Nothing here runs (and nothing
// can break) without config. To turn it on, add ONE line before app.js in
// index.html:
//
//   <script>window.OTOLAB_FIREBASE = { apiKey:"…", authDomain:"…",
//     projectId:"…", appId:"…" };</script>
//
// (or drop a js/firebase-config.js that sets window.OTOLAB_FIREBASE and load it
// first). Then in the Firestore console create the database and use rules that
// scope each user to their own doc:
//
//   match /otolab/{uid} {
//     allow read, write: if request.auth != null && request.auth.uid == uid;
//   }
//
// Enable Anonymous sign-in in Firebase Auth. That's it — every device that opens
// the app gets its own anonymous uid and its own synced doc. (Sharing progress
// across devices for one person means signing in with the same account; extend
// signIn() below with a real provider when you want named logins.)
//
// The design: pull-merge on load, debounced push on every attempt, and a live
// listener so a second open tab/device folds in as you practise. All Firestore
// access is dynamically imported from the CDN and fully guarded — a blocked
// network, missing config or auth failure just leaves sync 'off' and the app
// runs exactly as before.

import { exportData, importData, onRecord } from './progress.js';

const SDK = 'https://www.gstatic.com/firebasejs/10.12.2';
const PUSH_DEBOUNCE_MS = 2500;

let status = 'off';           // off | connecting | synced | error
let statusDetail = '';
let onStatus = () => {};
let db = null, docRef = null, fb = null;
let pushTimer = null, applyingRemote = false;

function setStatus(s, detail = '') { status = s; statusDetail = detail; try { onStatus(s, detail); } catch (e) { /* isolate */ } }
function getStatus() { return { status, detail: statusDetail }; }

async function initSync(opts = {}) {
  onStatus = opts.onStatus || onStatus;
  const cfg = (typeof window !== 'undefined') && window.OTOLAB_FIREBASE;
  if (!cfg || !cfg.projectId) { setStatus('off', 'no firebase config'); return; }
  setStatus('connecting');
  try {
    const [{ initializeApp }, authMod, fsMod] = await Promise.all([
      import(`${SDK}/firebase-app.js`),
      import(`${SDK}/firebase-auth.js`),
      import(`${SDK}/firebase-firestore.js`),
    ]);
    fb = { ...fsMod };
    const app = initializeApp(cfg);
    const auth = authMod.getAuth(app);
    db = fsMod.getFirestore(app);

    const uid = await signIn(authMod, auth);
    docRef = fsMod.doc(db, 'otolab', uid);

    await pullMerge();                 // fold remote into local…
    await push();                      // …then send the merged result back up
    setStatus('synced');

    // live updates from other devices/tabs
    fsMod.onSnapshot(docRef, snap => {
      if (applyingRemote) return;
      const data = snap.data();
      if (data && data.progress && !snap.metadata.hasPendingWrites) {
        applyRemote(data.progress);
      }
    });

    // push local attempts up, debounced
    onRecord(() => schedulePush());
  } catch (e) {
    setStatus('error', String(e && e.message || e));
  }
}

async function signIn(authMod, auth) {
  return new Promise((resolve, reject) => {
    authMod.onAuthStateChanged(auth, u => { if (u) resolve(u.uid); });
    authMod.signInAnonymously(auth).catch(reject);
  });
}

function applyRemote(progress) {
  applyingRemote = true;
  try { importData(progress); } finally { applyingRemote = false; }
}

async function pullMerge() {
  const snap = await fb.getDoc(docRef);
  const data = snap.exists() ? snap.data() : null;
  if (data && data.progress) applyRemote(data.progress);
}

function schedulePush() {
  if (!docRef) return;
  clearTimeout(pushTimer);
  pushTimer = setTimeout(() => { push().catch(() => {}); }, PUSH_DEBOUNCE_MS);
}

async function push() {
  if (!docRef) return;
  await fb.setDoc(docRef, { progress: exportData(), updated: Date.now() }, { merge: true });
  if (status === 'synced') setStatus('synced'); // ping listeners with fresh time
}

export { initSync, getStatus };
