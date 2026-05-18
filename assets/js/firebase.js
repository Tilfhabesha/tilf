/* ═══════════════════════════════════════════════
   TILF HABESHA — firebase.js
   ⚠️  Single source of truth for Firebase init.
       All other files import from here.
═══════════════════════════════════════════════ */

import { initializeApp }              from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore }               from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { getFunctions }               from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

/* ── Config ── */
const firebaseConfig = {
  apiKey:            "AIzaSyBXJLMfQ9wLsFstO5oeSzXfRFhHl_ANWUk",
  authDomain:        "tilf-habesha.firebaseapp.com",
  projectId:         "tilf-habesha",
  storageBucket:     "tilf-habesha.firebasestorage.app",
  messagingSenderId: "887340970705",
  appId:             "1:887340970705:web:3b5704417ec0f9ac448bf0"
};

/* ── Init (once) ── */
const app = initializeApp(firebaseConfig);

/* ── Services ── */
export const db             = getFirestore(app);
export const auth           = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
export const functions      = getFunctions(app);   // used in script.js checkout
