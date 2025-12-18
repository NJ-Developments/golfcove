/**
 * Golf Cove - Enhanced Customer & Member Manager
 * Complete customer lifecycle with membership management, analytics, and CRM features
 */

const GolfCoveCustomerManager = (function() {
    'use strict';
    
    const Core = GolfCoveCore;
    
    // ============ MEMBERSHIP CONFIGURATION ============
    const membershipConfig = {
        tiers: {
            par: {
                name: 'Par',
                price: { monthly: 49, annual: 499 },
                discount: 0.10,
                benefits: ['10% off all purchases', 'Priority booking', 'Member events'],
                color: '#22c55e'
            },
            birdie: {
                name: 'Birdie',
                price: { monthly: 79, annual: 799 },
                discount: 0.15,
                benefits: ['15% off all purchases', 'Priority booking', 'Member events', '2 free hours/month', 'Guest passes'],
                freeHours: 2,
                color: '#3b82f6'
            },
            eagle: {
                name: 'Eagle',
                price: { monthly: 129, annual: 1299 },
                discount: 0.20,
                benefits: ['20% off all purchases', 'Priority booking', 'Member events', '5 free hours/month', 'Guest passes', 'Lounge access', 'Pro lessons discount'],
                freeHours: 5,
                loungeAccess: true,
                color: '#f59e0b'
            },
            family_par: {
                name: 'Family Par',
                price: { monthly: 89, annual: 899 },
                discount: 0.10,
                benefits: ['10% off all purchases', 'Priority booking', 'Up to 4 family members'],
                maxMembers: 4,
                color: '#22c55e'
            },
            family_birdie: {
                name: 'Family Birdie',
                price: { monthly: 139, annual: 1399 },
                discount: 0.15,
                benefits: ['15% off all purchases', 'Priority booking', 'Up to 4 family members', '4 free hours/month'],
                maxMembers: 4,
                freeHours: 4,
                color: '#3b82f6'
            },
            family_eagle: {
                name: 'Family Eagle',
                price: { monthly: 199, annual: 1999 },
                discount: 0.20,
                benefits: ['20% off all purchases', 'Priority booking', 'Up to 6 family members', '10 free hours/month', 'Lounge access'],
                maxMembers: 6,
                freeHours: 10,
                loungeAccess: true,
                color: '#f59e0b'
            }
        },
        gracePeriod: 7, // days after expiration
        renewalReminder: 14 // days before expiration
    };
    
    // ============ CUSTOMER CRUD ============
    function createCustomer(data) {
        // Validate - check if ValidationSchemas exists first
        if (typeof ValidationSchemas !== 'undefined' && ValidationSchemas.validate) {
            const validation = ValidationSchemas.validate('customer', 'create', data);
            if (!validation.success) {
                return validation;
            }
        } else {
            // Basic validation fallback
            if (!data.firstName || !data.lastName) {
                return Core.failure(Core.ErrorCodes.VALIDATION, 'First name and last name are required');
            }
        }
        
        // Check for duplicates
        const existing = findByEmail(data.email) || findByPhone(data.phone);
        if (existing) {
            return Core.failure(Core.ErrorCodes.DUPLICATE, 'Customer with this email or phone already exists');
        }
        
        const customer = {
            id: Core.generateId('cust'),
            firstName: ValidationSchemas.Sanitizers.string(data.firstName),
            lastName: ValidationSchemas.Sanitizers.string(data.lastName),
            email: ValidationSchemas.Sanitizers.email(data.email),
            phone: ValidationSchemas.Sanitizers.phone(data.phone),
            
            // Profile
            dateOfBirth: data.dateOfBirth,
            address: data.address,
            notes: data.notes,
            tags: data.tags || [],
            
            // Membership
            membership: null,
            
            // Stats
            stats: {
                totalSpent: 0,
                visitCount: 0,
                avgSpend: 0,
                lastVisit: null,
                firstVisit: null,
                noShowCount: 0,
                referralCount: 0
            },
            
            // Wallet
            wallet: {
                storeCredit: 0,
                loyaltyPoints: 0
            },
            
            // House account
            houseAccount: {
                enabled: false,
                limit: 0,
                balance: 0
            },
            
            // Marketing
            marketing: {
                emailOptIn: data.emailOptIn !== false,
                smsOptIn: data.smsOptIn || false,
                source: data.source || 'walk_in'
            },
            
            // Metadata
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            createdBy: data.employeeId
        };
        
        saveCustomer(customer);
        
        if (typeof GolfCoveSyncManager !== 'undefined') {
            GolfCoveSyncManager.create('customers', customer);
        }
        
        Core.emit('customer:created', { customer });
        
        return Core.success(customer);
    }
    
    function updateCustomer(customerId, updates) {
        const customer = getCustomer(customerId);
        
        if (!customer) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        }
        
        // Validate updates
        const validation = ValidationSchemas.validate('customer', 'update', updates);
        if (!validation.success) {
            return validation;
        }
        
        // Apply updates
        const updatedCustomer = Core.deepMerge(customer, {
            ...updates,
            updatedAt: new Date().toISOString()
        });
        
        saveCustomer(updatedCustomer);
        
        if (typeof GolfCoveSyncManager !== 'undefined') {
            GolfCoveSyncManager.update('customers', updatedCustomer);
        }
        
        Core.emit('customer:updated', { customer: updatedCustomer });
        
        return Core.success(updatedCustomer);
    }
    
    function deleteCustomer(customerId, hardDelete = false) {
        const customers = getAllCustomers();
        const index = customers.findIndex(c => c.id === customerId);
        
        if (index === -1) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        }
        
        const customer = customers[index];
        
        if (hardDelete) {
            // Permanently remove
            customers.splice(index, 1);
        } else {
            // Soft delete - mark as deleted but keep data
            customer.deleted = true;
            customer.deletedAt = new Date().toISOString();
            customers[index] = customer;
        }
        
        localStorage.setItem('gc_customers', JSON.stringify(customers));
        
        if (typeof GolfCoveSyncManager !== 'undefined') {
            if (hardDelete) {
                GolfCoveSyncManager.delete('customers', customerId);
            } else {
                GolfCoveSyncManager.update('customers', customer);
            }
        }
        
        Core.emit('customer:deleted', { customer, hardDelete });
        
        return Core.success();
    }
    
    // Restore a soft-deleted customer
    function restoreCustomer(customerId) {
        const customers = getAllCustomers();
        const customer = customers.find(c => c.id === customerId);
        
        if (!customer) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        }
        
        if (!customer.deleted) {
            return Core.failure(Core.ErrorCodes.VALIDATION, 'Customer is not deleted');
        }
        
        customer.deleted = false;
        delete customer.deletedAt;
        customer.updatedAt = new Date().toISOString();
        
        localStorage.setItem('gc_customers', JSON.stringify(customers));
        
        if (typeof GolfCoveSyncManager !== 'undefined') {
            GolfCoveSyncManager.update('customers', customer);
        }
        
        Core.emit('customer:restored', { customer });
        
        return Core.success(customer);
    }
    
    // ============ STORAGE ============
    function saveCustomer(customer) {
        const customers = getAllCustomers();
        const index = customers.findIndex(c => c.id === customer.id);
        
        if (index !== -1) {
            customers[index] = customer;
        } else {
            customers.push(customer);
        }
        
        localStorage.setItem('gc_customers', JSON.stringify(customers));
    }
    
    function getAllCustomers() {
        return JSON.parse(localStorage.getItem('gc_customers') || '[]');
    }
    
    function getCustomer(customerId) {
        return getAllCustomers().find(c => c.id === customerId);
    }
    
    function findByEmail(email) {
        if (!email) return null;
        const normalized = ValidationSchemas.Sanitizers.email(email);
        return getAllCustomers().find(c => c.email === normalized);
    }
    
    function findByPhone(phone) {
        if (!phone) return null;
        const normalized = ValidationSchemas.Sanitizers.phone(phone);
        return getAllCustomers().find(c => 
            ValidationSchemas.Sanitizers.phone(c.phone) === normalized
        );
    }
    
    // ============ SEARCH ============
    function searchCustomers(query, options = {}) {
        let customers = getAllCustomers();
        
        if (query) {
            const searchTerm = query.toLowerCase();
            customers = customers.filter(c => 
                c.firstName?.toLowerCase().includes(searchTerm) ||
                c.lastName?.toLowerCase().includes(searchTerm) ||
                c.email?.toLowerCase().includes(searchTerm) ||
                c.phone?.includes(searchTerm) ||
                `${c.firstName} ${c.lastName}`.toLowerCase().includes(searchTerm)
            );
        }
        
        // Apply filters
        if (options.hasMembership !== undefined) {
            customers = customers.filter(c => 
                options.hasMembership ? c.membership?.active : !c.membership?.active
            );
        }
        
        if (options.membershipType) {
            customers = customers.filter(c => 
                c.membership?.type === options.membershipType
            );
        }
        
        if (options.minSpend) {
            customers = customers.filter(c => c.stats.totalSpent >= options.minSpend);
        }
        
        if (options.tags && options.tags.length > 0) {
            customers = customers.filter(c => 
                options.tags.some(tag => c.tags?.includes(tag))
            );
        }
        
        // Sort
        if (options.sortBy) {
            customers.sort((a, b) => {
                let aVal, bVal;
                
                switch (options.sortBy) {
                    case 'name':
                        aVal = `${a.firstName} ${a.lastName}`;
                        bVal = `${b.firstName} ${b.lastName}`;
                        break;
                    case 'totalSpent':
                        aVal = a.stats.totalSpent;
                        bVal = b.stats.totalSpent;
                        break;
                    case 'lastVisit':
                        aVal = a.stats.lastVisit || '';
                        bVal = b.stats.lastVisit || '';
                        break;
                    case 'visitCount':
                        aVal = a.stats.visitCount;
                        bVal = b.stats.visitCount;
                        break;
                    default:
                        aVal = a[options.sortBy];
                        bVal = b[options.sortBy];
                }
                
                const modifier = options.sortDesc ? -1 : 1;
                if (aVal < bVal) return -1 * modifier;
                if (aVal > bVal) return 1 * modifier;
                return 0;
            });
        }
        
        // Pagination
        const total = customers.length;
        if (options.limit) {
            const offset = options.offset || 0;
            customers = customers.slice(offset, offset + options.limit);
        }
        
        return {
            customers,
            total,
            hasMore: options.limit ? total > (options.offset || 0) + options.limit : false
        };
    }
    
    // ============ MEMBERSHIP MANAGEMENT ============
    function createMembership(customerId, type, billing = 'monthly', paymentId = null) {
        const customer = getCustomer(customerId);
        if (!customer) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        }
        
        const tierConfig = membershipConfig.tiers[type];
        if (!tierConfig) {
            return Core.failure(Core.ErrorCodes.VALIDATION_ERROR, 'Invalid membership type');
        }
        
        const now = new Date();
        const endDate = new Date(now);
        endDate.setMonth(endDate.getMonth() + (billing === 'annual' ? 12 : 1));
        
        const membership = {
            type,
            tier: tierConfig.name,
            billing,
            active: true,
            startDate: now.toISOString(),
            endDate: endDate.toISOString(),
            renewalDate: endDate.toISOString(),
            autoRenew: true,
            price: tierConfig.price[billing],
            discount: tierConfig.discount,
            benefits: tierConfig.benefits,
            freeHoursRemaining: tierConfig.freeHours || 0,
            freeHoursUsed: 0,
            paymentId,
            history: [{
                action: 'created',
                date: now.toISOString(),
                type,
                billing,
                price: tierConfig.price[billing]
            }]
        };
        
        customer.membership = membership;
        customer.updatedAt = now.toISOString();
        
        saveCustomer(customer);
        
        if (typeof GolfCoveSyncManager !== 'undefined') {
            GolfCoveSyncManager.update('customers', customer);
        }
        
        Core.emit('membership:created', { customer, membership });
        
        return Core.success(membership);
    }
    
    function cancelMembership(customerId, reason, refund = false) {
        const customer = getCustomer(customerId);
        if (!customer?.membership) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'No active membership');
        }
        
        customer.membership.active = false;
        customer.membership.cancelledAt = new Date().toISOString();
        customer.membership.cancelReason = reason;
        customer.membership.history.push({
            action: 'cancelled',
            date: new Date().toISOString(),
            reason
        });
        
        saveCustomer(customer);
        
        if (typeof GolfCoveSyncManager !== 'undefined') {
            GolfCoveSyncManager.update('customers', customer);
        }
        
        Core.emit('membership:cancelled', { customer, reason });
        
        return Core.success(customer.membership);
    }
    
    function renewMembership(customerId, paymentId = null) {
        const customer = getCustomer(customerId);
        if (!customer?.membership) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'No membership to renew');
        }
        
        const { type, billing } = customer.membership;
        const tierConfig = membershipConfig.tiers[type];
        
        const now = new Date();
        const newEndDate = new Date(customer.membership.endDate);
        newEndDate.setMonth(newEndDate.getMonth() + (billing === 'annual' ? 12 : 1));
        
        customer.membership.endDate = newEndDate.toISOString();
        customer.membership.renewalDate = newEndDate.toISOString();
        customer.membership.active = true;
        customer.membership.freeHoursRemaining = tierConfig.freeHours || 0;
        customer.membership.paymentId = paymentId;
        customer.membership.history.push({
            action: 'renewed',
            date: now.toISOString(),
            price: tierConfig.price[billing]
        });
        
        saveCustomer(customer);
        
        Core.emit('membership:renewed', { customer });
        
        return Core.success(customer.membership);
    }
    
    function upgradeMembership(customerId, newType, paymentId = null) {
        const customer = getCustomer(customerId);
        if (!customer?.membership) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'No membership to upgrade');
        }
        
        const newTier = membershipConfig.tiers[newType];
        if (!newTier) {
            return Core.failure(Core.ErrorCodes.VALIDATION_ERROR, 'Invalid membership type');
        }
        
        const oldType = customer.membership.type;
        customer.membership.type = newType;
        customer.membership.tier = newTier.name;
        customer.membership.discount = newTier.discount;
        customer.membership.benefits = newTier.benefits;
        customer.membership.price = newTier.price[customer.membership.billing];
        customer.membership.freeHoursRemaining += (newTier.freeHours || 0);
        customer.membership.paymentId = paymentId;
        customer.membership.history.push({
            action: 'upgraded',
            date: new Date().toISOString(),
            from: oldType,
            to: newType
        });
        
        saveCustomer(customer);
        
        Core.emit('membership:upgraded', { customer, from: oldType, to: newType });
        
        return Core.success(customer.membership);
    }
    
    function useFreeHours(customerId, hours) {
        const customer = getCustomer(customerId);
        if (!customer?.membership?.active) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'No active membership');
        }
        
        if (customer.membership.freeHoursRemaining < hours) {
            return Core.failure(
                Core.ErrorCodes.INSUFFICIENT_FUNDS,
                `Only ${customer.membership.freeHoursRemaining} free hours available`
            );
        }
        
        customer.membership.freeHoursRemaining -= hours;
        customer.membership.freeHoursUsed += hours;
        
        saveCustomer(customer);
        
        return Core.success({
            used: hours,
            remaining: customer.membership.freeHoursRemaining
        });
    }
    
    function getExpiringMemberships(days = 14) {
        const cutoffDate = new Date();
        cutoffDate.setDate(cutoffDate.getDate() + days);
        const cutoffStr = cutoffDate.toISOString();
        
        return getAllCustomers().filter(c => 
            c.membership?.active && 
            c.membership.endDate <= cutoffStr &&
            c.membership.endDate > new Date().toISOString()
        );
    }
    
    // ============ CUSTOMER STATS ============
    function recordPurchase(customerId, purchase) {
        const customer = getCustomer(customerId);
        if (!customer) return;
        
        customer.stats.totalSpent += purchase.amount;
        customer.stats.visitCount++;
        customer.stats.lastVisit = purchase.date;
        customer.stats.avgSpend = customer.stats.totalSpent / customer.stats.visitCount;
        
        if (!customer.stats.firstVisit) {
            customer.stats.firstVisit = purchase.date;
        }
        
        // Award loyalty points (1 point per dollar)
        customer.wallet.loyaltyPoints += Math.floor(purchase.amount);
        
        saveCustomer(customer);
        
        Core.emit('customer:purchase', { customer, purchase });
    }
    
    function recordRefund(customerId, refund) {
        const customer = getCustomer(customerId);
        if (!customer) return;
        
        customer.stats.totalSpent -= refund.amount;
        if (customer.stats.totalSpent < 0) customer.stats.totalSpent = 0;
        
        if (customer.stats.visitCount > 0) {
            customer.stats.avgSpend = customer.stats.totalSpent / customer.stats.visitCount;
        }
        
        saveCustomer(customer);
    }
    
    function recordNoShow(customerId, bookingId) {
        const customer = getCustomer(customerId);
        if (!customer) return;
        
        customer.stats.noShowCount++;
        
        saveCustomer(customer);
        
        Core.emit('customer:noShow', { customer, bookingId });
    }
    
    // ============ WALLET OPERATIONS ============
    function addStoreCredit(customerId, amount) {
        const customer = getCustomer(customerId);
        if (!customer) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        }
        
        customer.wallet.storeCredit += amount;
        saveCustomer(customer);
        
        Core.emit('customer:creditAdded', { customer, amount });
        
        return Core.success({ balance: customer.wallet.storeCredit });
    }
    
    function useStoreCredit(customerId, amount) {
        const customer = getCustomer(customerId);
        if (!customer) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        }
        
        if (customer.wallet.storeCredit < amount) {
            return Core.failure(
                Core.ErrorCodes.INSUFFICIENT_FUNDS,
                `Only ${Core.Format.currency(customer.wallet.storeCredit)} available`
            );
        }
        
        customer.wallet.storeCredit -= amount;
        saveCustomer(customer);
        
        return Core.success({ balance: customer.wallet.storeCredit });
    }
    
    function redeemLoyaltyPoints(customerId, points) {
        const customer = getCustomer(customerId);
        if (!customer) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        }
        
        if (customer.wallet.loyaltyPoints < points) {
            return Core.failure(Core.ErrorCodes.INSUFFICIENT_FUNDS, 'Not enough points');
        }
        
        // 100 points = $1
        const creditAmount = points / 100;
        
        customer.wallet.loyaltyPoints -= points;
        customer.wallet.storeCredit += creditAmount;
        saveCustomer(customer);
        
        Core.emit('customer:pointsRedeemed', { customer, points, creditAmount });
        
        return Core.success({
            pointsUsed: points,
            creditAdded: creditAmount,
            remainingPoints: customer.wallet.loyaltyPoints
        });
    }
    
    // ============ HOUSE ACCOUNT ============
    function enableHouseAccount(customerId, limit) {
        const customer = getCustomer(customerId);
        if (!customer) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        }
        
        customer.houseAccount = {
            enabled: true,
            limit,
            balance: 0,
            enabledAt: new Date().toISOString()
        };
        
        saveCustomer(customer);
        
        return Core.success(customer.houseAccount);
    }
    
    function updateHouseAccountBalance(customerId, newBalance) {
        const customer = getCustomer(customerId);
        if (!customer?.houseAccount?.enabled) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'House account not enabled');
        }
        
        customer.houseAccount.balance = newBalance;
        saveCustomer(customer);
        
        return Core.success(customer.houseAccount);
    }
    
    function payHouseAccount(customerId, amount, paymentId) {
        const customer = getCustomer(customerId);
        if (!customer?.houseAccount?.enabled) {
            return Core.failure(Core.ErrorCodes.NOT_FOUND, 'House account not enabled');
        }
        
        const payment = Math.min(amount, customer.houseAccount.balance);
        customer.houseAccount.balance -= payment;
        
        saveCustomer(customer);
        
        Core.emit('customer:houseAccountPayment', { customer, payment, paymentId });
        
        return Core.success({
            paid: payment,
            remainingBalance: customer.houseAccount.balance
        });
    }
    
    // ============ ANALYTICS ============
    function getCustomerAnalytics() {
        const customers = getAllCustomers();
        const now = new Date();
        const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
        
        return {
            total: customers.length,
            activeMembers: customers.filter(c => c.membership?.active).length,
            newThisMonth: customers.filter(c => new Date(c.createdAt) >= thirtyDaysAgo).length,
            
            // Spending stats
            totalRevenue: customers.reduce((sum, c) => sum + (c.stats.totalSpent || 0), 0),
            avgCustomerValue: customers.length > 0 
                ? customers.reduce((sum, c) => sum + (c.stats.totalSpent || 0), 0) / customers.length 
                : 0,
            topSpenders: customers
                .filter(c => c.stats.totalSpent > 0)
                .sort((a, b) => b.stats.totalSpent - a.stats.totalSpent)
                .slice(0, 10),
            
            // Visit stats
            totalVisits: customers.reduce((sum, c) => sum + (c.stats.visitCount || 0), 0),
            avgVisitsPerCustomer: customers.length > 0
                ? customers.reduce((sum, c) => sum + (c.stats.visitCount || 0), 0) / customers.length
                : 0,
            frequentVisitors: customers
                .filter(c => c.stats.visitCount > 0)
                .sort((a, b) => b.stats.visitCount - a.stats.visitCount)
                .slice(0, 10),
            
            // Membership breakdown
            membershipBreakdown: Object.fromEntries(
                Object.keys(membershipConfig.tiers).map(tier => [
                    tier,
                    customers.filter(c => c.membership?.type === tier && c.membership?.active).length
                ])
            ),
            
            // At risk
            noShowRisk: customers.filter(c => c.stats.noShowCount >= 3),
            expiringMemberships: getExpiringMemberships(14)
        };
    }
    
    function getVIPCustomers() {
        return getAllCustomers()
            .filter(c => c.membership?.active)
            .sort((a, b) => b.stats.totalSpent - a.stats.totalSpent)
            .slice(0, 20);
    }
    
    function getRecentCustomers(limit = 10) {
        return getAllCustomers()
            .filter(c => c.stats.lastVisit)
            .sort((a, b) => b.stats.lastVisit.localeCompare(a.stats.lastVisit))
            .slice(0, limit);
    }
    
    // ============ TAGS ============
    function addTag(customerId, tag) {
        const customer = getCustomer(customerId);
        if (!customer) return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        
        if (!customer.tags) customer.tags = [];
        if (!customer.tags.includes(tag)) {
            customer.tags.push(tag);
            saveCustomer(customer);
        }
        
        return Core.success(customer.tags);
    }
    
    function removeTag(customerId, tag) {
        const customer = getCustomer(customerId);
        if (!customer) return Core.failure(Core.ErrorCodes.NOT_FOUND, 'Customer not found');
        
        if (customer.tags) {
            customer.tags = customer.tags.filter(t => t !== tag);
            saveCustomer(customer);
        }
        
        return Core.success(customer.tags);
    }
    
    function getAllTags() {
        const tags = new Set();
        getAllCustomers().forEach(c => {
            (c.tags || []).forEach(tag => tags.add(tag));
        });
        return Array.from(tags).sort();
    }
    
    // ============ STRIPE INTEGRATION ============
    
    /**
     * Get the Stripe Functions URL from config
     */
    function getStripeUrl() {
        return window.GolfCoveConfig?.stripe?.functionsUrl || 
               'https://us-central1-golfcove.cloudfunctions.net';
    }
    
    /**
     * Sync customer to Stripe - creates or updates Stripe Customer
     * Returns the stripeCustomerId
     */
    async function syncToStripe(customerId) {
        const customer = getCustomer(customerId);
        if (!customer) {
            return { success: false, error: 'Customer not found' };
        }
        
        try {
            const response = await fetch(`${getStripeUrl()}/createStripeCustomer`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: customer.id.toString(),
                    email: customer.email,
                    name: `${customer.firstName} ${customer.lastName}`,
                    phone: customer.phone,
                    metadata: {
                        localId: customer.id,
                        membershipTier: customer.membership?.tier || null
                    }
                })
            });
            
            const data = await response.json();
            if (data.error) throw new Error(data.error);
            
            // Save the Stripe customer ID locally
            if (data.stripeCustomerId && data.stripeCustomerId !== customer.stripeCustomerId) {
                customer.stripeCustomerId = data.stripeCustomerId;
                customer.updatedAt = new Date().toISOString();
                saveCustomer(customer);
                
                Core.emit('customer:stripe-synced', { customer, stripeCustomerId: data.stripeCustomerId });
            }
            
            return { success: true, stripeCustomerId: data.stripeCustomerId };
        } catch (error) {
            console.error('Failed to sync customer to Stripe:', error);
            return { success: false, error: error.message };
        }
    }
    
    /**
     * Get or create Stripe customer ID for a local customer
     * Used by payment flows to ensure customer exists in Stripe
     */
    async function getStripeCustomerId(customerId) {
        const customer = getCustomer(customerId);
        if (!customer) return null;
        
        // If already synced, return existing ID
        if (customer.stripeCustomerId) {
            return customer.stripeCustomerId;
        }
        
        // Otherwise sync to Stripe
        const result = await syncToStripe(customerId);
        return result.success ? result.stripeCustomerId : null;
    }
    
    /**
     * Find local customer by Stripe customer ID
     */
    function findByStripeId(stripeCustomerId) {
        return getAllCustomers().find(c => c.stripeCustomerId === stripeCustomerId);
    }
    
    // ============ PUBLIC API ============
    return {
        // Config
        membershipConfig,
        
        // CRUD
        createCustomer,
        updateCustomer,
        deleteCustomer,
        restoreCustomer,
        getCustomer,
        getAllCustomers,
        findByEmail,
        findByPhone,
        
        // Search
        searchCustomers,
        getVIPCustomers,
        getRecentCustomers,
        
        // Membership
        createMembership,
        cancelMembership,
        renewMembership,
        upgradeMembership,
        useFreeHours,
        getExpiringMemberships,
        
        // Stats
        recordPurchase,
        recordRefund,
        recordNoShow,
        
        // Wallet
        addStoreCredit,
        useStoreCredit,
        redeemLoyaltyPoints,
        
        // House account
        enableHouseAccount,
        updateHouseAccountBalance,
        payHouseAccount,
        
        // Tags
        addTag,
        removeTag,
        getAllTags,
        
        // Analytics
        getCustomerAnalytics,
        
        // Stripe Integration
        syncToStripe,
        getStripeCustomerId,
        findByStripeId
    };
})();

// Make available globally
if (typeof window !== 'undefined') {
    window.GolfCoveCustomerManager = GolfCoveCustomerManager;
}
