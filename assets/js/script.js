/* ═══════════════════════════════════════════════
   TILF HABESHA — script.js (Updated)
═══════════════════════════════════════════════ */

import { auth, db, googleProvider } from "./firebase.js";
import {
  onAuthStateChanged, signOut,
  signInWithEmailAndPassword, createUserWithEmailAndPassword, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { getFunctions, httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

/* ───── STATE ───── */
let currentUser = null;
let cartItems   = [];
let wishlistIds = [];

/* ───── PAGE ROUTING ───── */
window.showPage = function(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) { page.classList.add('active'); window.scrollTo(0, 0); }
  
  const footerSrc = document.getElementById('footer-wrap-src');
  if (footerSrc) {
    document.getElementById('footer-wrap')?.remove();
    document.body.appendChild(footerSrc);
  }
  closeAllDrawers();
};

window.goScrollTo = function(id) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 80);
};

/* ───── AUTHENTICATION ───── */

// Google Sign-In
window.doGoogleAuth = async function() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Sync user to Firestore
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: new Date(),
        role: 'customer'
      });
    }
    closeAuthModal();
    toast('Welcome to Tilf Habesha! ✦', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
};

// Email/Pass Auth
window.doAuth = async function() {
  const email = document.getElementById('authEmail').value;
  const pass  = document.getElementById('authPass').value;
  const isReg = document.getElementById('authTitle').textContent.includes('Join');

  try {
    if (isReg) {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await setDoc(doc(db, 'users', cred.user.uid), { email, createdAt: new Date() });
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
    }
    closeAuthModal();
  } catch (err) {
    toast(err.message, 'error');
  }
};

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const btn = document.getElementById('navAuthBtn');
  if (user) {
    btn.innerHTML = `<span>Account</span>`;
    btn.onclick = () => showPage('profile');
    syncUserData(user.uid);
  } else {
    btn.innerHTML = `<span>Sign In</span>`;
    btn.onclick = () => openAuthModal();
  }
});

/* ───── MEASUREMENT VALIDATION ───── */
window.validateMeasurements = function() {
  const fields = ['mShoulder', 'mBust', 'mWaist', 'mHips', 'mLength'];
  let isValid = true;
  let missing = [];

  fields.forEach(id => {
    const el = document.getElementById(id);
    const val = parseFloat(el.value);
    if (!el.value || val < 5) {
      el.style.border = "1px solid var(--accent)";
      isValid = false;
      missing.push(el.placeholder || id);
    } else {
      el.style.border = "1px solid #eee";
    }
  });

  if (!isValid) toast(`Please check: ${missing.join(', ')}`, 'error');
  return isValid;
};

/* ───── SECURE CHECKOUT ───── */
window.handleDepositPayment = async function() {
  if (!currentUser) return openAuthModal();
  if (!window.validateMeasurements()) return;

  const functions = getFunctions();
  const createSession = httpsCallable(functions, 'createDepositSession');

  const measurements = {
    shoulder: document.getElementById('mShoulder').value,
    bust: document.getElementById('mBust').value,
    waist: document.getElementById('mWaist').value,
    hips: document.getElementById('mHips').value,
    length: document.getElementById('mLength').value,
    unit: 'inches' 
  };

  try {
    toast('Connecting to secure payment...', 'info');
    const result = await createSession({ 
      productId: window._currentProduct.id,
      measurements: measurements
    });
    
    // Redirect to Stripe Hosted Checkout
    window.location.href = result.data.url;
  } catch (error) {
    console.error(error);
    toast('Checkout error. Please try again.', 'error');
  }
};

/* ───── UI HELPERS ───── */
window.toast = function(msg, type='info') {
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 4000);
};

// Drawer/Modal Toggles
window.openAuthModal = () => document.getElementById('authModal').classList.add('active');
window.closeAuthModal = () => document.getElementById('authModal').classList.remove('active');
window.closeAllDrawers = () => {
  document.querySelectorAll('.drawer, .drawer-overlay').forEach(el => el.classList.remove('active'));
};

/* ───── INITIALIZATION ───── */
document.addEventListener('DOMContentLoaded', () => {
  // Event listeners for UI elements
  document.getElementById('navHamburger')?.addEventListener('click', () => {
    document.getElementById('navLinks').classList.toggle('mobile-open');
  });
  
  // Attach Checkout to your existing "Pay Deposit" button logic
  const payBtn = document.querySelector('.btn-primary[onclick*="openModal"]');
  if (payBtn) {
    payBtn.setAttribute('onclick', 'handleDepositPayment()');
  }
});
