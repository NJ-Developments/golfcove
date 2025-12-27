/**
 * Golf Cove - Centralized State Store
 * ====================================
 * Simple Redux-like state management for the entire application.
 * All modules should read/write state through this store.
 * 
 * Features:
 * - Single source of truth for app state
 * - Subscribe to state changes
 * - Action-based updates
 * - Middleware support (logging, persistence)
 * - Time-travel debugging (dev mode)
 * 
 * @version 1.0.0
 */

/// <reference path="./types.js" />

const Store = (function() {
    'use strict';

    // ============================================
    // INITIAL STATE
    // ============================================
    const initialState = {
        // Data collections
        bookings: [],
        customers: [],
        tabs: [],
        transactions: [],
        employees: [],
        giftCards: [],
        
        // Inventory
        inventory: {
            items: [],
            lowStockThreshold: 5
        },
        
        // Current session
        session: {
            employee: null,
            registerId: null,
            isLoggedIn: false
        },
        
        // Sync status
        sync: {
            isOnline: navigator.onLine,
            lastSync: null,
            pendingChanges: 0,
            status: 'idle', // 'idle' | 'syncing' | 'error'
            errors: []
        },
        
        // UI state
        ui: {
            currentPage: null,
            selectedDate: new Date().toISOString().split('T')[0],
            selectedRoom: null,
            activeTab: null,
            modals: [],
            notifications: [],
            isLoading: false
        },
        
        // Configuration (loaded from MembershipConfig, etc.)
        config: {
            membershipTiers: {},
            pricing: {},
            operatingHours: {}
        }
    };

    // ============================================
    // INTERNAL STATE
    // ============================================
    let state = JSON.parse(JSON.stringify(initialState));
    let listeners = [];
    let middleware = [];
    let history = []; // For time-travel debugging
    const MAX_HISTORY = 50;
    const DEBUG = localStorage.getItem('gc_store_debug') === 'true';

    // ============================================
    // ACTION TYPES
    // ============================================
    const ActionTypes = {
        // Bookings
        BOOKINGS_LOAD: 'BOOKINGS_LOAD',
        BOOKING_ADD: 'BOOKING_ADD',
        BOOKING_UPDATE: 'BOOKING_UPDATE',
        BOOKING_REMOVE: 'BOOKING_REMOVE',
        
        // Customers
        CUSTOMERS_LOAD: 'CUSTOMERS_LOAD',
        CUSTOMER_ADD: 'CUSTOMER_ADD',
        CUSTOMER_UPDATE: 'CUSTOMER_UPDATE',
        CUSTOMER_REMOVE: 'CUSTOMER_REMOVE',
        
        // Tabs
        TABS_LOAD: 'TABS_LOAD',
        TAB_OPEN: 'TAB_OPEN',
        TAB_UPDATE: 'TAB_UPDATE',
        TAB_CLOSE: 'TAB_CLOSE',
        TAB_ADD_ITEM: 'TAB_ADD_ITEM',
        TAB_REMOVE_ITEM: 'TAB_REMOVE_ITEM',
        
        // Transactions
        TRANSACTIONS_LOAD: 'TRANSACTIONS_LOAD',
        TRANSACTION_ADD: 'TRANSACTION_ADD',
        
        // Session
        SESSION_LOGIN: 'SESSION_LOGIN',
        SESSION_LOGOUT: 'SESSION_LOGOUT',
        
        // Sync
        SYNC_START: 'SYNC_START',
        SYNC_SUCCESS: 'SYNC_SUCCESS',
        SYNC_ERROR: 'SYNC_ERROR',
        SYNC_ONLINE: 'SYNC_ONLINE',
        SYNC_OFFLINE: 'SYNC_OFFLINE',
        
        // UI
        UI_SET_DATE: 'UI_SET_DATE',
        UI_SET_ROOM: 'UI_SET_ROOM',
        UI_SET_TAB: 'UI_SET_TAB',
        UI_SHOW_MODAL: 'UI_SHOW_MODAL',
        UI_HIDE_MODAL: 'UI_HIDE_MODAL',
        UI_NOTIFY: 'UI_NOTIFY',
        UI_DISMISS_NOTIFICATION: 'UI_DISMISS_NOTIFICATION',
        UI_SET_LOADING: 'UI_SET_LOADING',
        
        // Config
        CONFIG_LOAD: 'CONFIG_LOAD',
        
        // Reset
        RESET: 'RESET'
    };

    // ============================================
    // REDUCER
    // ============================================
    function reducer(state, action) {
        if (DEBUG) {
            console.log('[Store] Action:', action.type, action.payload);
        }
        
        switch (action.type) {
            // ---- Bookings ----
            case ActionTypes.BOOKINGS_LOAD:
                return { ...state, bookings: action.payload || [] };
            
            case ActionTypes.BOOKING_ADD:
                return { ...state, bookings: [...state.bookings, action.payload] };
            
            case ActionTypes.BOOKING_UPDATE:
                return {
                    ...state,
                    bookings: state.bookings.map(b => 
                        b.id === action.payload.id ? { ...b, ...action.payload } : b
                    )
                };
            
            case ActionTypes.BOOKING_REMOVE:
                return {
                    ...state,
                    bookings: state.bookings.filter(b => b.id !== action.payload)
                };
            
            // ---- Customers ----
            case ActionTypes.CUSTOMERS_LOAD:
                return { ...state, customers: action.payload || [] };
            
            case ActionTypes.CUSTOMER_ADD:
                return { ...state, customers: [...state.customers, action.payload] };
            
            case ActionTypes.CUSTOMER_UPDATE:
                return {
                    ...state,
                    customers: state.customers.map(c => 
                        c.id === action.payload.id ? { ...c, ...action.payload } : c
                    )
                };
            
            case ActionTypes.CUSTOMER_REMOVE:
                return {
                    ...state,
                    customers: state.customers.filter(c => c.id !== action.payload)
                };
            
            // ---- Tabs ----
            case ActionTypes.TABS_LOAD:
                return { ...state, tabs: action.payload || [] };
            
            case ActionTypes.TAB_OPEN:
                return { ...state, tabs: [...state.tabs, action.payload] };
            
            case ActionTypes.TAB_UPDATE:
                return {
                    ...state,
                    tabs: state.tabs.map(t => 
                        t.id === action.payload.id ? { ...t, ...action.payload } : t
                    )
                };
            
            case ActionTypes.TAB_CLOSE:
                return {
                    ...state,
                    tabs: state.tabs.map(t => 
                        t.id === action.payload ? { ...t, status: 'closed', closedAt: new Date().toISOString() } : t
                    )
                };
            
            case ActionTypes.TAB_ADD_ITEM: {
                const { tabId, item } = action.payload;
                return {
                    ...state,
                    tabs: state.tabs.map(t => {
                        if (t.id !== tabId) return t;
                        const existingIndex = t.items.findIndex(i => i.id === item.id);
                        let items;
                        if (existingIndex >= 0) {
                            items = t.items.map((i, idx) => 
                                idx === existingIndex ? { ...i, quantity: i.quantity + 1 } : i
                            );
                        } else {
                            items = [...t.items, { ...item, quantity: 1 }];
                        }
                        const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                        return { ...t, items, subtotal };
                    })
                };
            }
            
            case ActionTypes.TAB_REMOVE_ITEM: {
                const { tabId, itemId } = action.payload;
                return {
                    ...state,
                    tabs: state.tabs.map(t => {
                        if (t.id !== tabId) return t;
                        const items = t.items.filter(i => i.id !== itemId);
                        const subtotal = items.reduce((sum, i) => sum + (i.price * i.quantity), 0);
                        return { ...t, items, subtotal };
                    })
                };
            }
            
            // ---- Transactions ----
            case ActionTypes.TRANSACTIONS_LOAD:
                return { ...state, transactions: action.payload || [] };
            
            case ActionTypes.TRANSACTION_ADD:
                return { ...state, transactions: [...state.transactions, action.payload] };
            
            // ---- Session ----
            case ActionTypes.SESSION_LOGIN:
                return {
                    ...state,
                    session: {
                        ...state.session,
                        employee: action.payload,
                        isLoggedIn: true
                    }
                };
            
            case ActionTypes.SESSION_LOGOUT:
                return {
                    ...state,
                    session: { ...initialState.session }
                };
            
            // ---- Sync ----
            case ActionTypes.SYNC_START:
                return {
                    ...state,
                    sync: { ...state.sync, status: 'syncing' }
                };
            
            case ActionTypes.SYNC_SUCCESS:
                return {
                    ...state,
                    sync: {
                        ...state.sync,
                        status: 'idle',
                        lastSync: new Date().toISOString(),
                        pendingChanges: 0,
                        errors: []
                    }
                };
            
            case ActionTypes.SYNC_ERROR:
                return {
                    ...state,
                    sync: {
                        ...state.sync,
                        status: 'error',
                        errors: [...state.sync.errors, action.payload]
                    }
                };
            
            case ActionTypes.SYNC_ONLINE:
                return {
                    ...state,
                    sync: { ...state.sync, isOnline: true }
                };
            
            case ActionTypes.SYNC_OFFLINE:
                return {
                    ...state,
                    sync: { ...state.sync, isOnline: false }
                };
            
            // ---- UI ----
            case ActionTypes.UI_SET_DATE:
                return {
                    ...state,
                    ui: { ...state.ui, selectedDate: action.payload }
                };
            
            case ActionTypes.UI_SET_ROOM:
                return {
                    ...state,
                    ui: { ...state.ui, selectedRoom: action.payload }
                };
            
            case ActionTypes.UI_SET_TAB:
                return {
                    ...state,
                    ui: { ...state.ui, activeTab: action.payload }
                };
            
            case ActionTypes.UI_SHOW_MODAL:
                return {
                    ...state,
                    ui: { ...state.ui, modals: [...state.ui.modals, action.payload] }
                };
            
            case ActionTypes.UI_HIDE_MODAL:
                return {
                    ...state,
                    ui: {
                        ...state.ui,
                        modals: state.ui.modals.filter(m => m.id !== action.payload)
                    }
                };
            
            case ActionTypes.UI_NOTIFY:
                return {
                    ...state,
                    ui: {
                        ...state.ui,
                        notifications: [...state.ui.notifications, {
                            id: Date.now(),
                            ...action.payload,
                            timestamp: new Date().toISOString()
                        }]
                    }
                };
            
            case ActionTypes.UI_DISMISS_NOTIFICATION:
                return {
                    ...state,
                    ui: {
                        ...state.ui,
                        notifications: state.ui.notifications.filter(n => n.id !== action.payload)
                    }
                };
            
            case ActionTypes.UI_SET_LOADING:
                return {
                    ...state,
                    ui: { ...state.ui, isLoading: action.payload }
                };
            
            // ---- Config ----
            case ActionTypes.CONFIG_LOAD:
                return {
                    ...state,
                    config: { ...state.config, ...action.payload }
                };
            
            // ---- Reset ----
            case ActionTypes.RESET:
                return JSON.parse(JSON.stringify(initialState));
            
            default:
                return state;
        }
    }

    // ============================================
    // DISPATCH
    // ============================================
    function dispatch(action) {
        // Validate action
        if (!action || typeof action.type !== 'string') {
            console.error('[Store] Invalid action:', action);
            return;
        }
        
        // Run middleware (before)
        for (const mw of middleware) {
            if (mw.before) {
                action = mw.before(action, state) || action;
            }
        }
        
        // Save to history (for time-travel)
        if (DEBUG) {
            history.push({
                action,
                state: JSON.parse(JSON.stringify(state)),
                timestamp: Date.now()
            });
            if (history.length > MAX_HISTORY) {
                history.shift();
            }
        }
        
        // Reduce
        const prevState = state;
        state = reducer(state, action);
        
        // Run middleware (after)
        for (const mw of middleware) {
            if (mw.after) {
                mw.after(action, prevState, state);
            }
        }
        
        // Notify listeners
        for (const listener of listeners) {
            try {
                listener(state, prevState, action);
            } catch (e) {
                console.error('[Store] Listener error:', e);
            }
        }
    }

    // ============================================
    // SUBSCRIBE
    // ============================================
    function subscribe(listener) {
        if (typeof listener !== 'function') {
            throw new Error('Listener must be a function');
        }
        listeners.push(listener);
        
        // Return unsubscribe function
        return () => {
            listeners = listeners.filter(l => l !== listener);
        };
    }

    // ============================================
    // SELECTORS
    // ============================================
    const Selectors = {
        // Bookings
        getBookings: () => state.bookings,
        getBookingById: (id) => state.bookings.find(b => b.id === id),
        getBookingsForDate: (date) => state.bookings.filter(b => b.date === date),
        getBookingsForRoom: (roomId, date) => state.bookings.filter(b => 
            b.roomId === roomId && b.date === date && b.status !== 'cancelled'
        ),
        
        // Customers
        getCustomers: () => state.customers,
        getCustomerById: (id) => state.customers.find(c => c.id === id),
        getMembers: () => state.customers.filter(c => c.isMember),
        
        // Tabs
        getTabs: () => state.tabs,
        getOpenTabs: () => state.tabs.filter(t => t.status === 'open'),
        getTabById: (id) => state.tabs.find(t => t.id === id),
        getTabForRoom: (roomId) => state.tabs.find(t => t.roomId === roomId && t.status === 'open'),
        
        // Transactions
        getTransactions: () => state.transactions,
        getTodayTransactions: () => {
            const today = new Date().toISOString().split('T')[0];
            return state.transactions.filter(t => t.createdAt.startsWith(today));
        },
        
        // Session
        getCurrentEmployee: () => state.session.employee,
        isLoggedIn: () => state.session.isLoggedIn,
        
        // Sync
        getSyncStatus: () => state.sync,
        isOnline: () => state.sync.isOnline,
        hasPendingChanges: () => state.sync.pendingChanges > 0,
        
        // UI
        getSelectedDate: () => state.ui.selectedDate,
        getActiveTab: () => state.ui.activeTab,
        getNotifications: () => state.ui.notifications,
        isLoading: () => state.ui.isLoading,
        
        // Config
        getConfig: () => state.config
    };

    // ============================================
    // ACTION CREATORS
    // ============================================
    const Actions = {
        // Bookings
        loadBookings: (bookings) => dispatch({ type: ActionTypes.BOOKINGS_LOAD, payload: bookings }),
        addBooking: (booking) => dispatch({ type: ActionTypes.BOOKING_ADD, payload: booking }),
        updateBooking: (booking) => dispatch({ type: ActionTypes.BOOKING_UPDATE, payload: booking }),
        removeBooking: (id) => dispatch({ type: ActionTypes.BOOKING_REMOVE, payload: id }),
        
        // Customers
        loadCustomers: (customers) => dispatch({ type: ActionTypes.CUSTOMERS_LOAD, payload: customers }),
        addCustomer: (customer) => dispatch({ type: ActionTypes.CUSTOMER_ADD, payload: customer }),
        updateCustomer: (customer) => dispatch({ type: ActionTypes.CUSTOMER_UPDATE, payload: customer }),
        removeCustomer: (id) => dispatch({ type: ActionTypes.CUSTOMER_REMOVE, payload: id }),
        
        // Tabs
        loadTabs: (tabs) => dispatch({ type: ActionTypes.TABS_LOAD, payload: tabs }),
        openTab: (tab) => dispatch({ type: ActionTypes.TAB_OPEN, payload: tab }),
        updateTab: (tab) => dispatch({ type: ActionTypes.TAB_UPDATE, payload: tab }),
        closeTab: (id) => dispatch({ type: ActionTypes.TAB_CLOSE, payload: id }),
        addItemToTab: (tabId, item) => dispatch({ type: ActionTypes.TAB_ADD_ITEM, payload: { tabId, item } }),
        removeItemFromTab: (tabId, itemId) => dispatch({ type: ActionTypes.TAB_REMOVE_ITEM, payload: { tabId, itemId } }),
        
        // Transactions
        loadTransactions: (txns) => dispatch({ type: ActionTypes.TRANSACTIONS_LOAD, payload: txns }),
        addTransaction: (txn) => dispatch({ type: ActionTypes.TRANSACTION_ADD, payload: txn }),
        
        // Session
        login: (employee) => dispatch({ type: ActionTypes.SESSION_LOGIN, payload: employee }),
        logout: () => dispatch({ type: ActionTypes.SESSION_LOGOUT }),
        
        // Sync
        syncStart: () => dispatch({ type: ActionTypes.SYNC_START }),
        syncSuccess: () => dispatch({ type: ActionTypes.SYNC_SUCCESS }),
        syncError: (error) => dispatch({ type: ActionTypes.SYNC_ERROR, payload: error }),
        setOnline: () => dispatch({ type: ActionTypes.SYNC_ONLINE }),
        setOffline: () => dispatch({ type: ActionTypes.SYNC_OFFLINE }),
        
        // UI
        setDate: (date) => dispatch({ type: ActionTypes.UI_SET_DATE, payload: date }),
        setRoom: (roomId) => dispatch({ type: ActionTypes.UI_SET_ROOM, payload: roomId }),
        setActiveTab: (tabId) => dispatch({ type: ActionTypes.UI_SET_TAB, payload: tabId }),
        showModal: (modal) => dispatch({ type: ActionTypes.UI_SHOW_MODAL, payload: modal }),
        hideModal: (id) => dispatch({ type: ActionTypes.UI_HIDE_MODAL, payload: id }),
        notify: (notification) => dispatch({ type: ActionTypes.UI_NOTIFY, payload: notification }),
        dismissNotification: (id) => dispatch({ type: ActionTypes.UI_DISMISS_NOTIFICATION, payload: id }),
        setLoading: (isLoading) => dispatch({ type: ActionTypes.UI_SET_LOADING, payload: isLoading }),
        
        // Config
        loadConfig: (config) => dispatch({ type: ActionTypes.CONFIG_LOAD, payload: config }),
        
        // Reset
        reset: () => dispatch({ type: ActionTypes.RESET })
    };

    // ============================================
    // MIDDLEWARE
    // ============================================
    function addMiddleware(mw) {
        middleware.push(mw);
    }

    // Built-in: Logging middleware
    const loggingMiddleware = {
        before: (action, state) => {
            if (DEBUG) {
                console.group(`[Store] ${action.type}`);
                console.log('Payload:', action.payload);
                console.log('Prev State:', state);
            }
            return action;
        },
        after: (action, prevState, newState) => {
            if (DEBUG) {
                console.log('New State:', newState);
                console.groupEnd();
            }
        }
    };

    // Built-in: Persistence middleware (localStorage)
    const persistenceMiddleware = {
        after: (action, prevState, newState) => {
            // Persist certain collections to localStorage
            const persistKeys = ['bookings', 'customers', 'tabs'];
            for (const key of persistKeys) {
                if (prevState[key] !== newState[key]) {
                    try {
                        localStorage.setItem(`gc_${key}`, JSON.stringify(newState[key]));
                    } catch (e) {
                        console.warn(`[Store] Failed to persist ${key}:`, e);
                    }
                }
            }
        }
    };

    // ============================================
    // INITIALIZATION
    // ============================================
    function init() {
        // Add built-in middleware
        if (DEBUG) {
            addMiddleware(loggingMiddleware);
        }
        addMiddleware(persistenceMiddleware);
        
        // Load persisted state
        const persistKeys = ['bookings', 'customers', 'tabs'];
        for (const key of persistKeys) {
            try {
                const stored = localStorage.getItem(`gc_${key}`);
                if (stored) {
                    state[key] = JSON.parse(stored);
                }
            } catch (e) {
                console.warn(`[Store] Failed to load ${key}:`, e);
            }
        }
        
        // Online/offline listeners
        window.addEventListener('online', () => Actions.setOnline());
        window.addEventListener('offline', () => Actions.setOffline());
        
        // Load config if MembershipConfig is available
        if (typeof MembershipConfig !== 'undefined') {
            Actions.loadConfig({
                membershipTiers: MembershipConfig.TIERS
            });
        }
        
        console.log('[Store] Initialized with', state.bookings.length, 'bookings,', state.customers.length, 'customers');
    }

    // ============================================
    // DEBUG HELPERS
    // ============================================
    function getHistory() {
        return history;
    }

    function timeTravel(index) {
        if (index < 0 || index >= history.length) {
            console.error('[Store] Invalid history index');
            return;
        }
        state = JSON.parse(JSON.stringify(history[index].state));
        for (const listener of listeners) {
            listener(state, null, { type: 'TIME_TRAVEL', payload: index });
        }
    }

    // ============================================
    // PUBLIC API
    // ============================================
    return {
        // Core
        dispatch,
        subscribe,
        getState: () => state,
        
        // Action types
        ActionTypes,
        
        // Selectors
        ...Selectors,
        
        // Action creators
        Actions,
        
        // Middleware
        addMiddleware,
        
        // Initialization
        init,
        
        // Debug
        getHistory,
        timeTravel,
        enableDebug: () => {
            localStorage.setItem('gc_store_debug', 'true');
            console.log('[Store] Debug mode enabled. Reload to take effect.');
        },
        disableDebug: () => {
            localStorage.removeItem('gc_store_debug');
            console.log('[Store] Debug mode disabled.');
        }
    };
})();

// Auto-init when DOM ready
if (typeof document !== 'undefined') {
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', Store.init);
    } else {
        Store.init();
    }
}

// Make available globally
if (typeof window !== 'undefined') {
    window.Store = Store;
}

// Export for module systems
if (typeof module !== 'undefined' && module.exports) {
    module.exports = Store;
}
