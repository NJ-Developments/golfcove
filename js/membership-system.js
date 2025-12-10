/**
 * Golf Cove - Unified Membership System
 * Centralized membership configuration and utilities
 * Used across POS, customers, and booking systems
 * @version 1.0.0
 */

const GolfCoveMembership = {
    // ============================================
    // MEMBERSHIP TIERS & BENEFITS
    // ============================================
    tiers: {
        'par': {
            name: 'Par Member',
            level: 1,
            color: '#4a90a4',
            benefits: {
                discountPercent: 10,           // 10% off F&B and parties
                hourlyDiscount: 50,            // Save up to 50% per hour
                priorityBooking: false,
                unlimitedPlay: false,
                maxReservationHours: 3,
                maxGuests: 3,
                freeBilliards: true,
                freePingPong: true
            }
        },
        'birdie': {
            name: 'Birdie Member',
            level: 2,
            color: '#27ae60',
            benefits: {
                discountPercent: 10,
                hourlyDiscount: 0,             // Unlimited, no hourly charge
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 3,
                maxGuests: 3,
                freeBilliards: true,
                freePingPong: true
            }
        },
        'eagle': {
            name: 'Eagle Member',
            level: 3,
            color: '#f1c40f',
            benefits: {
                discountPercent: 15,           // Higher discount for top tier
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 4,        // Extra hour
                maxGuests: 4,                  // Extra guest
                freeBilliards: true,
                freePingPong: true,
                guestPasses: 2                 // Free guest passes per month
            }
        },
        'family_par': {
            name: 'Family Par',
            level: 1,
            color: '#9b59b6',
            isFamily: true,
            benefits: {
                discountPercent: 10,
                hourlyDiscount: 50,
                priorityBooking: false,
                unlimitedPlay: false,
                maxReservationHours: 3,
                maxGuests: 5,                  // More guests for family
                freeBilliards: true,
                freePingPong: true,
                includesMultisport: true
            }
        },
        'family_birdie': {
            name: 'Family Birdie',
            level: 2,
            color: '#8e44ad',
            isFamily: true,
            benefits: {
                discountPercent: 10,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 3,
                maxGuests: 5,
                freeBilliards: true,
                freePingPong: true,
                includesMultisport: true
            }
        },
        'family_eagle': {
            name: 'Family Eagle',
            level: 3,
            color: '#e74c3c',
            isFamily: true,
            benefits: {
                discountPercent: 15,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 4,
                maxGuests: 6,
                freeBilliards: true,
                freePingPong: true,
                includesMultisport: true,
                guestPasses: 4
            }
        },
        'corporate': {
            name: 'Corporate Member',
            level: 2,
            color: '#2c3e50',
            isCorporate: true,
            benefits: {
                discountPercent: 15,
                hourlyDiscount: 0,
                priorityBooking: true,
                unlimitedPlay: true,
                maxReservationHours: 4,
                maxGuests: 10,
                freeBilliards: true,
                freePingPong: true,
                privateEventDiscount: 20
            }
        },
        // Legacy types for backwards compatibility
        'monthly': {
            name: 'Monthly Member',
            level: 1,
            color: '#4a90a4',
            benefits: {
                discountPercent: 10,
                priorityBooking: false,
                freeBilliards: true,
                freePingPong: true
            }
        },
        'annual': {
            name: 'Annual Member',
            level: 2,
            color: '#27ae60',
            benefits: {
                discountPercent: 10,
                priorityBooking: true,
                freeBilliards: true,
                freePingPong: true
            }
        }
    },

    // ============================================
    // MEMBER UTILITIES
    // ============================================
    
    /**
     * Check if a customer has an active membership
     */
    isActiveMember: function(customer) {
        if (!customer || !customer.isMember) return false;
        if (!customer.memberExpires) return customer.isMember;
        return new Date(customer.memberExpires) > new Date();
    },

    /**
     * Get membership tier info for a customer
     */
    getMemberTier: function(customer) {
        if (!this.isActiveMember(customer)) return null;
        const tierKey = customer.memberType || 'monthly';
        return this.tiers[tierKey] || this.tiers['monthly'];
    },

    /**
     * Calculate member discount for a subtotal
     */
    calculateDiscount: function(customer, subtotal, category = 'fnb') {
        if (!this.isActiveMember(customer)) return 0;
        
        const tier = this.getMemberTier(customer);
        if (!tier || !tier.benefits) return 0;
        
        let discountPercent = tier.benefits.discountPercent || 0;
        
        // Special category discounts
        if (category === 'private_event' && tier.benefits.privateEventDiscount) {
            discountPercent = tier.benefits.privateEventDiscount;
        }
        
        return subtotal * (discountPercent / 100);
    },

    /**
     * Get all benefits as human-readable list
     */
    getBenefitsList: function(customer) {
        const tier = this.getMemberTier(customer);
        if (!tier) return [];
        
        const benefits = [];
        const b = tier.benefits;
        
        if (b.discountPercent) benefits.push(`${b.discountPercent}% off food & beverages`);
        if (b.unlimitedPlay) benefits.push('Unlimited simulator play');
        if (b.hourlyDiscount && !b.unlimitedPlay) benefits.push(`${b.hourlyDiscount}% off hourly rates`);
        if (b.priorityBooking) benefits.push('Priority booking access');
        if (b.maxGuests) benefits.push(`Up to ${b.maxGuests} guests per visit`);
        if (b.freeBilliards) benefits.push('Free billiards access');
        if (b.freePingPong) benefits.push('Free ping pong access');
        if (b.guestPasses) benefits.push(`${b.guestPasses} free guest passes/month`);
        if (b.includesMultisport) benefits.push('MultiSport arcade included');
        if (b.privateEventDiscount) benefits.push(`${b.privateEventDiscount}% off private events`);
        
        return benefits;
    },

    /**
     * Check if membership is expiring soon (within 14 days)
     */
    isExpiringSoon: function(customer) {
        if (!customer || !customer.memberExpires) return false;
        const expires = new Date(customer.memberExpires);
        const twoWeeks = new Date();
        twoWeeks.setDate(twoWeeks.getDate() + 14);
        return expires <= twoWeeks && expires > new Date();
    },

    /**
     * Get days until membership expires
     */
    getDaysUntilExpiry: function(customer) {
        if (!customer || !customer.memberExpires) return null;
        const expires = new Date(customer.memberExpires);
        const today = new Date();
        const diffTime = expires - today;
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    },

    /**
     * Format membership status for display
     */
    getStatusBadge: function(customer) {
        if (!customer) return '';
        
        if (!customer.isMember) {
            return '<span class="status-badge non-member">Non-Member</span>';
        }
        
        const tier = this.getMemberTier(customer);
        if (!this.isActiveMember(customer)) {
            return `<span class="status-badge expired" style="background:#95a5a6;">Expired ${tier ? tier.name : 'Member'}</span>`;
        }
        
        if (this.isExpiringSoon(customer)) {
            const days = this.getDaysUntilExpiry(customer);
            return `<span class="status-badge expiring" style="background:${tier.color};">${tier.name} (${days}d left)</span>`;
        }
        
        return `<span class="status-badge active" style="background:${tier.color};">${tier.name}</span>`;
    },

    // ============================================
    // LOCALSTORAGE SYNC
    // ============================================
    
    /**
     * Get all customers from localStorage
     */
    getCustomers: function() {
        return JSON.parse(localStorage.getItem('gc_customers') || '[]');
    },

    /**
     * Save customers to localStorage
     */
    saveCustomers: function(customers) {
        localStorage.setItem('gc_customers', JSON.stringify(customers));
    },

    /**
     * Find a customer by name
     */
    findCustomerByName: function(name) {
        if (!name) return null;
        const customers = this.getCustomers();
        const searchName = name.toLowerCase().trim();
        return customers.find(c => {
            const fullName = `${c.firstName || ''} ${c.lastName || ''}`.toLowerCase().trim();
            return fullName === searchName;
        });
    },

    /**
     * Find a customer by ID
     */
    findCustomerById: function(id) {
        const customers = this.getCustomers();
        return customers.find(c => c.id === id);
    },

    /**
     * Update a customer's membership
     */
    updateMembership: function(customerId, memberType, expiresDate) {
        const customers = this.getCustomers();
        const customer = customers.find(c => c.id === customerId);
        if (!customer) return false;
        
        customer.isMember = true;
        customer.memberType = memberType;
        customer.memberExpires = expiresDate;
        customer.memberSince = customer.memberSince || new Date().toISOString().split('T')[0];
        customer.priceClass = 'Member';
        
        this.saveCustomers(customers);
        return true;
    },

    /**
     * Cancel a customer's membership
     */
    cancelMembership: function(customerId) {
        const customers = this.getCustomers();
        const customer = customers.find(c => c.id === customerId);
        if (!customer) return false;
        
        customer.isMember = false;
        customer.priceClass = 'Regular';
        
        this.saveCustomers(customers);
        return true;
    }
};

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveMembership = GolfCoveMembership;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveMembership;
}
