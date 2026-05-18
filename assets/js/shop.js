/* ═══════════════════════════════════════════════
   TILF HABESHA — shop.js
   Synced to Admin Panel Schema
═══════════════════════════════════════════════ */
import {
  collection, getDocs, doc, getDoc,
  query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

let allProducts  = [];
let allArtisans  = {};

async function fetchArtisans() {
  if (Object.keys(allArtisans).length) return allArtisans;
  const snap = await getDocs(collection(db, 'artisans'));
  snap.docs.forEach(d => { allArtisans[d.id] = d.data(); });
  return allArtisans;
}

function resolveRefId(refOrId) {
  if (!refOrId) return '';
  if (typeof refOrId === 'string' && refOrId.startsWith('ref:')) {
    return refOrId.split('/').pop();
  }
  if (refOrId?.id) return refOrId.id;
  return refOrId;
}

async function fetchAllProducts() {
  if (allProducts.length) return allProducts;

  const [snap] = await Promise.all([
    getDocs(query(collection(db, 'products'), orderBy('createdAt', 'desc'))),
    fetchArtisans()
  ]);

  allProducts = snap.docs.map(d => {
    const data = d.data();
    const artisanDocId = resolveRefId(data.artisanId);
    const artisan = allArtisans[artisanDocId] || {};

    return {
      id: d.id,
      ...data,
      supplierName: artisan.brandName || 'Tilf Artisan',
      supplierAvatar: artisan.photoURL || '',
      rating: artisan.rating || 4.9,
      // Fixed: Schema uses categoryId as array of strings
      categorySlugs: (data.categoryId || []).map(c => c.toLowerCase()),
      depositAmount: data.depositAmount || parseFloat((data.price * 0.15).toFixed(2))
    };
  });

  return allProducts;
}

async function loadHero() {
  const slider = document.getElementById('heroSlider');
  if (!slider) return;

  try {
    const products = await fetchAllProducts();
    const featured = products.filter(p => p.inStock !== false).slice(0, 3);
    if (!featured.length) { slider.innerHTML = ''; return; }

    slider.innerHTML = featured.map((p, i) => `
      <div class="hero-card${i === 0 ? ' hero-card-tall' : ''}" onclick="window.openProduct('${p.id}')">
        <img src="${p.images?.[0] || ''}" alt="${p.title}" loading="${i === 0 ? 'eager' : 'lazy'}" style="width:100%;height:100%;object-fit:cover;${i === 0 ? 'min-height:300px;' : 'aspect-ratio:3/4;'}">
        <div class="dress-overlay">
          <div class="dress-overlay-name">${p.title}</div>
          <div class="dress-overlay-price">$${p.price} · ${p.supplierName}</div>
        </div>
      </div>
    `).join('');
  } catch (err) {
    console.error('Hero load error:', err);
  }
}

async function loadProducts(filterCat = 'all') {
  const grid = document.getElementById('productsGrid');
  if (!grid) return;
  grid.innerHTML = Array(6).fill('<div class="skeleton skeleton-card" style="height:300px"></div>').join('');

  try {
    const products = await fetchAllProducts();
    let filtered = products.filter(p => p.inStock !== false);

    const cat = filterCat.toLowerCase().trim();
    if (cat && cat !== 'all') {
      filtered = filtered.filter(p => (p.categorySlugs || []).includes(cat));
    }

    if (!filtered.length) {
      grid.innerHTML = `<div style="grid-column:1/-1;text-align:center;padding:4rem;font-style:italic;">No dresses in this category.</div>`;
      return;
    }

    grid.innerHTML = filtered.map(p => {
      const isWished = (window._wishCache || []).includes(p.id);
      return `
      <div class="dress-card fade-up" onclick="window.openProduct('${p.id}')">
        <div class="dress-card-img-wrap">
          <img src="${p.images?.[0] || ''}" alt="${p.title}" loading="lazy">
          <div class="card-actions">
            <button class="card-action-btn ${isWished ? 'wishlisted' : ''}" data-wish-btn="${p.id}" onclick="event.stopPropagation();window.toggleWish('${p.id}','${p.title.replace(/'/g,"\\'")}')">♡</button>
            <button class="card-action-btn" onclick="event.stopPropagation();window.addToCart({productId:'${p.id}',name:'${p.title.replace(/'/g,"\\'")}',price:${p.price},image:'${p.images?.[0]||''}',supplierName:'${p.supplierName.replace(/'/g,"\\'")}'})">🛒</button>
          </div>
        </div>
        <div class="dress-card-body">
          <div class="dress-card-name">${p.title}</div>
          <div class="dress-card-supplier"><span class="supplier-dot"></span>${p.supplierName}</div>
          <div class="dress-card-footer">
            <div>
              <div class="dress-price">$${p.price} <span>USD</span></div>
              <div style="font-size:0.7rem;color:var(--gold-dim);">Deposit: $${p.depositAmount.toFixed(2)}</div>
            </div>
          </div>
        </div>
      </div>`;
    }).join('');
  } catch (err) {
    console.error('Product load error:', err);
  }
}

window.openProduct = async function(id) {
  window.showPage('product');
  try {
    const snap = await getDoc(doc(db, 'products', id));
    if (!snap.exists()) return;
    
    const raw = snap.data();
    const artisanDocId = resolveRefId(raw.artisanId);
    const artisan = allArtisans[artisanDocId] || (await getDoc(doc(db, 'artisans', artisanDocId))).data() || {};
    
    const p = {
      id, ...raw,
      supplierName: artisan.brandName || 'Tilf Artisan',
      supplierAvatar: artisan.photoURL || '',
      rating: artisan.rating || 4.9,
      depositAmount: raw.depositAmount || parseFloat((raw.price * 0.15).toFixed(2))
    };

    const balance = (p.price - p.depositAmount).toFixed(2);
    
    document.querySelector('.product-name').textContent = p.title;
    document.querySelector('.product-price-main').textContent = `$${p.price}`;
    document.querySelector('.deposit-box-amount').textContent = `$${p.depositAmount.toFixed(2)}`;
    document.querySelector('.deposit-box-label').innerHTML = `Pay only <strong>$${p.depositAmount.toFixed(2)} now</strong>. Balance of <strong>$${balance}</strong> due when complete.`;
    
    // Fixed: measurementsRequired matches Admin schema
    document.getElementById('productDescription').innerHTML = `
      <p>${p.description || ''}</p>
      ${p.fabric ? `<div>Fabric: <strong>${p.fabric}</strong></div>` : ''}
      ${p.measurementsRequired ? `<div style="color:var(--sage);">📏 Custom measurements required</div>` : ''}
    `;

    document.querySelector('.product-main-img').innerHTML = `<img src="${p.images?.[0] || ''}" style="width:100%;height:100%;object-fit:cover;">`;
    
    document.querySelectorAll('.btn-deposit').forEach(btn => {
      if (btn.closest('#cartDrawerFooter')) return;
      btn.innerHTML = `<span>💳</span> Pay Deposit · $${p.depositAmount.toFixed(2)}`;
      btn.onclick = () => window.handleDepositPayment();
    });

    window._currentProduct = p;
  } catch(e) { console.error(e); }
};

window.addEventListener('filterProducts', (e) => loadProducts(e.detail));
document.addEventListener('DOMContentLoaded', () => { loadHero(); loadProducts(); });
