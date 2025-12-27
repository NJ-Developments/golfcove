/**
 * Golf Cove - Unified Membership Configuration
 * =============================================
 * SINGLE SOURCE OF TRUTH for all membership tiers
 * 
 * This file is the ONLY place where membership tiers should be defined.
 * All other modules should import from here.
 * 
 * @version 1.0.0
 */

const MembershipConfig = (function() {
    'use strict';

    // ============================================
    // MEMBERSHIP TIERS - THE ONE TRUE SOURCE
    // ============================================
    const TIERS = {
        par: {
            key: 'par',
            name: 'Par Member',
            displayName: 'Par',
            level: 1,
            color: '#22c55e',
            
            // Pricing
            price: { monthly: 49, annual: 499 },
            stripePriceId: { monthly: 'price_par_monthly', annual: 'price_par_annual' },
            stripeProductId: 'prod_TcoONUcmaKaH23',
            
            // Discounts
            discount: 0.10,           // 10% off F&B
            hourlyDiscount: 0.50,     // 50% off hourly rate (not unlimited)
            unlimitedPlay: false,
            
            // Benefits
            benefits: {
                discountPercent: 10,
                hourlyDiscount: 50,
                priorityBooking: false,
                unlimitedPlay: false,
                maxReservationHours: 3,
                maxGuests: 3,
                freeBilliards: true,
                freePingPong: true,
                freeHoursPerMonth: 0,
                guestPassesPerMonth: 0
            },
            
            benefitsList: [
                '10% off food & beverages',
                '50% off hourly bay rates',
                'Free billiards & ping pong',
                'Up to 3 guests per visit'
            ]
        },
        
        birdie: {
            key: 'birdie',
            name: 'Birdie Member',
            displayName: 'Birdie',
            level: 2,
            color: '#3b82f6',
            
            price: { monthly: 79, annual: 799 },
            stripePriceId: { monthly: 'price_birdie_monthly', annual: 'price_birdie_annual' },
            stripeProductId: 'prod_TcoP9dwzhTxjcm',
            
            discount: 0.15,
            hourlyDiscount: 1.00,     // 100% = FREE (unlimited)
            unlimitedPlay: true,
            
            benefits: {
                discountPercent: 15,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 3,
                maxGuests: 3,
                freeBilliards: true,
                freePingPong: true,
                freeHoursPerMonth: 999,
                guestPassesPerMonth: 0
            },
            
            benefitsList: [
                '15% off food & beverages',
                'UNLIMITED simulator play',
                'Priority booking access',
                'Free billiards & ping pong'
            ]
        },
        
        eagle: {
            key: 'eagle',
            name: 'Eagle Member',
            displayName: 'Eagle',
            level: 3,
            color: '#f59e0b',
            
            price: { monthly: 129, annual: 1299 },
            stripePriceId: { monthly: 'price_eagle_monthly', annual: 'price_eagle_annual' },
            stripeProductId: 'prod_TcoPgE9e8pkBQb',
            
            discount: 0.20,
            hourlyDiscount: 1.00,
            unlimitedPlay: true,
            
            benefits: {
                discountPercent: 20,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 4,
                maxGuests: 4,
                freeBilliards: true,
                freePingPong: true,
                freeHoursPerMonth: 999,
                guestPassesPerMonth: 2,
                loungeAccess: true,
                proLessonsDiscount: true
            },
            
            benefitsList: [
                '20% off food & beverages',
                'UNLIMITED simulator play',
                'Priority booking access',
                '2 guest passes per month',
                'VIP lounge access',
                'Discount on pro lessons'
            ]
        },
        
        family_par: {
            key: 'family_par',
            name: 'Family Par',
            displayName: 'Family Par',
            level: 1,
            color: '#9b59b6',
            isFamily: true,
            maxFamilyMembers: 4,
            
            price: { monthly: 89, annual: 899 },
            stripePriceId: { monthly: 'price_family_par_monthly', annual: 'price_family_par_annual' },
            stripeProductId: 'prod_TcoQ34q9DuhHAs',
            
            discount: 0.10,
            hourlyDiscount: 0.50,
            unlimitedPlay: false,
            
            benefits: {
                discountPercent: 10,
                hourlyDiscount: 50,
                priorityBooking: false,
                unlimitedPlay: false,
                maxReservationHours: 3,
                maxGuests: 5,
                freeBilliards: true,
                freePingPong: true,
                freeHoursPerMonth: 0,
                includesMultisport: true
            },
            
            benefitsList: [
                '10% off food & beverages',
                '50% off hourly bay rates',
                'Up to 4 family members',
                'MultiSport arcade included'
            ]
        },
        
        family_birdie: {
            key: 'family_birdie',
            name: 'Family Birdie',
            displayName: 'Family Birdie',
            level: 2,
            color: '#8e44ad',
            isFamily: true,
            maxFamilyMembers: 4,
            
            price: { monthly: 139, annual: 1399 },
            stripePriceId: { monthly: 'price_family_birdie_monthly', annual: 'price_family_birdie_annual' },
            stripeProductId: 'prod_TcoQ6oEZK54MwA',
            
            discount: 0.15,
            hourlyDiscount: 1.00,
            unlimitedPlay: true,
            
            benefits: {
                discountPercent: 15,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 3,
                maxGuests: 5,
                freeBilliards: true,
                freePingPong: true,
                freeHoursPerMonth: 999,
                includesMultisport: true
            },
            
            benefitsList: [
                '15% off food & beverages',
                'UNLIMITED simulator play',
                'Up to 4 family members',
                'Priority booking'
            ]
        },
        
        family_eagle: {
            key: 'family_eagle',
            name: 'Family Eagle',
            displayName: 'Family Eagle',
            level: 3,
            color: '#e74c3c',
            isFamily: true,
            maxFamilyMembers: 6,
            
            price: { monthly: 199, annual: 1999 },
            stripePriceId: { monthly: 'price_family_eagle_monthly', annual: 'price_family_eagle_annual' },
            stripeProductId: 'prod_TcoRSXPK8DytS3',
            
            discount: 0.20,
            hourlyDiscount: 1.00,
            unlimitedPlay: true,
            
            benefits: {
                discountPercent: 20,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 4,
                maxGuests: 6,
                freeBilliards: true,
                freePingPong: true,
                freeHoursPerMonth: 999,
                guestPassesPerMonth: 4,
                loungeAccess: true,
                includesMultisport: true
            },
            
            benefitsList: [
                '20% off food & beverages',
                'UNLIMITED simulator play',
                'Up to 6 family members',
                '4 guest passes per month',
                'VIP lounge access'
            ]
        },
        
        corporate: {
            key: 'corporate',
            name: 'Corporate Member',
            displayName: 'Corporate',
            level: 2,
            color: '#2c3e50',
            isCorporate: true,
            maxEmployees: 10,
            
            price: { monthly: 499, annual: 4999 },
            stripePriceId: { monthly: 'price_corporate_monthly', annual: 'price_corporate_annual' },
            stripeProductId: 'prod_corporate',
            
            discount: 0.15,
            hourlyDiscount: 1.00,
            unlimitedPlay: true,
            
            benefits: {
                discountPercent: 15,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 4,
                maxGuests: 10,
                freeBilliards: true,
                freePingPong: true,
                freeHoursPerMonth: 999,
                privateEventDiscount: 20
            },
            
            benefitsList: [
                '15% off food & beverages',
                'UNLIMITED simulator play',
                'Up to 10 employees',
                '20% off private events',
                'Priority booking'
            ]
        },
        
        league_player: {
            key: 'league_player',
            name: 'League Player',
            displayName: 'League Player',
            level: 1,
            color: '#059669',
            isLeague: true,
            
            price: { seasonal: 400 },
            stripePriceId: { seasonal: 'price_league_player' },
            stripeProductId: 'prod_TcoDEZBb6T4SUr',
            
            discount: 0.05,
            hourlyDiscount: 0,
            unlimitedPlay: false,
            
            benefits: {
                discountPercent: 5,
                leagueAccess: true,
                priorityBooking: false
            },
            
            benefitsList: [
                'Full season league access',
                '5% off purchases',
                'League standings & stats'
            ]
        },
        
        league_team: {
            key: 'league_team',
            name: 'League Team',
            displayName: 'League Team',
            level: 2,
            color: '#047857',
            isLeague: true,
            maxTeamMembers: 2,
            
            price: { seasonal: 800 },
            stripePriceId: { seasonal: 'price_league_team' },
            stripeProductId: 'prod_TcoRmgQcPiy7kJ',
            
            discount: 0.10,
            hourlyDiscount: 0,
            unlimitedPlay: false,
            
            benefits: {
                discountPercent: 10,
                leagueAccess: true,
                priorityBooking: true
            },
            
            benefitsList: [
                'Full season for 2 players',
                '10% off purchases',
                'Priority league scheduling'
            ]
        },
        
        // Legacy types for backward compatibility
        monthly: {
            key: 'monthly',
            name: 'Monthly Member',
            displayName: 'Monthly',
            level: 1,
            color: '#4a90a4',
            isLegacy: true,
            
            discount: 0.10,
            hourlyDiscount: 0.10,
            unlimitedPlay: false,
            
            benefits: {
                discountPercent: 10,
                priorityBooking: false,
                freeBilliards: true,
                freePingPong: true
            },
            
            benefitsList: ['10% off purchases', 'Free billiards & ping pong']
        },
        
        annual: {
            key: 'annual',
            name: 'Annual Member',
            displayName: 'Annual',
            level: 2,
            color: '#27ae60',
            isLegacy: true,
            
            discount: 0.10,
            hourlyDiscount: 0.10,
            unlimitedPlay: false,
            
            benefits: {
                discountPercent: 10,
                priorityBooking: true,
                freeBilliards: true,
                freePingPong: true
            },
            
            benefitsList: ['10% off purchases', 'Priority booking', 'Free billiards & ping pong']
        }
    };

    // ============================================
    // HELPER METHODS
    // ============================================
    
    /**
     * Get a tier by key (case-insensitive)
     * @param {string} tierKey 
     * @returns {Object|null}
     */
    function getTier(tierKey) {
        if (!tierKey) return null;
        const key = tierKey.toLowerCase().trim();
        return TIERS[key] || null;
    }
    
    /**
     * Get all tier keys
     * @returns {string[]}
     */
    function getAllTierKeys() {
        return Object.keys(TIERS);
    }
    
    /**
     * Get all non-legacy tiers
     * @returns {Object}
     */
    function getActiveTiers() {
        const active = {};
        for (const [key, tier] of Object.entries(TIERS)) {
            if (!tier.isLegacy) {
                active[key] = tier;
            }
        }
        return active;
    }
    
    /**
     * Get discount for a member type
     * @param {string} tierKey 
     * @returns {number} Discount as decimal (0.10 = 10%)
     */
    function getDiscount(tierKey) {
        const tier = getTier(tierKey);
        return tier ? tier.discount : 0;
    }
    
    /**
     * Get hourly discount (for bay pricing)
     * @param {string} tierKey 
     * @returns {number} Discount as decimal (1.00 = 100% = free)
     */
    function getHourlyDiscount(tierKey) {
        const tier = getTier(tierKey);
        return tier ? tier.hourlyDiscount : 0;
    }
    
    /**
     * Check if tier has unlimited play
     * @param {string} tierKey 
     * @returns {boolean}
     */
    function hasUnlimitedPlay(tierKey) {
        const tier = getTier(tierKey);
        return tier ? tier.unlimitedPlay === true : false;
    }
    
    /**
     * Get tier color
     * @param {string} tierKey 
     * @returns {string} Hex color
     */
    function getColor(tierKey) {
        const tier = getTier(tierKey);
        return tier ? tier.color : '#666666';
    }
    
    /**
     * Get tier display name
     * @param {string} tierKey 
     * @returns {string}
     */
    function getName(tierKey) {
        const tier = getTier(tierKey);
        return tier ? tier.name : 'Member';
    }
    
    /**
     * Get benefits list for display
     * @param {string} tierKey 
     * @returns {string[]}
     */
    function getBenefitsList(tierKey) {
        const tier = getTier(tierKey);
        return tier ? tier.benefitsList : [];
    }
    
    /**
     * Calculate bay price with member discount
     * @param {number} basePrice 
     * @param {string} tierKey 
     * @returns {number}
     */
    function calculateBayPrice(basePrice, tierKey) {
        if (hasUnlimitedPlay(tierKey)) {
            return 0; // FREE for unlimited members
        }
        const discount = getHourlyDiscount(tierKey);
        return Math.round(basePrice * (1 - discount) * 100) / 100;
    }
    
    /**
     * Calculate F&B price with member discount
     * @param {number} subtotal 
     * @param {string} tierKey 
     * @returns {number}
     */
    function calculateFnBDiscount(subtotal, tierKey) {
        const discount = getDiscount(tierKey);
        return Math.round(subtotal * discount * 100) / 100;
    }
    
    /**
     * Generate member discounts object for BookingSystem compatibility
     * @returns {Object} Map of tierKey -> hourlyDiscount
     */
    function getMemberDiscountsMap() {
        const map = {};
        for (const [key, tier] of Object.entries(TIERS)) {
            map[key] = tier.hourlyDiscount;
        }
        return map;
    }
    
    /**
     * Generate MEMBER_TIERS object for booking.html compatibility
     * @returns {Object}
     */
    function getBookingTiersMap() {
        const map = {};
        for (const [key, tier] of Object.entries(TIERS)) {
            map[key] = {
                name: tier.name,
                discount: tier.discount,
                unlimited: tier.unlimitedPlay,
                color: tier.color
            };
        }
        return map;
    }

    // ============================================
    // PUBLIC API
    // ============================================
    return {
        // Raw data
        TIERS,
        
        // Getters
        getTier,
        getAllTierKeys,
        getActiveTiers,
        getDiscount,
        getHourlyDiscount,
        hasUnlimitedPlay,
        getColor,
        getName,
        getBenefitsList,
        
        // Calculations
        calculateBayPrice,
        calculateFnBDiscount,
        
        // Compatibility maps
        getMemberDiscountsMap,
        getBookingTiersMap
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.MembershipConfig = MembershipConfig;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = MembershipConfig;
}
