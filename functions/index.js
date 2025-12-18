const functions = require('firebase-functions');
const admin = require('firebase-admin');
const cors = require('cors')({ origin: true });

// Initialize Firebase Admin
admin.initializeApp();

// ============ CENTRALIZED CONFIG ============
// Tax rate - CT Sales Tax (update here to change across all backend operations)
const TAX_RATE = 0.0635;

// Allowed origins for CORS (add your production domain)
const ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://localhost:5000',
  'https://golfcove.web.app',
  'https://golfcove.firebaseapp.com'
];

// API key for basic auth (set via firebase functions:config:set api.key="your-api-key")
const API_KEY = functions.config().api?.key || 'gc-dev-key-2024';

// ============ SECURITY MIDDLEWARE ============
/**
 * Verify API key from request headers
 */
function verifyApiKey(req) {
  const apiKey = req.headers['x-api-key'] || req.headers['authorization']?.replace('Bearer ', '');
  if (!apiKey || apiKey !== API_KEY) {
    return { valid: false, error: 'Invalid or missing API key' };
  }
  return { valid: true };
}

/**
 * Verify Firebase Auth token (for authenticated requests)
 */
async function verifyAuthToken(req) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return { valid: false, error: 'Missing authorization header' };
  }
  
  const token = authHeader.split('Bearer ')[1];
  try {
    const decodedToken = await admin.auth().verifyIdToken(token);
    return { valid: true, uid: decodedToken.uid, email: decodedToken.email };
  } catch (error) {
    return { valid: false, error: 'Invalid auth token' };
  }
}

/**
 * Rate limiting with sliding window and cleanup
 * For production, use Redis or Firestore-based rate limiting
 */
const rateLimitStore = new Map();
const RATE_LIMIT_CLEANUP_INTERVAL = 60000; // 1 minute

// Periodic cleanup of expired entries to prevent memory leaks
setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of rateLimitStore.entries()) {
    if (now > entry.resetAt + 60000) { // 1 min after expiry
      rateLimitStore.delete(key);
    }
  }
}, RATE_LIMIT_CLEANUP_INTERVAL);

function checkRateLimit(ip, maxRequests = 100, windowMs = 60000) {
  if (!ip) return true; // Skip if no IP
  
  const now = Date.now();
  const key = `rate_${ip}`;
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs, firstRequest: now };
  
  // Sliding window - reset if window expired
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
    entry.firstRequest = now;
  }
  
  entry.count++;
  entry.lastRequest = now;
  rateLimitStore.set(key, entry);
  
  return entry.count <= maxRequests;
}

/**
 * Get client IP from request (handles proxies)
 */
function getClientIP(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || 
         req.headers['x-real-ip'] || 
         req.connection?.remoteAddress || 
         req.ip || 
         'unknown';
}

/**
 * Validate payment amount server-side
 * Recalculates based on items to prevent client tampering
 */
function validatePaymentAmount(items, claimedAmount, claimedSubtotal) {
  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, error: 'No items provided' };
  }
  
  // Recalculate from items
  const calculatedSubtotal = items.reduce((sum, item) => {
    const price = parseFloat(item.price) || 0;
    const qty = parseInt(item.qty) || 1;
    const discount = parseFloat(item.discount) || 0;
    return sum + (price * qty * (1 - discount / 100));
  }, 0);
  
  const calculatedTax = calculatedSubtotal * TAX_RATE;
  const calculatedTotal = Math.round((calculatedSubtotal + calculatedTax) * 100); // In cents
  
  // Allow 1 cent tolerance for rounding
  if (Math.abs(calculatedTotal - claimedAmount) > 1) {
    return { 
      valid: false, 
      error: 'Amount mismatch',
      expected: calculatedTotal,
      received: claimedAmount
    };
  }
  
  return { valid: true, calculatedTotal, calculatedSubtotal, calculatedTax };
}

/**
 * Sanitize input data - removes disallowed fields and sanitizes values
 */
function sanitizeInput(data, allowedFields) {
  if (!data || typeof data !== 'object') return {};
  const sanitized = {};
  
  for (const field of allowedFields) {
    if (data[field] !== undefined) {
      sanitized[field] = sanitizeValue(data[field]);
    }
  }
  return sanitized;
}

/**
 * Sanitize individual values
 */
function sanitizeValue(value) {
  if (value === null || value === undefined) return value;
  
  if (typeof value === 'string') {
    // Remove null bytes and control characters
    value = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
    // Trim and limit length
    value = value.trim().substring(0, 10000);
    // Basic XSS prevention for common vectors
    value = value.replace(/<script[^>]*>.*?<\/script>/gi, '')
                 .replace(/javascript:/gi, '')
                 .replace(/on\w+\s*=/gi, '');
    return value;
  }
  
  if (typeof value === 'number') {
    // Ensure finite number
    return Number.isFinite(value) ? value : 0;
  }
  
  if (Array.isArray(value)) {
    return value.slice(0, 1000).map(sanitizeValue);
  }
  
  if (typeof value === 'object') {
    const sanitizedObj = {};
    for (const [k, v] of Object.entries(value)) {
      // Limit object depth by only going one level
      sanitizedObj[sanitizeValue(k)] = typeof v === 'object' ? v : sanitizeValue(v);
    }
    return sanitizedObj;
  }
  
  return value;
}

/**
 * Validate and sanitize email format
 */
function sanitizeEmail(email) {
  if (!email || typeof email !== 'string') return null;
  email = email.toLowerCase().trim();
  const emailRegex = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  return emailRegex.test(email) ? email : null;
}

/**
 * Validate and sanitize phone number
 */
function sanitizePhone(phone) {
  if (!phone || typeof phone !== 'string') return null;
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length < 10 || cleaned.length > 15) return null;
  return cleaned;
}

// ============ ERROR CODES (Production Standard) ============
const ErrorCodes = {
  // Authentication errors (1xxx)
  AUTH_MISSING: { code: 1001, message: 'Authentication required', status: 401 },
  AUTH_INVALID: { code: 1002, message: 'Invalid authentication token', status: 401 },
  AUTH_EXPIRED: { code: 1003, message: 'Authentication token expired', status: 401 },
  API_KEY_MISSING: { code: 1004, message: 'API key required', status: 401 },
  API_KEY_INVALID: { code: 1005, message: 'Invalid API key', status: 401 },
  
  // Authorization errors (2xxx)
  PERMISSION_DENIED: { code: 2001, message: 'Permission denied', status: 403 },
  ROLE_INSUFFICIENT: { code: 2002, message: 'Insufficient role permissions', status: 403 },
  RESOURCE_ACCESS_DENIED: { code: 2003, message: 'Access to resource denied', status: 403 },
  
  // Validation errors (3xxx)
  VALIDATION_FAILED: { code: 3001, message: 'Validation failed', status: 400 },
  REQUIRED_FIELD_MISSING: { code: 3002, message: 'Required field missing', status: 400 },
  INVALID_FORMAT: { code: 3003, message: 'Invalid data format', status: 400 },
  AMOUNT_MISMATCH: { code: 3004, message: 'Amount calculation mismatch', status: 400 },
  INVALID_QUANTITY: { code: 3005, message: 'Invalid quantity', status: 400 },
  INVALID_PRICE: { code: 3006, message: 'Invalid price', status: 400 },
  
  // Resource errors (4xxx)
  NOT_FOUND: { code: 4001, message: 'Resource not found', status: 404 },
  CUSTOMER_NOT_FOUND: { code: 4002, message: 'Customer not found', status: 404 },
  TRANSACTION_NOT_FOUND: { code: 4003, message: 'Transaction not found', status: 404 },
  BOOKING_NOT_FOUND: { code: 4004, message: 'Booking not found', status: 404 },
  GIFT_CARD_NOT_FOUND: { code: 4005, message: 'Gift card not found', status: 404 },
  EMPLOYEE_NOT_FOUND: { code: 4006, message: 'Employee not found', status: 404 },
  
  // Business logic errors (5xxx)
  INSUFFICIENT_BALANCE: { code: 5001, message: 'Insufficient balance', status: 400 },
  INSUFFICIENT_STOCK: { code: 5002, message: 'Insufficient stock', status: 400 },
  BOOKING_CONFLICT: { code: 5003, message: 'Booking time conflict', status: 409 },
  DRAWER_NOT_OPEN: { code: 5004, message: 'Cash drawer not open', status: 400 },
  DRAWER_ALREADY_OPEN: { code: 5005, message: 'Cash drawer already open', status: 400 },
  TRANSACTION_ALREADY_REFUNDED: { code: 5006, message: 'Transaction already refunded', status: 400 },
  GIFT_CARD_EXPIRED: { code: 5007, message: 'Gift card expired', status: 400 },
  
  // Rate limiting (6xxx)
  RATE_LIMIT_EXCEEDED: { code: 6001, message: 'Rate limit exceeded', status: 429 },
  
  // Server errors (7xxx)
  INTERNAL_ERROR: { code: 7001, message: 'Internal server error', status: 500 },
  DATABASE_ERROR: { code: 7002, message: 'Database operation failed', status: 500 },
  PAYMENT_PROCESSING_ERROR: { code: 7003, message: 'Payment processing failed', status: 500 },
  EXTERNAL_SERVICE_ERROR: { code: 7004, message: 'External service unavailable', status: 503 }
};

/**
 * Structured logging for production monitoring
 */
function logRequest(req, level, message, meta = {}) {
  const logEntry = {
    level,
    message,
    timestamp: new Date().toISOString(),
    requestId: req.headers['x-request-id'] || `req_${Date.now().toString(36)}`,
    method: req.method,
    path: req.path,
    ip: getClientIP(req),
    userAgent: req.headers['user-agent']?.substring(0, 200),
    ...meta
  };
  
  if (level === 'error') {
    console.error(JSON.stringify(logEntry));
  } else if (level === 'warn') {
    console.warn(JSON.stringify(logEntry));
  } else {
    console.log(JSON.stringify(logEntry));
  }
  
  return logEntry.requestId;
}

/**
 * Send standardized error response with logging
 */
function sendError(res, errorType, details = null, req = null) {
  const error = ErrorCodes[errorType] || ErrorCodes.INTERNAL_ERROR;
  const requestId = req ? logRequest(req, 'error', error.message, { errorType, details }) : null;
  
  const response = {
    success: false,
    error: {
      code: error.code,
      message: error.message,
      ...(details && { details }),
      ...(requestId && { requestId })
    },
    timestamp: new Date().toISOString()
  };
  
  // Set security headers
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  
  return res.status(error.status).json(response);
}

/**
 * Send standardized success response
 */
function sendSuccess(res, data = {}, message = 'Success') {
  // Set security headers
  res.set('X-Content-Type-Options', 'nosniff');
  res.set('X-Frame-Options', 'DENY');
  
  return res.json({
    success: true,
    message,
    data,
    timestamp: new Date().toISOString()
  });
}

// ============ VALIDATION SCHEMAS ============
const ValidationSchemas = {
  // Transaction validation
  transaction: {
    required: ['items'],
    fields: {
      items: { type: 'array', minLength: 1 },
      customerId: { type: 'string', optional: true },
      employeeId: { type: 'string', optional: true },
      discount: { type: 'number', min: 0, max: 100, optional: true },
      paymentMethod: { type: 'string', enum: ['cash', 'card', 'giftcard', 'split'], optional: true },
      notes: { type: 'string', maxLength: 500, optional: true }
    }
  },
  
  // Customer validation
  customer: {
    required: ['name'],
    fields: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      email: { type: 'string', pattern: 'email', optional: true },
      phone: { type: 'string', pattern: 'phone', optional: true },
      memberType: { type: 'string', optional: true },
      notes: { type: 'string', maxLength: 1000, optional: true }
    }
  },
  
  // Booking validation
  booking: {
    required: ['bayId', 'startTime', 'duration'],
    fields: {
      bayId: { type: 'number', min: 1 },
      startTime: { type: 'string', pattern: 'datetime' },
      duration: { type: 'number', min: 30, max: 240 },
      customerId: { type: 'string', optional: true },
      customerName: { type: 'string', minLength: 1, maxLength: 100 },
      players: { type: 'number', min: 1, max: 8, optional: true },
      notes: { type: 'string', maxLength: 500, optional: true }
    }
  },
  
  // Employee validation
  employee: {
    required: ['name', 'role'],
    fields: {
      name: { type: 'string', minLength: 1, maxLength: 100 },
      email: { type: 'string', pattern: 'email', optional: true },
      pin: { type: 'string', pattern: 'pin', optional: true },
      role: { type: 'string', enum: ['admin', 'manager', 'cashier', 'staff'] },
      permissions: { type: 'object', optional: true },
      isActive: { type: 'boolean', optional: true }
    }
  },
  
  // Gift card validation
  giftCard: {
    required: ['amount'],
    fields: {
      amount: { type: 'number', min: 5, max: 500 },
      recipientName: { type: 'string', maxLength: 100, optional: true },
      recipientEmail: { type: 'string', pattern: 'email', optional: true },
      message: { type: 'string', maxLength: 500, optional: true }
    }
  }
};

/**
 * Validate data against schema
 */
function validateSchema(data, schemaName) {
  const schema = ValidationSchemas[schemaName];
  if (!schema) {
    return { valid: false, error: 'Unknown schema' };
  }
  
  const errors = [];
  
  // Check required fields
  for (const field of schema.required || []) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      errors.push({ field, error: 'Required field missing' });
    }
  }
  
  // Validate field types and constraints
  for (const [field, rules] of Object.entries(schema.fields)) {
    const value = data[field];
    
    if (value === undefined || value === null) {
      if (!rules.optional) {
        errors.push({ field, error: 'Field is required' });
      }
      continue;
    }
    
    // Type checking
    if (rules.type === 'string' && typeof value !== 'string') {
      errors.push({ field, error: 'Must be a string' });
    } else if (rules.type === 'number' && typeof value !== 'number') {
      errors.push({ field, error: 'Must be a number' });
    } else if (rules.type === 'boolean' && typeof value !== 'boolean') {
      errors.push({ field, error: 'Must be a boolean' });
    } else if (rules.type === 'array' && !Array.isArray(value)) {
      errors.push({ field, error: 'Must be an array' });
    } else if (rules.type === 'object' && (typeof value !== 'object' || Array.isArray(value))) {
      errors.push({ field, error: 'Must be an object' });
    }
    
    // String constraints
    if (rules.type === 'string' && typeof value === 'string') {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push({ field, error: `Minimum length is ${rules.minLength}` });
      }
      if (rules.maxLength && value.length > rules.maxLength) {
        errors.push({ field, error: `Maximum length is ${rules.maxLength}` });
      }
      if (rules.pattern === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
        errors.push({ field, error: 'Invalid email format' });
      }
      if (rules.pattern === 'phone' && !/^[\d\s\-\+\(\)]{7,20}$/.test(value)) {
        errors.push({ field, error: 'Invalid phone format' });
      }
      if (rules.pattern === 'pin' && !/^\d{4,6}$/.test(value)) {
        errors.push({ field, error: 'PIN must be 4-6 digits' });
      }
      if (rules.enum && !rules.enum.includes(value)) {
        errors.push({ field, error: `Must be one of: ${rules.enum.join(', ')}` });
      }
    }
    
    // Number constraints
    if (rules.type === 'number' && typeof value === 'number') {
      if (rules.min !== undefined && value < rules.min) {
        errors.push({ field, error: `Minimum value is ${rules.min}` });
      }
      if (rules.max !== undefined && value > rules.max) {
        errors.push({ field, error: `Maximum value is ${rules.max}` });
      }
    }
    
    // Array constraints
    if (rules.type === 'array' && Array.isArray(value)) {
      if (rules.minLength && value.length < rules.minLength) {
        errors.push({ field, error: `Minimum ${rules.minLength} items required` });
      }
    }
  }
  
  if (errors.length > 0) {
    return { valid: false, errors };
  }
  
  return { valid: true };
}

// ============ AUDIT LOGGING ============
/**
 * Log audit event to Firestore
 * Tracks all important actions for compliance and debugging
 */
async function logAudit(action, data, metadata = {}) {
  try {
    const db = admin.firestore();
    const auditEntry = {
      action,
      data: typeof data === 'object' ? JSON.stringify(data).slice(0, 5000) : String(data).slice(0, 5000),
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      storeId: metadata.storeId || 'golfcove',
      employeeId: metadata.employeeId || null,
      terminalId: metadata.terminalId || null,
      ip: metadata.ip || null,
      userAgent: metadata.userAgent || null,
      success: metadata.success !== false,
      errorMessage: metadata.errorMessage || null
    };
    
    await db.collection('audit_log').add(auditEntry);
  } catch (error) {
    console.error('Audit log error:', error);
    // Don't throw - audit logging should never break main operations
  }
}

// Audit action types
const AuditActions = {
  // Transactions
  TRANSACTION_CREATED: 'transaction.created',
  TRANSACTION_REFUNDED: 'transaction.refunded',
  TRANSACTION_VOIDED: 'transaction.voided',
  
  // Cash Drawer
  DRAWER_OPENED: 'drawer.opened',
  DRAWER_CLOSED: 'drawer.closed',
  DRAWER_PAY_IN: 'drawer.pay_in',
  DRAWER_PAY_OUT: 'drawer.pay_out',
  
  // Inventory
  INVENTORY_ADJUSTED: 'inventory.adjusted',
  INVENTORY_RECEIVED: 'inventory.received',
  INVENTORY_COUNTED: 'inventory.counted',
  
  // Customers
  CUSTOMER_CREATED: 'customer.created',
  CUSTOMER_UPDATED: 'customer.updated',
  CUSTOMER_DELETED: 'customer.deleted',
  
  // Employees
  EMPLOYEE_CREATED: 'employee.created',
  EMPLOYEE_UPDATED: 'employee.updated',
  EMPLOYEE_DELETED: 'employee.deleted',
  EMPLOYEE_LOGIN: 'employee.login',
  EMPLOYEE_LOGOUT: 'employee.logout',
  
  // Bookings
  BOOKING_CREATED: 'booking.created',
  BOOKING_UPDATED: 'booking.updated',
  BOOKING_CANCELLED: 'booking.cancelled',
  BOOKING_CHECKED_IN: 'booking.checked_in',
  
  // Gift Cards
  GIFT_CARD_CREATED: 'giftcard.created',
  GIFT_CARD_REDEEMED: 'giftcard.redeemed',
  GIFT_CARD_BALANCE_ADJUSTED: 'giftcard.balance_adjusted',
  
  // Security
  AUTH_SUCCESS: 'auth.success',
  AUTH_FAILED: 'auth.failed',
  PERMISSION_DENIED: 'security.permission_denied',
  RATE_LIMIT_HIT: 'security.rate_limit',
  
  // Admin
  SETTINGS_CHANGED: 'admin.settings_changed',
  REPORT_GENERATED: 'admin.report_generated',
  DATA_EXPORTED: 'admin.data_exported'
};

// Stripe setup - Use environment variables in production
// Set with: firebase functions:config:set stripe.secret_key="sk_live_..."
const stripe = require('stripe')(
  functions.config().stripe?.secret_key || 'sk_test_51ScLeeJaljqVA3ADvCWSrpvAfxZBwtMakgZazEUOLi0PIfWDHPrGSeQU3KmBqxAh8qHHp0O8doTynVLV5PZJsn1R00VRVBF7Z7'
);

// Supported payment methods for checkout sessions
// Note: Apple Pay and Google Pay require domain verification in Stripe Dashboard
const CHECKOUT_PAYMENT_METHODS = ['card', 'link'];

/**
 * Create a PaymentIntent for Stripe Terminal
 * Called when staff clicks "Pay" in the POS
 * 
 * SECURITY: Validates amount server-side when items are provided
 */
exports.createPaymentIntent = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      // Rate limiting
      const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
      if (!checkRateLimit(clientIp, 50, 60000)) {
        return res.status(429).json({ error: 'Too many requests. Please try again later.' });
      }
      
      const { amount, items, subtotal, currency = 'usd', description, metadata } = req.body;

      // If items are provided, validate amount server-side
      if (items && Array.isArray(items) && items.length > 0) {
        const validation = validatePaymentAmount(items, amount, subtotal);
        if (!validation.valid) {
          console.error('Payment validation failed:', validation);
          return res.status(400).json({ 
            error: 'Payment amount validation failed',
            details: validation.error
          });
        }
      }

      if (!amount || amount < 50) {
        return res.status(400).json({ error: 'Amount must be at least 50 cents' });
      }
      
      if (amount > 1000000) { // $10,000 max
        return res.status(400).json({ error: 'Amount exceeds maximum allowed' });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount), // Amount in cents
        currency: currency,
        payment_method_types: ['card_present'],
        capture_method: 'automatic',
        description: description || 'Golf Cove POS Purchase',
        metadata: {
          source: 'golf_cove_pos',
          validated: items ? 'server' : 'client',
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
  // Golf Memberships (monthly)
  par: { monthly: 8900, annual: 89000 },
  birdie: { monthly: 18900, annual: 189000 },
  eagle: { monthly: 28900, annual: 289000 },
  // Family Memberships (monthly)
  'family-par': { monthly: 14900, annual: 149000 },
  'family-birdie': { monthly: 29900, annual: 299000 },
  'family-eagle': { monthly: 44900, annual: 449000 },
  // League (one-time seasonal)
  'league-player': { seasonal: 40000 },
  'league-team': { seasonal: 80000 }
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
        payment_method_types: CHECKOUT_PAYMENT_METHODS,
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
        payment_method_types: CHECKOUT_PAYMENT_METHODS,
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
 * Create checkout session for membership (supports subscriptions and one-time)
 */
exports.createMembershipCheckout = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const {
        tier, isFamily, customerName, customerEmail,
        customerPhone, billingCycle, successUrl, cancelUrl,
        stripePriceId // Optional: use Stripe Price ID directly
      } = req.body;

      let sessionConfig;

      // If a Stripe Price ID is provided, use it directly
      if (stripePriceId) {
        const isSubscription = billingCycle === 'monthly';
        sessionConfig = {
          payment_method_types: CHECKOUT_PAYMENT_METHODS,
          mode: isSubscription ? 'subscription' : 'payment',
          customer_email: customerEmail,
          line_items: [{
            price: stripePriceId,
            quantity: 1
          }],
          metadata: {
            type: tier?.includes('league') ? 'league' : 'membership',
            tier,
            customerName, 
            customerPhone
          },
          success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl
        };
      } else {
        // Legacy: calculate from tier
        // Handle tier names - if already prefixed with 'family-' or 'league-', use as-is
        let membershipKey = tier;
        if (isFamily && !tier.startsWith('family-')) {
          membershipKey = `family-${tier}`;
        }
        const pricing = MEMBERSHIP_PRICES[membershipKey];

        if (!pricing) {
          return res.status(400).json({ error: 'Invalid membership tier' });
        }

        // Determine if this is a seasonal (one-time) or subscription
        const isSeasonal = !!pricing.seasonal;
        const amount = isSeasonal ? pricing.seasonal : (billingCycle === 'annual' ? pricing.annual : pricing.monthly);
        const tierName = tier.charAt(0).toUpperCase() + tier.slice(1);

        sessionConfig = {
          payment_method_types: CHECKOUT_PAYMENT_METHODS,
          mode: isSeasonal || billingCycle === 'annual' ? 'payment' : 'subscription',
          customer_email: customerEmail,
          line_items: [{
            price_data: {
              currency: 'usd',
              product_data: {
                name: `${tierName}${isFamily ? ' Family' : ''} Membership`,
                description: isSeasonal 
                  ? 'Winter 2025-2026 League Season'
                  : (billingCycle === 'annual' ? 'Annual membership - Save 2 months!' : 'Monthly membership')
              },
              unit_amount: amount,
              ...(billingCycle === 'monthly' && !isSeasonal && { recurring: { interval: 'month' } })
            },
            quantity: 1
          }],
          metadata: {
            type: isSeasonal ? 'league' : 'membership',
            tier,
            isFamily: String(isFamily),
            customerName, customerPhone,
            billingCycle: isSeasonal ? 'seasonal' : billingCycle
          },
          success_url: `${successUrl}?session_id={CHECKOUT_SESSION_ID}`,
          cancel_url: cancelUrl
        };

        if (billingCycle === 'monthly' && !isSeasonal) {
          sessionConfig.subscription_data = {
            metadata: { tier, isFamily: String(isFamily), customerName }
          };
        }
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
        payment_method_types: CHECKOUT_PAYMENT_METHODS,
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
 * Handles: checkout.session.completed, payment_intent.succeeded, 
 * subscription events, and refunds
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
  console.log('Webhook received:', event.type);

  try {
    switch (event.type) {
      // ============ CHECKOUT SESSION COMPLETED ============
      case 'checkout.session.completed': {
        const session = event.data.object;
        const meta = session.metadata || {};

        // Handle based on payment type
        if (meta.type === 'booking') {
          await db.collection('bookings').add({
            ...meta,
            customerEmail: session.customer_email,
            depositPaid: session.amount_total / 100,
            stripeSessionId: session.id,
            stripeCustomerId: session.customer,
            status: 'confirmed',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log('Booking created from checkout:', session.id);
          
        } else if (meta.type === 'gift_card') {
          const code = 'GC-' + Math.random().toString(36).substr(2, 4).toUpperCase() + '-' + 
                       Math.random().toString(36).substr(2, 4).toUpperCase();
          await db.collection('gift_cards').add({
            code,
            amount: parseFloat(meta.amount),
            balance: parseFloat(meta.amount),
            purchaserEmail: meta.purchaserEmail,
            purchaserName: meta.purchaserName,
            recipientEmail: meta.recipientEmail || null,
            recipientName: meta.recipientName || null,
            message: meta.message || null,
            stripeSessionId: session.id,
            status: 'active',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            expiresAt: null // Gift cards don't expire in CT
          });
          console.log('Gift card created:', code);
          
        } else if (meta.type === 'membership' || meta.type === 'league') {
          const membershipDoc = {
            ...meta,
            customerEmail: session.customer_email,
            stripeSessionId: session.id,
            stripeCustomerId: session.customer,
            stripeSubscriptionId: session.subscription || null,
            status: 'active',
            startDate: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          // Calculate expiration based on billing cycle
          if (meta.billingCycle === 'annual') {
            membershipDoc.expiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
          } else if (meta.billingCycle === 'seasonal') {
            // League season: expires April 30
            const now = new Date();
            const expYear = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
            membershipDoc.expiresAt = new Date(expYear, 3, 30); // April 30
          }
          
          await db.collection('memberships').add(membershipDoc);
          console.log('Membership created:', meta.tier);
          
        } else if (meta.type === 'event') {
          await db.collection('events').add({
            ...meta,
            customerEmail: session.customer_email,
            depositPaid: session.amount_total / 100,
            stripeSessionId: session.id,
            status: 'deposit_paid',
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          console.log('Event booking created:', session.id);
        }
        break;
      }

      // ============ PAYMENT INTENT SUCCEEDED (POS Payments) ============
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        const meta = paymentIntent.metadata || {};
        
        // Record POS transaction
        await db.collection('transactions').add({
          stripePaymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          currency: paymentIntent.currency,
          status: 'completed',
          source: meta.source || 'pos',
          register: meta.register,
          customerId: meta.customerId || null,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        console.log('POS transaction recorded:', paymentIntent.id);
        break;
      }

      // ============ PAYMENT INTENT FAILED ============
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        console.error('Payment failed:', paymentIntent.id, paymentIntent.last_payment_error?.message);
        
        // Could notify staff or log for review
        await db.collection('failed_payments').add({
          stripePaymentIntentId: paymentIntent.id,
          amount: paymentIntent.amount / 100,
          error: paymentIntent.last_payment_error?.message,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        break;
      }

      // ============ SUBSCRIPTION CREATED ============
      case 'customer.subscription.created': {
        const subscription = event.data.object;
        console.log('Subscription created:', subscription.id);
        
        // Update membership status
        const membershipQuery = await db.collection('memberships')
          .where('stripeCustomerId', '==', subscription.customer)
          .limit(1)
          .get();
        
        if (!membershipQuery.empty) {
          await membershipQuery.docs[0].ref.update({
            stripeSubscriptionId: subscription.id,
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        break;
      }

      // ============ SUBSCRIPTION UPDATED ============
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        console.log('Subscription updated:', subscription.id, 'Status:', subscription.status);
        
        const membershipQuery = await db.collection('memberships')
          .where('stripeSubscriptionId', '==', subscription.id)
          .limit(1)
          .get();
        
        if (!membershipQuery.empty) {
          await membershipQuery.docs[0].ref.update({
            subscriptionStatus: subscription.status,
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        break;
      }

      // ============ SUBSCRIPTION CANCELLED/DELETED ============
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        console.log('Subscription cancelled:', subscription.id);
        
        const membershipQuery = await db.collection('memberships')
          .where('stripeSubscriptionId', '==', subscription.id)
          .limit(1)
          .get();
        
        if (!membershipQuery.empty) {
          await membershipQuery.docs[0].ref.update({
            status: 'cancelled',
            subscriptionStatus: 'cancelled',
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        break;
      }

      // ============ INVOICE PAYMENT FAILED (Subscription billing failed) ============
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        console.error('Invoice payment failed:', invoice.id, 'Customer:', invoice.customer);
        
        // Update membership status to past_due
        const membershipQuery = await db.collection('memberships')
          .where('stripeCustomerId', '==', invoice.customer)
          .where('status', '==', 'active')
          .limit(1)
          .get();
        
        if (!membershipQuery.empty) {
          await membershipQuery.docs[0].ref.update({
            status: 'past_due',
            lastPaymentFailed: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        // TODO: Send email notification to customer
        break;
      }

      // ============ INVOICE PAID (Subscription renewed) ============
      case 'invoice.paid': {
        const invoice = event.data.object;
        console.log('Invoice paid:', invoice.id);
        
        // Reactivate membership if it was past_due
        const membershipQuery = await db.collection('memberships')
          .where('stripeCustomerId', '==', invoice.customer)
          .where('status', 'in', ['past_due', 'active'])
          .limit(1)
          .get();
        
        if (!membershipQuery.empty) {
          await membershipQuery.docs[0].ref.update({
            status: 'active',
            lastPaymentAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        break;
      }

      // ============ REFUND CREATED ============
      case 'charge.refunded': {
        const charge = event.data.object;
        console.log('Refund processed:', charge.id, 'Amount refunded:', charge.amount_refunded);
        
        await db.collection('refunds').add({
          stripeChargeId: charge.id,
          stripePaymentIntentId: charge.payment_intent,
          amountRefunded: charge.amount_refunded / 100,
          reason: charge.refunds?.data[0]?.reason || 'requested_by_customer',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        break;
      }

      default:
        console.log('Unhandled event type:', event.type);
    }

    res.json({ received: true });
    
  } catch (error) {
    console.error('Webhook processing error:', error);
    // Still return 200 to acknowledge receipt, but log the error
    res.json({ received: true, error: error.message });
  }
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

/**
 * Get subscription details for a customer
 */
exports.getSubscription = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const { subscriptionId, customerId } = req.query;
      
      let subscription;
      
      if (subscriptionId) {
        subscription = await stripe.subscriptions.retrieve(subscriptionId);
      } else if (customerId) {
        const subscriptions = await stripe.subscriptions.list({
          customer: customerId,
          limit: 1,
          status: 'all'
        });
        subscription = subscriptions.data[0];
      } else {
        return res.status(400).json({ error: 'subscriptionId or customerId required' });
      }
      
      if (!subscription) {
        return res.status(404).json({ error: 'Subscription not found' });
      }
      
      res.json({
        id: subscription.id,
        status: subscription.status,
        currentPeriodStart: subscription.current_period_start,
        currentPeriodEnd: subscription.current_period_end,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        canceledAt: subscription.canceled_at,
        plan: {
          id: subscription.items.data[0]?.price?.id,
          amount: subscription.items.data[0]?.price?.unit_amount,
          interval: subscription.items.data[0]?.price?.recurring?.interval
        }
      });
    } catch (error) {
      console.error('Get subscription error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Cancel a subscription
 */
exports.cancelSubscription = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { subscriptionId, cancelImmediately } = req.body;
      
      if (!subscriptionId) {
        return res.status(400).json({ error: 'subscriptionId required' });
      }
      
      let subscription;
      
      if (cancelImmediately) {
        // Cancel immediately
        subscription = await stripe.subscriptions.cancel(subscriptionId);
      } else {
        // Cancel at end of billing period
        subscription = await stripe.subscriptions.update(subscriptionId, {
          cancel_at_period_end: true
        });
      }
      
      res.json({
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        currentPeriodEnd: subscription.current_period_end
      });
    } catch (error) {
      console.error('Cancel subscription error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Reactivate a cancelled subscription (before period end)
 */
exports.reactivateSubscription = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { subscriptionId } = req.body;
      
      if (!subscriptionId) {
        return res.status(400).json({ error: 'subscriptionId required' });
      }
      
      const subscription = await stripe.subscriptions.update(subscriptionId, {
        cancel_at_period_end: false
      });
      
      res.json({
        id: subscription.id,
        status: subscription.status,
        cancelAtPeriodEnd: subscription.cancel_at_period_end,
        message: 'Subscription reactivated'
      });
    } catch (error) {
      console.error('Reactivate subscription error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Update subscription to a different plan
 */
exports.updateSubscription = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { subscriptionId, newPriceId, prorationBehavior } = req.body;
      
      if (!subscriptionId || !newPriceId) {
        return res.status(400).json({ error: 'subscriptionId and newPriceId required' });
      }
      
      // Get current subscription
      const subscription = await stripe.subscriptions.retrieve(subscriptionId);
      
      // Update to new price
      const updatedSubscription = await stripe.subscriptions.update(subscriptionId, {
        items: [{
          id: subscription.items.data[0].id,
          price: newPriceId
        }],
        proration_behavior: prorationBehavior || 'create_prorations'
      });
      
      res.json({
        id: updatedSubscription.id,
        status: updatedSubscription.status,
        newPriceId: updatedSubscription.items.data[0]?.price?.id,
        message: 'Subscription updated'
      });
    } catch (error) {
      console.error('Update subscription error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get or create Stripe customer
 */
exports.getOrCreateCustomer = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    try {
      const { email, name, phone, metadata } = req.body;
      
      if (!email) {
        return res.status(400).json({ error: 'email required' });
      }
      
      // Check if customer exists
      const existingCustomers = await stripe.customers.list({
        email: email,
        limit: 1
      });
      
      if (existingCustomers.data.length > 0) {
        res.json({
          customerId: existingCustomers.data[0].id,
          isNew: false
        });
      } else {
        // Create new customer
        const customer = await stripe.customers.create({
          email,
          name,
          phone,
          metadata: metadata || {}
        });
        
        res.json({
          customerId: customer.id,
          isNew: true
        });
      }
    } catch (error) {
      console.error('Get/create customer error:', error);
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
// All sync endpoints require API key authentication
// ============================================================

/**
 * Sync customers to Firestore
 * Requires: X-API-Key header
 */
exports.syncCustomers = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Verify API key
    const auth = verifyApiKey(req);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.error });
    }
    
    // Rate limiting
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(clientIp, 20, 60000)) {
      return res.status(429).json({ error: 'Too many sync requests. Please try again later.' });
    }

    try {
      const { customers, storeId = 'golfcove' } = req.body;
      
      if (!Array.isArray(customers)) {
        return res.status(400).json({ error: 'customers must be an array' });
      }
      
      if (customers.length > 500) {
        return res.status(400).json({ error: 'Maximum 500 customers per sync' });
      }
      
      const db = admin.firestore();
      const batch = db.batch();
      
      // Allowed fields for customer sync (prevent injection of arbitrary data)
      const allowedFields = ['id', 'firstName', 'lastName', 'email', 'phone', 'isMember', 'memberType', 'memberExpires', 'visitCount', 'totalSpent', 'lastVisit', 'notes', 'tags'];
      
      for (const customer of customers) {
        const sanitized = sanitizeInput(customer, allowedFields);
        const docRef = db.collection('stores').doc(storeId).collection('customers').doc(String(customer.id || customer.phone || Date.now()));
        batch.set(docRef, {
          ...sanitized,
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
          syncedFrom: clientIp
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
 * Requires: X-API-Key header
 */
exports.getCustomers = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const auth = verifyApiKey(req);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.error });
    }
    
    try {
      const { storeId = 'golfcove', limit = 1000 } = req.query;
      const db = admin.firestore();
      
      const snapshot = await db.collection('stores').doc(storeId).collection('customers')
        .limit(Math.min(parseInt(limit) || 1000, 5000))
        .get();
      const customers = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      res.json({ customers, count: customers.length });
    } catch (error) {
      console.error('Get customers error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Sync bookings to Firestore
 * Requires: X-API-Key header
 */
exports.syncBookings = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Verify API key
    const auth = verifyApiKey(req);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.error });
    }
    
    // Rate limiting
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(clientIp, 20, 60000)) {
      return res.status(429).json({ error: 'Too many sync requests. Please try again later.' });
    }

    try {
      const { bookings, storeId = 'golfcove' } = req.body;
      
      if (!Array.isArray(bookings)) {
        return res.status(400).json({ error: 'bookings must be an array' });
      }
      
      if (bookings.length > 200) {
        return res.status(400).json({ error: 'Maximum 200 bookings per sync' });
      }
      
      const db = admin.firestore();
      const batch = db.batch();
      
      // Allowed fields for booking sync
      const allowedFields = ['id', 'customerName', 'customerId', 'room', 'date', 'time', 'duration', 'players', 'status', 'phone', 'email', 'total', 'isPaid', 'notes', 'memberType'];
      
      for (const booking of bookings) {
        const sanitized = sanitizeInput(booking, allowedFields);
        const docRef = db.collection('stores').doc(storeId).collection('bookings').doc(String(booking.id || Date.now()));
        batch.set(docRef, {
          ...sanitized,
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
 * Requires: X-API-Key header
 */
exports.getBookings = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const auth = verifyApiKey(req);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.error });
    }
    
    try {
      const { storeId = 'golfcove', date, limit = 500 } = req.query;
      const db = admin.firestore();
      
      let query = db.collection('stores').doc(storeId).collection('bookings');
      
      if (date) {
        query = query.where('date', '==', date);
      }
      
      query = query.limit(Math.min(parseInt(limit) || 500, 1000));
      
      const snapshot = await query.get();
      const bookings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      res.json({ bookings, count: bookings.length });
    } catch (error) {
      console.error('Get bookings error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Sync transactions to Firestore
 * Requires: X-API-Key header
 */
exports.syncTransactions = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Verify API key
    const auth = verifyApiKey(req);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.error });
    }
    
    // Rate limiting
    const clientIp = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(clientIp, 20, 60000)) {
      return res.status(429).json({ error: 'Too many sync requests. Please try again later.' });
    }

    try {
      const { transactions, storeId = 'golfcove' } = req.body;
      
      if (!Array.isArray(transactions)) {
        return res.status(400).json({ error: 'transactions must be an array' });
      }
      
      if (transactions.length > 200) {
        return res.status(400).json({ error: 'Maximum 200 transactions per sync' });
      }
      
      const db = admin.firestore();
      const batch = db.batch();
      
      // Allowed fields for transaction sync
      const allowedFields = ['id', 'customer', 'customerId', 'amount', 'subtotal', 'tax', 'method', 'date', 'time', 'items', 'employee', 'stripePaymentId', 'isReturn', 'tabId'];
      
      for (const transaction of transactions) {
        const sanitized = sanitizeInput(transaction, allowedFields);
        const docRef = db.collection('stores').doc(storeId).collection('transactions').doc(String(transaction.id || Date.now()));
        batch.set(docRef, {
          ...sanitized,
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
 * Requires: X-API-Key header
 */
exports.getTransactions = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const auth = verifyApiKey(req);
    if (!auth.valid) {
      return res.status(401).json({ error: auth.error });
    }
    
    try {
      const { storeId = 'golfcove', startDate, endDate, limit = 500 } = req.query;
      const db = admin.firestore();
      
      let query = db.collection('stores').doc(storeId).collection('transactions');
      
      if (startDate) {
        query = query.where('date', '>=', startDate);
      }
      if (endDate) {
        query = query.where('date', '<=', endDate);
      }
      
      const snapshot = await query.orderBy('date', 'desc').limit(Math.min(parseInt(limit) || 500, 1000)).get();
      const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      res.json({ transactions, count: transactions.length });
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
          const { action = 'create', tabId, customerId, customerName, stripeCustomerId, items, employeeId, employeeName, notes, bayNumber, isMember, memberType, memberDiscount } = req.body;
          
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
              total: itemsTotal * (1 + TAX_RATE), // With tax
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
            stripeCustomerId: stripeCustomerId || null, // For Stripe payment processing
            isMember: isMember || false,
            memberType: memberType || null,
            memberDiscount: memberDiscount || 0,
            items: initialItems,
            subtotal: itemsTotal,
            tax: itemsTotal * TAX_RATE,
            total: itemsTotal * (1 + TAX_RATE),
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
              total: itemsTotal * (1 + TAX_RATE),
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

// ============================================================
// EMPLOYEE & PIN MANAGEMENT
// ============================================================

/**
 * Employees API - Manages employee records and PINs
 * GET: List all employees
 * POST: Sync employees from client
 */
exports.employees = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const db = admin.firestore();
    const { storeId = 'golfcove' } = req.query;
    const employeesRef = db.collection('stores').doc(storeId).collection('employees');
    
    try {
      switch (req.method) {
        case 'GET': {
          const snapshot = await employeesRef.where('isActive', '!=', false).get();
          const employees = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          res.json({ employees });
          break;
        }
        
        case 'POST': {
          const { employees } = req.body;
          
          if (!employees || !Array.isArray(employees)) {
            return res.status(400).json({ error: 'employees array required' });
          }
          
          const batch = db.batch();
          
          for (const emp of employees) {
            const docId = emp.id || 'EMP-' + Date.now().toString(36).toUpperCase();
            const docRef = employeesRef.doc(docId);
            
            batch.set(docRef, {
              ...emp,
              id: docId,
              updatedAt: admin.firestore.FieldValue.serverTimestamp()
            }, { merge: true });
          }
          
          await batch.commit();
          res.json({ success: true, count: employees.length });
          break;
        }
        
        default:
          res.status(405).json({ error: 'Method not allowed' });
      }
    } catch (error) {
      console.error('Employees API error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Validate PIN - Securely validate employee PIN
 * Returns employee data if valid, error if invalid
 */
exports.validatePIN = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove', pin } = req.body;
    
    if (!pin || pin.length !== 4) {
      return res.status(400).json({ error: 'Valid 4-digit PIN required' });
    }
    
    try {
      const employeesRef = db.collection('stores').doc(storeId).collection('employees');
      const snapshot = await employeesRef
        .where('pin', '==', pin)
        .where('isActive', '!=', false)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        // Log failed attempt
        await db.collection('stores').doc(storeId).collection('auth_logs').add({
          type: 'failed_pin',
          pin: pin.substring(0, 2) + '**', // Partially masked
          timestamp: admin.firestore.FieldValue.serverTimestamp(),
          ip: req.ip || 'unknown'
        });
        
        return res.status(401).json({ valid: false, error: 'Invalid PIN' });
      }
      
      const employee = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      
      // Log successful login
      await db.collection('stores').doc(storeId).collection('auth_logs').add({
        type: 'pin_login',
        employeeId: employee.id,
        employeeName: employee.name || employee.displayName,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Don't send PIN back to client
      delete employee.pin;
      
      res.json({ valid: true, employee });
    } catch (error) {
      console.error('PIN validation error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Save Employee - Add or update a single employee
 */
exports.saveEmployee = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove', employee } = req.body;
    
    if (!employee) {
      return res.status(400).json({ error: 'Employee data required' });
    }
    
    try {
      const employeesRef = db.collection('stores').doc(storeId).collection('employees');
      
      // Check for duplicate PIN
      if (employee.pin) {
        const pinCheck = await employeesRef
          .where('pin', '==', employee.pin)
          .where('isActive', '!=', false)
          .get();
        
        const duplicates = pinCheck.docs.filter(doc => doc.id !== employee.id);
        
        if (duplicates.length > 0) {
          return res.status(400).json({ error: 'PIN already in use' });
        }
      }
      
      const docId = employee.id || 'EMP-' + Date.now().toString(36).toUpperCase();
      
      await employeesRef.doc(docId).set({
        ...employee,
        id: docId,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      res.json({ success: true, id: docId });
    } catch (error) {
      console.error('Save employee error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Delete Employee - Soft delete an employee
 */
exports.deleteEmployee = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove', employeeId } = req.body;
    
    if (!employeeId) {
      return res.status(400).json({ error: 'employeeId required' });
    }
    
    try {
      const employeesRef = db.collection('stores').doc(storeId).collection('employees');
      
      await employeesRef.doc(employeeId).update({
        isActive: false,
        deletedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      res.json({ success: true });
    } catch (error) {
      console.error('Delete employee error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============ INVENTORY MANAGEMENT ============

/**
 * Sync Inventory - Sync inventory levels with server
 */
exports.syncInventory = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return res.status(401).json({ error: apiKeyResult.error });
    }
    
    // Rate limit
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    if (!checkRateLimit(ip, 60, 60000)) {
      return res.status(429).json({ error: 'Rate limit exceeded' });
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove', inventory, terminalId } = req.body;
    
    if (req.method === 'GET') {
      // Get current inventory levels
      try {
        const snap = await db.collection('stores').doc(storeId).collection('inventory').get();
        const items = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json({ inventory: items, timestamp: Date.now() });
      } catch (error) {
        console.error('Get inventory error:', error);
        res.status(500).json({ error: error.message });
      }
      return;
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    if (!Array.isArray(inventory)) {
      return res.status(400).json({ error: 'inventory array required' });
    }
    
    try {
      const batch = db.batch();
      const inventoryRef = db.collection('stores').doc(storeId).collection('inventory');
      
      inventory.forEach(item => {
        if (item.id && item.stock !== undefined) {
          batch.set(inventoryRef.doc(String(item.id)), {
            stock: parseInt(item.stock) || 0,
            name: item.name || '',
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            lastUpdatedBy: terminalId || 'unknown'
          }, { merge: true });
        }
      });
      
      await batch.commit();
      res.json({ success: true, synced: inventory.length });
    } catch (error) {
      console.error('Sync inventory error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Deduct Inventory - Called after a sale to reduce stock
 */
exports.deductInventory = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return res.status(401).json({ error: apiKeyResult.error });
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove', items, transactionId, terminalId } = req.body;
    
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'items array required' });
    }
    
    try {
      const inventoryRef = db.collection('stores').doc(storeId).collection('inventory');
      const results = [];
      
      for (const item of items) {
        if (!item.id || !item.qty) continue;
        
        const docRef = inventoryRef.doc(String(item.id));
        const doc = await docRef.get();
        
        if (doc.exists) {
          const currentStock = doc.data().stock || 0;
          const newStock = Math.max(0, currentStock - parseInt(item.qty));
          
          await docRef.update({
            stock: newStock,
            lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            lastTransaction: transactionId || null
          });
          
          results.push({ id: item.id, previousStock: currentStock, newStock });
          
          // Log low stock alert
          if (newStock <= 5 && currentStock > 5) {
            console.log(`LOW STOCK ALERT: Item ${item.id} (${item.name}) is now at ${newStock} units`);
          }
        }
      }
      
      res.json({ success: true, updated: results });
    } catch (error) {
      console.error('Deduct inventory error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============ TRANSACTION VALIDATION ============

/**
 * Validate Transaction - Server-side validation before processing payment
 */
exports.validateTransaction = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return res.status(401).json({ error: apiKeyResult.error });
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { items, subtotal, tax, total, discount, giftCardCode, customerId } = req.body;
    
    // Validate items
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ valid: false, error: 'No items in transaction' });
    }
    
    // Recalculate from items
    let calculatedSubtotal = 0;
    const validatedItems = [];
    
    for (const item of items) {
      const price = parseFloat(item.price) || 0;
      const qty = parseInt(item.qty) || 1;
      const itemDiscount = parseFloat(item.discount) || 0;
      
      if (price < 0 || qty < 0 || itemDiscount < 0 || itemDiscount > 100) {
        return res.status(400).json({ valid: false, error: `Invalid item data: ${item.name}` });
      }
      
      const itemTotal = price * qty * (1 - itemDiscount / 100);
      calculatedSubtotal += itemTotal;
      
      validatedItems.push({
        name: item.name,
        price,
        qty,
        discount: itemDiscount,
        total: itemTotal
      });
    }
    
    // Apply discount
    const discountAmount = parseFloat(discount) || 0;
    if (discountAmount < 0 || discountAmount > calculatedSubtotal) {
      return res.status(400).json({ valid: false, error: 'Invalid discount amount' });
    }
    calculatedSubtotal -= discountAmount;
    
    // Calculate tax
    const calculatedTax = Math.round(calculatedSubtotal * TAX_RATE * 100) / 100;
    const calculatedTotal = Math.round((calculatedSubtotal + calculatedTax) * 100) / 100;
    
    // Verify client calculations (allow 1 cent tolerance)
    const totalMatch = Math.abs(calculatedTotal - parseFloat(total)) <= 0.01;
    const subtotalMatch = Math.abs(calculatedSubtotal - parseFloat(subtotal)) <= 0.01;
    const taxMatch = Math.abs(calculatedTax - parseFloat(tax)) <= 0.01;
    
    if (!totalMatch || !subtotalMatch || !taxMatch) {
      return res.status(400).json({
        valid: false,
        error: 'Calculation mismatch',
        expected: { subtotal: calculatedSubtotal, tax: calculatedTax, total: calculatedTotal },
        received: { subtotal, tax, total }
      });
    }
    
    // Validate gift card if provided
    if (giftCardCode) {
      const db = admin.firestore();
      const gcSnap = await db.collection('gift_cards').where('code', '==', giftCardCode).get();
      
      if (gcSnap.empty) {
        return res.status(400).json({ valid: false, error: 'Gift card not found' });
      }
      
      const gc = gcSnap.docs[0].data();
      if (gc.balance <= 0) {
        return res.status(400).json({ valid: false, error: 'Gift card has no balance' });
      }
    }
    
    res.json({
      valid: true,
      validated: {
        items: validatedItems,
        subtotal: calculatedSubtotal,
        tax: calculatedTax,
        total: calculatedTotal,
        taxRate: TAX_RATE
      }
    });
  });
});

/**
 * Record Transaction - Save completed transaction to database
 */
exports.recordTransaction = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return res.status(401).json({ error: apiKeyResult.error });
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove', transaction } = req.body;
    
    if (!transaction || !transaction.items) {
      return res.status(400).json({ error: 'Transaction data required' });
    }
    
    try {
      // Generate transaction ID
      const transId = 'TXN-' + Date.now().toString(36).toUpperCase() + Math.random().toString(36).substr(2, 4).toUpperCase();
      
      const transactionData = {
        ...transaction,
        id: transId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        storeId,
        serverValidated: true
      };
      
      await db.collection('stores').doc(storeId).collection('transactions').doc(transId).set(transactionData);
      
      // Update daily sales
      const today = new Date().toISOString().split('T')[0];
      const dailyRef = db.collection('stores').doc(storeId).collection('daily_sales').doc(today);
      
      await dailyRef.set({
        date: today,
        totalSales: admin.firestore.FieldValue.increment(transaction.total || 0),
        transactionCount: admin.firestore.FieldValue.increment(1),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      
      res.json({ success: true, transactionId: transId });
    } catch (error) {
      console.error('Record transaction error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============ CASH DRAWER MANAGEMENT ============

/**
 * Cash Drawer Operations - Track drawer state across terminals
 */
exports.cashDrawer = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return res.status(401).json({ error: apiKeyResult.error });
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove', registerId, action, data } = req.body;
    
    if (!registerId) {
      return res.status(400).json({ error: 'registerId required' });
    }
    
    const drawerRef = db.collection('stores').doc(storeId).collection('cash_drawers').doc(registerId);
    
    try {
      if (req.method === 'GET' || action === 'status') {
        // Get current drawer status
        const doc = await drawerRef.get();
        if (!doc.exists) {
          return res.json({ status: 'not_opened', drawer: null });
        }
        return res.json({ status: doc.data().status || 'closed', drawer: doc.data() });
      }
      
      if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
      }
      
      switch (action) {
        case 'open':
          await drawerRef.set({
            status: 'open',
            openingAmount: parseFloat(data?.amount) || 0,
            currentAmount: parseFloat(data?.amount) || 0,
            openedAt: admin.firestore.FieldValue.serverTimestamp(),
            openedBy: data?.employeeId || 'unknown',
            cashIn: 0,
            cashOut: 0,
            payIns: 0,
            payOuts: 0
          });
          break;
          
        case 'close':
          const currentDoc = await drawerRef.get();
          if (!currentDoc.exists) {
            return res.status(400).json({ error: 'Drawer not open' });
          }
          
          const drawerData = currentDoc.data();
          const expected = drawerData.openingAmount + drawerData.cashIn - drawerData.cashOut + drawerData.payIns - drawerData.payOuts;
          const counted = parseFloat(data?.countedAmount) || 0;
          const variance = counted - expected;
          
          await drawerRef.update({
            status: 'closed',
            closedAt: admin.firestore.FieldValue.serverTimestamp(),
            closedBy: data?.employeeId || 'unknown',
            countedAmount: counted,
            expectedAmount: expected,
            variance
          });
          
          // Archive to history
          await db.collection('stores').doc(storeId).collection('drawer_history').add({
            ...drawerData,
            registerId,
            closedAt: admin.firestore.FieldValue.serverTimestamp(),
            countedAmount: counted,
            expectedAmount: expected,
            variance
          });
          break;
          
        case 'pay_in':
          await drawerRef.update({
            payIns: admin.firestore.FieldValue.increment(parseFloat(data?.amount) || 0),
            currentAmount: admin.firestore.FieldValue.increment(parseFloat(data?.amount) || 0)
          });
          break;
          
        case 'pay_out':
          await drawerRef.update({
            payOuts: admin.firestore.FieldValue.increment(parseFloat(data?.amount) || 0),
            currentAmount: admin.firestore.FieldValue.increment(-(parseFloat(data?.amount) || 0))
          });
          break;
          
        case 'cash_sale':
          await drawerRef.update({
            cashIn: admin.firestore.FieldValue.increment(parseFloat(data?.amount) || 0),
            currentAmount: admin.firestore.FieldValue.increment(parseFloat(data?.amount) || 0)
          });
          break;
          
        case 'cash_return':
          await drawerRef.update({
            cashOut: admin.firestore.FieldValue.increment(parseFloat(data?.amount) || 0),
            currentAmount: admin.firestore.FieldValue.increment(-(parseFloat(data?.amount) || 0))
          });
          break;
          
        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
      
      res.json({ success: true, action });
    } catch (error) {
      console.error('Cash drawer error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============ REPORTING ENDPOINTS ============

/**
 * Generate Sales Report
 * Supports daily, weekly, monthly, and custom date ranges
 */
exports.salesReport = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { 
      storeId = 'golfcove', 
      period = 'daily', // daily, weekly, monthly, custom
      startDate, 
      endDate,
      groupBy = 'day', // hour, day, week, month
      includeDetails = false
    } = req.query;
    
    try {
      // Calculate date range
      let start, end;
      const now = new Date();
      
      switch (period) {
        case 'daily':
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
          break;
        case 'weekly':
          const dayOfWeek = now.getDay();
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
          end = new Date(start.getTime() + 7 * 24 * 60 * 60 * 1000);
          break;
        case 'monthly':
          start = new Date(now.getFullYear(), now.getMonth(), 1);
          end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
          break;
        case 'custom':
          if (!startDate || !endDate) {
            return sendError(res, 'VALIDATION_FAILED', 'startDate and endDate required for custom period');
          }
          start = new Date(startDate);
          end = new Date(endDate);
          end.setDate(end.getDate() + 1); // Include end date
          break;
        default:
          start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
          end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      }
      
      // Query transactions
      const transactionsRef = db.collection('stores').doc(storeId).collection('transactions');
      const snapshot = await transactionsRef
        .where('createdAt', '>=', start)
        .where('createdAt', '<', end)
        .orderBy('createdAt', 'desc')
        .get();
      
      const transactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      // Calculate summary
      const summary = {
        totalSales: 0,
        totalTax: 0,
        totalDiscount: 0,
        transactionCount: 0,
        averageTransactionValue: 0,
        salesByMethod: { cash: 0, card: 0, giftcard: 0, other: 0 },
        salesByCategory: {},
        salesByHour: {},
        refunds: { count: 0, total: 0 },
        voids: { count: 0, total: 0 }
      };
      
      for (const trans of transactions) {
        if (trans.isVoid) {
          summary.voids.count++;
          summary.voids.total += Math.abs(trans.total || 0);
          continue;
        }
        
        if (trans.isRefund || trans.isReturn) {
          summary.refunds.count++;
          summary.refunds.total += Math.abs(trans.total || 0);
          continue;
        }
        
        const total = parseFloat(trans.total) || 0;
        const tax = parseFloat(trans.tax) || 0;
        const discount = parseFloat(trans.discount) || 0;
        
        summary.totalSales += total;
        summary.totalTax += tax;
        summary.totalDiscount += discount;
        summary.transactionCount++;
        
        // Sales by payment method
        const method = trans.paymentMethod || trans.method || 'other';
        summary.salesByMethod[method] = (summary.salesByMethod[method] || 0) + total;
        
        // Sales by category (if items available)
        if (trans.items && Array.isArray(trans.items)) {
          for (const item of trans.items) {
            const cat = item.category || 'uncategorized';
            if (!summary.salesByCategory[cat]) {
              summary.salesByCategory[cat] = { count: 0, total: 0 };
            }
            summary.salesByCategory[cat].count += item.qty || 1;
            summary.salesByCategory[cat].total += (item.price || 0) * (item.qty || 1);
          }
        }
        
        // Sales by hour
        if (trans.createdAt) {
          const hour = new Date(trans.createdAt.toDate ? trans.createdAt.toDate() : trans.createdAt).getHours();
          summary.salesByHour[hour] = (summary.salesByHour[hour] || 0) + total;
        }
      }
      
      summary.averageTransactionValue = summary.transactionCount > 0 
        ? summary.totalSales / summary.transactionCount 
        : 0;
      
      // Round values
      summary.totalSales = Math.round(summary.totalSales * 100) / 100;
      summary.totalTax = Math.round(summary.totalTax * 100) / 100;
      summary.totalDiscount = Math.round(summary.totalDiscount * 100) / 100;
      summary.averageTransactionValue = Math.round(summary.averageTransactionValue * 100) / 100;
      
      // Log audit
      await logAudit(AuditActions.REPORT_GENERATED, { period, startDate: start, endDate: end }, {
        storeId,
        ip: req.ip
      });
      
      const response = {
        period,
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        summary
      };
      
      if (includeDetails === 'true') {
        response.transactions = transactions.slice(0, 1000); // Limit for performance
      }
      
      return sendSuccess(res, response, 'Sales report generated');
    } catch (error) {
      console.error('Sales report error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

/**
 * Generate Inventory Report
 */
exports.inventoryReport = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove', lowStockThreshold = 5 } = req.query;
    
    try {
      const inventoryRef = db.collection('stores').doc(storeId).collection('inventory');
      const snapshot = await inventoryRef.get();
      
      const items = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      
      const report = {
        totalItems: items.length,
        totalValue: 0,
        lowStockItems: [],
        outOfStockItems: [],
        categoryBreakdown: {}
      };
      
      for (const item of items) {
        const stock = parseInt(item.stock) || 0;
        const price = parseFloat(item.price) || 0;
        const value = stock * price;
        
        report.totalValue += value;
        
        // Track low stock
        if (stock === 0) {
          report.outOfStockItems.push({ id: item.id, name: item.name, lastUpdated: item.lastUpdated });
        } else if (stock <= parseInt(lowStockThreshold)) {
          report.lowStockItems.push({ id: item.id, name: item.name, stock, lastUpdated: item.lastUpdated });
        }
        
        // Category breakdown
        const cat = item.category || 'uncategorized';
        if (!report.categoryBreakdown[cat]) {
          report.categoryBreakdown[cat] = { items: 0, totalStock: 0, totalValue: 0 };
        }
        report.categoryBreakdown[cat].items++;
        report.categoryBreakdown[cat].totalStock += stock;
        report.categoryBreakdown[cat].totalValue += value;
      }
      
      report.totalValue = Math.round(report.totalValue * 100) / 100;
      
      return sendSuccess(res, report, 'Inventory report generated');
    } catch (error) {
      console.error('Inventory report error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

/**
 * Generate Employee Performance Report
 */
exports.employeeReport = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove', startDate, endDate } = req.query;
    
    try {
      // Default to current month
      const now = new Date();
      const start = startDate ? new Date(startDate) : new Date(now.getFullYear(), now.getMonth(), 1);
      const end = endDate ? new Date(endDate) : new Date(now.getFullYear(), now.getMonth() + 1, 1);
      
      // Get transactions with employee info
      const transactionsRef = db.collection('stores').doc(storeId).collection('transactions');
      const snapshot = await transactionsRef
        .where('createdAt', '>=', start)
        .where('createdAt', '<', end)
        .get();
      
      const employeeStats = {};
      
      for (const doc of snapshot.docs) {
        const trans = doc.data();
        if (trans.isVoid || trans.isRefund) continue;
        
        const empId = trans.employeeId || trans.cashier || 'unknown';
        if (!employeeStats[empId]) {
          employeeStats[empId] = {
            employeeId: empId,
            employeeName: trans.employeeName || trans.cashier || 'Unknown',
            transactionCount: 0,
            totalSales: 0,
            averageSale: 0,
            itemsSold: 0
          };
        }
        
        employeeStats[empId].transactionCount++;
        employeeStats[empId].totalSales += parseFloat(trans.total) || 0;
        employeeStats[empId].itemsSold += parseInt(trans.itemCount) || 0;
      }
      
      // Calculate averages
      const report = Object.values(employeeStats).map(emp => ({
        ...emp,
        totalSales: Math.round(emp.totalSales * 100) / 100,
        averageSale: emp.transactionCount > 0 
          ? Math.round((emp.totalSales / emp.transactionCount) * 100) / 100 
          : 0
      }));
      
      // Sort by total sales
      report.sort((a, b) => b.totalSales - a.totalSales);
      
      return sendSuccess(res, {
        dateRange: { start: start.toISOString(), end: end.toISOString() },
        employees: report
      }, 'Employee report generated');
    } catch (error) {
      console.error('Employee report error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

// ============ DATA EXPORT ============

/**
 * Export Data - Generate CSV/JSON exports for backup or migration
 */
exports.exportData = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { 
      storeId = 'golfcove', 
      dataType, // transactions, customers, inventory, bookings, employees
      format = 'json',
      startDate,
      endDate,
      limit = 10000
    } = req.query;
    
    if (!dataType) {
      return sendError(res, 'VALIDATION_FAILED', 'dataType is required');
    }
    
    const validTypes = ['transactions', 'customers', 'inventory', 'bookings', 'employees', 'gift_cards'];
    if (!validTypes.includes(dataType)) {
      return sendError(res, 'VALIDATION_FAILED', `dataType must be one of: ${validTypes.join(', ')}`);
    }
    
    try {
      let query = db.collection('stores').doc(storeId).collection(dataType);
      
      // Apply date filter if applicable
      if (startDate && (dataType === 'transactions' || dataType === 'bookings')) {
        query = query.where('createdAt', '>=', new Date(startDate));
      }
      if (endDate && (dataType === 'transactions' || dataType === 'bookings')) {
        query = query.where('createdAt', '<=', new Date(endDate));
      }
      
      query = query.limit(parseInt(limit));
      
      const snapshot = await query.get();
      const data = snapshot.docs.map(doc => {
        const docData = doc.data();
        // Convert Firestore timestamps to ISO strings
        for (const key of Object.keys(docData)) {
          if (docData[key] && docData[key].toDate) {
            docData[key] = docData[key].toDate().toISOString();
          }
        }
        return { id: doc.id, ...docData };
      });
      
      // Log audit
      await logAudit(AuditActions.DATA_EXPORTED, { dataType, recordCount: data.length }, {
        storeId,
        ip: req.ip
      });
      
      if (format === 'csv') {
        // Generate CSV
        if (data.length === 0) {
          return res.set('Content-Type', 'text/csv').send('No data');
        }
        
        const headers = Object.keys(data[0]);
        const csvRows = [headers.join(',')];
        
        for (const row of data) {
          const values = headers.map(h => {
            const val = row[h];
            if (val === null || val === undefined) return '';
            if (typeof val === 'object') return JSON.stringify(val).replace(/"/g, '""');
            return String(val).replace(/"/g, '""');
          });
          csvRows.push('"' + values.join('","') + '"');
        }
        
        const filename = `${storeId}_${dataType}_${new Date().toISOString().split('T')[0]}.csv`;
        res.set('Content-Type', 'text/csv');
        res.set('Content-Disposition', `attachment; filename="${filename}"`);
        return res.send(csvRows.join('\n'));
      }
      
      // Default: JSON
      return sendSuccess(res, {
        dataType,
        recordCount: data.length,
        exportedAt: new Date().toISOString(),
        data
      }, 'Data exported successfully');
    } catch (error) {
      console.error('Export data error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

// ============ HEALTH CHECK ============

/**
 * Health check endpoint for monitoring
 */
exports.health = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const db = admin.firestore();
    
    try {
      // Test database connectivity
      const testRef = db.collection('_health').doc('check');
      await testRef.set({ timestamp: admin.firestore.FieldValue.serverTimestamp() });
      
      return res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '2.0.0',
        services: {
          database: 'connected',
          stripe: stripe ? 'configured' : 'not_configured'
        }
      });
    } catch (error) {
      return res.status(503).json({
        status: 'unhealthy',
        timestamp: new Date().toISOString(),
        error: error.message
      });
    }
  });
});

// ============ AUDIT LOG QUERY ============

/**
 * Query audit log for compliance and debugging
 */
exports.auditLog = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { 
      storeId = 'golfcove',
      action,
      employeeId,
      startDate,
      endDate,
      limit = 100
    } = req.query;
    
    try {
      let query = db.collection('audit_log').where('storeId', '==', storeId);
      
      if (action) {
        query = query.where('action', '==', action);
      }
      if (employeeId) {
        query = query.where('employeeId', '==', employeeId);
      }
      if (startDate) {
        query = query.where('timestamp', '>=', new Date(startDate));
      }
      if (endDate) {
        query = query.where('timestamp', '<=', new Date(endDate));
      }
      
      query = query.orderBy('timestamp', 'desc').limit(parseInt(limit));
      
      const snapshot = await query.get();
      const entries = snapshot.docs.map(doc => {
        const data = doc.data();
        if (data.timestamp && data.timestamp.toDate) {
          data.timestamp = data.timestamp.toDate().toISOString();
        }
        return { id: doc.id, ...data };
      });
      
      return sendSuccess(res, { entries, count: entries.length });
    } catch (error) {
      console.error('Audit log query error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

// ============================================================
// SCHEDULED FUNCTIONS - AUTOMATED BUSINESS OPERATIONS
// ============================================================

/**
 * Daily Sales Summary - Runs at 11:59 PM every day
 * Generates daily report and sends to managers
 */
exports.dailySalesSummary = functions.pubsub
  .schedule('59 23 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const db = admin.firestore();
    const storeId = 'golfcove';
    
    const today = new Date();
    const startOfDay = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const endOfDay = new Date(startOfDay.getTime() + 24 * 60 * 60 * 1000 - 1);
    
    try {
      // Get today's transactions
      const transactionsSnap = await db.collection('transactions')
        .where('storeId', '==', storeId)
        .where('timestamp', '>=', startOfDay)
        .where('timestamp', '<=', endOfDay)
        .get();
      
      const transactions = transactionsSnap.docs.map(doc => doc.data());
      
      // Calculate summary
      const summary = {
        date: startOfDay.toISOString().split('T')[0],
        totalSales: 0,
        totalTax: 0,
        transactionCount: transactions.length,
        paymentBreakdown: { cash: 0, card: 0, giftCard: 0, other: 0 },
        categoryBreakdown: {},
        refunds: 0,
        voidCount: 0,
        averageTransaction: 0,
        peakHour: null,
        hourlyBreakdown: {}
      };
      
      const hourCounts = {};
      
      transactions.forEach(tx => {
        if (tx.status === 'voided') {
          summary.voidCount++;
          return;
        }
        if (tx.status === 'refunded') {
          summary.refunds += tx.total || 0;
          return;
        }
        
        summary.totalSales += tx.total || 0;
        summary.totalTax += tx.tax || 0;
        
        // Payment method
        const method = tx.paymentMethod || 'other';
        if (summary.paymentBreakdown[method] !== undefined) {
          summary.paymentBreakdown[method] += tx.total || 0;
        } else {
          summary.paymentBreakdown.other += tx.total || 0;
        }
        
        // Category breakdown
        if (tx.items && Array.isArray(tx.items)) {
          tx.items.forEach(item => {
            const category = item.category || 'uncategorized';
            if (!summary.categoryBreakdown[category]) {
              summary.categoryBreakdown[category] = { count: 0, total: 0 };
            }
            summary.categoryBreakdown[category].count += item.quantity || 1;
            summary.categoryBreakdown[category].total += (item.price || 0) * (item.quantity || 1);
          });
        }
        
        // Hourly breakdown
        const txDate = tx.timestamp?.toDate ? tx.timestamp.toDate() : new Date(tx.timestamp);
        const hour = txDate.getHours();
        hourCounts[hour] = (hourCounts[hour] || 0) + 1;
        summary.hourlyBreakdown[hour] = (summary.hourlyBreakdown[hour] || 0) + (tx.total || 0);
      });
      
      // Calculate peak hour
      let maxCount = 0;
      Object.entries(hourCounts).forEach(([hour, count]) => {
        if (count > maxCount) {
          maxCount = count;
          summary.peakHour = parseInt(hour);
        }
      });
      
      // Average transaction
      const validTransactions = transactions.filter(tx => tx.status !== 'voided' && tx.status !== 'refunded');
      summary.averageTransaction = validTransactions.length > 0 
        ? summary.totalSales / validTransactions.length 
        : 0;
      
      // Save summary to Firestore
      await db.collection('daily_reports').doc(`${storeId}_${summary.date}`).set({
        ...summary,
        storeId,
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      // Log audit
      await LogAuditEvent('DAILY_REPORT_GENERATED', 'report', summary.date, summary, 'system');
      
      console.log(`Daily sales summary generated for ${summary.date}: $${summary.totalSales.toFixed(2)}`);
      return null;
    } catch (error) {
      console.error('Daily sales summary error:', error);
      await LogAuditEvent('DAILY_REPORT_ERROR', 'report', startOfDay.toISOString(), { error: error.message }, 'system');
      return null;
    }
  });

/**
 * Low Stock Alert - Runs at 8 AM every day
 * Checks inventory levels and creates alerts
 */
exports.lowStockAlert = functions.pubsub
  .schedule('0 8 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const db = admin.firestore();
    const storeId = 'golfcove';
    
    try {
      // Get all inventory items
      const inventorySnap = await db.collection('inventory')
        .where('storeId', '==', storeId)
        .where('active', '==', true)
        .get();
      
      const lowStockItems = [];
      const outOfStockItems = [];
      
      inventorySnap.docs.forEach(doc => {
        const item = doc.data();
        const threshold = item.lowStockThreshold || 10;
        const currentStock = item.quantity || 0;
        
        if (currentStock === 0) {
          outOfStockItems.push({
            id: doc.id,
            name: item.name,
            category: item.category,
            quantity: currentStock
          });
        } else if (currentStock <= threshold) {
          lowStockItems.push({
            id: doc.id,
            name: item.name,
            category: item.category,
            quantity: currentStock,
            threshold: threshold
          });
        }
      });
      
      // Create alert if there are issues
      if (lowStockItems.length > 0 || outOfStockItems.length > 0) {
        const alertId = `stock_alert_${new Date().toISOString().split('T')[0]}`;
        
        await db.collection('alerts').doc(alertId).set({
          type: 'low_stock',
          storeId,
          lowStockItems,
          outOfStockItems,
          lowStockCount: lowStockItems.length,
          outOfStockCount: outOfStockItems.length,
          status: 'unread',
          priority: outOfStockItems.length > 0 ? 'high' : 'medium',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`Low stock alert: ${lowStockItems.length} low, ${outOfStockItems.length} out of stock`);
      }
      
      return null;
    } catch (error) {
      console.error('Low stock alert error:', error);
      return null;
    }
  });

/**
 * Membership Expiry Check - Runs at 9 AM every day
 * Sends notifications for expiring memberships
 */
exports.membershipExpiryCheck = functions.pubsub
  .schedule('0 9 * * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const db = admin.firestore();
    const storeId = 'golfcove';
    
    const today = new Date();
    const inSevenDays = new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000);
    const inThirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
    
    try {
      // Get memberships expiring in the next 30 days
      const membershipsSnap = await db.collection('memberships')
        .where('storeId', '==', storeId)
        .where('status', '==', 'active')
        .where('endDate', '>=', today)
        .where('endDate', '<=', inThirtyDays)
        .get();
      
      const expiringMemberships = {
        expiringSoon: [], // 7 days or less
        expiringLater: [] // 8-30 days
      };
      
      for (const doc of membershipsSnap.docs) {
        const membership = doc.data();
        const endDate = membership.endDate?.toDate ? membership.endDate.toDate() : new Date(membership.endDate);
        const daysUntilExpiry = Math.ceil((endDate - today) / (24 * 60 * 60 * 1000));
        
        // Get customer info
        let customerName = 'Unknown';
        if (membership.customerId) {
          const customerDoc = await db.collection('customers').doc(membership.customerId).get();
          if (customerDoc.exists) {
            const customer = customerDoc.data();
            customerName = `${customer.firstName || ''} ${customer.lastName || ''}`.trim();
          }
        }
        
        const expiryInfo = {
          membershipId: doc.id,
          customerId: membership.customerId,
          customerName,
          type: membership.type,
          endDate: endDate.toISOString().split('T')[0],
          daysUntilExpiry
        };
        
        if (daysUntilExpiry <= 7) {
          expiringMemberships.expiringSoon.push(expiryInfo);
        } else {
          expiringMemberships.expiringLater.push(expiryInfo);
        }
      }
      
      // Create notification if there are expiring memberships
      if (expiringMemberships.expiringSoon.length > 0 || expiringMemberships.expiringLater.length > 0) {
        await db.collection('notifications').add({
          type: 'membership_expiry',
          storeId,
          ...expiringMemberships,
          totalExpiring: expiringMemberships.expiringSoon.length + expiringMemberships.expiringLater.length,
          status: 'unread',
          priority: expiringMemberships.expiringSoon.length > 0 ? 'high' : 'low',
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        console.log(`Membership expiry check: ${expiringMemberships.expiringSoon.length} expiring soon, ${expiringMemberships.expiringLater.length} expiring later`);
      }
      
      return null;
    } catch (error) {
      console.error('Membership expiry check error:', error);
      return null;
    }
  });

/**
 * Weekly Report - Runs every Sunday at 11:59 PM
 * Generates comprehensive weekly business report
 */
exports.weeklyReport = functions.pubsub
  .schedule('59 23 * * 0')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const db = admin.firestore();
    const storeId = 'golfcove';
    
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - 7);
    startOfWeek.setHours(0, 0, 0, 0);
    
    try {
      // Get daily reports for the week
      const reportsSnap = await db.collection('daily_reports')
        .where('storeId', '==', storeId)
        .where('date', '>=', startOfWeek.toISOString().split('T')[0])
        .get();
      
      const weeklyData = {
        weekStart: startOfWeek.toISOString().split('T')[0],
        weekEnd: today.toISOString().split('T')[0],
        totalSales: 0,
        totalTax: 0,
        totalTransactions: 0,
        totalRefunds: 0,
        averageDaily: 0,
        bestDay: null,
        worstDay: null,
        categoryTotals: {},
        paymentTotals: { cash: 0, card: 0, giftCard: 0, other: 0 }
      };
      
      let bestDaySales = 0;
      let worstDaySales = Infinity;
      
      reportsSnap.docs.forEach(doc => {
        const report = doc.data();
        
        weeklyData.totalSales += report.totalSales || 0;
        weeklyData.totalTax += report.totalTax || 0;
        weeklyData.totalTransactions += report.transactionCount || 0;
        weeklyData.totalRefunds += report.refunds || 0;
        
        // Track best/worst days
        if ((report.totalSales || 0) > bestDaySales) {
          bestDaySales = report.totalSales || 0;
          weeklyData.bestDay = { date: report.date, sales: report.totalSales };
        }
        if ((report.totalSales || 0) < worstDaySales) {
          worstDaySales = report.totalSales || 0;
          weeklyData.worstDay = { date: report.date, sales: report.totalSales };
        }
        
        // Aggregate payment methods
        Object.keys(weeklyData.paymentTotals).forEach(method => {
          weeklyData.paymentTotals[method] += report.paymentBreakdown?.[method] || 0;
        });
        
        // Aggregate categories
        if (report.categoryBreakdown) {
          Object.entries(report.categoryBreakdown).forEach(([cat, data]) => {
            if (!weeklyData.categoryTotals[cat]) {
              weeklyData.categoryTotals[cat] = { count: 0, total: 0 };
            }
            weeklyData.categoryTotals[cat].count += data.count || 0;
            weeklyData.categoryTotals[cat].total += data.total || 0;
          });
        }
      });
      
      weeklyData.averageDaily = reportsSnap.size > 0 
        ? weeklyData.totalSales / reportsSnap.size 
        : 0;
      
      // Save weekly report
      const weekId = `${storeId}_${weeklyData.weekStart}_to_${weeklyData.weekEnd}`;
      await db.collection('weekly_reports').doc(weekId).set({
        ...weeklyData,
        storeId,
        generatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      await LogAuditEvent('WEEKLY_REPORT_GENERATED', 'report', weekId, weeklyData, 'system');
      
      console.log(`Weekly report generated: $${weeklyData.totalSales.toFixed(2)} total sales`);
      return null;
    } catch (error) {
      console.error('Weekly report error:', error);
      return null;
    }
  });

/**
 * Cleanup Old Data - Runs at 3 AM on the 1st of each month
 * Archives/deletes old data to manage storage
 */
exports.monthlyCleanup = functions.pubsub
  .schedule('0 3 1 * *')
  .timeZone('America/New_York')
  .onRun(async (context) => {
    const db = admin.firestore();
    const storeId = 'golfcove';
    
    // Keep 90 days of detailed data
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - 90);
    
    const stats = {
      auditLogsArchived: 0,
      oldAlertsDeleted: 0,
      oldNotificationsDeleted: 0
    };
    
    try {
      // Archive old audit logs (move to archive collection, delete from main)
      const oldAuditLogs = await db.collection('audit_log')
        .where('timestamp', '<', cutoffDate)
        .limit(500)
        .get();
      
      const archiveBatch = db.batch();
      const deleteBatch = db.batch();
      
      oldAuditLogs.docs.forEach(doc => {
        archiveBatch.set(db.collection('audit_log_archive').doc(doc.id), doc.data());
        deleteBatch.delete(doc.ref);
        stats.auditLogsArchived++;
      });
      
      if (stats.auditLogsArchived > 0) {
        await archiveBatch.commit();
        await deleteBatch.commit();
      }
      
      // Delete old read alerts (older than 30 days)
      const alertCutoff = new Date();
      alertCutoff.setDate(alertCutoff.getDate() - 30);
      
      const oldAlerts = await db.collection('alerts')
        .where('status', '==', 'read')
        .where('createdAt', '<', alertCutoff)
        .limit(200)
        .get();
      
      const alertBatch = db.batch();
      oldAlerts.docs.forEach(doc => {
        alertBatch.delete(doc.ref);
        stats.oldAlertsDeleted++;
      });
      
      if (stats.oldAlertsDeleted > 0) {
        await alertBatch.commit();
      }
      
      // Delete old read notifications
      const oldNotifications = await db.collection('notifications')
        .where('status', '==', 'read')
        .where('createdAt', '<', alertCutoff)
        .limit(200)
        .get();
      
      const notifBatch = db.batch();
      oldNotifications.docs.forEach(doc => {
        notifBatch.delete(doc.ref);
        stats.oldNotificationsDeleted++;
      });
      
      if (stats.oldNotificationsDeleted > 0) {
        await notifBatch.commit();
      }
      
      await LogAuditEvent('MONTHLY_CLEANUP', 'system', 'cleanup', stats, 'system');
      
      console.log(`Monthly cleanup complete:`, stats);
      return null;
    } catch (error) {
      console.error('Monthly cleanup error:', error);
      return null;
    }
  });

// ============================================================
// STRIPE WEBHOOK HANDLERS
// ============================================================

/**
 * Stripe Webhook Handler
 * Handles payment events from Stripe
 */
exports.stripeWebhook = functions.https.onRequest(async (req, res) => {
  const stripe = require('stripe')(functions.config().stripe?.secret || process.env.STRIPE_SECRET_KEY);
  const webhookSecret = functions.config().stripe?.webhook_secret;
  
  if (req.method !== 'POST') {
    return res.status(405).send('Method not allowed');
  }
  
  let event;
  
  try {
    // Verify webhook signature if secret is configured
    if (webhookSecret) {
      const sig = req.headers['stripe-signature'];
      event = stripe.webhooks.constructEvent(req.rawBody, sig, webhookSecret);
    } else {
      event = req.body;
      console.warn('Stripe webhook secret not configured - signature not verified');
    }
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }
  
  const db = admin.firestore();
  const storeId = 'golfcove';
  
  try {
    switch (event.type) {
      case 'payment_intent.succeeded': {
        const paymentIntent = event.data.object;
        
        // Update transaction status
        const txQuery = await db.collection('transactions')
          .where('stripePaymentIntentId', '==', paymentIntent.id)
          .limit(1)
          .get();
        
        if (!txQuery.empty) {
          await txQuery.docs[0].ref.update({
            status: 'completed',
            stripeStatus: 'succeeded',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        await LogAuditEvent('PAYMENT_SUCCEEDED', 'payment', paymentIntent.id, {
          amount: paymentIntent.amount,
          currency: paymentIntent.currency
        }, 'stripe');
        break;
      }
      
      case 'payment_intent.payment_failed': {
        const paymentIntent = event.data.object;
        
        const txQuery = await db.collection('transactions')
          .where('stripePaymentIntentId', '==', paymentIntent.id)
          .limit(1)
          .get();
        
        if (!txQuery.empty) {
          await txQuery.docs[0].ref.update({
            status: 'failed',
            stripeStatus: 'failed',
            stripeError: paymentIntent.last_payment_error?.message,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        await LogAuditEvent('PAYMENT_FAILED', 'payment', paymentIntent.id, {
          error: paymentIntent.last_payment_error?.message
        }, 'stripe');
        break;
      }
      
      case 'charge.refunded': {
        const charge = event.data.object;
        
        // Find and update transaction
        const txQuery = await db.collection('transactions')
          .where('stripeChargeId', '==', charge.id)
          .limit(1)
          .get();
        
        if (!txQuery.empty) {
          const refundAmount = charge.amount_refunded / 100;
          await txQuery.docs[0].ref.update({
            status: charge.refunded ? 'refunded' : 'partially_refunded',
            refundedAmount: refundAmount,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        await LogAuditEvent('REFUND_PROCESSED', 'payment', charge.id, {
          amount: charge.amount_refunded,
          refunded: charge.refunded
        }, 'stripe');
        break;
      }
      
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        
        // Find customer by Stripe customer ID
        const customerQuery = await db.collection('customers')
          .where('stripeCustomerId', '==', subscription.customer)
          .limit(1)
          .get();
        
        if (!customerQuery.empty) {
          // Update or create membership
          const customerId = customerQuery.docs[0].id;
          const membershipData = {
            customerId,
            storeId,
            stripeSubscriptionId: subscription.id,
            status: subscription.status,
            type: subscription.items.data[0]?.price?.lookup_key || 'standard',
            currentPeriodStart: new Date(subscription.current_period_start * 1000),
            currentPeriodEnd: new Date(subscription.current_period_end * 1000),
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          };
          
          await db.collection('memberships')
            .doc(`${customerId}_${subscription.id}`)
            .set(membershipData, { merge: true });
        }
        break;
      }
      
      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        
        // Mark membership as cancelled
        const membershipQuery = await db.collection('memberships')
          .where('stripeSubscriptionId', '==', subscription.id)
          .limit(1)
          .get();
        
        if (!membershipQuery.empty) {
          await membershipQuery.docs[0].ref.update({
            status: 'cancelled',
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
          });
        }
        
        await LogAuditEvent('SUBSCRIPTION_CANCELLED', 'membership', subscription.id, {
          customerId: subscription.customer
        }, 'stripe');
        break;
      }
      
      case 'invoice.paid': {
        const invoice = event.data.object;
        
        // Record invoice payment
        await db.collection('invoices').doc(invoice.id).set({
          storeId,
          stripeInvoiceId: invoice.id,
          stripeCustomerId: invoice.customer,
          amountPaid: invoice.amount_paid / 100,
          status: 'paid',
          paidAt: new Date(invoice.status_transitions?.paid_at * 1000 || Date.now()),
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
        break;
      }
      
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        
        await db.collection('invoices').doc(invoice.id).set({
          storeId,
          stripeInvoiceId: invoice.id,
          stripeCustomerId: invoice.customer,
          amountDue: invoice.amount_due / 100,
          status: 'failed',
          failureReason: invoice.last_finalization_error?.message,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        
        await LogAuditEvent('INVOICE_PAYMENT_FAILED', 'payment', invoice.id, {
          customer: invoice.customer,
          amount: invoice.amount_due
        }, 'stripe');
        break;
      }
      
      default:
        console.log(`Unhandled event type: ${event.type}`);
    }
    
    return res.json({ received: true });
  } catch (error) {
    console.error('Webhook processing error:', error);
    return res.status(500).json({ error: 'Webhook processing failed' });
  }
});

// ============================================================
// BACKUP AND RESTORE ENDPOINTS
// ============================================================

/**
 * Backup store data
 * Creates a full backup of store data
 */
exports.backupData = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const db = admin.firestore();
    const { storeId = 'golfcove' } = req.body;
    
    try {
      const backup = {
        metadata: {
          storeId,
          createdAt: new Date().toISOString(),
          version: '1.0'
        },
        collections: {}
      };
      
      // Collections to backup
      const collectionsToBackup = [
        'customers', 'memberships', 'inventory', 'employees', 
        'transactions', 'bookings', 'giftCards', 'tabs'
      ];
      
      for (const collectionName of collectionsToBackup) {
        const snapshot = await db.collection(collectionName)
          .where('storeId', '==', storeId)
          .get();
        
        backup.collections[collectionName] = snapshot.docs.map(doc => ({
          id: doc.id,
          data: doc.data()
        }));
      }
      
      // Calculate checksum
      const dataString = JSON.stringify(backup.collections);
      let checksum = 0;
      for (let i = 0; i < dataString.length; i++) {
        checksum = ((checksum << 5) - checksum) + dataString.charCodeAt(i);
        checksum = checksum & checksum;
      }
      backup.metadata.checksum = checksum;
      backup.metadata.documentCount = Object.values(backup.collections)
        .reduce((sum, docs) => sum + docs.length, 0);
      
      await LogAuditEvent('BACKUP_CREATED', 'system', storeId, {
        documentCount: backup.metadata.documentCount
      }, req.headers['x-user-id'] || 'api');
      
      return res.status(200).json(backup);
    } catch (error) {
      console.error('Backup error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

/**
 * Restore store data from backup
 */
exports.restoreData = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    // Verify API key
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const db = admin.firestore();
    const { backup, overwrite = false } = req.body;
    
    if (!backup || !backup.collections || !backup.metadata) {
      return res.status(400).json({ error: 'Invalid backup format' });
    }
    
    const storeId = backup.metadata.storeId;
    
    try {
      const stats = {
        restored: 0,
        skipped: 0,
        errors: 0
      };
      
      for (const [collectionName, documents] of Object.entries(backup.collections)) {
        for (const doc of documents) {
          try {
            const docRef = db.collection(collectionName).doc(doc.id);
            const existingDoc = await docRef.get();
            
            if (existingDoc.exists && !overwrite) {
              stats.skipped++;
              continue;
            }
            
            // Convert date strings back to Firestore timestamps
            const data = { ...doc.data };
            data.restoredAt = admin.firestore.FieldValue.serverTimestamp();
            
            await docRef.set(data, { merge: !overwrite });
            stats.restored++;
          } catch (err) {
            console.error(`Error restoring ${collectionName}/${doc.id}:`, err);
            stats.errors++;
          }
        }
      }
      
      await LogAuditEvent('BACKUP_RESTORED', 'system', storeId, stats, req.headers['x-user-id'] || 'api');
      
      return sendSuccess(res, {
        message: 'Restore completed',
        stats,
        originalBackupDate: backup.metadata.createdAt
      });
    } catch (error) {
      console.error('Restore error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

// ============================================================
// ROLE-BASED ACCESS CONTROL (RBAC)
// ============================================================

/**
 * Role definitions with permissions
 */
const ROLES = {
  admin: {
    level: 100,
    permissions: ['*'] // Full access
  },
  manager: {
    level: 75,
    permissions: [
      'transactions:*', 'customers:*', 'inventory:*', 
      'employees:read', 'employees:create', 'employees:update',
      'reports:*', 'bookings:*', 'tabs:*', 'giftCards:*',
      'settings:read'
    ]
  },
  staff: {
    level: 50,
    permissions: [
      'transactions:create', 'transactions:read',
      'customers:read', 'customers:create', 'customers:update',
      'inventory:read', 'bookings:*', 'tabs:*',
      'giftCards:read', 'giftCards:redeem'
    ]
  },
  readonly: {
    level: 10,
    permissions: [
      'transactions:read', 'customers:read', 'inventory:read',
      'bookings:read', 'reports:read'
    ]
  }
};

/**
 * Check if a role has a specific permission
 */
function hasPermission(role, permission) {
  const roleConfig = ROLES[role];
  if (!roleConfig) return false;
  
  // Admin has all permissions
  if (roleConfig.permissions.includes('*')) return true;
  
  // Check exact permission
  if (roleConfig.permissions.includes(permission)) return true;
  
  // Check wildcard (e.g., 'transactions:*' matches 'transactions:create')
  const [resource] = permission.split(':');
  if (roleConfig.permissions.includes(`${resource}:*`)) return true;
  
  return false;
}

/**
 * Middleware to check permissions
 */
async function checkPermission(req, permission) {
  const db = admin.firestore();
  
  // Get employee from PIN or user ID
  const employeeId = req.headers['x-employee-id'];
  const employeePin = req.headers['x-employee-pin'];
  
  if (!employeeId && !employeePin) {
    return { allowed: false, error: 'Employee identification required' };
  }
  
  try {
    let employeeDoc;
    
    if (employeeId) {
      employeeDoc = await db.collection('employees').doc(employeeId).get();
    } else {
      const pinQuery = await db.collection('employees')
        .where('pin', '==', employeePin)
        .where('active', '==', true)
        .limit(1)
        .get();
      
      if (!pinQuery.empty) {
        employeeDoc = pinQuery.docs[0];
      }
    }
    
    if (!employeeDoc || !employeeDoc.exists) {
      return { allowed: false, error: 'Employee not found' };
    }
    
    const employee = employeeDoc.data();
    const role = employee.role || 'staff';
    
    if (!hasPermission(role, permission)) {
      return { 
        allowed: false, 
        error: `Insufficient permissions. Required: ${permission}`,
        employeeRole: role
      };
    }
    
    return { 
      allowed: true, 
      employeeId: employeeDoc.id,
      employeeName: `${employee.firstName} ${employee.lastName}`,
      role
    };
  } catch (error) {
    console.error('Permission check error:', error);
    return { allowed: false, error: 'Permission check failed' };
  }
}

/**
 * Validate employee permissions endpoint
 */
exports.validatePermission = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const { permission } = req.query;
    
    if (!permission) {
      return res.status(400).json({ error: 'Permission parameter required' });
    }
    
    const result = await checkPermission(req, permission);
    
    if (result.allowed) {
      return sendSuccess(res, {
        allowed: true,
        employeeId: result.employeeId,
        employeeName: result.employeeName,
        role: result.role
      });
    } else {
      return res.status(403).json({
        allowed: false,
        error: result.error,
        role: result.employeeRole
      });
    }
  });
});

/**
 * Get role definitions (for UI display)
 */
exports.getRoles = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    // Return sanitized roles (without internal details)
    const sanitizedRoles = {};
    Object.entries(ROLES).forEach(([name, config]) => {
      sanitizedRoles[name] = {
        level: config.level,
        permissions: config.permissions
      };
    });
    
    return sendSuccess(res, { roles: sanitizedRoles });
  });
});

// ============================================================
// SHIFT MANAGEMENT
// ============================================================

/**
 * Clock in/out and shift management
 */
exports.shiftManagement = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { action, employeeId, storeId = 'golfcove', notes } = req.body;
    
    if (!action || !employeeId) {
      return res.status(400).json({ error: 'Action and employeeId required' });
    }
    
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    
    try {
      switch (action) {
        case 'clockIn': {
          // Check if already clocked in
          const activeShift = await db.collection('shifts')
            .where('employeeId', '==', employeeId)
            .where('storeId', '==', storeId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
          
          if (!activeShift.empty) {
            return res.status(400).json({ error: 'Already clocked in' });
          }
          
          // Create new shift
          const shiftRef = await db.collection('shifts').add({
            employeeId,
            storeId,
            clockIn: admin.firestore.FieldValue.serverTimestamp(),
            clockOut: null,
            breaks: [],
            status: 'active',
            date: today,
            notes: notes || '',
            sales: { count: 0, total: 0 },
            createdAt: admin.firestore.FieldValue.serverTimestamp()
          });
          
          await LogAuditEvent('CLOCK_IN', 'shift', shiftRef.id, { employeeId }, employeeId);
          
          return sendSuccess(res, { 
            shiftId: shiftRef.id, 
            clockIn: now.toISOString(),
            message: 'Clocked in successfully'
          });
        }
        
        case 'clockOut': {
          // Find active shift
          const activeShift = await db.collection('shifts')
            .where('employeeId', '==', employeeId)
            .where('storeId', '==', storeId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
          
          if (activeShift.empty) {
            return res.status(400).json({ error: 'No active shift found' });
          }
          
          const shiftDoc = activeShift.docs[0];
          const shiftData = shiftDoc.data();
          const clockInTime = shiftData.clockIn?.toDate() || new Date();
          
          // Calculate hours worked
          let totalBreakMs = 0;
          if (shiftData.breaks && shiftData.breaks.length > 0) {
            shiftData.breaks.forEach(brk => {
              if (brk.start && brk.end) {
                totalBreakMs += (new Date(brk.end) - new Date(brk.start));
              }
            });
          }
          
          const workedMs = now - clockInTime - totalBreakMs;
          const hoursWorked = Math.round(workedMs / (1000 * 60 * 60) * 100) / 100;
          
          await shiftDoc.ref.update({
            clockOut: admin.firestore.FieldValue.serverTimestamp(),
            status: 'completed',
            hoursWorked,
            notes: notes || shiftData.notes
          });
          
          await LogAuditEvent('CLOCK_OUT', 'shift', shiftDoc.id, { 
            employeeId, 
            hoursWorked 
          }, employeeId);
          
          return sendSuccess(res, { 
            shiftId: shiftDoc.id,
            clockOut: now.toISOString(),
            hoursWorked,
            message: 'Clocked out successfully'
          });
        }
        
        case 'startBreak': {
          const activeShift = await db.collection('shifts')
            .where('employeeId', '==', employeeId)
            .where('storeId', '==', storeId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
          
          if (activeShift.empty) {
            return res.status(400).json({ error: 'No active shift found' });
          }
          
          const shiftDoc = activeShift.docs[0];
          const breaks = shiftDoc.data().breaks || [];
          
          // Check if already on break
          const currentBreak = breaks.find(b => b.start && !b.end);
          if (currentBreak) {
            return res.status(400).json({ error: 'Already on break' });
          }
          
          breaks.push({
            start: now.toISOString(),
            end: null,
            type: req.body.breakType || 'regular'
          });
          
          await shiftDoc.ref.update({ breaks });
          
          return sendSuccess(res, { message: 'Break started' });
        }
        
        case 'endBreak': {
          const activeShift = await db.collection('shifts')
            .where('employeeId', '==', employeeId)
            .where('storeId', '==', storeId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
          
          if (activeShift.empty) {
            return res.status(400).json({ error: 'No active shift found' });
          }
          
          const shiftDoc = activeShift.docs[0];
          const breaks = shiftDoc.data().breaks || [];
          
          const currentBreakIndex = breaks.findIndex(b => b.start && !b.end);
          if (currentBreakIndex === -1) {
            return res.status(400).json({ error: 'Not on break' });
          }
          
          breaks[currentBreakIndex].end = now.toISOString();
          
          await shiftDoc.ref.update({ breaks });
          
          return sendSuccess(res, { message: 'Break ended' });
        }
        
        case 'getActiveShift': {
          const activeShift = await db.collection('shifts')
            .where('employeeId', '==', employeeId)
            .where('storeId', '==', storeId)
            .where('status', '==', 'active')
            .limit(1)
            .get();
          
          if (activeShift.empty) {
            return sendSuccess(res, { activeShift: null });
          }
          
          const shiftData = activeShift.docs[0].data();
          return sendSuccess(res, { 
            activeShift: {
              id: activeShift.docs[0].id,
              ...shiftData,
              clockIn: shiftData.clockIn?.toDate?.()?.toISOString()
            }
          });
        }
        
        default:
          return res.status(400).json({ error: 'Invalid action' });
      }
    } catch (error) {
      console.error('Shift management error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

/**
 * Get shift history and reports
 */
exports.getShifts = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { 
      storeId = 'golfcove', 
      employeeId, 
      startDate, 
      endDate,
      status,
      limit: queryLimit = 100 
    } = req.query;
    
    try {
      let query = db.collection('shifts').where('storeId', '==', storeId);
      
      if (employeeId) {
        query = query.where('employeeId', '==', employeeId);
      }
      if (status) {
        query = query.where('status', '==', status);
      }
      if (startDate) {
        query = query.where('date', '>=', startDate);
      }
      if (endDate) {
        query = query.where('date', '<=', endDate);
      }
      
      query = query.orderBy('date', 'desc').limit(parseInt(queryLimit));
      
      const snapshot = await query.get();
      const shifts = snapshot.docs.map(doc => {
        const data = doc.data();
        return {
          id: doc.id,
          ...data,
          clockIn: data.clockIn?.toDate?.()?.toISOString(),
          clockOut: data.clockOut?.toDate?.()?.toISOString()
        };
      });
      
      // Calculate summary
      const summary = {
        totalShifts: shifts.length,
        totalHours: shifts.reduce((sum, s) => sum + (s.hoursWorked || 0), 0),
        totalSales: shifts.reduce((sum, s) => sum + (s.sales?.total || 0), 0)
      };
      
      return sendSuccess(res, { shifts, summary });
    } catch (error) {
      console.error('Get shifts error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

// ============================================================
// RECEIPT & TRANSACTION MANAGEMENT
// ============================================================

/**
 * Generate and store digital receipt
 */
exports.generateReceipt = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const db = admin.firestore();
    const { 
      transactionId,
      storeId = 'golfcove',
      items,
      subtotal,
      tax,
      discount,
      tip,
      total,
      paymentMethod,
      employeeId,
      customerId,
      customerEmail,
      sendEmail = false
    } = req.body;
    
    if (!transactionId || !items || !total) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    
    try {
      // Get store info
      const storeDoc = await db.collection('settings').doc(storeId).get();
      const storeInfo = storeDoc.exists ? storeDoc.data() : {
        businessName: 'Golf Cove',
        address: '336 State Street, North Haven, CT 06473',
        phone: '(203) 555-0100'
      };
      
      // Get employee info
      let employeeName = 'Staff';
      if (employeeId) {
        const empDoc = await db.collection('employees').doc(employeeId).get();
        if (empDoc.exists) {
          const emp = empDoc.data();
          employeeName = `${emp.firstName} ${emp.lastName}`;
        }
      }
      
      // Generate receipt number
      const receiptNumber = `R${Date.now().toString(36).toUpperCase()}`;
      
      // Build receipt data
      const receipt = {
        receiptNumber,
        transactionId,
        storeId,
        storeInfo,
        items: items.map(item => ({
          name: item.name,
          quantity: item.qty || item.quantity || 1,
          price: item.price,
          total: (item.price * (item.qty || item.quantity || 1))
        })),
        subtotal,
        tax,
        taxRate: TAX_RATE,
        discount: discount || 0,
        tip: tip || 0,
        total,
        paymentMethod,
        employeeId,
        employeeName,
        customerId: customerId || null,
        customerEmail: customerEmail || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        printedAt: null,
        emailedAt: null
      };
      
      // Store receipt
      await db.collection('receipts').doc(receiptNumber).set(receipt);
      
      // Update transaction with receipt number
      if (transactionId) {
        await db.collection('transactions').doc(transactionId).update({
          receiptNumber,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      // TODO: Send email if requested (requires email service setup)
      if (sendEmail && customerEmail) {
        // Email sending would go here
        receipt.emailedAt = new Date().toISOString();
      }
      
      return sendSuccess(res, { 
        receiptNumber,
        receipt: {
          ...receipt,
          createdAt: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Generate receipt error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

/**
 * Get receipt by number or transaction ID
 */
exports.getReceipt = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { receiptNumber, transactionId } = req.query;
    
    if (!receiptNumber && !transactionId) {
      return res.status(400).json({ error: 'receiptNumber or transactionId required' });
    }
    
    try {
      let receiptDoc;
      
      if (receiptNumber) {
        receiptDoc = await db.collection('receipts').doc(receiptNumber).get();
      } else {
        const query = await db.collection('receipts')
          .where('transactionId', '==', transactionId)
          .limit(1)
          .get();
        if (!query.empty) {
          receiptDoc = query.docs[0];
        }
      }
      
      if (!receiptDoc || !receiptDoc.exists) {
        return res.status(404).json({ error: 'Receipt not found' });
      }
      
      const data = receiptDoc.data();
      return sendSuccess(res, {
        receipt: {
          ...data,
          createdAt: data.createdAt?.toDate?.()?.toISOString()
        }
      });
    } catch (error) {
      console.error('Get receipt error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

/**
 * Void a transaction (manager only)
 */
exports.voidTransaction = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }
    
    // Check manager permission
    const permResult = await checkPermission(req, 'transactions:void');
    if (!permResult.allowed) {
      return res.status(403).json({ error: permResult.error });
    }
    
    const db = admin.firestore();
    const { transactionId, reason, storeId = 'golfcove' } = req.body;
    
    if (!transactionId || !reason) {
      return res.status(400).json({ error: 'transactionId and reason required' });
    }
    
    try {
      const txDoc = await db.collection('transactions').doc(transactionId).get();
      
      if (!txDoc.exists) {
        return res.status(404).json({ error: 'Transaction not found' });
      }
      
      const txData = txDoc.data();
      
      // Can't void already voided or refunded
      if (txData.status === 'voided') {
        return res.status(400).json({ error: 'Transaction already voided' });
      }
      if (txData.status === 'refunded') {
        return res.status(400).json({ error: 'Cannot void refunded transaction' });
      }
      
      // Update transaction
      await txDoc.ref.update({
        status: 'voided',
        voidedBy: permResult.employeeId,
        voidedAt: admin.firestore.FieldValue.serverTimestamp(),
        voidReason: reason
      });
      
      // Restore inventory if applicable
      if (txData.items && Array.isArray(txData.items)) {
        const batch = db.batch();
        for (const item of txData.items) {
          if (item.inventoryId) {
            const invRef = db.collection('inventory').doc(item.inventoryId);
            batch.update(invRef, {
              quantity: admin.firestore.FieldValue.increment(item.quantity || 1)
            });
          }
        }
        await batch.commit();
      }
      
      // Log audit
      await LogAuditEvent('TRANSACTION_VOIDED', 'transaction', transactionId, {
        reason,
        originalTotal: txData.total,
        voidedBy: permResult.employeeName
      }, permResult.employeeId);
      
      return sendSuccess(res, { 
        message: 'Transaction voided successfully',
        transactionId
      });
    } catch (error) {
      console.error('Void transaction error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

// ============================================================
// DISCOUNT & PROMOTION MANAGEMENT
// ============================================================

/**
 * Manage discounts and promotions
 */
exports.discounts = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const storeId = req.body.storeId || req.query.storeId || 'golfcove';
    
    try {
      if (req.method === 'GET') {
        // List active discounts
        const now = new Date();
        const snapshot = await db.collection('discounts')
          .where('storeId', '==', storeId)
          .where('active', '==', true)
          .get();
        
        const discounts = snapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(d => {
            if (d.startDate && new Date(d.startDate) > now) return false;
            if (d.endDate && new Date(d.endDate) < now) return false;
            return true;
          });
        
        return sendSuccess(res, { discounts });
      }
      
      if (req.method === 'POST') {
        // Check permission
        const permResult = await checkPermission(req, 'discounts:create');
        if (!permResult.allowed) {
          return res.status(403).json({ error: permResult.error });
        }
        
        const { 
          name, 
          type, // 'percent', 'fixed', 'bogo', 'bundle'
          value, 
          code,
          minPurchase,
          maxDiscount,
          applicableTo, // 'all', 'category', 'item', 'membership'
          applicableIds,
          startDate,
          endDate,
          usageLimit,
          description
        } = req.body;
        
        if (!name || !type || value === undefined) {
          return res.status(400).json({ error: 'name, type, and value required' });
        }
        
        const discount = {
          name,
          type,
          value,
          code: code || null,
          minPurchase: minPurchase || 0,
          maxDiscount: maxDiscount || null,
          applicableTo: applicableTo || 'all',
          applicableIds: applicableIds || [],
          startDate: startDate || null,
          endDate: endDate || null,
          usageLimit: usageLimit || null,
          usageCount: 0,
          description: description || '',
          storeId,
          active: true,
          createdBy: permResult.employeeId,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        };
        
        const docRef = await db.collection('discounts').add(discount);
        
        await LogAuditEvent('DISCOUNT_CREATED', 'discount', docRef.id, discount, permResult.employeeId);
        
        return sendSuccess(res, { 
          discountId: docRef.id,
          discount
        });
      }
      
      return res.status(405).json({ error: 'Method not allowed' });
    } catch (error) {
      console.error('Discounts error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

/**
 * Validate and apply discount code
 */
exports.validateDiscount = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { code, subtotal, items, customerId, storeId = 'golfcove' } = req.body;
    
    if (!code) {
      return res.status(400).json({ error: 'Discount code required' });
    }
    
    try {
      // Find discount by code
      const snapshot = await db.collection('discounts')
        .where('storeId', '==', storeId)
        .where('code', '==', code.toUpperCase())
        .where('active', '==', true)
        .limit(1)
        .get();
      
      if (snapshot.empty) {
        return res.status(404).json({ 
          valid: false, 
          error: 'Invalid discount code' 
        });
      }
      
      const discount = { id: snapshot.docs[0].id, ...snapshot.docs[0].data() };
      const now = new Date();
      
      // Check date validity
      if (discount.startDate && new Date(discount.startDate) > now) {
        return res.status(400).json({ 
          valid: false, 
          error: 'Discount not yet active' 
        });
      }
      if (discount.endDate && new Date(discount.endDate) < now) {
        return res.status(400).json({ 
          valid: false, 
          error: 'Discount has expired' 
        });
      }
      
      // Check usage limit
      if (discount.usageLimit && discount.usageCount >= discount.usageLimit) {
        return res.status(400).json({ 
          valid: false, 
          error: 'Discount usage limit reached' 
        });
      }
      
      // Check minimum purchase
      if (discount.minPurchase && subtotal < discount.minPurchase) {
        return res.status(400).json({ 
          valid: false, 
          error: `Minimum purchase of $${discount.minPurchase.toFixed(2)} required` 
        });
      }
      
      // Calculate discount amount
      let discountAmount = 0;
      
      if (discount.type === 'percent') {
        discountAmount = subtotal * (discount.value / 100);
      } else if (discount.type === 'fixed') {
        discountAmount = discount.value;
      }
      
      // Apply max discount cap
      if (discount.maxDiscount && discountAmount > discount.maxDiscount) {
        discountAmount = discount.maxDiscount;
      }
      
      // Can't exceed subtotal
      if (discountAmount > subtotal) {
        discountAmount = subtotal;
      }
      
      return sendSuccess(res, {
        valid: true,
        discount: {
          id: discount.id,
          name: discount.name,
          type: discount.type,
          value: discount.value,
          discountAmount: Math.round(discountAmount * 100) / 100
        }
      });
    } catch (error) {
      console.error('Validate discount error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

// ============================================================
// CUSTOMER LOYALTY POINTS
// ============================================================

/**
 * Manage customer loyalty points
 */
exports.loyaltyPoints = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { action, customerId, storeId = 'golfcove' } = { ...req.body, ...req.query };
    
    if (!customerId) {
      return res.status(400).json({ error: 'customerId required' });
    }
    
    try {
      const loyaltyRef = db.collection('loyalty').doc(`${storeId}_${customerId}`);
      const loyaltyDoc = await loyaltyRef.get();
      
      // Initialize if doesn't exist
      if (!loyaltyDoc.exists) {
        await loyaltyRef.set({
          customerId,
          storeId,
          points: 0,
          lifetimePoints: 0,
          tier: 'bronze',
          history: [],
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }
      
      const loyaltyData = (await loyaltyRef.get()).data();
      
      if (req.method === 'GET' || action === 'balance') {
        return sendSuccess(res, {
          points: loyaltyData.points,
          lifetimePoints: loyaltyData.lifetimePoints,
          tier: loyaltyData.tier,
          nextTier: getNextTier(loyaltyData.tier),
          pointsToNextTier: getPointsToNextTier(loyaltyData.lifetimePoints)
        });
      }
      
      if (action === 'earn') {
        const { amount, transactionId, description } = req.body;
        
        // 1 point per dollar spent
        const pointsToAdd = Math.floor(amount);
        
        // Tier multipliers
        const multipliers = { bronze: 1, silver: 1.25, gold: 1.5, platinum: 2 };
        const actualPoints = Math.floor(pointsToAdd * (multipliers[loyaltyData.tier] || 1));
        
        const newTotal = loyaltyData.points + actualPoints;
        const newLifetime = loyaltyData.lifetimePoints + actualPoints;
        const newTier = calculateTier(newLifetime);
        
        // Add to history
        const history = loyaltyData.history || [];
        history.push({
          type: 'earn',
          points: actualPoints,
          transactionId,
          description: description || `Purchase: $${amount.toFixed(2)}`,
          timestamp: new Date().toISOString()
        });
        
        // Keep last 50 history items
        if (history.length > 50) {
          history.splice(0, history.length - 50);
        }
        
        await loyaltyRef.update({
          points: newTotal,
          lifetimePoints: newLifetime,
          tier: newTier,
          history,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        return sendSuccess(res, {
          pointsEarned: actualPoints,
          newBalance: newTotal,
          tier: newTier,
          tierChanged: newTier !== loyaltyData.tier
        });
      }
      
      if (action === 'redeem') {
        const { points, description } = req.body;
        
        if (!points || points <= 0) {
          return res.status(400).json({ error: 'Invalid points amount' });
        }
        
        if (points > loyaltyData.points) {
          return res.status(400).json({ error: 'Insufficient points' });
        }
        
        const newBalance = loyaltyData.points - points;
        
        // Add to history
        const history = loyaltyData.history || [];
        history.push({
          type: 'redeem',
          points: -points,
          description: description || 'Points redeemed',
          timestamp: new Date().toISOString()
        });
        
        await loyaltyRef.update({
          points: newBalance,
          history,
          updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });
        
        // Calculate dollar value (100 points = $1)
        const dollarValue = points / 100;
        
        return sendSuccess(res, {
          pointsRedeemed: points,
          dollarValue,
          newBalance
        });
      }
      
      return res.status(400).json({ error: 'Invalid action' });
    } catch (error) {
      console.error('Loyalty points error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

// Helper functions for loyalty tiers
function calculateTier(lifetimePoints) {
  if (lifetimePoints >= 10000) return 'platinum';
  if (lifetimePoints >= 5000) return 'gold';
  if (lifetimePoints >= 1000) return 'silver';
  return 'bronze';
}

function getNextTier(currentTier) {
  const tiers = ['bronze', 'silver', 'gold', 'platinum'];
  const idx = tiers.indexOf(currentTier);
  return idx < tiers.length - 1 ? tiers[idx + 1] : null;
}

function getPointsToNextTier(lifetimePoints) {
  if (lifetimePoints >= 10000) return 0;
  if (lifetimePoints >= 5000) return 10000 - lifetimePoints;
  if (lifetimePoints >= 1000) return 5000 - lifetimePoints;
  return 1000 - lifetimePoints;
}

// ============================================================
// REAL-TIME SYNC ENDPOINT
// ============================================================

/**
 * Get changes since last sync for offline-capable POS
 */
exports.syncChanges = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    const apiKeyResult = verifyApiKey(req);
    if (!apiKeyResult.valid) {
      return sendError(res, 'API_KEY_INVALID');
    }
    
    const db = admin.firestore();
    const { 
      storeId = 'golfcove', 
      lastSyncTime,
      collections = ['inventory', 'employees', 'customers', 'discounts']
    } = req.body;
    
    const syncFrom = lastSyncTime ? new Date(lastSyncTime) : new Date(0);
    
    try {
      const changes = {};
      
      for (const collection of collections) {
        const snapshot = await db.collection(collection)
          .where('storeId', '==', storeId)
          .where('updatedAt', '>', syncFrom)
          .get();
        
        changes[collection] = snapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data(),
          _syncedAt: new Date().toISOString()
        }));
      }
      
      return sendSuccess(res, {
        changes,
        syncedAt: new Date().toISOString(),
        hasChanges: Object.values(changes).some(arr => arr.length > 0)
      });
    } catch (error) {
      console.error('Sync changes error:', error);
      return sendError(res, 'INTERNAL_ERROR', error.message);
    }
  });
});

// ============================================================
// STRIPE FUNCTION ALIASES
// For backward compatibility with client-side code
// ============================================================
exports.stripeCreatePaymentIntent = exports.createPaymentIntent;
exports.stripeCapturePayment = exports.capturePayment;
exports.stripeCancelPayment = exports.cancelPayment;
exports.stripeConnectionToken = exports.createConnectionToken;
exports.stripeRefund = exports.createRefund;
exports.stripeRegisterReader = exports.registerReader;
exports.stripeListReaders = exports.listReaders;

/**
 * Save global site settings (Stripe keys, etc.)
 * These settings are shared across all devices/browsers
 */
exports.saveGlobalSettings = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const db = admin.firestore();
      const { stripePublishableKey, stripeTerminalLocation, businessName, taxRate } = req.body;
      
      const settings = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };
      
      // Only update provided fields (partial update support)
      if (stripePublishableKey !== undefined) settings.stripePublishableKey = stripePublishableKey;
      if (stripeTerminalLocation !== undefined) settings.stripeTerminalLocation = stripeTerminalLocation;
      if (businessName !== undefined) settings.businessName = businessName;
      if (taxRate !== undefined) settings.taxRate = taxRate;
      
      await db.collection('settings').doc('global').set(settings, { merge: true });
      
      res.json({ success: true, message: 'Settings saved successfully' });
    } catch (error) {
      console.error('Save settings error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get global site settings
 */
exports.getGlobalSettings = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const db = admin.firestore();
      const doc = await db.collection('settings').doc('global').get();
      
      if (!doc.exists) {
        return res.json({ 
          success: true, 
          settings: {
            stripePublishableKey: '',
            stripeTerminalLocation: '',
            businessName: 'Golf Cove',
            taxRate: 0.0635
          }
        });
      }
      
      res.json({ success: true, settings: doc.data() });
    } catch (error) {
      console.error('Get settings error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

// ============ SAVED PAYMENT METHODS FOR MEMBERS ============

/**
 * Create or get a Stripe Customer for a member
 */
exports.createStripeCustomer = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const db = admin.firestore();
      const { customerId, email, name, phone } = req.body;

      if (!customerId) {
        return res.status(400).json({ error: 'Customer ID required' });
      }

      // Check if customer already has a Stripe customer ID
      const customerDoc = await db.collection('customers').doc(customerId).get();
      
      if (customerDoc.exists && customerDoc.data().stripeCustomerId) {
        // Return existing Stripe customer
        const stripeCustomer = await stripe.customers.retrieve(customerDoc.data().stripeCustomerId);
        return res.json({ 
          success: true, 
          stripeCustomerId: stripeCustomer.id,
          isNew: false
        });
      }

      // Create new Stripe customer
      const stripeCustomer = await stripe.customers.create({
        email: email || undefined,
        name: name || undefined,
        phone: phone || undefined,
        metadata: {
          golfCoveCustomerId: customerId
        }
      });

      // Save Stripe customer ID to our database
      await db.collection('customers').doc(customerId).set({
        stripeCustomerId: stripeCustomer.id,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      res.json({ 
        success: true, 
        stripeCustomerId: stripeCustomer.id,
        isNew: true
      });
    } catch (error) {
      console.error('Create Stripe customer error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Create a SetupIntent for saving a card
 */
exports.createSetupIntent = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { stripeCustomerId } = req.body;

      if (!stripeCustomerId) {
        return res.status(400).json({ error: 'Stripe Customer ID required' });
      }

      const setupIntent = await stripe.setupIntents.create({
        customer: stripeCustomerId,
        payment_method_types: ['card'],
        usage: 'off_session' // Allow charging later without customer present
      });

      res.json({ 
        success: true, 
        clientSecret: setupIntent.client_secret,
        setupIntentId: setupIntent.id
      });
    } catch (error) {
      console.error('Create SetupIntent error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Get saved payment methods for a customer
 */
exports.getSavedPaymentMethods = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      const stripeCustomerId = req.query.stripeCustomerId || req.body?.stripeCustomerId;

      if (!stripeCustomerId) {
        return res.status(400).json({ error: 'Stripe Customer ID required' });
      }

      const paymentMethods = await stripe.paymentMethods.list({
        customer: stripeCustomerId,
        type: 'card'
      });

      res.json({ 
        success: true, 
        paymentMethods: paymentMethods.data.map(pm => ({
          id: pm.id,
          brand: pm.card.brand,
          last4: pm.card.last4,
          expMonth: pm.card.exp_month,
          expYear: pm.card.exp_year,
          isDefault: false // Could implement default logic
        }))
      });
    } catch (error) {
      console.error('Get payment methods error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Charge a saved payment method
 */
exports.chargesSavedCard = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const { stripeCustomerId, paymentMethodId, amount, description, metadata } = req.body;

      if (!stripeCustomerId || !paymentMethodId || !amount) {
        return res.status(400).json({ error: 'Customer ID, Payment Method ID, and amount required' });
      }

      if (amount < 50) {
        return res.status(400).json({ error: 'Amount must be at least 50 cents' });
      }

      const paymentIntent = await stripe.paymentIntents.create({
        amount: Math.round(amount),
        currency: 'usd',
        customer: stripeCustomerId,
        payment_method: paymentMethodId,
        off_session: true,
        confirm: true,
        description: description || 'Golf Cove Purchase',
        metadata: {
          source: 'saved_card',
          ...metadata
        }
      });

      res.json({ 
        success: true, 
        paymentIntentId: paymentIntent.id,
        status: paymentIntent.status,
        amount: paymentIntent.amount
      });
    } catch (error) {
      console.error('Charge saved card error:', error);
      
      // Handle specific Stripe errors
      if (error.code === 'authentication_required') {
        return res.status(400).json({ 
          error: 'Card requires authentication',
          requiresAction: true,
          clientSecret: error.raw?.payment_intent?.client_secret
        });
      }
      
      res.status(500).json({ error: error.message });
    }
  });
});

/**
 * Delete a saved payment method
 */
exports.deletePaymentMethod = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    if (req.method !== 'POST' && req.method !== 'DELETE') {
      return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
      const paymentMethodId = req.body?.paymentMethodId || req.query?.paymentMethodId;

      if (!paymentMethodId) {
        return res.status(400).json({ error: 'Payment Method ID required' });
      }

      await stripe.paymentMethods.detach(paymentMethodId);

      res.json({ success: true, message: 'Payment method removed' });
    } catch (error) {
      console.error('Delete payment method error:', error);
      res.status(500).json({ error: error.message });
    }
  });
});
