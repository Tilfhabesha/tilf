const functions = require("firebase-functions");
const admin = require("firebase-admin");
// Replace with your actual Stripe Secret Key from the Stripe Dashboard
const stripe = require("stripe")(functions.config().stripe.secret);

admin.initializeApp();

/**
 * Creates a Secure Stripe Checkout Session for a 15% deposit.
 * This is called from the frontend handleDepositPayment() function.
 */
exports.createDepositSession = functions.https.onCall(async (data, context) => {
  // 1. Security Check: Must be logged in
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'You must be signed in to place an order.');
  }

  const { productId, measurements } = data;

  try {
    // 2. Fetch official product data from Firestore to prevent price tampering
    const productSnap = await admin.firestore().collection('products').doc(productId).get();
    
    if (!productSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'Product not found.');
    }

    const product = productSnap.data();
    const fullPrice = product.price; 
    const depositAmount = Math.round(fullPrice * 0.15 * 100); // 15% in cents

    // 3. Create Stripe Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product_data: {
            name: `Deposit: ${product.title}`,
            description: `15% down payment for custom stitched Habesha dress.`,
            images: [product.images[0]],
          },
          unit_amount: depositAmount,
        },
        quantity: 1,
      }],
      mode: 'payment',
      // Update these URLs to your live domain
      success_url: 'https://tilfhabesha.web.app/success?session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://tilfhabesha.web.app/shop',
      metadata: {
        userId: context.auth.uid,
        productId: productId,
        customerEmail: context.auth.token.email,
        measurements: JSON.stringify(measurements)
      }
    });

    return { url: session.url };

  } catch (error) {
    console.error("Stripe Error:", error);
    throw new functions.https.HttpsError('internal', 'Payment initialization failed.');
  }
});

/**
 * Webhook Listener: Triggered when Stripe confirms payment is successful.
 * This updates Firestore to create the official order.
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, functions.config().stripe.webhook_secret);
  } catch (err) {
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;

    // Create the order in your Firestore "orders" collection
    await admin.firestore().collection('orders').add({
      userId: session.metadata.userId,
      productId: session.metadata.productId,
      measurements: JSON.parse(session.metadata.measurements),
      amountPaid: session.amount_total / 100,
      status: 'deposit_paid',
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      stripeSessionId: session.id
    });
  }

  res.json({ received: true });
});
