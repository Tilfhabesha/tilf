import {
  getDocs, collection, doc, getDoc, addDoc
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";
import { db } from "./firebase.js";

const grid = document.getElementById("productsGrid");

// LOAD PRODUCTS
export async function loadProducts() {
  const snap = await getDocs(collection(db, "products"));
  grid.innerHTML = "";

  snap.forEach(d => {
    const p = d.data();

    grid.innerHTML += `
      <div class="cloth-card" onclick="openProduct('${d.id}')">
        <img src="${p.images[0]}" />
        <h3>${p.name}</h3>
        <p>${p.price} ETB • ${p.deliveryDays} days</p>
      </div>
    `;
  });
}

window.openProduct = async function(id){
  showPage('product');

  const snap = await getDoc(doc(db, "products", id));
  const p = snap.data();
  window.currentProductId = id;

  document.getElementById("mainProductImg").src = p.images[0];

  const thumbRow = document.getElementById("thumbRow");
  thumbRow.innerHTML = "";
  p.images.forEach(img => {
    thumbRow.innerHTML += `
      <img src="${img}" class="product-thumb"
      onclick="mainProductImg.src='${img}'">
    `;
  });

  document.getElementById("pName").innerText = p.name;
  document.getElementById("pPrice").innerText = p.price + " ETB";
  document.getElementById("pDelivery").innerText =
    "Minimum delivery: " + p.deliveryDays + " days";
};

// ORDER
window.submitOrder = async function () {
  const order = {
    productId: window.currentProductId,
    shoulder: shoulder.value,
    bust: bust.value,
    waist: waist.value,
    shoulderToWaist: stw.value,
    address: address.value,
    status: "stitching",
    depositPaid: true,
    createdAt: new Date()
  };

  await addDoc(collection(db, "orders"), order);
  alert("Order placed! We will start stitching.");
};

loadProducts();