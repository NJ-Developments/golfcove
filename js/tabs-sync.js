// ============================================================
// GOLF COVE - TABS SYNC MODULE
// Real-time tab synchronization across all POS terminals
// Uses Firebase Realtime Database with localStorage fallback
// ============================================================

const TabsSync = (function() {
    'use strict';
    
    // Firebase Config
    const firebaseConfig = {
        apiKey: "AIzaSyB8SH5Eh7OhIFLUkL2hjZS23uXkCsDJXGc",
        authDomain: "golfcove.firebaseapp.com",
        databaseURL: "https://golfcove-default-rtdb.firebaseio.com",
        projectId: "golfcove",
        storageBucket: "golfcove.firebasestorage.app",
        messagingSenderId: "284762891644",
        appId: "1:284762891644:web:424223b102f08a230f70f9"
    };
    
    const LOCAL_KEY = 'gc_tabs';
    
    let localTabs = [];
    let listeners = [];
    let db = null;
    let tabsRef = null;
    let isFirebaseReady = false;
    
    // ============ INITIALIZATION ============
    function init() {
        // Load from localStorage first (immediate)
        loadLocal();
        
        // Initialize Firebase if not already done
        try {
            if (typeof firebase !== 'undefined') {
                // Check if Firebase already initialized
                if (!firebase.apps.length) {
                    firebase.initializeApp(firebaseConfig);
                }
                db = firebase.database();
                tabsRef = db.ref('tabs/golfcove');
                isFirebaseReady = true;
                
                // Listen for real-time updates
                tabsRef.on('value', (snapshot) => {
                    const data = snapshot.val();
                    if (data) {
                        const serverTabs = Object.entries(data)
                            .map(([id, tab]) => ({ ...tab, id }))
                            .filter(t => t.status === 'open');
                        
                        // Merge with local tabs
                        localTabs = serverTabs;
                        saveLocal();
                        notifyListeners('sync', localTabs);
                        console.log('[TabsSync] Synced', localTabs.length, 'tabs from Firebase');
                    } else {
                        // No tabs in Firebase, keep local tabs
                        console.log('[TabsSync] No tabs in Firebase, using local');
                    }
                }, (error) => {
                    console.warn('[TabsSync] Firebase listener error:', error.message);
                });
                
                console.log('[TabsSync] Firebase connected');
            } else {
                console.warn('[TabsSync] Firebase not available, using localStorage only');
            }
        } catch (e) {
            console.warn('[TabsSync] Firebase init failed:', e.message);
        }
        
        console.log('[TabsSync] Initialized with', localTabs.length, 'tabs');
        return localTabs;
    }
    
    // ============ LOCAL STORAGE ============
    function loadLocal() {
        try {
            const stored = localStorage.getItem(LOCAL_KEY);
            localTabs = stored ? JSON.parse(stored) : [];
            localTabs = localTabs.map(normalizeTab).filter(t => t !== null && t.status === 'open');
        } catch (e) {
            console.error('[TabsSync] Error loading tabs:', e);
            localTabs = [];
        }
    }
    
    function saveLocal() {
        try {
            localStorage.setItem(LOCAL_KEY, JSON.stringify(localTabs));
        } catch (e) {
            console.error('[TabsSync] Error saving tabs:', e);
        }
    }
    
    // ============ NORMALIZE TAB ============
    function normalizeTab(tab) {
        if (!tab || !tab.id) return null;
        
        return {
            id: tab.id,
            customer: tab.customer || tab.name || 'Guest',
            customerId: tab.customerId || null,
            stripeCustomerId: tab.stripeCustomerId || null,
            items: Array.isArray(tab.items) ? tab.items : [],
            subtotal: parseFloat(tab.subtotal) || 0,
            tax: parseFloat(tab.tax) || 0,
            total: parseFloat(tab.total) || parseFloat(tab.amount) || 0,
            status: tab.status || 'open',
            isMember: !!tab.isMember,
            isLeague: !!tab.isLeague,
            memberType: tab.memberType || null,
            memberDiscount: parseFloat(tab.memberDiscount) || 0,
            openedAt: tab.openedAt || tab.createdAt || new Date().toISOString(),
            openedBy: tab.openedBy || tab.employee || 'Staff',
            updatedAt: tab.updatedAt || new Date().toISOString(),
            notes: tab.notes || null
        };
    }
    
    // ============ LISTENERS ============
    function addListener(callback) {
        if (typeof callback === 'function') {
            listeners.push(callback);
        }
    }
    
    function removeListener(callback) {
        listeners = listeners.filter(l => l !== callback);
    }
    
    function notifyListeners(action, data) {
        listeners.forEach(l => {
            try { l(action, data); } catch (e) { console.error('Listener error:', e); }
        });
    }
    
    // ============ TAB OPERATIONS ============
    async function createTab(customerName, customerId = null, items = [], employeeName = 'Staff', options = {}) {
        const tabId = 'TAB-' + Date.now();
        const itemsTotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
        const taxRate = window.GolfCoveConfig?.pricing?.taxRate ?? 0.0635;
        
        const newTab = {
            id: tabId,
            customerId: customerId,
            customer: customerName || 'Guest',
            stripeCustomerId: options.stripeCustomerId || null,
            isMember: options.isMember || false,
            isLeague: options.isLeague || false,
            memberType: options.memberType || null,
            memberDiscount: options.memberDiscount || 0,
            items: items.map(item => ({
                ...item,
                addedAt: new Date().toISOString(),
                addedBy: employeeName
            })),
            subtotal: itemsTotal,
            tax: itemsTotal * taxRate,
            total: itemsTotal * (1 + taxRate),
            status: 'open',
            openedAt: new Date().toISOString(),
            openedBy: employeeName,
            updatedAt: new Date().toISOString(),
            notes: options.notes || null
        };
        
        // Add to local immediately
        localTabs.push(newTab);
        saveLocal();
        notifyListeners('create', newTab);
        
        // Push to Firebase
        if (isFirebaseReady && tabsRef) {
            try {
                await tabsRef.child(tabId).set(newTab);
                console.log('[TabsSync] Tab saved to Firebase:', tabId);
            } catch (e) {
                console.warn('[TabsSync] Failed to save to Firebase:', e.message);
            }
        }
        
        return newTab;
    }
    
    async function addItemsToTab(tabId, items, employeeName = 'Staff') {
        const tabIndex = localTabs.findIndex(t => String(t.id) === String(tabId));
        if (tabIndex === -1) {
            console.error('[TabsSync] Tab not found:', tabId);
            return null;
        }
        
        const tab = localTabs[tabIndex];
        const taxRate = window.GolfCoveConfig?.pricing?.taxRate ?? 0.0635;
        
        // Add items
        const newItems = items.map(item => ({
            ...item,
            addedAt: new Date().toISOString(),
            addedBy: employeeName
        }));
        
        tab.items = [...(tab.items || []), ...newItems];
        tab.subtotal = tab.items.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
        tab.tax = tab.subtotal * taxRate;
        tab.total = tab.subtotal + tab.tax;
        tab.updatedAt = new Date().toISOString();
        
        saveLocal();
        notifyListeners('update', tab);
        
        // Update Firebase
        if (isFirebaseReady && tabsRef) {
            try {
                await tabsRef.child(tabId).update({
                    items: tab.items,
                    subtotal: tab.subtotal,
                    tax: tab.tax,
                    total: tab.total,
                    updatedAt: tab.updatedAt
                });
            } catch (e) {
                console.warn('[TabsSync] Failed to update Firebase:', e.message);
            }
        }
        
        return tab;
    }
    
    async function closeTab(tabId, paymentMethod = 'card', tip = 0, employeeName = 'Staff') {
        const tabIndex = localTabs.findIndex(t => String(t.id) === String(tabId));
        if (tabIndex === -1) {
            console.error('[TabsSync] Tab not found for close:', tabId);
            return null;
        }
        
        const tab = localTabs[tabIndex];
        tab.status = 'closed';
        tab.closedAt = new Date().toISOString();
        tab.closedBy = employeeName;
        tab.paymentMethod = paymentMethod;
        tab.tip = tip;
        tab.finalTotal = tab.total + tip;
        
        // Remove from local open tabs
        localTabs.splice(tabIndex, 1);
        saveLocal();
        notifyListeners('close', tab);
        
        // Update Firebase
        if (isFirebaseReady && tabsRef) {
            try {
                await tabsRef.child(tabId).update({
                    status: 'closed',
                    closedAt: tab.closedAt,
                    closedBy: tab.closedBy,
                    paymentMethod: paymentMethod,
                    tip: tip,
                    finalTotal: tab.finalTotal
                });
            } catch (e) {
                console.warn('[TabsSync] Failed to close tab in Firebase:', e.message);
            }
        }
        
        return tab;
    }
    
    async function deleteTab(tabId) {
        const tabIndex = localTabs.findIndex(t => String(t.id) === String(tabId));
        if (tabIndex !== -1) {
            localTabs.splice(tabIndex, 1);
            saveLocal();
            notifyListeners('delete', { id: tabId });
        }
        
        // Remove from Firebase
        if (isFirebaseReady && tabsRef) {
            try {
                await tabsRef.child(tabId).remove();
            } catch (e) {
                console.warn('[TabsSync] Failed to delete from Firebase:', e.message);
            }
        }
        
        return true;
    }
    
    // ============ GETTERS ============
    function getTabs() {
        return localTabs.filter(t => t.status === 'open');
    }
    
    function getTab(tabId) {
        return localTabs.find(t => String(t.id) === String(tabId)) || null;
    }
    
    function getTabByCustomer(customerName) {
        if (!customerName) return null;
        const name = customerName.toLowerCase().trim();
        return localTabs.find(t => 
            t.status === 'open' && 
            (t.customer || '').toLowerCase().trim() === name
        ) || null;
    }
    
    function getTabByCustomerId(customerId) {
        if (!customerId) return null;
        return localTabs.find(t => 
            t.status === 'open' && 
            t.customerId === customerId
        ) || null;
    }
    
    // ============ QUICK ADD ============
    async function quickAddItem(item, employeeName = 'Staff') {
        // Find first open tab or create walk-in tab
        let tab = localTabs.find(t => t.status === 'open');
        
        if (!tab) {
            return await createTab('Walk-in', null, [item], employeeName);
        }
        
        return await addItemsToTab(tab.id, [item], employeeName);
    }
    
    // Initialize on load
    init();
    
    // Public API
    return {
        init,
        getTabs,
        getTab,
        getTabByCustomer,
        getTabByCustomerId,
        createTab,
        addItemsToTab,
        closeTab,
        deleteTab,
        quickAddItem,
        addListener,
        removeListener,
        
        // Aliases for compatibility
        getOpenTabs: getTabs,
        getAllTabs: getTabs,
        onUpdate: addListener,
        get tabs() { return getTabs(); }
    };
})();

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = TabsSync;
}
