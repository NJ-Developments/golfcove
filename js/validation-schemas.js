/**
 * Golf Cove - Validation Schemas
 * Centralized validation rules for all data types
 */

const ValidationSchemas = (function() {
    'use strict';
    
    const V = GolfCoveCore.Validators;
    
    // ============ CUSTOMER SCHEMAS ============
    const customer = {
        create: {
            firstName: [V.required, V.minLength(1), V.maxLength(50)],
            lastName: [V.required, V.minLength(1), V.maxLength(50)],
            email: [V.email],
            phone: [V.phone]
        },
        update: {
            firstName: [V.minLength(1), V.maxLength(50)],
            lastName: [V.minLength(1), V.maxLength(50)],
            email: [V.email],
            phone: [V.phone]
        }
    };
    
    // ============ MEMBERSHIP SCHEMAS ============
    const membershipTypes = ['par', 'birdie', 'eagle', 'family_par', 'family_birdie', 'family_eagle'];
    
    const membership = {
        create: {
            customerId: [V.required],
            type: [V.required, V.oneOf(membershipTypes)],
            startDate: [V.required, V.date],
            endDate: [V.required, V.date]
        }
    };
    
    // ============ BOOKING SCHEMAS ============
    const bookingTypes = ['single', 'double', 'triple', 'lounge', 'party', 'event', 'lesson'];
    
    const booking = {
        create: {
            bayId: [V.required],
            startTime: [V.required, V.date],
            duration: [V.required, V.min(30), V.max(480)],
            type: [V.oneOf(bookingTypes)],
            guestCount: [V.min(1), V.max(12)]
        },
        update: {
            duration: [V.min(30), V.max(480)],
            guestCount: [V.min(1), V.max(12)]
        }
    };
    
    // ============ TAB SCHEMAS ============
    const tab = {
        create: {
            name: [V.required, V.minLength(1), V.maxLength(100)]
        },
        addItem: {
            name: [V.required],
            price: [V.required, V.min(0)],
            quantity: [V.required, V.min(1)]
        }
    };
    
    // ============ PAYMENT SCHEMAS ============
    const paymentMethods = ['cash', 'card', 'gift_card', 'split', 'house_account'];
    
    const payment = {
        process: {
            amount: [V.required, V.min(0.01)],
            method: [V.required, V.oneOf(paymentMethods)]
        },
        refund: {
            transactionId: [V.required],
            amount: [V.required, V.min(0.01)],
            reason: [V.required, V.minLength(5)]
        }
    };
    
    // ============ GIFT CARD SCHEMAS ============
    const giftCard = {
        create: {
            amount: [V.required, V.min(5), V.max(500)]
        },
        redeem: {
            code: [V.required, V.minLength(8)],
            amount: [V.required, V.min(0.01)]
        }
    };
    
    // ============ INVENTORY SCHEMAS ============
    const inventory = {
        create: {
            name: [V.required, V.minLength(1), V.maxLength(100)],
            category: [V.required],
            price: [V.required, V.min(0)],
            cost: [V.min(0)],
            quantity: [V.required, V.min(0)]
        },
        update: {
            name: [V.minLength(1), V.maxLength(100)],
            price: [V.min(0)],
            cost: [V.min(0)],
            quantity: [V.min(0)]
        },
        adjustment: {
            itemId: [V.required],
            quantity: [V.required],
            reason: [V.required, V.minLength(3)]
        }
    };
    
    // ============ EMPLOYEE SCHEMAS ============
    const employee = {
        create: {
            firstName: [V.required, V.minLength(1), V.maxLength(50)],
            lastName: [V.required, V.minLength(1), V.maxLength(50)],
            pin: [V.required, V.pattern(/^\d{4,6}$/, 'PIN must be 4-6 digits')],
            role: [V.required, V.oneOf(['manager', 'staff', 'admin'])]
        }
    };
    
    // ============ EVENT SCHEMAS ============
    const event = {
        create: {
            name: [V.required, V.minLength(3), V.maxLength(100)],
            type: [V.required, V.oneOf(['tournament', 'private_event', 'league', 'lesson'])],
            startDate: [V.required, V.futureDate],
            endDate: [V.required, V.date],
            capacity: [V.min(1), V.max(200)],
            price: [V.min(0)]
        }
    };
    
    // ============ VALIDATION HELPER ============
    function validateData(schemaName, subSchema, data) {
        const schemas = {
            customer, membership, booking, tab, payment,
            giftCard, inventory, employee, event
        };
        
        const schema = schemas[schemaName];
        if (!schema) {
            return GolfCoveCore.failure(
                GolfCoveCore.ErrorCodes.VALIDATION_ERROR,
                `Unknown schema: ${schemaName}`
            );
        }
        
        const rules = schema[subSchema];
        if (!rules) {
            return GolfCoveCore.failure(
                GolfCoveCore.ErrorCodes.VALIDATION_ERROR,
                `Unknown sub-schema: ${schemaName}.${subSchema}`
            );
        }
        
        const result = GolfCoveCore.validate(data, rules);
        
        if (!result.isValid) {
            return GolfCoveCore.failure(
                GolfCoveCore.ErrorCodes.VALIDATION_ERROR,
                'Validation failed',
                result.errors
            );
        }
        
        return GolfCoveCore.success(data);
    }
    
    // ============ SANITIZERS ============
    const Sanitizers = {
        // Remove whitespace and normalize
        string: (value) => {
            if (typeof value !== 'string') return '';
            return value.trim().replace(/\s+/g, ' ');
        },
        
        // Clean phone to digits only
        phone: (value) => {
            if (!value) return '';
            return value.replace(/\D/g, '');
        },
        
        // Lowercase and trim email
        email: (value) => {
            if (!value) return '';
            return value.toLowerCase().trim();
        },
        
        // Parse to number
        number: (value, defaultValue = 0) => {
            const num = parseFloat(value);
            return isNaN(num) ? defaultValue : num;
        },
        
        // Parse to integer
        integer: (value, defaultValue = 0) => {
            const num = parseInt(value, 10);
            return isNaN(num) ? defaultValue : num;
        },
        
        // Currency to cents
        toCents: (value) => {
            return Math.round(Sanitizers.number(value) * 100);
        },
        
        // Cents to currency
        fromCents: (value) => {
            return Sanitizers.integer(value) / 100;
        },
        
        // Boolean
        boolean: (value) => {
            if (typeof value === 'boolean') return value;
            if (typeof value === 'string') {
                return ['true', '1', 'yes'].includes(value.toLowerCase());
            }
            return !!value;
        },
        
        // Strip HTML
        stripHtml: (value) => {
            if (!value) return '';
            return value.replace(/<[^>]*>/g, '');
        },
        
        // Escape HTML
        escapeHtml: (value) => {
            if (!value) return '';
            const escapes = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#39;'
            };
            return value.replace(/[&<>"']/g, c => escapes[c]);
        }
    };
    
    // ============ PUBLIC API ============
    return {
        customer,
        membership,
        booking,
        tab,
        payment,
        giftCard,
        inventory,
        employee,
        event,
        validate: validateData,
        Sanitizers,
        membershipTypes,
        bookingTypes,
        paymentMethods
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.ValidationSchemas = ValidationSchemas;
}
