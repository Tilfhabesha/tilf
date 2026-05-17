const functions = require("firebase-functions");
const admin = require("firebase-admin");
const stripe = require("stripe")(functions.config().stripe.secret);

admin.initializeApp();

exports.createDepositSession = functions.https.onCall(async (data, context) => {
  // Ensure the user is logged in
  if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required.');

  const { productId, measurements } = data;
  
  // 1. Fetch official price from Firestore (do not trust price from frontend)
  const productDoc = await admin.firestore().collection('products').doc(productId).get();
  const productData = productDoc.data();
  
  // 2. Calculate 15% Deposit
  const depositAmount = Math.round(productData.price * 0.15 * 100); // Amount in cents

  // 3. Create Stripe Checkout Session
  const session = await stripe.checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [{
      price_data: {
        currency: 'usd',
        product_data: {
          name: `Deposit for ${productData.title}`,
          description: "15% custom stitching deposit",
        },
        unit_amount: depositAmount,
      },
      quantity: 1,
    }],
    mode: 'payment',
    success_url: 'https://your-site.web.app/success?session_id={CHECKOUT_SESSION_ID}',
    cancel_url: 'https://your-site.web.app/cancel',
    metadata: {
      userId: context.auth.uid,
      productId: productId,
      measurements: JSON.stringify(measurements)
    }
  });

  return { url: session.url };
});
