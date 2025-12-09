# Golf Cove Backend System

## Overview
Golf Cove is a comprehensive Point of Sale (POS) and booking management system for a Toptracer driving range. The system is built with a modular JavaScript architecture that allows for easy maintenance and future improvements.

## Architecture

### Technology Stack
- **Frontend**: Vanilla JavaScript with modular IIFE pattern
- **Backend**: Firebase Cloud Functions
- **Database**: Firebase Firestore (with localStorage fallback)
- **Payments**: Stripe Terminal integration
- **Hosting**: Firebase Hosting (https://golfcove.web.app)
- **Authentication**: PIN-based employee auth (synced to Firebase)

### Module Namespace
All modules use the `GolfCove*` namespace pattern (e.g., `GolfCoveBooking`, `GolfCoveCustomers`).

---

## Core Modules

### 1. `js/firebase-sync.js` - GolfCoveFirebase ⭐ NEW
Centralized Firebase communication for all data sync.

**Features:**
- Automatic online/offline detection
- Sync queue for offline changes
- Employee/PIN management with Firebase
- Auto-sync every 30 seconds
- Retry logic with exponential backoff

**Key Methods:**
```javascript
GolfCoveFirebase.getEmployees()         // Fetch employees from Firebase
GolfCoveFirebase.validatePIN(pin)       // Validate PIN against Firebase
GolfCoveFirebase.saveEmployee(data)     // Save employee to Firebase
GolfCoveFirebase.syncAll()              // Full data sync
GolfCoveFirebase.fullPush()             // Push all local data to Firebase
GolfCoveFirebase.getStatus()            // Get sync status
GolfCoveFirebase.addSyncListener(cb)    // Listen for sync events
```

---

### 2. `js/pin-system.js` - GolfCovePIN ⭐ UPDATED
Employee authentication via PIN codes with Firebase sync.

**Features:**
- 4-digit PIN authentication
- Lockout after 5 failed attempts
- 8-hour session timeout
- Firebase-backed PIN validation
- Automatic PIN migration (removes insecure PINs)
- Offline fallback to localStorage

**Key Methods:**
```javascript
GolfCovePIN.init(onSuccess)             // Initialize and show PIN screen
GolfCovePIN.lock()                      // Lock the POS
GolfCovePIN.getCurrentEmployee()        // Get logged-in employee
GolfCovePIN.isManager()                 // Check if current user is manager
GolfCovePIN.addEmployee(name, pin, role) // Add new employee
GolfCovePIN.generatePIN()               // Generate unique secure PIN
GolfCovePIN.syncToFirebase()            // Manual sync to Firebase
```

---

### 3. `js/config.js` - GolfCoveConfig
Central configuration for the entire system.

**Contains:**
- Business information (name, address, contact)
- Operating hours by day
- Pricing (bays, peak hours, tax rate)
- Membership tiers and discounts
- Room/bay definitions
- Feature flags
- Storage key constants

**Key Methods:**
```javascript
GolfCoveConfig.isOpen(date)           // Check if business is open
GolfCoveConfig.getMemberDiscount(tier) // Get discount for membership tier
GolfCoveConfig.isPeakTime(time)        // Check if time is peak hours
GolfCoveConfig.formatCurrency(amount)  // Format as currency
GolfCoveConfig.calculateTax(subtotal)  // Calculate tax amount
```

---

### 4. `js/database.js` - GolfCoveDB
Unified data access layer for all modules.

**Features:**
- Basic CRUD operations with `gc_` prefix
- Collection operations (add, update, remove, query)
- Transaction support with rollback
- Backup/restore functionality
- Export/import JSON
- Indexing for faster lookups
- Migration support

**Key Methods:**
```javascript
GolfCoveDB.get(key)                    // Get item from storage
GolfCoveDB.set(key, value)             // Save item to storage
GolfCoveDB.getCollection(name)         // Get array collection
GolfCoveDB.queryCollection(name, opts) // Query with filters/sort
GolfCoveDB.backup()                    // Full system backup
GolfCoveDB.restore(data)               // Restore from backup
GolfCoveDB.getStats()                  // Storage statistics
```

---

### 3. `js/booking-system.js` - GolfCoveBooking
Full booking/reservation management system.

**Features:**
- Create, update, cancel bookings
- Check-in/check-out flow
- Conflict detection
- Waitlist management
- Peak pricing calculations
- Member discounts

**Key Methods:**
```javascript
GolfCoveBooking.create(data)           // Create new booking
GolfCoveBooking.get(id)                // Get booking by ID
GolfCoveBooking.getForDate(date)       // Get all bookings for date
GolfCoveBooking.checkIn(id)            // Check in customer
GolfCoveBooking.cancel(id, reason)     // Cancel booking
GolfCoveBooking.calculatePrice(opts)   // Calculate booking price
```

---

### 4. `js/customers.js` - GolfCoveCustomers
Customer data management and analytics.

**Features:**
- Customer CRUD operations
- Search by name, email, phone
- Membership management
- Visit tracking
- Transaction history
- VIP detection
- CSV/JSON import/export

**Key Methods:**
```javascript
GolfCoveCustomers.create(data)         // Create customer
GolfCoveCustomers.search(query)        // Search customers
GolfCoveCustomers.setMembership(id, tier, expiry)
GolfCoveCustomers.recordVisit(id)      // Log visit
GolfCoveCustomers.getStats()           // Customer analytics
GolfCoveCustomers.exportToCSV()        // Export all customers
```

---

### 5. `js/employees.js` - GolfCoveEmployees
Employee management with scheduling and time clock.

**Features:**
- Employee CRUD with PIN authentication
- Role-based permissions (admin, manager, staff, cashier)
- Time clock (clock in/out)
- Shift scheduling
- Payroll reports

**Roles & Permissions:**
- `admin` - Full access
- `manager` - POS, bookings, reports, refunds, discounts, employees
- `supervisor` - POS, bookings, reports, refunds, discounts
- `staff` - POS, bookings
- `cashier` - POS only

**Key Methods:**
```javascript
GolfCoveEmployees.create(data)         // Create employee
GolfCoveEmployees.getByPIN(pin)        // Authenticate by PIN
GolfCoveEmployees.hasPermission(id, perm)
GolfCoveEmployees.clockIn(id)          // Time clock in
GolfCoveEmployees.clockOut(id)         // Time clock out
GolfCoveEmployees.getPayrollReport(start, end)
```

---

### 6. `js/gift-cards.js` - GolfCoveGiftCards
Gift card lifecycle management.

**Features:**
- Auto code generation (GC-XXXX-XXXX format)
- Balance operations
- Transaction tracking
- Expiration management
- Email templates

**Key Methods:**
```javascript
GolfCoveGiftCards.create(amount, purchaser)
GolfCoveGiftCards.checkBalance(code)
GolfCoveGiftCards.redeem(code, amount)
GolfCoveGiftCards.addBalance(code, amount)
GolfCoveGiftCards.getExpiringSoon(days)
GolfCoveGiftCards.getStats()
```

---

### 7. `js/promotions.js` - GolfCovePromotions
Promotions, discounts, and happy hours.

**Promotion Types:**
- `percentage` - Percentage off
- `fixed` - Fixed amount off
- `bogo` - Buy one get one
- `freeItem` - Free item
- `bundle` - Bundle deal
- `happyHour` - Time-based discount

**Key Methods:**
```javascript
GolfCovePromotions.create(data)        // Create promotion
GolfCovePromotions.validateCode(code, context)
GolfCovePromotions.apply(id, context)  // Apply promotion
GolfCovePromotions.isHappyHour()       // Check active happy hour
GolfCovePromotions.getAutoApplyPromotions(context)
```

---

### 8. `js/inventory.js` - GolfCoveInventory
Inventory and purchase order management.

**Features:**
- Item tracking with SKU
- Stock adjustments (add, remove, waste)
- Low stock alerts
- Expiration tracking
- Purchase order workflow
- Auto-reorder generation

**Key Methods:**
```javascript
GolfCoveInventory.createItem(data)     // Create inventory item
GolfCoveInventory.addStock(id, qty)    // Receive stock
GolfCoveInventory.removeStock(id, qty) // Reduce stock (sale)
GolfCoveInventory.getLowStock()        // Items below reorder point
GolfCoveInventory.createPurchaseOrder(data)
GolfCoveInventory.getAlerts()          // All active alerts
```

---

### 9. `js/reports.js` - GolfCoveReports
Reporting and analytics system.

**Report Types:**
- Sales reports (daily, weekly, monthly)
- Booking reports
- Occupancy reports
- Customer reports
- Gift card reports
- Dashboard metrics

**Key Methods:**
```javascript
GolfCoveReports.getSalesReport(period) // 'today', 'thisWeek', etc.
GolfCoveReports.getBookingReport(period)
GolfCoveReports.getOccupancyReport(date)
GolfCoveReports.getDashboardMetrics()
GolfCoveReports.generateDailyReport()
GolfCoveReports.generateMonthlyReport()
```

---

### 10. `js/tabs-system.js` - GolfCoveTabs
F&B tab and cart management.

**Features:**
- Open/close tabs
- Add/remove items
- Member discounts
- Tab transfer between rooms

**Key Methods:**
```javascript
GolfCoveTabs.createTab(customer)
GolfCoveTabs.addItem(tabId, item)
GolfCoveTabs.closeTab(tabId, payment)
GolfCoveTabs.getCartSummary(tabId)
```

---

### 11. `js/pin-system.js` - GolfCovePIN
Employee PIN authentication system.

**Key Methods:**
```javascript
GolfCovePIN.init()                     // Initialize system
GolfCovePIN.lock()                     // Lock the system
GolfCovePIN.getCurrentEmployee()       // Get logged-in employee
GolfCovePIN.isManager()                // Check manager status
```

---

### 12. `js/stripe-terminal.js` - GolfCoveStripe
Stripe Terminal integration for card payments.

**Key Methods:**
```javascript
GolfCoveStripe.init()                  // Initialize terminal
GolfCoveStripe.connectReader()         // Connect card reader
GolfCoveStripe.collectPayment(amount)  // Process payment
GolfCoveStripe.processRefund(charge, amount)
```

---

### 13. `js/toast.js` - GolfCoveToast
Toast notification system.

**Key Methods:**
```javascript
GolfCoveToast.success(message)
GolfCoveToast.error(message)
GolfCoveToast.warning(message)
GolfCoveToast.info(message)
```

---

### 14. `js/menu-data.js` - GolfCoveMenu
F&B menu item definitions.

---

### 15. `js/utils.js` - GolfCoveUtils
Common helper functions.

**Key Methods:**
```javascript
GolfCoveUtils.formatCurrency(amount)
GolfCoveUtils.formatDate(date)
GolfCoveUtils.debounce(fn, delay)
GolfCoveUtils.generateId()
GolfCoveUtils.deepClone(obj)
```

---

### 16. `js/app.js` - GolfCoveApp
Main application controller.

---

## Storage Keys

All localStorage keys use the `gc_` prefix:

| Key | Description |
|-----|-------------|
| `gc_bookings` | All booking records |
| `gc_transactions` | Transaction history |
| `gc_customers` | Customer database |
| `gc_employees` | Employee records |
| `gc_gift_cards` | Gift card records |
| `gc_inventory` | Inventory items |
| `gc_tabs` | Open tabs |
| `gc_promotions` | Promotions/discounts |
| `gc_settings` | System settings |
| `gc_purchase_orders` | Purchase orders |
| `gc_timeclock` | Time clock records |
| `gc_shifts` | Employee schedules |

---

## File Structure

```
golfcove/
├── index.html              # Public homepage
├── admin-pos.html          # Main POS interface
├── schedule.html           # Booking schedule
├── css/
│   └── styles.css          # Public styles
├── js/
│   ├── config.js           # Central configuration
│   ├── database.js         # Data access layer
│   ├── booking-system.js   # Bookings
│   ├── customers.js        # Customer management
│   ├── employees.js        # Employee management
│   ├── gift-cards.js       # Gift cards
│   ├── promotions.js       # Promotions/discounts
│   ├── inventory.js        # Inventory management
│   ├── reports.js          # Reporting/analytics
│   ├── tabs-system.js      # Tab/cart management
│   ├── pin-system.js       # PIN authentication
│   ├── stripe-terminal.js  # Stripe payments
│   ├── toast.js            # Notifications
│   ├── menu-data.js        # Menu items
│   ├── utils.js            # Helpers
│   ├── app.js              # Main controller
│   └── main.js             # Public site JS
├── firebase.json           # Firebase config
└── public/                 # Firebase hosting
```

---

## Integration Example

```html
<!-- Load modules in order -->
<script src="js/config.js"></script>
<script src="js/database.js"></script>
<script src="js/utils.js"></script>
<script src="js/toast.js"></script>
<script src="js/customers.js"></script>
<script src="js/employees.js"></script>
<script src="js/gift-cards.js"></script>
<script src="js/promotions.js"></script>
<script src="js/inventory.js"></script>
<script src="js/booking-system.js"></script>
<script src="js/tabs-system.js"></script>
<script src="js/reports.js"></script>
<script src="js/pin-system.js"></script>
<script src="js/stripe-terminal.js"></script>
<script src="js/menu-data.js"></script>
<script src="js/app.js"></script>
```

---

## Deployment

```bash
# Deploy to Firebase
firebase deploy

# Deploy only hosting
firebase deploy --only hosting

# Deploy only functions
firebase deploy --only functions
```

Live URL: https://golfcove.web.app

---

## Future Improvements

- [ ] Migrate to IndexedDB for larger datasets
- [ ] Add Firebase Realtime Database sync
- [ ] Implement offline mode with service worker
- [ ] Add automated backup to cloud storage
- [ ] Build admin dashboard React/Vue app
- [ ] Add email/SMS notifications via Firebase Functions
- [ ] Implement loyalty points system
- [ ] Add league management features
