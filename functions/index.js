const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Initialize Firebase Admin
admin.initializeApp();

// Stripe setup - Use environment variables in production
// Set with: firebase functions:config:set stripe.secret_key="sk_live_..."
const stripe = require('stripe')(
  functions.config().stripe?.secret_key || 'sk_test_51ScLeeJaljqVA3ADvCWSrpvAfxZBwtMakgZazEUOLi0PIfWDHPrGSeQU3KmBqxAh8qHHp0O8doTynVLV5PZJsn1R00VRVBF7Z7'
);

/**
 * Create a PaymentIntent for Stripe Terminal
 * Called when staff clicks "Pay" in the POS
 */
exports.createPaymentIntent = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { amount, currency = 'usd', description, metadata } = req.body;

      if (!amount || amount < 50) {
        return res.status(400).json({ error: 'Amount must be at least 50 cents' });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount), // Amount in cents
        currency: currency,
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        description: description || 'Golf Cove POS Purchase',
        metadata: {
          source: 'golf_cove_pos',
          ...metadata
        }
      });

      res.json({
        clientSecret: paymentIntent.client_secret,
        paymentIntentId: paymentIntent.id
      });
    } catch (error) {
      console.error('Error creating payment intent:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Capture a PaymentIntent after card is presented
 */
exports.capturePayment = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { paymentIntentId } = req.body;

      if (!paymentIntentId) {
        return res.status(400).json({ error: 'Payment intent ID required' });
      }

      const paymentIntent = await stripe.paymentIntents.capture(paymentIntentId);

      res.json({
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        id: paymentIntent.id
      });
    } catch (error) {
      console.error('Error capturing payment:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Cancel a PaymentIntent
 */
exports.cancelPayment = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { paymentIntentId } = req.body;

      if (!paymentIntentId) {
        return res.status(400).json({ error: 'Payment intent ID required' });
      }

      const paymentIntent = await stripe.paymentIntents.cancel(paymentIntentId);

      res.json({
        status: paymentIntent.status,
        id: paymentIntent.id
      });
    } catch (error) {
      console.error('Error canceling payment:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Create a connection token for Stripe Terminal SDK
 */
exports.createConnectionToken = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const connectionToken = await stripe.terminal.connectionTokens.create();
      res.json({ secret: connectionToken.secret });
    } catch (error) {
      console.error('Error creating connection token:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Register a new Terminal reader
 */
exports.registerReader = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { registrationCode, label, locationId } = req.body;

      if (!registrationCode) {
        return res.status(400).json({ error: 'Registration code required' });
      }

      // Create or get location
      let location = locationId;
      if (!location) {
        // Create a default location if none provided
        const locations = await stripe.terminal.locations.list({ limit: 1 });
        if (locations.data.length > 0) {
          location = locations.data[0].id;
        } else {
          const newLocation = await stripe.terminal.locations.create({
            display_name: 'Golf Cove Bar',
            address: {
              line1: '336 State Street',
              city: 'North Haven',
              state: 'CT',
              postal_code: '06473',
              country: 'US'
            }
          });
          location = newLocation.id;
        }
      }

      const reader = await stripe.terminal.readers.create({
        registration_code: registrationCode,
        label: label || 'Golf Cove Reader',
        location: location
      });

      res.json({
        readerId: reader.id,
        label: reader.label,
        status: reader.status
      });
    } catch (error) {
      console.error('Error registering reader:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * List all registered readers
 */
exports.listReaders = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const readers = await stripe.terminal.readers.list({ limit: 10 });
      res.json({
        readers: readers.data.map(r => ({
          id: r.id,
          label: r.label,
          status: r.status,
          deviceType: r.device_type,
          serialNumber: r.serial_number
        }))
      });
    } catch (error) {
      console.error('Error listing readers:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Process payment on a specific reader (Server-driven integration)
 */
exports.processPaymentOnReader = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { readerId, paymentIntentId } = req.body;

      if (!readerId || !paymentIntentId) {
        return res.status(400).json({ error: 'Reader ID and Payment Intent ID required' });
      }

      const reader = await stripe.terminal.readers.processPaymentIntent(
        readerId,
        { payment_intent: paymentIntentId }
      );

      res.json({
        readerId: reader.id,
        status: reader.action?.status,
        paymentIntent: reader.action?.process_payment_intent?.payment_intent
      });
    } catch (error) {
      console.error('Error processing payment on reader:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Issue a refund
 */
exports.createRefund = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { paymentIntentId, amount, reason } = req.body;

      if (!paymentIntentId) {
        return res.status(400).json({ error: 'Payment intent ID required' });
      }

      const refundParams = {
        payment_intent: paymentIntentId,
        reason: reason || 'requested_by_customer'
      };

      // Partial refund if amount specified
      if (amount) {
        refundParams.amount = Math.round(amount);
      }

      const refund = await stripe.refunds.create(refundParams);

      res.json({
        refundId: refund.id,
        status: refund.status,
        amount: refund.amount
      });
    } catch (error) {
      console.error('Error creating refund:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get payment status
 */
exports.getPaymentStatus = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { paymentIntentId } = req.query;

      if (!paymentIntentId) {
        return res.status(400).json({ error: 'Payment intent ID required' });
      }

      const paymentIntent = await stripe.paymentIntents.retrieve(paymentIntentId);

      res.json({
        id: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount,
        currency: paymentIntent.currency,
        created: paymentIntent.created
      });
    } catch (error) {
      console.error('Error getting payment status:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================
// STRIPE CHECKOUT - ONLINE PAYMENTS
// ============================================================

// Membership pricing in cents
const MEMBERSHIP_PRICES = {
  par: { monthly: 2999, annual: 29900 },
  'par-family': { monthly: 4999, annual: 49900 },
  birdie: { monthly: 4999, annual: 49900 },
  'birdie-family': { monthly: 7999, annual: 79900 },
  eagle: { monthly: 7999, annual: 79900 },
  'eagle-family': { monthly: 11999, annual: 119900 }
};

/**
 * Create checkout session for bay booking deposit
 */
exports.createBookingCheckout = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const {
        roomId, date, time, duration,
        customerName, customerEmail, customerPhone,
        guests, memberType, totalPrice, depositAmount,
        successUrl, cancelUrl
      } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: customerEmail,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Bay ${roomId} Reservation`,
              description: `${date} at ${time} (${duration} hour${duration > 1 ? 's' : ''})`
            },
            unit_amount: Math.round(depositAmount * 100)
          },
          quantity: 1
        }],
        metadata: {
          type: 'booking',
          roomId, date, time,
          duration: String(duration),
          customerName, customerPhone,
          guests: String(guests),
          memberType: memberType || '',
          totalPrice: String(totalPrice),
          depositAmount: String(depositAmount)
        },
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error('Booking checkout error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Create checkout session for gift card purchase
 */
exports.createGiftCardCheckout = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const {
        amount, purchaserName, purchaserEmail,
        recipientName, recipientEmail, message,
        deliveryDate, successUrl, cancelUrl
      } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: purchaserEmail,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: 'Golf Cove Gift Card',
              description: recipientName ? `Gift for ${recipientName}` : 'Digital Gift Card'
            },
            unit_amount: Math.round(amount * 100)
          },
          quantity: 1
        }],
        metadata: {
          type: 'gift_card',
          amount: String(amount),
          purchaserName, purchaserEmail,
          recipientName: recipientName || '',
          recipientEmail: recipientEmail || '',
          message: message || '',
          deliveryDate: deliveryDate || ''
        },
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error('Gift card checkout error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Create checkout session for membership (supports subscriptions)
 */
exports.createMembershipCheckout = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const {
        tier, isFamily, customerName, customerEmail,
        customerPhone, billingCycle, successUrl, cancelUrl
      } = req.body;

      const membershipKey = isFamily ? `${tier}-family` : tier;
      const pricing = MEMBERSHIP_PRICES[membershipKey];

      if (!pricing) {
        return res.status(400).json({ error: 'Invalid membership tier' });
      }

      const amount = billingCycle === 'annual' ? pricing.annual : pricing.monthly;
      const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);

      const sessionConfig = {
        payment_method_types: ['card'],
        mode: billingCycle === 'annual' ? 'payment' : 'subscription',
        customer_email: customerEmail,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `${tierName}${isFamily ? ' Family' : ''} Membership`,
              description: billingCycle === 'annual' 
                ? 'Annual membership - Save 2 months!' 
                : 'Monthly membership'
            },
            unit_amount: amount,
            ...(billingCycle === 'monthly' && { recurring: { interval: 'month' } })
          },
          quantity: 1
        }],
        metadata: {
          type: 'membership',
          tier,
          isFamily: String(isFamily),
          customerName, customerPhone,
          billingCycle
        },
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl
      };

      if (billingCycle === 'monthly') {
        sessionConfig.subscription_data = {
          metadata: { tier, isFamily: String(isFamily), customerName }
        };
      }

      const session = await stripe.checkout.sessions.create(sessionConfig);
      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error('Membership checkout error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Create checkout for private event deposit
 */
exports.createEventCheckout = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const {
        eventType, date, startTime, endTime, guestCount,
        customerName, customerEmail, customerPhone,
        specialRequests, depositAmount, successUrl, cancelUrl
      } = req.body;

      const session = await stripe.checkout.sessions.create({
        payment_method_types: ['card'],
        mode: 'payment',
        customer_email: customerEmail,
        line_items: [{
          price_data: {
            currency: 'usd',
            product_data: {
              name: `Private Event Deposit - ${eventType}`,
              description: `${date} from ${startTime} to ${endTime} (${guestCount} guests)`
            },
            unit_amount: Math.round(depositAmount * 100)
          },
          quantity: 1
        }],
        metadata: {
          type: 'event',
          eventType, date, startTime, endTime,
          guestCount: String(guestCount),
          customerName, customerPhone,
          specialRequests: specialRequests || ''
        },
        success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: cancelUrl
      });

      res.json({ sessionId: session.id, url: session.url });
    } catch (error) {
      console.error('Event checkout error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Verify payment status after redirect
 */
exports.verifyPayment = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { sessionId } = req.body;
      const session = await stripe.checkout.sessions.retrieve(sessionId);

      res.json({
        status: session.payment_status,
        customerEmail: session.customer_email,
        amountTotal: session.amount_total,
        metadata: session.metadata
      });
    } catch (error) {
      console.error('Verify payment error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Stripe Webhook handler for checkout events
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const endpointSecret = functions.config().stripe?.webhook_secret;

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
  } catch (err) {
    console.error('Webhook signature failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const db = admin.firestore();

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      const meta = session.metadata;

      // Handle based on payment type
      if (meta.type === 'booking') {
        await db.collection('bookings').add({
          ...meta,
          customerEmail: session.customer_email,
          depositPaid: session.amount_total / 100,
          stripeSessionId: session.id,
          status: 'confirmed',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else if (meta.type === 'gift_card') {
        const code = 'GC-' + Math.random().toString(36).substr(2, 4).toUpperCase() + '-' + 
                     Math.random().toString(36).substr(2, 4).toUpperCase();
        await db.collection('gift_cards').add({
          code,
          amount: parseFloat(meta.amount),
          balance: parseFloat(meta.amount),
          purchaserEmail: meta.purchaserEmail,
          recipientEmail: meta.recipientEmail || null,
          stripeSessionId: session.id,
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else if (meta.type === 'membership') {
        await db.collection('memberships').add({
          ...meta,
          customerEmail: session.customer_email,
          stripeSessionId: session.id,
          status: 'active',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      } else if (meta.type === 'event') {
        await db.collection('events').add({
          ...meta,
          customerEmail: session.customer_email,
          depositPaid: session.amount_total / 100,
          stripeSessionId: session.id,
          status: 'deposit_paid',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      break;

    case 'customer.subscription.deleted':
      // Handle membership cancellation
      console.log('Subscription cancelled:', event.data.object.id);
      break;
  }

  res.json({ received: true });
});

/**
 * Create customer portal session (for managing subscriptions)
 */
exports.createPortalSession = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { customerId, returnUrl } = req.body;

      const session = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: returnUrl || 'https://golfcove.web.app/memberships.html'
      });

      res.json({ url: session.url });
    } catch (error) {
      console.error('Portal session error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================
// EMAIL NOTIFICATIONS
// ============================================================

/**
 * Send booking confirmation email
 * Uses Firebase's built-in email (requires Email extension or SMTP setup)
 */
exports.sendBookingConfirmation = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { booking } = req.body;
      
      if (!booking || !booking.email) {
        return res.status(400).json({ error: 'Booking with email required' });
      }

      const db = admin.firestore();
      
      // Format the date nicely
      const dateStr = new Date(booking.date).toLocaleDateString('en-US', { 
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' 
      });

      // Store email in Firestore mail collection (requires Firebase Trigger Email extension)
      // Install from: https://extensions.dev/extensions/firebase/firestore-send-email
      await db.collection('mail').add({
        to: booking.email,
        message: {
          subject: 'Golf Cove Booking Confirmation',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <div style="background: #4a90a4; color: white; padding: 20px; text-align: center;">
                <h1 style="margin: 0;">Golf Cove</h1>
                <p style="margin: 5px 0 0;">Indoor Golf & Bar</p>
              </div>
              
              <div style="padding: 30px; background: #f8f9fa;">
                <h2 style="color: #2c3e50; margin-top: 0;">Booking Confirmed! ✓</h2>
                <p>Hi ${booking.customer},</p>
                <p>Your booking at Golf Cove is confirmed!</p>
                
                <div style="background: white; padding: 20px; border-radius: 8px; margin: 20px 0;">
                  <h3 style="margin-top: 0; color: #4a90a4;">Reservation Details</h3>
                  <table style="width: 100%; border-collapse: collapse;">
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Bay:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">Bay ${booking.room}</td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Date:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${dateStr}</td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Time:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${booking.time}</td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Duration:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${booking.duration} hour(s)</td></tr>
                    <tr><td style="padding: 8px 0; border-bottom: 1px solid #eee;"><strong>Players:</strong></td><td style="padding: 8px 0; border-bottom: 1px solid #eee;">${booking.players}</td></tr>
                    <tr><td style="padding: 8px 0;"><strong>Total:</strong></td><td style="padding: 8px 0; font-size: 18px; color: #27ae60;">$${(booking.price || 0).toFixed(2)}</td></tr>
                  </table>
                </div>
                
                <p style="color: #666; font-size: 14px;">Need to cancel or reschedule? Reply to this email or call us at (203) 390-5994.</p>
              </div>
              
              <div style="background: #2c3e50; color: white; padding: 20px; text-align: center; font-size: 12px;">
                <p style="margin: 0;">336 State Street, North Haven, CT 06473</p>
                <p style="margin: 5px 0 0;">www.golfcovect.com | (203) 390-5994</p>
              </div>
            </div>
          `
        }
      });

      res.json({ success: true, message: 'Confirmation email queued' });
    } catch (error) {
      console.error('Email error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================
// FIRESTORE DATA SYNC
// ============================================================

/**
 * Sync customers to Firestore
 */
exports.syncCustomers = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { customers, storeId = 'golfcove' } = req.body;
      const db = admin.firestore();
      const batch = db.batch();
      
      for (const customer of customers) {
        const docRef = db.collection('stores').doc(storeId).collection('customers').doc(customer.id || customer.phone || String(Date.now()));
        batch.set(docRef, {
          ...customer,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      
      await batch.commit();
      res.json({ success: true, count: customers.length });
    } catch (error) {
      console.error('Sync customers error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get customers from Firestore
 */
exports.getCustomers = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { storeId = 'golfcove' } = req.query;
      const db = admin.firestore();
      
      const snapshot = await db.collection('stores').doc(storeId).collection('customers').get();
      const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      res.json({ customers });
    } catch (error) {
      console.error('Get customers error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Sync bookings to Firestore
 */
exports.syncBookings = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { bookings, storeId = 'golfcove' } = req.body;
      const db = admin.firestore();
      const batch = db.batch();
      
      for (const booking of bookings) {
        const docRef = db.collection('stores').doc(storeId).collection('bookings').doc(booking.id || String(Date.now()));
        batch.set(docRef, {
          ...booking,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      
      await batch.commit();
      res.json({ success: true, count: bookings.length });
    } catch (error) {
      console.error('Sync bookings error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get bookings from Firestore (with optional date filter)
 */
exports.getBookings = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { storeId = 'golfcove', date } = req.query;
      const db = admin.firestore();
      
      let query = db.collection('stores').doc(storeId).collection('bookings');
      
      if (date) {
        query = query.where('date', '==', date);
      }
      
      const snapshot = await query.get();
      const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      res.json({ bookings });
    } catch (error) {
      console.error('Get bookings error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Sync transactions to Firestore
 */
exports.syncTransactions = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { transactions, storeId = 'golfcove' } = req.body;
      const db = admin.firestore();
      const batch = db.batch();
      
      for (const transaction of transactions) {
        const docRef = db.collection('stores').doc(storeId).collection('transactions').doc(transaction.id || String(Date.now()));
        batch.set(docRef, {
          ...transaction,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
      }
      
      await batch.commit();
      res.json({ success: true, count: transactions.length });
    } catch (error) {
      console.error('Sync transactions error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get transactions from Firestore (with optional date filter)
 */
exports.getTransactions = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { storeId = 'golfcove', startDate, endDate } = req.query;
      const db = admin.firestore();
      
      let query = db.collection('stores').doc(storeId).collection('transactions');
      
      if (startDate) {
        query = query.where('date', '>=', startDate);
      }
      if (endDate) {
        query = query.where('date', '<=', endDate);
      }
      
      const snapshot = await query.orderBy('date', 'desc').limit(500).get();
      const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      res.json({ transactions });
    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Full data sync - uploads all POS data to Firestore
 */
exports.fullSync = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { data, storeId = 'golfcove' } = req.body;
      const db = admin.firestore();
      
      // Store metadata
      await db.collection('stores').doc(storeId).set({
        lastSync: admin.firestore.FieldValue.serverTimestamp(),
        settings: data.settings || {}
      }, { merge: true });
      
      // Sync each collection
      const results = {};
      
      if (data.customers?.length) {
        const batch = db.batch();
        for (const item of data.customers) {
          const docRef = db.collection('stores').doc(storeId).collection('customers').doc(item.id || item.phone || String(Date.now() + Math.random()));
          batch.set(docRef, { ...item, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
        await batch.commit();
        results.customers = data.customers.length;
      }
      
      if (data.bookings?.length) {
        const batch = db.batch();
        for (const item of data.bookings) {
          const docRef = db.collection('stores').doc(storeId).collection('bookings').doc(item.id || String(Date.now() + Math.random()));
          batch.set(docRef, { ...item, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
        await batch.commit();
        results.bookings = data.bookings.length;
      }
      
      if (data.transactions?.length) {
        const batch = db.batch();
        for (const item of data.transactions) {
          const docRef = db.collection('stores').doc(storeId).collection('transactions').doc(item.id || String(Date.now() + Math.random()));
          batch.set(docRef, { ...item, updatedAt: admin.firestore.FieldValue.serverTimestamp() }, { merge: true });
        }
        await batch.commit();
        results.transactions = data.transactions.length;
      }
      
      res.json({ success: true, synced: results });
    } catch (error) {
      console.error('Full sync error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Full data pull - downloads all POS data from Firestore
 */
exports.fullPull = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { storeId = 'golfcove' } = req.query;
      const db = admin.firestore();
      
      const storeDoc = await db.collection('stores').doc(storeId).get();
      const storeData = storeDoc.exists ? storeDoc.data() : {};
      
      const [customersSnap, bookingsSnap, transactionsSnap] = await Promise.all([
        db.collection('stores').doc(storeId).collection('customers').get(),
        db.collection('stores').doc(storeId).collection('bookings').get(),
        db.collection('stores').doc(storeId).collection('transactions').orderBy('date', 'desc').limit(1000).get()
      ]);
      
      res.json({
        settings: storeData.settings || {},
        lastSync: storeData.lastSync,
        customers: customersSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        bookings: bookingsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() })),
        transactions: transactionsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }))
      });
    } catch (error) {
      console.error('Full pull error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============================================================
// FOREUP-STYLE RESTFUL APIS
// ============================================================

/**
 * Cart API - Manages POS cart operations
 * Similar to foreUP's /api/cart endpoint
 */
exports.cart = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const db = admin.firestore();
    const { storeId = 'golfcove' } = req.query;
    
    try {
      switch (req.method) {
        case 'GET': {
          // Get cart by ID or session
          const { cartId, sessionId } = req.query;
          if (!cartId && !sessionId) {
            return res.status(400).json({ error: 'Cart ID or session ID required' });
          }
          
          const cartRef = cartId 
            ? db.collection('stores').doc(storeId).collection('carts').doc(cartId)
            : db.collection('stores').doc(storeId).collection('carts').where('sessionId', '==', sessionId).limit(1);
          
          const snap = cartId ? await cartRef.get() : await cartRef.get();
          const cart = cartId ? (snap.exists ? { id: snap.id, ...snap.data() } : null) : (snap.docs[0] ? { id: snap.docs[0].id, ...snap.docs[0].data() } : null);
          
          res.json({ cart });
          break;
        }
        
        case 'POST': {
          // Create new cart
          const { items = [], customerId, employeeId, terminalId } = req.body;
          
          const cart = {
            items,
            customerId: customerId || null,
            employeeId: employeeId || null,
            terminalId: terminalId || null,
            subtotal: items.reduce((sum, i) => sum + (i.price * i.qty), 0),
            status: 'open',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          const docRef = await db.collection('stores').doc(storeId).collection('carts').add(cart);
          res.json({ cartId: docRef.id, cart: { id: docRef.id, ...cart } });
          break;
        }
        
        case 'PUT': {
          // Update cart (add/remove items)
          const { cartId } = req.query;
          const { items, customerId, discount, discountType } = req.body;
          
          if (!cartId) {
            return res.status(400).json({ error: 'Cart ID required' });
          }
          
          const updates = { updatedAt: admin.firestore.FieldValue.serverTimestamp() };
          if (items !== undefined) {
            updates.items = items;
            updates.subtotal = items.reduce((sum, i) => sum + (i.price * i.qty), 0);
          }
          if (customerId !== undefined) updates.customerId = customerId;
          if (discount !== undefined) updates.discount = discount;
          if (discountType !== undefined) updates.discountType = discountType;
          
          await db.collection('stores').doc(storeId).collection('carts').doc(cartId).update(updates);
          res.json({ success: true, cartId });
          break;
        }
        
        case 'DELETE': {
          // Clear/delete cart
          const { cartId } = req.query;
          if (!cartId) {
            return res.status(400).json({ error: 'Cart ID required' });
          }
          
          await db.collection('stores').doc(storeId).collection('carts').doc(cartId).delete();
          res.json({ success: true });
          break;
        }
        
        default:
          res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      console.error('Cart API error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Sales API - Process and retrieve sales/transactions
 * Similar to foreUP's /api/sales endpoint
 */
exports.sales = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const db = admin.firestore();
    const { storeId = 'golfcove' } = req.query;
    
    try {
      switch (req.method) {
        case 'GET': {
          // Get sales with filters
          const { startDate, endDate, customerId, employeeId, limit = 100 } = req.query;
          
          let query = db.collection('stores').doc(storeId).collection('transactions');
          
          if (startDate) query = query.where('date', '>=', startDate);
          if (endDate) query = query.where('date', '<=', endDate);
          if (customerId) query = query.where('customerId', '==', customerId);
          if (employeeId) query = query.where('employeeId', '==', employeeId);
          
          const snap = await query.orderBy('date', 'desc').limit(parseInt(limit)).get();
          const sales = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          // Calculate summary
          const summary = {
            count: sales.length,
            total: sales.reduce((sum, s) => sum + (s.amount || 0), 0),
            byMethod: {}
          };
          sales.forEach(s => {
            summary.byMethod[s.method] = (summary.byMethod[s.method] || 0) + (s.amount || 0);
          });
          
          res.json({ sales, summary });
          break;
        }
        
        case 'POST': {
          // Create new sale/transaction
          const { 
            items, customerId, customerName, employeeId, employeeName,
            method, amount, tax, discount, discountType,
            stripePaymentId, terminalId, notes
          } = req.body;
          
          const saleId = 'TXN-' + Date.now();
          const sale = {
            id: saleId,
            items: items || [],
            customerId: customerId || null,
            customer: customerName || 'Walk-in',
            employeeId: employeeId || null,
            employee: employeeName || null,
            method: method || 'cash',
            amount: amount || 0,
            tax: tax || 0,
            discount: discount || 0,
            discountType: discountType || null,
            stripePaymentId: stripePaymentId || null,
            terminalId: terminalId || null,
            notes: notes || null,
            date: new Date().toISOString().split('T')[0],
            time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
            status: 'completed',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          await db.collection('stores').doc(storeId).collection('transactions').doc(saleId).set(sale);
          
          // Update customer stats if customerId provided
          if (customerId) {
            const customerRef = db.collection('stores').doc(storeId).collection('customers').doc(customerId);
            await customerRef.update({
              totalSpent: admin.firestore.FieldValue.increment(amount),
              visitCount: admin.firestore.FieldValue.increment(1),
              lastVisit: new Date().toISOString()
            });
          }
          
          res.json({ success: true, saleId, sale });
          break;
        }
        
        default:
          res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      console.error('Sales API error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Gift Cards API
 * Similar to foreUP's /api/giftcards endpoint
 */
exports.giftcards = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const db = admin.firestore();
    const { storeId = 'golfcove' } = req.query;
    
    try {
      switch (req.method) {
        case 'GET': {
          // Look up gift card by code
          const { code } = req.query;
          
          if (code) {
            // Single card lookup
            const snap = await db.collection('stores').doc(storeId).collection('gift_cards')
              .where('code', '==', code.toUpperCase())
              .limit(1)
              .get();
            
            if (snap.empty) {
              // Also check global gift_cards collection
              const globalSnap = await db.collection('gift_cards')
                .where('code', '==', code.toUpperCase())
                .limit(1)
                .get();
              
              if (globalSnap.empty) {
                return res.status(404).json({ error: 'Gift card not found' });
              }
              const card = { id: globalSnap.docs[0].id, ...globalSnap.docs[0].data() };
              return res.json({ giftCard: card });
            }
            
            const card = { id: snap.docs[0].id, ...snap.docs[0].data() };
            res.json({ giftCard: card });
          } else {
            // List all gift cards
            const snap = await db.collection('stores').doc(storeId).collection('gift_cards')
              .orderBy('createdAt', 'desc')
              .limit(100)
              .get();
            
            const giftCards = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json({ giftCards });
          }
          break;
        }
        
        case 'POST': {
          // Create new gift card
          const { amount, purchaserName, purchaserEmail, recipientName, recipientEmail } = req.body;
          
          const code = 'GC-' + Math.random().toString(36).substr(2, 4).toUpperCase() + '-' + 
                       Math.random().toString(36).substr(2, 4).toUpperCase();
          
          const giftCard = {
            code,
            amount: parseFloat(amount),
            balance: parseFloat(amount),
            purchaserName: purchaserName || null,
            purchaserEmail: purchaserEmail || null,
            recipientName: recipientName || null,
            recipientEmail: recipientEmail || null,
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          await db.collection('stores').doc(storeId).collection('gift_cards').add(giftCard);
          res.json({ success: true, giftCard: { ...giftCard, code } });
          break;
        }
        
        case 'PUT': {
          // Use gift card (deduct balance)
          const { code } = req.query;
          const { amount, transactionId } = req.body;
          
          if (!code || !amount) {
            return res.status(400).json({ error: 'Code and amount required' });
          }
          
          // Find the card
          let snap = await db.collection('stores').doc(storeId).collection('gift_cards')
            .where('code', '==', code.toUpperCase())
            .limit(1)
            .get();
          
          let collection = db.collection('stores').doc(storeId).collection('gift_cards');
          
          if (snap.empty) {
            // Check global collection
            snap = await db.collection('gift_cards')
              .where('code', '==', code.toUpperCase())
              .limit(1)
              .get();
            collection = db.collection('gift_cards');
            
            if (snap.empty) {
              return res.status(404).json({ error: 'Gift card not found' });
            }
          }
          
          const card = snap.docs[0];
          const cardData = card.data();
          
          if (cardData.balance < amount) {
            return res.status(400).json({ error: 'Insufficient balance', balance: cardData.balance });
          }
          
          const newBalance = cardData.balance - parseFloat(amount);
          await collection.doc(card.id).update({
            balance: newBalance,
            lastUsed: admin.firestore.FieldValue.serverTimestamp(),
            transactions: admin.firestore.FieldValue.arrayUnion({
              amount: parseFloat(amount),
              transactionId: transactionId || null,
              date: new Date().toISOString()
            })
          });
          
          res.json({ success: true, newBalance, amountCharged: parseFloat(amount) });
          break;
        }
        
        default:
          res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      console.error('Gift cards API error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Customers API - CRUD for customers
 * Similar to foreUP's /api/customers endpoint
 */
exports.customers = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const db = admin.firestore();
    const { storeId = 'golfcove' } = req.query;
    
    try {
      switch (req.method) {
        case 'GET': {
          const { customerId, email, phone, search } = req.query;
          
          if (customerId) {
            // Get single customer
            const doc = await db.collection('stores').doc(storeId).collection('customers').doc(customerId).get();
            if (!doc.exists) {
              return res.status(404).json({ error: 'Customer not found' });
            }
            res.json({ customer: { id: doc.id, ...doc.data() } });
          } else if (email) {
            // Find by email
            const snap = await db.collection('stores').doc(storeId).collection('customers')
              .where('email', '==', email.toLowerCase())
              .limit(1)
              .get();
            
            if (snap.empty) {
              return res.status(404).json({ error: 'Customer not found' });
            }
            res.json({ customer: { id: snap.docs[0].id, ...snap.docs[0].data() } });
          } else if (phone) {
            // Find by phone
            const snap = await db.collection('stores').doc(storeId).collection('customers')
              .where('phone', '==', phone)
              .limit(1)
              .get();
            
            if (snap.empty) {
              return res.status(404).json({ error: 'Customer not found' });
            }
            res.json({ customer: { id: snap.docs[0].id, ...snap.docs[0].data() } });
          } else {
            // List all customers
            const snap = await db.collection('stores').doc(storeId).collection('customers')
              .orderBy('lastName')
              .limit(500)
              .get();
            
            const customers = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json({ customers });
          }
          break;
        }
        
        case 'POST': {
          // Create new customer
          const { firstName, lastName, email, phone, membership, notes } = req.body;
          
          if (!firstName || !lastName) {
            return res.status(400).json({ error: 'First name and last name required' });
          }
          
          const customer = {
            firstName,
            lastName,
            email: email ? email.toLowerCase() : null,
            phone: phone || null,
            membership: membership || null,
            notes: notes || null,
            totalSpent: 0,
            visitCount: 0,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          const docRef = await db.collection('stores').doc(storeId).collection('customers').add(customer);
          res.json({ success: true, customerId: docRef.id, customer: { id: docRef.id, ...customer } });
          break;
        }
        
        case 'PUT': {
          // Update customer
          const { customerId } = req.query;
          const updates = req.body;
          
          if (!customerId) {
            return res.status(400).json({ error: 'Customer ID required' });
          }
          
          // Don't allow overwriting certain fields directly
          delete updates.id;
          delete updates.createdAt;
          updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          
          if (updates.email) updates.email = updates.email.toLowerCase();
          
          await db.collection('stores').doc(storeId).collection('customers').doc(customerId).update(updates);
          res.json({ success: true, customerId });
          break;
        }
        
        case 'DELETE': {
          const { customerId } = req.query;
          
          if (!customerId) {
            return res.status(400).json({ error: 'Customer ID required' });
          }
          
          await db.collection('stores').doc(storeId).collection('customers').doc(customerId).delete();
          res.json({ success: true });
          break;
        }
        
        default:
          res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      console.error('Customers API error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Items/Products API - Manage POS items
 * Similar to foreUP's /api/items endpoint
 */
exports.items = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const db = admin.firestore();
    const { storeId = 'golfcove' } = req.query;
    
    try {
      switch (req.method) {
        case 'GET': {
          const { category, itemId } = req.query;
          
          if (itemId) {
            const doc = await db.collection('stores').doc(storeId).collection('items').doc(itemId).get();
            if (!doc.exists) {
              return res.status(404).json({ error: 'Item not found' });
            }
            res.json({ item: { id: doc.id, ...doc.data() } });
          } else {
            let query = db.collection('stores').doc(storeId).collection('items');
            
            if (category) {
              query = query.where('category', '==', category);
            }
            
            const snap = await query.orderBy('name').get();
            const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            res.json({ items });
          }
          break;
        }
        
        case 'POST': {
          const { name, price, category, sku, taxable = true, active = true } = req.body;
          
          if (!name || price === undefined) {
            return res.status(400).json({ error: 'Name and price required' });
          }
          
          const item = {
            name,
            price: parseFloat(price),
            category: category || 'general',
            sku: sku || null,
            taxable,
            active,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          const docRef = await db.collection('stores').doc(storeId).collection('items').add(item);
          res.json({ success: true, itemId: docRef.id, item: { id: docRef.id, ...item } });
          break;
        }
        
        case 'PUT': {
          const { itemId } = req.query;
          const updates = req.body;
          
          if (!itemId) {
            return res.status(400).json({ error: 'Item ID required' });
          }
          
          delete updates.id;
          delete updates.createdAt;
          updates.updatedAt = admin.firestore.FieldValue.serverTimestamp();
          
          await db.collection('stores').doc(storeId).collection('items').doc(itemId).update(updates);
          res.json({ success: true, itemId });
          break;
        }
        
        case 'DELETE': {
          const { itemId } = req.query;
          
          if (!itemId) {
            return res.status(400).json({ error: 'Item ID required' });
          }
          
          await db.collection('stores').doc(storeId).collection('items').doc(itemId).delete();
          res.json({ success: true });
          break;
        }
        
        default:
          res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      console.error('Items API error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Reports API - Generate sales reports
 * Similar to foreUP's /api/reports endpoint
 */
exports.reports = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const db = admin.firestore();
    const { storeId = 'golfcove', reportType = 'daily', startDate, endDate } = req.query;
    
    try {
      const start = startDate || new Date().toISOString().split('T')[0];
      const end = endDate || start;
      
      const snap = await db.collection('stores').doc(storeId).collection('transactions')
        .where('date', '>=', start)
        .where('date', '<=', end)
        .orderBy('date')
        .get();
      
      const transactions = snap.docs.map(doc => doc.data());
      
      // Calculate report data
      const report = {
        startDate: start,
        endDate: end,
        totalSales: transactions.reduce((sum, t) => sum + (t.amount || 0), 0),
        totalTransactions: transactions.length,
        averageTransaction: transactions.length > 0 ? transactions.reduce((sum, t) => sum + (t.amount || 0), 0) / transactions.length : 0,
        totalTax: transactions.reduce((sum, t) => sum + (t.tax || 0), 0),
        totalDiscount: transactions.reduce((sum, t) => sum + (t.discount || 0), 0),
        byPaymentMethod: {},
        byEmployee: {},
        byHour: {},
        topItems: {}
      };
      
      transactions.forEach(t => {
        // By payment method
        report.byPaymentMethod[t.method] = (report.byPaymentMethod[t.method] || 0) + (t.amount || 0);
        
        // By employee
        if (t.employee) {
          report.byEmployee[t.employee] = (report.byEmployee[t.employee] || 0) + (t.amount || 0);
        }
        
        // By hour
        if (t.time) {
          const hour = t.time.split(':')[0];
          report.byHour[hour] = (report.byHour[hour] || 0) + (t.amount || 0);
        }
        
        // Top items
        if (t.items) {
          t.items.forEach(item => {
            if (!report.topItems[item.name]) {
              report.topItems[item.name] = { qty: 0, revenue: 0 };
            }
            report.topItems[item.name].qty += item.qty || 1;
            report.topItems[item.name].revenue += (item.price || 0) * (item.qty || 1);
          });
        }
      });
      
      res.json({ report });
    } catch (error) {
      console.error('Reports API error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Tabs API - Manage open tabs across all POS terminals
 * Enables real-time tab sync between F&B and Sales
 */
exports.tabs = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const db = admin.firestore();
    const { storeId = 'golfcove' } = req.query;
    const tabsRef = db.collection('stores').doc(storeId).collection('tabs');
    
    try {
      switch (req.method) {
        case 'GET': {
          // Get all open tabs or a specific tab
          const { tabId, customerId, status = 'open' } = req.query;
          
          if (tabId) {
            const doc = await tabsRef.doc(tabId).get();
            if (!doc.exists) {
              return res.status(404).json({ error: 'Tab not found' });
            }
            return res.json({ tab: { id: doc.id, ...doc.data() } });
          }
          
          let query = tabsRef.where('status', '==', status);
          if (customerId) query = query.where('customerId', '==', customerId);
          
          const snap = await query.orderBy('openedAt', 'desc').get();
          const tabs = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          
          res.json({ tabs, count: tabs.length });
          break;
        }
        
        case 'POST': {
          // Create new tab or add items to existing tab
          const { action = 'create', tabId, customerId, customerName, items, employeeId, employeeName, notes, bayNumber } = req.body;
          
          if (action === 'addItems' && tabId) {
            // Add items to existing tab
            const tabDoc = await tabsRef.doc(tabId).get();
            if (!tabDoc.exists) {
              return res.status(404).json({ error: 'Tab not found' });
            }
            
            const tab = tabDoc.data();
            const newItems = [...(tab.items || []), ...(items || []).map(item => ({
              ...item,
              addedAt: new Date().toISOString(),
              addedBy: employeeName || 'Staff'
            }))];
            
            const itemsTotal = newItems.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
            
            await tabsRef.doc(tabId).update({
              items: newItems,
              subtotal: itemsTotal,
              total: itemsTotal * 1.0635, // With tax
              updatedAt: new Date().toISOString(),
              lastUpdatedBy: employeeName || 'Staff'
            });
            
            const updated = await tabsRef.doc(tabId).get();
            res.json({ success: true, tab: { id: updated.id, ...updated.data() } });
            break;
          }
          
          // Create new tab
          const newTabId = 'TAB-' + Date.now();
          const initialItems = (items || []).map(item => ({
            ...item,
            addedAt: new Date().toISOString(),
            addedBy: employeeName || 'Staff'
          }));
          const itemsTotal = initialItems.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
          
          const newTab = {
            id: newTabId,
            customerId: customerId || null,
            customer: customerName || 'Guest',
            items: initialItems,
            subtotal: itemsTotal,
            tax: itemsTotal * 0.0635,
            total: itemsTotal * 1.0635,
            status: 'open',
            openedAt: new Date().toISOString(),
            openedBy: employeeName || 'Staff',
            employeeId: employeeId || null,
            updatedAt: new Date().toISOString(),
            notes: notes || null,
            bayNumber: bayNumber || null,
            payments: []
          };
          
          await tabsRef.doc(newTabId).set(newTab);
          res.status(201).json({ success: true, tab: newTab });
          break;
        }
        
        case 'PUT': {
          // Update tab (close, void, add payment)
          const { tabId } = req.query;
          const { action, paymentMethod, paymentAmount, employeeName, notes, tip } = req.body;
          
          if (!tabId) {
            return res.status(400).json({ error: 'tabId required' });
          }
          
          const tabDoc = await tabsRef.doc(tabId).get();
          if (!tabDoc.exists) {
            return res.status(404).json({ error: 'Tab not found' });
          }
          
          const tab = tabDoc.data();
          
          if (action === 'close') {
            // Close the tab - create transaction and archive
            const transRef = db.collection('stores').doc(storeId).collection('transactions');
            const txnId = 'TXN-' + Date.now();
            
            await transRef.doc(txnId).set({
              id: txnId,
              tabId: tabId,
              customerId: tab.customerId,
              customer: tab.customer,
              items: tab.items,
              subtotal: tab.subtotal,
              tax: tab.tax,
              tip: tip || 0,
              total: (tab.total || 0) + (tip || 0),
              method: paymentMethod || 'card',
              payments: tab.payments || [],
              employee: employeeName || tab.openedBy,
              date: new Date().toISOString().split('T')[0],
              time: new Date().toTimeString().slice(0, 5),
              closedAt: new Date().toISOString()
            });
            
            await tabsRef.doc(tabId).update({
              status: 'closed',
              closedAt: new Date().toISOString(),
              closedBy: employeeName || 'Staff',
              finalTotal: (tab.total || 0) + (tip || 0),
              tip: tip || 0
            });
            
            res.json({ success: true, message: 'Tab closed', transactionId: txnId });
          } else if (action === 'void') {
            await tabsRef.doc(tabId).update({
              status: 'voided',
              voidedAt: new Date().toISOString(),
              voidedBy: employeeName || 'Staff',
              voidReason: notes || 'No reason provided'
            });
            res.json({ success: true, message: 'Tab voided' });
          } else if (action === 'addPayment') {
            // Partial payment
            const payments = [...(tab.payments || []), {
              method: paymentMethod,
              amount: paymentAmount,
              timestamp: new Date().toISOString(),
              employee: employeeName
            }];
            const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
            
            await tabsRef.doc(tabId).update({
              payments: payments,
              amountPaid: totalPaid,
              amountDue: (tab.total || 0) - totalPaid
            });
            res.json({ success: true, amountPaid: totalPaid, amountDue: (tab.total || 0) - totalPaid });
          } else if (action === 'removeItem') {
            const { itemIndex } = req.body;
            const newItems = [...tab.items];
            newItems.splice(itemIndex, 1);
            const itemsTotal = newItems.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
            
            await tabsRef.doc(tabId).update({
              items: newItems,
              subtotal: itemsTotal,
              total: itemsTotal * 1.0635,
              updatedAt: new Date().toISOString()
            });
            res.json({ success: true, items: newItems });
          } else {
            // Generic update
            await tabsRef.doc(tabId).update({
              ...req.body,
              updatedAt: new Date().toISOString()
            });
            res.json({ success: true });
          }
          break;
        }
        
        case 'DELETE': {
          const { tabId } = req.query;
          if (!tabId) {
            return res.status(400).json({ error: 'tabId required' });
          }
          await tabsRef.doc(tabId).delete();
          res.json({ success: true, message: 'Tab deleted' });
          break;
        }
        
        default:
          res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      console.error('Tabs API error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});