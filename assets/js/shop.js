/* ═══════════════════════════════════════════════
   TILF HABESHA — shop.js
═══════════════════════════════════════════════ */

import {
  collection,
  getDocs,
  doc,
  getDoc,
  query,
  orderBy
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";

import { db } from "./firebase.js";

/* ───────────────── STATE ───────────────── */

let PRODUCTS = [];
let ARTISANS = {};

let HERO_FILTER = "new fashion";
let GRID_FILTER = "women";

/* ───────────────── HELPERS ───────────────── */

const $ = (s) => document.querySelector(s);
const $$ = (s) => document.querySelectorAll(s);

function normalizeCats(cat) {
  if (!cat) return [];

  if (Array.isArray(cat)) {
    return cat.map(x =>
      String(x).toLowerCase().trim()
    );
  }

  return [String(cat).toLowerCase().trim()];
}

/* ───────────────── FETCH ───────────────── */

async function fetchArtisans() {

  if (Object.keys(ARTISANS).length) return;

  const snap = await getDocs(collection(db, "artisans"));

  snap.forEach(d => {
    ARTISANS[d.id] = d.data();
  });
}

async function fetchProducts() {

  if (PRODUCTS.length) return;

  await fetchArtisans();

  const snap = await getDocs(
    query(
      collection(db, "products"),
      orderBy("updatedAt", "desc")
    )
  );

  PRODUCTS = snap.docs.map(d => {

    const data = d.data();

    const artisan = ARTISANS[data.artisanId] || {};

    return {
      id: d.id,
      ...data,

      categorySlugs: normalizeCats(data.categoryId),

      supplierName:
        artisan.brandName || "Tilf Artisan",

      depositAmount:
        data.depositAmount ||
        parseFloat((data.price * 0.15).toFixed(2))
    };
  });
}

/* ───────────────── HERO ───────────────── */

function renderHeroProducts() {

  const slider = $("#heroSlider");

  if (!slider) return;

  let items = PRODUCTS.filter(p =>
    p.inStock !== false &&
    p.categorySlugs.includes(HERO_FILTER)
  );

  if (!items.length) {
    slider.innerHTML =
      `<div class="empty-state">
        No new fashion products yet.
      </div>`;
    return;
  }

  slider.innerHTML = items.map(p => {

    const wished =
      (window._wishCache || []).includes(p.id);

    return `
      <div class="hero-card" data-id="${p.id}">

        <img src="${p.images?.[0] || ""}"
             alt="${p.title}"
             loading="lazy">

        <div class="card-actions">

          <button class="wish-btn ${wished ? "wishlisted" : ""}"
            data-wish="${p.id}"
            data-wish-btn="${p.id}">
            ${wished ? "♥" : "♡"}
          </button>

          <button class="cart-btn"
            data-cart="${p.id}">
            🛒
          </button>

        </div>

        <div class="dress-overlay">
          <div class="dress-overlay-name">
            ${p.title}
          </div>

          <div class="dress-overlay-price">
            $${p.price}
          </div>
        </div>

      </div>
    `;

  }).join("");
}

/* ───────────────── GRID ───────────────── */

function renderGridProducts() {

  const grid = $("#productsGrid");

  if (!grid) return;

  let items = PRODUCTS.filter(p =>
    p.inStock !== false &&
    p.categorySlugs.includes(GRID_FILTER)
  );

  if (!items.length) {

    grid.innerHTML =
      `<div class="empty-state">
        No products found.
      </div>`;

    return;
  }

  grid.innerHTML = items.map(p => {

    const wished =
      (window._wishCache || []).includes(p.id);

    return `
      <div class="hero-card" data-id="${p.id}">

        <img src="${p.images?.[0] || ""}"
             alt="${p.title}"
             loading="lazy">

        <div class="card-actions">

          <button class="wish-btn ${wished ? "wishlisted" : ""}"
            data-wish="${p.id}"
            data-wish-btn="${p.id}">
            ${wished ? "♥" : "♡"}
          </button>

          <button class="cart-btn"
            data-cart="${p.id}">
            🛒
          </button>

        </div>

        <div class="dress-overlay">
          <div class="dress-overlay-name">
            ${p.title}
          </div>

          <div class="dress-overlay-price">
            $${p.price}
          </div>
        </div>

      </div>
    `;

  }).join("");
}

/* ───────────────── PRODUCT PAGE ───────────────── */

async function openProduct(id) {

  window.showPage("product");

  const snap = await getDoc(
    doc(db, "products", id)
  );

  if (!snap.exists()) return;

  const p = {
    id,
    ...snap.data()
  };

  const set = (sel, val) => {
    const el = $(sel);
    if (el) el.textContent = val;
  };

  set(".product-name", p.title);
  set(".product-price-main", `$${p.price}`);

  set(
    ".deposit-box-amount",
    `$${p.depositAmount || (p.price * 0.15).toFixed(2)}`
  );

  const hero = $(".product-main-img");

  if (hero) {
    hero.innerHTML = `
      <img src="${p.images?.[0] || ""}"
           alt="${p.title}">
    `;
  }

  const gallery = $("#productGallery");

  if (gallery) {

    gallery.innerHTML = "";

    (p.images || []).slice(1).forEach(img => {

      gallery.innerHTML += `
        <div class="product-gallery-item">
          <img src="${img}">
        </div>
      `;
    });
  }

  const desc = $("#productDescription");

  if (desc) {
    desc.innerHTML = `<p>${p.description || ""}</p>`;
  }

  window._currentProduct = {
    ...p,
    depositAmount:
      p.depositAmount ||
      parseFloat((p.price * 0.15).toFixed(2))
  };
}

/* ───────────────── EVENTS ───────────────── */

document.addEventListener("click", (e) => {

  /* OPEN PRODUCT */

  const card =
    e.target.closest(".hero-card[data-id]");

  if (
    card &&
    !e.target.closest("[data-cart]") &&
    !e.target.closest("[data-wish]")
  ) {

    openProduct(card.dataset.id);
    return;
  }

  /* WISH */

  const wish =
    e.target.closest("[data-wish]");

  if (wish) {

    e.stopPropagation();

    const pid = wish.dataset.wish;

    const p = PRODUCTS.find(x => x.id === pid);

    window.toggleWish(pid, p?.title);

    return;
  }

  /* CART */

  const cart =
    e.target.closest("[data-cart]");

  if (cart) {

    e.stopPropagation();

    const p =
      PRODUCTS.find(
        x => x.id === cart.dataset.cart
      );

    if (!p) return;

    window.addToCart({
      productId: p.id,
      name: p.title,
      price: p.price,
      image: p.images?.[0] || "",
      supplierName: p.supplierName
    });

    return;
  }

  /* GRID FILTERS */

  const filter =
    e.target.closest("[data-main-cat]");

  if (filter) {

    GRID_FILTER =
      filter.dataset.mainCat
        .toLowerCase()
        .trim();

    $$("[data-main-cat]").forEach(btn => {
      btn.classList.remove("active");
    });

    filter.classList.add("active");

    renderGridProducts();

    return;
  }
});

/* ───────────────── INIT ───────────────── */

(async function initShop() {

  await fetchProducts();

  renderHeroProducts();

  renderGridProducts();

})();
