/**
 * Golf Cove - Tab/Cart Management System
 * Handles open tabs, cart operations, and checkout
 */

const GolfCoveTabs = (function() {
    'use strict';
    
    // State
    let openTabs = [];
    let cart = [];
    let currentTab = null;
    let currentCustomer = null;
    let memberDiscount = 0;
    
    // Tax rate
    const TAX_RATE = 0.0635; // 6.35% CT tax
    
    // Initialize
    function init() {
        openTabs = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
        cart = [];
    }
    
    function saveTabs() {
        localStorage.setItem('gc_tabs', JSON.stringify(openTabs));
    }
    
    // ============ TAB MANAGEMENT ============
    function createTab(customer, table = 'Tab', employee = 'POS') {
        // Check if table already has a tab
        if (table !== 'Tab') {
            const existing = openTabs.find(t => t.table === table);
            if (existing) {
                return { success: false, error: 'This table already has an open tab' };
            }
        }
        
        const tab = {
            id: Date.now(),
            customer: customer,
            employee: employee,
            amount: 0,
            subtotal: 0,
            tax: 0,
            items: [],
            table: table,
            createdAt: new Date().toISOString(),
            memberDiscount: 0
        };
        
        openTabs.push(tab);
        saveTabs();
        
        return { success: true, tab };
    }
    
    function getTab(tabId) {
        return openTabs.find(t => t.id === tabId);
    }
    
    function getAllTabs() {
        return openTabs;
    }
    
    function updateTab(tabId) {
        const tab = openTabs.find(t => t.id === tabId);
        if (!tab) return null;
        
        // Recalculate totals
        tab.subtotal = tab.items.reduce((sum, item) => sum + (item.price * item.qty), 0);
        tab.tax = tab.subtotal * TAX_RATE;
        tab.amount = tab.subtotal + tab.tax - (tab.memberDiscount || 0);
        
        saveTabs();
        return tab;
    }
    
    function addItemToTab(tabId, item) {
        const tab = openTabs.find(t => t.id === tabId);
        if (!tab) return { success: false, error: 'Tab not found' };
        
        // Check if item already exists
        const existingIndex = tab.items.findIndex(i => i.name === item.name && i.price === item.price);
        if (existingIndex !== -1) {
            tab.items[existingIndex].qty += item.qty || 1;
        } else {
            tab.items.push({
                name: item.name,
                price: item.price,
                qty: item.qty || 1,
                category: item.category || 'other'
            });
        }
        
        updateTab(tabId);
        return { success: true, tab };
    }
    
    function removeItemFromTab(tabId, itemIndex) {
        const tab = openTabs.find(t => t.id === tabId);
        if (!tab) return { success: false, error: 'Tab not found' };
        
        tab.items.splice(itemIndex, 1);
        updateTab(tabId);
        return { success: true, tab };
    }
    
    function closeTab(tabId, paymentMethod = 'card') {
        const tabIndex = openTabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return { success: false, error: 'Tab not found' };
        
        const tab = openTabs[tabIndex];
        
        // Create transaction record
        const transaction = {
            id: Date.now(),
            customer: tab.customer,
            employee: tab.employee,
            items: tab.items,
            subtotal: tab.subtotal,
            tax: tab.tax,
            amount: tab.amount,
            memberDiscount: tab.memberDiscount,
            paymentMethod: paymentMethod,
            date: new Date().toISOString(),
            tabId: tab.id,
            table: tab.table
        };
        
        // Save transaction
        const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        transactions.unshift(transaction);
        localStorage.setItem('gc_transactions', JSON.stringify(transactions));
        
        // Remove tab
        openTabs.splice(tabIndex, 1);
        saveTabs();
        
        return { success: true, transaction };
    }
    
    function deleteTab(tabId) {
        const tabIndex = openTabs.findIndex(t => t.id === tabId);
        if (tabIndex === -1) return { success: false, error: 'Tab not found' };
        
        openTabs.splice(tabIndex, 1);
        saveTabs();
        return { success: true };
    }
    
    // ============ CART MANAGEMENT ============
    function getCart() {
        return cart;
    }
    
    function addToCart(item) {
        const existingIndex = cart.findIndex(i => i.name === item.name && i.price === item.price);
        if (existingIndex !== -1) {
            cart[existingIndex].qty += item.qty || 1;
        } else {
            cart.push({
                name: item.name,
                price: item.price,
                qty: item.qty || 1,
                category: item.category || 'other'
            });
        }
        return cart;
    }
    
    function removeFromCart(index) {
        cart.splice(index, 1);
        return cart;
    }
    
    function updateCartQty(index, delta) {
        if (cart[index]) {
            cart[index].qty += delta;
            if (cart[index].qty <= 0) {
                cart.splice(index, 1);
            }
        }
        return cart;
    }
    
    function clearCart() {
        cart = [];
        currentCustomer = null;
        memberDiscount = 0;
        return cart;
    }
    
    function setCartCustomer(customer) {
        currentCustomer = customer;
        
        // Check for member discount
        memberDiscount = 0;
        if (customer && customer.isMember && typeof GolfCoveMembership !== 'undefined') {
            const discountInfo = GolfCoveMembership.calculateFnBDiscount(customer, getCartSubtotal());
            memberDiscount = discountInfo.discountAmount;
        }
        
        return { customer: currentCustomer, discount: memberDiscount };
    }
    
    function getCartCustomer() {
        return currentCustomer;
    }
    
    function getCartSubtotal() {
        return cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
    }
    
    function getCartTax() {
        return (getCartSubtotal() - memberDiscount) * TAX_RATE;
    }
    
    function getCartTotal() {
        return getCartSubtotal() + getCartTax() - memberDiscount;
    }
    
    function getCartMemberDiscount() {
        return memberDiscount;
    }
    
    function getCartSummary() {
        return {
            items: cart,
            itemCount: cart.reduce((sum, item) => sum + item.qty, 0),
            subtotal: getCartSubtotal(),
            memberDiscount: memberDiscount,
            tax: getCartTax(),
            total: getCartTotal(),
            customer: currentCustomer
        };
    }
    
    // ============ CHECKOUT ============
    function checkout(paymentMethod, employee = 'POS') {
        if (cart.length === 0) {
            return { success: false, error: 'Cart is empty' };
        }
        
        const summary = getCartSummary();
        
        const transaction = {
            id: Date.now(),
            customer: currentCustomer ? `${currentCustomer.firstName} ${currentCustomer.lastName}` : 'Walk-in',
            customerId: currentCustomer?.id || null,
            employee: employee,
            items: [...cart],
            subtotal: summary.subtotal,
            memberDiscount: summary.memberDiscount,
            tax: summary.tax,
            amount: summary.total,
            paymentMethod: paymentMethod,
            date: new Date().toISOString()
        };
        
        // Save transaction
        const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        transactions.unshift(transaction);
        localStorage.setItem('gc_transactions', JSON.stringify(transactions));
        
        // Update customer visit count
        if (currentCustomer) {
            const customers = JSON.parse(localStorage.getItem('gc_customers') || '[]');
            const customerIndex = customers.findIndex(c => c.id === currentCustomer.id);
            if (customerIndex !== -1) {
                customers[customerIndex].visitCount = (customers[customerIndex].visitCount || 0) + 1;
                customers[customerIndex].totalSpent = (customers[customerIndex].totalSpent || 0) + summary.total;
                customers[customerIndex].lastVisit = new Date().toISOString();
                localStorage.setItem('gc_customers', JSON.stringify(customers));
            }
        }
        
        // Clear cart
        clearCart();
        
        return { success: true, transaction };
    }
    
    // ============ SUSPENDED SALES ============
    function suspendSale(reason = '') {
        if (cart.length === 0) {
            return { success: false, error: 'Cart is empty' };
        }
        
        const suspended = JSON.parse(localStorage.getItem('gc_suspended') || '[]');
        suspended.push({
            id: Date.now(),
            items: [...cart],
            customer: currentCustomer,
            memberDiscount: memberDiscount,
            reason: reason,
            createdAt: new Date().toISOString()
        });
        localStorage.setItem('gc_suspended', JSON.stringify(suspended));
        
        clearCart();
        
        return { success: true };
    }
    
    function getSuspendedSales() {
        return JSON.parse(localStorage.getItem('gc_suspended') || '[]');
    }
    
    function recallSuspendedSale(id) {
        const suspended = JSON.parse(localStorage.getItem('gc_suspended') || '[]');
        const index = suspended.findIndex(s => s.id === id);
        
        if (index === -1) {
            return { success: false, error: 'Sale not found' };
        }
        
        const sale = suspended[index];
        cart = sale.items;
        currentCustomer = sale.customer;
        memberDiscount = sale.memberDiscount || 0;
        
        // Remove from suspended
        suspended.splice(index, 1);
        localStorage.setItem('gc_suspended', JSON.stringify(suspended));
        
        return { success: true, cart, customer: currentCustomer };
    }
    
    function deleteSuspendedSale(id) {
        const suspended = JSON.parse(localStorage.getItem('gc_suspended') || '[]');
        const filtered = suspended.filter(s => s.id !== id);
        localStorage.setItem('gc_suspended', JSON.stringify(filtered));
        return { success: true };
    }
    
    // ============ TRANSACTIONS ============
    function getTransactions() {
        return JSON.parse(localStorage.getItem('gc_transactions') || '[]');
    }
    
    function getTodaysTransactions() {
        const today = new Date().toDateString();
        return getTransactions().filter(t => new Date(t.date).toDateString() === today);
    }
    
    function getTodaysSales() {
        return getTodaysTransactions().reduce((sum, t) => sum + t.amount, 0);
    }
    
    // Initialize on load
    init();
    
    // Public API
    return {
        // Tab management
        createTab,
        getTab,
        getAllTabs,
        updateTab,
        addItemToTab,
        removeItemFromTab,
        closeTab,
        deleteTab,
        
        // Cart management
        getCart,
        addToCart,
        removeFromCart,
        updateCartQty,
        clearCart,
        setCartCustomer,
        getCartCustomer,
        getCartSubtotal,
        getCartTax,
        getCartTotal,
        getCartMemberDiscount,
        getCartSummary,
        
        // Checkout
        checkout,
        
        // Suspended sales
        suspendSale,
        getSuspendedSales,
        recallSuspendedSale,
        deleteSuspendedSale,
        
        // Transactions
        getTransactions,
        getTodaysTransactions,
        getTodaysSales,
        
        // Constants
        TAX_RATE
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveTabs;
}
