/* ═══════════════════════════════════════════════
   TILF HABESHA — shop.js
   Product loading, hero, filtering, product page
═══════════════════════════════════════════════ */

import {
  collection, getDocs, doc, getDoc,
  query, where, limit, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

/* ─── Cache ─── */
let allProducts = [];
let currentProductId = null;

/* ─── Load All Products (once, cache) ─── */
async function fetchAllProducts() {
  if (allProducts.length) return allProducts;
  const snap = await getDocs(
    query(collection(db, "products"), orderBy("createdAt", "desc"))
  );
  allProducts = snap.docs.map(d => ({ id: d.id, ...d.data() }));
  return allProducts;
}

/* ─── HERO SLIDER ─── */
async function loadHero() {
  const slider = document.getElementById("heroSlider");
  if (!slider) return;

  // Show skeleton
  slider.innerHTML = `
    <div class="hero-card" style="grid-row:span 2;">
      <div style="width:100%;height:100%;min-height:300px;" class="skeleton"></div>
    </div>
    <div class="hero-card"><div style="width:100%;aspect-ratio:3/4;" class="skeleton"></div></div>
    <div class="hero-card"><div style="width:100%;aspect-ratio:3/4;" class="skeleton"></div></div>
  `;

  try {
    const products = await fetchAllProducts();
    const featured = products.filter(p => p.featured || p.inStock).slice(0, 3);

    if (!featured.length) {
      slider.innerHTML = '';
      return;
    }

    slider.innerHTML = featured.map((p, i) => `
      <div class="hero-card${i === 0 ? ' hero-card-tall' : ''}" onclick="window.openProduct('${p.id}')">
        <img src="${p.images?.[0] || ''}" alt="${p.title}"
          loading="${i === 0 ? 'eager' : 'lazy'}"
          style="width:100%;height:100%;${i === 0 ? 'aspect-ratio:auto;min-height:300px;' : 'aspect-ratio:3/4;'}object-fit:cover;"
          onerror="this.parentElement.style.background='var(--deep)'">
        <div class="dress-overlay">
          <div class="dress-overlay-name">${p.title}</div>
          <div class="dress-overlay-price">$${p.price} · ${p.supplierName || 'Tilf Artisan'}</div>
        </div>
      </div>
    `).join('');
  } catch (e) {
    console.error("Hero load error:", e);
    slider.innerHTML = '';
  }
}

/* ─── PRODUCT GRID ─── */
async function loadProducts(filterCat = 'all') {
  const grid = document.getElementById("productsGrid");
  if (!grid) return;

  // Skeleton
  grid.innerHTML = Array(6).fill(`<div class="skeleton skeleton-card"></div>`).join('');

  try {
    const products = await fetchAllProducts();
    let filtered = products.filter(p => p.inStock !== false);

    const cat = filterCat.toLowerCase().trim();
    if (cat && cat !== 'all') {
      filtered = filtered.filter(p =>
        Array.isArray(p.categoryId)
          ? p.categoryId.some(c => c.toLowerCase() === cat)
          : (p.categoryId || '').toLowerCase() === cat
      );
    }

    if (!filtered.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem 2rem;font-family:'Cormorant Garamond',serif;font-size:1.3rem;color:var(--text-light);font-style:italic;">No dresses found in this category yet.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const depositAmt = (p.price * 0.15).toFixed(2);
      const hasDiscount = p.discountPrice && p.discountPrice < p.price;
      const displayPrice = hasDiscount ? p.discountPrice : p.price;
      return `
      <div class="dress-card fade-up" onclick="window.openProduct('${p.id}')">
        <div class="dress-card-img-wrap">
          <img src="${p.images?.[0] || ''}" alt="${p.title}" loading="lazy"
            onerror="this.style.display='none';this.nextElementSibling.style.display='block'">
          <div style="display:none;width:100%;height:100%;background:linear-gradient(160deg,var(--deep),var(--indigo));aspect-ratio:3/4;"></div>
          ${p.badge ? `<div class="dress-card-badge ${p.badge === 'Popular' ? 'badge-popular' : ''}">${p.badge}</div>` : ''}
          <div class="card-actions">
            <button class="card-action-btn ${(window._wishCache||[]).includes(p.id)?'wishlisted':''}"
              data-wish-btn="${p.id}"
              onclick="event.stopPropagation(); window.toggleWish('${p.id}','${p.title}')"
              title="Add to wishlist">♡</button>
            <button class="card-action-btn"
              onclick="event.stopPropagation(); window.addToCart({productId:'${p.id}',name:'${p.title}',price:${displayPrice},image:'${p.images?.[0]||''}',supplierName:'${p.supplierName||''}'})"
              title="Add to cart">🛒</button>
          </div>
        </div>
        <div class="dress-card-body">
          <div class="dress-card-name">${p.title}</div>
          <div class="dress-card-supplier"><span class="supplier-dot"></span>${p.supplierName || 'Tilf Artisan'}</div>
          <div class="dress-card-footer">
            <div>
              <div class="dress-price">
                $${displayPrice} <span>USD</span>
                ${hasDiscount ? `<span class="dress-price-original">$${p.price}</span>` : ''}
              </div>
              <div style="font-size:0.7rem;color:var(--gold-dim);margin-top:1px;">Deposit: $${depositAmt}</div>
            </div>
            <div class="dress-delivery"><span class="dress-delivery-icon">◷</span> ${p.deliveryDays || '18–22'} days</div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (e) {
    console.error("Product load error:", e);
    grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:3rem;color:var(--terracotta);">Could not load products. Please try again.</div>`;
  }
}

/* ─── OPEN PRODUCT PAGE ─── */
window.openProduct = async function(id) {
  currentProductId = id;
  window.showPage('product');

  // Show loading state on product page
  const nameEl = document.querySelector(".product-name");
  const mainImg = document.querySelector(".product-main-img");
  if (nameEl) nameEl.innerHTML = `<span class="skeleton" style="display:block;height:60px;width:80%;border-radius:4px;"></span>`;
  if (mainImg) mainImg.innerHTML = `<div class="skeleton" style="width:100%;aspect-ratio:3/4;border-radius:8px;"></div>`;

  try {
    const snap = await getDoc(doc(db, "products", id));
    if (!snap.exists()) return;
    const p = snap.data();

    const hasDiscount = p.discountPrice && p.discountPrice < p.price;
    const displayPrice = hasDiscount ? p.discountPrice : p.price;
    const deposit = (displayPrice * 0.15).toFixed(2);
    const balance = (displayPrice * 0.85).toFixed(2);

    // Name
    const parts = p.title.split(' ');
    const half = Math.ceil(parts.length / 2);
    const line1 = parts.slice(0, half).join(' ');
    const line2 = parts.slice(half).join(' ');
    if (nameEl) nameEl.innerHTML = `${line1}<br><em>${line2}</em>`;

    // Price
    const priceEl = document.querySelector(".product-price-main");
    if (priceEl) priceEl.textContent = `$${displayPrice}`;
    if (hasDiscount) {
      const priceRow = document.querySelector(".product-price-row");
      if (priceRow) {
        const orig = priceRow.querySelector('.original-price');
        if (!orig) {
          const span = document.createElement('span');
          span.className = 'dress-price-original original-price';
          span.style.fontSize = '1rem';
          priceRow.appendChild(span);
        }
        priceRow.querySelector('.original-price').textContent = `$${p.price}`;
      }
    }

    // Deposit box
    const depAmt = document.querySelector(".deposit-box-amount");
    if (depAmt) depAmt.textContent = `$${deposit}`;
    const depLabel = document.querySelector(".deposit-box-label");
    if (depLabel) depLabel.innerHTML = `Pay only <strong>$${deposit} now</strong> to start your order.<br>Balance of $${balance} due when complete.`;

    // Deposit button
    const depBtn = document.querySelector(".btn-deposit");
    if (depBtn) depBtn.innerHTML = `<span>💳</span> Pay Deposit · $${deposit}`;

    // Supplier info
    const sAvatar = document.querySelector(".supplier-avatar");
    if (sAvatar) {
      if (p.supplierAvatar) sAvatar.innerHTML = `<img src="${p.supplierAvatar}" alt="${p.supplierName}">`;
      else sAvatar.textContent = (p.supplierName || 'A')[0];
    }
    const sName = document.querySelector(".supplier-name-small");
    if (sName) sName.textContent = p.supplierName || 'Tilf Artisan';
    const sMeta = document.querySelector(".supplier-meta-small");
    if (sMeta) sMeta.innerHTML = `
      <span><span class="stars">★★★★★</span> ${p.rating || '4.9'}</span>
      <span>· ${p.ordersCompleted || '100+'} dresses made</span>
    `;

    // Description on product page
    const descEl = document.getElementById('productDescription');
    if (descEl) descEl.innerHTML = `
      <p style="color:var(--text-mid);font-size:0.93rem;line-height:1.8;margin-bottom:1rem;">${p.description || ''}</p>
      ${p.fabric ? `<div style="font-size:0.8rem;color:var(--text-light);">Fabric: <strong>${p.fabric}</strong></div>` : ''}
    `;

    // Images
    const images = p.images || [];
    if (mainImg && images[0]) {
      mainImg.innerHTML = `<img src="${images[0]}" alt="${p.title}" style="width:100%;height:100%;object-fit:cover;">`;
    }

    const thumbRow = document.querySelector(".product-thumb-row");
    if (thumbRow && images.length > 1) {
      thumbRow.innerHTML = images.slice(0, 4).map((img, i) => `
        <div class="product-thumb ${i === 0 ? 'active' : ''}" onclick="switchProductImg('${img}', this)">
          <img src="${img}" alt="View ${i+1}" loading="lazy">
        </div>
      `).join('');
    }

    // Store for deposit button
    window._currentProduct = { id, ...p, displayPrice: Number(displayPrice), deposit: Number(deposit) };

  } catch (e) {
    console.error("Product open error:", e);
  }
};

window.switchProductImg = function(src, thumb) {
  document.querySelector('.product-main-img img').src = src;
  document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
  thumb.classList.add('active');
};

/* ─── FILTER EVENT ─── */
window.addEventListener('filterProducts', (e) => {
  loadProducts(e.detail);
});

/* ─── WISH DRAWER DETAILS ─── */
window.addEventListener('renderWishDetails', async (e) => {
  const wishBody = document.getElementById('wishDrawerBody');
  if (!wishBody || !e.detail.length) return;

  const products = await fetchAllProducts();
  const wished = products.filter(p => e.detail.includes(p.id));

  if (!wished.length) {
    wishBody.innerHTML = '<div class="drawer-empty">No favourites saved yet ♡</div>';
    return;
  }

  wishBody.innerHTML = wished.map(p => `
    <div class="drawer-item">
      <img class="drawer-item-img" src="${p.images?.[0]||''}" alt="${p.title}" loading="lazy" onerror="this.style.background='var(--deep)'">
      <div class="drawer-item-info">
        <div class="drawer-item-name">${p.title}</div>
        <div class="drawer-item-supplier">${p.supplierName || ''}</div>
        <div class="drawer-item-price">$${p.discountPrice || p.price}</div>
        <div style="margin-top:0.45rem;display:flex;gap:0.4rem;">
          <button class="qty-btn" style="width:auto;padding:0 0.6rem;border-radius:3px;"
            onclick="window.openProduct('${p.id}');closeAllDrawers()">View</button>
          <button class="qty-btn" style="width:auto;padding:0 0.6rem;border-radius:3px;"
            onclick="window.addToCart({productId:'${p.id}',name:'${p.title}',price:${p.discountPrice||p.price},image:'${p.images?.[0]||''}',supplierName:'${p.supplierName||''}'}); window.toggleWish('${p.id}')">Move to Cart</button>
        </div>
      </div>
      <button class="drawer-item-remove" onclick="window.toggleWish('${p.id}')" title="Remove">×</button>
    </div>
  `).join('');
});

/* ─── INIT ─── */
document.addEventListener('DOMContentLoaded', () => {
  loadHero();
  loadProducts();
});
