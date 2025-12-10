/**
 * Golf Cove - Sales POS Module
 * Clean, modular sales system
 */

const SalesPOS = (function() {
    'use strict';
    
    // ============ STATE ============
    let currentUser = null;
    let currentOrder = {
        id: null,
        customer: 'Walk-in',
        customerId: null,
        items: [],
        subtotal: 0,
        tax: 0,
        discount: 0,
        total: 0,
        notes: ''
    };
    let isReturnMode = false;
    let activeCategory = 'food';
    
    // ============ CONFIGURATION ============
    const TAX_RATE = 0.0635;
    
    const categories = [
        { id: 'food', name: 'Food', icon: 'fa-utensils', color: '#3498db' },
        { id: 'speed_bar', name: 'Speed Bar', icon: 'fa-bolt', color: '#3498db' },
        { id: 'beverage', name: 'Beverage', icon: 'fa-wine-glass-alt', color: '#3498db' },
        { id: 'pizza', name: 'Pizza', icon: 'fa-pizza-slice', color: '#3498db' },
        { id: 'giftcard', name: 'Gift Cards', icon: 'fa-gift', color: '#5dade2' },
        { id: 'specials', name: 'Specials', icon: 'fa-star', color: '#5dade2' }
    ];
    
    const subcategories = {
        food: [
            { id: 'apps', name: 'Apps', color: '#5dade2' },
            { id: 'entrees', name: 'Entrees', color: '#5dade2' },
            { id: 'sides', name: 'Sides', color: '#5dade2' },
            { id: 'extras', name: 'Extras', color: '#5dade2' }
        ],
        beverage: [
            { id: 'beer', name: 'Beer', color: '#fff', textColor: '#333' },
            { id: 'wine', name: 'Wine', color: '#fff', textColor: '#333' },
            { id: 'cocktails', name: 'Cocktails', color: '#fff', textColor: '#333' },
            { id: 'soft', name: 'Soft Drinks', color: '#fff', textColor: '#333' }
        ]
    };
    
    // Menu items
    const menuItems = {
        apps: [
            { name: 'Wings', price: 14.99 },
            { name: 'Nachos', price: 12.99 },
            { name: 'Mozzarella Sticks', price: 9.99 },
            { name: 'Loaded Fries', price: 10.99 },
            { name: 'Quesadilla', price: 11.99 },
            { name: 'Pretzel Bites', price: 8.99 }
        ],
        entrees: [
            { name: 'Burger', price: 15.99 },
            { name: 'Chicken Sandwich', price: 14.99 },
            { name: 'Fish & Chips', price: 16.99 },
            { name: 'Philly Cheesesteak', price: 15.99 },
            { name: 'Club Sandwich', price: 13.99 },
            { name: 'Grilled Chicken', price: 14.99 }
        ],
        sides: [
            { name: 'Fries', price: 4.99 },
            { name: 'Onion Rings', price: 5.99 },
            { name: 'Coleslaw', price: 3.99 },
            { name: 'Side Salad', price: 5.99 }
        ],
        extras: [
            { name: 'Extra Sauce', price: 0.75 },
            { name: 'Add Bacon', price: 2.00 },
            { name: 'Add Cheese', price: 1.50 },
            { name: 'Gluten Free Bun', price: 2.00 }
        ],
        beer: [
            { name: 'Bud Light', price: 5.00 },
            { name: 'Coors Light', price: 5.00 },
            { name: 'IPA', price: 7.00 },
            { name: 'Craft Lager', price: 7.00 },
            { name: 'Guinness', price: 8.00 },
            { name: 'Corona', price: 6.00 }
        ],
        wine: [
            { name: 'House Red', price: 8.00 },
            { name: 'House White', price: 8.00 },
            { name: 'Pinot Grigio', price: 10.00 },
            { name: 'Cabernet', price: 10.00 },
            { name: 'Prosecco', price: 9.00 }
        ],
        cocktails: [
            { name: 'Margarita', price: 12.00 },
            { name: 'Old Fashioned', price: 14.00 },
            { name: 'Moscow Mule', price: 12.00 },
            { name: 'Vodka Soda', price: 9.00 },
            { name: 'Rum & Coke', price: 9.00 },
            { name: 'Long Island', price: 14.00 }
        ],
        soft: [
            { name: 'Soda', price: 3.00 },
            { name: 'Iced Tea', price: 3.00 },
            { name: 'Lemonade', price: 3.50 },
            { name: 'Coffee', price: 3.00 },
            { name: 'Water', price: 2.00 },
            { name: 'Red Bull', price: 5.00 }
        ],
        daily_specials: [
            { name: 'Lunch Special', price: 12.99 },
            { name: 'Happy Hour Wings', price: 9.99 }
        ],
        desserts: [
            { name: 'Brownie Sundae', price: 8.99 },
            { name: 'Cheesecake', price: 7.99 }
        ],
        fried_food: [
            { name: 'Fried Pickles', price: 7.99 },
            { name: 'Fried Calamari', price: 12.99 }
        ],
        wings: [
            { name: 'Buffalo Wings (6)', price: 9.99 },
            { name: 'Buffalo Wings (12)', price: 14.99 },
            { name: 'BBQ Wings (6)', price: 9.99 },
            { name: 'BBQ Wings (12)', price: 14.99 }
        ],
        burgers: [
            { name: 'Classic Burger', price: 13.99 },
            { name: 'Bacon Cheeseburger', price: 15.99 },
            { name: 'Mushroom Swiss', price: 15.99 },
            { name: 'Veggie Burger', price: 13.99 }
        ],
        combo: [
            { name: 'Burger Combo', price: 17.99 },
            { name: 'Chicken Combo', price: 16.99 },
            { name: 'Wings Combo', price: 18.99 }
        ],
        giftcard: [
            { name: '$25 Gift Card', price: 25.00 },
            { name: '$50 Gift Card', price: 50.00 },
            { name: '$100 Gift Card', price: 100.00 }
        ],
        rental: [
            { name: '1 Hour Bay', price: 45.00 },
            { name: '2 Hour Bay', price: 80.00 },
            { name: '3 Hour Bay', price: 110.00 },
            { name: 'Club Rental', price: 10.00 }
        ]
    };
    
    // ============ INITIALIZATION ============
    function init(user) {
        currentUser = user || { name: 'Staff', role: 'staff' };
        resetOrder();
        renderCategories();
        renderSubcategories('food');
        renderOrder();
        renderOpenTabs();
        updateDisplay();
        bindEvents();
        console.log('[SalesPOS] Initialized');
    }
    
    function bindEvents() {
        // Customer search
        const customerInput = document.getElementById('orderCustomer');
        if (customerInput) {
            customerInput.addEventListener('input', debounce(searchCustomers, 300));
            customerInput.addEventListener('focus', () => {
                const results = document.getElementById('customerResults');
                if (results && results.innerHTML) results.style.display = 'block';
            });
        }
        
        // Click outside to close dropdowns
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.order-customer')) {
                const results = document.getElementById('customerResults');
                if (results) results.style.display = 'none';
            }
        });
    }
    
    // ============ ORDER MANAGEMENT ============
    function resetOrder() {
        currentOrder = {
            id: 'ORD-' + Date.now(),
            customer: 'Walk-in',
            customerId: null,
            items: [],
            subtotal: 0,
            tax: 0,
            discount: 0,
            total: 0,
            notes: ''
        };
        isReturnMode = false;
    }
    
    function addItem(name, price, category = '') {
        const existingIndex = currentOrder.items.findIndex(item => 
            item.name === name && item.price === price
        );
        
        if (existingIndex !== -1) {
            currentOrder.items[existingIndex].qty += 1;
        } else {
            currentOrder.items.push({
                name: name,
                price: price,
                qty: 1,
                category: category,
                discount: 0
            });
        }
        
        calculateTotals();
        renderOrder();
        showToast(`Added ${name}`);
    }
    
    function updateItemQty(index, delta) {
        if (index < 0 || index >= currentOrder.items.length) return;
        
        currentOrder.items[index].qty += delta;
        
        if (currentOrder.items[index].qty <= 0) {
            currentOrder.items.splice(index, 1);
        }
        
        calculateTotals();
        renderOrder();
    }
    
    function removeItem(index) {
        if (index < 0 || index >= currentOrder.items.length) return;
        currentOrder.items.splice(index, 1);
        calculateTotals();
        renderOrder();
    }
    
    function calculateTotals() {
        currentOrder.subtotal = currentOrder.items.reduce((sum, item) => {
            const itemTotal = item.price * item.qty;
            const discountAmt = itemTotal * (item.discount / 100);
            return sum + (itemTotal - discountAmt);
        }, 0);
        
        currentOrder.tax = currentOrder.subtotal * TAX_RATE;
        currentOrder.total = currentOrder.subtotal + currentOrder.tax - currentOrder.discount;
    }
    
    function clearOrder() {
        if (currentOrder.items.length === 0) return;
        if (!confirm('Clear all items?')) return;
        resetOrder();
        renderOrder();
        document.getElementById('orderCustomer').value = '';
        showToast('Order cleared');
    }
    
    // ============ RENDERING ============
    function renderCategories() {
        const container = document.getElementById('categoryGrid');
        if (!container) return;
        
        const allCategories = [
            { id: 'food', name: 'Food', color: '#3498db' },
            { id: 'speed_bar', name: 'Speed Bar', color: '#3498db' },
            { id: 'beverage', name: 'Beverage', color: '#3498db' },
            { id: 'pizza', name: 'Pizza', color: '#3498db' },
            { id: 'giftcard', name: 'Gift Cards', color: '#5dade2' },
            { id: 'specials', name: 'Specials', color: '#5dade2' }
        ];
        
        container.innerHTML = allCategories.map(cat => `
            <button class="cat-btn ${cat.id === activeCategory ? 'active' : ''}" 
                    style="background:${cat.color};" 
                    onclick="SalesPOS.selectCategory('${cat.id}')">
                ${cat.name}
            </button>
        `).join('');
    }
    
    function renderSubcategories(category) {
        activeCategory = category;
        const container = document.getElementById('subcategoryGrid');
        if (!container) return;
        
        let items = [];
        
        switch (category) {
            case 'food':
                items = [
                    { id: 'apps', name: 'Apps', color: '#5dade2' },
                    { id: 'entrees', name: 'Entrees', color: '#5dade2' },
                    { id: 'sides', name: 'Sides', color: '#5dade2' },
                    { id: 'extras', name: 'Extras', color: '#5dade2' },
                    { id: 'daily_specials', name: 'Daily Specials', color: '#fff', text: '#333' },
                    { id: 'desserts', name: 'Desserts', color: '#fff', text: '#333' },
                    { id: 'sides', name: 'Sides', color: '#fff', text: '#333' },
                    { id: 'extras', name: 'Extras', color: '#fff', text: '#333' },
                    { id: 'combo', name: 'Combo', color: '#fff', text: '#333' },
                    { id: 'fried_food', name: 'Fried Food', color: '#fff', text: '#333' },
                    { id: 'wings', name: 'Wings', color: '#fff', text: '#333' },
                    { id: 'burgers', name: 'Burgers', color: '#fff', text: '#333' }
                ];
                break;
            case 'beverage':
            case 'speed_bar':
                items = [
                    { id: 'beer', name: 'Beer', color: '#5dade2' },
                    { id: 'wine', name: 'Wine', color: '#5dade2' },
                    { id: 'cocktails', name: 'Cocktails', color: '#5dade2' },
                    { id: 'soft', name: 'Soft Drinks', color: '#5dade2' }
                ];
                break;
            case 'giftcard':
                items = [
                    { id: 'giftcard', name: 'Gift Cards', color: '#5dade2' }
                ];
                break;
            case 'pizza':
                items = [
                    { id: 'entrees', name: 'Pizza', color: '#5dade2' }
                ];
                break;
            default:
                items = [
                    { id: 'apps', name: 'Apps', color: '#5dade2' }
                ];
        }
        
        container.innerHTML = items.map(item => `
            <button class="subcat-btn" 
                    style="background:${item.color};${item.text ? 'color:' + item.text + ';' : ''}" 
                    onclick="SalesPOS.showItems('${item.id}')">
                ${item.name}
            </button>
        `).join('');
        
        // Auto-show first subcategory items
        if (items.length > 0) {
            showItems(items[0].id);
        }
        
        renderCategories();
    }
    
    function selectCategory(category) {
        activeCategory = category;
        renderSubcategories(category);
    }
    
    function showItems(subcategory) {
        const container = document.getElementById('itemsPanel');
        if (!container) return;
        
        const items = menuItems[subcategory] || [];
        
        if (items.length === 0) {
            container.innerHTML = '<div class="no-items">No items in this category</div>';
            return;
        }
        
        container.innerHTML = `
            <div class="items-grid">
                ${items.map(item => `
                    <button class="item-btn" onclick="SalesPOS.addItem('${item.name.replace(/'/g, "\\'")}', ${item.price}, '${subcategory}')">
                        <span class="item-name">${item.name}</span>
                        <span class="item-price">$${item.price.toFixed(2)}</span>
                    </button>
                `).join('')}
            </div>
        `;
    }
    
    function renderOrder() {
        const tbody = document.getElementById('orderItems');
        if (!tbody) return;
        
        if (currentOrder.items.length === 0) {
            tbody.innerHTML = `
                <tr class="empty-order">
                    <td colspan="4">
                        <div class="empty-state">
                            <p>No items</p>
                        </div>
                    </td>
                </tr>
            `;
        } else {
            tbody.innerHTML = currentOrder.items.map((item, index) => `
                <tr>
                    <td class="item-name-col">${item.name}</td>
                    <td class="item-qty-col">${item.qty}</td>
                    <td class="item-price-col">$${item.price.toFixed(2)}</td>
                    <td class="item-total-col">$${(item.price * item.qty).toFixed(2)}</td>
                </tr>
            `).join('');
        }
        
        updateTotals();
    }
    
    function updateTotals() {
        const subtotalEl = document.getElementById('orderSubtotal');
        const taxEl = document.getElementById('orderTax');
        const balanceEl = document.getElementById('orderBalance');
        const totalEl = document.getElementById('orderTotal');
        
        if (subtotalEl) subtotalEl.textContent = '$' + currentOrder.subtotal.toFixed(2);
        if (taxEl) taxEl.textContent = '$' + currentOrder.tax.toFixed(2);
        if (balanceEl) balanceEl.textContent = '$' + currentOrder.total.toFixed(2);
        if (totalEl) totalEl.textContent = '$' + currentOrder.total.toFixed(2);
    }
    
    function updateDisplay() {
        const userEl = document.getElementById('currentUserDisplay');
        if (userEl && currentUser) {
            userEl.textContent = currentUser.name;
        }
    }
    
    // ============ TABS ============
    function renderOpenTabs() {
        // This will be populated from TabsSync
        if (typeof TabsSync !== 'undefined') {
            TabsSync.init();
        }
    }
    
    async function startTab() {
        if (currentOrder.items.length === 0) {
            showToast('Add items first', 'error');
            return;
        }
        
        let customer = currentOrder.customer;
        if (customer === 'Walk-in') {
            customer = prompt('Customer name for tab:');
            if (!customer) return;
        }
        
        const items = currentOrder.items.map(item => ({
            name: item.name,
            price: item.price,
            qty: item.qty,
            category: item.category
        }));
        
        if (typeof TabsSync !== 'undefined') {
            await TabsSync.createTab(customer, currentOrder.customerId, items, currentUser?.name || 'Staff');
            showToast(`Tab opened for ${customer}`);
            resetOrder();
            renderOrder();
            document.getElementById('orderCustomer').value = '';
        }
    }
    
    // ============ PAYMENTS ============
    async function processPayment(method) {
        if (currentOrder.items.length === 0) {
            showToast('Add items first', 'error');
            return;
        }
        
        if (method === 'cash') {
            showCashModal();
            return;
        }
        
        // Quick pay or card
        completePayment(method);
    }
    
    function showCashModal() {
        const modal = document.getElementById('cashModal');
        if (modal) {
            document.getElementById('cashTotal').textContent = '$' + currentOrder.total.toFixed(2);
            document.getElementById('cashTendered').value = '';
            document.getElementById('cashChange').textContent = '$0.00';
            modal.classList.add('active');
            document.getElementById('cashTendered').focus();
        }
    }
    
    function calculateChange() {
        const tendered = parseFloat(document.getElementById('cashTendered').value) || 0;
        const change = Math.max(0, tendered - currentOrder.total);
        document.getElementById('cashChange').textContent = '$' + change.toFixed(2);
    }
    
    function completeCashPayment() {
        const tendered = parseFloat(document.getElementById('cashTendered').value) || 0;
        if (tendered < currentOrder.total) {
            showToast('Insufficient amount', 'error');
            return;
        }
        
        closeCashModal();
        completePayment('cash', { tendered, change: tendered - currentOrder.total });
    }
    
    function closeCashModal() {
        const modal = document.getElementById('cashModal');
        if (modal) modal.classList.remove('active');
    }
    
    function completePayment(method, details = {}) {
        const transaction = {
            id: Date.now(),
            orderId: currentOrder.id,
            customer: currentOrder.customer,
            customerId: currentOrder.customerId,
            items: [...currentOrder.items],
            subtotal: currentOrder.subtotal,
            tax: currentOrder.tax,
            discount: currentOrder.discount,
            total: currentOrder.total,
            method: method,
            details: details,
            isReturn: isReturnMode,
            employee: currentUser?.name || 'Staff',
            register: 'POS-1',
            date: new Date().toISOString()
        };
        
        // Save transaction
        const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        transactions.unshift(transaction);
        localStorage.setItem('gc_transactions', JSON.stringify(transactions));
        
        // Update customer stats
        if (currentOrder.customerId && typeof GolfCoveCustomers !== 'undefined') {
            GolfCoveCustomers.recordVisit(currentOrder.customerId, transaction.total);
        }
        
        showToast(`Payment of $${currentOrder.total.toFixed(2)} completed!`, 'success');
        
        // Print receipt option
        if (confirm('Print receipt?')) {
            printReceipt(transaction);
        }
        
        resetOrder();
        renderOrder();
        document.getElementById('orderCustomer').value = '';
    }
    
    function printReceipt(transaction) {
        // Simple receipt print
        const w = window.open('', '_blank', 'width=300,height=600');
        w.document.write(`
            <html>
            <head><title>Receipt</title>
            <style>
                body { font-family: monospace; font-size: 12px; padding: 10px; }
                .center { text-align: center; }
                .line { border-top: 1px dashed #000; margin: 10px 0; }
                .total { font-weight: bold; font-size: 14px; }
            </style>
            </head>
            <body>
                <div class="center">
                    <h2>Golf Cove</h2>
                    <p>${new Date(transaction.date).toLocaleString()}</p>
                </div>
                <div class="line"></div>
                ${transaction.items.map(i => `<div>${i.qty}x ${i.name} - $${(i.price * i.qty).toFixed(2)}</div>`).join('')}
                <div class="line"></div>
                <div>Subtotal: $${transaction.subtotal.toFixed(2)}</div>
                <div>Tax: $${transaction.tax.toFixed(2)}</div>
                <div class="total">Total: $${transaction.total.toFixed(2)}</div>
                <div class="line"></div>
                <div class="center">Thank you!</div>
            </body>
            </html>
        `);
        w.document.close();
        w.print();
    }
    
    // ============ CUSTOMER SEARCH ============
    function searchCustomers() {
        const input = document.getElementById('orderCustomer');
        const results = document.getElementById('customerResults');
        if (!input || !results) return;
        
        const query = input.value.trim().toLowerCase();
        if (query.length < 2) {
            results.style.display = 'none';
            return;
        }
        
        const customers = JSON.parse(localStorage.getItem('gc_customers') || '[]');
        const matches = customers.filter(c => {
            const name = `${c.firstName} ${c.lastName}`.toLowerCase();
            return name.includes(query) || (c.phone && c.phone.includes(query));
        }).slice(0, 5);
        
        if (matches.length === 0) {
            results.innerHTML = '<div class="no-results">No customers found</div>';
        } else {
            results.innerHTML = matches.map(c => {
                const isMember = c.isMember && c.memberExpires && new Date(c.memberExpires) > new Date();
                return `
                    <div class="customer-result" onclick="SalesPOS.selectCustomer(${c.id}, '${c.firstName} ${c.lastName}')">
                        <span class="customer-name">${c.firstName} ${c.lastName}</span>
                        ${isMember ? `<span class="member-badge">${c.memberType}</span>` : ''}
                    </div>
                `;
            }).join('');
        }
        
        results.style.display = 'block';
    }
    
    function selectCustomer(id, name) {
        currentOrder.customerId = id;
        currentOrder.customer = name;
        document.getElementById('orderCustomer').value = name;
        document.getElementById('customerResults').style.display = 'none';
        showToast(`Customer: ${name}`);
    }
    
    // ============ UTILITIES ============
    function showToast(message, type = 'info') {
        const existing = document.querySelector('.sales-toast');
        if (existing) existing.remove();
        
        const toast = document.createElement('div');
        toast.className = `sales-toast ${type}`;
        toast.textContent = message;
        document.body.appendChild(toast);
        
        setTimeout(() => toast.classList.add('show'), 10);
        setTimeout(() => {
            toast.classList.remove('show');
            setTimeout(() => toast.remove(), 300);
        }, 2000);
    }
    
    function debounce(fn, delay) {
        let timeout;
        return function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => fn.apply(this, args), delay);
        };
    }
    
    // ============ ACTIONS ============
    function applyDiscount() {
        const pct = prompt('Discount percentage:');
        if (pct === null) return;
        
        const discPct = Math.min(100, Math.max(0, parseFloat(pct) || 0));
        currentOrder.discount = currentOrder.subtotal * (discPct / 100);
        calculateTotals();
        renderOrder();
        showToast(`${discPct}% discount applied`);
    }
    
    function holdOrder() {
        showToast('Order on hold');
    }
    
    function sendOrder() {
        if (currentOrder.items.length === 0) {
            showToast('No items to send', 'error');
            return;
        }
        showToast('Order sent to kitchen');
    }
    
    // ============ PUBLIC API ============
    return {
        init,
        addItem,
        updateItemQty,
        removeItem,
        clearOrder,
        selectCategory,
        showItems,
        processPayment,
        calculateChange,
        completeCashPayment,
        closeCashModal,
        startTab,
        selectCustomer,
        applyDiscount,
        holdOrder,
        sendOrder,
        renderSubcategories
    };
})();

// Auto-init when DOM ready
document.addEventListener('DOMContentLoaded', () => {
    // Wait for PIN system
    if (typeof GolfCovePIN !== 'undefined') {
        GolfCovePIN.init((user) => {
            SalesPOS.init(user);
        });
    } else {
        SalesPOS.init({ name: 'Staff', role: 'staff' });
    }
});
