/**
 * Golf Cove - Promotions & Discounts System
 * Manages promo codes, happy hours, and special offers
 */

const GolfCovePromotions = (function() {
    'use strict';
    
    const STORAGE_KEY = 'gc_promotions';
    const USAGE_KEY = 'gc_promo_usage';
    
    // Promotion types
    const PROMO_TYPES = {
        percentage: 'Percentage Off',
        fixed: 'Fixed Amount Off',
        bogo: 'Buy One Get One',
        freeItem: 'Free Item',
        bundle: 'Bundle Deal',
        happyHour: 'Happy Hour'
    };
    
    // ============ DATA ACCESS ============
    function getPromotions() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }
    
    function savePromotions(promos) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(promos));
    }
    
    function getUsage() {
        return JSON.parse(localStorage.getItem(USAGE_KEY) || '[]');
    }
    
    function saveUsage(usage) {
        localStorage.setItem(USAGE_KEY, JSON.stringify(usage));
    }
    
    // ============ PROMOTION CRUD ============
    function create(data) {
        const promos = getPromotions();
        
        // Check for duplicate code
        if (data.code && promos.some(p => p.code === data.code.toUpperCase() && p.isActive)) {
            throw new Error('Promo code already exists');
        }
        
        const promo = {
            id: 'PROMO-' + Date.now().toString(36).toUpperCase(),
            name: data.name,
            description: data.description || '',
            code: data.code ? data.code.toUpperCase() : null,
            type: data.type || 'percentage',
            value: data.value || 0, // Percentage or fixed amount
            minPurchase: data.minPurchase || 0,
            maxDiscount: data.maxDiscount || null,
            applicableTo: data.applicableTo || 'all', // all, category, item, booking
            applicableItems: data.applicableItems || [], // Category names or item IDs
            startDate: data.startDate || new Date().toISOString(),
            endDate: data.endDate || null,
            usageLimit: data.usageLimit || null, // Total uses allowed
            usagePerCustomer: data.usagePerCustomer || null,
            memberOnly: data.memberOnly || false,
            memberTiers: data.memberTiers || [], // Empty = all tiers
            stackable: data.stackable || false,
            autoApply: data.autoApply || false, // Auto-apply without code
            usageCount: 0,
            isActive: true,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        
        promos.push(promo);
        savePromotions(promos);
        
        return promo;
    }
    
    function update(id, updates) {
        const promos = getPromotions();
        const index = promos.findIndex(p => p.id === id);
        
        if (index === -1) return null;
        
        // Check for duplicate code if changing
        if (updates.code && updates.code !== promos[index].code) {
            const code = updates.code.toUpperCase();
            if (promos.some(p => p.code === code && p.isActive && p.id !== id)) {
                throw new Error('Promo code already exists');
            }
            updates.code = code;
        }
        
        promos[index] = {
            ...promos[index],
            ...updates,
            updatedAt: new Date().toISOString()
        };
        
        savePromotions(promos);
        return promos[index];
    }
    
    function get(id) {
        return getPromotions().find(p => p.id === id);
    }
    
    function getByCode(code) {
        return getPromotions().find(p => 
            p.code === code.toUpperCase() && p.isActive
        );
    }
    
    function getAll() {
        return getPromotions().filter(p => p.isActive);
    }
    
    function deactivate(id) {
        return update(id, { isActive: false });
    }
    
    // ============ VALIDATION ============
    function isValid(promo, context = {}) {
        const now = new Date();
        
        // Check active
        if (!promo.isActive) {
            return { valid: false, reason: 'Promotion is no longer active' };
        }
        
        // Check date range
        if (promo.startDate && new Date(promo.startDate) > now) {
            return { valid: false, reason: 'Promotion has not started yet' };
        }
        if (promo.endDate && new Date(promo.endDate) < now) {
            return { valid: false, reason: 'Promotion has expired' };
        }
        
        // Check usage limit
        if (promo.usageLimit && promo.usageCount >= promo.usageLimit) {
            return { valid: false, reason: 'Promotion usage limit reached' };
        }
        
        // Check customer usage
        if (promo.usagePerCustomer && context.customerId) {
            const customerUsage = getUsage().filter(u => 
                u.promoId === promo.id && u.customerId === context.customerId
            ).length;
            
            if (customerUsage >= promo.usagePerCustomer) {
                return { valid: false, reason: 'You have already used this promotion' };
            }
        }
        
        // Check minimum purchase
        if (promo.minPurchase && context.subtotal < promo.minPurchase) {
            return { 
                valid: false, 
                reason: `Minimum purchase of $${promo.minPurchase.toFixed(2)} required` 
            };
        }
        
        // Check member requirement
        if (promo.memberOnly) {
            if (!context.memberType) {
                return { valid: false, reason: 'This promotion is for members only' };
            }
            if (promo.memberTiers.length > 0 && !promo.memberTiers.includes(context.memberType)) {
                return { valid: false, reason: 'This promotion is not available for your membership tier' };
            }
        }
        
        // Check applicable items
        if (promo.applicableTo !== 'all' && context.items) {
            const hasApplicable = context.items.some(item => {
                if (promo.applicableTo === 'category') {
                    return promo.applicableItems.includes(item.category);
                }
                if (promo.applicableTo === 'item') {
                    return promo.applicableItems.includes(item.id);
                }
                return false;
            });
            
            if (!hasApplicable) {
                return { valid: false, reason: 'This promotion does not apply to your items' };
            }
        }
        
        return { valid: true };
    }
    
    function validateCode(code, context = {}) {
        const promo = getByCode(code);
        
        if (!promo) {
            return { valid: false, reason: 'Invalid promo code' };
        }
        
        return isValid(promo, context);
    }
    
    // ============ CALCULATION ============
    function calculateDiscount(promo, context) {
        const validation = isValid(promo, context);
        if (!validation.valid) {
            return { discount: 0, error: validation.reason };
        }
        
        let discount = 0;
        const subtotal = context.subtotal || 0;
        
        switch (promo.type) {
            case 'percentage':
                discount = subtotal * (promo.value / 100);
                break;
                
            case 'fixed':
                discount = promo.value;
                break;
                
            case 'bogo':
                // Find cheapest applicable item
                if (context.items && context.items.length >= 2) {
                    const applicableItems = getApplicableItems(promo, context.items);
                    if (applicableItems.length >= 2) {
                        const sorted = [...applicableItems].sort((a, b) => a.price - b.price);
                        discount = sorted[0].price; // Free cheapest item
                    }
                }
                break;
                
            case 'freeItem':
                // Discount equals the free item value (handled separately)
                discount = promo.value;
                break;
                
            case 'bundle':
                // Bundle deals have preset discount
                discount = promo.value;
                break;
                
            case 'happyHour':
                // Time-based percentage
                discount = subtotal * (promo.value / 100);
                break;
        }
        
        // Apply max discount cap
        if (promo.maxDiscount && discount > promo.maxDiscount) {
            discount = promo.maxDiscount;
        }
        
        // Don't exceed subtotal
        if (discount > subtotal) {
            discount = subtotal;
        }
        
        return {
            discount: Math.round(discount * 100) / 100,
            promo: promo.name,
            type: promo.type
        };
    }
    
    function getApplicableItems(promo, items) {
        if (promo.applicableTo === 'all') return items;
        
        return items.filter(item => {
            if (promo.applicableTo === 'category') {
                return promo.applicableItems.includes(item.category);
            }
            if (promo.applicableTo === 'item') {
                return promo.applicableItems.includes(item.id);
            }
            return false;
        });
    }
    
    // ============ APPLY & TRACK ============
    function apply(promoId, context) {
        const promo = get(promoId);
        if (!promo) return null;
        
        const result = calculateDiscount(promo, context);
        
        if (result.error) {
            return { success: false, error: result.error };
        }
        
        // Record usage
        recordUsage(promo.id, context.customerId, result.discount, context.transactionId);
        
        // Increment usage count
        update(promo.id, { usageCount: promo.usageCount + 1 });
        
        return {
            success: true,
            discount: result.discount,
            promoName: promo.name,
            promoCode: promo.code
        };
    }
    
    function applyCode(code, context) {
        const promo = getByCode(code);
        if (!promo) {
            return { success: false, error: 'Invalid promo code' };
        }
        
        return apply(promo.id, context);
    }
    
    function recordUsage(promoId, customerId, discount, transactionId) {
        const usage = getUsage();
        
        usage.push({
            id: 'PU-' + Date.now().toString(36).toUpperCase(),
            promoId,
            customerId: customerId || null,
            transactionId: transactionId || null,
            discount,
            timestamp: new Date().toISOString()
        });
        
        saveUsage(usage);
    }
    
    // ============ AUTO-APPLY PROMOTIONS ============
    function getAutoApplyPromotions(context) {
        const activePromos = getActive();
        const autoApply = activePromos.filter(p => p.autoApply);
        
        return autoApply
            .filter(p => isValid(p, context).valid)
            .map(p => ({
                ...p,
                calculatedDiscount: calculateDiscount(p, context).discount
            }))
            .filter(p => p.calculatedDiscount > 0)
            .sort((a, b) => b.calculatedDiscount - a.calculatedDiscount);
    }
    
    function getBestAutoPromotion(context) {
        const promos = getAutoApplyPromotions(context);
        return promos[0] || null;
    }
    
    // ============ HAPPY HOURS ============
    function createHappyHour(data) {
        return create({
            name: data.name || 'Happy Hour',
            description: data.description,
            type: 'happyHour',
            value: data.discountPercent || 20,
            startDate: data.startDate,
            endDate: data.endDate,
            applicableTo: data.applicableTo || 'category',
            applicableItems: data.categories || ['beer', 'wine', 'cocktails'],
            autoApply: true,
            happyHourTimes: data.times || [
                { dayOfWeek: [1, 2, 3, 4, 5], startTime: '16:00', endTime: '18:00' }
            ]
        });
    }
    
    function isHappyHour() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const currentTime = now.toTimeString().slice(0, 5);
        
        const happyHours = getActive().filter(p => 
            p.type === 'happyHour' && p.happyHourTimes
        );
        
        return happyHours.some(hh => 
            hh.happyHourTimes.some(time =>
                time.dayOfWeek.includes(dayOfWeek) &&
                currentTime >= time.startTime &&
                currentTime <= time.endTime
            )
        );
    }
    
    function getActiveHappyHour() {
        const now = new Date();
        const dayOfWeek = now.getDay();
        const currentTime = now.toTimeString().slice(0, 5);
        
        return getActive().find(hh => 
            hh.type === 'happyHour' && 
            hh.happyHourTimes?.some(time =>
                time.dayOfWeek.includes(dayOfWeek) &&
                currentTime >= time.startTime &&
                currentTime <= time.endTime
            )
        );
    }
    
    // ============ QUERIES ============
    function getActive() {
        const now = new Date();
        return getAll().filter(p => {
            if (p.startDate && new Date(p.startDate) > now) return false;
            if (p.endDate && new Date(p.endDate) < now) return false;
            if (p.usageLimit && p.usageCount >= p.usageLimit) return false;
            return true;
        });
    }
    
    function getExpired() {
        const now = new Date();
        return getAll().filter(p => p.endDate && new Date(p.endDate) < now);
    }
    
    function getUpcoming() {
        const now = new Date();
        return getAll().filter(p => p.startDate && new Date(p.startDate) > now);
    }
    
    function getMemberPromotions(memberTier = null) {
        return getActive().filter(p => {
            if (!p.memberOnly) return true;
            if (!memberTier) return false;
            if (p.memberTiers.length === 0) return true;
            return p.memberTiers.includes(memberTier);
        });
    }
    
    // ============ REPORTS ============
    function getUsageReport(startDate, endDate) {
        const usage = getUsage().filter(u => 
            u.timestamp >= startDate && u.timestamp <= endDate
        );
        
        // By promotion
        const byPromo = {};
        usage.forEach(u => {
            if (!byPromo[u.promoId]) {
                const promo = get(u.promoId);
                byPromo[u.promoId] = {
                    promo: promo?.name || 'Unknown',
                    code: promo?.code || '',
                    uses: 0,
                    totalDiscount: 0
                };
            }
            byPromo[u.promoId].uses++;
            byPromo[u.promoId].totalDiscount += u.discount;
        });
        
        return {
            period: { startDate, endDate },
            totalUses: usage.length,
            totalDiscount: usage.reduce((sum, u) => sum + u.discount, 0),
            byPromotion: Object.values(byPromo).sort((a, b) => b.totalDiscount - a.totalDiscount),
            recentUsage: usage.slice(-20).reverse()
        };
    }
    
    // ============ SEED DATA ============
    function seedDefaultPromotions() {
        const existing = getPromotions();
        if (existing.length > 0) return existing;
        
        const defaults = [
            {
                name: 'New Customer Discount',
                code: 'WELCOME10',
                type: 'percentage',
                value: 10,
                description: '10% off your first order',
                usagePerCustomer: 1
            },
            {
                name: 'Member Monday',
                code: 'MEMBER15',
                type: 'percentage',
                value: 15,
                description: '15% off for members on Mondays',
                memberOnly: true
            },
            {
                name: 'Happy Hour',
                type: 'happyHour',
                value: 20,
                description: '20% off drinks 4-6pm weekdays',
                applicableTo: 'category',
                applicableItems: ['beer', 'wine', 'cocktails'],
                autoApply: true,
                happyHourTimes: [
                    { dayOfWeek: [1, 2, 3, 4, 5], startTime: '16:00', endTime: '18:00' }
                ]
            }
        ];
        
        return defaults.map(p => create(p));
    }
    
    // Public API
    return {
        // CRUD
        create,
        update,
        get,
        getByCode,
        getAll,
        deactivate,
        PROMO_TYPES,
        
        // Validation
        isValid,
        validateCode,
        
        // Calculation
        calculateDiscount,
        
        // Apply
        apply,
        applyCode,
        
        // Auto-apply
        getAutoApplyPromotions,
        getBestAutoPromotion,
        
        // Happy Hour
        createHappyHour,
        isHappyHour,
        getActiveHappyHour,
        
        // Queries
        getActive,
        getExpired,
        getUpcoming,
        getMemberPromotions,
        
        // Reports
        getUsageReport,
        
        // Setup
        seedDefaultPromotions
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCovePromotions;
}
