/* ═══════════════════════════════════════════════
   TILF HABESHA — shop.js (CLEAN ARCHITECTURE)
═══════════════════════════════════════════════ */
import {
  collection, getDocs, doc, getDoc, query, orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

let ALL_PRODUCTS = [];
let ALL_ARTISANS = {};
let CURRENT_FILTER = 'all';

/* ───────────────── ARTISANS CACHE ───────────────── */
async function fetchArtisans(){
  if(Object.keys(ALL_ARTISANS).length) return;
  const snap = await getDocs(collection(db,'artisans'));
  snap.forEach(d => ALL_ARTISANS[d.id] = d.data());
}

/* ───────────────── PRODUCTS CACHE ───────────────── */
async function fetchProducts(){
  if(ALL_PRODUCTS.length) return ALL_PRODUCTS;

  await fetchArtisans();

  const snap = await getDocs(
    query(collection(db,'products'), orderBy('createdAt','desc'))
  );

  ALL_PRODUCTS = snap.docs.map(d=>{
    const data = d.data();
    const art = ALL_ARTISANS[data.artisanId] || {};

    return {
      id:d.id,
      ...data,
      supplierName: art.brandName || 'Tilf Artisan',
      categorySlugs:(data.categoryId||[]).map(c=>c.toLowerCase()),
      depositAmount:data.depositAmount || +(data.price*0.15).toFixed(2)
    };
  });

  return ALL_PRODUCTS;
}

/* ───────────────── FILTER ENGINE (ONLY ONE) ───────────────── */
function getFilteredProducts(){
  if(CURRENT_FILTER === 'all') return ALL_PRODUCTS;
  return ALL_PRODUCTS.filter(p =>
    p.categorySlugs.includes(CURRENT_FILTER)
  );
}

/* ───────────────── HERO RENDER ───────────────── */
function renderHero(products){
  const slider = document.getElementById('heroSlider');
  if(!slider) return;

  const items = products.slice(0,8);

  slider.innerHTML = items.map(p=>`
    <div class="hero-card" onclick="openProduct('${p.id}')">
      <img src="${p.images?.[0]||''}" style="width:100%;height:100%;object-fit:cover;">
      <div class="dress-overlay">
        <div class="dress-overlay-name">${p.title}</div>
        <div class="dress-overlay-price">$${p.price} · ${p.supplierName}</div>
      </div>
    </div>
  `).join('');
}

/* ───────────────── GRID RENDER ───────────────── */
function renderGrid(products){
  const grid = document.getElementById('productsGrid');
  if(!grid) return;

  grid.innerHTML = products.map(p=>`
    <div class="dress-card" onclick="openProduct('${p.id}')">
      <img src="${p.images?.[0]||''}">
      <div class="dress-card-body">
        <div class="dress-card-name">${p.title}</div>
        <div class="dress-price">$${p.price}</div>
      </div>
    </div>
  `).join('');
}

/* ───────────────── MASTER RENDER ───────────────── */
function renderAll(){
  const filtered = getFilteredProducts();
  renderHero(filtered);
  renderGrid(filtered);
}

/* ───────────────── FILTER BUTTONS ───────────────── */
function initFilters(){
  document.querySelectorAll('.filter-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelector('.filter-btn.active')?.classList.remove('active');
      btn.classList.add('active');

      CURRENT_FILTER = btn.dataset.cat.toLowerCase().trim();
      renderAll();
    });
  });
}

/* ───────────────── PRODUCT PAGE ───────────────── */
window.openProduct = async function(id){
  window.showPage('product');

  const snap = await getDoc(doc(db,'products',id));
  const p = snap.data();

  document.querySelector('.product-name').textContent = p.title;
  document.querySelector('.product-price-main').textContent = `$${p.price}`;
  document.querySelector('.product-main-img').innerHTML =
    `<img src="${p.images?.[0]||''}" style="width:100%">`;
};

/* ───────────────── INIT ───────────────── */
document.addEventListener('DOMContentLoaded', async ()=>{
  await fetchProducts();
  initFilters();
  renderAll();
});
