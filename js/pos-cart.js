// ============================================================
// GOLF COVE POS - CART & SALES MODULE
// Shopping cart, sales, and payment processing
// ============================================================

const Cart = {
    items: [],
    MAX_ITEMS: 100,
    MAX_QTY: 999,
    MAX_PRICE: 10000,
    
    // Add item to cart
    add(item) {
        // Validate input
        if (!item || typeof item !== 'object') {
            console.error('Invalid item provided');
            return;
        }
        
        if (!item.name || typeof item.name !== 'string') {
            console.error('Item must have a name');
            return;
        }
        
        const price = parseFloat(item.price);
        if (isNaN(price) || price < 0 || price > this.MAX_PRICE) {
            console.error('Invalid item price');
            return;
        }
        
        // Check cart size limit
        if (this.items.length >= this.MAX_ITEMS) {
            POS.toast('Cart is full', 'error');
            return;
        }
        
        const existing = this.items.find(i => i.id === item.id && i.type === item.type);
        
        if (existing) {
            if (existing.qty < this.MAX_QTY) {
                existing.qty += 1;
            } else {
                POS.toast('Maximum quantity reached', 'error');
                return;
            }
        } else {
            this.items.push({
                id: item.id || Date.now(),
                name: String(item.name).substring(0, 100), // Truncate long names
                price: Math.round(price * 100) / 100, // Round to cents
                qty: Math.min(Math.max(item.qty || 1, 1), this.MAX_QTY),
                type: item.type || 'item',
                modifiers: Array.isArray(item.modifiers) ? item.modifiers : []
            });
        }
        
        this.render();
        POS.toast(`Added ${item.name}`, 'success');
    },
    
    // Remove item from cart
    remove(index) {
        this.items.splice(index, 1);
        this.render();
    },
    
    // Update quantity
    updateQty(index, delta) {
        // Validate inputs
        if (typeof index !== 'number' || index < 0 || index >= this.items.length) {
            return;
        }
        if (typeof delta !== 'number' || !Number.isFinite(delta)) {
            return;
        }
        
        const item = this.items[index];
        if (!item) return;
        
        const newQty = item.qty + delta;
        
        if (newQty <= 0) {
            this.remove(index);
        } else if (newQty <= this.MAX_QTY) {
            item.qty = newQty;
            this.render();
        } else {
            POS.toast('Maximum quantity reached', 'error');
        }
    },
    
    // Clear cart
    clear() {
        this.items = [];
        POS.state.selectedCustomer = null;
        this.render();
    },
    
    // Calculate subtotal
    getSubtotal() {
        return this.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
    },
    
    // Calculate tax
    getTax() {
        return this.getSubtotal() * (POS.config.taxRate / 100);
    },
    
    // Calculate total
    getTotal() {
        return this.getSubtotal() + this.getTax();
    },
    
    // Render cart UI
    render() {
        const container = document.getElementById('cartItems');
        if (!container) return;
        
        if (this.items.length === 0) {
            container.innerHTML = `
                <div class="cart-empty">
                    <i class="fas fa-shopping-cart"></i>
                    <p>Cart is empty</p>
                    <small>Add items from the menu</small>
                </div>
            `;
        } else {
            container.innerHTML = this.items.map((item, i) => `
                <div class="cart-item">
                    <div class="cart-item-info">
                        <div class="cart-item-name">${item.name}</div>
                        ${item.modifiers.length ? `<div class="cart-item-mods">${item.modifiers.join(', ')}</div>` : ''}
                    </div>
                    <div class="cart-item-controls">
                        <button class="qty-btn" onclick="Cart.updateQty(${i}, -1)">−</button>
                        <span class="qty-display">${item.qty}</span>
                        <button class="qty-btn" onclick="Cart.updateQty(${i}, 1)">+</button>
                    </div>
                    <div class="cart-item-price">${POS.formatCurrency(item.price * item.qty)}</div>
                    <button class="cart-item-remove" onclick="Cart.remove(${i})">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
            `).join('');
        }
        
        // Update totals
        document.getElementById('cartSubtotal').textContent = POS.formatCurrency(this.getSubtotal());
        document.getElementById('cartTax').textContent = POS.formatCurrency(this.getTax());
        document.getElementById('cartTotal').textContent = POS.formatCurrency(this.getTotal());
        document.getElementById('cartCount').textContent = this.items.reduce((sum, i) => sum + i.qty, 0);
    },
    
    // Hold cart (save as tab)
    hold(name) {
        if (this.items.length === 0) {
            POS.toast('Cart is empty', 'error');
            return;
        }
        
        const tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
        tabs.push({
            id: Date.now(),
            name: name || POS.state.selectedCustomer?.name || `Tab ${tabs.length + 1}`,
            items: [...this.items],
            customer: POS.state.selectedCustomer,
            createdAt: new Date().toISOString(),
            createdBy: POS.state.currentUser?.name
        });
        localStorage.setItem('gc_tabs', JSON.stringify(tabs));
        
        this.clear();
        POS.toast('Cart held as tab', 'success');
        
        if (typeof renderTabs === 'function') renderTabs();
    },
    
    // Recall tab
    recall(tabId) {
        const tabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
        const tab = tabs.find(t => t.id === tabId);
        
        if (tab) {
            this.items = [...tab.items];
            POS.state.selectedCustomer = tab.customer;
            this.render();
            
            // Remove from tabs
            const newTabs = tabs.filter(t => t.id !== tabId);
            localStorage.setItem('gc_tabs', JSON.stringify(newTabs));
            
            if (typeof renderTabs === 'function') renderTabs();
            POS.toast('Tab recalled', 'success');
        }
    }
};

// Payment processing
const Payment = {
    currentMethod: null,
    
    // Open payment modal
    open() {
        if (Cart.items.length === 0) {
            POS.toast('Cart is empty', 'error');
            return;
        }
        
        const modal = document.getElementById('paymentModal');
        if (modal) {
            document.getElementById('paymentTotal').textContent = POS.formatCurrency(Cart.getTotal());
            modal.style.display = 'flex';
        }
    },
    
    // Close payment modal
    close() {
        const modal = document.getElementById('paymentModal');
        if (modal) modal.style.display = 'none';
        this.currentMethod = null;
    },
    
    // Select payment method
    selectMethod(method) {
        this.currentMethod = method;
        
        // Highlight selected
        document.querySelectorAll('.payment-method-btn').forEach(btn => {
            btn.classList.toggle('selected', btn.dataset.method === method);
        });
        
        // Enable pay button
        document.getElementById('processPaymentBtn').disabled = false;
    },
    
    // Process payment
    async process() {
        if (!this.currentMethod) {
            POS.toast('Select a payment method', 'error');
            return;
        }
        
        const total = Cart.getTotal();
        
        // Show processing state
        const btn = document.getElementById('processPaymentBtn');
        const originalText = btn.innerHTML;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing...';
        btn.disabled = true;
        
        try {
            let result;
            
            switch (this.currentMethod) {
                case 'card':
                    result = await this.processCard(total);
                    break;
                case 'cash':
                    result = await this.processCash(total);
                    break;
                case 'tab':
                    result = await this.chargeToTab();
                    break;
                case 'giftcard':
                    result = await this.processGiftCard(total);
                    break;
            }
            
            if (result.success) {
                await this.completeTransaction(result);
            } else {
                POS.toast(result.error || 'Payment failed', 'error');
            }
        } catch (err) {
            console.error('Payment error:', err);
            POS.toast('Payment error: ' + err.message, 'error');
        }
        
        btn.innerHTML = originalText;
        btn.disabled = false;
    },
    
    // Process card payment (Stripe Terminal)
    async processCard(amount) {
        // Check if Stripe Terminal is available
        if (typeof StripeTerminal !== 'undefined' && StripeTerminal.connected) {
            try {
                const paymentIntent = await fetch('/api/stripe/create-terminal-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ 
                        amount: Math.round(amount * 100),
                        description: 'POS Sale'
                    })
                }).then(r => r.json());
                
                if (!paymentIntent.client_secret) {
                    throw new Error('Failed to create payment');
                }
                
                const result = await StripeTerminal.terminal.collectPaymentMethod(paymentIntent.client_secret);
                if (result.error) throw new Error(result.error.message);
                
                const processResult = await StripeTerminal.terminal.processPayment(result.paymentIntent);
                if (processResult.error) throw new Error(processResult.error.message);
                
                return { success: true, method: 'card', transactionId: processResult.paymentIntent.id };
            } catch (err) {
                return { success: false, error: err.message };
            }
        } else {
            // Fallback - simulate card payment
            POS.toast('Card reader not connected - simulating payment', 'info');
            return { success: true, method: 'card', transactionId: 'sim_' + Date.now() };
        }
    },
    
    // Process cash payment
    async processCash(amount) {
        // Validate amount
        if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
            return { success: false, error: 'Invalid amount' };
        }
        
        return new Promise((resolve) => {
            // Show cash drawer modal
            const amountDue = Math.round(amount * 100) / 100;
            const modal = document.getElementById('cashModal');
            if (!modal) {
                resolve({ success: false, error: 'Cash modal not found' });
                return;
            }
            
            document.getElementById('cashAmountDue').textContent = POS.formatCurrency(amountDue);
            document.getElementById('cashTendered').value = '';
            document.getElementById('cashChange').textContent = '$0.00';
            modal.style.display = 'flex';
            
            // Handle cash completion
            window.completeCashPayment = async () => {
                const tendered = parseFloat(document.getElementById('cashTendered').value) || 0;
                
                // Validate tendered amount
                if (tendered < 0 || tendered > 10000) {
                    POS.toast('Invalid amount', 'error');
                    return;
                }
                
                if (tendered < amountDue) {
                    POS.toast('Insufficient amount', 'error');
                    return;
                }
                
                const change = Math.round((tendered - amountDue) * 100) / 100;
                modal.style.display = 'none';
                
                // Kick cash drawer for cash payment
                if (window.CashDrawer) {
                    await CashDrawer.kick();
                }
                
                resolve({ success: true, method: 'cash', tendered, change });
            };
            
            window.cancelCashPayment = () => {
                modal.style.display = 'none';
                resolve({ success: false, error: 'Cancelled' });
            };
        });
    },
    
    // Charge to tab/room
    async chargeToTab() {
        if (!POS.state.selectedCustomer) {
            POS.toast('Select a customer first', 'error');
            return { success: false, error: 'No customer selected' };
        }
        
        return { success: true, method: 'tab', customerId: POS.state.selectedCustomer.id };
    },
    
    // Process gift card
    async processGiftCard(amount) {
        return new Promise((resolve) => {
            const modal = document.getElementById('giftCardPayModal');
            document.getElementById('gcPayAmount').textContent = POS.formatCurrency(amount);
            document.getElementById('gcPayNumber').value = '';
            document.getElementById('gcPayBalance').textContent = '--';
            modal.style.display = 'flex';
            
            window.processGiftCardPayment = async () => {
                const cardNumber = document.getElementById('gcPayNumber').value;
                if (!cardNumber) {
                    POS.toast('Enter card number', 'error');
                    return;
                }
                
                // Look up gift card
                try {
                    const response = await fetch(`/api/giftcards/${cardNumber}`);
                    if (!response.ok) throw new Error('Card not found');
                    
                    const card = await response.json();
                    if (card.balance < amount) {
                        POS.toast('Insufficient balance', 'error');
                        return;
                    }
                    
                    // Redeem
                    await fetch(`/api/giftcards/${cardNumber}/redeem`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ amount })
                    });
                    
                    modal.style.display = 'none';
                    resolve({ success: true, method: 'giftcard', cardNumber });
                } catch (err) {
                    POS.toast(err.message, 'error');
                }
            };
            
            window.cancelGiftCardPayment = () => {
                modal.style.display = 'none';
                resolve({ success: false, error: 'Cancelled' });
            };
        });
    },
    
    // Complete transaction
    async completeTransaction(paymentResult) {
        // Validate paymentResult
        if (!paymentResult || !paymentResult.method) {
            console.error('Invalid payment result');
            POS.toast('Error completing transaction', 'error');
            return;
        }
        
        const subtotal = Cart.getSubtotal();
        const tax = Cart.getTax();
        const total = Cart.getTotal();
        
        // Validate amounts are reasonable
        if (total < 0 || total > 100000 || !Number.isFinite(total)) {
            console.error('Invalid transaction total:', total);
            POS.toast('Error: Invalid total', 'error');
            return;
        }
        
        const transaction = {
            items: Cart.items.map(item => ({
                id: item.id,
                name: item.name,
                price: item.price,
                qty: item.qty,
                type: item.type
            })),
            subtotal: Math.round(subtotal * 100) / 100,
            tax: Math.round(tax * 100) / 100,
            total: Math.round(total * 100) / 100,
            paymentMethod: paymentResult.method,
            paymentDetails: paymentResult,
            customer: POS.state.selectedCustomer,
            customerId: POS.state.selectedCustomer?.id || null,
            status: 'completed'
        };
        
        try {
            // Use POS.recordTransaction which handles backend sync
            const savedTransaction = await POS.recordTransaction(transaction);
            
            if (!savedTransaction) {
                throw new Error('Failed to save transaction');
            }
            
            // Show success
            this.close();
            this.showReceipt(savedTransaction);
            Cart.clear();
            
            // Update inventory if tracking enabled
            if (typeof GolfCoveMenu !== 'undefined') {
                for (const item of transaction.items) {
                    if (item.inventoryId || item.id) {
                        GolfCoveMenu.deductInventory(item.inventoryId || item.id, item.qty);
                    }
                }
            }
            
            POS.toast('Payment successful!', 'success');
        } catch (err) {
            console.error('Transaction error:', err);
            POS.toast('Error completing transaction', 'error');
        }
    },
    
    // Show receipt
    showReceipt(transaction) {
        const modal = document.getElementById('receiptModal');
        if (!modal) return;
        
        // Get business info from unified config
        const businessInfo = window.GolfCoveConfig?.business || {
            name: POS.config.businessName,
            address: { street: '', city: '', state: '', zip: '' },
            phone: ''
        };
        
        const addressStr = businessInfo.address 
            ? `${businessInfo.address.street}, ${businessInfo.address.city}, ${businessInfo.address.state} ${businessInfo.address.zip}`
            : '';
        
        document.getElementById('receiptContent').innerHTML = `
            <div class="receipt">
                <div class="receipt-header">
                    <h2>${businessInfo.name || POS.config.businessName}</h2>
                    ${addressStr ? `<p>${addressStr}</p>` : ''}
                    ${businessInfo.phone ? `<p>${businessInfo.phone}</p>` : ''}
                    <hr>
                    <p>${new Date(transaction.createdAt).toLocaleString()}</p>
                    <p>Served by: ${transaction.employeeName || transaction.employee || 'Staff'}</p>
                    ${transaction.customer ? `<p>Customer: ${transaction.customer.name || transaction.customer.firstName + ' ' + transaction.customer.lastName}</p>` : ''}
                </div>
                <div class="receipt-items">
                    ${(transaction.items || []).map(item => `
                        <div class="receipt-item">
                            <span>${item.qty}x ${item.name}</span>
                            <span>${POS.formatCurrency(item.price * item.qty)}</span>
                        </div>
                    `).join('')}
                </div>
                <div class="receipt-totals">
                    <div class="receipt-row">
                        <span>Subtotal</span>
                        <span>${POS.formatCurrency(transaction.subtotal)}</span>
                    </div>
                    ${transaction.discount ? `
                        <div class="receipt-row discount">
                            <span>Discount</span>
                            <span>-${POS.formatCurrency(transaction.discount)}</span>
                        </div>
                    ` : ''}
                    <div class="receipt-row">
                        <span>Tax (${(window.GolfCoveConfig?.pricing?.taxRate * 100 || POS.config.taxRate).toFixed(2)}%)</span>
                        <span>${POS.formatCurrency(transaction.tax)}</span>
                    </div>
                    ${transaction.paymentDetails?.tip ? `
                        <div class="receipt-row">
                            <span>Tip</span>
                            <span>${POS.formatCurrency(transaction.paymentDetails.tip)}</span>
                        </div>
                    ` : ''}
                    <div class="receipt-row total">
                        <span>Total</span>
                        <span>${POS.formatCurrency(transaction.total)}</span>
                    </div>
                    <div class="receipt-row">
                        <span>Paid (${transaction.paymentMethod || transaction.payment?.method || 'Card'})</span>
                        <span>${POS.formatCurrency(transaction.paymentDetails?.tendered || transaction.total)}</span>
                    </div>
                    ${transaction.paymentDetails?.change > 0 ? `
                        <div class="receipt-row">
                            <span>Change</span>
                            <span>${POS.formatCurrency(transaction.paymentDetails.change)}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="receipt-footer">
                    <p class="receipt-id">Transaction: ${transaction.id}</p>
                    <p>Thank you for visiting!</p>
                    ${transaction.customer?.loyaltyPoints ? `<p>Points Earned: +${Math.floor(transaction.total)}</p>` : ''}
                    <div class="receipt-barcode">
                        <div style="font-family: 'Libre Barcode 39', monospace; font-size: 32px;">${transaction.id}</div>
                    </div>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
    },
    
    // Print receipt
    printReceipt(transaction) {
        const printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            POS.toast('Please allow popups for printing', 'error');
            return;
        }
        
        const businessInfo = window.GolfCoveConfig?.business || {
            name: POS.config.businessName,
            address: { street: '', city: '', state: '', zip: '' },
            phone: ''
        };
        
        const addressStr = businessInfo.address 
            ? `${businessInfo.address.street}<br>${businessInfo.address.city}, ${businessInfo.address.state} ${businessInfo.address.zip}`
            : '';
        
        printWindow.document.write(`
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt - ${transaction.id}</title>
                <style>
                    @page { margin: 0; size: 80mm auto; }
                    body { 
                        font-family: 'Courier New', monospace;
                        font-size: 12px;
                        width: 72mm;
                        padding: 4mm;
                        margin: 0 auto;
                    }
                    .header { text-align: center; margin-bottom: 10px; }
                    .header h1 { font-size: 16px; margin: 0; }
                    .divider { border-top: 1px dashed #000; margin: 8px 0; }
                    .item { display: flex; justify-content: space-between; margin: 4px 0; }
                    .total { font-weight: bold; font-size: 14px; }
                    .footer { text-align: center; margin-top: 10px; font-size: 10px; }
                    @media print { body { -webkit-print-color-adjust: exact; } }
                </style>
            </head>
            <body>
                <div class="header">
                    <h1>${businessInfo.name || 'Golf Cove'}</h1>
                    ${addressStr ? `<p>${addressStr}</p>` : ''}
                    ${businessInfo.phone ? `<p>${businessInfo.phone}</p>` : ''}
                </div>
                <div class="divider"></div>
                <p>${new Date(transaction.createdAt).toLocaleString()}</p>
                <p>Served by: ${transaction.employeeName || 'Staff'}</p>
                ${transaction.customer ? `<p>Customer: ${transaction.customer.name || (transaction.customer.firstName + ' ' + transaction.customer.lastName)}</p>` : ''}
                <div class="divider"></div>
                ${(transaction.items || []).map(item => `
                    <div class="item">
                        <span>${item.qty}x ${item.name}</span>
                        <span>${POS.formatCurrency(item.price * item.qty)}</span>
                    </div>
                `).join('')}
                <div class="divider"></div>
                <div class="item"><span>Subtotal</span><span>${POS.formatCurrency(transaction.subtotal)}</span></div>
                ${transaction.discount ? `<div class="item"><span>Discount</span><span>-${POS.formatCurrency(transaction.discount)}</span></div>` : ''}
                <div class="item"><span>Tax</span><span>${POS.formatCurrency(transaction.tax)}</span></div>
                ${transaction.paymentDetails?.tip ? `<div class="item"><span>Tip</span><span>${POS.formatCurrency(transaction.paymentDetails.tip)}</span></div>` : ''}
                <div class="item total"><span>TOTAL</span><span>${POS.formatCurrency(transaction.total)}</span></div>
                <div class="divider"></div>
                <div class="item"><span>Paid (${transaction.paymentMethod})</span><span>${POS.formatCurrency(transaction.paymentDetails?.tendered || transaction.total)}</span></div>
                ${transaction.paymentDetails?.change > 0 ? `<div class="item"><span>Change</span><span>${POS.formatCurrency(transaction.paymentDetails.change)}</span></div>` : ''}
                <div class="divider"></div>
                <div class="footer">
                    <p>Transaction: ${transaction.id}</p>
                    <p>Thank you for visiting!</p>
                </div>
            </body>
            </html>
        `);
        
        printWindow.document.close();
        setTimeout(() => {
            printWindow.print();
            printWindow.close();
        }, 250);
    },
    
    // Email receipt
    async emailReceipt(transaction, email = null) {
        const customerEmail = email || transaction.customer?.email;
        if (!customerEmail) {
            POS.toast('No email address available', 'error');
            return { success: false };
        }
        
        if (typeof GolfCoveAPI !== 'undefined') {
            try {
                await GolfCoveAPI.receipts.email({
                    transactionId: transaction.id,
                    email: customerEmail,
                    transaction: transaction
                });
                POS.toast('Receipt sent to ' + customerEmail, 'success');
                return { success: true };
            } catch (err) {
                POS.toast('Failed to send receipt', 'error');
                return { success: false, error: err.message };
            }
        }
        
        POS.toast('Email service not available', 'error');
        return { success: false, error: 'Service unavailable' };
    },
    
    // Close receipt modal
    closeReceiptModal() {
        const modal = document.getElementById('receiptModal');
        if (modal) modal.style.display = 'none';
    }
};

// Quick amount buttons for cash
function setQuickAmount(amount) {
    document.getElementById('cashTendered').value = amount.toFixed(2);
    calculateChange();
}

function calculateChange() {
    const due = Cart.getTotal();
    const tendered = parseFloat(document.getElementById('cashTendered').value) || 0;
    const change = Math.max(0, tendered - due);
    document.getElementById('cashChange').textContent = POS.formatCurrency(change);
}

// Initialize cart on load
document.addEventListener('DOMContentLoaded', () => {
    Cart.render();
});
