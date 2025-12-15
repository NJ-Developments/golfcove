/**
 * Golf Cove - Customer Management System
 * Handles customer data, search, and history
 * 
 * @deprecated This module is being phased out in favor of customer-manager.js
 * Use GolfCoveCustomerManager or GolfCoveServices.CustomerService instead
 * All new code should use the unified services layer (services-unified.js)
 */

const GolfCoveCustomers = (function() {
    'use strict';
    
    const STORAGE_KEY = 'gc_customers';
    
    // Emit deprecation warning once
    let deprecationWarned = false;
    function warnDeprecation(methodName) {
        if (!deprecationWarned) {
            console.warn('[GolfCoveCustomers] DEPRECATED: This module is being phased out. Use GolfCoveCustomerManager or GolfCoveServices.CustomerService instead.');
            deprecationWarned = true;
        }
    }
    
    // ============ DATA MANAGEMENT ============
    function getAll() {
        warnDeprecation('getAll');
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }
    
    function save(customers) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(customers));
    }
    
    function get(id) {
        const customers = getAll();
        return customers.find(c => c.id === id);
    }
    
    function getByEmail(email) {
        const customers = getAll();
        return customers.find(c => c.email && c.email.toLowerCase() === email.toLowerCase());
    }
    
    function getByPhone(phone) {
        const customers = getAll();
        const cleaned = phone.replace(/\D/g, '');
        return customers.find(c => c.phone && c.phone.replace(/\D/g, '') === cleaned);
    }
    
    function getByName(firstName, lastName) {
        const customers = getAll();
        return customers.find(c => 
            c.firstName.toLowerCase() === firstName.toLowerCase() &&
            c.lastName.toLowerCase() === lastName.toLowerCase()
        );
    }
    
    // ============ CRUD OPERATIONS ============
    function create(data) {
        const customers = getAll();
        
        // Validate required fields
        if (!data.firstName || !data.lastName) {
            return { success: false, error: 'First and last name required' };
        }
        
        // Check for duplicates
        if (data.email && getByEmail(data.email)) {
            return { success: false, error: 'Email already exists' };
        }
        
        const customer = {
            id: Date.now(),
            firstName: data.firstName.trim(),
            lastName: data.lastName.trim(),
            email: data.email?.trim() || '',
            phone: data.phone?.trim() || '',
            address: data.address || '',
            city: data.city || '',
            state: data.state || '',
            zip: data.zip || '',
            notes: data.notes || '',
            
            // Membership
            isMember: data.isMember || false,
            memberType: data.memberType || null,
            memberSince: data.memberSince || null,
            memberExpires: data.memberExpires || null,
            
            // Stats
            visitCount: 0,
            totalSpent: 0,
            lastVisit: null,
            noShowCount: 0,
            
            // Preferences
            preferredRoom: data.preferredRoom || null,
            preferredTime: data.preferredTime || null,
            clubRentals: data.clubRentals || false,
            
            // Marketing
            emailOptIn: data.emailOptIn !== false,
            smsOptIn: data.smsOptIn || false,
            birthday: data.birthday || null,
            
            // Metadata
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            source: data.source || 'pos' // 'pos', 'online', 'import'
        };
        
        customers.push(customer);
        save(customers);
        
        return { success: true, customer };
    }
    
    function update(id, updates) {
        const customers = getAll();
        const index = customers.findIndex(c => c.id === id);
        
        if (index === -1) {
            return { success: false, error: 'Customer not found' };
        }
        
        // Check email uniqueness if changed
        if (updates.email && updates.email !== customers[index].email) {
            const existing = getByEmail(updates.email);
            if (existing && existing.id !== id) {
                return { success: false, error: 'Email already exists' };
            }
        }
        
        customers[index] = {
            ...customers[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        save(customers);
        return { success: true, customer: customers[index] };
    }
    
    function remove(id) {
        const customers = getAll();
        const filtered = customers.filter(c => c.id !== id);
        
        if (filtered.length === customers.length) {
            return { success: false, error: 'Customer not found' };
        }
        
        save(filtered);
        return { success: true };
    }
    
    // ============ SEARCH ============
    function search(query, options = {}) {
        const customers = getAll();
        const q = query.toLowerCase().trim();
        
        if (!q) return customers.slice(0, options.limit || 50);
        
        let results = customers.filter(c => {
            const fullName = `${c.firstName} ${c.lastName}`.toLowerCase();
            const email = (c.email || '').toLowerCase();
            const phone = (c.phone || '').replace(/\D/g, '');
            const queryPhone = q.replace(/\D/g, '');
            
            return fullName.includes(q) ||
                   email.includes(q) ||
                   (queryPhone && phone.includes(queryPhone));
        });
        
        // Filter by member status
        if (options.membersOnly) {
            results = results.filter(c => c.isMember && isActiveMember(c));
        }
        
        // Sort
        if (options.sortBy === 'recent') {
            results.sort((a, b) => new Date(b.lastVisit || 0) - new Date(a.lastVisit || 0));
        } else if (options.sortBy === 'spent') {
            results.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
        } else if (options.sortBy === 'visits') {
            results.sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0));
        } else {
            // Default: alphabetical
            results.sort((a, b) => `${a.firstName} ${a.lastName}`.localeCompare(`${b.firstName} ${b.lastName}`));
        }
        
        return options.limit ? results.slice(0, options.limit) : results;
    }
    
    function searchMembers(query) {
        return search(query, { membersOnly: true });
    }
    
    // ============ MEMBERSHIP ============
    function isActiveMember(customer) {
        if (!customer.isMember || !customer.memberExpires) return false;
        return new Date(customer.memberExpires) > new Date();
    }
    
    function getMemberTier(customer) {
        if (!isActiveMember(customer)) return null;
        return customer.memberType;
    }
    
    function getMemberDiscount(customer) {
        const tier = getMemberTier(customer);
        if (!tier) return 0;
        
        const discounts = {
            eagle: 0.20,
            family_eagle: 0.20,
            birdie: 0.15,
            family_birdie: 0.15,
            par: 0.10,
            family_par: 0.10
        };
        
        return discounts[tier] || 0.10;
    }
    
    function isVIP(customer) {
        const tier = getMemberTier(customer);
        return tier && (tier.includes('eagle') || tier.includes('birdie'));
    }
    
    function getMembers() {
        return getAll().filter(c => isActiveMember(c));
    }
    
    function getExpiredMembers() {
        return getAll().filter(c => c.isMember && !isActiveMember(c));
    }
    
    function getMembersByTier(tier) {
        return getAll().filter(c => isActiveMember(c) && c.memberType === tier);
    }
    
    function setMembership(id, memberType, months = 12) {
        const expireDate = new Date();
        expireDate.setMonth(expireDate.getMonth() + months);
        
        return update(id, {
            isMember: true,
            memberType: memberType,
            memberSince: new Date().toISOString(),
            memberExpires: expireDate.toISOString()
        });
    }
    
    function cancelMembership(id) {
        return update(id, {
            isMember: false,
            memberType: null,
            memberExpires: null
        });
    }
    
    function renewMembership(id, months = 12) {
        const customer = get(id);
        if (!customer) return { success: false, error: 'Customer not found' };
        
        let expireDate = new Date(customer.memberExpires);
        if (expireDate < new Date()) {
            expireDate = new Date();
        }
        expireDate.setMonth(expireDate.getMonth() + months);
        
        return update(id, {
            memberExpires: expireDate.toISOString()
        });
    }
    
    // ============ VISIT TRACKING ============
    function recordVisit(id, amount = 0) {
        const customer = get(id);
        if (!customer) return { success: false, error: 'Customer not found' };
        
        return update(id, {
            visitCount: (customer.visitCount || 0) + 1,
            totalSpent: (customer.totalSpent || 0) + amount,
            lastVisit: new Date().toISOString()
        });
    }
    
    function recordNoShow(id) {
        const customer = get(id);
        if (!customer) return { success: false, error: 'Customer not found' };
        
        return update(id, {
            noShowCount: (customer.noShowCount || 0) + 1
        });
    }
    
    // ============ HISTORY ============
    function getBookingHistory(id) {
        if (typeof GolfCoveBooking === 'undefined') return [];
        
        const customer = get(id);
        if (!customer) return [];
        
        const name = `${customer.firstName} ${customer.lastName}`;
        return GolfCoveBooking.getAll().filter(b => 
            b.customer.toLowerCase() === name.toLowerCase()
        ).sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    
    function getTransactionHistory(id) {
        const customer = get(id);
        if (!customer) return [];
        
        const name = `${customer.firstName} ${customer.lastName}`;
        const transactions = JSON.parse(localStorage.getItem('gc_transactions') || '[]');
        
        return transactions.filter(t => 
            t.customer.toLowerCase() === name.toLowerCase() ||
            t.customerId === id
        ).sort((a, b) => new Date(b.date) - new Date(a.date));
    }
    
    // ============ ANALYTICS ============
    function getStats() {
        const customers = getAll();
        const activeMembers = customers.filter(c => isActiveMember(c));
        const today = new Date().toDateString();
        const thisMonth = new Date().getMonth();
        const thisYear = new Date().getFullYear();
        
        return {
            total: customers.length,
            activeMembers: activeMembers.length,
            vipMembers: activeMembers.filter(c => isVIP(c)).length,
            newThisMonth: customers.filter(c => {
                const created = new Date(c.createdAt);
                return created.getMonth() === thisMonth && created.getFullYear() === thisYear;
            }).length,
            avgVisits: customers.length > 0 
                ? Math.round(customers.reduce((sum, c) => sum + (c.visitCount || 0), 0) / customers.length)
                : 0,
            totalRevenue: customers.reduce((sum, c) => sum + (c.totalSpent || 0), 0),
            topSpenders: [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, 10),
            frequentVisitors: [...customers].sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0)).slice(0, 10),
            membersByTier: {
                eagle: activeMembers.filter(c => c.memberType === 'eagle' || c.memberType === 'family_eagle').length,
                birdie: activeMembers.filter(c => c.memberType === 'birdie' || c.memberType === 'family_birdie').length,
                par: activeMembers.filter(c => c.memberType === 'par' || c.memberType === 'family_par').length
            }
        };
    }
    
    function getTopCustomers(limit = 10, sortBy = 'spent') {
        const customers = getAll();
        
        if (sortBy === 'visits') {
            return [...customers].sort((a, b) => (b.visitCount || 0) - (a.visitCount || 0)).slice(0, limit);
        }
        
        return [...customers].sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0)).slice(0, limit);
    }
    
    // ============ IMPORT/EXPORT ============
    function exportToCSV() {
        const customers = getAll();
        
        const headers = [
            'First Name', 'Last Name', 'Email', 'Phone', 
            'Member Type', 'Member Expires', 'Visits', 'Total Spent'
        ];
        
        const rows = customers.map(c => [
            c.firstName,
            c.lastName,
            c.email || '',
            c.phone || '',
            c.memberType || '',
            c.memberExpires ? new Date(c.memberExpires).toLocaleDateString() : '',
            c.visitCount || 0,
            (c.totalSpent || 0).toFixed(2)
        ]);
        
        const csv = [
            headers.join(','),
            ...rows.map(r => r.map(cell => `"${cell}"`).join(','))
        ].join('\n');
        
        return csv;
    }
    
    function importFromCSV(csvText) {
        const lines = csvText.split('\n').filter(l => l.trim());
        if (lines.length < 2) return { success: false, error: 'No data found' };
        
        const headers = lines[0].split(',').map(h => h.replace(/"/g, '').trim().toLowerCase());
        let imported = 0;
        let errors = [];
        
        for (let i = 1; i < lines.length; i++) {
            const values = lines[i].split(',').map(v => v.replace(/"/g, '').trim());
            
            const data = {};
            headers.forEach((h, idx) => {
                if (h.includes('first')) data.firstName = values[idx];
                else if (h.includes('last')) data.lastName = values[idx];
                else if (h.includes('email')) data.email = values[idx];
                else if (h.includes('phone')) data.phone = values[idx];
            });
            
            if (data.firstName && data.lastName) {
                const result = create({ ...data, source: 'import' });
                if (result.success) {
                    imported++;
                } else {
                    errors.push(`Row ${i + 1}: ${result.error}`);
                }
            }
        }
        
        return { success: true, imported, errors };
    }
    
    function exportToJSON() {
        return JSON.stringify(getAll(), null, 2);
    }
    
    function importFromJSON(jsonText) {
        try {
            const data = JSON.parse(jsonText);
            if (!Array.isArray(data)) {
                return { success: false, error: 'Invalid format' };
            }
            
            const customers = getAll();
            let imported = 0;
            
            data.forEach(item => {
                if (item.firstName && item.lastName) {
                    const existing = getByEmail(item.email);
                    if (!existing) {
                        customers.push({
                            ...item,
                            id: item.id || Date.now() + imported,
                            source: 'import'
                        });
                        imported++;
                    }
                }
            });
            
            save(customers);
            return { success: true, imported };
        } catch (e) {
            return { success: false, error: 'Invalid JSON' };
        }
    }
    
    // ============ QUICK LOOKUP ============
    function findOrCreate(firstName, lastName, additionalData = {}) {
        let customer = getByName(firstName, lastName);
        
        if (!customer) {
            const result = create({
                firstName,
                lastName,
                ...additionalData
            });
            customer = result.success ? result.customer : null;
        }
        
        return customer;
    }
    
    function getDisplayName(customer) {
        return `${customer.firstName} ${customer.lastName}`;
    }
    
    function getInitials(customer) {
        return `${customer.firstName.charAt(0)}${customer.lastName.charAt(0)}`.toUpperCase();
    }
    
    // Public API
    return {
        // CRUD
        getAll,
        get,
        getByEmail,
        getByPhone,
        getByName,
        create,
        update,
        remove,
        
        // Search
        search,
        searchMembers,
        
        // Membership
        isActiveMember,
        getMemberTier,
        getMemberDiscount,
        isVIP,
        getMembers,
        getExpiredMembers,
        getMembersByTier,
        setMembership,
        cancelMembership,
        renewMembership,
        
        // Visit tracking
        recordVisit,
        recordNoShow,
        
        // History
        getBookingHistory,
        getTransactionHistory,
        
        // Analytics
        getStats,
        getTopCustomers,
        
        // Import/Export
        exportToCSV,
        importFromCSV,
        exportToJSON,
        importFromJSON,
        
        // Helpers
        findOrCreate,
        getDisplayName,
        getInitials
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveCustomers;
}
