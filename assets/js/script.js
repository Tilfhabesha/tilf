/* ═══════════════════════════════════════════════
   TILF HABESHA — script.js
   Core UI, Cart, Wishlist, Nav
═══════════════════════════════════════════════ */
import { signInWithPopup } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { googleProvider } from "./firebase.js";
import {
  onAuthStateChanged, signOut,
  createUserWithEmailAndPassword, signInWithEmailAndPassword
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-auth.js";
import { db } from "./firebase.js";
import {
  doc, setDoc, getDoc, updateDoc, arrayUnion, arrayRemove, onSnapshot
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

/* ───── PAGE ROUTING ───── */
window.showPage = function(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) { page.classList.add('active'); window.scrollTo(0, 0); }
  document.getElementById('footer-wrap')?.remove();
  document.body.appendChild(document.getElementById('footer-wrap-src'));
  closeAllDrawers();
};

window.goScrollTo = function(id) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 80);
};

/* ───── STATE ───── */
let currentUser = null;
let cartItems   = [];   // { productId, name, price, image, supplierId, supplierName, qty }
let wishItems   = [];   // productIds

/* ───── TOAST ───── */
function toast(msg, type = '') {
  const wrap = document.getElementById('toastWrap');
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.textContent = msg;
  wrap.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
window.toast = toast;

/* ───── BADGE COUNTS ───── */
function updateBadges() {
  const cartCount = cartItems.reduce((s, i) => s + (i.qty || 1), 0);
  const wishCount = wishItems.length;
  ['cartBadge', 'cartBadge2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = cartCount || ''; el.style.display = cartCount ? 'flex' : 'none'; }
  });
  ['wishBadge', 'wishBadge2'].forEach(id => {
    const el = document.getElementById(id);
    if (el) { el.textContent = wishCount || ''; el.style.display = wishCount ? 'flex' : 'none'; }
  });
}

/* ───── PERSIST: Firestore for logged-in, localStorage for guests ───── */
async function saveCart() {
  if (currentUser) {
    await setDoc(doc(db, 'carts', currentUser.uid), { items: cartItems }, { merge: true });
  } else {
    localStorage.setItem('th_cart', JSON.stringify(cartItems));
  }
  updateBadges();
  renderCartDrawer();
}

async function saveWish() {
  if (currentUser) {
    await setDoc(doc(db, 'wishlists', currentUser.uid), { items: wishItems }, { merge: true });
  } else {
    localStorage.setItem('th_wish', JSON.stringify(wishItems));
  }
  updateBadges();
  renderWishDrawer();
}

async function loadCart() {
  if (currentUser) {
    const snap = await getDoc(doc(db, 'carts', currentUser.uid));
    cartItems = snap.exists() ? (snap.data().items || []) : [];
    // Merge guest cart
    const guest = JSON.parse(localStorage.getItem('th_cart') || '[]');
    if (guest.length) {
      guest.forEach(gi => {
        const found = cartItems.find(c => c.productId === gi.productId);
        if (found) found.qty = (found.qty || 1) + (gi.qty || 1);
        else cartItems.push(gi);
      });
      localStorage.removeItem('th_cart');
      await saveCart();
    }
  } else {
    cartItems = JSON.parse(localStorage.getItem('th_cart') || '[]');
  }
  updateBadges();
  renderCartDrawer();
}

async function loadWish() {
  if (currentUser) {
    const snap = await getDoc(doc(db, 'wishlists', currentUser.uid));
    wishItems = snap.exists() ? (snap.data().items || []) : [];
    const guest = JSON.parse(localStorage.getItem('th_wish') || '[]');
    if (guest.length) {
      wishItems = [...new Set([...wishItems, ...guest])];
      localStorage.removeItem('th_wish');
      await saveWish();
    }
  } else {
    wishItems = JSON.parse(localStorage.getItem('th_wish') || '[]');
  }
  updateBadges();
  renderWishDrawer();
  // Update heart icons in grid
  document.querySelectorAll('[data-wish-btn]').forEach(btn => {
    const pid = btn.dataset.wishBtn;
    btn.classList.toggle('wishlisted', wishItems.includes(pid));
    btn.title = wishItems.includes(pid) ? 'Remove from wishlist' : 'Add to wishlist';
  });
}

/* ───── AUTH ───── */
onAuthStateChanged(auth, async (user) => {
  currentUser = user;
  const authArea = document.getElementById('navAuthArea');
  if (authArea) {
    if (user) {
      authArea.innerHTML = `
        <span style="font-size:0.75rem;color:rgba(245,240,232,0.5);letter-spacing:0.05em;">${user.email?.split('@')[0]}</span>
        <button onclick="window.doSignOut()" style="background:none;border:1px solid rgba(201,168,76,0.4);color:var(--gold-light);padding:0.35rem 0.85rem;border-radius:3px;cursor:pointer;font-family:'Afacad',sans-serif;font-size:0.72rem;letter-spacing:0.08em;text-transform:uppercase;">Sign Out</button>
      `;
    } else {
      authArea.innerHTML = `
        <a href="#" onclick="openAuthModal('signin')" style="font-size:0.82rem;color:rgba(245,240,232,0.72);text-decoration:none;letter-spacing:0.08em;text-transform:uppercase;font-weight:500;">Sign In</a>
        <a href="#" onclick="openAuthModal('signup')" class="nav-cta">Join</a>
      `;
    }
  }
  await loadCart();
  await loadWish();
});

window.doSignOut = async function() {
  await signOut(auth);
  toast('Signed out. See you soon! ✦');
};

/* ───── CART ACTIONS ───── */
window.addToCart = function(product) {
  const found = cartItems.find(c => c.productId === product.productId);
  if (found) { found.qty = (found.qty || 1) + 1; }
  else { cartItems.push({ ...product, qty: 1 }); }
  saveCart();
  toast('Added to cart ✦', 'success');
  bumpBadge('cartBadge');
};

window.removeFromCart = function(productId) {
  cartItems = cartItems.filter(c => c.productId !== productId);
  saveCart();
};

window.changeQty = function(productId, delta) {
  const item = cartItems.find(c => c.productId === productId);
  if (!item) return;
  item.qty = Math.max(1, (item.qty || 1) + delta);
  saveCart();
};

/* ───── WISHLIST ACTIONS ───── */
window.toggleWish = function(productId, name) {
  if (wishItems.includes(productId)) {
    wishItems = wishItems.filter(w => w !== productId);
    toast(`Removed from wishlist`);
  } else {
    wishItems.push(productId);
    toast(`Added to wishlist ♡`, 'success');
  }
  saveWish();
  // Update button state
  document.querySelectorAll(`[data-wish-btn="${productId}"]`).forEach(btn => {
    btn.classList.toggle('wishlisted', wishItems.includes(productId));
  });
};

/* ───── RENDER DRAWERS ───── */
function renderCartDrawer() {
  const body = document.getElementById('cartDrawerBody');
  if (!body) return;
  if (!cartItems.length) {
    body.innerHTML = '<div class="drawer-empty">Your cart is empty.<br>Find a dress you love ✦</div>';
    document.getElementById('cartDrawerFooter').style.display = 'none';
    return;
  }
  document.getElementById('cartDrawerFooter').style.display = 'block';
  let total = 0;
  body.innerHTML = cartItems.map(item => {
    const qty = item.qty || 1;
    const subtotal = (item.price * qty * 0.15).toFixed(2);
    total += item.price * qty;
    return `
    <div class="drawer-item">
      <img class="drawer-item-img" src="${item.image || ''}" alt="${item.name}" onerror="this.style.background='var(--deep)'">
      <div class="drawer-item-info">
        <div class="drawer-item-name">${item.name}</div>
        <div class="drawer-item-supplier">${item.supplierName || ''}</div>
        <div class="drawer-item-price">$${item.price} <span style="font-size:0.7rem;color:var(--text-light)">· Deposit: $${subtotal}</span></div>
        <div class="drawer-qty">
          <button class="qty-btn" onclick="changeQty('${item.productId}', -1)">−</button>
          <span class="qty-num">${qty}</span>
          <button class="qty-btn" onclick="changeQty('${item.productId}', 1)">+</button>
        </div>
      </div>
      <button class="drawer-item-remove" onclick="removeFromCart('${item.productId}')" title="Remove">×</button>
    </div>`;
  }).join('');
  document.getElementById('cartTotalAmount').textContent = `$${total.toFixed(2)}`;
  document.getElementById('cartDepositNote').textContent = `Deposit today: $${(total * 0.15).toFixed(2)} (15%)`;
}

function renderWishDrawer() {
  const body = document.getElementById('wishDrawerBody');
  if (!body) return;
  if (!wishItems.length) {
    body.innerHTML = '<div class="drawer-empty">No favourites saved yet ♡</div>';
    return;
  }
  // We'll show minimal info — productId as placeholder; shop.js enriches with product data
  body.innerHTML = `<div style="font-size:0.83rem;color:var(--text-mid);padding:0.5rem 0;">${wishItems.length} item${wishItems.length > 1 ? 's' : ''} saved ♡<br><span style="font-size:0.78rem;color:var(--text-light);">Click any to view or add to cart.</span></div>`;
  window.dispatchEvent(new CustomEvent('renderWishDetails', { detail: wishItems }));
}

/* ───── DRAWER OPEN / CLOSE ───── */
window.openCart = function() {
  document.getElementById('cartDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  renderCartDrawer();
};
window.openWish = function() {
  document.getElementById('wishDrawer').classList.add('open');
  document.getElementById('drawerOverlay').classList.add('open');
  renderWishDrawer();
};
window.closeAllDrawers = function() {
  document.querySelectorAll('.drawer').forEach(d => d.classList.remove('open'));
  document.getElementById('drawerOverlay')?.classList.remove('open');
};

function bumpBadge(id) {
  const el = document.getElementById(id);
  if (!el) return;
  el.classList.add('bump');
  setTimeout(() => el.classList.remove('bump'), 300);
}

/* ───── AUTH MODAL ───── */
window.openAuthModal = function(mode = 'signin') {
  const modal = document.getElementById('authModal');
  modal.dataset.mode = mode;
  document.getElementById('authModalTitle').textContent = mode === 'signup' ? 'Create Account' : 'Welcome Back';
  document.getElementById('authSubmitBtn').textContent = mode === 'signup' ? 'Create Account' : 'Sign In';
  document.getElementById('authSwitchLink').textContent = mode === 'signup' ? 'Already have an account? Sign in' : "Don't have an account? Join";
  modal.classList.add('open');
};
window.closeAuthModal = function() {
  document.getElementById('authModal')?.classList.remove('open');
};
window.switchAuthMode = function() {
  const modal = document.getElementById('authModal');
  const mode = modal.dataset.mode === 'signup' ? 'signin' : 'signup';
  openAuthModal(mode);
};
window.doGoogleAuth = async function() {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    
    // Check if user exists in Firestore, if not, create profile
    const userRef = doc(db, 'users', user.uid);
    const snap = await getDoc(userRef);
    
    if (!snap.exists()) {
      await setDoc(userRef, {
        email: user.email,
        displayName: user.displayName,
        photoURL: user.photoURL,
        createdAt: new Date()
      });
    }
    closeAuthModal();
    toast('Logged in with Google! ✦', 'success');
  } catch (error) {
    toast(error.message, 'error');
  }
};

// Add this to script.js
window.validateMeasurements = function() {
  const fields = ['mShoulder', 'mBust', 'mWaist', 'mHips', 'mLength'];
  let isValid = true;
  let missingFields = [];

  fields.forEach(id => {
    const input = document.getElementById(id);
    const value = parseFloat(input.value);
    
    // Check if empty or unrealistic (e.g., less than 5 inches/cm)
    if (!input.value || value < 5) {
      input.style.border = "1px solid var(--accent)";
      isValid = false;
      missingFields.push(input.placeholder || id);
    } else {
      input.style.border = "1px solid #eee";
    }
  });

  if (!isValid) {
    toast(`Please check: ${missingFields.join(', ')}`, 'error');
  }
  
  return isValid;
};

/* ───── ORDER MODAL ───── */
window.processDeposit = async function() {
  const product = window._currentProduct;
  
  // 1. Call your secure backend (Firebase Function) to create a checkout session
  const response = await fetch('https://your-cloud-function-url/create-checkout', {
    method: 'POST',
    body: JSON.stringify({
      productId: product.id,
      amount: product.deposit * 100, // Stripe uses cents
      currency: 'usd',
      measurements: { /* gather from DOM inputs */ }
    })
  });
  
  const { checkoutUrl } = await response.json();
  
  // 2. Redirect to Stripe's secure hosted page
  window.location.href = checkoutUrl;
};
window.closeModal = function() {
  document.getElementById('modal').classList.remove('open');
};

/* ───── TRACKING ───── */
window.showTracking = function() {
  const val = document.getElementById('trackInput')?.value.trim();
  const res = document.getElementById('trackResult');
  if (val && res) {
    res.style.display = 'block';
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
};

/* ───── FILTER BUTTONS ───── */
document.addEventListener('DOMContentLoaded', () => {
  // Close drawers on overlay click
  document.getElementById('drawerOverlay')?.addEventListener('click', closeAllDrawers);

  // Close modals on overlay click
  document.getElementById('modal')?.addEventListener('click', function(e) { if (e.target === this) closeModal(); });
  document.getElementById('authModal')?.addEventListener('click', function(e) { if (e.target === this) closeAuthModal(); });

  // Filter buttons
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', function() {
      // Only affect siblings in same container
      this.closest('.filter-bar')?.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
      this.classList.add('active');
      const cat = this.dataset.cat || this.textContent.trim().toLowerCase();
      window.dispatchEvent(new CustomEvent('filterProducts', { detail: cat }));
    });
  });

  // Thumbnail selection
  document.querySelectorAll('.product-thumb').forEach(thumb => {
    thumb.addEventListener('click', function() {
      document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
      this.classList.add('active');
    });
  });

  // Hamburger nav
  const hamburger = document.getElementById('navHamburger');
  const navLinks  = document.getElementById('navLinks');
  hamburger?.addEventListener('click', () => navLinks.classList.toggle('mobile-open'));

  // Auth form enter key
  document.getElementById('authPass')?.addEventListener('keydown', e => {
    if (e.key === 'Enter') window.doAuth();
  });
});
