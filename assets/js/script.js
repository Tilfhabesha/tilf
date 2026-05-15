import { auth, createUserWithEmailAndPassword } from "./firebase.js";

function showPage(id) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const page = document.getElementById(id);
  if (page) {
    page.classList.add('active');
    window.scrollTo(0,0);
  }
}

function scrollTo(id) {
  setTimeout(() => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  }, 100);
}

function openModal() {
  document.getElementById('modal').classList.add('open');
}
   window.signup = async function(email, password){
     await
  createUserWithEmailAndPassword(auth, email, password);
  alert("Welcome to Tilf Habesha!");
};
function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

function showTracking() {
  const val = document.getElementById('trackInput').value.trim();
  const res = document.getElementById('trackResult');
  if (val) {
    res.style.display = 'block';
    res.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  }
}

// Filter buttons
document.querySelectorAll('.filter-btn').forEach(btn => {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
    this.classList.add('active');
  });
});

// Thumbnail selection
document.querySelectorAll('.product-thumb').forEach(thumb => {
  thumb.addEventListener('click', function() {
    document.querySelectorAll('.product-thumb').forEach(t => t.classList.remove('active'));
    this.classList.add('active');
  });
});

// Close modal on overlay click
document.getElementById('modal').addEventListener('click', function(e) {
  if (e.target === this) closeModal();
});

function addToCart(id){
  let cart = JSON.parse(localStorage.getItem("cart")) || [];
  cart.push(id);
  localStorage.setItem("cart", JSON.stringify(cart));
  alert("Added to cart");
}
