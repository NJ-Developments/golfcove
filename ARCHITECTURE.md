# Golf Cove - System Architecture

**Version:** 3.0  
**Date:** December 25, 2025  

---

## 🎯 System Purpose

**Golf Cove is a unified venue management system for golf simulator facilities.**

The core objective is **ONE system to manage everything**:
- **Bookings** - Tee sheet for simulator bays
- **Members** - Tier-based memberships with discounts
- **Point of Sale** - Food, drinks, retail with tabs
- **Customers** - Unified customer database

### The Promise
> A staff member can look up a customer, see their membership status, active bookings, open tabs, and purchase history - all in one place.

### Current Reality ⚠️
The codebase has grown organically and now has:
- **Duplicate data sources** (Firebase + localStorage)
- **Multiple implementations** of the same logic
- **Inconsistent sync** between devices

This document outlines the architecture AND the path to fixing it.

---

## Table of Contents

1. [Core Architecture](#1-core-architecture)
2. [Data Flow & Storage](#2-data-flow--storage)
3. [Module Reference](#3-module-reference)
4. [Membership & Pricing](#4-membership--pricing)
5. [Known Bugs & Issues](#5-known-bugs--issues)
6. [Improvement Roadmap](#6-improvement-roadmap)
7. [Developer Gotchas](#7-developer-gotchas)

---

## 1. Core Architecture

### Technology Stack

| Layer | Technology | Purpose |
|-------|------------|---------|
| Frontend | Vanilla JavaScript (ES2020+) | Maximum compatibility |
| Database | Firebase Realtime Database | Cloud storage & real-time sync |
| Auth | Firebase Auth | User authentication |
| Payments | Stripe (Terminal + Web) | Card processing |
| Build | Vite 5.0 (optional) | Bundling & optimization |
| Hosting | Firebase Hosting | Static file serving |

### Design Principles

1. **Firebase is Source of Truth** - All persistent data lives in Firebase
2. **Offline-First** - localStorage provides cache for offline use
3. **IIFE Modules** - Encapsulated modules without build requirement
4. **Backward Compatibility** - Legacy aliases maintained

### High-Level Diagram

```
┌─────────────────────────────────────────────────────────────┐
│                      BROWSER (Client)                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│   ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│   │ booking  │  │   pos    │  │  admin   │  │ members  │   │
│   │  .html   │  │  .html   │  │-pos.html │  │  .html   │   │
│   └────┬─────┘  └────┬─────┘  └────┬─────┘  └────┬─────┘   │
│        │             │             │             │          │
│        └─────────────┴──────┬──────┴─────────────┘          │
│                             │                               │
│   ┌─────────────────────────┴─────────────────────────────┐ │
│   │                   CORE MODULES                         │ │
│   ├────────────┬────────────┬────────────┬────────────────┤ │
│   │ booking-   │ membership │ customer-  │ pos-core.js    │ │
│   │ unified.js │ -system.js │ manager.js │                │ │
│   └────────────┴────────────┴────────────┴────────────────┘ │
│                             │                               │
│   ┌─────────────────────────┴─────────────────────────────┐ │
│   │                 INFRASTRUCTURE                         │ │
│   ├──────────┬──────────┬──────────┬─────────────────────┤ │
│   │ store.js │ cache-   │ error-   │ api-layer.js       │ │
│   │          │ manager  │ handler  │                     │ │
│   └──────────┴──────────┴──────────┴─────────────────────┘ │
│                             │                               │
└─────────────────────────────┼───────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    EXTERNAL SERVICES                        │
├───────────────────┬───────────────────┬─────────────────────┤
│  Firebase RTDB    │  Stripe Payments  │  Cloud Functions    │
└───────────────────┴───────────────────┴─────────────────────┘
```

---

## 2. Data Flow & Storage

### Storage Architecture (Updated December 2025)

All critical data now syncs to Firebase:

```
Firebase (Cloud)                    localStorage (Browser)
═══════════════                    ═══════════════════════
/bookings       ◄──── SYNCED ────► gc_bookings       ✅
/customers      ◄──── PARTIAL ───► gc_customers      ⚠️
/tabs           ◄──── SYNCED ────► gc_tabs           ✅
/transactions   ◄──── SYNCED ────► gc_transactions   ✅ (FIXED)
/inventory      ◄──── SYNCED ────► gc_inventory      ✅ (FIXED)
/gift_cards     ◄──── SYNCED ────► gc_gift_cards     ✅ (FIXED)
/waitlist       ◄──── SYNCED ────► gc_waitlist       ✅ (FIXED)
```

### The Pattern

1. **Firebase = Source of Truth** for all persistent data
2. **localStorage = Offline Cache ONLY**
3. **On page load**: Fetch from Firebase, update localStorage cache
4. **On save**: Write to Firebase FIRST, then update local cache
5. **Offline**: Queue changes with `_pendingSync: true`, sync when back online

### Current State

| Data | Behavior | Status |
|------|----------|--------|
| Bookings | ✅ Firebase synced | Good |
| Tabs | ✅ Firebase synced | Good |
| Transactions | ✅ Firebase synced | Fixed (Dec 2025) |
| Inventory | ✅ Firebase synced | Fixed (Dec 2025) |
| Gift Cards | ✅ Firebase synced | Fixed (Dec 2025) |
| Waitlist | ✅ Firebase synced | Fixed (Dec 2025) |
| Customers | ⚠️ Fragmented (Stripe + Firebase + localStorage) | Needs work |
| Transactions | ❌ localStorage only | HIGH - Lost on clear |
| Inventory | ❌ localStorage only | MEDIUM - Wrong stock |
| Gift Cards | ❌ localStorage only | CRITICAL - Double spend |
| Waitlist | ❌ localStorage only | HIGH - Lost data |

### Firebase Collections

```
/bookings/{id}
├── id: string
├── roomId: number
├── date: "YYYY-MM-DD"
├── time: "HH:MM" (24h format - STANDARDIZED)
├── duration: number (hours)
├── customer: string
├── customerId?: string
├── status: "pending"|"confirmed"|"checked_in"|"completed"|"cancelled"|"no_show"
├── totalPrice: number
├── memberType?: string
├── isMember: boolean
├── isVIP: boolean
├── createdAt: ISO timestamp
└── updatedAt: ISO timestamp

/customers/{id}
├── id: string
├── firstName: string
├── lastName: string
├── email: string
├── phone: string
├── isMember: boolean
├── memberType?: string ("par"|"birdie"|"eagle"|"corporate"...)
├── memberExpires?: ISO date
├── stripeCustomerId?: string
├── createdAt: ISO timestamp
└── updatedAt: ISO timestamp

/tabs/{id}
├── id: string
├── tableId: string
├── customerName: string
├── items: array
├── status: "open"|"closed"
├── total: number
├── createdAt: ISO timestamp
└── closedAt?: ISO timestamp

/transactions/{id}
├── id: string
├── items: array
├── subtotal: number
├── tax: number
├── total: number
├── paymentMethod: string
├── employeeId: string
├── createdAt: ISO timestamp
└── voided: boolean
```

---

## 3. Module Reference

### Core Modules

| Module | File | Purpose |
|--------|------|---------|
| **BookingSystem** | js/booking-unified.js | Bay reservations, tee sheet |
| **GolfCoveMembership** | js/membership-system.js | Member lookup, discounts |
| **MembershipConfig** | js/membership-config.js | Tier definitions (single source) |
| **CustomerManager** | js/customer-manager.js | Customer CRUD |
| **POSCore** | js/pos-core.js | Point of sale |
| **TabsManager** | js/tabs-manager.js | Open tabs/orders |

### Infrastructure Modules

| Module | File | Purpose |
|--------|------|---------|
| **Store** | js/store.js | Centralized state (Redux-like) |
| **CacheManager** | js/cache-manager.js | IndexedDB + localStorage |
| **ErrorHandler** | js/error-handler.js | Centralized error handling |
| **GolfCoveConfig** | js/config-unified.js | Environment config |

### Legacy Aliases

These exist for backward compatibility:

```javascript
// In booking-unified.js
window.GolfCoveBooking = BookingSystem;    // Legacy alias
window.BayBooking = BookingSystem;         // Legacy alias
window.TeeSheetManager = BookingSystem;    // Legacy alias
```

---

## 4. Membership & Pricing

### Membership Tiers

**SINGLE SOURCE OF TRUTH: js/membership-config.js**

| Tier | Monthly | Hourly Discount | F&B Discount | Unlimited Bay? |
|------|---------|-----------------|--------------|----------------|
| **Par** | $99 | 10% | 10% | No |
| **Birdie** | $199 | 100% (FREE) | 15% | ✅ Yes |
| **Eagle** | $299 | 100% (FREE) | 20% | ✅ Yes |
| **Corporate** | $499 | 100% (FREE) | 15% | ✅ Yes |
| **Family Par** | $149 | 10% | 10% | No |
| **Family Birdie** | $299 | 100% (FREE) | 15% | ✅ Yes |
| **Family Eagle** | $449 | 100% (FREE) | 20% | ✅ Yes |

### Pricing Logic

```javascript
// Base hourly rate: $65

function calculateBayPrice(customer, duration = 1) {
    const BASE_RATE = 65;
    
    // Non-member pays full price
    if (!customer?.memberType) {
        return BASE_RATE * duration;
    }
    
    // Unlimited members pay $0
    const UNLIMITED_TIERS = ['birdie', 'eagle', 'family_birdie', 'family_eagle', 'corporate'];
    if (UNLIMITED_TIERS.includes(customer.memberType.toLowerCase())) {
        return 0;
    }
    
    // Par members get 10% off
    if (customer.memberType.toLowerCase().includes('par')) {
        return (BASE_RATE * 0.90) * duration;
    }
    
    return BASE_RATE * duration;
}
```

### Peak Pricing

| Time | Multiplier |
|------|------------|
| Mon-Thu before 5pm | 1.0x (standard) |
| Mon-Thu 5pm-close | 1.25x (peak) |
| Fri-Sun all day | 1.25x (peak) |

---

## 5. Known Bugs & Issues

### ✅ Recently Fixed (December 2025)

| Issue | Fix | Files Changed |
|-------|-----|---------------|
| Gift cards local-only | Added Firebase sync via GolfCoveGiftCards module | sales.html, admin-pos.html |
| Transactions local-only | Added syncTransactionToFirebase() | sales.html |
| Waitlist local-only | Added syncWaitlistToFirebase() | booking-unified.js |
| Inventory local-only | Added syncInventoryToFirebase() | sales.html |
| Peak pricing missing | Uses BookingSystem.calculatePricing() | booking.html |
| Grabbing cursor on bookings | Changed to pointer cursor | admin-pos.html |

### 🟠 Remaining Issues

| Issue | Location | Description |
|-------|----------|-------------|
| **Customer data fragmented** | Multiple | Data in Stripe + Firebase + localStorage |
| **Discount values differ** | Multiple files | 10% vs 15% vs 50% for same tier |
| **Time format mixed** | Multiple | Some "10:00 AM", some "14:00" |

### 🟡 Low Priority

| Issue | Location | Description |
|-------|----------|-------------|
| **Status values differ** | Multiple | "checked-in" vs "checked_in" |
| **Firebase URL hardcoded** | 6+ files | Should be in config |
| **isActiveMember differs** | 2 files | Different null handling |
| **calculateBayPrice duplicated** | 2 files | Different implementations |

---

## 6. Improvement Roadmap

### Phase 1: Data Consistency (CRITICAL)

**Goal:** Firebase as single source of truth

- [ ] Add Firebase sync for transactions
- [ ] Add Firebase sync for gift cards  
- [ ] Add Firebase sync for inventory
- [ ] Add Firebase sync for waitlist
- [ ] Consolidate customer data (remove Stripe duplication)

### Phase 2: Code Consolidation (HIGH)

**Goal:** Single implementation for each concept

- [ ] Use MembershipConfig.TIERS everywhere (delete duplicates)
- [ ] Use BookingSystem.calculatePrice() everywhere
- [ ] Standardize on 24h time format for storage
- [ ] Standardize status values (use underscores: `checked_in`)
- [ ] Centralize Firebase URL in config

### Phase 3: Error Handling (MEDIUM)

**Goal:** No silent failures

- [ ] Add sync status indicators (last sync time)
- [ ] Show offline mode warning
- [ ] Log failed syncs for retry
- [ ] User-visible error messages

### Phase 4: Testing (MEDIUM)

**Goal:** Catch bugs before deployment

- [ ] Unit tests for price calculations
- [ ] Unit tests for member discount logic
- [ ] Integration tests for booking flow
- [ ] E2E tests with Playwright

### Phase 5: Performance (LOW)

**Goal:** Fast load times

- [ ] Bundle JS with Vite
- [ ] Incremental sync (only changes since lastSync)
- [ ] Lazy load non-critical modules

---

## 7. Developer Gotchas

### ⚠️ GOTCHA 1: Member Tier Case Sensitivity
```javascript
// WRONG - case mismatch
if (customer.memberType === 'Birdie') // Won't match 'birdie'

// RIGHT - normalize first
if (customer.memberType?.toLowerCase() === 'birdie')
```

### ⚠️ GOTCHA 2: Time Format
```javascript
// Storage format: 24h
booking.time = "14:00";

// Display format: 12h  
displayTime = formatTime(booking.time); // "2:00 PM"

// parseTime() handles both - use it!
```

### ⚠️ GOTCHA 3: Firebase Null
```javascript
// Firebase returns null when collection is empty
const data = await fetch(`${FIREBASE_URL}/bookings.json`).then(r => r.json());

// WRONG
data.forEach(...) // Error if null

// RIGHT
(data || []).forEach(...)
// or
Object.values(data || {}).forEach(...)
```

### ⚠️ GOTCHA 4: Discount Values
```javascript
// Discount is a MULTIPLIER, not percentage
discount: 0.10  // = 10% OFF (multiply by 0.90)
discount: 1.00  // = 100% OFF (FREE)

// Calculate price
price = basePrice * (1 - discount);
```

### ⚠️ GOTCHA 5: Unlimited Members
```javascript
// Check unlimited BEFORE applying discount
if (tier.unlimited === true) {
    return 0; // FREE
}
// Don't rely on discount: 1.00, check unlimited explicitly
```

### ⚠️ GOTCHA 6: LocalStorage vs Firebase
```javascript
// When reading, always prefer Firebase (async)
async function getBookings() {
    try {
        const data = await fetch(`${FIREBASE_URL}/bookings.json`).then(r => r.json());
        localStorage.setItem('gc_bookings', JSON.stringify(data)); // Update cache
        return data || [];
    } catch (e) {
        // Fallback to local ONLY on network error
        return JSON.parse(localStorage.getItem('gc_bookings') || '[]');
    }
}
```

### ⚠️ GOTCHA 7: Member Expiration
```javascript
// Check expiration explicitly
function isActiveMember(customer) {
    if (!customer?.isMember) return false;
    if (!customer.memberExpires) return true; // No expiry = perpetual
    return new Date(customer.memberExpires) > new Date();
}
```

---

## Quick Reference

### Key Prices
- **Hourly Rate:** $65
- **Peak Multiplier:** 1.25x
- **Tax Rate:** 6.35%

### Key Files
- **Booking logic:** js/booking-unified.js
- **Member tiers:** js/membership-config.js  
- **Config:** js/config-unified.js
- **State:** js/store.js

### Key localStorage Keys
- `gc_bookings` - Booking cache
- `gc_customers` - Customer cache
- `gc_tabs` - Tab cache

### Firebase URL
```
https://golfcove-default-rtdb.firebaseio.com
```

---

*Last updated: December 25, 2025*
