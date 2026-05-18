/* ═══════════════════════════════════════════════
   TILF HABESHA — shop.js
   Product loading · Hero · Filtering · Product page
   Synced to Firestore schema v2
═══════════════════════════════════════════════ */

import {
  collection, getDocs, doc, getDoc,
  query, where, orderBy, limit
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

/* ─────────────────────────────────────────────
   CACHE
───────────────────────────────────────────── */
let allProducts  = [];   // raw Firestore docs + id
let allArtisans  = {};   // keyed by artisan doc id
let allCategories = {};  // keyed by category doc id

/* ─────────────────────────────────────────────
   FETCH HELPERS
───────────────────────────────────────────── */

/** Fetches and caches all artisans. Returns map { id → data }. */
async function fetchArtisans() {
  if (Object.keys(allArtisans).length) return allArtisans;
  const snap = await getDocs(collection(db, 'artisans'));
  snap.docs.forEach(d => { allArtisans[d.id] = d.data(); });
  return allArtisans;
}

/** Fetches and caches all categories. Returns map { id → data }. */
async function fetchCategories() {
  if (Object.keys(allCategories).length) return allCategories;
  const snap = await getDocs(collection(db, 'categories'));
  snap.docs.forEach(d => { allCategories[d.id] = d.data(); });
  return allCategories;
}

/**
 * Fetches and caches all products, enriched with artisan name + category slugs.
 * Schema fields used:
 *   title, description, price, depositAmount, images[], artisanId (ref string),
 *   categoryIds[] (ref strings), requiresMeasurement, inStock, createdAt,
 *   badge?, discountPrice?, fabric?, deliveryDays?, featured?
 */
async function fetchAllProducts() {
  if (allProducts.length) return allProducts;

  const [snap] = await Promise.all([
    getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc'))),
    fetchArtisans(),
    fetchCategories()
  ]);

  allProducts = snap.docs.map(d => {
    const data = d.data();

    // Resolve artisan display name from artisanId
    // artisanId is stored as "ref:artisans/artisan_a82js9"  OR  plain doc id
    const artisanDocId = resolveRefId(data.artisanId);
    const artisan      = allArtisans[artisanDocId] || {};

    // Resolve category slugs from categoryIds array
    const catSlugs = (data.categoryIds || []).map(refOrId => {
      const catId = resolveRefId(refOrId);
      return allCategories[catId]?.slug || catId || '';
    });

    return {
      id:           d.id,
      ...data,
      // Convenience fields for templates
      supplierName:   artisan.brandName   || 'Tilf Artisan',
      supplierAvatar: artisan.photoURL    || '',
      rating:         artisan.rating      || 4.9,
      categorySlugs:  catSlugs,
      // Deposit from schema or calculate 15%
      depositAmount:  data.depositAmount  || parseFloat((data.price * 0.15).toFixed(2))
    };
  });

  return allProducts;
}

/** Parses "ref:artisans/artisan_a82js9" → "artisan_a82js9", or returns plain id */
function resolveRefId(refOrId) {
  if (!refOrId) return '';
  if (typeof refOrId === 'string' && refOrId.startsWith('ref:')) {
    const parts = refOrId.split('/');
    return parts[parts.length - 1];
  }
  // Could also be a Firestore DocumentReference object
  if (refOrId?.id) return refOrId.id;
  return refOrId;
}

/* ─────────────────────────────────────────────
   HERO SLIDER  (top 3 featured / inStock)
───────────────────────────────────────────── */
async function loadHero() {
  const slider = document.getElementById('heroSlider');
  if (!slider) return;

  // Skeleton
  slider.innerHTML = `
    <div class="hero-card hero-card-tall">
      <div class="skeleton" style="width:100%;height:100%;min-height:300px;"></div>
    </div>
    <div class="hero-card"><div class="skeleton" style="width:100%;aspect-ratio:3/4;"></div></div>
    <div class="hero-card"><div class="skeleton" style="width:100%;aspect-ratio:3/4;"></div></div>
  `;

  try {
    const products = await fetchAllProducts();
    const featured = products
      .filter(p => p.inStock !== false && (p.featured || p.inStock))
      .slice(0, 3);

    if (!featured.length) { slider.innerHTML = ''; return; }

    slider.innerHTML = featured.map((p, i) => `
      <div class="hero-card${i === 0 ? ' hero-card-tall' : ''}"
           onclick="window.openProduct('${p.id}')">
        <img src="${p.images?.[0] || ''}" alt="${p.title}"
          loading="${i === 0 ? 'eager' : 'lazy'}"
          style="width:100%;height:100%;object-fit:cover;${i === 0 ? 'min-height:300px;' : 'aspect-ratio:3/4;'}"
          onerror="this.parentElement.style.background='var(--deep)'">
        <div class="dress-overlay">
          <div class="dress-overlay-name">${p.title}</div>
          <div class="dress-overlay-price">$${p.price} · ${p.supplierName}</div>
        </div>
      </div>
    `).join('');

  } catch (err) {
    console.error('Hero load error:', err);
    slider.innerHTML = '';
  }
}

/* ─────────────────────────────────────────────
   PRODUCT GRID
───────────────────────────────────────────── */
async function loadProducts(filterCat = 'all') {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;

  // Skeletons
  grid.innerHTML = Array(6).fill('<div class="skeleton skeleton-card"></div>').join('');

  try {
    const products = await fetchAllProducts();
    let filtered = products.filter(p => p.inStock !== false);

    const cat = filterCat.toLowerCase().trim();
    if (cat && cat !== 'all') {
      filtered = filtered.filter(p =>
        // Match against resolved category slugs array
        (p.categorySlugs || []).some(s => s.toLowerCase() === cat)
      );
    }

    if (!filtered.length) {
      grid.innerHTML = `
        <div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;
          font-family:'Cormorant Garamond',serif;font-size:1.3rem;
          color:var(--text-light);font-style:italic;">
          No dresses in this category yet.
        </div>`;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const hasDiscount  = p.discountPrice && p.discountPrice < p.price;
      const displayPrice = hasDiscount ? p.discountPrice : p.price;
      const deposit      = (displayPrice * 0.15).toFixed(2);
      const isWished     = (window._wishCache || []).includes(p.id);

      return `
      <div class="dress-card fade-up" onclick="window.openProduct('${p.id}')">
        <div class="dress-card-img-wrap">
          <img src="${p.images?.[0] || ''}" alt="${p.title}" loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
          <div style="display:none;width:100%;aspect-ratio:3/4;
            background:linear-gradient(160deg,var(--deep),var(--indigo));"></div>
          ${p.badge ? `<div class="dress-card-badge${p.badge==='Popular'?' badge-popular':''}">${p.badge}</div>` : ''}
          <div class="card-actions">
            <button class="card-action-btn ${isWished ? 'wishlisted' : ''}"
              data-wish-btn="${p.id}"
              onclick="event.stopPropagation();window.toggleWish('${p.id}','${p.title.replace(/'/g,"\\'")}')">♡</button>
            <button class="card-action-btn"
              onclick="event.stopPropagation();window.addToCart({productId:'${p.id}',name:'${p.title.replace(/'/g,"\\'")}',price:${displayPrice},image:'${p.images?.[0]||''}',supplierName:'${p.supplierName.replace(/'/g,"\\'")}'})"
              title="Add to cart">🛒</button>
          </div>
        </div>
        <div class="dress-card-body">
          <div class="dress-card-name">${p.title}</div>
          <div class="dress-card-supplier">
            <span class="supplier-dot"></span>${p.supplierName}
          </div>
          <div class="dress-card-footer">
            <div>
              <div class="dress-price">
                $${displayPrice} <span>USD</span>
                ${hasDiscount ? `<span class="dress-price-original">$${p.price}</span>` : ''}
              </div>
              <div style="font-size:0.7rem;color:var(--gold-dim);margin-top:1px;">
                Deposit: $${deposit}
              </div>
            </div>
            <div class="dress-delivery">
              <span class="dress-delivery-icon">◷</span>
              ${p.deliveryDays || '18–22'} days
            </div>
          </div>
        </div>
      </div>`;
    }).join('');

  } catch (err) {
    console.error('Product load error:', err);
    grid.innerHTML = `
      <div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--terracotta);">
        Could not load products. Please try again.
      </div>`;
  }
}

/* ─────────────────────────────────────────────
   PRODUCT PAGE
───────────────────────────────────────────── */
window.openProduct = async function(id) {
  window.showPage('product');

  // Reset to loading state
  const nameEl  = document.querySelector('.product-name');
  const mainImg = document.querySelector('.product-main-img');
  if (nameEl)  nameEl.innerHTML = `<span class="skeleton" style="display:block;height:60px;width:80%;border-radius:4px;"></span>`;
  if (mainImg) mainImg.innerHTML = `<div class="skeleton" style="width:100%;aspect-ratio:3/4;border-radius:8px;"></div>`;

  try {
    const snap = await getDoc(doc(db, 'products', id));
    if (!snap.exists()) { window.toast('Product not found.', 'error'); return; }

    const raw = snap.data();

    // Resolve artisan
    const artisanDocId = resolveRefId(raw.artisanId);
    let artisan = allArtisans[artisanDocId];
    if (!artisan) {
      const aSnap = await getDoc(doc(db, 'artisans', artisanDocId));
      artisan = aSnap.exists() ? aSnap.data() : {};
      allArtisans[artisanDocId] = artisan;
    }

    const p = {
      id,
      ...raw,
      supplierName:   artisan.brandName  || 'Tilf Artisan',
      supplierAvatar: artisan.photoURL   || '',
      rating:         artisan.rating     || 4.9,
      depositAmount:  raw.depositAmount  || parseFloat((raw.price * 0.15).toFixed(2))
    };

    const hasDiscount  = p.discountPrice && p.discountPrice < p.price;
    const displayPrice = hasDiscount ? p.discountPrice : p.price;
    const deposit      = p.depositAmount.toFixed(2);
    const balance      = (displayPrice * 0.85).toFixed(2);

    // ── Title
    const words = p.title.split(' ');
    const half  = Math.ceil(words.length / 2);
    if (nameEl) nameEl.innerHTML = `${words.slice(0, half).join(' ')}<br><em>${words.slice(half).join(' ')}</em>`;

    // ── Breadcrumb
    const breadName = document.getElementById('productBreadName');
    if (breadName) breadName.textContent = p.title;

    // ── Price
    const priceEl = document.querySelector('.product-price-main');
    if (priceEl) {
      priceEl.textContent = `$${displayPrice}`;
      const priceRow = document.querySelector('.product-price-row');
      if (priceRow) {
        priceRow.querySelector('.original-price')?.remove();
        if (hasDiscount) {
          const orig = document.createElement('span');
          orig.className = 'dress-price-original original-price';
          orig.style.fontSize = '1rem';
          orig.textContent = `$${p.price}`;
          priceRow.appendChild(orig);
        }
      }
    }

    // ── Deposit box
    const depAmt = document.querySelector('.deposit-box-amount');
    if (depAmt) depAmt.textContent = `$${deposit}`;
    const depLabel = document.querySelector('.deposit-box-label');
    if (depLabel) depLabel.innerHTML = `Pay only <strong>$${deposit} now</strong> to start your order.<br>Balance of <strong>$${balance}</strong> due when complete and approved.`;

    // ── Deposit button (the .btn-deposit on product page)
    const depBtns = document.querySelectorAll('.btn-deposit');
    depBtns.forEach(btn => {
      if (btn.closest('#cartDrawerFooter')) return; // skip cart drawer button
      btn.innerHTML = `<span>💳</span> Pay Deposit · $${deposit}`;
      btn.onclick = () => window.handleDepositPayment();
    });

    // ── Supplier
    const sAvatar = document.querySelector('.supplier-avatar');
    if (sAvatar) {
      sAvatar.innerHTML = p.supplierAvatar
        ? `<img src="${p.supplierAvatar}" alt="${p.supplierName}" style="width:100%;height:100%;border-radius:50%;object-fit:cover;">`
        : (p.supplierName || 'A')[0];
    }
    const sName = document.querySelector('.supplier-name-small');
    if (sName) sName.textContent = p.supplierName;
    const sMeta = document.querySelector('.supplier-meta-small');
    if (sMeta) sMeta.innerHTML = `
      <span><span class="stars">★★★★★</span> ${p.rating}</span>
      <span>· ${p.ordersCompleted || '100+'} dresses made</span>`;

    // ── Description
    const descEl = document.getElementById('productDescription');
    if (descEl) descEl.innerHTML = `
      <p style="color:var(--text-mid);font-size:0.93rem;line-height:1.8;margin-bottom:1rem;">
        ${p.description || ''}
      </p>
      ${p.fabric ? `<div style="font-size:0.8rem;color:var(--text-light);">Fabric: <strong>${p.fabric}</strong></div>` : ''}
      ${p.requiresMeasurement ? `<div style="font-size:0.78rem;color:var(--sage);margin-top:0.5rem;">📏 Custom measurements required</div>` : ''}
    `;

    // ── Images
    const images = Array.isArray(p.images) ? p.images : [];
    if (mainImg && images[0]) {
      mainImg.innerHTML = `<img src="${images[0]}" alt="${p.title}"
        style="width:100%;height:100%;object-fit:cover;border-radius:10px;">`;
    }
    const thumbRow = document.querySelector('.product-thumb-row');
    if (thumbRow) {
      thumbRow.innerHTML = images.slice(0, 4).map((img, i) => `
        <div class="product-thumb ${i === 0 ? 'active' : ''}"
          onclick="window.switchProductImg('${img}', this)">
          <img src="${img}" alt="View ${i+1}" loading="lazy">
        </div>`).join('');
    }

    // ── Store on window for checkout
    window._currentProduct = {
      id,
      ...p,
      displayPrice: Number(displayPrice),
      deposit:      Number(deposit)
    };

  } catch (err) {
    console.error('openProduct error:', err);
    window.toast('Could not load product.', 'error');
  }
};

window.switchProductImg = function(src, thumb) {
  const mainImgEl = document.querySelector('.product-main-img img');
  if (mainImgEl) mainImgEl.src = src;
  document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
};

/* ─────────────────────────────────────────────
   EVENT: FILTER (from script.js filter buttons)
───────────────────────────────────────────── */
window.addEventListener('filterProducts', (e) => {
  loadProducts(e.detail);
});

/* ─────────────────────────────────────────────
   EVENT: WISH DRAWER DETAILS
───────────────────────────────────────────── */
window.addEventListener('renderWishDetails', async (e) => {
  const wishBody = document.getElementById('wishDrawerBody');
  if (!wishBody) return;

  const ids = e.detail;
  if (!ids.length) {
    wishBody.innerHTML = '<div class="drawer-empty">No favourites saved yet ♡</div>';
    return;
  }

  const products = await fetchAllProducts();
  const wished   = products.filter(p => ids.includes(p.id));

  if (!wished.length) {
    wishBody.innerHTML = '<div class="drawer-empty">No favourites saved yet ♡</div>';
    return;
  }

  wishBody.innerHTML = wished.map(p => `
    <div class="drawer-item">
      <img class="drawer-item-img" src="${p.images?.[0] || ''}" alt="${p.title}"
        loading="lazy" onerror="this.style.background='var(--deep)'">
      <div class="drawer-item-info">
        <div class="drawer-item-name">${p.title}</div>
        <div class="drawer-item-supplier">${p.supplierName}</div>
        <div class="drawer-item-price">$${p.discountPrice || p.price}</div>
        <div style="margin-top:0.45rem;display:flex;gap:0.4rem;">
          <button class="qty-btn" style="width:auto;padding:0 0.6rem;"
            onclick="window.openProduct('${p.id}');window.closeAllDrawers()">View</button>
          <button class="qty-btn" style="width:auto;padding:0 0.6rem;"
            onclick="window.addToCart({productId:'${p.id}',name:'${p.title.replace(/'/g,"\\'")}',price:${p.discountPrice||p.price},image:'${p.images?.[0]||''}',supplierName:'${p.supplierName.replace(/'/g,"\\'")}'}); window.toggleWish('${p.id}')">
            Move to Cart
          </button>
        </div>
      </div>
      <button class="drawer-item-remove"
        onclick="window.toggleWish('${p.id}')" title="Remove">×</button>
    </div>
  `).join('');
});

/* ─────────────────────────────────────────────
   INIT
───────────────────────────────────────────── */
document.addEventListener('DOMContentLoaded', () => {
  loadHero();
  loadProducts();
});
