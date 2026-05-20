/* ═══════════════════════════════════════════════
   TILF HABESHA — shop.js  v4
   Categories → Hero   |   Products → Swipe Grid
═══════════════════════════════════════════════ */

import {
  collection, getDocs, doc, getDoc,
  query, orderBy, where
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

/* ───────────────── STATE ───────────────── */
let PRODUCTS   = [];
let ARTISANS   = {};
let CATEGORIES = {};           // { slug → { name, coverImage, images, order } }
let CURRENT_FILTER = 'all';

/* ───────────────── HELPERS ───────────────── */
const $  = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function resolveRefId(refOrId) {
  if (!refOrId) return '';
  if (typeof refOrId === 'string' && refOrId.startsWith('ref:'))
    return refOrId.split('/').pop();
  if (refOrId?.id) return refOrId.id;
  return String(refOrId);
}

/* ═══════════════════════════════════════════════
   FETCHERS
═══════════════════════════════════════════════ */
async function fetchCategories() {
  if (Object.keys(CATEGORIES).length) return;
  const snap = await getDocs(collection(db, 'categories'));
  snap.forEach(d => {
    CATEGORIES[d.id] = d.data();
  });
}

async function fetchArtisans() {
  if (Object.keys(ARTISANS).length) return;
  const snap = await getDocs(collection(db, 'artisans'));
  snap.forEach(d => ARTISANS[d.id] = d.data());
}

async function fetchProducts() {
  if (PRODUCTS.length) return;
  await Promise.all([fetchArtisans(), fetchCategories()]);

  const snap = await getDocs(
    query(collection(db, 'products'), orderBy('createdAt', 'desc'))
  );

  PRODUCTS = snap.docs.map(d => {
    const data      = d.data();
    const artisanId = resolveRefId(data.artisanId);
    const artisan   = ARTISANS[artisanId] || {};

    // categoryId may be array of strings e.g. ["women","casual"] or doc refs
    const categorySlugs = (data.categoryId || []).map(c =>
      (typeof c === 'string' ? c : c?.id || '').toLowerCase().trim()
    );

    return {
      id:           d.id,
      ...data,
      supplierName:  artisan.brandName || 'Tilf Artisan',
      supplierAvatar:artisan.photoURL  || '',
      rating:        artisan.rating    || 4.9,
      categorySlugs,
      depositAmount: data.depositAmount ||
        parseFloat((data.price * 0.15).toFixed(2))
    };
  });
}

/* ═══════════════════════════════════════════════
   HERO — category coverImages as swipeable cards
   "All" → featured/popular products
   Any other filter → coverImage + extra images
   from that category doc
═══════════════════════════════════════════════ */
function renderHero() {
  const slider = $('#heroSlider');
  const hint   = $('#swipeHint');
  if (!slider) return;

  let slides = [];

  if (CURRENT_FILTER === 'all') {
    /* Use featured/popular products as hero cards */
    const items = PRODUCTS.filter(p =>
      p.inStock !== false && (p.featured || p.badge === 'Popular')
    );
    slides = items.map(p => ({
      img:      p.images?.[0] || '',
      title:    p.title,
      subtitle: `$${p.price} · ${p.supplierName}`,
      id:       p.id,
      type:     'product'
    }));
  } else {
    /* Use category coverImage + images array */
    const cat = CATEGORIES[CURRENT_FILTER];
    if (cat) {
      const imgs = [];
      if (cat.coverImage) imgs.push(cat.coverImage);
      (cat.images || []).forEach(img => {
        if (img && img !== cat.coverImage) imgs.push(img);
      });
      slides = imgs.map((img, i) => ({
        img,
        title:    cat.name || CURRENT_FILTER,
        subtitle: i === 0 ? `${cat.name || CURRENT_FILTER} Collection` : '',
        type:     'category'
      }));
    }

    /* Fallback: if no category doc images, use product images */
    if (!slides.length) {
      const items = PRODUCTS.filter(p =>
        p.inStock !== false &&
        p.categorySlugs.includes(CURRENT_FILTER)
      );
      slides = items.map(p => ({
        img:      p.images?.[0] || '',
        title:    p.title,
        subtitle: `$${p.price} · ${p.supplierName}`,
        id:       p.id,
        type:     'product'
      }));
    }
  }

  if (!slides.length) {
    slider.innerHTML = '';
    hint?.classList.add('hidden');
    return;
  }

  hint?.classList.remove('hidden');

  slider.innerHTML = slides.map(s => `
    <div class="hero-card" ${s.id ? `data-id="${s.id}"` : ''} style="cursor:${s.id ? 'pointer' : 'default'}">
      <img src="${s.img}" alt="${s.title}" loading="lazy">
      <div class="dress-overlay">
        <div class="dress-overlay-name">${s.title}</div>
        ${s.subtitle ? `<div class="dress-overlay-price">${s.subtitle}</div>` : ''}
      </div>
    </div>
  `).join('');

  /* Re-attach swipe hint logic after render */
  initSwipeHint(slider, hint);
}

/* ═══════════════════════════════════════════════
   SWIPE HINT — shows ☝️ swipe right hint,
   then ← swipe left hint once user has scrolled
═══════════════════════════════════════════════ */
function initSwipeHint(slider, hint) {
  if (!hint) return;

  let hintShown  = false;
  let leftShown  = false;

  hint.innerHTML = `<span class="swipe-arrow">→</span><span>Swipe to explore</span>`;
  hint.classList.remove('hidden');

  slider.addEventListener('scroll', () => {
    const scrolled   = slider.scrollLeft;
    const maxScroll  = slider.scrollWidth - slider.clientWidth;

    if (!hintShown && scrolled > 20) {
      hintShown = true;
      hint.classList.add('hidden');
    }

    if (hintShown && !leftShown && scrolled > 40) {
      leftShown = true;
      setTimeout(() => {
        hint.innerHTML = `<span class="swipe-arrow">←</span><span>Swipe back</span>`;
        hint.classList.remove('hidden');
        setTimeout(() => hint.classList.add('hidden'), 2200);
      }, 600);
    }

    if (scrolled < 10) {
      leftShown = false;
      hintShown = false;
      hint.innerHTML = `<span class="swipe-arrow">→</span><span>Swipe to explore</span>`;
      hint.classList.remove('hidden');
    }
  }, { passive: true });
}

/* ═══════════════════════════════════════════════
   PRODUCTS GRID — horizontal swipe, 2 per screen
   "All" → all in-stock   |  filter → by category
═══════════════════════════════════════════════ */
function renderGrid() {
  const grid = $('#productsGrid');
  if (!grid) return;

  let items = PRODUCTS.filter(p => p.inStock !== false);

  if (CURRENT_FILTER !== 'all') {
    items = items.filter(p =>
      p.categorySlugs.includes(CURRENT_FILTER)
    );
  }

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state">No dresses in this category yet.</div>`;
    grid.classList.remove('swipe-grid');
    return;
  }

  /* ── Mark grid as horizontal swipe layout ── */
  grid.classList.add('swipe-grid');

  grid.innerHTML = items.map(p => {
    const wished = (window._wishCache || []).includes(p.id);
    return `
      <div class="dress-card" data-id="${p.id}">
        <div class="dress-card-img-wrap">
          <img src="${p.images?.[0] || ''}" alt="${p.title}" loading="lazy">
          <div class="card-actions">
            <button class="wish-btn ${wished ? 'wishlisted' : ''}"
              data-wish="${p.id}"
              data-wish-btn="${p.id}"
              aria-label="Save to wishlist">
              ${wished ? '♥' : '♡'}
            </button>
            <button class="cart-btn" data-cart="${p.id}" aria-label="Add to cart">🛒</button>
          </div>
          ${p.badge ? `<div class="card-badge">${p.badge}</div>` : ''}
        </div>
        <div class="dress-card-body">
          <div class="dress-card-name">${p.title}</div>
          <div class="dress-card-supplier">${p.supplierName}</div>
          <div class="dress-price">$${p.price}</div>
        </div>
      </div>
    `;
  }).join('');

  /* ── Swipe hint for product grid ── */
  let gridHint = document.getElementById('gridSwipeHint');
  if (!gridHint) {
    gridHint = document.createElement('div');
    gridHint.id        = 'gridSwipeHint';
    gridHint.className = 'swipe-hint grid-swipe-hint';
    grid.parentNode.insertBefore(gridHint, grid.nextSibling);
  }
  initSwipeHint(grid, gridHint);
}

/* ═══════════════════════════════════════════════
   PRODUCT DETAIL PAGE
═══════════════════════════════════════════════ */
async function openProduct(id) {
  window.showPage('product');

  const snap = await getDoc(doc(db, 'products', id));
  if (!snap.exists()) return;

  const raw       = snap.data();
  const artisanId = resolveRefId(raw.artisanId);
  const artisan   = ARTISANS[artisanId] ||
    (await getDoc(doc(db, 'artisans', artisanId))).data() || {};

  const p = {
    id, ...raw,
    supplierName:  artisan.brandName || 'Tilf Artisan',
    depositAmount: raw.depositAmount || parseFloat((raw.price * 0.15).toFixed(2))
  };

  const set = (sel, val) => { const el = $(sel); if (el) el.textContent = val; };
  set('.product-name',         p.title);
  set('.product-price-main',   `$${p.price}`);
  set('.deposit-box-amount',   `$${p.depositAmount}`);

  const descEl = $('#productDescription');
  if (descEl) descEl.innerHTML = `<p>${p.description || ''}</p>`;

  const imgEl = $('.product-main-img');
  if (imgEl)  imgEl.innerHTML = `<img src="${p.images?.[0] || ''}" alt="${p.title}">`;

  const depBtn = document.querySelector('.btn-deposit');
  if (depBtn) depBtn.innerHTML = `<span>💳</span> Pay Deposit · $${p.depositAmount}`;

  window._currentProduct = p;
}

/* ═══════════════════════════════════════════════
   EVENT DELEGATION
═══════════════════════════════════════════════ */
document.addEventListener('click', (e) => {

  /* Hero card → open product */
  const heroCard = e.target.closest('#heroSlider [data-id]');
  if (heroCard) { openProduct(heroCard.dataset.id); return; }

  /* Product grid card (but not action buttons) */
  const card = e.target.closest('.dress-card[data-id]');
  if (card && !e.target.closest('[data-wish]') && !e.target.closest('[data-cart]')) {
    openProduct(card.dataset.id);
    return;
  }

  /* Wishlist toggle */
  const wish = e.target.closest('[data-wish]');
  if (wish) {
    e.stopPropagation();
    const pid  = wish.dataset.wish;
    const prod = PRODUCTS.find(x => x.id === pid);
    window.toggleWish(pid, prod?.title);
    return;
  }

  /* Add to cart */
  const cart = e.target.closest('[data-cart]');
  if (cart) {
    e.stopPropagation();
    const p = PRODUCTS.find(x => x.id === cart.dataset.cart);
    if (p) window.addToCart({
      productId:    p.id,
      name:         p.title,
      price:        p.price,
      image:        p.images?.[0] || '',
      supplierName: p.supplierName
    });
    return;
  }

  /* Filter button */
  const filter = e.target.closest('.filter-btn');
  if (filter) {
    const newCat = (filter.dataset.cat || 'all').toLowerCase().trim();
    CURRENT_FILTER = newCat;

    /* Sync BOTH filter bars */
    $$('.filter-btn').forEach(b => {
      b.classList.toggle('active', (b.dataset.cat || 'all').toLowerCase().trim() === newCat);
    });

    renderHero();
    renderGrid();
    return;
  }
});

/* ═══════════════════════════════════════════════
   WISH DETAILS DRAWER — listen for event from script.js
═══════════════════════════════════════════════ */
window.addEventListener('renderWishDetails', async (e) => {
  const ids  = e.detail || [];
  const body = document.getElementById('wishDrawerBody');
  if (!body) return;

  if (!ids.length) {
    body.innerHTML = '<div class="drawer-empty">No favourites saved yet ♡</div>';
    return;
  }

  /* Load any products not in PRODUCTS cache */
  const missing = ids.filter(id => !PRODUCTS.find(p => p.id === id));
  for (const id of missing) {
    try {
      const snap = await getDoc(doc(db, 'products', id));
      if (snap.exists()) {
        const raw = snap.data();
        PRODUCTS.push({ id, ...raw,
          supplierName: '',
          depositAmount: raw.depositAmount || parseFloat((raw.price * 0.15).toFixed(2)),
          categorySlugs: []
        });
      }
    } catch(_) {}
  }

  const wished = ids.map(id => PRODUCTS.find(p => p.id === id)).filter(Boolean);

  body.innerHTML = wished.map(p => `
    <div class="drawer-item">
      <img class="drawer-item-img" src="${p.images?.[0] || ''}" alt="${p.title}" loading="lazy">
      <div class="drawer-item-info">
        <div class="drawer-item-name">${p.title}</div>
        <div class="drawer-item-supplier">${p.supplierName || ''}</div>
        <div class="drawer-item-price">$${p.price}</div>
        <div style="display:flex;gap:0.5rem;margin-top:0.5rem;">
          <button class="qty-btn" onclick="window.addToCart({productId:'${p.id}',name:'${p.title.replace(/'/g,"\\'")}',price:${p.price},image:'${p.images?.[0]||''}',supplierName:'${(p.supplierName||'').replace(/'/g,"\\'")}'}); closeAllDrawers();">Add to cart</button>
        </div>
      </div>
      <button class="drawer-item-remove" onclick="window.toggleWish('${p.id}','${p.title.replace(/'/g,"\\'")}')">×</button>
    </div>
  `).join('');
});

/* ═══════════════════════════════════════════════
   CSS — inject swipe-grid & hint styles
═══════════════════════════════════════════════ */
(function injectSwipeStyles() {
  if (document.getElementById('swipe-grid-style')) return;
  const style = document.createElement('style');
  style.id = 'swipe-grid-style';
  style.textContent = `
    /* ── Horizontal swipe product grid ── */
    .dress-grid.swipe-grid {
      display: flex;
      flex-direction: row;
      overflow-x: auto;
      overflow-y: visible;
      gap: 1.25rem;
      scroll-snap-type: x mandatory;
      -webkit-overflow-scrolling: touch;
      scrollbar-width: none;
      padding-bottom: 1rem;
    }
    .dress-grid.swipe-grid::-webkit-scrollbar { display: none; }

    .dress-grid.swipe-grid .dress-card {
      flex: 0 0 calc(50% - 0.625rem);
      min-width: calc(50% - 0.625rem);
      scroll-snap-align: start;
    }

    @media (max-width: 480px) {
      .dress-grid.swipe-grid .dress-card {
        flex: 0 0 calc(50% - 0.5rem);
        min-width: calc(50% - 0.5rem);
      }
    }

    /* ── Empty state ── */
    .empty-state {
      padding: 2.5rem 1rem;
      text-align: center;
      color: rgba(245,240,232,0.4);
      font-size: 0.9rem;
      letter-spacing: 0.06em;
    }

    /* ── Grid swipe hint ── */
    .grid-swipe-hint {
      position: relative !important;
      bottom: auto !important;
      left: auto !important;
      transform: none !important;
      display: flex;
      align-items: center;
      gap: 0.5rem;
      justify-content: center;
      padding: 0.5rem 0 0.25rem;
      font-size: 0.78rem;
      color: rgba(201,168,76,0.65);
      letter-spacing: 0.08em;
      transition: opacity 0.4s;
    }
    .grid-swipe-hint.hidden { opacity: 0; pointer-events: none; }

    .swipe-arrow {
      font-size: 1.1rem;
      animation: swipeArrowPulse 1.4s ease-in-out infinite;
    }
    @keyframes swipeArrowPulse {
      0%,100% { transform: translateX(0); opacity: 1; }
      50%      { transform: translateX(5px); opacity: 0.5; }
    }

    /* ── Card badge ── */
    .card-badge {
      position: absolute;
      top: 0.6rem;
      left: 0.6rem;
      background: var(--gold, #c9a84c);
      color: #1a1535;
      font-size: 0.65rem;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      padding: 0.18rem 0.55rem;
      border-radius: 2rem;
    }
  `;
  document.head.appendChild(style);
})();

/* ═══════════════════════════════════════════════
   INIT
═══════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded', async () => {
  await fetchProducts();
  renderHero();
  renderGrid();
});
