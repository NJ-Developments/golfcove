// ============================================================
// GOLF COVE - TABS SYNC MODULE
// Real-time tab synchronization across all POS terminals
// Uses Firebase backend with localStorage fallback
// ============================================================

const TabsSync = (function() {
    'use strict';
    
    const API_BASE = 'https://us-central1-golfcove.cloudfunctions.net';
    const LOCAL_KEY = 'gc_tabs';
    const SYNC_INTERVAL = 30000; // Sync every 30 seconds
    
    let localTabs = [];
    let syncTimer = null;
    let listeners = [];
    let isOnline = navigator.onLine;
    let lastSync = null;
    
    // ============ INITIALIZATION ============
    function init() {
        // Load from localStorage first (immediate)
        localTabs = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]');
        
        // Set up online/offline detection
        window.addEventListener('online', () => {
            isOnline = true;
            syncWithServer();
        });
        window.addEventListener('offline', () => {
            isOnline = false;
        });
        
        // Initial sync with server
        if (isOnline) {
            syncWithServer();
        }
        
        // Start periodic sync
        syncTimer = setInterval(() => {
            if (isOnline) syncWithServer();
        }, SYNC_INTERVAL);
        
        console.log('[TabsSync] Initialized with', localTabs.length, 'tabs');
        return localTabs;
    }
    
    // ============ SERVER SYNC ============
    async function syncWithServer() {
        try {
            const response = await fetch(`${API_BASE}/tabs?status=open`);
            if (!response.ok) throw new Error('Sync failed');
            
            const data = await response.json();
            const serverTabs = data.tabs || [];
            
            // Merge server tabs with any local-only tabs
            const localOnlyTabs = localTabs.filter(lt => 
                lt.isLocalOnly && !serverTabs.find(st => st.id === lt.id)
            );
            
            // Push local-only tabs to server
            for (const tab of localOnlyTabs) {
                await pushTabToServer(tab);
            }
            
            // Update local state with server data
            localTabs = serverTabs;
            saveLocal();
            lastSync = new Date();
            
            // Notify listeners
            notifyListeners('sync', localTabs);
            
            console.log('[TabsSync] Synced', localTabs.length, 'tabs from server');
        } catch (error) {
            console.warn('[TabsSync] Sync failed, using local data:', error.message);
        }
    }
    
    async function pushTabToServer(tab) {
        try {
            const response = await fetch(`${API_BASE}/tabs`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerId: tab.customerId,
                    customerName: tab.customer,
                    items: tab.items,
                    employeeName: tab.openedBy,
                    notes: tab.notes,
                    bayNumber: tab.bayNumber
                })
            });
            
            if (response.ok) {
                const data = await response.json();
                // Update local tab with server ID
                const idx = localTabs.findIndex(t => t.id === tab.id);
                if (idx !== -1) {
                    localTabs[idx] = { ...data.tab, isLocalOnly: false };
                    saveLocal();
                }
                return data.tab;
            }
        } catch (error) {
            console.error('[TabsSync] Failed to push tab:', error);
        }
        return null;
    }
    
    // ============ TAB OPERATIONS ============
    
    // Get all open tabs
    function getAllTabs() {
        return localTabs.filter(t => t.status === 'open' || !t.status);
    }
    
    // Get tab by ID
    function getTab(tabId) {
        return localTabs.find(t => t.id === tabId);
    }
    
    // Get tab by customer name
    function getTabByCustomer(customerName) {
        if (!customerName) return null;
        return localTabs.find(t => 
            (t.status === 'open' || !t.status) && 
            t.customer && 
            t.customer.toLowerCase() === customerName.toLowerCase()
        );
    }
    
    // Get tab by customer ID
    function getTabByCustomerId(customerId) {
        if (!customerId) return null;
        return localTabs.find(t => 
            (t.status === 'open' || !t.status) && 
            t.customerId === customerId
        );
    }
    
    // Look up customer info for member status
    function getCustomerInfo(customerName, customerId) {
        if (typeof GolfCoveCustomers === 'undefined') return null;
        
        let customer = null;
        if (customerId) {
            customer = GolfCoveCustomers.get(customerId);
        }
        if (!customer && customerName) {
            // Try to find by name
            const parts = customerName.trim().split(' ');
            if (parts.length >= 2) {
                customer = GolfCoveCustomers.getByName(parts[0], parts.slice(1).join(' '));
            }
        }
        return customer;
    }
    
    // Create new tab
    async function createTab(customerName, customerId = null, items = [], employeeName = 'Staff', options = {}) {
        const tabId = 'TAB-' + Date.now();
        const itemsTotal = items.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
        
        // Look up customer for member info
        const customer = getCustomerInfo(customerName, customerId);
        let isMember = false;
        let isVIP = false;
        let memberType = null;
        let memberDiscount = 0;
        
        if (customer && typeof GolfCoveCustomers !== 'undefined') {
            isMember = GolfCoveCustomers.isActiveMember(customer);
            isVIP = GolfCoveCustomers.isVIP(customer);
            memberType = customer.memberType;
            memberDiscount = GolfCoveCustomers.getMemberDiscount(customer);
        }
        
        const newTab = {
            id: tabId,
            customerId: customerId || (customer ? customer.id : null),
            customer: customerName || 'Guest',
            // Member info
            isMember: isMember,
            isVIP: isVIP,
            memberType: memberType,
            memberDiscount: memberDiscount,
            // Items & totals
            items: items.map(item => ({
                ...item,
                addedAt: new Date().toISOString(),
                addedBy: employeeName
            })),
            subtotal: itemsTotal,
            tax: itemsTotal * 0.0635,
            total: itemsTotal * 1.0635,
            status: 'open',
            openedAt: new Date().toISOString(),
            openedBy: employeeName,
            updatedAt: new Date().toISOString(),
            notes: options.notes || null,
            bayNumber: options.bayNumber || null,
            payments: [],
            isLocalOnly: true
        };
        
        // Add to local immediately
        localTabs.push(newTab);
        saveLocal();
        notifyListeners('create', newTab);
        
        // Sync to server
        if (isOnline) {
            const serverTab = await pushTabToServer(newTab);
            if (serverTab) {
                const idx = localTabs.findIndex(t => t.id === tabId);
                if (idx !== -1) {
                    localTabs[idx] = { ...serverTab, isLocalOnly: false };
                    saveLocal();
                }
            }
        }
        
        return newTab;
    }
    
    // Add items to tab
    async function addItemsToTab(tabId, items, employeeName = 'Staff') {
        const tab = getTab(tabId);
        if (!tab) {
            console.error('[TabsSync] Tab not found:', tabId);
            return null;
        }
        
        // Add items locally
        const newItems = items.map(item => ({
            ...item,
            addedAt: new Date().toISOString(),
            addedBy: employeeName
        }));
        
        tab.items = [...(tab.items || []), ...newItems];
        tab.subtotal = tab.items.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
        tab.tax = tab.subtotal * 0.0635;
        tab.total = tab.subtotal * 1.0635;
        tab.updatedAt = new Date().toISOString();
        tab.lastUpdatedBy = employeeName;
        
        saveLocal();
        notifyListeners('update', tab);
        
        // Sync to server
        if (isOnline && !tab.isLocalOnly) {
            try {
                await fetch(`${API_BASE}/tabs`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'addItems',
                        tabId: tabId,
                        items: items,
                        employeeName: employeeName
                    })
                });
            } catch (error) {
                console.error('[TabsSync] Failed to sync items:', error);
            }
        }
        
        return tab;
    }
    
    // Add item to customer's tab (creates tab if doesn't exist)
    async function addToCustomerTab(customerName, customerId, item, employeeName = 'Staff') {
        let tab = getTabByCustomer(customerName);
        
        if (tab) {
            return await addItemsToTab(tab.id, [item], employeeName);
        } else {
            return await createTab(customerName, customerId, [item], employeeName);
        }
    }
    
    // Remove item from tab
    async function removeItemFromTab(tabId, itemIndex, employeeName = 'Staff') {
        const tab = getTab(tabId);
        if (!tab || !tab.items || itemIndex >= tab.items.length) return null;
        
        tab.items.splice(itemIndex, 1);
        tab.subtotal = tab.items.reduce((sum, item) => sum + ((item.price || 0) * (item.qty || 1)), 0);
        tab.tax = tab.subtotal * 0.0635;
        tab.total = tab.subtotal * 1.0635;
        tab.updatedAt = new Date().toISOString();
        
        saveLocal();
        notifyListeners('update', tab);
        
        // Sync to server
        if (isOnline && !tab.isLocalOnly) {
            try {
                await fetch(`${API_BASE}/tabs?tabId=${tabId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'removeItem',
                        itemIndex: itemIndex
                    })
                });
            } catch (error) {
                console.error('[TabsSync] Failed to sync item removal:', error);
            }
        }
        
        return tab;
    }
    
    // Close tab
    async function closeTab(tabId, paymentMethod = 'card', tip = 0, employeeName = 'Staff') {
        const tab = getTab(tabId);
        if (!tab) return null;
        
        tab.status = 'closed';
        tab.closedAt = new Date().toISOString();
        tab.closedBy = employeeName;
        tab.finalTotal = (tab.total || 0) + tip;
        tab.tip = tip;
        
        saveLocal();
        notifyListeners('close', tab);
        
        // Sync to server
        if (isOnline) {
            try {
                await fetch(`${API_BASE}/tabs?tabId=${tabId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'close',
                        paymentMethod: paymentMethod,
                        tip: tip,
                        employeeName: employeeName
                    })
                });
            } catch (error) {
                console.error('[TabsSync] Failed to sync tab close:', error);
            }
        }
        
        // Remove from local open tabs
        localTabs = localTabs.filter(t => t.id !== tabId);
        saveLocal();
        
        return tab;
    }
    
    // Void tab
    async function voidTab(tabId, reason = '', employeeName = 'Staff') {
        const tab = getTab(tabId);
        if (!tab) return null;
        
        tab.status = 'voided';
        tab.voidedAt = new Date().toISOString();
        tab.voidedBy = employeeName;
        tab.voidReason = reason;
        
        saveLocal();
        notifyListeners('void', tab);
        
        // Sync to server
        if (isOnline) {
            try {
                await fetch(`${API_BASE}/tabs?tabId=${tabId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        action: 'void',
                        notes: reason,
                        employeeName: employeeName
                    })
                });
            } catch (error) {
                console.error('[TabsSync] Failed to sync tab void:', error);
            }
        }
        
        // Remove from local open tabs
        localTabs = localTabs.filter(t => t.id !== tabId);
        saveLocal();
        
        return tab;
    }
    
    // ============ LOCAL STORAGE ============
    function saveLocal() {
        localStorage.setItem(LOCAL_KEY, JSON.stringify(localTabs));
    }
    
    // ============ LISTENERS ============
    function addListener(callback) {
        listeners.push(callback);
        return () => {
            listeners = listeners.filter(l => l !== callback);
        };
    }
    
    function notifyListeners(event, data) {
        listeners.forEach(callback => {
            try {
                callback(event, data, localTabs);
            } catch (error) {
                console.error('[TabsSync] Listener error:', error);
            }
        });
    }
    
    // ============ UTILITIES ============
    function getStats() {
        const openTabs = getAllTabs();
        return {
            count: openTabs.length,
            totalValue: openTabs.reduce((sum, t) => sum + (t.total || 0), 0),
            itemCount: openTabs.reduce((sum, t) => sum + (t.items?.length || 0), 0),
            lastSync: lastSync,
            isOnline: isOnline
        };
    }
    
    function forceSync() {
        if (isOnline) {
            syncWithServer();
        }
    }
    
    // ============ PUBLIC API ============
    return {
        init,
        getAllTabs,
        getTab,
        getTabByCustomer,
        createTab,
        addItemsToTab,
        addToCustomerTab,
        removeItemFromTab,
        closeTab,
        voidTab,
        addListener,
        getStats,
        forceSync,
        
        // Aliases for compatibility
        get tabs() { return getAllTabs(); },
        get count() { return getAllTabs().length; }
    };
})();

// Auto-initialize if DOM is ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => TabsSync.init());
} else {
    TabsSync.init();
}

// Make globally available
window.TabsSync = TabsSync;
