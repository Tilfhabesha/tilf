/* ═══════════════════════════════════════════════
   TILF HABESHA — firebase.js
   ⚠️  Replace the firebaseConfig values below
       with your actual Firebase project config.
═══════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";
import { getFirestore }   from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
export { auth, googleProvider };

const firebaseConfig = {
  apiKey: "AIzaSyBXJLMfQ9wLsFstO5oeSzXfRFhHl_ANWUk",
  authDomain: "tilf-habesha.firebaseapp.com",
  projectId: "tilf-habesha",
  storageBucket: "tilf-habesha.firebasestorage.app",
  messagingSenderId: "887340970705",
  appId: "1:887340970705:web:3b5704417ec0f9ac448bf0"
};

const app = initializeApp(firebaseConfig);
export const db   = getFirestore(app);
export const auth = getAuth(app);
