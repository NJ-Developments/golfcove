/**
 * Golf Cove - Stripe Terminal Integration
 * Handles card reader connections and payment processing
 * Production-ready with EMV compliance and error recovery
 */

const GolfCoveStripe = (function() {
    'use strict';
    
    // Configuration - Use unified config with fallbacks
    const getConfig = () => {
        const unified = window.GolfCoveConfig?.stripe;
        const terminal = unified?.terminal || {};
        
        return {
            functionsUrl: unified?.functionsUrl || 
                          'https://us-central1-golfcove.cloudfunctions.net',
            locationId: terminal.locationId || 
                        localStorage.getItem('gc_stripe_location') || null,
            simulatedReader: terminal.simulatedReader ?? 
                            (window.location.hostname === 'localhost'),
            autoReconnect: terminal.autoReconnect ?? true,
            reconnectAttempts: terminal.reconnectAttempts ?? 3,
            reconnectDelay: terminal.reconnectDelay ?? 2000,
            paymentTimeout: terminal.paymentTimeout ?? 120000, // 2 minutes for customer interaction
            collectTimeout: terminal.collectTimeout ?? 60000   // 1 minute for tap/insert/swipe
        };
    };
    
    // State
    let terminal = null;
    let connectedReader = null;
    let isInitialized = false;
    let isCollecting = false;
    let reconnectAttempt = 0;
    let currentPaymentIntent = null;
    
    // Initialize Stripe Terminal
    async function init() {
        if (typeof StripeTerminal === 'undefined') {
            console.warn('Stripe Terminal SDK not loaded');
            return { success: false, error: 'Stripe Terminal SDK not loaded' };
        }
        
        try {
            terminal = StripeTerminal.create({
                onFetchConnectionToken: fetchConnectionToken,
                onUnexpectedReaderDisconnect: handleDisconnect
            });
            
            isInitialized = true;
            return { success: true };
        } catch (error) {
            console.error('Failed to initialize Stripe Terminal:', error);
            return { success: false, error: error.message };
        }
    }
    
    async function fetchConnectionToken() {
        try {
            const response = await fetch(`${config.functionsUrl}/stripeConnectionToken`);
            const data = await response.json();
            return data.secret;
        } catch (error) {
            console.error('Failed to fetch connection token:', error);
            throw error;
        }
    }
    
    function handleDisconnect() {
        console.log('Reader disconnected unexpectedly');
        const previousReader = connectedReader;
        connectedReader = null;
        isCollecting = false;
        
        // Dispatch event for UI to handle
        window.dispatchEvent(new CustomEvent('stripe-reader-disconnected', {
            detail: { reader: previousReader }
        }));
        
        // Attempt auto-reconnect if enabled
        if (config.autoReconnect && previousReader && reconnectAttempt < config.reconnectAttempts) {
            reconnectAttempt++;
            console.log(`Attempting reconnect (${reconnectAttempt}/${config.reconnectAttempts})...`);
            
            setTimeout(async () => {
                try {
                    const result = await connectReader(previousReader);
                    if (result.success) {
                        console.log('Reconnected to reader successfully');
                        reconnectAttempt = 0;
                        window.dispatchEvent(new CustomEvent('stripe-reader-reconnected', {
                            detail: { reader: connectedReader }
                        }));
                    }
                } catch (e) {
                    console.error('Reconnect failed:', e);
                }
            }, config.reconnectDelay * reconnectAttempt);
        }
    }
    
    // ============ READER MANAGEMENT ============
    async function discoverReaders() {
        if (!terminal) {
            return { success: false, error: 'Terminal not initialized' };
        }
        
        try {
            const discoverResult = await terminal.discoverReaders({
                simulated: config.simulatedReader
            });
            
            if (discoverResult.error) {
                return { success: false, error: discoverResult.error.message };
            }
            
            return { success: true, readers: discoverResult.discoveredReaders };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async function connectReader(reader) {
        if (!terminal) {
            return { success: false, error: 'Terminal not initialized' };
        }
        
        try {
            const connectResult = await terminal.connectReader(reader);
            
            if (connectResult.error) {
                return { success: false, error: connectResult.error.message };
            }
            
            connectedReader = connectResult.reader;
            
            // Dispatch event for UI
            window.dispatchEvent(new CustomEvent('stripe-reader-connected', {
                detail: { reader: connectedReader }
            }));
            
            return { success: true, reader: connectedReader };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async function disconnectReader() {
        if (!terminal || !connectedReader) {
            return { success: true };
        }
        
        try {
            await terminal.disconnectReader();
            connectedReader = null;
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    function getConnectedReader() {
        return connectedReader;
    }
    
    function isReaderConnected() {
        return connectedReader !== null;
    }
    
    // ============ PAYMENT PROCESSING ============
    async function collectPayment(amount, metadata = {}) {
        if (!terminal) {
            return { success: false, error: 'Terminal not initialized', code: 'NOT_INITIALIZED' };
        }
        
        if (!connectedReader) {
            return { success: false, error: 'No reader connected', code: 'NO_READER' };
        }
        
        if (isCollecting) {
            return { success: false, error: 'Payment already in progress', code: 'BUSY' };
        }
        
        // Validate amount
        const amountCents = Math.round(amount * 100);
        if (amountCents <= 0 || amountCents > 99999999) {
            return { success: false, error: 'Invalid payment amount', code: 'INVALID_AMOUNT' };
        }
        
        isCollecting = true;
        currentPaymentIntent = null;
        
        try {
            // Create payment intent on server with timeout
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 30000);
            
            const response = await fetch(`${config.functionsUrl}/stripeCreatePaymentIntent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: amountCents,
                    currency: 'usd',
                    metadata: {
                        ...metadata,
                        register: window.GolfCoveConfig?.pos?.registerId || 'POS-1',
                        location: config.locationId
                    }
                }),
                signal: controller.signal
            });
            
            clearTimeout(timeoutId);
            
            if (!response.ok) {
                throw new Error(`Server error: ${response.status}`);
            }
            
            const { clientSecret, paymentIntentId } = await response.json();
            
            if (!clientSecret) {
                throw new Error('Failed to create payment intent');
            }
            
            currentPaymentIntent = paymentIntentId;
            
            // Dispatch event for UI feedback
            window.dispatchEvent(new CustomEvent('stripe-collecting-payment', {
                detail: { amount: amountCents / 100, paymentIntentId }
            }));
            
            // Collect payment method with timeout wrapper
            const collectPromise = terminal.collectPaymentMethod(clientSecret);
            const collectResult = await Promise.race([
                collectPromise,
                new Promise((_, reject) => 
                    setTimeout(() => reject(new Error('Payment collection timed out')), config.collectTimeout)
                )
            ]);
            
            if (collectResult.error) {
                throw new Error(collectResult.error.message);
            }
            
            // Process payment
            const processResult = await terminal.processPayment(collectResult.paymentIntent);
            
            if (processResult.error) {
                throw new Error(processResult.error.message);
            }
            
            // Capture payment on server
            const captureResponse = await fetch(`${config.functionsUrl}/stripeCapturePayment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentIntentId })
            });
            
            const captureResult = await captureResponse.json();
            
            if (captureResult.error) {
                throw new Error(captureResult.error);
            }
            
            // Success - dispatch event
            window.dispatchEvent(new CustomEvent('stripe-payment-completed', {
                detail: { 
                    paymentIntentId,
                    amount: amountCents / 100,
                    last4: processResult.paymentIntent.charges?.data[0]?.payment_method_details?.card_present?.last4,
                    brand: processResult.paymentIntent.charges?.data[0]?.payment_method_details?.card_present?.brand
                }
            }));
            
            return {
                success: true,
                paymentIntent: processResult.paymentIntent,
                paymentIntentId: paymentIntentId,
                receiptUrl: captureResult.receipt_url,
                last4: processResult.paymentIntent.charges?.data[0]?.payment_method_details?.card_present?.last4,
                brand: processResult.paymentIntent.charges?.data[0]?.payment_method_details?.card_present?.brand
            };
            
        } catch (error) {
            console.error('Payment collection error:', error);
            
            // Dispatch error event
            window.dispatchEvent(new CustomEvent('stripe-payment-error', {
                detail: { error: error.message, paymentIntentId: currentPaymentIntent }
            }));
            
            // Cancel any pending payment intent
            if (currentPaymentIntent) {
                try {
                    await fetch(`${config.functionsUrl}/stripeCancelPayment`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ paymentIntentId: currentPaymentIntent })
                    });
                } catch (cancelError) {
                    console.warn('Failed to cancel payment intent:', cancelError);
                }
            }
            
            return { 
                success: false, 
                error: error.message,
                code: error.code || 'PAYMENT_FAILED'
            };
        } finally {
            isCollecting = false;
            currentPaymentIntent = null;
        }
    }
    
    async function cancelCollectPayment() {
        if (!terminal) return { success: true };
        
        try {
            if (isCollecting) {
                await terminal.cancelCollectPaymentMethod();
                isCollecting = false;
            }
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // Get current status
    function getStatus() {
        return {
            initialized: isInitialized,
            connected: connectedReader !== null,
            collecting: isCollecting,
            reader: connectedReader ? {
                id: connectedReader.id,
                label: connectedReader.label,
                status: connectedReader.status,
                deviceType: connectedReader.device_type
            } : null,
            simulated: config.simulatedReader
        };
    }
    
    // ============ REFUNDS ============
    async function processRefund(paymentIntentId, amount = null) {
        try {
            const response = await fetch(`${config.functionsUrl}/stripeRefund`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    paymentIntentId,
                    amount: amount ? Math.round(amount * 100) : null
                })
            });
            
            const result = await response.json();
            
            if (result.error) {
                return { success: false, error: result.error };
            }
            
            return { success: true, refund: result.refund };
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    // ============ DISPLAY ============
    async function setReaderDisplay(cart) {
        if (!terminal || !connectedReader) return;
        
        try {
            const lineItems = cart.map(item => ({
                description: item.name,
                amount: Math.round(item.price * item.qty * 100),
                quantity: item.qty
            }));
            
            const total = cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
            const taxRate = window.GolfCoveConfig?.pricing?.taxRate ?? 0.0635;
            
            await terminal.setReaderDisplay({
                type: 'cart',
                cart: {
                    line_items: lineItems,
                    tax: Math.round(total * taxRate * 100),
                    total: Math.round(total * (1 + taxRate) * 100),
                    currency: 'usd'
                }
            });
        } catch (error) {
            console.error('Failed to set reader display:', error);
        }
    }
    
    async function clearReaderDisplay() {
        if (!terminal || !connectedReader) return;
        
        try {
            await terminal.clearReaderDisplay();
        } catch (error) {
            console.error('Failed to clear reader display:', error);
        }
    }
    
    // ============ SIMULATED READER ============
    async function connectSimulatedReader() {
        if (!terminal) {
            await init();
        }
        
        const discoverResult = await discoverReaders();
        
        if (!discoverResult.success || discoverResult.readers.length === 0) {
            return { success: false, error: 'No simulated readers found' };
        }
        
        return await connectReader(discoverResult.readers[0]);
    }
    
    // Public API
    return {
        init,
        discoverReaders,
        connectReader,
        disconnectReader,
        getConnectedReader,
        isReaderConnected,
        collectPayment,
        cancelCollectPayment,
        processRefund,
        setReaderDisplay,
        clearReaderDisplay,
        connectSimulatedReader,
        config
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveStripe;
}
