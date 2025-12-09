/**
 * Golf Cove - Stripe Checkout System
 * Handles online payments for bookings, gift cards, and memberships
 */

const GolfCoveCheckout = (function() {
    'use strict';
    
    // Firebase Functions base URL
    const FUNCTIONS_URL = 'https://us-central1-golfcove.cloudfunctions.net';
    
    // Stripe publishable key (safe for client-side)
    let stripePublicKey = null;
    let stripe = null;
    
    // ============ INITIALIZATION ============
    function init(publicKey) {
        stripePublicKey = publicKey;
        
        // Load Stripe.js if not already loaded
        if (!window.Stripe) {
            const script = document.createElement('script');
            script.src = 'https://js.stripe.com/v3/';
            script.onload = () => {
                stripe = Stripe(stripePublicKey);
                console.log('Stripe Checkout initialized');
            };
            document.head.appendChild(script);
        } else {
            stripe = Stripe(stripePublicKey);
        }
    }
    
    // ============ CHECKOUT SESSION CREATION ============
    
    /**
     * Create checkout session for bay booking deposit
     */
    async function createBookingCheckout(bookingData) {
        try {
            const response = await fetch(`${FUNCTIONS_URL}/createBookingCheckout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    roomId: bookingData.roomId,
                    date: bookingData.date,
                    time: bookingData.time,
                    duration: bookingData.duration,
                    customerName: bookingData.customerName,
                    customerEmail: bookingData.customerEmail,
                    customerPhone: bookingData.customerPhone,
                    guests: bookingData.guests || 1,
                    memberType: bookingData.memberType || null,
                    totalPrice: bookingData.totalPrice,
                    depositAmount: bookingData.depositAmount || bookingData.totalPrice,
                    successUrl: bookingData.successUrl || `${window.location.origin}/booking-confirmed.html`,
                    cancelUrl: bookingData.cancelUrl || `${window.location.origin}/schedule.html`
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data;
        } catch (error) {
            console.error('Booking checkout error:', error);
            throw error;
        }
    }
    
    /**
     * Create checkout session for gift card purchase
     */
    async function createGiftCardCheckout(giftCardData) {
        try {
            const response = await fetch(`${FUNCTIONS_URL}/createGiftCardCheckout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: giftCardData.amount,
                    purchaserName: giftCardData.purchaserName,
                    purchaserEmail: giftCardData.purchaserEmail,
                    recipientName: giftCardData.recipientName || null,
                    recipientEmail: giftCardData.recipientEmail || null,
                    message: giftCardData.message || '',
                    deliveryDate: giftCardData.deliveryDate || null,
                    successUrl: giftCardData.successUrl || `${window.location.origin}/gift-card-confirmed.html`,
                    cancelUrl: giftCardData.cancelUrl || `${window.location.origin}/gift-cards.html`
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data;
        } catch (error) {
            console.error('Gift card checkout error:', error);
            throw error;
        }
    }
    
    /**
     * Create checkout session for membership purchase
     */
    async function createMembershipCheckout(membershipData) {
        try {
            const response = await fetch(`${FUNCTIONS_URL}/createMembershipCheckout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    tier: membershipData.tier, // 'eagle', 'birdie', 'par'
                    isFamily: membershipData.isFamily || false,
                    customerName: membershipData.customerName,
                    customerEmail: membershipData.customerEmail,
                    customerPhone: membershipData.customerPhone,
                    billingCycle: membershipData.billingCycle || 'monthly', // 'monthly' or 'annual'
                    successUrl: membershipData.successUrl || `${window.location.origin}/membership-confirmed.html`,
                    cancelUrl: membershipData.cancelUrl || `${window.location.origin}/memberships.html`
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data;
        } catch (error) {
            console.error('Membership checkout error:', error);
            throw error;
        }
    }
    
    /**
     * Create checkout for private event deposit
     */
    async function createEventCheckout(eventData) {
        try {
            const response = await fetch(`${FUNCTIONS_URL}/createEventCheckout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eventType: eventData.eventType,
                    date: eventData.date,
                    startTime: eventData.startTime,
                    endTime: eventData.endTime,
                    guestCount: eventData.guestCount,
                    customerName: eventData.customerName,
                    customerEmail: eventData.customerEmail,
                    customerPhone: eventData.customerPhone,
                    specialRequests: eventData.specialRequests || '',
                    depositAmount: eventData.depositAmount,
                    successUrl: eventData.successUrl || `${window.location.origin}/event-confirmed.html`,
                    cancelUrl: eventData.cancelUrl || `${window.location.origin}/private-events.html`
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data;
        } catch (error) {
            console.error('Event checkout error:', error);
            throw error;
        }
    }
    
    /**
     * Generic checkout for custom amounts
     */
    async function createCustomCheckout(checkoutData) {
        try {
            const response = await fetch(`${FUNCTIONS_URL}/createCustomCheckout`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: checkoutData.amount,
                    description: checkoutData.description,
                    customerEmail: checkoutData.customerEmail,
                    metadata: checkoutData.metadata || {},
                    successUrl: checkoutData.successUrl || `${window.location.origin}/payment-success.html`,
                    cancelUrl: checkoutData.cancelUrl || window.location.href
                })
            });
            
            const data = await response.json();
            
            if (data.error) {
                throw new Error(data.error);
            }
            
            return data;
        } catch (error) {
            console.error('Custom checkout error:', error);
            throw error;
        }
    }
    
    // ============ REDIRECT TO CHECKOUT ============
    
    /**
     * Redirect to Stripe Checkout page
     */
    async function redirectToCheckout(sessionId) {
        if (!stripe) {
            throw new Error('Stripe not initialized');
        }
        
        const { error } = await stripe.redirectToCheckout({ sessionId });
        
        if (error) {
            console.error('Redirect error:', error);
            throw error;
        }
    }
    
    /**
     * Create session and redirect in one call
     */
    async function checkout(type, data) {
        let session;
        
        switch (type) {
            case 'booking':
                session = await createBookingCheckout(data);
                break;
            case 'gift-card':
                session = await createGiftCardCheckout(data);
                break;
            case 'membership':
                session = await createMembershipCheckout(data);
                break;
            case 'event':
                session = await createEventCheckout(data);
                break;
            case 'custom':
                session = await createCustomCheckout(data);
                break;
            default:
                throw new Error('Invalid checkout type');
        }
        
        if (session.sessionId) {
            await redirectToCheckout(session.sessionId);
        } else if (session.url) {
            // Direct URL redirect (for Checkout Sessions created with url)
            window.location.href = session.url;
        }
    }
    
    // ============ PAYMENT STATUS ============
    
    /**
     * Verify payment status after redirect
     */
    async function verifyPayment(sessionId) {
        try {
            const response = await fetch(`${FUNCTIONS_URL}/verifyPayment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ sessionId })
            });
            
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Verify payment error:', error);
            throw error;
        }
    }
    
    /**
     * Get session ID from URL (after redirect back)
     */
    function getSessionIdFromUrl() {
        const params = new URLSearchParams(window.location.search);
        return params.get('session_id');
    }
    
    // ============ EMBEDDED CHECKOUT (Alternative UI) ============
    
    /**
     * Mount embedded checkout form
     */
    async function mountEmbeddedCheckout(elementId, sessionId) {
        if (!stripe) {
            throw new Error('Stripe not initialized');
        }
        
        const checkout = await stripe.initEmbeddedCheckout({
            clientSecret: sessionId
        });
        
        checkout.mount(`#${elementId}`);
        
        return checkout;
    }
    
    // ============ PAYMENT LINKS (Pre-built) ============
    
    /**
     * Get payment link for common products
     */
    function getPaymentLink(product) {
        const links = {
            // These would be created in Stripe Dashboard
            'gift-card-25': 'https://buy.stripe.com/xxx',
            'gift-card-50': 'https://buy.stripe.com/xxx',
            'gift-card-100': 'https://buy.stripe.com/xxx',
            'membership-par': 'https://buy.stripe.com/xxx',
            'membership-birdie': 'https://buy.stripe.com/xxx',
            'membership-eagle': 'https://buy.stripe.com/xxx'
        };
        
        return links[product] || null;
    }
    
    // ============ HELPER FUNCTIONS ============
    
    /**
     * Format amount for display
     */
    function formatAmount(cents) {
        return (cents / 100).toLocaleString('en-US', {
            style: 'currency',
            currency: 'USD'
        });
    }
    
    /**
     * Convert dollars to cents for Stripe
     */
    function toCents(dollars) {
        return Math.round(dollars * 100);
    }
    
    /**
     * Check if Stripe is loaded and ready
     */
    function isReady() {
        return stripe !== null;
    }
    
    // Public API
    return {
        init,
        
        // Checkout creation
        createBookingCheckout,
        createGiftCardCheckout,
        createMembershipCheckout,
        createEventCheckout,
        createCustomCheckout,
        
        // Redirect
        redirectToCheckout,
        checkout,
        
        // Verification
        verifyPayment,
        getSessionIdFromUrl,
        
        // Embedded
        mountEmbeddedCheckout,
        
        // Payment links
        getPaymentLink,
        
        // Helpers
        formatAmount,
        toCents,
        isReady
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveCheckout;
}
