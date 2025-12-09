/**
 * Golf Cove - Stripe Terminal Integration
 * Handles card reader connections and payment processing
 */

const GolfCoveStripe = (function() {
    'use strict';
    
    // Configuration
    const config = {
        functionsUrl: 'https://us-central1-golfcove.cloudfunctions.net',
        locationId: null, // Set from Stripe dashboard
        simulatedReader: true // Set to false for production
    };
    
    // State
    let terminal = null;
    let connectedReader = null;
    let isInitialized = false;
    
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
        connectedReader = null;
        
        // Dispatch event for UI to handle
        window.dispatchEvent(new CustomEvent('stripe-reader-disconnected'));
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
            return { success: false, error: 'Terminal not initialized' };
        }
        
        if (!connectedReader) {
            return { success: false, error: 'No reader connected' };
        }
        
        try {
            // Create payment intent on server
            const response = await fetch(`${config.functionsUrl}/stripeCreatePaymentIntent`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    amount: Math.round(amount * 100), // Convert to cents
                    currency: 'usd',
                    metadata: metadata
                })
            });
            
            const { clientSecret, paymentIntentId } = await response.json();
            
            if (!clientSecret) {
                return { success: false, error: 'Failed to create payment intent' };
            }
            
            // Collect payment method
            const collectResult = await terminal.collectPaymentMethod(clientSecret);
            
            if (collectResult.error) {
                return { success: false, error: collectResult.error.message };
            }
            
            // Process payment
            const processResult = await terminal.processPayment(collectResult.paymentIntent);
            
            if (processResult.error) {
                return { success: false, error: processResult.error.message };
            }
            
            // Capture payment on server
            const captureResponse = await fetch(`${config.functionsUrl}/stripeCapturePayment`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ paymentIntentId })
            });
            
            const captureResult = await captureResponse.json();
            
            if (captureResult.error) {
                return { success: false, error: captureResult.error };
            }
            
            return {
                success: true,
                paymentIntent: processResult.paymentIntent,
                paymentIntentId: paymentIntentId
            };
            
        } catch (error) {
            return { success: false, error: error.message };
        }
    }
    
    async function cancelCollectPayment() {
        if (!terminal) return { success: true };
        
        try {
            await terminal.cancelCollectPaymentMethod();
            return { success: true };
        } catch (error) {
            return { success: false, error: error.message };
        }
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
            
            await terminal.setReaderDisplay({
                type: 'cart',
                cart: {
                    line_items: lineItems,
                    tax: Math.round(total * 0.0635 * 100),
                    total: Math.round(total * 1.0635 * 100),
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
