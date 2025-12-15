# Golf Cove Backend API Documentation

## Overview

This document describes the Golf Cove POS backend API, built on Firebase Functions with Stripe integration.

**Base URL:** `https://us-central1-golfcove.cloudfunctions.net`

---

## Authentication

All endpoints require API key authentication:

```
Header: X-API-Key: <your-api-key>
```

For employee-specific operations, include:
```
Header: X-Employee-Id: <employee-id>
OR
Header: X-Employee-Pin: <4-6 digit PIN>
```

---

## Rate Limiting

- Default: 100 requests per minute per IP
- Payment endpoints: 50 requests per minute
- Report endpoints: 10 requests per minute

---

## Standard Response Format

### Success Response
```json
{
  "success": true,
  "data": { ... },
  "timestamp": "2024-01-15T10:30:00.000Z"
}
```

### Error Response
```json
{
  "success": false,
  "error": {
    "code": "ERROR_CODE",
    "message": "Human readable message"
  }
}
```

---

## Error Codes

| Code | Description |
|------|-------------|
| AUTH_001 | API key missing |
| AUTH_002 | Invalid API key |
| AUTH_003 | Insufficient permissions |
| VAL_001 | Missing required field |
| VAL_002 | Invalid field type |
| VAL_003 | Value out of range |
| VAL_004 | Invalid format |
| PAY_001 | Payment processing failed |
| PAY_002 | Invalid amount |
| PAY_003 | Card declined |
| PAY_004 | Stripe error |
| INV_001 | Item not found |
| INV_002 | Insufficient stock |
| INV_003 | Invalid adjustment |
| BOOK_001 | Time slot unavailable |
| BOOK_002 | Bay not found |
| BOOK_003 | Invalid duration |
| CUST_001 | Customer not found |
| CUST_002 | Duplicate email |
| EMP_001 | Employee not found |
| EMP_002 | PIN already exists |
| SYS_001 | Internal error |
| SYS_002 | Database error |
| SYS_003 | External service error |

---

## Endpoints

### Health Check

#### GET /health
Check service health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T10:30:00.000Z",
  "version": "2.0.0",
  "services": {
    "database": "connected",
    "stripe": "configured"
  }
}
```

---

### Payments

#### POST /createPaymentIntent
Create a Stripe payment intent.

**Request Body:**
```json
{
  "amount": 4999,
  "currency": "usd",
  "customerId": "customer_123",
  "items": [
    { "name": "Burger", "price": 12.99, "qty": 2, "category": "food" }
  ],
  "metadata": { "tabId": "tab_123" }
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "clientSecret": "pi_xxx_secret_xxx",
    "paymentIntentId": "pi_xxx"
  }
}
```

#### POST /capturePayment
Capture an authorized payment.

**Request Body:**
```json
{
  "paymentIntentId": "pi_xxx",
  "amountToCapture": 4999
}
```

#### POST /refundPayment
Refund a completed payment.

**Request Body:**
```json
{
  "paymentIntentId": "pi_xxx",
  "amount": 1000,
  "reason": "Customer request"
}
```

---

### Gift Cards

#### POST /createGiftCard
Create a new gift card.

**Request Body:**
```json
{
  "amount": 50.00,
  "purchaserName": "John Doe",
  "recipientEmail": "recipient@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "giftCardId": "gc_xxx",
    "code": "GCXXXX1234",
    "balance": 50.00
  }
}
```

#### POST /redeemGiftCard
Apply gift card to a purchase.

**Request Body:**
```json
{
  "code": "GCXXXX1234",
  "amount": 25.00
}
```

#### GET /giftCardBalance?code=GCXXXX1234
Check gift card balance.

---

### Customers

#### POST /createCustomer
Create a new customer.

**Request Body:**
```json
{
  "firstName": "John",
  "lastName": "Doe",
  "email": "john@example.com",
  "phone": "555-123-4567"
}
```

#### PUT /updateCustomer
Update customer information.

**Request Body:**
```json
{
  "customerId": "customer_123",
  "updates": {
    "phone": "555-987-6543"
  }
}
```

#### GET /getCustomer?customerId=customer_123
Get customer details.

#### GET /searchCustomers?query=john&limit=10
Search customers by name, email, or phone.

---

### Inventory

#### POST /inventorySync
Sync inventory levels.

**Request Body:**
```json
{
  "items": [
    { "itemId": "item_123", "quantity": 50, "action": "set" },
    { "itemId": "item_456", "quantity": -2, "action": "adjust" }
  ]
}
```

#### POST /inventoryAdjustment
Adjust single item inventory.

**Request Body:**
```json
{
  "itemId": "item_123",
  "quantity": -5,
  "reason": "Sold",
  "employeeId": "emp_123"
}
```

#### GET /inventoryLevels?category=food
Get current inventory levels.

---

### Transactions

#### POST /recordTransaction
Record a completed transaction.

**Request Body:**
```json
{
  "items": [...],
  "subtotal": 25.99,
  "tax": 1.65,
  "total": 27.64,
  "paymentMethod": "card",
  "stripePaymentIntentId": "pi_xxx",
  "customerId": "customer_123",
  "employeeId": "emp_123"
}
```

#### POST /validateTransaction
Validate transaction data (dry run).

**Request Body:** Same as recordTransaction

---

### Bookings

#### POST /createBooking
Create a tee time booking.

**Request Body:**
```json
{
  "bayId": "bay_1",
  "startTime": "2024-01-15T10:00:00Z",
  "duration": 60,
  "type": "single",
  "customerId": "customer_123",
  "guestCount": 2
}
```

#### PUT /updateBooking
Update booking details.

#### DELETE /cancelBooking?bookingId=booking_123
Cancel a booking.

#### GET /getAvailability?date=2024-01-15&bayId=bay_1
Get available time slots.

---

### Tabs

#### POST /createTab
Open a new tab.

**Request Body:**
```json
{
  "name": "Table 5",
  "customerId": "customer_123",
  "bookingId": "booking_123"
}
```

#### POST /addToTab
Add item to tab.

**Request Body:**
```json
{
  "tabId": "tab_123",
  "item": { "name": "Burger", "price": 12.99, "qty": 1 }
}
```

#### POST /closeTab
Close and pay a tab.

#### GET /getOpenTabs
Get all open tabs.

---

### Reports

#### GET /salesReport
Generate sales report.

**Query Parameters:**
- `startDate`: ISO date string
- `endDate`: ISO date string
- `groupBy`: day, week, month
- `storeId`: Store identifier

#### GET /inventoryReport
Get inventory status report.

#### GET /employeeReport
Get employee performance report.

#### GET /bookingsReport
Get bookings report.

#### GET /customersReport
Get customer analytics report.

#### GET /exportData
Export data in various formats.

**Query Parameters:**
- `type`: transactions, customers, inventory, bookings
- `format`: json, csv
- `startDate`: ISO date string
- `endDate`: ISO date string

---

### Employees

#### POST /createEmployee
Create a new employee.

**Request Body:**
```json
{
  "firstName": "Jane",
  "lastName": "Smith",
  "pin": "1234",
  "role": "staff",
  "email": "jane@golfcove.com"
}
```

#### PUT /updateEmployee
Update employee details.

#### POST /validatePin
Validate employee PIN.

**Request Body:**
```json
{
  "pin": "1234"
}
```

---

### Cash Drawer

#### POST /cashDrawer
Manage cash drawer operations.

**Request Body:**
```json
{
  "action": "open",
  "employeeId": "emp_123",
  "expectedAmount": 200.00,
  "actualAmount": 200.00,
  "notes": "Opening count"
}
```

**Actions:** open, close, drop, adjustment

---

### Access Control

#### GET /validatePermission?permission=transactions:create
Check if employee has specific permission.

#### GET /getRoles
Get role definitions and permissions.

---

### Audit Log

#### GET /auditLog
Query audit log entries.

**Query Parameters:**
- `action`: Filter by action type
- `employeeId`: Filter by employee
- `startDate`: Start of date range
- `endDate`: End of date range
- `limit`: Max results (default 100)

---

### Backup & Restore

#### POST /backupData
Create a full data backup.

**Response:** JSON containing all store data with checksum.

#### POST /restoreData
Restore data from backup.

**Request Body:**
```json
{
  "backup": { ... },
  "overwrite": false
}
```

---

## Scheduled Functions

These run automatically:

| Function | Schedule | Description |
|----------|----------|-------------|
| dailySalesSummary | 11:59 PM daily | Generate daily sales report |
| lowStockAlert | 8:00 AM daily | Check and alert on low inventory |
| membershipExpiryCheck | 9:00 AM daily | Check expiring memberships |
| weeklyReport | 11:59 PM Sunday | Generate weekly summary |
| monthlyCleanup | 3:00 AM 1st of month | Archive old data |

---

## Webhooks

### POST /stripeWebhook
Receives Stripe webhook events.

**Handled Events:**
- `payment_intent.succeeded`
- `payment_intent.payment_failed`
- `charge.refunded`
- `customer.subscription.created`
- `customer.subscription.updated`
- `customer.subscription.deleted`
- `invoice.paid`
- `invoice.payment_failed`

---

## Role-Based Permissions

| Role | Level | Description |
|------|-------|-------------|
| admin | 100 | Full access to all features |
| manager | 75 | Full POS access, limited settings |
| staff | 50 | POS operations, limited reports |
| readonly | 10 | View-only access |

### Permission Format
`<resource>:<action>`

Examples:
- `transactions:create`
- `customers:*` (all customer actions)
- `reports:read`

---

## Setup & Deployment

### 1. Set Configuration
```bash
firebase functions:config:set \
  api.key="your-secure-api-key" \
  stripe.secret="sk_live_xxx" \
  stripe.webhook_secret="whsec_xxx"
```

### 2. Deploy
```bash
firebase deploy --only functions
```

### 3. View Logs
```bash
firebase functions:log
```

---

## Testing

Use the Firebase emulator for local testing:
```bash
npm run serve
```

Test endpoint:
```bash
curl -X GET http://localhost:5001/golfcove/us-central1/health
```
