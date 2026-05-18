/* ═══════════════════════════════════════════════
   TILF HABESHA — script.js
   Auth · Cart · Wishlist · Orders · Tracking
   Fully synced to Firestore schema v2
═══════════════════════════════════════════════ */

import { auth, db, googleProvider, functions } from "./firebase.js";
import {
  onAuthStateChanged,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import {
  doc, setDoc, getDoc, updateDoc,
  collection, addDoc, query, where, getDocs,
  serverTimestamp, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { httpsCallable } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-functions.js";

/* ─────────────────────────────────────────────
   STATE
───────────────────────────────────────────── */
let currentUser  = null;
let cartItems    = JSON.parse(localStorage.getItem('th_cart')    || '[]');
let wishlistIds  = JSON.parse(localStorage.getItem('th_wish')    || '[]');

// Expose for shop.js
window._wishCache = wishlistIds;

/* ─────────────────────────────────────────────
   PAGE ROUTING
───────────────────────────────────────────── */
window.showPage = function(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) { page.classList.add('active'); window.scrollTo(0, 0); }
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
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user   = result.user;
    const userRef = doc(db, 'users', user.uid);
    const snap    = await getDoc(userRef);

    if (!snap.exists()) {
      // First sign-in → create user doc matching schema
      await setDoc(userRef, {
        email:       user.email,
        displayName: user.displayName  || '',
        photoURL:    user.photoURL     || '',
        phone:       '',
        role:        'customer',
        createdAt:   serverTimestamp(),
        defaultMeasurements: {
          shoulder: 0, bust: 0, waist: 0,
          hip: 0, length: 0, arm: 0
        },
        defaultAddress: {
          street: '', city: '', subcity: '',
          country: '', note: ''
        }
      });
    }

    closeAuthModal();
    toast('Welcome to Tilf Habesha! ✦', 'success');
  } catch (err) {
    toast(err.message, 'error');
  }
};

/* ─────────────────────────────────────────────
   AUTH — EMAIL / PASSWORD
───────────────────────────────────────────── */
window.doAuth = async function() {
  const email   = document.getElementById('authEmail').value.trim();
  const pass    = document.getElementById('authPass').value;
  const titleEl = document.getElementById('authModalTitle');
  const isReg   = titleEl && titleEl.textContent.toLowerCase().includes('join');

  if (!email || !pass) return toast('Please enter email and password.', 'error');

  try {
    if (isReg) {
      const cred = await createUserWithEmailAndPassword(auth, email, pass);
      // Create matching user doc
      await setDoc(doc(db, 'users', cred.user.uid), {
        email,
        displayName: '',
        photoURL:    '',
        phone:       '',
        role:        'customer',
        createdAt:   serverTimestamp(),
        defaultMeasurements: {
          shoulder: 0, bust: 0, waist: 0,
          hip: 0, length: 0, arm: 0
        },
        defaultAddress: {
          street: '', city: '', subcity: '',
          country: '', note: ''
        }
      });
      toast('Account created! Welcome ✦', 'success');
    } else {
      await signInWithEmailAndPassword(auth, email, pass);
      toast('Signed in ✦', 'success');
    }
    closeAuthModal();
  } catch (err) {
    toast(err.message, 'error');
  }
};

window.doSignOut = async function() {
  await signOut(auth);
  toast('Signed out.', 'info');
};

/* ─────────────────────────────────────────────
   AUTH STATE LISTENER
───────────────────────────────────────────── */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  renderNavAuth(user);

  if (user) {
    await syncUserDataToLocal(user.uid);
  }
});

function renderNavAuth(user) {
  const area = document.getElementById('navAuthArea');
  if (!area) return;

  if (user) {
    const avatar = user.photoURL
      ? `<img src="${user.photoURL}" style="width:28px;height:28px;border-radius:50%;object-fit:cover;" alt="me">`
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
   SYNC USER DATA → pre-fill forms
───────────────────────────────────────────── */
async function syncUserDataToLocal(uid) {
  try {
    const snap = await getDoc(doc(db, 'users', uid));
    if (!snap.exists()) return;
    const data = snap.data();

    // Pre-fill measurement fields if they have saved defaults
    const m = data.defaultMeasurements || {};
    if (m.shoulder) { const el = document.getElementById('mShoulder'); if (el && !el.value) el.value = m.shoulder; }
    if (m.bust)     { const el = document.getElementById('mBust');     if (el && !el.value) el.value = m.bust; }
    if (m.waist)    { const el = document.getElementById('mWaist');    if (el && !el.value) el.value = m.waist; }
    if (m.hip)      { const el = document.getElementById('mHips');     if (el && !el.value) el.value = m.hip; }
    if (m.length)   { const el = document.getElementById('mLength');   if (el && !el.value) el.value = m.length; }

    // Pre-fill address fields
    const a = data.defaultAddress || {};
    if (a.street)  { const el = document.getElementById('dStreet');  if (el && !el.value) el.value = a.street; }
    if (a.city)    { const el = document.getElementById('dCity');    if (el && !el.value) el.value = a.city; }
    if (a.country) { const el = document.getElementById('dCountry'); if (el) el.value = a.country; }
    if (data.phone){ const el = document.getElementById('dPhone');   if (el && !el.value) el.value = data.phone; }
    if (data.email){ const el = document.getElementById('dEmail');   if (el && !el.value) el.value = data.email; }

  } catch (err) {
    console.error('syncUserData error:', err);
  }
}

/* ─────────────────────────────────────────────
   MEASUREMENT VALIDATION
───────────────────────────────────────────── */
window.validateMeasurements = function() {
  // Map: fieldId → label
  const fields = [
    { id: 'mShoulder', label: 'Shoulder' },
    { id: 'mBust',     label: 'Bust' },
    { id: 'mWaist',    label: 'Waist' },
    { id: 'mLength',   label: 'Length' }
    // mShoulderWaist and mNotes are optional
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
    name:    document.getElementById('dName')?.value    || '',
    street:  document.getElementById('dStreet')?.value  || '',
    city:    document.getElementById('dCity')?.value    || '',
    zip:     document.getElementById('dZip')?.value     || '',
    country: document.getElementById('dCountry')?.value || '',
    phone:   document.getElementById('dPhone')?.value   || '',
    email:   document.getElementById('dEmail')?.value   || currentUser.email
  };

  try {
    toast('Connecting to secure payment…', 'info');
    const createSession = httpsCallable(functions, 'createDepositSession');
    const result = await createSession({
      productId:    p.id,
      measurements,
      address,
      customerId:   currentUser.uid
    });
    // Cloud function returns Stripe-hosted checkout URL
    window.location.href = result.data.url;
  } catch (err) {
    console.error('Checkout error:', err);
    toast('Checkout error. Please try again.', 'error');
  }
};

/* ─────────────────────────────────────────────
   CART  (local → also syncs badge)
───────────────────────────────────────────── */
window.addToCart = function({ productId, name, price, image, supplierName }) {
  const existing = cartItems.find(i => i.productId === productId);
  if (existing) {
    existing.qty = (existing.qty || 1) + 1;
  } else {
    cartItems.push({ productId, name, price, image, supplierName, qty: 1 });
  }
  persistCart();
  renderCartDrawer();
  toast(`${name} added to cart ✦`, 'success');
};

window.removeFromCart = function(productId) {
  cartItems = cartItems.filter(i => i.productId !== productId);
  persistCart();
  renderCartDrawer();
};

window.updateCartQty = function(productId, delta) {
  const item = cartItems.find(i => i.productId === productId);
  if (!item) return;
  item.qty = Math.max(1, (item.qty || 1) + delta);
  persistCart();
  renderCartDrawer();
};

function persistCart() {
  localStorage.setItem('th_cart', JSON.stringify(cartItems));
  updateCartBadge();
}

function updateCartBadge() {
  const total = cartItems.reduce((s, i) => s + (i.qty || 1), 0);
  const badge = document.getElementById('cartBadge');
  if (badge) {
    badge.textContent = total;
    badge.style.display = total ? 'flex' : 'none';
  }
}

function renderCartDrawer() {
  const body   = document.getElementById('cartDrawerBody');
  const footer = document.getElementById('cartDrawerFooter');
  const depNote = document.getElementById('cartDepositNote');
  if (!body) return;

  if (!cartItems.length) {
    body.innerHTML = '<div class="drawer-empty">Your cart is empty.<br>Find a dress you love ✦</div>';
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
        <div style="display:flex;gap:0.4rem;margin-top:0.4rem;">
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
  if (totalEl) totalEl.textContent = `$${total.toFixed(2)}`;
  if (depNote)  depNote.textContent = `Deposit (15%): $${deposit}`;
  if (footer)   footer.style.display = 'flex';
}

window.openCart = function() {
  renderCartDrawer();
  document.getElementById('cartDrawer')?.classList.add('active');
  document.getElementById('drawerOverlay')?.classList.add('active');
};

/* ─────────────────────────────────────────────
   WISHLIST  (local + Firestore when signed in)
───────────────────────────────────────────── */
window.toggleWish = async function(productId, productName) {
  const idx = wishlistIds.indexOf(productId);
  if (idx > -1) {
    wishlistIds.splice(idx, 1);
    toast('Removed from favourites', 'info');
  } else {
    wishlistIds.push(productId);
    toast(`${productName || 'Item'} saved ♡`, 'success');
  }

  window._wishCache = wishlistIds;
  localStorage.setItem('th_wish', JSON.stringify(wishlistIds));

  // Update heart button state
  document.querySelectorAll(`[data-wish-btn="${productId}"]`).forEach(btn => {
    btn.classList.toggle('wishlisted', wishlistIds.includes(productId));
  });

  // Persist to Firestore
  if (currentUser) {
    try {
      await updateDoc(doc(db, 'users', currentUser.uid), {
        wishlist: wishlistIds
      });
    } catch (err) {
      // wishlist field may not exist yet — use setDoc merge
      await setDoc(doc(db, 'users', currentUser.uid), { wishlist: wishlistIds }, { merge: true });
    }
  }

  updateWishBadge();
  // Signal shop.js to re-render wish drawer
  window.dispatchEvent(new CustomEvent('renderWishDetails', { detail: [...wishlistIds] }));
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
   ORDER TRACKING  (live Firestore listener)
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
    // Query orders by trackingId field
    const q    = query(collection(db, 'orders'), where('trackingId', '==', trackId));
    const snap = await getDocs(q);

    if (snap.empty) {
      toast('Order not found. Check your tracking ID.', 'error');
      return;
    }

    const order = snap.docs[0].data();
    renderTrackingResult(order, trackId);
  } catch (err) {
    console.error('Tracking error:', err);
    toast('Could not load order. Try again.', 'error');
  }
};

function renderTrackingResult(order, trackId) {
  const result = document.getElementById('trackResult');
  if (!result) return;

  // Map status string → step index (0-based)
  const statusMap = {
    'pending':    0,
    'confirmed':  0,
    'cutting':    1,
    'stitching':  2,
    'quality':    3,
    'ready':      4,
    'shipped':    4,
    'delivered':  4
  };
  const activeStep = statusMap[order.status] ?? 0;
  const steps = [
    { label: 'Deposit<br>Paid',         icon: '✓' },
    { label: 'Fabric<br>Cut',           icon: '✦' },
    { label: 'Stitching<br>in Progress',icon: '✦' },
    { label: 'Quality<br>Check',        icon: '✦' },
    { label: 'Ready to<br>Ship',        icon: '✦' }
  ];

  const stepsHTML = steps.map((s, i) => {
    const cls = i < activeStep ? 'p-done' : i === activeStep ? 'p-active' : 'p-pending';
    const icon = i < activeStep ? '✓' : i === activeStep ? '✦' : (i + 1);
    const lineHTML = i < steps.length - 1
      ? `<div class="progress-line ${i < activeStep ? 'done' : ''}"></div>`
      : '';
    return `
      <div class="progress-step ${cls}">
        <div class="progress-step-circle">${icon}</div>
        <div class="progress-step-label">${s.label}</div>
      </div>${lineHTML}`;
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
    ${order.payment ? `
    <div style="margin-top:0.75rem;font-size:0.78rem;color:rgba(245,240,232,0.45);">
      Deposit paid: ${order.payment.depositPaid ? '✓' : '✗'}
      · Balance paid: ${order.payment.balancePaid ? '✓' : '✗'}
      · Total: $${order.payment.total || 0}
    </div>` : ''}
  `;
}

/* ─────────────────────────────────────────────
   ORDER SUCCESS MODAL (called after Stripe return)
   Stripe redirects to ?order=<orderId>
───────────────────────────────────────────── */
async function handleStripeReturn() {
  const params  = new URLSearchParams(window.location.search);
  const orderId = params.get('order');
  if (!orderId) return;

  // Clean URL
  window.history.replaceState({}, '', window.location.pathname);

  try {
    const snap  = await getDoc(doc(db, 'orders', orderId));
    if (!snap.exists()) return;
    const order = snap.data();

    // Show success modal
    const idEl = document.getElementById('generatedOrderId');
    if (idEl) idEl.textContent = order.trackingId || orderId;
    openModal();
    // Clear cart after success
    cartItems = [];
    persistCart();
  } catch (err) {
    console.error('Order return error:', err);
  }
}

/* ─────────────────────────────────────────────
   FILTER BAR  (delegates to shop.js via event)
───────────────────────────────────────────── */
function initFilterBars() {
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      // Deactivate siblings in same bar
      btn.closest('.filter-bar')?.querySelectorAll('.filter-btn')
        .forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const cat = btn.dataset.cat || 'all';
      window.dispatchEvent(new CustomEvent('filterProducts', { detail: cat }));
    });
  });
}

/* ─────────────────────────────────────────────
   AUTH MODAL HELPERS
───────────────────────────────────────────── */
window.openAuthModal = function(mode = 'signin') {
  const overlay  = document.getElementById('authModal');
  const title    = document.getElementById('authModalTitle');
  const submitBtn = document.getElementById('authSubmitBtn');
  const switchLink = document.getElementById('authSwitchLink');
  if (!overlay) return;

  if (mode === 'signup') {
    if (title)      title.textContent = 'Join Tilf Habesha';
    if (submitBtn)  submitBtn.textContent = 'Create Account';
    if (switchLink) switchLink.textContent = 'Already have an account? Sign in';
  } else {
    if (title)      title.textContent = 'Sign In';
    if (submitBtn)  submitBtn.textContent = 'Sign In';
    if (switchLink) switchLink.textContent = "Don't have an account? Join";
  }
  overlay.classList.add('active');
};

window.closeAuthModal = function() {
  document.getElementById('authModal')?.classList.remove('active');
};

window.switchAuthMode = function() {
  const title = document.getElementById('authModalTitle');
  if (!title) return;
  const isSignin = title.textContent.toLowerCase().includes('sign in');
  openAuthModal(isSignin ? 'signup' : 'signin');
};

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

document.getElementById('drawerOverlay')?.addEventListener('click', window.closeAllDrawers);

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
  // Hamburger
  document.getElementById('navHamburger')?.addEventListener('click', () => {
    document.getElementById('navLinks')?.classList.toggle('mobile-open');
  });

  // Filter bars
  initFilterBars();

  // Restore cart & wish badges
  updateCartBadge();
  updateWishBadge();

  // Handle Stripe return redirect
  handleStripeReturn();

  // Overlay click → close drawers
  document.getElementById('drawerOverlay')?.addEventListener('click', closeAllDrawers);

  // Auth modal backdrop
  document.getElementById('authModal')?.addEventListener('click', (e) => {
    if (e.target.id === 'authModal') closeAuthModal();
  });
  document.getElementById('modal')?.addEventListener('click', (e) => {
    if (e.target.id === 'modal') closeModal();
  });
});
