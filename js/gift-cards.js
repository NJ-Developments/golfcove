/**
 * Golf Cove - Gift Card System
 * Handles gift card purchases, redemptions, and balance management
 */

const GolfCoveGiftCards = (function() {
    'use strict';
    
    const STORAGE_KEY = 'gc_gift_cards';
    
    // ============ DATA MANAGEMENT ============
    function getAll() {
        return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }
    
    function save(cards) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(cards));
    }
    
    function get(id) {
        const cards = getAll();
        return cards.find(c => c.id === id);
    }
    
    function getByCode(code) {
        const cards = getAll();
        return cards.find(c => c.code.toUpperCase() === code.toUpperCase());
    }
    
    // ============ CODE GENERATION ============
    function generateCode() {
        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No confusing chars
        let code = 'GC-';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        code += '-';
        for (let i = 0; i < 4; i++) {
            code += chars.charAt(Math.floor(Math.random() * chars.length));
        }
        
        // Make sure it's unique
        if (getByCode(code)) {
            return generateCode();
        }
        
        return code;
    }
    
    // ============ CRUD OPERATIONS ============
    function create(data) {
        const cards = getAll();
        
        // Validate
        if (!data.amount || data.amount <= 0) {
            return { success: false, error: 'Invalid amount' };
        }
        
        const card = {
            id: Date.now(),
            code: data.code || generateCode(),
            initialAmount: parseFloat(data.amount),
            balance: parseFloat(data.amount),
            
            // Purchase info
            purchasedBy: data.purchasedBy || 'Walk-in',
            purchasedFor: data.purchasedFor || '',
            purchaseDate: new Date().toISOString(),
            paymentMethod: data.paymentMethod || 'card',
            
            // Recipient info
            recipientName: data.recipientName || '',
            recipientEmail: data.recipientEmail || '',
            recipientPhone: data.recipientPhone || '',
            message: data.message || '',
            
            // Status
            isActive: true,
            expiresAt: data.expiresAt || getDefaultExpiry(),
            
            // Tracking
            transactions: [],
            createdAt: new Date().toISOString()
        };
        
        cards.push(card);
        save(cards);
        
        return { success: true, card };
    }
    
    function getDefaultExpiry() {
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 2); // 2 year expiry
        return expiry.toISOString();
    }
    
    // ============ BALANCE OPERATIONS ============
    function checkBalance(code) {
        const card = getByCode(code);
        
        if (!card) {
            return { success: false, error: 'Gift card not found' };
        }
        
        if (!card.isActive) {
            return { success: false, error: 'Gift card is inactive' };
        }
        
        if (new Date(card.expiresAt) < new Date()) {
            return { success: false, error: 'Gift card has expired', expired: true };
        }
        
        return {
            success: true,
            balance: card.balance,
            initialAmount: card.initialAmount,
            expiresAt: card.expiresAt,
            card
        };
    }
    
    function redeem(code, amount, description = 'Redemption') {
        const cards = getAll();
        const index = cards.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
        
        if (index === -1) {
            return { success: false, error: 'Gift card not found' };
        }
        
        const card = cards[index];
        
        if (!card.isActive) {
            return { success: false, error: 'Gift card is inactive' };
        }
        
        if (new Date(card.expiresAt) < new Date()) {
            return { success: false, error: 'Gift card has expired' };
        }
        
        if (amount > card.balance) {
            return { success: false, error: 'Insufficient balance', balance: card.balance };
        }
        
        // Record transaction
        const transaction = {
            id: Date.now(),
            type: 'redemption',
            amount: -amount,
            balanceAfter: card.balance - amount,
            description,
            date: new Date().toISOString()
        };
        
        card.balance -= amount;
        card.transactions.push(transaction);
        
        save(cards);
        
        return {
            success: true,
            amountRedeemed: amount,
            remainingBalance: card.balance,
            card
        };
    }
    
    function addBalance(code, amount, description = 'Balance added') {
        const cards = getAll();
        const index = cards.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
        
        if (index === -1) {
            return { success: false, error: 'Gift card not found' };
        }
        
        const card = cards[index];
        
        const transaction = {
            id: Date.now(),
            type: 'reload',
            amount: amount,
            balanceAfter: card.balance + amount,
            description,
            date: new Date().toISOString()
        };
        
        card.balance += amount;
        card.transactions.push(transaction);
        
        save(cards);
        
        return {
            success: true,
            newBalance: card.balance,
            card
        };
    }
    
    // ============ CARD MANAGEMENT ============
    function deactivate(code, reason = '') {
        const cards = getAll();
        const index = cards.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
        
        if (index === -1) {
            return { success: false, error: 'Gift card not found' };
        }
        
        cards[index].isActive = false;
        cards[index].deactivatedAt = new Date().toISOString();
        cards[index].deactivationReason = reason;
        
        save(cards);
        return { success: true };
    }
    
    function reactivate(code) {
        const cards = getAll();
        const index = cards.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
        
        if (index === -1) {
            return { success: false, error: 'Gift card not found' };
        }
        
        cards[index].isActive = true;
        delete cards[index].deactivatedAt;
        delete cards[index].deactivationReason;
        
        save(cards);
        return { success: true };
    }
    
    function extendExpiry(code, months = 12) {
        const cards = getAll();
        const index = cards.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
        
        if (index === -1) {
            return { success: false, error: 'Gift card not found' };
        }
        
        let expiry = new Date(cards[index].expiresAt);
        if (expiry < new Date()) {
            expiry = new Date();
        }
        expiry.setMonth(expiry.getMonth() + months);
        
        cards[index].expiresAt = expiry.toISOString();
        
        save(cards);
        return { success: true, newExpiry: expiry.toISOString() };
    }
    
    // ============ QUERIES ============
    function getActive() {
        return getAll().filter(c => c.isActive && new Date(c.expiresAt) > new Date());
    }
    
    function getExpired() {
        return getAll().filter(c => new Date(c.expiresAt) <= new Date());
    }
    
    function getInactive() {
        return getAll().filter(c => !c.isActive);
    }
    
    function getWithBalance() {
        return getActive().filter(c => c.balance > 0);
    }
    
    function getZeroBalance() {
        return getAll().filter(c => c.balance === 0);
    }
    
    function getExpiringSoon(days = 30) {
        const threshold = new Date();
        threshold.setDate(threshold.getDate() + days);
        
        return getActive().filter(c => {
            const expiry = new Date(c.expiresAt);
            return expiry <= threshold && expiry > new Date();
        });
    }
    
    // ============ ANALYTICS ============
    function getStats() {
        const cards = getAll();
        const active = getActive();
        
        const totalIssued = cards.reduce((sum, c) => sum + c.initialAmount, 0);
        const totalRedeemed = cards.reduce((sum, c) => sum + (c.initialAmount - c.balance), 0);
        const outstandingBalance = cards.reduce((sum, c) => sum + c.balance, 0);
        
        return {
            totalCards: cards.length,
            activeCards: active.length,
            totalIssued,
            totalRedeemed,
            outstandingBalance,
            averageBalance: active.length > 0 ? outstandingBalance / active.length : 0,
            expiringSoon: getExpiringSoon().length,
            expired: getExpired().length,
            zeroBalance: getZeroBalance().length
        };
    }
    
    function getRecentTransactions(limit = 20) {
        const cards = getAll();
        const allTransactions = [];
        
        cards.forEach(card => {
            card.transactions.forEach(t => {
                allTransactions.push({
                    ...t,
                    cardCode: card.code,
                    cardId: card.id
                });
            });
        });
        
        return allTransactions
            .sort((a, b) => new Date(b.date) - new Date(a.date))
            .slice(0, limit);
    }
    
    // ============ SEARCH ============
    function search(query) {
        const cards = getAll();
        const q = query.toLowerCase().trim();
        
        return cards.filter(c => 
            c.code.toLowerCase().includes(q) ||
            (c.purchasedBy || '').toLowerCase().includes(q) ||
            (c.recipientName || '').toLowerCase().includes(q) ||
            (c.recipientEmail || '').toLowerCase().includes(q)
        );
    }
    
    // ============ EMAIL NOTIFICATIONS ============
    function getEmailTemplate(card, type = 'purchase') {
        const templates = {
            purchase: {
                subject: `Your Golf Cove Gift Card - ${card.code}`,
                body: `
                    <h2>Golf Cove Gift Card</h2>
                    <p>A gift card has been purchased for you!</p>
                    <div style="background:#f5f5f5;padding:20px;border-radius:8px;text-align:center;margin:20px 0;">
                        <div style="font-size:24px;font-weight:bold;letter-spacing:2px;">${card.code}</div>
                        <div style="font-size:32px;color:#27ae60;margin-top:10px;">$${card.balance.toFixed(2)}</div>
                    </div>
                    ${card.message ? `<p><em>"${card.message}"</em></p>` : ''}
                    <p>Present this code at Golf Cove to redeem.</p>
                    <p>Expires: ${new Date(card.expiresAt).toLocaleDateString()}</p>
                `
            },
            balance: {
                subject: `Golf Cove Gift Card Balance Update`,
                body: `
                    <h2>Gift Card Balance Update</h2>
                    <p>Your gift card (${card.code}) balance has been updated.</p>
                    <div style="background:#f5f5f5;padding:20px;border-radius:8px;text-align:center;margin:20px 0;">
                        <div style="font-size:32px;color:#27ae60;">$${card.balance.toFixed(2)}</div>
                        <div style="color:#888;">Remaining Balance</div>
                    </div>
                `
            },
            expiring: {
                subject: `Your Golf Cove Gift Card is Expiring Soon`,
                body: `
                    <h2>Gift Card Expiring Soon</h2>
                    <p>Your gift card (${card.code}) will expire on ${new Date(card.expiresAt).toLocaleDateString()}.</p>
                    <p>Don't forget to use your remaining balance of $${card.balance.toFixed(2)}!</p>
                `
            }
        };
        
        return templates[type] || templates.purchase;
    }
    
    // Public API
    return {
        // CRUD
        getAll,
        get,
        getByCode,
        create,
        
        // Balance
        checkBalance,
        redeem,
        addBalance,
        
        // Management
        deactivate,
        reactivate,
        extendExpiry,
        
        // Queries
        getActive,
        getExpired,
        getInactive,
        getWithBalance,
        getZeroBalance,
        getExpiringSoon,
        
        // Analytics
        getStats,
        getRecentTransactions,
        
        // Search
        search,
        
        // Helpers
        generateCode,
        getEmailTemplate
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = GolfCoveGiftCards;
}
