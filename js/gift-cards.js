/**
 * Golf Cove - Gift Card System
 * Handles gift card purchases, redemptions, and balance management
 * Uses Firebase backend with localStorage cache for offline support
 */

const GolfCoveGiftCards = (function() {
    'use strict';
    
    const STORAGE_KEY = 'gc_gift_cards';
    
    // Use config for API URL
    const getApiBase = () => window.GolfCoveConfig?.stripe?.functionsUrl || 
                             'https://us-central1-golfcove-d3c46.cloudfunctions.net';
    
    let localCards = [];
    let isOnline = navigator.onLine;
    let lastSync = null;
    
    // Track online/offline
    window.addEventListener('online', () => { isOnline = true; syncWithServer(); });
    window.addEventListener('offline', () => { isOnline = false; });
    
    // ============ INITIALIZATION ============
    function init() {
        try {
            localCards = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
        } catch (e) {
            console.error('[GiftCards] Error loading from localStorage:', e);
            localCards = [];
        }
        
        // Sync with server if online
        if (isOnline) {
            syncWithServer();
        }
        
        console.log('[GiftCards] Initialized with', localCards.length, 'cards');
        return localCards;
    }
    
    function saveLocal() {
        try {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(localCards));
        } catch (e) {
            console.error('[GiftCards] Error saving to localStorage:', e);
        }
    }
    
    // ============ SERVER SYNC ============
    async function syncWithServer() {
        if (!isOnline) return;
        
        try {
            const response = await fetch(`${getApiBase()}/giftcards`);
            if (!response.ok) throw new Error('Sync failed');
            
            const data = await response.json();
            if (data.giftCards) {
                localCards = data.giftCards;
                saveLocal();
                lastSync = new Date();
                console.log('[GiftCards] Synced', localCards.length, 'cards from server');
            }
        } catch (error) {
            console.warn('[GiftCards] Sync failed, using local data:', error.message);
        }
    }
    
    // ============ DATA MANAGEMENT ============
    function getAll() {
        return localCards.length > 0 ? localCards : JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
    }
    
    function save(cards) {
        localCards = cards;
        saveLocal();
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
    async function create(data) {
        // Validate
        if (!data.amount || data.amount <= 0) {
            return { success: false, error: 'Invalid amount' };
        }
        
        const card = {
            id: 'GC-' + Date.now(),
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
        
        // Add to local immediately
        localCards.push(card);
        saveLocal();
        
        // Sync to Firebase
        if (isOnline) {
            try {
                const response = await fetch(`${getApiBase()}/giftcards`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'create',
                        ...card
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    if (result.giftCard?.id) {
                        // Update with server ID
                        const idx = localCards.findIndex(c => c.code === card.code);
                        if (idx !== -1) {
                            localCards[idx] = { ...localCards[idx], ...result.giftCard };
                            saveLocal();
                        }
                    }
                }
            } catch (error) {
                console.warn('[GiftCards] Failed to sync new card to server:', error);
            }
        }
        
        return { success: true, card };
    }
    
    function getDefaultExpiry() {
        const expiry = new Date();
        expiry.setFullYear(expiry.getFullYear() + 2); // 2 year expiry
        return expiry.toISOString();
    }
    
    // ============ BALANCE OPERATIONS ============
    async function checkBalance(code) {
        // Try server first if online
        if (isOnline) {
            try {
                const response = await fetch(`${getApiBase()}/giftcards?code=${encodeURIComponent(code)}`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.giftCard) {
                        return {
                            success: true,
                            balance: data.giftCard.balance,
                            initialAmount: data.giftCard.initialAmount,
                            expiresAt: data.giftCard.expiresAt,
                            card: data.giftCard
                        };
                    }
                }
            } catch (error) {
                console.warn('[GiftCards] Server check failed, using local:', error);
            }
        }
        
        // Fall back to local
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
    
    async function redeem(code, amount, description = 'Redemption') {
        // Try server first if online
        if (isOnline) {
            try {
                const response = await fetch(`${getApiBase()}/giftcards`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'redeem',
                        code: code,
                        amount: amount,
                        description: description
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    
                    // Update local cache
                    if (result.giftCard) {
                        const idx = localCards.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
                        if (idx !== -1) {
                            localCards[idx] = result.giftCard;
                            saveLocal();
                        }
                    }
                    
                    return {
                        success: true,
                        amountRedeemed: amount,
                        remainingBalance: result.giftCard?.balance ?? result.remainingBalance,
                        card: result.giftCard
                    };
                } else {
                    const error = await response.json();
                    return { success: false, error: error.message || 'Redemption failed' };
                }
            } catch (error) {
                console.warn('[GiftCards] Server redeem failed, using local:', error);
            }
        }
        
        // Fall back to local
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
            date: new Date().toISOString(),
            pendingSync: true // Mark for later sync
        };
        
        card.balance -= amount;
        card.transactions = card.transactions || [];
        card.transactions.push(transaction);
        
        save(cards);
        
        return {
            success: true,
            amountRedeemed: amount,
            remainingBalance: card.balance,
            card
        };
    }
    
    async function addBalance(code, amount, description = 'Balance added') {
        // Try server first if online
        if (isOnline) {
            try {
                const response = await fetch(`${getApiBase()}/giftcards`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'reload',
                        code: code,
                        amount: amount,
                        description: description
                    })
                });
                
                if (response.ok) {
                    const result = await response.json();
                    
                    // Update local cache
                    if (result.giftCard) {
                        const idx = localCards.findIndex(c => c.code.toUpperCase() === code.toUpperCase());
                        if (idx !== -1) {
                            localCards[idx] = result.giftCard;
                            saveLocal();
                        }
                    }
                    
                    return {
                        success: true,
                        newBalance: result.giftCard?.balance ?? result.newBalance,
                        card: result.giftCard
                    };
                }
            } catch (error) {
                console.warn('[GiftCards] Server reload failed, using local:', error);
            }
        }
        
        // Fall back to local
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
            date: new Date().toISOString(),
            pendingSync: true
        };
        
        card.balance += amount;
        card.transactions = card.transactions || [];
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
        
        // Sync to server
        if (isOnline) {
            fetch(`${getApiBase()}/giftcards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'deactivate', code, reason })
            }).catch(e => console.warn('[GiftCards] Failed to sync deactivation:', e));
        }
        
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
        
        // Sync to server
        if (isOnline) {
            fetch(`${getApiBase()}/giftcards`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action: 'reactivate', code })
            }).catch(e => console.warn('[GiftCards] Failed to sync reactivation:', e));
        }
        
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
        
        const totalIssued = cards.reduce((sum, c) => sum + (c.initialAmount || 0), 0);
        const totalRedeemed = cards.reduce((sum, c) => sum + ((c.initialAmount || 0) - (c.balance || 0)), 0);
        const outstandingBalance = cards.reduce((sum, c) => sum + (c.balance || 0), 0);
        
        return {
            totalCards: cards.length,
            activeCards: active.length,
            totalIssued,
            totalRedeemed,
            outstandingBalance,
            averageBalance: active.length > 0 ? outstandingBalance / active.length : 0,
            expiringSoon: getExpiringSoon().length,
            expired: getExpired().length,
            zeroBalance: getZeroBalance().length,
            lastSync: lastSync
        };
    }
    
    function getRecentTransactions(limit = 20) {
        const cards = getAll();
        const allTransactions = [];
        
        cards.forEach(card => {
            (card.transactions || []).forEach(t => {
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
    
    // Initialize on load
    init();
    
    // Public API
    return {
        // Init
        init,
        syncWithServer,
        
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
