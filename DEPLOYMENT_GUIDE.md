# Golf Cove - Production Deployment Guide

## Prerequisites

1. **Firebase CLI**: `npm install -g firebase-tools`
2. **Node.js**: v18 or v20
3. **Firebase Project**: Created at [Firebase Console](https://console.firebase.google.com)
4. **Stripe Account**: For payment processing
5. **Domain** (optional): For custom domain hosting

---

## Step 1: Firebase Project Setup

### 1.1 Login to Firebase
```bash
firebase login
```

### 1.2 Initialize Project (if not done)
```bash
firebase init
```
Select:
- ✅ Functions
- ✅ Hosting
- ✅ Firestore

### 1.3 Select or Create Project
```bash
firebase use --add
```

---

## Step 2: Environment Configuration

### 2.1 Set Production Secrets
```bash
# API Authentication Key (generate a secure random string)
firebase functions:config:set api.key="gc-prod-$(openssl rand -hex 16)"

# Stripe Production Keys
firebase functions:config:set stripe.secret="sk_live_XXXXXXXXXXXX"
firebase functions:config:set stripe.publishable="pk_live_XXXXXXXXXXXX"
firebase functions:config:set stripe.webhook_secret="whsec_XXXXXXXXXXXX"

# Terminal (if using Stripe Terminal)
firebase functions:config:set stripe.terminal.location="tml_XXXXXXXXXXXX"
```

### 2.2 Verify Configuration
```bash
firebase functions:config:get
```

---

## Step 3: Firestore Security Rules

### 3.1 Deploy Security Rules
Review `firebase-security-rules.json` then:
```bash
firebase deploy --only firestore:rules
```

### 3.2 Key Security Settings
- Customers: Read/write for authenticated users
- Transactions: Read/write for authenticated users, no deletion
- Employees: Manager+ for write, staff for read
- Settings: Admin only

---

## Step 4: Deploy Functions

### 4.1 Install Dependencies
```bash
cd functions
npm install
```

### 4.2 Test Locally (Recommended)
```bash
firebase emulators:start
```

### 4.3 Deploy to Production
```bash
firebase deploy --only functions
```

### 4.4 Verify Deployment
```bash
curl https://us-central1-YOUR-PROJECT.cloudfunctions.net/health
```

---

## Step 5: Deploy Hosting

### 5.1 Build Frontend (if applicable)
No build step needed for static files.

### 5.2 Deploy Hosting
```bash
firebase deploy --only hosting
```

---

## Step 6: Stripe Configuration

### 6.1 Webhook Setup
1. Go to [Stripe Dashboard → Webhooks](https://dashboard.stripe.com/webhooks)
2. Add endpoint: `https://us-central1-YOUR-PROJECT.cloudfunctions.net/stripeWebhook`
3. Select events:
   - `payment_intent.succeeded`
   - `payment_intent.payment_failed`
   - `charge.refunded`
   - `customer.subscription.*`
   - `invoice.paid`
   - `invoice.payment_failed`
4. Copy signing secret to Firebase config

### 6.2 Terminal Setup (Optional)
1. [Register Terminal](https://dashboard.stripe.com/terminal)
2. Create Location
3. Register Reader
4. Update frontend config with location ID

---

## Step 7: Configure Frontend

### 7.1 Update Configuration
Edit `js/config-unified.js`:
```javascript
const GolfCoveConfig = {
  firebase: {
    apiKey: "YOUR_FIREBASE_API_KEY",
    authDomain: "YOUR-PROJECT.firebaseapp.com",
    projectId: "YOUR-PROJECT",
    storageBucket: "YOUR-PROJECT.appspot.com",
    messagingSenderId: "YOUR_SENDER_ID",
    appId: "YOUR_APP_ID"
  },
  stripe: {
    publishableKey: "pk_live_XXXXXXXXXXXX",
    terminalLocation: "tml_XXXXXXXXXXXX"
  },
  api: {
    baseUrl: "https://us-central1-YOUR-PROJECT.cloudfunctions.net",
    key: "YOUR_API_KEY"
  }
};
```

---

## Step 8: Initial Data Setup

### 8.1 Create Admin Employee
```javascript
// Run in Firebase Console or using API
const adminEmployee = {
  firstName: "Admin",
  lastName: "User",
  pin: "0000",
  role: "admin",
  active: true,
  storeId: "golfcove",
  createdAt: new Date()
};
```

### 8.2 Initialize Inventory
Use `menu-data.js` to sync initial inventory:
```javascript
GolfCoveMenu.getAllItems().forEach(item => {
  // Add to Firestore inventory collection
});
```

### 8.3 Configure Business Settings
```javascript
const settings = {
  storeId: "golfcove",
  businessName: "Golf Cove",
  address: "123 Main St, Town, CT 06000",
  phone: "(555) 123-4567",
  email: "info@golfcove.com",
  taxRate: 0.0635,
  timezone: "America/New_York",
  operatingHours: {
    monday: { open: "09:00", close: "22:00" },
    // ... etc
  }
};
```

---

## Step 9: Testing Checklist

### Pre-Launch Tests
- [ ] Health endpoint returns healthy
- [ ] Create test customer
- [ ] Create test booking
- [ ] Process test payment (use test card)
- [ ] Create and redeem gift card
- [ ] Open and close tab
- [ ] Check daily report generation
- [ ] Verify webhook events received
- [ ] Test employee PIN login
- [ ] Test role-based permissions
- [ ] Backup/restore data

### Test Cards (Stripe Test Mode)
- Success: `4242 4242 4242 4242`
- Decline: `4000 0000 0000 0002`
- Requires Auth: `4000 0025 0000 3155`

---

## Step 10: Monitoring

### 10.1 Firebase Console
- Functions → Logs
- Firestore → Data
- Hosting → Usage

### 10.2 Stripe Dashboard
- Payments
- Webhooks → Recent deliveries
- Events

### 10.3 Set Up Alerts
1. Firebase Console → Project Settings → Integrations
2. Enable Slack/email alerts for:
   - Function errors
   - High latency
   - Quota warnings

---

## Maintenance

### Daily Tasks
- Check for unread alerts (low stock, expiring memberships)
- Review daily sales summary

### Weekly Tasks
- Review weekly report
- Check audit log for anomalies
- Verify inventory accuracy

### Monthly Tasks
- Download transaction data backup
- Review customer analytics
- Check employee performance reports

---

## Rollback Procedure

### If Issues Arise:
```bash
# List deployed functions
firebase functions:list

# Delete problematic function
firebase functions:delete functionName

# Rollback to previous version
firebase hosting:clone VERSION_ID
```

### Restore Data:
```bash
curl -X POST https://YOUR-URL/restoreData \
  -H "X-API-Key: YOUR_KEY" \
  -H "Content-Type: application/json" \
  -d '{"backup": {...}, "overwrite": false}'
```

---

## Security Checklist

- [ ] Change default API key
- [ ] Enable Firebase App Check
- [ ] Configure CORS for production domain only
- [ ] Set up Cloud Armor (for DDoS protection)
- [ ] Enable Firestore security rules
- [ ] Use production Stripe keys (not test)
- [ ] Set up regular backups
- [ ] Configure 2FA for Firebase admin accounts
- [ ] Review audit logs regularly
- [ ] Set up Stripe Radar for fraud detection

---

## Support

For issues:
1. Check Firebase Functions logs
2. Check Stripe webhook logs
3. Review audit_log collection in Firestore
4. Check browser console for frontend errors

---

## Cost Estimation

### Firebase (Blaze Plan Required for Functions)
- Functions: ~$0.40 per million invocations
- Firestore: $0.18 per 100k reads, $0.18 per 100k writes
- Hosting: Free up to 10GB/month

### Stripe
- 2.9% + $0.30 per transaction
- Terminal: 2.7% + $0.05 per in-person transaction

Estimated monthly cost for small business: $20-50 for Firebase + Stripe fees
