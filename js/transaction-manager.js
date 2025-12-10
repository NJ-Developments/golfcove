/**
 * Golf Cove - Transaction Manager
 * Handles all payment flows, refunds, and transaction history
 */

const GolfCoveTransactionManager = (function() {
    'use strict';
    
    const Core = GolfCoveCore;
    
    // ============ CONFIGURATION ============
    const config = {
        taxRate: 0.0635,
        tipOptions: [15, 18, 20, 25],
        receiptEmail: true,
        requireSignature: false, // For amounts over signatureThreshold
        signatureThreshold: 25
    };
    
    // ============ STATE ============
    const transactionQueue = [];
    let currentTransaction = null;
    
    // ============ TRANSACTION CREATION ============
    function createTransaction(items, customer = null, options = {}) {
        const id = Core.generateId('txn');
        
        // Calculate totals
        const subtotal = items.reduce((sum, item) => 
            sum + (item.price * item.quantity), 0
        );
        
        const discountAmount = calculateDiscount(subtotal, options.discount);
        const taxableAmount = subtotal - discountAmount;
        const tax = options.taxExempt ? 0 : taxableAmount * config.taxRate;
        const tipAmount = options.tip || 0;
        const total = taxableAmount + tax + tipAmount;
        
        const transaction = {
            id,
            status: 'pending',
            items: items.map(item => ({
                ...item,
                lineTotal: item.price * item.quantity
            })),
            customer: customer ? {
                id: customer.id,
                name: Core.Format.name(customer.firstName, customer.lastName),
                email: customer.email,
                phone: customer.phone,
                membership: customer.membership
            } : null,
            pricing: {
                subtotal,
                discount: discountAmount,
                discountInfo: options.discount,
                taxable: taxableAmount,
                tax,
                taxRate: config.taxRate,
                tip: tipAmount,
                tipPercent: tipAmount > 0 ? Math.round((tipAmount / subtotal) * 100) : 0,
                total
            },
            payments: [],
            metadata: {
                source: options.source || 'pos',
                tabId: options.tabId,
                bookingId: options.bookingId,
                employeeId: options.employeeId,
                employeeName: options.employeeName,
                register: options.register || 'main',
                notes: options.notes
            },
            timestamps: {
                created: new Date().toISOString(),
                updated: new Date().toISOString(),
                completed: null,
                voided: null
            }
        };
        
        currentTransaction = transaction;
        Core.emit('transaction:created', { transaction });
        
        return transaction;
    }
    
    function calculateDiscount(subtotal, discount) {
        if (!discount) return 0;
        
        if (discount.type === 'percent') {
            return subtotal * (discount.value / 100);
        } else if (discount.type === 'fixed') {
            return Math.min(discount.value, subtotal);
        } else if (discount.type === 'membership') {
            const rates = {
                par: 0.10,
                birdie: 0.15,
                eagle: 0.20,
                family_par: 0.10,
                family_birdie: 0.15,
                family_eagle: 0.20
            };
            return subtotal * (rates[discount.membership] || 0);
        }
        
        return 0;
    }
    
    // ============ PAYMENT PROCESSING ============
    async function addPayment(transactionId, paymentData) {
        const transaction = currentTransaction?.id === transactionId 
            ? currentTransaction 
            : await getTransaction(transactionId);
        
        if (!transaction) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Transaction not found');
        }
        
        if (transaction.status === 'completed') {
            return Core.failure(Core.ErrorCodes.INVALID_STATE, 'Transaction already completed');
        }
        
        const validation = validatePayment(paymentData, transaction);
        if (!validation.success) {
            return validation;
        }
        
        const payment = {
            id: Core.generateId('pmt'),
            method: paymentData.method,
            amount: paymentData.amount,
            status: 'pending',
            timestamp: new Date().toISOString(),
            details: {}
        };
        
        try {
            switch (paymentData.method) {
                case 'cash':
                    payment.details = await processCashPayment(paymentData);
                    break;
                    
                case 'card':
                    payment.details = await processCardPayment(paymentData, transaction);
                    break;
                    
                case 'gift_card':
                    payment.details = await processGiftCardPayment(paymentData);
                    break;
                    
                case 'house_account':
                    payment.details = await processHouseAccountPayment(paymentData, transaction.customer);
                    break;
            }
            
            payment.status = 'completed';
            transaction.payments.push(payment);
            transaction.timestamps.updated = new Date().toISOString();
            
            // Check if fully paid
            const paidAmount = transaction.payments
                .filter(p => p.status === 'completed')
                .reduce((sum, p) => sum + p.amount, 0);
            
            if (paidAmount >= transaction.pricing.total) {
                await completeTransaction(transaction);
            }
            
            Core.emit('payment:completed', { transaction, payment });
            
            return Core.success({ transaction, payment });
            
        } catch (error) {
            payment.status = 'failed';
            payment.error = error.message;
            
            Core.log('error', 'Payment failed', { transactionId, error: error.message });
            Core.emit('payment:failed', { transaction, payment, error });
            
            return Core.failure(Core.ErrorCodes.PAYMENT_ERROR, error.message);
        }
    }
    
    function validatePayment(paymentData, transaction) {
        if (!paymentData.method) {
            return Core.failure(Core.ErrorCodes.VALIDATION_ERROR, 'Payment method required');
        }
        
        if (!paymentData.amount || paymentData.amount <= 0) {
            return Core.failure(Core.ErrorCodes.VALIDATION_ERROR, 'Invalid payment amount');
        }
        
        const remaining = transaction.pricing.total - 
            transaction.payments.filter(p => p.status === 'completed')
                .reduce((sum, p) => sum + p.amount, 0);
        
        if (paymentData.amount > remaining + 0.01) { // Allow small overpayment for rounding
            return Core.failure(Core.ErrorCodes.VALIDATION_ERROR, 'Payment exceeds remaining balance');
        }
        
        return Core.success();
    }
    
    async function processCashPayment(data) {
        const tendered = data.tendered || data.amount;
        const change = Math.max(0, tendered - data.amount);
        
        return {
            tendered,
            change,
            drawer: 'main'
        };
    }
    
    async function processCardPayment(data, transaction) {
        // Use Stripe Terminal or Stripe API
        if (typeof GolfCoveStripeTerminal !== 'undefined' && data.useTerminal) {
            const result = await GolfCoveStripeTerminal.collectPayment(
                Math.round(data.amount * 100), // Convert to cents
                { transactionId: transaction.id }
            );
            
            return {
                processor: 'stripe',
                method: 'terminal',
                paymentIntentId: result.paymentIntent?.id,
                last4: result.paymentMethod?.card?.last4,
                brand: result.paymentMethod?.card?.brand,
                receipt: result.receiptUrl
            };
        } else if (typeof GolfCoveAPI !== 'undefined') {
            // Use server-side payment intent
            const result = await GolfCoveAPI.payments.createIntent({
                amount: Math.round(data.amount * 100),
                currency: 'usd',
                metadata: {
                    transactionId: transaction.id,
                    customerId: transaction.customer?.id
                }
            });
            
            return {
                processor: 'stripe',
                method: 'api',
                paymentIntentId: result.data?.id,
                status: result.data?.status
            };
        }
        
        // Fallback for development/testing
        return {
            processor: 'mock',
            method: 'simulated',
            authCode: Core.generateCode(6),
            last4: '0000',
            brand: 'visa'
        };
    }
    
    async function processGiftCardPayment(data) {
        if (!data.code) {
            throw new Error('Gift card code required');
        }
        
        if (typeof GolfCoveGiftCards !== 'undefined') {
            const result = GolfCoveGiftCards.redeem(data.code, data.amount);
            
            if (!result || result.success === false) {
                throw new Error(result?.message || 'Gift card redemption failed');
            }
            
            return {
                code: data.code,
                amountRedeemed: data.amount,
                remainingBalance: result.remainingBalance
            };
        }
        
        throw new Error('Gift card system not available');
    }
    
    async function processHouseAccountPayment(data, customer) {
        if (!customer?.id) {
            throw new Error('House account requires a customer');
        }
        
        // Check credit limit if applicable
        if (typeof GolfCoveCustomers !== 'undefined') {
            const customerData = GolfCoveCustomers.getById(customer.id);
            
            if (!customerData?.houseAccount?.enabled) {
                throw new Error('Customer does not have a house account');
            }
            
            const limit = customerData.houseAccount.limit || 0;
            const balance = customerData.houseAccount.balance || 0;
            
            if (balance + data.amount > limit) {
                throw new Error(`House account limit exceeded (Limit: ${Core.Format.currency(limit)})`);
            }
            
            // Update balance
            GolfCoveCustomers.updateHouseAccountBalance(customer.id, balance + data.amount);
        }
        
        return {
            customerId: customer.id,
            previousBalance: customer.houseAccount?.balance || 0,
            chargeAmount: data.amount
        };
    }
    
    // ============ TRANSACTION COMPLETION ============
    async function completeTransaction(transaction) {
        transaction.status = 'completed';
        transaction.timestamps.completed = new Date().toISOString();
        
        // Save transaction
        saveTransaction(transaction);
        
        // Update customer stats if applicable
        if (transaction.customer?.id && typeof GolfCoveCustomers !== 'undefined') {
            GolfCoveCustomers.recordPurchase(transaction.customer.id, {
                transactionId: transaction.id,
                amount: transaction.pricing.total,
                items: transaction.items.length,
                date: transaction.timestamps.completed
            });
        }
        
        // Sync to server
        if (typeof GolfCoveSyncManager !== 'undefined') {
            GolfCoveSyncManager.create('transactions', transaction);
        }
        
        // Send receipt if configured
        if (config.receiptEmail && transaction.customer?.email) {
            sendReceipt(transaction);
        }
        
        Core.emit('transaction:completed', { transaction });
        
        currentTransaction = null;
        
        return transaction;
    }
    
    function saveTransaction(transaction) {
        const key = 'gc_transactions';
        const transactions = JSON.parse(localStorage.getItem(key) || '[]');
        
        const existingIndex = transactions.findIndex(t => t.id === transaction.id);
        if (existingIndex !== -1) {
            transactions[existingIndex] = transaction;
        } else {
            transactions.unshift(transaction);
        }
        
        // Keep last 1000 transactions locally
        if (transactions.length > 1000) {
            transactions.length = 1000;
        }
        
        localStorage.setItem(key, JSON.stringify(transactions));
    }
    
    async function getTransaction(id) {
        const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        return transactions.find(t => t.id === id);
    }
    
    // ============ REFUNDS ============
    async function createRefund(transactionId, refundData) {
        const transaction = await getTransaction(transactionId);
        
        if (!transaction) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Transaction not found');
        }
        
        if (transaction.status === 'voided') {
            return Core.failure(Core.ErrorCodes.INVALID_STATE, 'Transaction was voided');
        }
        
        const maxRefundable = transaction.pricing.total - (transaction.refunded || 0);
        
        if (refundData.amount > maxRefundable) {
            return Core.failure(
                Core.ErrorCodes.VALIDATION_ERROR, 
                `Maximum refundable amount is ${Core.Format.currency(maxRefundable)}`
            );
        }
        
        const refund = {
            id: Core.generateId('rfd'),
            transactionId,
            amount: refundData.amount,
            reason: refundData.reason,
            items: refundData.items || [],
            method: refundData.method || 'original', // 'original', 'cash', 'store_credit'
            status: 'pending',
            processedBy: refundData.employeeId,
            timestamp: new Date().toISOString()
        };
        
        try {
            // Process refund based on original payment methods
            if (refund.method === 'original') {
                for (const payment of transaction.payments) {
                    if (payment.status !== 'completed') continue;
                    
                    const refundAmount = Math.min(refund.amount, payment.amount);
                    
                    if (payment.method === 'card' && payment.details?.paymentIntentId) {
                        // Stripe refund
                        if (typeof GolfCoveAPI !== 'undefined') {
                            await GolfCoveAPI.payments.refund(
                                payment.details.paymentIntentId,
                                Math.round(refundAmount * 100),
                                refund.reason
                            );
                        }
                    } else if (payment.method === 'gift_card') {
                        // Add back to gift card
                        if (typeof GolfCoveGiftCards !== 'undefined') {
                            GolfCoveGiftCards.addBalance(payment.details.code, refundAmount);
                        }
                    }
                    // Cash refunds are manual
                }
            } else if (refund.method === 'store_credit') {
                // Add to customer's store credit
                if (transaction.customer?.id && typeof GolfCoveCustomers !== 'undefined') {
                    GolfCoveCustomers.addStoreCredit(transaction.customer.id, refund.amount);
                }
            }
            
            refund.status = 'completed';
            
            // Update transaction
            transaction.refunded = (transaction.refunded || 0) + refund.amount;
            transaction.refunds = transaction.refunds || [];
            transaction.refunds.push(refund);
            transaction.timestamps.updated = new Date().toISOString();
            
            if (transaction.refunded >= transaction.pricing.total) {
                transaction.status = 'fully_refunded';
            } else {
                transaction.status = 'partially_refunded';
            }
            
            saveTransaction(transaction);
            
            // Update customer stats
            if (transaction.customer?.id && typeof GolfCoveCustomers !== 'undefined') {
                GolfCoveCustomers.recordRefund(transaction.customer.id, {
                    transactionId,
                    refundId: refund.id,
                    amount: refund.amount,
                    date: refund.timestamp
                });
            }
            
            // Sync
            if (typeof GolfCoveSyncManager !== 'undefined') {
                GolfCoveSyncManager.update('transactions', transaction);
            }
            
            Core.emit('refund:completed', { transaction, refund });
            
            return Core.success({ transaction, refund });
            
        } catch (error) {
            refund.status = 'failed';
            refund.error = error.message;
            
            Core.log('error', 'Refund failed', { transactionId, error: error.message });
            
            return Core.failure(Core.ErrorCodes.PAYMENT_ERROR, error.message);
        }
    }
    
    // ============ VOID TRANSACTION ============
    async function voidTransaction(transactionId, reason, employeeId) {
        const transaction = await getTransaction(transactionId);
        
        if (!transaction) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Transaction not found');
        }
        
        if (transaction.status !== 'pending') {
            return Core.failure(Core.ErrorCodes.INVALID_STATE, 'Only pending transactions can be voided');
        }
        
        // Cancel any payment intents
        for (const payment of transaction.payments) {
            if (payment.status === 'pending' && payment.details?.paymentIntentId) {
                try {
                    if (typeof GolfCoveAPI !== 'undefined') {
                        await GolfCoveAPI.callFunction('cancelPayment', {
                            paymentIntentId: payment.details.paymentIntentId
                        });
                    }
                } catch (e) {
                    Core.log('warn', 'Failed to cancel payment intent', e);
                }
            }
        }
        
        transaction.status = 'voided';
        transaction.timestamps.voided = new Date().toISOString();
        transaction.voidReason = reason;
        transaction.voidedBy = employeeId;
        
        saveTransaction(transaction);
        
        if (typeof GolfCoveSyncManager !== 'undefined') {
            GolfCoveSyncManager.update('transactions', transaction);
        }
        
        Core.emit('transaction:voided', { transaction });
        
        if (currentTransaction?.id === transactionId) {
            currentTransaction = null;
        }
        
        return Core.success({ transaction });
    }
    
    // ============ RECEIPTS ============
    async function sendReceipt(transaction, email = null) {
        const recipientEmail = email || transaction.customer?.email;
        
        if (!recipientEmail) {
            return Core.failure(Core.ErrorCodes.VALIDATION_ERROR, 'No email address');
        }
        
        const receiptData = generateReceiptData(transaction);
        
        if (typeof GolfCoveAPI !== 'undefined') {
            await GolfCoveAPI.callFunction('sendReceipt', {
                email: recipientEmail,
                receipt: receiptData
            });
        }
        
        Core.emit('receipt:sent', { transactionId: transaction.id, email: recipientEmail });
        
        return Core.success({ sent: true });
    }
    
    function generateReceiptData(transaction) {
        return {
            transactionId: transaction.id,
            date: transaction.timestamps.completed || transaction.timestamps.created,
            items: transaction.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: Core.Format.currency(item.price),
                total: Core.Format.currency(item.lineTotal)
            })),
            subtotal: Core.Format.currency(transaction.pricing.subtotal),
            discount: transaction.pricing.discount > 0 
                ? Core.Format.currency(transaction.pricing.discount) 
                : null,
            tax: Core.Format.currency(transaction.pricing.tax),
            tip: transaction.pricing.tip > 0 
                ? Core.Format.currency(transaction.pricing.tip) 
                : null,
            total: Core.Format.currency(transaction.pricing.total),
            payments: transaction.payments
                .filter(p => p.status === 'completed')
                .map(p => ({
                    method: p.method,
                    amount: Core.Format.currency(p.amount),
                    last4: p.details?.last4
                })),
            customer: transaction.customer?.name,
            employee: transaction.metadata?.employeeName,
            location: 'Golf Cove'
        };
    }
    
    function printReceipt(transaction) {
        const receipt = generateReceiptData(transaction);
        
        // Open print dialog with receipt
        const printWindow = window.open('', '_blank', 'width=300,height=600');
        
        printWindow.document.write(`
            <html>
            <head>
                <title>Receipt</title>
                <style>
                    body { font-family: monospace; font-size: 12px; padding: 20px; max-width: 280px; }
                    .center { text-align: center; }
                    .bold { font-weight: bold; }
                    .line { border-bottom: 1px dashed #000; margin: 10px 0; }
                    .row { display: flex; justify-content: space-between; }
                    .total { font-size: 14px; font-weight: bold; }
                </style>
            </head>
            <body>
                <div class="center bold">GOLF COVE</div>
                <div class="center">123 Golf Drive</div>
                <div class="center">${new Date(receipt.date).toLocaleString()}</div>
                <div class="line"></div>
                ${receipt.items.map(item => `
                    <div class="row">
                        <span>${item.quantity}x ${item.name}</span>
                        <span>${item.total}</span>
                    </div>
                `).join('')}
                <div class="line"></div>
                <div class="row"><span>Subtotal</span><span>${receipt.subtotal}</span></div>
                ${receipt.discount ? `<div class="row"><span>Discount</span><span>-${receipt.discount}</span></div>` : ''}
                <div class="row"><span>Tax</span><span>${receipt.tax}</span></div>
                ${receipt.tip ? `<div class="row"><span>Tip</span><span>${receipt.tip}</span></div>` : ''}
                <div class="line"></div>
                <div class="row total"><span>TOTAL</span><span>${receipt.total}</span></div>
                <div class="line"></div>
                ${receipt.payments.map(p => `
                    <div class="row"><span>${p.method.toUpperCase()}${p.last4 ? ` ****${p.last4}` : ''}</span><span>${p.amount}</span></div>
                `).join('')}
                <div class="line"></div>
                <div class="center">Thank you for visiting!</div>
                <div class="center">${receipt.transactionId}</div>
            </body>
            </html>
        `);
        
        printWindow.document.close();
        printWindow.print();
    }
    
    // ============ QUERIES ============
    function getTransactions(filters = {}) {
        let transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        
        if (filters.startDate) {
            const start = new Date(filters.startDate).getTime();
            transactions = transactions.filter(t => 
                new Date(t.timestamps.created).getTime() >= start
            );
        }
        
        if (filters.endDate) {
            const end = new Date(filters.endDate).getTime();
            transactions = transactions.filter(t => 
                new Date(t.timestamps.created).getTime() <= end
            );
        }
        
        if (filters.status) {
            transactions = transactions.filter(t => t.status === filters.status);
        }
        
        if (filters.customerId) {
            transactions = transactions.filter(t => t.customer?.id === filters.customerId);
        }
        
        if (filters.employeeId) {
            transactions = transactions.filter(t => t.metadata?.employeeId === filters.employeeId);
        }
        
        if (filters.minAmount) {
            transactions = transactions.filter(t => t.pricing.total >= filters.minAmount);
        }
        
        if (filters.maxAmount) {
            transactions = transactions.filter(t => t.pricing.total <= filters.maxAmount);
        }
        
        return transactions;
    }
    
    function getTodaysSummary() {
        const today = new Date().toISOString().split('T')[0];
        const transactions = getTransactions({
            startDate: today,
            status: 'completed'
        });
        
        const summary = {
            count: transactions.length,
            subtotal: 0,
            discounts: 0,
            tax: 0,
            tips: 0,
            total: 0,
            refunds: 0,
            net: 0,
            byPaymentMethod: {},
            byEmployee: {},
            avgTransaction: 0
        };
        
        transactions.forEach(t => {
            summary.subtotal += t.pricing.subtotal;
            summary.discounts += t.pricing.discount;
            summary.tax += t.pricing.tax;
            summary.tips += t.pricing.tip;
            summary.total += t.pricing.total;
            summary.refunds += t.refunded || 0;
            
            t.payments.forEach(p => {
                if (p.status === 'completed') {
                    summary.byPaymentMethod[p.method] = 
                        (summary.byPaymentMethod[p.method] || 0) + p.amount;
                }
            });
            
            const emp = t.metadata?.employeeId || 'unknown';
            summary.byEmployee[emp] = (summary.byEmployee[emp] || 0) + t.pricing.total;
        });
        
        summary.net = summary.total - summary.refunds;
        summary.avgTransaction = summary.count > 0 ? summary.total / summary.count : 0;
        
        return summary;
    }
    
    // ============ PUBLIC API ============
    return {
        // Configuration
        config,
        
        // Transaction lifecycle
        createTransaction,
        addPayment,
        completeTransaction,
        voidTransaction,
        getTransaction,
        
        // Refunds
        createRefund,
        
        // Receipts
        sendReceipt,
        printReceipt,
        
        // Queries
        getTransactions,
        getTodaysSummary,
        
        // Current transaction
        get current() { return currentTransaction; },
        clearCurrent: () => { currentTransaction = null; }
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveTransactionManager = GolfCoveTransactionManager;
    window.$txn = GolfCoveTransactionManager; // Short alias
}
