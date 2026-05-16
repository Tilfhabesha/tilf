import {
  collection, getDocs, doc, getDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

const grid = document.getElementById("productsGrid");

async function loadProducts(){
  const snap = await getDocs(collection(db,"products"));
  grid.innerHTML = "";

  snap.forEach(d=>{
    const p = d.data();

    grid.innerHTML += `
      <div class="dress-card fade-up" onclick="openProduct('${d.id}')">
        <div class="dress-card-img-wrap">
          <img src="${p.images[0]}" style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:6px;">
        </div>
        <div class="dress-card-body">
          <div class="dress-card-name">${p.name}</div>
          <div class="dress-card-footer">
            <div class="dress-price">$${p.priceUSD}</div>
            <div class="dress-delivery">◷ ${p.deliveryDays} days</div>
          </div>
        </div>
      </div>
    `;
  });
}

window.openProduct = async function(id){
  showPage('product');
  const snap = await getDoc(doc(db,"products",id));
  const p = snap.data();

  document.querySelector(".product-name").innerHTML =
    p.name.replace(" ", "<br><em>") + "</em>";

  document.querySelector(".product-price-main").innerText =
    "$" + p.priceUSD;

  const main = document.querySelector(".product-main-img");
  main.innerHTML = `<img src="${p.images[0]}"
     style="width:100%;aspect-ratio:3/4;object-fit:cover;border-radius:8px;">`;
};

loadProducts();
