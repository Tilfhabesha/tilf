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

  // Expose to other modules (script.js) so the wishlist drawer can look up
  // full product details for saved items without a second Firestore round-trip.
  window._productsCache = PRODUCTS;
}

window.getProductById = function (id) {
  return PRODUCTS.find(p => p.id === id) || null;
};

window.ensureProductsLoaded = fetchProducts;
window.openProduct = openProduct;

/* ───────────────── FORMAT HELPERS ───────────────── */

function fmtPrice(n) {
  const num = Number(n) || 0;
  return num.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function escapeHtml(str) {
  return String(str ?? "").replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
  }[c]));
}

function isNewProduct(p) {
  const ts = p.createdAt?.toMillis ? p.createdAt.toMillis() : (p.createdAt?.seconds ? p.createdAt.seconds * 1000 : null);
  if (!ts) return false;
  return (Date.now() - ts) < (14 * 24 * 60 * 60 * 1000); // 14 days
}

/* ───────────────── CARD BUILDER (shared by hero + grid) ───────────────── */

function buildProductCard(p) {

  const wished = (window._wishCache || []).includes(p.id);
  const soldOut = p.inStock === false;
  const title = escapeHtml(p.title || "Untitled");
  const img = escapeHtml(p.images?.[0] || "");

  let badge = "";
  if (p.popular) {
    badge = `<div class="card-badge badge-popular">Popular</div>`;
  } else if (isNewProduct(p)) {
    badge = `<div class="card-badge badge-new">New</div>`;
  }

  return `
    <div class="hero-card${soldOut ? " sold-out" : ""}" data-id="${p.id}">

      <div class="card-img-wrap">
        <img src="${img}"
             alt="${title}${p.supplierName ? " — " + escapeHtml(p.supplierName) : ""}"
             loading="lazy">
        ${badge}
        ${soldOut ? `<div class="sold-out-tag"><span>Sold Out</span></div>` : ""}
      </div>

      <div class="card-actions">

        <button class="wish-btn ${wished ? "wishlisted" : ""}"
          data-wish="${p.id}"
          data-wish-btn="${p.id}"
          aria-label="${wished ? "Remove from wishlist" : "Add to wishlist"}"
          aria-pressed="${wished}">
          ${wished ? "♥" : "♡"}
        </button>

        ${soldOut ? "" : `
        <button class="cart-btn"
          data-cart="${p.id}"
          aria-label="Add ${title} to cart">
          🛒
        </button>`}

      </div>

      <div class="dress-overlay">
        <div class="dress-overlay-name">
          ${title}
        </div>
        <div class="dress-overlay-price">
          $${fmtPrice(p.price)}
        </div>
        <div class="dress-overlay-delivery">Made to order · ships in 2–3 weeks</div>
      </div>

    </div>
  `;
}

/* ───────────────── HERO ───────────────── */

function renderHeroProducts() {

  const slider = $("#heroSlider");

  if (!slider) return;

  let items = PRODUCTS.filter(p =>
    p.categorySlugs.includes(HERO_FILTER)
  );

  if (!items.length) {
    slider.innerHTML =
      `<div class="empty-state">
        <span class="empty-icon">✦</span>
        No new fashion products yet. Check back soon.
      </div>`;
    return;
  }

  slider.innerHTML = items.map(buildProductCard).join("");
}

/* ───────────────── GRID ───────────────── */

function renderGridProducts() {

  const grid = $("#productsGrid");

  if (!grid) return;

  let items = PRODUCTS.filter(p =>
    p.categorySlugs.includes(GRID_FILTER)
  );

  if (!items.length) {

    grid.innerHTML =
      `<div class="empty-state">
        <span class="empty-icon">✦</span>
        No products found in this category yet.
        <br>
        <a href="#" class="empty-action" data-main-cat="women">Browse Women's Collection</a>
      </div>`;

    return;
  }

  grid.innerHTML = items.map(buildProductCard).join("");
}

/* ───────────────── RELATED PRODUCTS ───────────────── */

function renderRelatedProducts(currentProduct) {

  const grid = $("#relatedProductsGrid");
  if (!grid) return;

  const cats = currentProduct.categorySlugs || normalizeCats(currentProduct.categoryId);

  let items = PRODUCTS
    .filter(p => p.id !== currentProduct.id && p.categorySlugs.some(c => cats.includes(c)))
    .slice(0, 4);

  if (!items.length) {
    items = PRODUCTS.filter(p => p.id !== currentProduct.id).slice(0, 4);
  }

  if (!items.length) {
    grid.innerHTML = `<div class="empty-state"><span class="empty-icon">✦</span>More arrivals coming soon.</div>`;
    return;
  }

  grid.innerHTML = items.map(buildProductCard).join("");
}

/* ───────────────── PRODUCT PAGE ───────────────── */

async function openProduct(id) {

  window.showPage("product");
  window.scrollTo(0, 0);

  // Reset to loading state so stale data from a previous product never lingers
  const set = (sel, val) => {
    const el = $(sel);
    if (el) el.textContent = val;
  };
  set(".product-name", "Loading…");
  set("#productBreadName", "Loading…");

  let snap;
  try {
    snap = await getDoc(doc(db, "products", id));
  } catch (err) {
    set(".product-name", "Couldn't load this product");
    const desc = $("#productDescription");
    if (desc) desc.innerHTML = `<p class="error-state" style="padding:0;text-align:left;">Something went wrong loading this item. Please try again.</p>`;
    return;
  }

  if (!snap.exists()) {
    set(".product-name", "Product not found");
    const desc = $("#productDescription");
    if (desc) desc.innerHTML = `<p class="error-state" style="padding:0;text-align:left;">This dress may have been removed or sold out. <a href="#" onclick="showPage('home');goScrollTo('dresses');return false;">Browse the collection →</a></p>`;
    return;
  }

  await fetchProducts(); // ensure PRODUCTS/ARTISANS are populated for related items

  const raw = snap.data();
  const artisan = ARTISANS[raw.artisanId] || {};

  const p = {
    id,
    ...raw,
    categorySlugs: normalizeCats(raw.categoryId),
    supplierName: artisan.brandName || "Tilf Artisan",
    depositAmount: raw.depositAmount || parseFloat((raw.price * 0.15).toFixed(2))
  };

  set(".product-name", p.title || "Untitled");
  set("#productBreadName", p.title || "");
  set(".product-price-main", `$${fmtPrice(p.price)}`);
  set(".deposit-box-amount", `$${fmtPrice(p.depositAmount)}`);
  set("#mobileBuyAmount", `$${fmtPrice(p.depositAmount)}`);

  const supplierNameEl = $(".supplier-name-small");
  if (supplierNameEl) supplierNameEl.textContent = p.supplierName;

  const hero = $(".product-main-img");

  if (hero) {
    hero.innerHTML = `
      <img
        id="mainProductImage"
        src="${escapeHtml(p.images?.[0] || "")}"
        alt="${escapeHtml(p.title || "")}">
      `;
  }

  const gallery = $("#productGallery");

  if (gallery) {

    gallery.innerHTML = "";

    (p.images || []).slice(1).forEach(img => {

      gallery.innerHTML += `
        <div class="product-thumb">
          <img src="${escapeHtml(img)}" alt="${escapeHtml(p.title || "")} — additional view" loading="lazy">
        </div>
      `;
    });
  }

  const desc = $("#productDescription");

  if (desc) {
    desc.innerHTML = `<p>${escapeHtml(p.description || "")}</p>`;
  }

  window._currentProduct = p;

  renderRelatedProducts(p);
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
document.addEventListener("click", (e) => {

  const thumb =
    e.target.closest(".product-thumb img");

  if (!thumb) return;

  const main =
    document.getElementById("mainProductImage");

  if (!main) return;

  main.src = thumb.src;
});

/* ───────────────── INIT ───────────────── */

(async function initShop() {

  await fetchProducts();

  renderHeroProducts();

  renderGridProducts();


})();
