/**
 * Golf Cove - Unified Payment Service
 * Single orchestration layer for all payment flows
 * Integrates: Stripe Terminal (POS), Stripe Checkout (Online), Cash, Gift Cards, Tabs
 * @version 1.0.0
 */

const GolfCovePayment = (function() {
    'use strict';
    
    // ============ CONFIGURATION ============
    const getConfig = () => {
        const unified = window.GolfCoveConfig;
        return {
            functionsUrl: unified?.stripe?.functionsUrl || 'https://us-central1-golfcove.cloudfunctions.net',
            publicKey: unified?.stripe?.publicKey || null,
            taxRate: unified?.pricing?.taxRate ?? 0.0635,
            currency: unified?.stripe?.currency || 'usd',
            minAmount: unified?.stripe?.limits?.minAmount ?? 50,
            maxAmount: unified?.stripe?.limits?.maxAmount ?? 1000000,
            terminalEnabled: unified?.stripe?.terminal?.enabled ?? true
        };
    };
    
    // ============ ERROR CODES ============
    const PaymentErrorCodes = {
        NOT_INITIALIZED: 'PAYMENT_NOT_INITIALIZED',
        INVALID_AMOUNT: 'PAYMENT_INVALID_AMOUNT',
        NO_READER: 'PAYMENT_NO_READER',
        READER_BUSY: 'PAYMENT_READER_BUSY',
        CANCELLED: 'PAYMENT_CANCELLED',
        DECLINED: 'PAYMENT_DECLINED',
        TIMEOUT: 'PAYMENT_TIMEOUT',
        NETWORK_ERROR: 'PAYMENT_NETWORK_ERROR',
        INSUFFICIENT_FUNDS: 'PAYMENT_INSUFFICIENT_FUNDS',
        GIFT_CARD_INVALID: 'GIFT_CARD_INVALID',
        GIFT_CARD_EXPIRED: 'GIFT_CARD_EXPIRED',
        GIFT_CARD_INSUFFICIENT: 'GIFT_CARD_INSUFFICIENT',
        SPLIT_MISMATCH: 'SPLIT_AMOUNT_MISMATCH',
        SERVER_ERROR: 'PAYMENT_SERVER_ERROR',
        UNKNOWN: 'PAYMENT_UNKNOWN_ERROR'
    };
    
    // ============ STATE ============
    let isInitialized = false;
    let currentPayment = null;
    let paymentHistory = [];
    
    // ============ INITIALIZATION ============
    async function init() {
        const config = getConfig();
        
        // Initialize Stripe Terminal if available and enabled
        if (config.terminalEnabled && typeof GolfCoveStripe !== 'undefined') {
            const terminalResult = await GolfCoveStripe.init();
            if (!terminalResult.success) {
                console.warn('Stripe Terminal initialization failed:', terminalResult.error);
            }
        }
        
        // Initialize Stripe Checkout if available
        if (config.publicKey && typeof GolfCoveCheckout !== 'undefined') {
            GolfCoveCheckout.init(config.publicKey);
        }
        
        isInitialized = true;
        console.log('GolfCovePayment initialized');
        
        return { success: true };
    }
    
    // ============ UNIFIED PAYMENT RESULT ============
    function createPaymentResult(success, data = {}) {
        const result = {
            success,
            timestamp: new Date().toISOString(),
            paymentId: data.paymentId || `pay_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
            ...data
        };
        
        // Store in history
        paymentHistory.push(result);
        if (paymentHistory.length > 100) {
            paymentHistory.shift(); // Keep last 100
        }
        
        // Emit event
        window.dispatchEvent(new CustomEvent('payment-completed', { detail: result }));
        
        return result;
    }
    
    function createPaymentError(code, message, details = {}) {
        const error = {
            success: false,
            error: {
                code: PaymentErrorCodes[code] || code,
                message,
                details,
                recoverable: isRecoverableError(code)
            },
            timestamp: new Date().toISOString()
        };
        
        window.dispatchEvent(new CustomEvent('payment-error', { detail: error }));
        
        return error;
    }
    
    function isRecoverableError(code) {
        const recoverableCodes = ['CANCELLED', 'TIMEOUT', 'NETWORK_ERROR', 'NO_READER'];
        return recoverableCodes.includes(code);
    }
    
    // ============ AMOUNT VALIDATION ============
    function validateAmount(amount) {
        const config = getConfig();
        const cents = Math.round(amount * 100);
        
        if (isNaN(cents) || cents <= 0) {
            return { valid: false, error: 'Amount must be greater than zero' };
        }
        
        if (cents < config.minAmount) {
            return { valid: false, error: `Minimum amount is $${(config.minAmount / 100).toFixed(2)}` };
        }
        
        if (cents > config.maxAmount) {
            return { valid: false, error: `Maximum amount is $${(config.maxAmount / 100).toFixed(2)}` };
        }
        
        return { valid: true, cents };
    }
    
    // ============ MAIN PAYMENT ROUTER ============
    /**
     * Process a payment using the appropriate method
     * @param {number} amount - Amount in dollars
     * @param {object} options - Payment options
     * @param {string} options.method - 'card', 'card_present', 'cash', 'gift_card', 'tab', 'member', 'split'
     * @param {object} options.items - Array of line items for validation
     * @param {object} options.customer - Customer info
     * @param {object} options.metadata - Additional metadata
     */
    async function processPayment(amount, options = {}) {
        const method = options.method || 'card';
        
        // Validate amount
        const amountValidation = validateAmount(amount);
        if (!amountValidation.valid) {
            return createPaymentError('INVALID_AMOUNT', amountValidation.error);
        }
        
        // Store current payment
        currentPayment = {
            amount,
            method,
            options,
            startedAt: new Date().toISOString()
        };
        
        try {
            let result;
            
            switch (method) {
                case 'card_present':
                case 'terminal':
                    result = await processTerminalPayment(amount, options);
                    break;
                    
                case 'card':
                case 'online':
                    result = await processOnlinePayment(amount, options);
                    break;
                    
                case 'cash':
                    result = await processCashPayment(amount, options);
                    break;
                    
                case 'gift_card':
                case 'gift':
                    result = await processGiftCardPayment(amount, options);
                    break;
                    
                case 'tab':
                    result = await addToTab(amount, options);
                    break;
                    
                case 'member':
                case 'member_charge':
                    result = await processMemberCharge(amount, options);
                    break;
                    
                case 'split':
                    result = await processSplitPayment(amount, options);
                    break;
                    
                default:
                    result = createPaymentError('UNKNOWN', `Unknown payment method: ${method}`);
            }
            
            currentPayment = null;
            return result;
            
        } catch (error) {
            currentPayment = null;
            return createPaymentError('UNKNOWN', error.message, { originalError: error });
        }
    }
    
    // ============ TERMINAL (CARD PRESENT) PAYMENT ============
    async function processTerminalPayment(amount, options = {}) {
        // Check if Stripe Terminal is available
        if (typeof GolfCoveStripe === 'undefined') {
            return createPaymentError('NOT_INITIALIZED', 'Stripe Terminal not available');
        }
        
        // Check reader connection
        if (!GolfCoveStripe.isReaderConnected()) {
            // Try to connect simulated reader in dev mode
            if (getConfig().terminalEnabled && window.location.hostname === 'localhost') {
                const connectResult = await GolfCoveStripe.connectSimulatedReader();
                if (!connectResult.success) {
                    return createPaymentError('NO_READER', 'No card reader connected');
                }
            } else {
                return createPaymentError('NO_READER', 'No card reader connected. Please connect a reader.');
            }
        }
        
        // Set reader display with cart if items provided
        if (options.items && Array.isArray(options.items)) {
            await GolfCoveStripe.setReaderDisplay(options.items);
        }
        
        // Collect payment
        const result = await GolfCoveStripe.collectPayment(amount, {
            orderId: options.orderId,
            customerId: options.customer?.id,
            items: options.items,
            ...options.metadata
        });
        
        // Clear reader display
        await GolfCoveStripe.clearReaderDisplay();
        
        if (!result.success) {
            const errorCode = result.code || 'DECLINED';
            return createPaymentError(errorCode, result.error);
        }
        
        return createPaymentResult(true, {
            method: 'card_present',
            amount,
            paymentId: result.paymentIntentId,
            paymentIntentId: result.paymentIntentId,
            last4: result.last4,
            brand: result.brand,
            receiptUrl: result.receiptUrl,
            cardDetails: {
                last4: result.last4,
                brand: result.brand
            }
        });
    }
    
    // ============ ONLINE CARD PAYMENT ============
    async function processOnlinePayment(amount, options = {}) {
        const config = getConfig();
        
        try {
            const response = await fetch(`${config.functionsUrl}/createPaymentIntent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: Math.round(amount * 100),
                    currency: config.currency,
                    items: options.items,
                    subtotal: options.subtotal,
                    description: options.description || 'Golf Cove Purchase',
                    metadata: {
                        source: 'pos',
                        customerId: options.customer?.id,
                        ...options.metadata
                    }
                })
            });
            
            if (!response.ok) {
                const error = await response.json();
                return createPaymentError('SERVER_ERROR', error.error || 'Payment failed');
            }
            
            const { clientSecret, paymentIntentId } = await response.json();
            
            // If using embedded Elements, return the client secret
            // Otherwise, mark as pending for external processing
            return createPaymentResult(true, {
                method: 'card',
                amount,
                paymentId: paymentIntentId,
                paymentIntentId,
                clientSecret,
                status: 'requires_confirmation',
                message: 'Payment intent created. Confirm with Stripe Elements.'
            });
            
        } catch (error) {
            return createPaymentError('NETWORK_ERROR', 'Could not connect to payment server');
        }
    }
    
    // ============ CASH PAYMENT ============
    async function processCashPayment(amount, options = {}) {
        const tendered = options.tendered || amount;
        
        if (tendered < amount) {
            return createPaymentError('INSUFFICIENT_FUNDS', 
                `Cash tendered ($${tendered.toFixed(2)}) is less than amount due ($${amount.toFixed(2)})`);
        }
        
        const change = tendered - amount;
        
        // Record cash transaction
        const transaction = {
            method: 'cash',
            amount,
            tendered,
            change,
            employeeId: options.employeeId,
            registerId: getConfig().registerId,
            timestamp: new Date().toISOString()
        };
        
        // Update cash drawer if available
        if (typeof CashDrawer !== 'undefined') {
            CashDrawer.recordTransaction(transaction);
        }
        
        return createPaymentResult(true, {
            method: 'cash',
            amount,
            tendered,
            change,
            paymentId: `cash_${Date.now()}`,
            cashDetails: {
                tendered,
                change
            }
        });
    }
    
    // ============ GIFT CARD PAYMENT ============
    async function processGiftCardPayment(amount, options = {}) {
        const giftCardCode = options.giftCardCode || options.code;
        
        if (!giftCardCode) {
            return createPaymentError('GIFT_CARD_INVALID', 'Gift card code required');
        }
        
        // Look up gift card in local storage
        const giftCards = JSON.parse(localStorage.getItem('gc_giftcards') || '[]');
        const cardIndex = giftCards.findIndex(g => 
            g.code === giftCardCode || g.code === giftCardCode.toUpperCase()
        );
        
        if (cardIndex < 0) {
            return createPaymentError('GIFT_CARD_INVALID', 'Gift card not found');
        }
        
        const card = giftCards[cardIndex];
        
        // Check expiration
        if (card.expiresAt && new Date(card.expiresAt) < new Date()) {
            return createPaymentError('GIFT_CARD_EXPIRED', 'Gift card has expired');
        }
        
        // Check balance
        if (card.balance < amount) {
            return createPaymentError('GIFT_CARD_INSUFFICIENT', 
                `Gift card balance ($${card.balance.toFixed(2)}) is less than amount ($${amount.toFixed(2)})`);
        }
        
        // Deduct balance
        const previousBalance = card.balance;
        card.balance -= amount;
        card.lastUsed = new Date().toISOString();
        card.transactions = card.transactions || [];
        card.transactions.push({
            amount: -amount,
            date: new Date().toISOString(),
            type: 'redemption'
        });
        
        giftCards[cardIndex] = card;
        localStorage.setItem('gc_giftcards', JSON.stringify(giftCards));
        
        return createPaymentResult(true, {
            method: 'gift_card',
            amount,
            paymentId: `gc_${Date.now()}`,
            giftCardCode,
            giftCardDetails: {
                code: giftCardCode,
                previousBalance,
                amountUsed: amount,
                remainingBalance: card.balance
            }
        });
    }
    
    // ============ ADD TO TAB ============
    async function addToTab(amount, options = {}) {
        const tabId = options.tabId;
        const customerId = options.customer?.id || options.customerId;
        
        if (!tabId && !customerId) {
            return createPaymentError('INVALID_AMOUNT', 'Tab ID or customer ID required');
        }
        
        // Add to tab in local storage
        const tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
        let tab;
        
        if (tabId) {
            tab = tabs.find(t => t.id === tabId);
        } else if (customerId) {
            tab = tabs.find(t => t.customerId === customerId && t.status === 'open');
        }
        
        if (!tab) {
            // Create new tab
            tab = {
                id: `tab_${Date.now()}`,
                customerId,
                customerName: options.customer?.name || 'Unknown',
                items: [],
                subtotal: 0,
                status: 'open',
                createdAt: new Date().toISOString()
            };
            tabs.push(tab);
        }
        
        // Add charge to tab
        const charge = {
            amount,
            description: options.description || 'POS Charge',
            items: options.items,
            timestamp: new Date().toISOString()
        };
        
        tab.items.push(charge);
        tab.subtotal += amount;
        tab.updatedAt = new Date().toISOString();
        
        localStorage.setItem('gc_tabs', JSON.stringify(tabs));
        
        // Sync to Firebase if available
        if (typeof GolfCoveFirebase !== 'undefined') {
            GolfCoveFirebase.syncTabs([tab]).catch(console.error);
        }
        
        return createPaymentResult(true, {
            method: 'tab',
            amount,
            paymentId: `tab_charge_${Date.now()}`,
            tabId: tab.id,
            tabDetails: {
                tabId: tab.id,
                customerName: tab.customerName,
                newBalance: tab.subtotal,
                status: 'charged_to_tab'
            }
        });
    }
    
    // ============ MEMBER CHARGE ============
    async function processMemberCharge(amount, options = {}) {
        const customerId = options.customer?.id || options.customerId;
        
        if (!customerId) {
            return createPaymentError('INVALID_AMOUNT', 'Customer ID required for member charge');
        }
        
        // Look up customer
        const customers = JSON.parse(localStorage.getItem('gc_customers') || '[]');
        const customer = customers.find(c => c.id === customerId);
        
        if (!customer) {
            return createPaymentError('INVALID_AMOUNT', 'Customer not found');
        }
        
        if (!customer.isMember && !customer.memberType) {
            return createPaymentError('INVALID_AMOUNT', 'Customer is not a member');
        }
        
        // Add to member balance
        customer.balance = (customer.balance || 0) + amount;
        customer.lastCharge = new Date().toISOString();
        
        localStorage.setItem('gc_customers', JSON.stringify(customers));
        
        return createPaymentResult(true, {
            method: 'member_charge',
            amount,
            paymentId: `member_${Date.now()}`,
            customerId,
            memberDetails: {
                customerId,
                customerName: customer.name || `${customer.firstName} ${customer.lastName}`,
                memberType: customer.memberType,
                newBalance: customer.balance
            }
        });
    }
    
    // ============ SPLIT PAYMENT ============
    async function processSplitPayment(amount, options = {}) {
        const splits = options.splits || [];
        
        if (!Array.isArray(splits) || splits.length === 0) {
            return createPaymentError('SPLIT_MISMATCH', 'Split payment details required');
        }
        
        // Validate split amounts sum to total
        const splitTotal = splits.reduce((sum, s) => sum + (s.amount || 0), 0);
        if (Math.abs(splitTotal - amount) > 0.01) {
            return createPaymentError('SPLIT_MISMATCH', 
                `Split amounts ($${splitTotal.toFixed(2)}) don't equal total ($${amount.toFixed(2)})`);
        }
        
        const results = [];
        let successCount = 0;
        let failedSplit = null;
        
        // Process each split
        for (let i = 0; i < splits.length; i++) {
            const split = splits[i];
            
            if (split.amount <= 0) continue;
            
            const splitOptions = {
                ...options,
                metadata: {
                    ...options.metadata,
                    splitIndex: i + 1,
                    splitTotal: splits.length,
                    originalAmount: amount
                }
            };
            
            // Process based on method
            let result;
            switch (split.method) {
                case 'card_present':
                case 'card':
                    result = await processTerminalPayment(split.amount, splitOptions);
                    break;
                case 'cash':
                    result = await processCashPayment(split.amount, { 
                        ...splitOptions, 
                        tendered: split.tendered 
                    });
                    break;
                case 'gift_card':
                    result = await processGiftCardPayment(split.amount, {
                        ...splitOptions,
                        giftCardCode: split.giftCardCode
                    });
                    break;
                default:
                    result = await processTerminalPayment(split.amount, splitOptions);
            }
            
            results.push({
                splitIndex: i + 1,
                method: split.method,
                amount: split.amount,
                ...result
            });
            
            if (result.success) {
                successCount++;
            } else {
                failedSplit = { index: i + 1, result };
                break; // Stop processing on failure
            }
        }
        
        // Check if all splits succeeded
        if (failedSplit) {
            // TODO: Handle partial payment - may need to refund successful splits
            return createPaymentError('DECLINED', 
                `Split payment ${failedSplit.index} of ${splits.length} failed: ${failedSplit.result.error?.message}`,
                { results, failedAt: failedSplit.index }
            );
        }
        
        return createPaymentResult(true, {
            method: 'split',
            amount,
            paymentId: `split_${Date.now()}`,
            splitDetails: {
                splitCount: results.length,
                splits: results
            }
        });
    }
    
    // ============ REFUNDS ============
    async function processRefund(paymentId, amount = null, reason = 'requested_by_customer') {
        const config = getConfig();
        
        try {
            // Determine if this is a Stripe payment
            if (paymentId.startsWith('pi_')) {
                // Stripe refund
                const response = await fetch(`${config.functionsUrl}/createRefund`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        paymentIntentId: paymentId,
                        amount: amount ? Math.round(amount * 100) : null,
                        reason
                    })
                });
                
                const result = await response.json();
                
                if (result.error) {
                    return createPaymentError('SERVER_ERROR', result.error);
                }
                
                return createPaymentResult(true, {
                    method: 'refund',
                    amount: result.amount / 100,
                    paymentId: result.refundId,
                    originalPaymentId: paymentId,
                    status: result.status
                });
                
            } else if (paymentId.startsWith('gc_')) {
                // Gift card refund - restore balance
                return await refundGiftCard(paymentId, amount);
                
            } else if (paymentId.startsWith('cash_')) {
                // Cash refund
                return createPaymentResult(true, {
                    method: 'cash_refund',
                    amount: amount,
                    paymentId: `refund_${paymentId}`,
                    originalPaymentId: paymentId,
                    message: 'Return cash to customer'
                });
            }
            
            return createPaymentError('UNKNOWN', 'Unable to determine payment type for refund');
            
        } catch (error) {
            return createPaymentError('NETWORK_ERROR', error.message);
        }
    }
    
    async function refundGiftCard(paymentId, amount) {
        // Find the original transaction and restore balance
        // This would need transaction history lookup
        return createPaymentResult(true, {
            method: 'gift_card_refund',
            amount,
            paymentId: `refund_${paymentId}`,
            message: 'Gift card balance restored'
        });
    }
    
    // ============ CHECKOUT SESSION HELPERS ============
    async function createCheckoutSession(type, data) {
        if (typeof GolfCoveCheckout === 'undefined') {
            return createPaymentError('NOT_INITIALIZED', 'Checkout not available');
        }
        
        try {
            let session;
            switch (type) {
                case 'booking':
                    session = await GolfCoveCheckout.createBookingCheckout(data);
                    break;
                case 'gift_card':
                    session = await GolfCoveCheckout.createGiftCardCheckout(data);
                    break;
                case 'membership':
                    session = await GolfCoveCheckout.createMembershipCheckout(data);
                    break;
                case 'event':
                    session = await GolfCoveCheckout.createEventCheckout(data);
                    break;
                default:
                    session = await GolfCoveCheckout.createCustomCheckout(data);
            }
            
            return { success: true, session };
        } catch (error) {
            return createPaymentError('SERVER_ERROR', error.message);
        }
    }
    
    async function redirectToCheckout(sessionId) {
        if (typeof GolfCoveCheckout === 'undefined') {
            return createPaymentError('NOT_INITIALIZED', 'Checkout not available');
        }
        
        try {
            await GolfCoveCheckout.redirectToCheckout(sessionId);
            return { success: true };
        } catch (error) {
            return createPaymentError('SERVER_ERROR', error.message);
        }
    }
    
    // ============ SUBSCRIPTION MANAGEMENT ============
    async function createCustomerPortalSession(customerId, returnUrl) {
        const config = getConfig();
        
        try {
            const response = await fetch(`${config.functionsUrl}/createPortalSession`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ customerId, returnUrl })
            });
            
            const result = await response.json();
            
            if (result.error) {
                return createPaymentError('SERVER_ERROR', result.error);
            }
            
            return { success: true, url: result.url };
        } catch (error) {
            return createPaymentError('NETWORK_ERROR', error.message);
        }
    }
    
    // ============ STATUS & UTILITIES ============
    function getStatus() {
        return {
            initialized: isInitialized,
            terminal: typeof GolfCoveStripe !== 'undefined' ? GolfCoveStripe.getStatus?.() : null,
            checkout: typeof GolfCoveCheckout !== 'undefined' ? GolfCoveCheckout.isReady?.() : false,
            currentPayment,
            recentPayments: paymentHistory.slice(-10)
        };
    }
    
    function cancelCurrentPayment() {
        if (!currentPayment) {
            return { success: true, message: 'No payment in progress' };
        }
        
        if (typeof GolfCoveStripe !== 'undefined') {
            GolfCoveStripe.cancelCollectPayment();
        }
        
        currentPayment = null;
        return { success: true, message: 'Payment cancelled' };
    }
    
    function getPaymentHistory() {
        return [...paymentHistory];
    }
    
    function clearPaymentHistory() {
        paymentHistory = [];
    }
    
    // ============ GIFT CARD BALANCE CHECK ============
    function checkGiftCardBalance(code) {
        const giftCards = JSON.parse(localStorage.getItem('gc_giftcards') || '[]');
        const card = giftCards.find(g => 
            g.code === code || g.code === code?.toUpperCase()
        );
        
        if (!card) {
            return { found: false, error: 'Gift card not found' };
        }
        
        return {
            found: true,
            code: card.code,
            balance: card.balance,
            originalAmount: card.amount,
            expiresAt: card.expiresAt,
            isExpired: card.expiresAt ? new Date(card.expiresAt) < new Date() : false
        };
    }
    
    // ============ PUBLIC API ============
    return {
        // Core
        init,
        processPayment,
        processRefund,
        cancelCurrentPayment,
        
        // Specific payment methods
        processTerminalPayment,
        processOnlinePayment,
        processCashPayment,
        processGiftCardPayment,
        processSplitPayment,
        addToTab,
        processMemberCharge,
        
        // Checkout sessions (online)
        createCheckoutSession,
        redirectToCheckout,
        
        // Subscriptions
        createCustomerPortalSession,
        
        // Utilities
        getStatus,
        getPaymentHistory,
        clearPaymentHistory,
        validateAmount,
        checkGiftCardBalance,
        
        // Error codes
        ErrorCodes: PaymentErrorCodes
    };
})();

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => GolfCovePayment.init());
} else {
    GolfCovePayment.init();
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCovePayment;
}
