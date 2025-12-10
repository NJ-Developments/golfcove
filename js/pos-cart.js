// ============================================================
// GOLF COVE POS - CART & SALES MODULE
// Shopping cart, sales, and payment processing
// ============================================================

const Cart = {
    items: [],
    
    // Add item to cart
    add(item) {
        const existing = this.items.find(i => i.id === item.id && i.type === item.type);
        
        if (existing) {
            existing.qty += 1;
        } else {
            this.items.push({
                id: item.id || Date.now(),
                name: item.name,
                price: parseFloat(item.price) || 0,
                qty: item.qty || 1,
                type: item.type || 'item',
                modifiers: item.modifiers || []
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
        const item = this.items[index];
        if (!item) return;
        
        item.qty += delta;
        if (item.qty <= 0) {
            this.remove(index);
        } else {
            this.render();
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
        return new Promise((resolve) => {
            // Show cash drawer modal
            const amountDue = amount;
            const modal = document.getElementById('cashModal');
            document.getElementById('cashAmountDue').textContent = POS.formatCurrency(amountDue);
            document.getElementById('cashTendered').value = '';
            document.getElementById('cashChange').textContent = '$0.00';
            modal.style.display = 'flex';
            
            // Handle cash completion
            window.completeCashPayment = () => {
                const tendered = parseFloat(document.getElementById('cashTendered').value) || 0;
                if (tendered < amountDue) {
                    POS.toast('Insufficient amount', 'error');
                    return;
                }
                modal.style.display = 'none';
                resolve({ success: true, method: 'cash', tendered, change: tendered - amountDue });
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
        const transaction = {
            id: Date.now(),
            items: [...Cart.items],
            subtotal: Cart.getSubtotal(),
            tax: Cart.getTax(),
            total: Cart.getTotal(),
            payment: paymentResult,
            customer: POS.state.selectedCustomer,
            employee: POS.state.currentUser?.name,
            register: POS.config.registerId,
            createdAt: new Date().toISOString()
        };
        
        // Save locally
        const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        transactions.push(transaction);
        localStorage.setItem('gc_transactions', JSON.stringify(transactions));
        
        // Update customer stats
        if (POS.state.selectedCustomer && typeof GolfCoveCustomers !== 'undefined') {
            const customer = GolfCoveCustomers.search(POS.state.selectedCustomer, { limit: 1 })[0];
            if (customer) {
                GolfCoveCustomers.recordVisit(customer.id, transaction.total);
            }
        }
        
        // Sync to server
        try {
            await fetch('/api/sales', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(transaction)
            });
        } catch (err) {
            console.error('Failed to sync transaction:', err);
        }
        
        // Show success
        this.close();
        this.showReceipt(transaction);
        Cart.clear();
        
        POS.toast('Payment successful!', 'success');
    },
    
    // Show receipt
    showReceipt(transaction) {
        const modal = document.getElementById('receiptModal');
        if (!modal) return;
        
        document.getElementById('receiptContent').innerHTML = `
            <div class="receipt">
                <div class="receipt-header">
                    <h2>${POS.config.businessName}</h2>
                    <p>${new Date(transaction.createdAt).toLocaleString()}</p>
                    <p>Served by: ${transaction.employee}</p>
                </div>
                <div class="receipt-items">
                    ${transaction.items.map(item => `
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
                    <div class="receipt-row">
                        <span>Tax (${POS.config.taxRate}%)</span>
                        <span>${POS.formatCurrency(transaction.tax)}</span>
                    </div>
                    <div class="receipt-row total">
                        <span>Total</span>
                        <span>${POS.formatCurrency(transaction.total)}</span>
                    </div>
                    <div class="receipt-row">
                        <span>Paid (${transaction.payment.method})</span>
                        <span>${POS.formatCurrency(transaction.total)}</span>
                    </div>
                    ${transaction.payment.change ? `
                        <div class="receipt-row">
                            <span>Change</span>
                            <span>${POS.formatCurrency(transaction.payment.change)}</span>
                        </div>
                    ` : ''}
                </div>
                <div class="receipt-footer">
                    <p>Thank you for visiting!</p>
                    <p>Transaction #${transaction.id}</p>
                </div>
            </div>
        `;
        
        modal.style.display = 'flex';
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
