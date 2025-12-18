/**
 * Golf Cove - Unified Configuration
 * Single source of truth for all configurable values
 * All modules should import from here instead of defining their own
 * @version 2.0.0
 */

const GolfCoveConfig = (function() {
    'use strict';
    
    // ============ CORE BUSINESS SETTINGS ============
    const business = {
        name: 'Golf Cove',
        address: {
            street: '336 State Street',
            city: 'North Haven',
            state: 'CT',
            zip: '06473',
            country: 'US'
        },
        phone: '(203) 555-0100',
        email: 'info@golfcove.com',
        website: 'https://golfcove.com',
        timezone: 'America/New_York'
    };
    
    // ============ TAX & PRICING ============
    // SINGLE SOURCE OF TRUTH - Do not define tax rates elsewhere!
    const pricing = {
        taxRate: 0.0635, // 6.35% CT Sales Tax
        currency: 'USD',
        currencySymbol: '$',
        roundingMethod: 'nearest', // 'up', 'down', 'nearest'
        
        // Tip presets
        tipPresets: [15, 18, 20, 25],
        
        // Minimum transaction amounts
        minimumCardTransaction: 0.50,
        minimumGiftCard: 5,
        maximumGiftCard: 500
    };
    
    // ============ API & SYNC SETTINGS ============
    const api = {
        // API key for authenticated sync requests (must match Firebase Functions config)
        // In production, this should be set via environment or secure config
        key: 'gc-dev-key-2024',
        
        // Base URL for API calls
        baseUrl: window.location.hostname === 'localhost' 
            ? 'http://localhost:5001/golfcove-d3c46/us-central1'
            : '/api',
        
        // Sync settings
        syncInterval: 30000, // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000,
        
        // Rate limits (client-side guidance)
        maxRequestsPerMinute: 60
    };
    
    // ============ OPERATING HOURS ============
    const operatingHours = {
        weekday: { open: 9, close: 22 },  // 9am - 10pm
        weekend: { open: 8, close: 23 },   // 8am - 11pm
        holidays: { open: 10, close: 20 }, // 10am - 8pm
        
        peakHours: {
            weekday: { start: 17, end: 21 },  // 5pm - 9pm
            weekend: { start: 10, end: 21 }   // 10am - 9pm
        },
        peakSurcharge: 1.25 // 25% surcharge during peak
    };
    
    // ============ BAY/ROOM CONFIGURATION ============
    const bays = {
        single: { 
            count: 6, 
            capacity: 2, 
            color: '#3b82f6',
            hourlyRate: { weekday: 30, weekend: 40 }
        },
        double: { 
            count: 4, 
            capacity: 4, 
            color: '#10b981',
            hourlyRate: { weekday: 50, weekend: 65 }
        },
        triple: { 
            count: 2, 
            capacity: 6, 
            color: '#f59e0b',
            hourlyRate: { weekday: 70, weekend: 90 }
        },
        lounge: { 
            count: 2, 
            capacity: 8, 
            color: '#8b5cf6',
            hourlyRate: { weekday: 100, weekend: 130 }
        },
        party: { 
            count: 1, 
            capacity: 12, 
            color: '#ec4899',
            hourlyRate: { weekday: 200, weekend: 250 }
        }
    };
    
    // Simulator rooms (legacy compatibility)
    const rooms = [
        { id: 1, name: 'Room 1', type: 'simulator', capacity: 4, hourlyRate: 45 },
        { id: 2, name: 'Room 2', type: 'simulator', capacity: 4, hourlyRate: 45 },
        { id: 3, name: 'Room 3', type: 'simulator', capacity: 4, hourlyRate: 45 }
    ];
    
    // ============ BOOKING SETTINGS ============
    const booking = {
        slotDuration: 30,    // minutes
        minDuration: 30,     // minutes
        maxDuration: 240,    // 4 hours
        bufferTime: 15,      // minutes between bookings
        advanceBookingDays: 30,
        cancellationWindow: 24, // hours for full refund
        partialRefundWindow: 12, // hours for partial refund
        partialRefundPercent: 50,
        noShowWindow: 15,    // minutes past start time
        depositRequired: true,
        depositAmount: 20
    };
    
    // ============ MEMBERSHIP TIERS ============
    // SINGLE SOURCE OF TRUTH - All membership data here!
    const membershipTiers = {
        par: {
            name: 'Par Member',
            displayName: 'Par',
            level: 1,
            color: '#22c55e',
            stripeProductId: 'prod_TcoONUcmaKaH23',
            price: { monthly: 49, annual: 499 },
            stripePrice: { monthly: 4900, annual: 49900 }, // In cents
            discount: 0.10, // 10% off
            benefits: {
                discountPercent: 10,
                hourlyDiscount: 50, // Save up to 50% per hour
                priorityBooking: false,
                unlimitedPlay: false,
                maxReservationHours: 3,
                maxGuests: 3,
                freeBilliards: true,
                freePingPong: true,
                freeHours: 0,
                guestPasses: 0
            },
            benefitsList: [
                '10% off all purchases',
                'Priority booking',
                'Member events access'
            ]
        },
        birdie: {
            name: 'Birdie Member',
            displayName: 'Birdie',
            level: 2,
            color: '#3b82f6',
            stripeProductId: 'prod_TcoP9dwzhTxjcm',
            price: { monthly: 79, annual: 799 },
            stripePrice: { monthly: 7900, annual: 79900 },
            discount: 0.15,
            benefits: {
                discountPercent: 15,
                hourlyDiscount: 0, // Unlimited
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 3,
                maxGuests: 3,
                freeBilliards: true,
                freePingPong: true,
                freeHours: 2,
                guestPasses: 0
            },
            benefitsList: [
                '15% off all purchases',
                'Priority booking',
                'Member events access',
                '2 free hours per month',
                'Guest passes'
            ]
        },
        eagle: {
            name: 'Eagle Member',
            displayName: 'Eagle',
            level: 3,
            color: '#f59e0b',
            stripeProductId: 'prod_TcoPgE9e8pkBQb',
            price: { monthly: 129, annual: 1299 },
            stripePrice: { monthly: 12900, annual: 129900 },
            discount: 0.20,
            benefits: {
                discountPercent: 20,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 4,
                maxGuests: 4,
                freeBilliards: true,
                freePingPong: true,
                freeHours: 5,
                guestPasses: 2,
                loungeAccess: true,
                proLessonsDiscount: true
            },
            benefitsList: [
                '20% off all purchases',
                'Priority booking',
                'Member events access',
                '5 free hours per month',
                'Guest passes',
                'Lounge access',
                'Pro lessons discount'
            ]
        },
        family_par: {
            name: 'Family Par',
            displayName: 'Family Par',
            level: 1,
            color: '#9b59b6',
            isFamily: true,
            stripeProductId: 'prod_TcoQ34q9DuhHAs',
            price: { monthly: 89, annual: 899 },
            stripePrice: { monthly: 8900, annual: 89900 },
            discount: 0.10,
            maxMembers: 4,
            benefits: {
                discountPercent: 10,
                hourlyDiscount: 50,
                priorityBooking: false,
                unlimitedPlay: false,
                maxReservationHours: 3,
                maxGuests: 5,
                freeBilliards: true,
                freePingPong: true,
                freeHours: 0,
                includesMultisport: true
            },
            benefitsList: [
                '10% off all purchases',
                'Priority booking',
                'Up to 4 family members',
                'Multisport access'
            ]
        },
        family_birdie: {
            name: 'Family Birdie',
            displayName: 'Family Birdie',
            level: 2,
            color: '#8e44ad',
            isFamily: true,
            stripeProductId: 'prod_TcoQ6oEZK54MwA',
            price: { monthly: 139, annual: 1399 },
            stripePrice: { monthly: 13900, annual: 139900 },
            discount: 0.15,
            maxMembers: 4,
            benefits: {
                discountPercent: 15,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 3,
                maxGuests: 5,
                freeBilliards: true,
                freePingPong: true,
                freeHours: 4,
                includesMultisport: true
            },
            benefitsList: [
                '15% off all purchases',
                'Priority booking',
                'Up to 4 family members',
                '4 free hours per month'
            ]
        },
        family_eagle: {
            name: 'Family Eagle',
            displayName: 'Family Eagle',
            level: 3,
            color: '#e74c3c',
            isFamily: true,
            stripeProductId: 'prod_TcoRSXPK8DytS3',
            price: { monthly: 199, annual: 1999 },
            stripePrice: { monthly: 19900, annual: 199900 },
            discount: 0.20,
            maxMembers: 6,
            benefits: {
                discountPercent: 20,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 4,
                maxGuests: 6,
                freeBilliards: true,
                freePingPong: true,
                freeHours: 10,
                loungeAccess: true,
                includesMultisport: true
            },
            benefitsList: [
                '20% off all purchases',
                'Priority booking',
                'Up to 6 family members',
                '10 free hours per month',
                'Lounge access'
            ]
        },
        league_player: {
            name: 'League Player',
            displayName: 'League Player',
            level: 1,
            color: '#059669',
            isLeague: true,
            stripeProductId: 'prod_TcoDEZBb6T4SUr',
            price: { seasonal: 400 },
            stripePrice: { seasonal: 40000 }, // In cents
            discount: 0.05,
            benefits: {
                discountPercent: 5,
                leagueAccess: true,
                priorityBooking: false
            },
            benefitsList: [
                'Full season league access',
                '5% off purchases',
                'League events & standings'
            ]
        },
        league_team: {
            name: 'League Team',
            displayName: 'League Team (2 Players)',
            level: 2,
            color: '#047857',
            isLeague: true,
            stripeProductId: 'prod_TcoRmgQcPiy7kJ',
            price: { seasonal: 800 },
            stripePrice: { seasonal: 80000 }, // In cents
            discount: 0.10,
            maxMembers: 2,
            benefits: {
                discountPercent: 10,
                leagueAccess: true,
                priorityBooking: true
            },
            benefitsList: [
                'Full season for 2 players',
                '10% off purchases',
                'Priority league scheduling',
                'Team standings & stats'
            ]
        }
    };
    
    // ============ SYNC & API SETTINGS ============
    const sync = {
        interval: 30000,          // 30 seconds
        retryAttempts: 3,
        retryDelay: 1000,
        conflictResolution: 'server-wins', // 'server-wins', 'client-wins', 'merge'
        collections: ['customers', 'bookings', 'tabs', 'transactions', 'inventory', 'employees']
    };
    
    // Note: api config is defined earlier in the file (around line 45)
    // Adding additional API settings here:
    api.timeout = 30000;
    api.cacheEnabled = true;
    api.cacheTTL = {
        short: 30000,      // 30 seconds
        medium: 300000,    // 5 minutes
        long: 3600000      // 1 hour
    };
    
    // ============ NOTIFICATION SETTINGS ============
    const notifications = {
        reminderHours: 24,      // Hours before booking to send reminder
        expirationDays: 14,     // Days before membership expires to notify
        gracePeriod: 7          // Days after expiration before suspension
    };
    
    // ============ POS SETTINGS ============
    const pos = {
        registerId: localStorage.getItem('gc_register_id') || 'POS-1',
        receiptEmail: true,
        requireSignature: false,
        signatureThreshold: 25,  // Require signature for amounts over this
        quickAmounts: [1, 5, 10, 20, 50, 100]
    };
    
    // ============ STRIPE SETTINGS ============
    // Single source of truth for all Stripe configuration
    const stripe = {
        // Public key - safe for client-side (set via environment or replace for production)
        publicKey: localStorage.getItem('gc_stripe_pk') || 'pk_test_51ScLeeJaljqVA3ADcKsUNYdLQpYj1B2QzKRwJ5O8TjkQJQ7RgHjL9Tg1Z4YBWS5Y3c0wj8RbRE0XlJ7lVjGtRjQ800b1Np5K',
        
        // Firebase Functions URL for backend Stripe operations
        functionsUrl: window.location.hostname === 'localhost'
            ? 'http://localhost:5001/golfcove/us-central1'
            : 'https://us-central1-golfcove.cloudfunctions.net',
        
        // Terminal configuration
        terminal: {
            enabled: true,
            locationId: localStorage.getItem('gc_stripe_location') || null,
            simulatedReader: window.location.hostname === 'localhost',
            autoReconnect: true,
            reconnectAttempts: 3,
            reconnectDelay: 2000,
            paymentTimeout: 120000, // 2 minutes for customer interaction
            collectTimeout: 60000   // 1 minute for tap/insert/swipe
        },
        
        // Checkout configuration
        checkout: {
            successUrl: window.location.origin + '/payment-success.html',
            cancelUrl: window.location.origin,
            allowPromoCode: true
        },
        
        // Payment settings
        currency: 'usd',
        country: 'US',
        
        // Supported payment methods for online checkout
        paymentMethods: ['card'],
        
        // Apple Pay / Google Pay (requires domain verification)
        walletPayments: {
            applePay: false, // Enable after domain verification
            googlePay: false, // Enable after domain verification
            link: true // Stripe Link (autofill)
        },
        
        // Transaction limits
        limits: {
            minAmount: 50, // 50 cents minimum
            maxAmount: 1000000, // $10,000 maximum
            maxRefundDays: 90 // Days after payment to allow refund
        }
    };
    
    // ============ HELPER FUNCTIONS ============
    
    /**
     * Get discount rate for a membership type
     */
    function getMemberDiscount(memberType) {
        const tier = membershipTiers[memberType];
        return tier ? tier.discount : 0;
    }
    
    /**
     * Check if date falls on weekend
     */
    function isWeekend(date) {
        const d = new Date(date);
        return d.getDay() === 0 || d.getDay() === 6;
    }
    
    /**
     * Check if time is during peak hours
     */
    function isPeakHour(date, hour) {
        const peak = isWeekend(date) 
            ? operatingHours.peakHours.weekend 
            : operatingHours.peakHours.weekday;
        return hour >= peak.start && hour < peak.end;
    }
    
    /**
     * Get operating hours for a date
     */
    function getOperatingHours(date) {
        return isWeekend(date) ? operatingHours.weekend : operatingHours.weekday;
    }
    
    /**
     * Calculate tax for an amount
     */
    function calculateTax(amount) {
        return Math.round(amount * pricing.taxRate * 100) / 100;
    }
    
    /**
     * Format currency
     */
    function formatCurrency(amount) {
        return pricing.currencySymbol + amount.toFixed(2);
    }
    
    /**
     * Get all individual membership types (non-family)
     */
    function getIndividualTiers() {
        return Object.entries(membershipTiers)
            .filter(([key, tier]) => !tier.isFamily)
            .reduce((acc, [key, tier]) => ({ ...acc, [key]: tier }), {});
    }
    
    /**
     * Get all family membership types
     */
    function getFamilyTiers() {
        return Object.entries(membershipTiers)
            .filter(([key, tier]) => tier.isFamily)
            .reduce((acc, [key, tier]) => ({ ...acc, [key]: tier }), {});
    }
    
    // ============ PUBLIC API ============
    return Object.freeze({
        // Data
        business,
        pricing,
        operatingHours,
        bays,
        rooms,
        booking,
        membershipTiers,
        sync,
        api,
        notifications,
        pos,
        stripe,
        
        // Convenience accessors
        get taxRate() { return pricing.taxRate; },
        get currency() { return pricing.currency; },
        
        // Helper functions
        getMemberDiscount,
        isWeekend,
        isPeakHour,
        getOperatingHours,
        calculateTax,
        formatCurrency,
        getIndividualTiers,
        getFamilyTiers,
        
        // Version
        version: '2.1.0'
    });
})();

// Make it globally available
window.GolfCoveConfig = GolfCoveConfig;

// Also export for ES modules if supported
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveConfig;
}
