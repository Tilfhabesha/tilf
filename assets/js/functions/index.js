const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onDocumentCreated } = require("firebase-functions/v2/firestore");
const admin = require("firebase-admin");
const stripe = require("stripe")("sk_test_YOUR_STRIPE_SECRET_KEY"); // Replace with actual key

admin.initializeApp();
const db = admin.firestore();

// 1. STRIPE DEPOSIT SESSION
exports.createDepositSession = onCall(async (request) => {
  const { productId, measurements, address, customerId } = request.data;
  const uid = request.auth?.uid;

  if (!uid || uid !== customerId) {
    throw new HttpsError("unauthenticated", "User must be logged in.");
  }

  // Fetch product to ensure price hasn't been tampered with on client side
  const productSnap = await db.collection("products").doc(productId).get();
  if (!productSnap.exists) {
    throw new HttpsError("not-found", "Product no longer available.");
  }
  
  const productData = productSnap.data();
  const depositAmount = productData.depositAmount || (productData.price * 0.15);

  // Generate an internal order ID for tracking
  const orderRef = db.collection("orders").doc();
  const trackingId = `TH-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;

  // Create Stripe Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ["card"],
    customer_email: address.email,
    line_items: [
      {
        price_data: {
          currency: "usd",
          product_data: {
            name: `${productData.title} (15% Deposit)`,
            images: productData.images?.length ? [productData.images[0]] : [],
          },
          unit_amount: Math.round(depositAmount * 100), // Stripe uses cents
        },
        quantity: 1,
      },
    ],
    mode: "payment",
    success_url: `https://your-domain.com/?order=${orderRef.id}`, // Update with actual domain
    cancel_url: `https://your-domain.com/`,
    metadata: {
      orderId: orderRef.id,
      trackingId: trackingId
    }
  });

  // Pre-create the order document in "pending" status
  await orderRef.set({
    trackingId,
    customerId: uid,
    productId,
    artisanId: productData.artisanId || null,
    status: "pending",
    measurements,
    shippingAddress: address,
    payment: {
      depositPaid: false, // Webhook will set this to true
      total: productData.price,
      stripeSessionId: session.id
    },
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });

  return { url: session.url };
});

// 2. AUTO-SYNC USER DOC ON AUTH CREATION
// If they sign in via Google, ensure the database document exists
const { beforeUserCreated } = require("firebase-functions/v2/identity");

exports.syncNewUser = beforeUserCreated(async (event) => {
  const user = event.data;
  
  await db.collection("users").doc(user.uid).set({
    email: user.email,
    displayName: user.displayName || '',
    photoURL: user.photoURL || '',
    phone: user.phoneNumber || '',
    role: 'customer',
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    defaultMeasurements: { shoulder: 0, bust: 0, waist: 0, hip: 0, length: 0, arm: 0 },
    defaultAddress: { street: '', city: '', subcity: '', country: '', note: '' }
  }, { merge: true });
});
