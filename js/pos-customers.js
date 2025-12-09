// ============================================================
// GOLF COVE POS - CUSTOMERS MODULE
// Customer management, lookup, and tabs
// ============================================================

const Customers = {
    list: [],
    
    // Load customers
    init() {
        this.load();
    },
    
    // Load from localStorage
    load() {
        this.list = JSON.parse(localStorage.getItem('gc_customers') || '[]');
    },
    
    // Save to localStorage
    save() {
        localStorage.setItem('gc_customers', JSON.stringify(this.list));
    },
    
    // Search customers
    search(query) {
        if (!query) return this.list.slice(0, 20);
        
        query = query.toLowerCase();
        return this.list.filter(c => 
            c.name.toLowerCase().includes(query) ||
            c.phone?.includes(query) ||
            c.email?.toLowerCase().includes(query)
        );
    },
    
    // Get customer by ID
    get(id) {
        return this.list.find(c => c.id === id);
    },
    
    // Add new customer
    add(customer) {
        const newCustomer = {
            id: Date.now().toString(),
            name: customer.name,
            phone: customer.phone || '',
            email: customer.email || '',
            notes: customer.notes || '',
            membershipType: customer.membershipType || null,
            createdAt: new Date().toISOString()
        };
        
        this.list.push(newCustomer);
        this.save();
        return newCustomer;
    },
    
    // Update customer
    update(id, updates) {
        const index = this.list.findIndex(c => c.id === id);
        if (index === -1) return null;
        
        this.list[index] = { ...this.list[index], ...updates };
        this.save();
        return this.list[index];
    },
    
    // Delete customer
    delete(id) {
        this.list = this.list.filter(c => c.id !== id);
        this.save();
    },
    
    // Select customer for current transaction
    select(customerId) {
        const customer = this.get(customerId);
        if (customer) {
            POS.state.selectedCustomer = customer;
            this.renderSelectedCustomer();
            this.closeSearch();
            POS.toast(`Customer: ${customer.name}`, 'success');
        }
    },
    
    // Clear selected customer
    clearSelection() {
        POS.state.selectedCustomer = null;
        this.renderSelectedCustomer();
    },
    
    // Render selected customer display
    renderSelectedCustomer() {
        const container = document.getElementById('selectedCustomer');
        if (!container) return;
        
        const customer = POS.state.selectedCustomer;
        
        if (customer) {
            container.innerHTML = `
                <div class="selected-customer-info">
                    <i class="fas fa-user"></i>
                    <span>${customer.name}</span>
                    ${customer.membershipType ? `<span class="membership-badge">${customer.membershipType}</span>` : ''}
                </div>
                <button class="clear-customer-btn" onclick="Customers.clearSelection()">
                    <i class="fas fa-times"></i>
                </button>
            `;
            container.classList.add('has-customer');
        } else {
            container.innerHTML = `
                <button class="add-customer-btn" onclick="Customers.showSearch()">
                    <i class="fas fa-user-plus"></i>
                    <span>Add Customer</span>
                </button>
            `;
            container.classList.remove('has-customer');
        }
    },
    
    // Show customer search modal
    showSearch() {
        const modal = document.getElementById('customerSearchModal');
        if (!modal) return;
        
        document.getElementById('customerSearchInput').value = '';
        this.renderSearchResults([]);
        modal.style.display = 'flex';
        document.getElementById('customerSearchInput').focus();
    },
    
    // Close search modal
    closeSearch() {
        const modal = document.getElementById('customerSearchModal');
        if (modal) modal.style.display = 'none';
    },
    
    // Handle search input
    handleSearch(query) {
        const results = this.search(query);
        this.renderSearchResults(results, query);
    },
    
    // Render search results
    renderSearchResults(results, query = '') {
        const container = document.getElementById('customerSearchResults');
        if (!container) return;
        
        if (results.length === 0) {
            container.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <p>${query ? `No customers found for "${query}"` : 'Search for a customer'}</p>
                    ${query ? `<button class="btn-primary" onclick="Customers.showNewCustomerForm('${query}')">
                        <i class="fas fa-plus"></i> Add "${query}"
                    </button>` : ''}
                </div>
            `;
            return;
        }
        
        container.innerHTML = results.map(customer => `
            <div class="customer-result" onclick="Customers.select('${customer.id}')">
                <div class="customer-avatar">
                    <i class="fas fa-user"></i>
                </div>
                <div class="customer-info">
                    <div class="customer-name">${customer.name}</div>
                    <div class="customer-contact">
                        ${customer.phone ? `<span><i class="fas fa-phone"></i> ${POS.formatPhone(customer.phone)}</span>` : ''}
                        ${customer.email ? `<span><i class="fas fa-envelope"></i> ${customer.email}</span>` : ''}
                    </div>
                </div>
                ${customer.membershipType ? `<span class="membership-badge">${customer.membershipType}</span>` : ''}
            </div>
        `).join('');
    },
    
    // Show new customer form
    showNewCustomerForm(initialName = '') {
        const modal = document.getElementById('newCustomerModal');
        if (!modal) return;
        
        document.getElementById('newCustomerName').value = initialName;
        document.getElementById('newCustomerPhone').value = '';
        document.getElementById('newCustomerEmail').value = '';
        
        this.closeSearch();
        modal.style.display = 'flex';
        document.getElementById('newCustomerName').focus();
    },
    
    // Save new customer
    saveNewCustomer() {
        const name = document.getElementById('newCustomerName').value.trim();
        if (!name) {
            POS.toast('Name is required', 'error');
            return;
        }
        
        const customer = this.add({
            name: name,
            phone: document.getElementById('newCustomerPhone').value.trim(),
            email: document.getElementById('newCustomerEmail').value.trim()
        });
        
        this.select(customer.id);
        document.getElementById('newCustomerModal').style.display = 'none';
        POS.toast(`Customer "${name}" added`, 'success');
    }
};

// Tabs management
const Tabs = {
    list: [],
    
    // Load tabs
    init() {
        this.load();
    },
    
    // Load from localStorage
    load() {
        this.list = JSON.parse(localStorage.getItem('gc_tabs') || '[]');
    },
    
    // Render tabs list
    render() {
        this.load();
        
        const container = document.getElementById('tabsList');
        if (!container) return;
        
        if (this.list.length === 0) {
            container.innerHTML = `
                <div class="no-tabs">
                    <i class="fas fa-receipt"></i>
                    <p>No open tabs</p>
                    <small>Hold a cart to create a tab</small>
                </div>
            `;
            return;
        }
        
        container.innerHTML = this.list.map(tab => `
            <div class="tab-card" onclick="Cart.recall(${tab.id})">
                <div class="tab-header">
                    <span class="tab-name">${tab.name}</span>
                    <span class="tab-total">${POS.formatCurrency(tab.items.reduce((sum, i) => sum + i.price * i.qty, 0))}</span>
                </div>
                <div class="tab-meta">
                    <span>${tab.items.length} item${tab.items.length !== 1 ? 's' : ''}</span>
                    <span>${this.formatAge(tab.createdAt)}</span>
                </div>
                <div class="tab-items">
                    ${tab.items.slice(0, 3).map(i => `<span>${i.qty}× ${i.name}</span>`).join('')}
                    ${tab.items.length > 3 ? `<span>+${tab.items.length - 3} more</span>` : ''}
                </div>
            </div>
        `).join('');
    },
    
    // Format tab age
    formatAge(dateStr) {
        const diff = Date.now() - new Date(dateStr).getTime();
        const mins = Math.floor(diff / 60000);
        
        if (mins < 60) return `${mins}m ago`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `${hours}h ago`;
        return `${Math.floor(hours / 24)}d ago`;
    }
};

// Initialize on load
document.addEventListener('DOMContentLoaded', () => {
    Customers.init();
    Customers.renderSelectedCustomer();
    Tabs.init();
});
