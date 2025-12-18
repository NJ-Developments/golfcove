/**
 * Golf Cove - Configuration & Constants
 * 
 * @deprecated USE config-unified.js INSTEAD
 * This file is maintained only for backwards compatibility.
 * All new code should import from config-unified.js
 * 
 * If both files are loaded, config-unified.js will override this.
 */

// Log deprecation warning once
console.warn('[Golf Cove] config.js is deprecated. Use config-unified.js instead.');

const GolfCoveConfig = (function() {
    'use strict';
    
    // ============ BUSINESS INFO ============
    const BUSINESS = {
        name: 'Golf Cove',
        tagline: 'Toptracer Driving Range',
        address: '123 Golf Drive',
        city: 'Your City',
        state: 'NY',
        zip: '10001',
        phone: '(555) 123-4567',
        email: 'info@golfcove.com',
        website: 'https://golfcove.web.app',
        timezone: 'America/New_York'
    };
    
    // ============ OPERATING HOURS ============
    const HOURS = {
        default: {
            open: '09:00',
            close: '22:00'
        },
        byDay: {
            0: { open: '10:00', close: '20:00' }, // Sunday
            1: { open: '09:00', close: '22:00' }, // Monday
            2: { open: '09:00', close: '22:00' }, // Tuesday
            3: { open: '09:00', close: '22:00' }, // Wednesday
            4: { open: '09:00', close: '22:00' }, // Thursday
            5: { open: '09:00', close: '23:00' }, // Friday
            6: { open: '09:00', close: '23:00' }  // Saturday
        },
        holidays: [] // ['2024-12-25', '2024-01-01']
    };
    
    // ============ PRICING ============
    const PRICING = {
        // Bay rates
        bays: {
            standard: {
                hourly: 40,
                peakHourly: 50,
                peakHours: ['17:00', '18:00', '19:00', '20:00']
            },
            premium: {
                hourly: 55,
                peakHourly: 65,
                peakHours: ['17:00', '18:00', '19:00', '20:00']
            }
        },
        
        // Multisport rates
        multisport: {
            hourly: 60,
            peakHourly: 75
        },
        
        // Deposit requirements
        deposits: {
            standard: 0,
            privateEvent: 100,
            largeGroup: 50
        },
        
        // Tax rate - MUST MATCH config-unified.js
        taxRate: 0.0635 // 6.35% CT Sales Tax
    };
    
    // ============ MEMBERSHIP TIERS ============
    const MEMBERSHIPS = {
        eagle: {
            name: 'Eagle',
            discount: 0.20,
            color: '#FFD700',
            perks: ['20% off all bookings', 'Priority reservations', 'Free guest passes (2/month)']
        },
        'eagle-family': {
            name: 'Eagle Family',
            discount: 0.20,
            color: '#FFD700',
            perks: ['20% off all bookings', 'Up to 4 family members', 'Priority reservations']
        },
        birdie: {
            name: 'Birdie',
            discount: 0.15,
            color: '#C0C0C0',
            perks: ['15% off all bookings', 'Early access to events']
        },
        'birdie-family': {
            name: 'Birdie Family',
            discount: 0.15,
            color: '#C0C0C0',
            perks: ['15% off all bookings', 'Up to 4 family members']
        },
        par: {
            name: 'Par',
            discount: 0.10,
            color: '#CD7F32',
            perks: ['10% off all bookings', 'Newsletter & updates']
        },
        'par-family': {
            name: 'Par Family',
            discount: 0.10,
            color: '#CD7F32',
            perks: ['10% off all bookings', 'Up to 4 family members']
        }
    };
    
    // ============ ROOMS/BAYS ============
    const ROOMS = {
        1: { name: 'Bay 1', type: 'standard', capacity: 6, hasToptracer: true },
        2: { name: 'Bay 2', type: 'standard', capacity: 6, hasToptracer: true },
        3: { name: 'Bay 3', type: 'premium', capacity: 8, hasToptracer: true },
        4: { name: 'Bay 4', type: 'standard', capacity: 6, hasToptracer: true },
        5: { name: 'Bay 5', type: 'standard', capacity: 6, hasToptracer: true },
        6: { name: 'Bay 6', type: 'premium', capacity: 8, hasToptracer: true },
        multisport: { name: 'Multisport Simulator', type: 'multisport', capacity: 10, hasToptracer: false }
    };
    
    // ============ BOOKING SETTINGS ============
    const BOOKINGS = {
        minDuration: 1, // hours
        maxDuration: 4, // hours
        advanceBookingDays: 30, // How far in advance can book
        cancellationHours: 24, // Hours before for free cancellation
        noShowFee: 25, // Fee for no-shows
        timeSlotInterval: 60, // minutes
        bufferTime: 15 // minutes between bookings
    };
    
    // ============ POS SETTINGS ============
    const POS = {
        defaultTip: 0.15,
        tipOptions: [0.15, 0.18, 0.20, 0.25],
        quickCashAmounts: [20, 50, 100],
        receiptFooter: 'Thank you for visiting Golf Cove!\nSee you on the range!',
        autoLockMinutes: 5
    };
    
    // ============ STRIPE SETTINGS ============
    const STRIPE = {
        // Publishable key (safe for client-side) - get from Stripe Dashboard → Developers → API Keys
        // Your secret key is configured in Firebase Functions (functions/index.js)
        publishableKey: 'pk_test_51ScLeeJaljqVA3AD63xtmTb7CI3AQGgdJ6M6MeTBq7vtLas4zpWXD6buOI8TJMwUgJ63jSDxKQVD01ipUTNpIZE100r4b710QD',
        terminalLocation: 'tml_xxx', // Replace with actual
        readerIds: [], // Terminal reader IDs
        currency: 'usd',
        functionsBaseUrl: 'https://us-central1-golfcove.cloudfunctions.net'
    };
    
    // ============ FIREBASE ============
    const FIREBASE = {
        projectId: 'golfcove',
        hostingUrl: 'https://golfcove.web.app',
        region: 'us-central1'
    };
    
    // ============ NOTIFICATION SETTINGS ============
    const NOTIFICATIONS = {
        email: {
            enabled: true,
            fromAddress: 'noreply@golfcove.com',
            templates: {
                bookingConfirmation: true,
                bookingReminder: true,
                giftCardPurchase: true,
                membershipRenewal: true
            }
        },
        sms: {
            enabled: false
        }
    };
    
    // ============ FEATURE FLAGS ============
    const FEATURES = {
        enableOnlineBooking: true,
        enableGiftCards: true,
        enableLoyalty: true,
        enablePromoCodes: true,
        enableHappyHour: true,
        enableInventory: true,
        enableReporting: true,
        enableMultisport: true,
        requireDeposit: false,
        allowWalkIns: true
    };
    
    // ============ STORAGE KEYS ============
    const STORAGE_KEYS = {
        bookings: 'gc_bookings',
        transactions: 'gc_transactions',
        customers: 'gc_customers',
        employees: 'gc_employees',
        giftCards: 'gc_gift_cards',
        inventory: 'gc_inventory',
        tabs: 'gc_tabs',
        promotions: 'gc_promotions',
        settings: 'gc_settings'
    };
    
    // ============ MENU CATEGORIES ============
    const MENU_CATEGORIES = [
        { id: 'appetizers', name: 'Appetizers', icon: 'fa-utensils' },
        { id: 'entrees', name: 'Entrees', icon: 'fa-burger' },
        { id: 'sides', name: 'Sides', icon: 'fa-french-fries' },
        { id: 'kids', name: 'Kids Menu', icon: 'fa-child' },
        { id: 'desserts', name: 'Desserts', icon: 'fa-cake-candles' },
        { id: 'beer', name: 'Beer', icon: 'fa-beer-mug-empty' },
        { id: 'wine', name: 'Wine', icon: 'fa-wine-glass' },
        { id: 'cocktails', name: 'Cocktails', icon: 'fa-martini-glass-citrus' },
        { id: 'non-alcoholic', name: 'Non-Alcoholic', icon: 'fa-glass-water' },
        { id: 'merchandise', name: 'Merchandise', icon: 'fa-shirt' }
    ];
    
    // ============ HELPER METHODS ============
    function isOpen(date = new Date()) {
        const day = date.getDay();
        const time = date.toTimeString().slice(0, 5);
        const hours = HOURS.byDay[day] || HOURS.default;
        
        // Check holidays
        const dateStr = date.toISOString().split('T')[0];
        if (HOURS.holidays.includes(dateStr)) {
            return false;
        }
        
        return time >= hours.open && time < hours.close;
    }
    
    function getHours(date = new Date()) {
        const day = date.getDay();
        return HOURS.byDay[day] || HOURS.default;
    }
    
    function getMemberDiscount(memberType) {
        const membership = MEMBERSHIPS[memberType];
        return membership ? membership.discount : 0;
    }
    
    function isPeakTime(time) {
        const standardPeak = PRICING.bays.standard.peakHours;
        return standardPeak.includes(time);
    }
    
    function getRoom(roomId) {
        return ROOMS[roomId] || null;
    }
    
    function getAllRooms() {
        return Object.entries(ROOMS).map(([id, room]) => ({
            id,
            ...room
        }));
    }
    
    function isFeatureEnabled(feature) {
        return FEATURES[feature] === true;
    }
    
    function formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount);
    }
    
    function calculateTax(subtotal) {
        return subtotal * PRICING.taxRate;
    }
    
    // Public API
    return {
        // Data
        BUSINESS,
        HOURS,
        PRICING,
        MEMBERSHIPS,
        ROOMS,
        BOOKINGS,
        POS,
        STRIPE,
        FIREBASE,
        NOTIFICATIONS,
        FEATURES,
        STORAGE_KEYS,
        MENU_CATEGORIES,
        
        // Helpers
        isOpen,
        getHours,
        getMemberDiscount,
        isPeakTime,
        getRoom,
        getAllRooms,
        isFeatureEnabled,
        formatCurrency,
        calculateTax
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveConfig;
}
