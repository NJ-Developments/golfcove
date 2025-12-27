// ============================================================
// GOLF COVE POS - CUSTOMERS MODULE
// Customer management, lookup, and tabs
// ============================================================

const Customers = {
    list: [],
    MAX_CUSTOMERS: 10000, // Storage limit
    
    // Validation helpers
    _sanitize(str) {
        if (typeof str !== 'string') return '';
        return str.trim().substring(0, 200);
    },
    
    _validateEmail(email) {
        if (!email) return '';
        email = String(email).trim().toLowerCase();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email) ? email : '';
    },
    
    _validatePhone(phone) {
        if (!phone) return '';
        // Strip to digits only, keep 10-15 digits
        const digits = String(phone).replace(/\D/g, '');
        return digits.length >= 10 && digits.length <= 15 ? digits : '';
    },
    
    _validateName(name) {
        if (!name || typeof name !== 'string') return null;
        const clean = name.trim().substring(0, 100);
        return clean.length >= 1 ? clean : null;
    },
    
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
        
        // Sanitize query
        if (typeof query !== 'string') return [];
        query = query.toLowerCase().trim().substring(0, 50);
        if (query.length < 1) return this.list.slice(0, 20);
        
        const results = this.list.filter(c => 
            c.name?.toLowerCase().includes(query) ||
            c.phone?.includes(query) ||
            c.email?.toLowerCase().includes(query)
        );
        
        // Limit results
        return results.slice(0, 50);
    },
    
    // Get customer by ID
    get(id) {
        return this.list.find(c => c.id === id);
    },
    
    // Add new customer
    add(customer) {
        // Validate required name
        const validName = this._validateName(customer?.name);
        if (!validName) {
            console.error('Invalid customer name');
            return null;
        }
        
        // Check for duplicates (by phone or email)
        const phone = this._validatePhone(customer.phone);
        const email = this._validateEmail(customer.email);
        
        if (phone || email) {
            const duplicate = this.list.find(c => 
                (phone && c.phone === phone) || 
                (email && c.email === email)
            );
            if (duplicate) {
                console.warn('Customer with this phone/email already exists:', duplicate.id);
                // Return existing customer instead of creating duplicate
                return duplicate;
            }
        }
        
        // Check storage limit
        if (this.list.length >= this.MAX_CUSTOMERS) {
            console.error('Customer storage limit reached');
            POS.toast('Customer database full. Please contact support.', 'error');
            return null;
        }
        
        const newCustomer = {
            id: Date.now().toString(),
            name: validName,
            phone: phone,
            email: email,
            notes: this._sanitize(customer.notes || ''),
            membershipType: customer.membershipType || null,
            loyaltyPoints: 0,
            totalSpent: 0,
            visitCount: 0,
            lastVisit: null,
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
        
        // Validate updates
        const validated = {};
        if (updates.name !== undefined) {
            const name = this._validateName(updates.name);
            if (name) validated.name = name;
        }
        if (updates.phone !== undefined) {
            validated.phone = this._validatePhone(updates.phone);
        }
        if (updates.email !== undefined) {
            validated.email = this._validateEmail(updates.email);
        }
        if (updates.notes !== undefined) {
            validated.notes = this._sanitize(updates.notes);
        }
        if (updates.membershipType !== undefined) {
            validated.membershipType = updates.membershipType;
        }
        // Allow updating numeric fields
        ['loyaltyPoints', 'totalSpent', 'visitCount'].forEach(field => {
            if (typeof updates[field] === 'number' && updates[field] >= 0) {
                validated[field] = updates[field];
            }
        });
        if (updates.lastVisit) {
            validated.lastVisit = updates.lastVisit;
        }
        
        validated.updatedAt = new Date().toISOString();
        
        this.list[index] = { ...this.list[index], ...validated };
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
        
        // Member tier colors and names
        const tierColors = {
            'par': '#3498db',
            'birdie': '#9b59b6', 
            'eagle': '#f1c40f',
            'family_par': '#3498db',
            'family_birdie': '#9b59b6',
            'family_eagle': '#f1c40f',
            'corporate': '#2c3e50'
        };
        const tierNames = {
            'par': 'PAR',
            'birdie': 'BIRDIE',
            'eagle': 'EAGLE',
            'family_par': 'FAMILY PAR',
            'family_birdie': 'FAMILY BIRDIE',
            'family_eagle': 'FAMILY EAGLE',
            'corporate': 'CORPORATE'
        };
        const tierDiscounts = {
            'par': '10%',
            'birdie': '10%',
            'eagle': '15%',
            'family_par': '10%',
            'family_birdie': '10%',
            'family_eagle': '15%',
            'corporate': '20%'
        };
        
        container.innerHTML = this.list.map(tab => {
            const tabName = tab.name || tab.customer || 'Guest';
            const isMember = tab.isMember || false;
            const isLeague = tab.isLeague || false;
            const memberType = tab.memberType;
            const tierColor = tierColors[memberType] || '#27ae60';
            const tierName = tierNames[memberType] || memberType?.toUpperCase() || 'MEMBER';
            const discount = tierDiscounts[memberType] || '10%';
            
            // Build badges HTML
            let badgesHtml = '';
            if (isMember && memberType) {
                badgesHtml += `
                    <div style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg, ${tierColor}, ${tierColor}cc);color:#fff;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;box-shadow:0 2px 6px rgba(0,0,0,0.25);margin-right:6px;">
                        <i class="fas fa-crown" style="color:#f1c40f;font-size:10px;"></i>
                        ${tierName} <span style="background:rgba(255,255,255,0.25);padding:1px 5px;border-radius:8px;font-size:9px;margin-left:3px;">${discount} OFF</span>
                    </div>
                `;
            }
            if (isLeague) {
                badgesHtml += `
                    <div style="display:inline-flex;align-items:center;gap:4px;background:linear-gradient(135deg, #27ae60, #1e8449);color:#fff;padding:4px 10px;border-radius:20px;font-size:11px;font-weight:700;text-transform:uppercase;box-shadow:0 2px 6px rgba(0,0,0,0.25);">
                        <i class="fas fa-golf-ball" style="font-size:10px;"></i>
                        LEAGUE
                    </div>
                `;
            }
            
            // Card styles - highlight for members/league
            let cardStyle = '';
            if (isMember) {
                cardStyle = `border-left:4px solid ${tierColor};background:linear-gradient(135deg, #fffef0 0%, #fefcf0 100%);`;
            } else if (isLeague) {
                cardStyle = 'border-left:4px solid #27ae60;background:linear-gradient(135deg, #f0fff4 0%, #e8f5e9 100%);';
            }
            
            return `
            <div class="tab-card" onclick="Cart.recall(${tab.id})" style="${cardStyle}">
                <div class="tab-header">
                    <span class="tab-name">${tabName}</span>
                    <span class="tab-total">${POS.formatCurrency(tab.items.reduce((sum, i) => sum + i.price * i.qty, 0))}</span>
                </div>
                ${badgesHtml ? `<div style="margin:8px 0;">${badgesHtml}</div>` : ''}
                <div class="tab-meta">
                    <span>${tab.items.length} item${tab.items.length !== 1 ? 's' : ''}</span>
                    <span>${this.formatAge(tab.createdAt)}</span>
                </div>
                <div class="tab-items">
                    ${tab.items.slice(0, 3).map(i => `<span>${i.qty}× ${i.name}</span>`).join('')}
                    ${tab.items.length > 3 ? `<span>+${tab.items.length - 3} more</span>` : ''}
                </div>
            </div>
        `}).join('');
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
