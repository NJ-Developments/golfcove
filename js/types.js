/**
 * Golf Cove - Type Definitions (JSDoc)
 * =====================================
 * Central type definitions for the entire codebase.
 * Import this file first in any module that needs type hints.
 * 
 * Usage in VSCode:
 * - These types provide IntelliSense autocomplete
 * - Add @ts-check at top of JS files for type checking
 * 
 * @version 1.0.0
 */

// ============================================
// CORE ENTITY TYPES
// ============================================

/**
 * @typedef {Object} Customer
 * @property {string} id - Unique identifier
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} [email]
 * @property {string} [phone]
 * @property {string} [address]
 * @property {string} [city]
 * @property {string} [state]
 * @property {string} [zip]
 * @property {boolean} isMember
 * @property {MemberType} [memberType] - par, birdie, eagle, etc.
 * @property {string} [memberSince] - ISO date string
 * @property {string} [memberExpires] - ISO date string
 * @property {string} [priceClass] - 'Regular', 'Member', 'VIP'
 * @property {string} [notes]
 * @property {number} [totalSpent]
 * @property {number} [visitCount]
 * @property {string} [lastVisit] - ISO date string
 * @property {string} createdAt - ISO timestamp
 * @property {string} [updatedAt] - ISO timestamp
 * @property {string} [_firebaseKey] - Firebase key (internal)
 */

/**
 * @typedef {'par'|'birdie'|'eagle'|'family_par'|'family_birdie'|'family_eagle'|'corporate'|'league_player'|'league_team'|'monthly'|'annual'} MemberType
 */

/**
 * @typedef {Object} MemberTier
 * @property {string} key
 * @property {string} name
 * @property {string} displayName
 * @property {number} level - 1=basic, 2=mid, 3=premium
 * @property {string} color - Hex color code
 * @property {Object} price
 * @property {number} [price.monthly]
 * @property {number} [price.annual]
 * @property {number} [price.seasonal]
 * @property {number} discount - F&B discount as decimal (0.10 = 10%)
 * @property {number} hourlyDiscount - Bay rate discount (1.00 = free)
 * @property {boolean} unlimitedPlay
 * @property {boolean} [isFamily]
 * @property {boolean} [isCorporate]
 * @property {boolean} [isLeague]
 * @property {boolean} [isLegacy]
 * @property {MemberBenefits} benefits
 * @property {string[]} benefitsList
 */

/**
 * @typedef {Object} MemberBenefits
 * @property {number} discountPercent
 * @property {number} [hourlyDiscount]
 * @property {boolean} priorityBooking
 * @property {boolean} unlimitedPlay
 * @property {number} [maxReservationHours]
 * @property {number} [maxGuests]
 * @property {boolean} [freeBilliards]
 * @property {boolean} [freePingPong]
 * @property {number} [freeHoursPerMonth]
 * @property {number} [guestPassesPerMonth]
 * @property {boolean} [loungeAccess]
 * @property {boolean} [proLessonsDiscount]
 * @property {boolean} [includesMultisport]
 * @property {number} [privateEventDiscount]
 * @property {boolean} [leagueAccess]
 */

// ============================================
// BOOKING TYPES
// ============================================

/**
 * @typedef {'pending'|'confirmed'|'checked_in'|'completed'|'no_show'|'cancelled'} BookingStatus
 */

/**
 * @typedef {Object} Booking
 * @property {string} id - Unique identifier (bk_xxx)
 * @property {number} roomId - 1-6
 * @property {string} date - ISO date string (YYYY-MM-DD)
 * @property {string} time - Time string (e.g., "10:00 AM" or "10:00")
 * @property {number} duration - Hours (1-4)
 * @property {string} customer - Customer name
 * @property {string} [customerName] - Alias for customer
 * @property {string} [customerId]
 * @property {string} [phone]
 * @property {string} [email]
 * @property {number} players - Number of players including booker
 * @property {number} price - Final price after discounts
 * @property {number} [basePrice] - Price before discounts
 * @property {boolean} [isPeak] - Peak time pricing applied
 * @property {number} [memberDiscount] - Discount amount
 * @property {MemberType} [memberType]
 * @property {BookingStatus} status
 * @property {boolean} isMember
 * @property {boolean} [isVIP]
 * @property {string} [notes]
 * @property {string} [specialRequests]
 * @property {'online'|'pos'|'phone'|'walkin'} source
 * @property {string} [createdBy]
 * @property {string} createdAt - ISO timestamp
 * @property {string} [updatedAt] - ISO timestamp
 * @property {string} [checkedInAt] - ISO timestamp
 * @property {string} [completedAt] - ISO timestamp
 * @property {string} [cancelledAt] - ISO timestamp
 * @property {string} [cancellationReason]
 * @property {string} [_firebaseKey] - Firebase key (internal)
 * @property {boolean} [_pendingSync] - Needs sync to Firebase (internal)
 */

/**
 * @typedef {Object} BookingSlot
 * @property {number} hour - 24-hour format (9-22)
 * @property {string} time - Formatted time ("10:00 AM")
 * @property {string} time24 - 24-hour format ("10:00")
 * @property {boolean} isPeak
 * @property {number} [roomId]
 * @property {string} [roomName]
 * @property {boolean} [available]
 * @property {Booking} [booking] - Existing booking if any
 */

/**
 * @typedef {Object} Room
 * @property {number} id
 * @property {string} name
 * @property {string} type - 'members', 'golf_menu', 'golf_music'
 * @property {string} label
 * @property {number} capacity
 * @property {string} color - Hex color
 */

/**
 * @typedef {Object} WaitlistEntry
 * @property {string} id - wl_xxx
 * @property {string} customer
 * @property {string} [phone]
 * @property {string} [email]
 * @property {string} date - ISO date
 * @property {string} [preferredTime]
 * @property {number} [preferredRoom]
 * @property {number} duration
 * @property {number} players
 * @property {string} [notes]
 * @property {string} createdAt
 * @property {boolean} notified
 * @property {'waiting'|'fulfilled'|'expired'} status
 */

// ============================================
// POS / TRANSACTION TYPES
// ============================================

/**
 * @typedef {Object} CartItem
 * @property {number} id - Menu item ID
 * @property {string} name
 * @property {number} price - Unit price
 * @property {number} quantity
 * @property {string} [category]
 * @property {string} [notes]
 * @property {Object[]} [modifiers]
 */

/**
 * @typedef {Object} Tab
 * @property {string} id - tab_xxx
 * @property {string} name - Display name
 * @property {number} roomId
 * @property {string} [bookingId]
 * @property {string} [customerId]
 * @property {string} [customerName]
 * @property {MemberType} [memberType]
 * @property {CartItem[]} items
 * @property {number} subtotal
 * @property {number} tax
 * @property {number} [discount]
 * @property {number} [tip]
 * @property {number} total
 * @property {'open'|'closed'|'void'} status
 * @property {string} createdAt
 * @property {string} [updatedAt]
 * @property {string} [closedAt]
 * @property {string} [_firebaseKey]
 */

/**
 * @typedef {'cash'|'card'|'gift_card'|'member_charge'|'split'} PaymentMethod
 */

/**
 * @typedef {Object} Transaction
 * @property {string} id - txn_xxx
 * @property {string} [tabId]
 * @property {string} [bookingId]
 * @property {string} [customerId]
 * @property {CartItem[]} items
 * @property {number} subtotal
 * @property {number} tax
 * @property {number} [discount]
 * @property {number} [tip]
 * @property {number} total
 * @property {PaymentMethod} paymentMethod
 * @property {string} [stripePaymentId]
 * @property {string} [giftCardId]
 * @property {'completed'|'refunded'|'void'} status
 * @property {string} employeeId
 * @property {string} registerId
 * @property {string} createdAt
 * @property {string} [refundedAt]
 * @property {number} [refundAmount]
 * @property {string} [_firebaseKey]
 */

/**
 * @typedef {Object} MenuItem
 * @property {number} id
 * @property {string} name
 * @property {number} price
 * @property {string} category
 * @property {string} [icon] - FontAwesome class
 * @property {string} [color] - Hex color
 * @property {boolean} [trackInventory]
 * @property {number} [stockCount]
 * @property {boolean} [isMembership]
 * @property {MemberType} [memberType]
 * @property {'monthly'|'annual'|'seasonal'} [billingCycle]
 */

// ============================================
// API / SYNC TYPES
// ============================================

/**
 * @typedef {Object} ApiResponse
 * @property {boolean} success
 * @property {*} [data]
 * @property {string} [error]
 * @property {number} [statusCode]
 */

/**
 * @typedef {Object} SyncState
 * @property {boolean} isOnline
 * @property {string} [lastSync] - ISO timestamp
 * @property {number} pendingChanges
 * @property {'idle'|'syncing'|'error'} status
 */

/**
 * @typedef {Object} StoreState
 * @property {Booking[]} bookings
 * @property {Customer[]} customers
 * @property {Tab[]} tabs
 * @property {Transaction[]} transactions
 * @property {Object} inventory
 * @property {SyncState} sync
 * @property {Object} ui
 */

/**
 * @typedef {Object} StoreAction
 * @property {string} type
 * @property {*} [payload]
 */

// ============================================
// PRICING TYPES
// ============================================

/**
 * @typedef {Object} PriceCalculation
 * @property {number} basePrice
 * @property {boolean} isPeak
 * @property {number} peakMultiplier
 * @property {number} memberDiscount
 * @property {MemberType} [memberType]
 * @property {number} finalPrice
 */

/**
 * @typedef {Object} OperatingHours
 * @property {number} open - Hour (0-23)
 * @property {number} close - Hour (0-23)
 */

// ============================================
// ERROR TYPES
// ============================================

/**
 * @typedef {Object} AppError
 * @property {string} code - Error code (e.g., 'BOOKING_CONFLICT')
 * @property {string} message - Human-readable message
 * @property {string} [context] - Where error occurred
 * @property {*} [details] - Additional data
 * @property {string} timestamp - ISO timestamp
 * @property {boolean} [userVisible] - Show to user?
 */

// ============================================
// GIFT CARD TYPES
// ============================================

/**
 * @typedef {Object} GiftCard
 * @property {string} id
 * @property {string} code - Redemption code
 * @property {number} initialBalance
 * @property {number} currentBalance
 * @property {string} [purchasedBy]
 * @property {string} [recipientEmail]
 * @property {string} [recipientName]
 * @property {string} [message]
 * @property {boolean} isActive
 * @property {string} createdAt
 * @property {string} [expiresAt]
 * @property {Object[]} [transactions] - Usage history
 */

// ============================================
// EMPLOYEE TYPES
// ============================================

/**
 * @typedef {Object} Employee
 * @property {string} id
 * @property {string} firstName
 * @property {string} lastName
 * @property {string} pin - 4-digit PIN
 * @property {'admin'|'manager'|'staff'} role
 * @property {string[]} permissions
 * @property {boolean} isActive
 * @property {string} [email]
 * @property {string} [phone]
 * @property {string} createdAt
 * @property {string} [lastLogin]
 */

// ============================================
// EVENT TYPES (for EventEmitter pattern)
// ============================================

/**
 * @typedef {'booking:created'|'booking:updated'|'booking:cancelled'|'booking:checkedIn'} BookingEvent
 */

/**
 * @typedef {'tab:opened'|'tab:updated'|'tab:closed'|'tab:void'} TabEvent
 */

/**
 * @typedef {'sync:started'|'sync:completed'|'sync:error'|'sync:offline'|'sync:online'} SyncEvent
 */

/**
 * @typedef {'customer:created'|'customer:updated'|'customer:deleted'|'membership:activated'|'membership:expired'} CustomerEvent
 */

// ============================================
// GLOBAL WINDOW PROPERTIES
// ============================================
// These declarations extend the Window interface to include our custom globals

/**
 * Extend Window interface for custom globals
 * @typedef {Window & {
 *   BookingSystem?: Object,
 *   GolfCoveMembership?: Object,
 *   GolfCoveConfig?: Object,
 *   GolfCoveAPI?: Object,
 *   GolfCoveCheckout?: Object,
 *   GolfCoveToast?: Object,
 *   MembershipConfig?: Object,
 *   Store?: Object,
 *   ErrorHandler?: Object,
 *   CacheManager?: Object,
 *   firebase?: Object,
 *   showToast?: Function
 * }} ExtendedWindow
 */

// Prevent "not used" warnings - these are type definitions
const _typeExports = {};
