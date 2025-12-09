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
