/* ═══════════════════════════════════════════════
   TILF HABESHA — script.js  v4 (production)
   Auth · Cart (Firestore) · Wishlist · Checkout
═══════════════════════════════════════════════ */

import { auth, db, googleProvider, functions } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, deleteDoc,
  collection, addDoc, query, where, getDocs,
  serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

/* ─── STATE ─── */
let currentUser = null;
let cartUnsub   = null;
let wishUnsub   = null;

let cartItems   = [];
let wishlistIds = [];
window._wishCache = wishlistIds;

/* ─────────────────────────────────────────────
   PAGE ROUTING
───────────────────────────────────────────── */
window.showPage = function(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) { page.classList.add('active'); window.scrollTo(0,0); }
  closeAllDrawers();
};

window.goScrollTo = function(id) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 80);
};

/* ─────────────────────────────────────────────
   AUTH — GOOGLE
───────────────────────────────────────────── */
window.doGoogleAuth = async function() {
  const btn = document.getElementById('googleAuthBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spinner"></span>Connecting…'; }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(result.user);
    closeAuthModal();
    toast('Welcome to Tilf Habesha ✦', 'success');
  } catch (err) {
    toast(friendlyAuthError(err.code), 'error');
  } finally {
    if (btn) { btn.disabled = false; btn.innerHTML = googleBtnHTML(); }
  }
};

/* ─────────────────────────────────────────────
   AUTH — EMAIL / PASSWORD
───────────────────────────────────────────── */
window.doAuth = async function() {
  const email  = document.getElementById('authEmail')?.value.trim();
  const pass   = document.getElementById('authPass')?.value;
  const title  = document.getElementById('authModalTitle')?.textContent || '';
  const isReg  = title.toLowerCase().includes('join') || title.toLowerCase().includes('create');

  if (!email || !pass) return toast('Please enter email and password.', 'error');
  if (isReg && pass.length < 8) return toast('Password must be at least 8 characters.', 'error');

  const btn = document.getElementById('authSubmitBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '<span class="auth-spinner"></span>Please wait…'; }

  try {
    if (isReg) {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      await ensureUserDoc(cred.user);
      toast('Account created! Welcome ✦', 'success');
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast('Signed in ✦', 'success');
    }
    closeAuthModal();
  } catch (err) {
    toast(friendlyAuthError(err.code), 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = isReg ? 'Create Account' : 'Sign In';
    }
  }
};

window.doSignOut = async function() {
  detachListeners();
  await signOut(auth);
  cartItems   = [];
  wishlistIds = [];
  window._wishCache = wishlistIds;
  updateCartBadge();
  updateWishBadge();
  toast('Signed out.', 'info');
};

window.doForgotPassword = async function() {
  const email = document.getElementById('authEmail')?.value.trim();
  if (!email) return toast('Enter your email address first.', 'error');
  try {
    await sendPasswordResetEmail(auth, email);
    toast('Password reset email sent ✦', 'success');
  } catch (err) {
    toast(friendlyAuthError(err.code), 'error');
  }
};

async function ensureUserDoc(user) {
  const ref  = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    await setDoc(ref, {
      email:       user.email,
      displayName: user.displayName || '',
      photoURL:    user.photoURL    || '',
      phone:       '',
      role:        'customer',
      createdAt:   serverTimestamp(),
      defaultMeasurements: { shoulder:0, bust:0, waist:0, hip:0, length:0, arm:0 },
      defaultAddress:      { street:'', city:'', subcity:'', country:'', note:'' }
    });
  }
}

function friendlyAuthError(code) {
  const map = {
    'auth/user-not-found':         'No account with that email.',
    'auth/wrong-password':         'Incorrect password.',
    'auth/invalid-credential':     'Incorrect email or password.',
    'auth/email-already-in-use':   'Email already registered. Sign in instead.',
    'auth/weak-password':          'Password must be at least 8 characters.',
    'auth/invalid-email':          'Invalid email address.',
    'auth/popup-closed-by-user':   'Google sign-in was cancelled.',
    'auth/too-many-requests':      'Too many attempts. Please wait a few minutes.',
  };
  return map[code] || 'Authentication error. Please try again.';
}

/* ─────────────────────────────────────────────
   AUTH STATE LISTENER
───────────────────────────────────────────── */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  renderNavAuth(user);

  if (user) {
    await syncUserDataToLocal(user.uid);
    attachCartListener(user.uid);
    attachWishListener(user.uid);
    await migrateLocalDataToFirestore(user.uid);
  } else {
    detachListeners();
    cartItems   = JSON.parse(localStorage.getItem('th_cart') || '[]');
    wishlistIds = JSON.parse(localStorage.getItem('th_wish') || '[]');
    window._wishCache = wishlistIds;
    updateCartBadge();
    updateWishBadge();
  }
});

function detachListeners() {
  if (cartUnsub) { cartUnsub(); cartUnsub = null; }
  if (wishUnsub) { wishUnsub(); wishUnsub = null; }
}

/* ─────────────────────────────────────────────
   FIRESTORE REALTIME LISTENERS
───────────────────────────────────────────── */
function attachCartListener(uid) {
  if (cartUnsub) cartUnsub();
  cartUnsub = onSnapshot(
    collection(db, 'users', uid, 'cart'),
    (snap) => {
      cartItems = snap.docs.map(d => ({ productId: d.id, ...d.data() }));
      updateCartBadge();
      renderCartDrawer();
    }
  );
}

function attachWishListener(uid) {
  if (wishUnsub) wishUnsub();
  wishUnsub = onSnapshot(
    collection(db, 'users', uid, 'wishlist'),
    (snap) => {
      wishlistIds = snap.docs.map(d => d.id);
      window._wishCache = wishlistIds;
      updateWishBadge();
      document.querySelectorAll('[data-wish-btn]').forEach(btn => {
        btn.classList.toggle('wishlisted', wishlistIds.includes(btn.dataset.wishBtn));
      });
    }
  );
}

/* ─────────────────────────────────────────────
   MIGRATE LOCAL → FIRESTORE (on first login)
───────────────────────────────────────────── */
async function migrateLocalDataToFirestore(uid) {
  const localCart = JSON.parse(localStorage.getItem('th_cart') || '[]');
  const localWish = JSON.parse(localStorage.getItem('th_wish') || '[]');

  for (const item of localCart) {
    try {
      await setDoc(
        doc(db, 'users', uid, 'cart', item.productId),
        { name: item.name, price: item.price, image: item.image,
          supplierName: item.supplierName || '', qty: item.qty || 1,
          addedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (_) {}
  }

  for (const pid of localWish) {
    try {
      await setDoc(
        doc(db, 'users', uid, 'wishlist', pid),
        { addedAt: serverTimestamp() },
        { merge: true }
      );
    } catch (_) {}
  }

  localStorage.removeItem('th_cart');
  localStorage.removeItem('th_wish');
}

/* ─────────────────────────────────────────────
   NAV RENDER
───────────────────────────────────────────── */
function renderNavAuth(user) {
  const area = document.getElementById('navAuthArea');
  if (!area) return;

  if (user) {
    const avatar = user.photoURL
      ? `<img src="${user.photoURL}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;border:1.5px solid var(--gold);" alt="">`
      : `<span style="width:28px;height:28px;border-radius:50%;background:var(--gold);display:flex;align-items:center;justify-content:center;font-size:0.75rem;font-weight:600;color:#1a1535;">${(user.displayName||user.email||'U')[0].toUpperCase()}</span>`;

    area.innerHTML = `
      <div style="display:flex;align-items:center;gap:0.5rem;cursor:pointer;" onclick="window.showPage('profile')">
        ${avatar}
        <span style="font-size:0.78rem;color:rgba(245,240,232,0.7);letter-spacing:0.06em;">Account</span>
      </div>
      <a href="#" onclick="window.doSignOut();return false;" style="font-size:0.78rem;color:rgba(245,240,232,0.4);text-decoration:none;letter-spacing:0.06em;">Sign Out</a>
    `;
  } else {
    area.innerHTML = `
      <a href="#" onclick="openAuthModal('signin')" style="font-size:0.82rem;color:rgba(245,240,232,0.72);text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-weight:500;">Sign In</a>
      <a href="#" onclick="openAuthModal('signup')" class="nav-cta">Join</a>
    `;
  }
}

/* ─────────────────────────────────────────────
   SYNC USER DATA → prefill forms
───────────────────────────────────────────── */
async function syncUserDataToLocal(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return;
    const data = snap.data();
    const m = data.defaultMeasurements || {};
    const a = data.defaultAddress || {};

    const fill = (id, val) => {
      const el = document.getElementById(id);
      if (el && !el.value && val) el.value = val;
    };

    fill('mShoulder', m.shoulder);
    fill('mBust',     m.bust);
    fill('mWaist',    m.waist);
    fill('mHips',     m.hip);
    fill('mLength',   m.length);
    fill('dStreet',   a.street);
    fill('dCity',     a.city);
    if (a.country) {
      const el = document.getElementById('dCountry');
      if (el) el.value = a.country;
    }
    fill('dPhone',    data.phone);
    fill('dEmail',    data.email);
  } catch (err) {
    console.error('syncUserData:', err);
  }
}

/* ─────────────────────────────────────────────
   MEASUREMENT VALIDATION
───────────────────────────────────────────── */
window.validateMeasurements = function() {
  const fields = [
    { id:'mShoulder', label:'Shoulder' },
    { id:'mBust',     label:'Bust'     },
    { id:'mWaist',    label:'Waist'    },
    { id:'mLength',   label:'Length'   }
  ];
  let isValid = true;
  const missing = [];
  fields.forEach(({ id, label }) => {
    const el  = document.getElementById(id);
    if (!el) return;
    const val = parseFloat(el.value);
    if (!el.value || isNaN(val) || val < 20) {
      el.style.borderColor = 'var(--terracotta)';
      isValid = false;
      missing.push(label);
    } else {
      el.style.borderColor = '';
    }
  });
  if (!isValid) toast(`Missing / invalid: ${missing.join(', ')}`, 'error');
  return isValid;
};

/* ─────────────────────────────────────────────
   SECURE CHECKOUT  (Stripe via Cloud Function)
   Single product deposit
───────────────────────────────────────────── */
window.handleDepositPayment = async function() {
  if (!currentUser) { openAuthModal('signin'); return; }
  if (!window.validateMeasurements()) return;
  if (!window._currentProduct) { toast('No product selected.', 'error'); return; }

  const p = window._currentProduct;

  const measurements = {
    shoulder:      parseFloat(document.getElementById('mShoulder')?.value      || 0),
    bust:          parseFloat(document.getElementById('mBust')?.value          || 0),
    waist:         parseFloat(document.getElementById('mWaist')?.value         || 0),
    shoulderWaist: parseFloat(document.getElementById('mShoulderWaist')?.value || 0),
    length:        parseFloat(document.getElementById('mLength')?.value        || 0),
    notes:         document.getElementById('mNotes')?.value || ''
  };

  const address = {
    name:    document.getElementById('dName')?.value    || currentUser.displayName || '',
    street:  document.getElementById('dStreet')?.value  || '',
    city:    document.getElementById('dCity')?.value    || '',
    zip:     document.getElementById('dZip')?.value     || '',
    country: document.getElementById('dCountry')?.value || '',
    phone:   document.getElementById('dPhone')?.value   || '',
    email:   document.getElementById('dEmail')?.value   || currentUser.email
  };

  const depBtn = document.querySelector('.btn-deposit:not(#cartDrawerFooter .btn-deposit)');
  if (depBtn) { depBtn.disabled = true; depBtn.innerHTML = '🔒 Connecting to Stripe…'; }

  try {
    toast('Connecting to secure payment…', 'info');
    const createSession = httpsCallable(functions, 'createDepositSession');
    const result        = await createSession({ productId: p.id, measurements, address });
    window.location.href = result.data.url;
  } catch (err) {
    console.error('Checkout error:', err);
    toast('Checkout error. Please try again.', 'error');
    if (depBtn) { depBtn.disabled = false; depBtn.innerHTML = `<span>💳</span> Pay Deposit · $${p.depositAmount}`; }
  }
};

/* ─────────────────────────────────────────────
   CART — FIRESTORE SUBCOLLECTION
   users/{uid}/cart/{productId}
───────────────────────────────────────────── */
window.addToCart = async function({ productId, name, price, image, supplierName }) {
  if (currentUser) {
    const ref  = doc(db, 'users', currentUser.uid, 'cart', productId);
    const snap = await getDoc(ref);
    await setDoc(ref, {
      name, price, image: image || '', supplierName: supplierName || '',
      qty: snap.exists() ? (snap.data().qty || 1) + 1 : 1,
      addedAt: serverTimestamp()
    });
  } else {
    const existing = cartItems.find(i => i.productId === productId);
    if (existing) { existing.qty = (existing.qty || 1) + 1; }
    else          { cartItems.push({ productId, name, price, image, supplierName, qty: 1 }); }
    localStorage.setItem('th_cart', JSON.stringify(cartItems));
    updateCartBadge();
    renderCartDrawer();
  }
  toast(`${name} added to cart ✦`, 'success');
  openCart();
};

window.removeFromCart = async function(productId) {
  if (currentUser) {
    await deleteDoc(doc(db, 'users', currentUser.uid, 'cart', productId));
  } else {
    cartItems = cartItems.filter(i => i.productId !== productId);
    localStorage.setItem('th_cart', JSON.stringify(cartItems));
    updateCartBadge();
    renderCartDrawer();
  }
};

window.updateCartQty = async function(productId, delta) {
  if (currentUser) {
    const ref  = doc(db, 'users', currentUser.uid, 'cart', productId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const newQty = (snap.data().qty || 1) + delta;
    if (newQty < 1) { await deleteDoc(ref); return; }
    await setDoc(ref, { qty: newQty }, { merge: true });
  } else {
    const item = cartItems.find(i => i.productId === productId);
    if (item) {
      item.qty = (item.qty || 1) + delta;
      if (item.qty < 1) { cartItems = cartItems.filter(i => i.productId !== productId); }
    }
    localStorage.setItem('th_cart', JSON.stringify(cartItems));
    updateCartBadge();
    renderCartDrawer();
  }
};

/* Cart checkout from drawer */
window.checkoutCart = async function() {
  if (!currentUser) {
    closeAllDrawers();
    openAuthModal('signin');
    return;
  }
  if (!cartItems.length) { toast('Cart is empty.', 'error'); return; }

  const btn = document.getElementById('cartCheckoutBtn');
  if (btn) { btn.disabled = true; btn.innerHTML = '🔒 Connecting to Stripe…'; }

  try {
    const createSession = httpsCallable(functions, 'createCartCheckoutSession');
    const result        = await createSession({ cartItems });
    window.location.href = result.data.url;
  } catch (err) {
    console.error('Cart checkout error:', err);
    toast('Checkout error. Please try again.', 'error');
    if (btn) { btn.disabled = false; btn.innerHTML = '🔒 Secure Checkout with Stripe'; }
  }
};

function updateCartBadge() {
  const total = cartItems.reduce((s, i) => s + (i.qty || 1), 0);
  const badge = document.getElementById('cartBadge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total ? 'flex' : 'none';
  }
}

function renderCartDrawer() {
  const body    = document.getElementById('cartDrawerBody');
  const footer  = document.getElementById('cartDrawerFooter');
  const depNote = document.getElementById('cartDepositNote');
  if (!body) return;

  if (!cartItems.length) {
    body.innerHTML = `<div class="drawer-empty">
      <div style="font-size:2rem;margin-bottom:0.75rem;">🛒</div>
      Your cart is empty.<br><span style="color:var(--gold-dim);">Find a dress you love ✦</span>
    </div>`;
    if (footer) footer.style.display = 'none';
    return;
  }

  body.innerHTML = cartItems.map(item => `
    <div class="drawer-item">
      <img class="drawer-item-img" src="${item.image || ''}" alt="${item.name}"
        loading="lazy" onerror="this.style.background='var(--deep)'">
      <div class="drawer-item-info">
        <div class="drawer-item-name">${item.name}</div>
        <div class="drawer-item-supplier">${item.supplierName || ''}</div>
        <div class="drawer-item-price">$${item.price} × ${item.qty || 1}</div>
        <div style="display:flex;gap:0.4rem;margin-top:0.4rem;align-items:center;">
          <button class="qty-btn" onclick="window.updateCartQty('${item.productId}',-1)">−</button>
          <span style="min-width:1.5rem;text-align:center;font-size:0.85rem;">${item.qty || 1}</span>
          <button class="qty-btn" onclick="window.updateCartQty('${item.productId}',1)">+</button>
        </div>
      </div>
      <button class="drawer-item-remove" onclick="window.removeFromCart('${item.productId}')" title="Remove">×</button>
    </div>
  `).join('');

  const total   = cartItems.reduce((s, i) => s + (i.price * (i.qty || 1)), 0);
  const deposit = (total * 0.15).toFixed(2);

  const totalEl = document.getElementById('cartTotalAmount');
  if (totalEl)  totalEl.textContent = `$${total.toFixed(2)}`;
  if (depNote)  depNote.innerHTML = `
    <div style="display:flex;justify-content:space-between;font-size:0.78rem;color:rgba(245,240,232,0.5);margin-bottom:0.25rem;">
      <span>Subtotal</span><span>$${total.toFixed(2)}</span>
    </div>
    <div style="display:flex;justify-content:space-between;font-size:0.82rem;color:var(--gold-dim);">
      <span>15% Deposit today</span><span style="color:var(--gold-light);font-weight:600;">$${deposit}</span>
    </div>
  `;
  if (footer) footer.style.display = 'flex';
}

window.openCart = function() {
  renderCartDrawer();
  document.getElementById('cartDrawer')?.classList.add('active');
  document.getElementById('drawerOverlay')?.classList.add('active');
};

/* ─────────────────────────────────────────────
   WISHLIST — FIRESTORE SUBCOLLECTION
   users/{uid}/wishlist/{productId}
───────────────────────────────────────────── */
window.toggleWish = async function(productId, productName) {
  const isWished = wishlistIds.includes(productId);

  if (currentUser) {
    const ref = doc(db, 'users', currentUser.uid, 'wishlist', productId);
    if (isWished) {
      await deleteDoc(ref);
      toast('Removed from favourites', 'info');
    } else {
      await setDoc(ref, { addedAt: serverTimestamp() });
      toast(`${productName || 'Item'} saved ♡`, 'success');
    }
  } else {
    if (isWished) {
      wishlistIds.splice(wishlistIds.indexOf(productId), 1);
      toast('Removed from favourites', 'info');
    } else {
      wishlistIds.push(productId);
      toast(`${productName || 'Item'} saved ♡`, 'success');
    }
    window._wishCache = wishlistIds;
    localStorage.setItem('th_wish', JSON.stringify(wishlistIds));
    document.querySelectorAll(`[data-wish-btn="${productId}"]`).forEach(btn => {
      btn.classList.toggle('wishlisted', wishlistIds.includes(productId));
      btn.textContent = wishlistIds.includes(productId) ? '♥' : '♡';
    });
    updateWishBadge();
    window.dispatchEvent(new CustomEvent('renderWishDetails', { detail: [...wishlistIds] }));
  }
};

function updateWishBadge() {
  const badge = document.getElementById('wishBadge');
  if (badge) {
    badge.textContent = wishlistIds.length;
    badge.style.display = wishlistIds.length ? 'flex' : 'none';
  }
}

window.openWish = function() {
  window.dispatchEvent(new CustomEvent('renderWishDetails', { detail: [...wishlistIds] }));
  document.getElementById('wishDrawer')?.classList.add('active');
  document.getElementById('drawerOverlay')?.classList.add('active');
};

/* ─────────────────────────────────────────────
   ORDER TRACKING
───────────────────────────────────────────── */
window.showTracking = async function() {
  const input  = document.getElementById('trackInput');
  const result = document.getElementById('trackResult');
  if (!input || !result) return;

  const trackId = input.value.trim();
  if (!trackId) { toast('Enter your order tracking ID', 'error'); return; }

  result.style.display = 'none';
  toast('Looking up your order…', 'info');

  try {
    const q    = query(collection(db, 'orders'), where('trackingId', '==', trackId));
    const snap = await getDocs(q);
    if (snap.empty) { toast('Order not found. Check your tracking ID.', 'error'); return; }
    renderTrackingResult(snap.docs[0].data(), trackId);
  } catch (err) {
    console.error('Tracking error:', err);
    toast('Could not load order. Try again.', 'error');
  }
};

function renderTrackingResult(order, trackId) {
  const result = document.getElementById('trackResult');
  if (!result) return;

  const statusMap = { pending:0, confirmed:0, cutting:1, stitching:2, quality:3, ready:4, shipped:4, delivered:4 };
  const activeStep = statusMap[order.status] ?? 0;
  const steps = [
    { label:'Deposit<br>Paid', icon:'✓' },
    { label:'Fabric<br>Cut',   icon:'✦' },
    { label:'Stitching<br>in Progress', icon:'✦' },
    { label:'Quality<br>Check', icon:'✦' },
    { label:'Ready to<br>Ship', icon:'✦' }
  ];

  const stepsHTML = steps.map((s, i) => {
    const cls  = i < activeStep ? 'p-done' : i === activeStep ? 'p-active' : 'p-pending';
    const icon = i < activeStep ? '✓' : i === activeStep ? '✦' : (i + 1);
    const line = i < steps.length - 1
      ? `<div class="progress-line ${i < activeStep ? 'done' : ''}"></div>` : '';
    return `<div class="progress-step ${cls}">
      <div class="progress-step-circle">${icon}</div>
      <div class="progress-step-label">${s.label}</div>
    </div>${line}`;
  }).join('');

  const snap = order.productSnapshot || {};
  result.style.display = 'block';
  result.innerHTML = `
    <div style="font-size:0.73rem;color:rgba(245,240,232,0.38);letter-spacing:0.1em;text-transform:uppercase;margin-bottom:1.5rem;">
      Order ${trackId} · ${snap.title || '—'}
    </div>
    <div class="progress-steps">${stepsHTML}</div>
    <div style="margin-top:1.25rem;font-size:0.8rem;color:rgba(201,168,76,0.7);">
      ✦ Status: <strong style="color:var(--gold-light);text-transform:capitalize;">${order.status || '—'}</strong>
      · Artisan: <strong style="color:var(--gold-light);">${snap.artisanName || '—'}</strong>
    </div>
    ${order.payment ? `<div style="margin-top:0.75rem;font-size:0.78rem;color:rgba(245,240,232,0.45);">
      Deposit paid: ${order.payment.depositPaid ? '✓' : '✗'}
      · Balance paid: ${order.payment.balancePaid ? '✓' : '✗'}
      · Total: $${order.payment.total || 0}
    </div>` : ''}
  `;
}

/* ─────────────────────────────────────────────
   STRIPE RETURN HANDLER
───────────────────────────────────────────── */
async function handleStripeReturn() {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get('order');
  const status  = params.get('status');
  if (!orderId) return;

  window.history.replaceState({}, '', window.location.pathname);

  if (status === 'cancel') {
    toast('Payment cancelled. Your cart is saved.', 'info');
    return;
  }

  try {
    const snap  = await getDoc(doc(db, 'orders', orderId));
    if (!snap.exists()) return;
    const order = snap.data();
    const idEl  = document.getElementById('generatedOrderId');
    if (idEl)   idEl.textContent = order.trackingId || orderId;
    openModal();
  } catch (err) {
    console.error('Order return error:', err);
  }
}

/* ─────────────────────────────────────────────
   FILTER BAR
───────────────────────────────────────────── */
function initFilterBars() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      btn.closest('.filter-bar')?.querySelectorAll('.filter-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      window.dispatchEvent(new CustomEvent('filterProducts', { detail: btn.dataset.cat || 'all' }));
    });
  });
}

/* ─────────────────────────────────────────────
   AUTH MODAL
───────────────────────────────────────────── */
window.openAuthModal = function(mode = 'signin') {
  const overlay    = document.getElementById('authModal');
  const title      = document.getElementById('authModalTitle');
  const submitBtn  = document.getElementById('authSubmitBtn');
  const switchLink = document.getElementById('authSwitchLink');
  const forgotLink = document.getElementById('authForgotLink');
  if (!overlay) return;

  if (mode === 'signup') {
    if (title)      title.textContent = 'Join Tilf Habesha';
    if (submitBtn)  submitBtn.textContent = 'Create Account';
    if (switchLink) switchLink.textContent = 'Already have an account? Sign in';
    if (forgotLink) forgotLink.style.display = 'none';
  } else {
    if (title)      title.textContent = 'Sign In';
    if (submitBtn)  submitBtn.textContent = 'Sign In';
    if (switchLink) switchLink.textContent = "Don't have an account? Join";
    if (forgotLink) forgotLink.style.display = 'inline';
  }
  overlay.classList.add('active');
  setTimeout(() => document.getElementById('authEmail')?.focus(), 100);
};

window.closeAuthModal = function() {
  document.getElementById('authModal')?.classList.remove('active');
};

window.switchAuthMode = function() {
  const title = document.getElementById('authModalTitle');
  if (!title) return;
  openAuthModal(title.textContent.toLowerCase().includes('sign in') ? 'signup' : 'signin');
};

function googleBtnHTML() {
  return `<svg width="18" height="18" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg" style="margin-right:8px;flex-shrink:0"><path fill="#4285F4" d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.875 2.684-6.615z"/><path fill="#34A853" d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z"/><path fill="#FBBC05" d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z"/><path fill="#EA4335" d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 6.29C4.672 4.163 6.656 3.58 9 3.58z"/></svg>Continue with Google`;
}

/* ─────────────────────────────────────────────
   ORDER SUCCESS MODAL
───────────────────────────────────────────── */
window.openModal  = () => document.getElementById('modal')?.classList.add('active');
window.closeModal = () => document.getElementById('modal')?.classList.remove('active');

/* ─────────────────────────────────────────────
   DRAWERS
───────────────────────────────────────────── */
window.closeAllDrawers = function() {
  document.querySelectorAll('.drawer').forEach(d => d.classList.remove('active'));
  document.getElementById('drawerOverlay')?.classList.remove('active');
};

/* ─────────────────────────────────────────────
   TOAST
───────────────────────────────────────────── */
window.toast = function(msg, type = 'info') {
  const wrap = document.getElementById('toastWrap');
  if (!wrap) return;
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.classList.add('toast-exit'), 3500);
  setTimeout(() => t.remove(), 4000);
};

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('navHamburger')?.addEventListener('click', () => {
    document.getElementById('navLinks')?.classList.toggle('mobile-open');
  });

  initFilterBars();
  updateCartBadge();
  updateWishBadge();
  handleStripeReturn();

  document.getElementById('drawerOverlay')?.addEventListener('click', closeAllDrawers);

  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'authModal') closeAuthModal();
  });
  document.getElementById('modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });

  ['authEmail','authPass'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') window.doAuth();
    });
  });
});
